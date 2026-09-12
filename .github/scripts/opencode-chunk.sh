#!/usr/bin/env bash
set -Eeuo pipefail

MODE="${1:?Usage: opencode-chunk.sh initial|continue|finalize}"
CHUNK_MINUTES="${CHUNK_MINUTES:-310}"
STATE_DIR="${STATE_DIR:-$RUNNER_TEMP/opencode-state}"
MODEL="${MODEL:-tokenrouter/z-ai/glm-5.3-free}"
VARIANT="${VARIANT:-max}"

mkdir -p "$STATE_DIR"
export PATH="$HOME/.opencode/bin:$PATH"

set_output() {
  local name="$1" value="$2"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "$name=$value" >> "$GITHUB_OUTPUT"
  fi
}

install_latest_opencode() {
  curl -fsSL https://opencode.ai/install | bash
  export PATH="$HOME/.opencode/bin:$PATH"
}

install_saved_opencode() {
  local version
  version="$(cat "$STATE_DIR/opencode-version.txt")"
  VERSION="$version" curl -fsSL https://opencode.ai/install | bash
  export PATH="$HOME/.opencode/bin:$PATH"
}

strip_git_credentials() {
  git config --local --unset-all http.https://github.com/.extraheader >/dev/null 2>&1 || true
}

find_session_id() {
  local log_file="$1" id=""
  id="$(grep -oE 'ses_[[:alnum:]_]+' "$log_file" | tail -n 1 || true)"
  if [[ -z "$id" ]]; then
    id="$(opencode session list --format json --max-count 1 2>/dev/null | jq -r '.[0].id // empty' || true)"
  fi
  printf '%s' "$id"
}

save_state() {
  local session_id="$1"

  strip_git_credentials
  mkdir -p "$STATE_DIR"

  printf '%s\n' "$session_id" > "$STATE_DIR/session-id.txt"
  if [[ ! -f "$STATE_DIR/opencode-version.txt" ]]; then
    opencode --version | sed 's/^v//' > "$STATE_DIR/opencode-version.txt"
  fi
  if [[ ! -f "$STATE_DIR/expected-branch.txt" ]]; then
    git branch --show-current > "$STATE_DIR/expected-branch.txt"
  fi
  if [[ ! -f "$STATE_DIR/original-event.json" ]]; then
    cp "$GITHUB_EVENT_PATH" "$STATE_DIR/original-event.json"
  fi

  # Make SQLite flush as much as possible before archiving. Failure here is harmless.
  if command -v sqlite3 >/dev/null 2>&1 && [[ -f "$HOME/.local/share/opencode/opencode.db" ]]; then
    sqlite3 "$HOME/.local/share/opencode/opencode.db" 'PRAGMA wal_checkpoint(FULL);' >/dev/null 2>&1 || true
  fi

  rm -f "$STATE_DIR/workspace.tar.gz" "$STATE_DIR/opencode-data.tar.gz"

  tar \
    --exclude='./node_modules' \
    -C "$GITHUB_WORKSPACE" \
    -czf "$STATE_DIR/workspace.tar.gz" .

  if [[ -d "$HOME/.local/share/opencode" ]]; then
    tar \
      --exclude='.local/share/opencode/auth.json' \
      --exclude='.local/share/opencode/log' \
      -C "$HOME" \
      -czf "$STATE_DIR/opencode-data.tar.gz" .local/share/opencode
  fi
}

run_timed() {
  local log_file="$1"
  shift

  timeout --signal=INT --kill-after=90s "${CHUNK_MINUTES}m" "$@" 2>&1 | tee "$log_file"
  local status=${PIPESTATUS[0]}
  return "$status"
}

make_final_summary() {
  local session_id="$1" fallback_log="$2"
  local summary_log="$RUNNER_TEMP/opencode-final-summary.log"
  local args=(opencode run --session "$session_id" --model "$MODEL")
  if [[ -n "$VARIANT" ]]; then
    args+=(--variant "$VARIANT")
  fi
  args+=("The original GitHub task is complete now. Give ONLY a concise final user-facing summary of what you changed and the tests/checks you ran. Do not make any more code changes. Do not push or create a PR.")

  set +e
  timeout --signal=INT --kill-after=30s 10m "${args[@]}" >"$summary_log" 2>&1
  local status=$?
  set -e

  if [[ $status -eq 0 && -s "$summary_log" ]]; then
    tail -c 12000 "$summary_log" | sed -r 's/\x1B\[[0-9;]*[mK]//g' > "$STATE_DIR/final-response.txt"
  else
    tail -c 12000 "$fallback_log" | sed -r 's/\x1B\[[0-9;]*[mK]//g' > "$STATE_DIR/final-response.txt"
  fi
}

