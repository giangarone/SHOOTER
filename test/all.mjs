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
import { readdirSync } from 'node:fs';
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
  'drops.mjs': 15, 'ember.mjs': 46, 'flawless.mjs': 9, 'headshot.mjs': 7,
  'icons.mjs': 1, 'melee.mjs': 76, 'money.mjs': 49, 'newpool.mjs': 38,
  'pad.mjs': 27, 'plague.mjs': 47, 'rime.mjs': 46, 'seeker.mjs': 8,
  'smoke.mjs': 71, 'solar.mjs': 46, 'sprint.mjs': 56, 'status.mjs': 20,
  'strata.mjs': 46, 'tempest.mjs': 83, 'terrain.mjs': 14, 'themes.mjs': 1,
  'verdant.mjs': 50, 'versus.mjs': 107, 'void.mjs': 73,
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

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(hardTimer);
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
  console.log(`${tag}  ${r.file.padEnd(16)} ${(r.ms / 1000).toFixed(1)}s`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} suites passed`);
process.exitCode = failed.length ? 1 : 0;
