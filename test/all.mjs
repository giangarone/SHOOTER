// Runs every suite in test/ one after another and exits non-zero if any of
// them failed. CI needs a single command, and `npm test` is only smoke.
//
// The list is READ FROM THE DIRECTORY rather than written out here, so a new
// suite is picked up by CI the moment it lands and nobody has to remember to
// add it in two places. Everything runs SERIALLY on purpose: each suite stands
// up its own server and its own headless Chrome, and a parallel run on a
// two-core runner starves them into timing out.
//
// Usage: node test/all.mjs [nameFilter]      TIMEOUT=600 to lengthen the cap
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';

const SKIP = new Set(['harness.mjs', 'all.mjs']);
const filter = process.argv[2] || '';
// Per-suite cap. A hung browser otherwise burns the whole job's budget and
// reports nothing, which is strictly worse than one named failure.
const TIMEOUT = Number(process.env.TIMEOUT || 300) * 1000;

// SHARD="2/4" runs the second quarter of the suites. CI splits the run across
// parallel runners this way, because the wall-clock problem is not that any
// one suite is slow - it is that there are thirty of them and a runner has no
// GPU, so the game rasterizes every frame on a shared vCPU.
//
// Suites are NOT equal-cost - versus is a hundred times icons - so the split is
// longest-first onto whichever shard is currently lightest, rather than
// alphabetical slices or round-robin. Either of those hands one runner
// versus+brine+melee and another icons+themes, and the job is only as fast as
// its slowest shard.
//
// These weights are wall-clock seconds from one local run. They are a HINT for
// balancing and nothing else: a wrong or missing number costs some balance, not
// correctness, and a suite not listed here is assumed average. No need to keep
// them current.
const WEIGHTS = {
  'accuracy.mjs': 23, 'active.mjs': 19, 'afflict.mjs': 33, 'aim.mjs': 21,
  'boss.mjs': 88, 'brine.mjs': 87, 'charge.mjs': 8, 'crouch.mjs': 52,
  'drops.mjs': 15, 'ember.mjs': 46, 'fifthpool.mjs': 35, 'flawless.mjs': 9,
  'fourthpool.mjs': 40, 'headshot.mjs': 7, 'hive.mjs': 60,
  'icons.mjs': 1, 'melee.mjs': 76, 'money.mjs': 49, 'newpool.mjs': 38,
  'pad.mjs': 27, 'plague.mjs': 47, 'rime.mjs': 46, 'seeker.mjs': 8,
  'rebind.mjs': 35, 'smoke.mjs': 71, 'solar.mjs': 46, 'sprint.mjs': 56, 'status.mjs': 20,
  'strata.mjs': 46, 'tempest.mjs': 83, 'terrain.mjs': 14, 'themes.mjs': 1,
  'thirdpool.mjs': 35, 'verdant.mjs': 50, 'versus.mjs': 210, 'void.mjs': 73,
};
const AVERAGE = 40;

const [shardIndex, shardCount] = (process.env.SHARD || '1/1')
  .split('/')
  .map((n) => Number(n));

const all = readdirSync(path.join(ROOT, 'test'))
  .filter((f) => f.endsWith('.mjs') && !SKIP.has(f))
  .filter((f) => !filter || f.includes(filter))
  .sort();

// Longest-processing-time first: walk the suites heaviest-first and drop each
// onto the lightest shard so far.
const bins = Array.from({ length: shardCount }, () => ({ load: 0, files: [] }));
for (const f of [...all].sort((a, b) => (WEIGHTS[b] ?? AVERAGE) - (WEIGHTS[a] ?? AVERAGE))) {
  const bin = bins.reduce((lightest, b) => (b.load < lightest.load ? b : lightest));
  bin.files.push(f);
  bin.load += WEIGHTS[f] ?? AVERAGE;
}
// Back into directory order so a shard's own log reads predictably.
const suites = bins[shardIndex - 1].files.sort();

const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const OFF = '\x1b[0m';