github_api() {
  local method="$1" url="$2" data="${3:-}"
  local args=(curl -fsSL -X "$method"
    -H "Authorization: Bearer ${GITHUB_TOKEN:?GITHUB_TOKEN is unavailable}"
    -H "Accept: application/vnd.github+json"
    -H "X-GitHub-Api-Version: 2022-11-28")
  if [[ -n "$data" ]]; then
    args+=(-H "Content-Type: application/json" -d "$data")
  fi
  args+=("$url")
  "${args[@]}"
}

configure_git_for_token() {
  local basic
  strip_git_credentials
  basic="$(printf 'x-access-token:%s' "${GITHUB_TOKEN:?GITHUB_TOKEN is unavailable}" | base64 -w0)"
  git config --local http.https://github.com/.extraheader "AUTHORIZATION: basic $basic"
}

commit_if_needed() {
  if [[ -n "$(git status --porcelain)" ]]; then
    git add -A
    git commit -m "OpenCode changes" -m "Co-authored-by: ${ORIGINAL_ACTOR} <${ORIGINAL_ACTOR}@users.noreply.github.com>"
  fi
}

post_issue_comment() {
  local issue_number="$1" body="$2" payload
  payload="$(jq -n --arg body "$body" '{body:$body}')"
  github_api POST "https://api.github.com/repos/$GITHUB_REPOSITORY/issues/$issue_number/comments" "$payload" >/dev/null
}

remove_working_reaction() {
  local comment_id="$1" kind="$2" list_url delete_base reaction_id
  if [[ "$kind" == "review" ]]; then
    list_url="https://api.github.com/repos/$GITHUB_REPOSITORY/pulls/comments/$comment_id/reactions"
    delete_base="https://api.github.com/repos/$GITHUB_REPOSITORY/pulls/comments/$comment_id/reactions"
  else
    list_url="https://api.github.com/repos/$GITHUB_REPOSITORY/issues/comments/$comment_id/reactions"
    delete_base="https://api.github.com/repos/$GITHUB_REPOSITORY/issues/comments/$comment_id/reactions"
  fi

  reaction_id="$(github_api GET "$list_url" | jq -r '[.[] | select(.content=="eyes" and (.user.login=="opencode-agent[bot]" or .user.login=="github-actions[bot]"))][0].id // empty' || true)"
  if [[ -n "$reaction_id" ]]; then
    github_api DELETE "$delete_base/$reaction_id" >/dev/null || true
  fi
}

