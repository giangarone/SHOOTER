import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 8199;
const CHROME =
  process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Caps the game promises to hold. Mirrors the constants in js/main.js.
const MAX_ACTIVE_PICKUPS = 12;
const MAX_ACTIVE_AMMO = 3;
const MAX_PROJECTILES = 24;

if (!existsSync(CHROME)) {
  console.error('No Chrome found. Set CHROME env to a Chrome/Chromium binary.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { stdio: 'inherit' });
await sleep(800);

let browser;
try {
  browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });

  const report = () => page.evaluate(() => window.__report());
  const peak = { powerups: 0, ammoPickups: 0, projectiles: 0, geometries: 0, programs: 0, textures: 0 };

  // Poll while the game plays so transient spikes in the caps are caught, not
  // just whatever happens to be on screen at the end. Sixty seconds rather
  // than thirty: the bot walks to a totem every wave, which costs it time, and
  // it has to reach wave 4 before the upgrade and weapon assertions below stop
  // being vacuous. A longer run also gives the leak canaries more to work with.
  const samples = [];
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const r = await report();
    samples.push(r);
    peak.powerups = Math.max(peak.powerups, r.powerups);
    peak.ammoPickups = Math.max(peak.ammoPickups, r.ammoPickups);
    peak.projectiles = Math.max(peak.projectiles, r.projectiles);
    peak.geometries = Math.max(peak.geometries, r.geometries);
    peak.programs = Math.max(peak.programs, r.programs);
    peak.textures = Math.max(peak.textures, r.textures);
  }

  console.log('GEOMETRY SERIES', samples.map((r) => r.geometries).join(','));
  console.log('LIGHT SERIES', samples.map((r) => r.lights).join(','));
  console.log('PROGRAM SERIES', samples.map((r) => r.programs).join(','));
  console.log('TEXTURE SERIES', samples.map((r) => r.textures).join(','));
  console.log('WAVE SERIES', samples.map((r) => r.wave).join(','));
  console.log('UPGRADE SERIES', samples.map((r) => r.upgradeCount).join(','));
  // The shared caches are filled lazily, the first time each enemy or
  // projectile type appears, so only the steady state is meaningful.
  const early = samples[Math.floor(samples.length * 2 / 3)];
  const rep = samples[samples.length - 1];
  await page.screenshot({ path: 'test/shot.png' });

  console.log('REPORT', JSON.stringify(rep, null, 2));
  console.log('LOADOUT', JSON.stringify(rep.slots));
  console.log('PEAK', JSON.stringify(peak));
  console.log('CONSOLE ERRORS', JSON.stringify(errors, null, 2));

  const benign = (e) =>
    /AudioContext|swiftshader|WebGL|GpuChannel|passthrough|GPU stall|font/i.test(e);
  const fatal = errors.filter((e) => !benign(e));

  const checks = [
    ['runs', rep && (rep.state === 'playing' || rep.state === 'gameover')],
    ['spawned enemies', rep.spawned > 0],
    ['fired shots', rep.shots > 0],
    ['landed hits', rep.hits > 0],
    // Every wave clear grants one random upgrade, so a run past wave 1 must
    // have banked credits and gained an upgrade. Without these the wave-clear
    // reward could stop firing entirely and every other check would still pass.
    ['earned credits', rep.credits > 0],
    // Under ?autotest every set offers exactly one weapon, and the bot goes
    // for it while its second slot is empty and avoids weapon totems once it
    // is full. So the wave-1 clear always yields a weapon and the wave-2 clear
    // always yields an upgrade - both guards below fire on a normal run rather
    // than passing vacuously, which earlier revisions of these two checks did.
    ['granted upgrades', rep.wave < 3 || rep.upgradeCount > 0],
    ['combo chained', rep.bestCombo >= 2],
    // WEAPON_CHANCE is forced to 1 under ?autotest, so any run that cleared
    // wave 2 must have been offered a weapon and claimed it into the second
    // slot. Covers takeWeapon(), the model swap and the per-slot magazines.
    ['picked up a weapon', rep.wave < 2 || rep.slots[1] !== null],
    ['loadout intact', rep.slots[0] !== null && typeof rep.weapon === 'string'],
    ['no console errors', fatal.length === 0],
    // Guards against the checks below passing vacuously if a report field is
    // ever renamed or dropped.
    ['report complete', samples.every((r) => r &&
      typeof r.lights === 'number' && typeof r.geometries === 'number' &&
      typeof r.powerups === 'number' && typeof r.programs === 'number')],
    [`pickups <= ${MAX_ACTIVE_PICKUPS}`, peak.powerups <= MAX_ACTIVE_PICKUPS],
    [`ammo pickups <= ${MAX_ACTIVE_AMMO}`, peak.ammoPickups <= MAX_ACTIVE_AMMO],
    [`projectiles <= ${MAX_PROJECTILES}`, peak.projectiles <= MAX_PROJECTILES],
    // Lights are keyed into every shader program three.js compiles, so a
    // changing light count triggers a full recompile of every material in the
    // scene. Pickups used to add one PointLight each; the count must be fixed.
    ['light count constant', samples.every((r) => r.lights === samples[0].lights)],
    // Which in turn keeps the program count small instead of growing by a few
    // every second. Only the bound is asserted: three.js frees programs it is
    // not using, so the count drifts by one either way between samples.
    ['shader programs bounded', peak.programs <= 24],
    // Enemies, projectiles and pickups all draw from a fixed set of shared
    // geometries and materials, so GPU resources stay bounded however long the
    // game runs. Per-instance allocation climbed past this within a minute.
    ['geometry count bounded', peak.geometries < 120],
    // The fixed set of canvas panels (three totems, two stations) uploads in
    // one step the first time a totem set rises, then never grows again. WHEN
    // that step happens depends on how fast the bot clears wave 1, so any
    // assertion pinned to a sample index is flaky - two earlier attempts here
    // both failed on slow runs. What actually matters is that the count only
    // ever settles upward and stays under a ceiling a per-spawn leak would
    // blow straight through.
    ['texture count non-decreasing',
      samples.every((r, i) => i === 0 || r.textures >= samples[i - 1].textures)],
    ['texture count bounded', peak.textures <= 12],
  ];

  for (const [name, ok] of checks) console.log((ok ? '  ok   ' : '  FAIL ') + name);
  const ok = checks.every(([, v]) => v);

  console.log(ok ? 'SMOKE TEST PASS' : 'SMOKE TEST FAIL');
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.error('TEST RUNNER ERROR', e);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
