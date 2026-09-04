import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 8199;
const CHROME =
  process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Caps the game promises to hold. Mirrors the constants in js/main.js.
const MAX_ACTIVE_PICKUPS = 12;
const MAX_ACTIVE_AMMO = 5;
const MAX_PROJECTILES = 72;

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
  // it has to reach wave 4 before the upgrade assertions below stop being
  // vacuous. A longer run also gives the leak canaries more to work with.
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
    // The bot claims a totem every wave, so anything past wave 3 must have
    // banked upgrades - the guard fires on a normal run rather than passing
    // vacuously, which earlier revisions of it did.
    ['granted upgrades', rep.wave < 3 || rep.upgradeCount > 0],
    ['combo chained', rep.bestCombo >= 2],
    // One lit plate on the receiver per owned bullet mutation. Covers
    // refreshGunMarks() being called on every draft pick, not just the first.
    ['gun marks match build', rep.gunMarks === rep.markedUpgrades],
    ['loadout intact', typeof rep.weapon === 'string'],
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
    //
    // The number tracks CONTENT, not correctness - each distinct material that
    // appears compiles one program, so a run that happens to show every enemy,
    // pickup and status effect legitimately sits higher than one that does
    // not. It was 24, which the roster of the day reached on a full run and
    // exceeded on a lucky one; the series plateaus either way. Raise it when
    // materials are deliberately added, and read a number far above it as the
    // regression it is meant to catch - a per-instance light or material would
    // blow past this by dozens, not by one.
    //
    // IT WENT 30 -> 34 FOR THE MYSTERY BOX and then most of the way back. The
    // box briefly carried a moving rainbow, which cost four programs of its
    // own - two ShaderMaterials and an onBeforeCompile patch on the floor ring
    // in two flavours. The rainbow is gone (see the note by lightMaterial in
    // mysterybox.js) and its programs went with it; what the box still adds is
    // ONE, for the cut-out walls, which are the only material in the game
    // carrying an alphaMap and an alphaTest.
    ['shader programs bounded', peak.programs <= 31],
    // Enemies, projectiles and pickups all draw from a fixed set of shared
    // geometries and materials, so GPU resources stay bounded however long the
    // game runs. Per-instance allocation climbed past this within a minute.
    ['geometry count bounded', peak.geometries < 120],
    // The fixed set of canvas panels (three totems, two stations, the mystery
    // box) uploads in one step the first time a shop rises, then never grows
    // again. The box's question mark is drawn at construction and uploads with
    // the first frame that shows it. WHEN
    // that step happens depends on how fast the bot clears wave 1, so any
    // assertion pinned to a sample index is flaky - two earlier attempts here
    // both failed on slow runs. What actually matters is that the count only
    // ever settles upward and stays under a ceiling a per-spawn leak would
    // blow straight through.
    ['texture count non-decreasing',
      samples.every((r, i) => i === 0 || r.textures >= samples[i - 1].textures)],
    // SIXTEEN. The canvases are the part of this that is worth naming and the
    // part that moves: SIX PANELS - three totem cards, two console labels
    // (every Station carries its own) and the mystery box's card - plus ONE
    // GLYPH, the question mark on the box's four sides. Then the soft glow dot
    // every halo and puff tints, the hard-edged spark dot the particles use,
    // the creep field, the surface tile the floor and walls share, and the
    // gradients the rig and the laser bank draw their beams on. A few of those
    // last live outside the scene graph, which is why this is a measured
    // ceiling and not an arithmetic one.
    //
    // THE GLYPH IS THE SIXTEENTH, and it was spent deliberately. The mark on
    // the box was built out of flat primitives precisely to avoid spending it -
    // an arc, a stem and a dot, costing three geometries and no texture. That
    // was the wrong economy. It is a CHARACTER; the player reads it as one, and
    // a hand-approximated glyph standing next to a HUD, a card and a menu that
    // are all Press Start 2P was the one thing in the room that looked
    // undesigned. One 128x128 canvas, shared by all four faces, buys the real
    // face. A texture is worth spending on something the player reads.
    //
    // IT WENT UP BY ONE WHEN THE MYSTERY BOX REPLACED THE ITEM PEDESTAL, and
    // the reason is worth writing down because the paper budget went DOWN by
    // two at the same time. The far row used to be a pedestal and two consoles
    // - three panels - but it only rose on every third shop, so most runs never
    // uploaded any of them and the peak this test SAW was the near row's five.
    // The box is one panel and it stands in every wave break, so its card is
    // uploaded in every run that reaches a shop at all. Fewer textures on
    // paper, one more of them actually realised.
    //
    // The cap had come down from sixteen when the Devil's row was retired: his
    // three deal cards became one item pedestal. It had gone from twelve to
    // thirteen for the pixel-art pass: glow split into a soft texture for LIGHT
    // and a stepped one for the sparks, which are matter, and the creep stopped
    // being thirty meshes and became one field on one texture. It moved from
    // fifteen for the surface tile - ONE texture for every surface in the room,
    // projected in world space rather than through each mesh's UVs, which is
    // what stops a 46m wall and a 2m crate drawing it at different sizes.
    // A run in which the bot never reaches a shop still peaks below this, so
    // the number is the ceiling, not the number the last run saw.
    //
    // It moved from sixteen for the DIGIT ATLAS: ten glyphs in one strip, built
    // once at boot, from which every damage number in the game is drawn. One
    // texture for the whole system is the point of it - the alternative was a
    // canvas per number, uploaded per hit, dozens of times a second.
    //
    // It is a BUDGET, not a leak canary: the check above ('non-decreasing') is
    // what catches a texture being allocated per wave. This one catches the
    // budget being spent without anyone noticing, which is why raising it is a
    // deliberate edit with a list attached rather than a nudge.
    ['texture count bounded', peak.textures <= 17],
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