finalize_to_github() {
  local event_file="$STATE_DIR/original-event.json"
  local response expected_branch event_kind number comment_id pr_json head_repo head_ref owner base_branch
  local pr_payload existing_pr new_pr body

  response="$(cat "$STATE_DIR/final-response.txt" 2>/dev/null || echo 'OpenCode finished the requested work.')"
  expected_branch="$(cat "$STATE_DIR/expected-branch.txt")"
  ORIGINAL_ACTOR="$(jq -r '.sender.login // .comment.user.login // empty' "$event_file")"
  [[ -n "$ORIGINAL_ACTOR" ]] || ORIGINAL_ACTOR="opencode-agent"
  export ORIGINAL_ACTOR

  : "${GITHUB_TOKEN:?GITHUB_TOKEN is unavailable}"
  configure_git_for_token

  # Ensure any unfinished local edits are part of the final push.
  commit_if_needed

  owner="${GITHUB_REPOSITORY%%/*}"

  if [[ "$(jq -r '.pull_request != null' "$event_file")" == "true" ]]; then
    event_kind="review"
    number="$(jq -r '.pull_request.number' "$event_file")"
    comment_id="$(jq -r '.comment.id' "$event_file")"
  elif [[ "$(jq -r '.issue.pull_request != null' "$event_file")" == "true" ]]; then
    event_kind="issue_pr"
    number="$(jq -r '.issue.number' "$event_file")"
    comment_id="$(jq -r '.comment.id' "$event_file")"
  else
    event_kind="issue"
    number="$(jq -r '.issue.number' "$event_file")"
    comment_id="$(jq -r '.comment.id' "$event_file")"
  fi

  if [[ "$event_kind" == "review" || "$event_kind" == "issue_pr" ]]; then
    pr_json="$(github_api GET "https://api.github.com/repos/$GITHUB_REPOSITORY/pulls/$number")"
    head_repo="$(jq -r '.head.repo.full_name' <<<"$pr_json")"
    head_ref="$(jq -r '.head.ref' <<<"$pr_json")"

    # Push the completed HEAD back to the PR's real head branch.
    if [[ "$head_repo" == "$GITHUB_REPOSITORY" ]]; then
      git push origin "HEAD:$head_ref"
    else
      git push "https://github.com/$head_repo.git" "HEAD:$head_ref"
    fi

    post_issue_comment "$number" "$response"
    if [[ "$event_kind" == "review" ]]; then
      remove_working_reaction "$comment_id" review
    else
      remove_working_reaction "$comment_id" issue
    fi
  else
    # Issue request: push the branch OpenCode created before the checkpoint.
    git push -u origin "HEAD:$expected_branch"
    base_branch="$(github_api GET "https://api.github.com/repos/$GITHUB_REPOSITORY" | jq -r '.default_branch')"

    existing_pr="$(curl -fsSL -G \
      -H "Authorization: Bearer ${GITHUB_TOKEN:?GITHUB_TOKEN is unavailable}" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      --data-urlencode "head=${owner}:${expected_branch}" \
      --data-urlencode "base=$base_branch" \
      --data-urlencode "state=open" \
      "https://api.github.com/repos/$GITHUB_REPOSITORY/pulls" | jq -r '.[0].number // empty')"

    if [[ -n "$existing_pr" ]]; then
      new_pr="$existing_pr"
    else
      body="${response}"$'\n\n'"Closes #${number}"
      pr_payload="$(jq -n \
        --arg title "OpenCode: issue #$number" \
        --arg head "$expected_branch" \
        --arg base "$base_branch" \
        --arg body "$body" \
        '{title:$title, head:$head, base:$base, body:$body}')"
      new_pr="$(github_api POST "https://api.github.com/repos/$GITHUB_REPOSITORY/pulls" "$pr_payload" | jq -r '.number')"
    fi

    post_issue_comment "$number" "Created PR #${new_pr}\n\n${response}"
    remove_working_reaction "$comment_id" issue
  fi

  strip_git_credentials
}

case "$MODE" in
  initial)
    install_latest_opencode
    opencode --version | sed 's/^v//' > "$STATE_DIR/opencode-version.txt"

    log_file="$RUNNER_TEMP/opencode-initial.log"
    set +e
    run_timed "$log_file" opencode github run
    status=$?
    set -e

    if [[ $status -eq 0 ]]; then
      set_output state finished
      exit 0
    fi

    if [[ $status -ne 124 ]]; then
      echo "OpenCode failed before the continuation timeout (exit $status)." >&2
      exit "$status"
    fi

    session_id="$(find_session_id "$log_file")"
    [[ -n "$session_id" ]] || { echo "Could not find the OpenCode session ID after timeout." >&2; exit 1; }
    save_state "$session_id"
    set_output state continue
    ;;

  continue)
    install_saved_opencode
    session_id="$(cat "$STATE_DIR/session-id.txt")"
    log_file="$RUNNER_TEMP/opencode-continue.log"

    args=(opencode run --session "$session_id" --model "$MODEL")
    if [[ -n "$VARIANT" ]]; then
      args+=(--variant "$VARIANT")
    fi
    args+=("Continue the original GitHub task from exactly where you left off. Do not restart or redo completed work. Inspect the current working tree and previous session context, finish the request completely, and run the relevant tests/checks. Do not push or create a PR yourself; the workflow will do that after you finish. When fully done, give a concise final summary.")

    set +e
    run_timed "$log_file" "${args[@]}"
    status=$?
    set -e

    if [[ $status -eq 124 ]]; then
      save_state "$session_id"
      set_output state continue
      exit 0
    fi

    if [[ $status -ne 0 ]]; then
      echo "OpenCode continuation failed (exit $status)." >&2
      exit "$status"
    fi

    make_final_summary "$session_id" "$log_file"
    save_state "$session_id"
    set_output state finished
    ;;

  finalize)
    finalize_to_github
    set_output state finished
    ;;

  *)
    echo "Unknown mode: $MODE" >&2
    exit 2
    ;;
esac