// ONE SUITE, ONE PORT. Two suites that share one collide in the silent
// direction: the second server fails to bind and the suite measures the first
// one's game. Cathedral and obsidian both owned 8247 for months, and nothing
// noticed. Checked against the WHOLE directory regardless of filter or shard -
// shard membership shifts with the weights, so a collision two shards apart
// today is a collision inside one tomorrow.
{
  const owners = new Map();
  let clash = false;
  for (const f of readdirSync(path.join(ROOT, 'test')).filter((f) => f.endsWith('.mjs'))) {
    const src = readFileSync(path.join(ROOT, 'test', f), 'utf8');
    for (const m of src.matchAll(/\bconst\s+\w*PORT\w*\s*=\s*(\d+)/g)) {
      if (owners.has(m[1])) {
        console.error(`${RED}port ${m[1]} is owned by both ${owners.get(m[1])} and ${f}${OFF}`);
        clash = true;
      } else owners.set(m[1], f);
    }
  }
  if (clash) process.exit(1);
}

// `detached` (below) puts each suite in its own process group, which is what
// lets a timeout take the whole tree down - and what keeps the tree OUT of
// reach of a Ctrl+C or a CI cancellation sent to THIS process, since a signal
// to the group never reaches it. Forward it by hand or an orphaned suite
// leaves its 200%-CPU software-GL Chrome running on the runner.
let killCurrent = null;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (killCurrent) killCurrent('SIGKILL');
    process.exit(128 + (sig === 'SIGINT' ? 2 : 15));
  });
}

const run = (file) =>
  new Promise((resolve) => {
    const started = Date.now();
    // detached puts the suite in its OWN PROCESS GROUP, which is the whole
    // point of the option here. A suite is node, which spawns a server and a
    // Chrome, and Chrome spawns a tree of its own - all GRANDCHILDREN. Killing
    // the node child left every one of them alive, and an orphaned headless
    // Chrome does not idle: it sat at 200% CPU rendering through software GL
    // and starved every suite that came after, so ONE timeout turned into a
    // cascade of unrelated suites failing to so much as load a page. With a
    // group, the negative pid below takes the lot.
    const child = spawn(process.execPath, [path.join(ROOT, 'test', file)], {
      cwd: ROOT,
      stdio: 'inherit',
      detached: true,
    });

    const killGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // The group is already gone - the suite exited between the timer
        // firing and this call. Nothing to kill, and nothing to report.
      }
    };

    // SIGTERM first so Chrome gets to tear its own tree down, then SIGKILL a
    // few seconds later for whatever ignored it.
    //
    // The flag, rather than reading the exit signal: a SIGTERMed node runs its
    // own handlers and exits with a CODE, so the suite comes back looking like
    // an ordinary failure. A hang and a failed assertion want different
    // answers from whoever reads the summary, so the timer records that it
    // fired instead of guessing afterwards.
    let timedOut = false;
    let hardTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup('SIGTERM');
      hardTimer = setTimeout(() => killGroup('SIGKILL'), 5000);
    }, TIMEOUT);

    killCurrent = killGroup;

    // A child that never starts emits 'error' and possibly never 'exit' -
    // without a listener here the promise hangs and the runner dies of the
    // job's own cap instead of naming the suite that failed to spawn.
    child.on('error', (err) => {
      clearTimeout(timer);
      clearTimeout(hardTimer);
      killCurrent = null;
      resolve({ file, ms: Date.now() - started, timedOut, ok: false, spawnError: String(err) });
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(hardTimer);
      killCurrent = null;
      // The suite is down but its Chrome may not be - a crashed or wedged
      // suite leaks the same orphans a timeout does. Sweep the group either
      // way; on a clean exit there is nothing left in it and this is a no-op.
      killGroup('SIGKILL');
      resolve({
        file,
        ms: Date.now() - started,
        timedOut,
        ok: !timedOut && code === 0 && !signal,
      });
    });
  });

if (shardCount > 1) {
  console.log(`shard ${shardIndex}/${shardCount}: ${suites.length} of ${all.length} suites`
    + ` (~${bins[shardIndex - 1].load}s of local time)`);
}

const results = [];
for (const file of suites) {
  console.log(`\n${BOLD}-- ${file} --${OFF}`);
  results.push(await run(file));
}

console.log(`\n${BOLD}-- summary --${OFF}`);
for (const r of results) {
  const tag = r.ok ? `${GREEN}PASS${OFF}` : r.timedOut ? `${RED}TIMEOUT${OFF}` : `${RED}FAIL${OFF}`;
  console.log(`${tag}  ${r.file.padEnd(16)} ${(r.ms / 1000).toFixed(1)}s`
    + (r.spawnError ? `  spawn error: ${r.spawnError}` : ''));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} suites passed`);
process.exitCode = failed.length ? 1 : 0;
