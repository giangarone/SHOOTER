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

const suites = readdirSync(path.join(ROOT, 'test'))
  .filter((f) => f.endsWith('.mjs') && !SKIP.has(f))
  .filter((f) => !filter || f.includes(filter))
  .sort();

const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const OFF = '\x1b[0m';

const run = (file) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(ROOT, 'test', file)], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({
        file,
        ms: Date.now() - started,
        // A SIGKILL here is ours, from the timer above.
        timedOut: signal === 'SIGKILL',
        ok: code === 0 && !signal,
      });
    });
  });

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
