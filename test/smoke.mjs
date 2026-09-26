import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8199;
// Caps the game promises to hold. Mirrors the constants in js/main.js.
const MAX_ACTIVE_PICKUPS = 12;
const MAX_ACTIVE_AMMO = 5;
const MAX_PROJECTILES = 72;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  // Wait on the game EXISTING, not on the document loading. `load` only
  // means the html arrived; booting the game - and with it `__game` and
  // `__report` - can take seconds on a loaded runner, and the poll loop's
  // first sample used to be the first wakeup, about a second in. On a slow
  // boot that call hit a window that did not have `__report` yet and the
  // suite died with a runner error before a single sample was taken.
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const report = () => page.evaluate(() => window.__report());
  const peak = { powerups: 0, ammoPickups: 0, projectiles: 0, geometries: 0, programs: 0, textures: 0 };

  // Poll while the game plays so transient spikes in the caps are caught, not
  // just whatever happens to be on screen at the end. Sixty seconds rather
  // than thirty: the bot walks to a totem every wave, which costs it time, and
  // it has to reach wave 4 before the passive item assertions below stop being
  // vacuous. A longer run also gives the leak canaries more to work with.
  //
  // SIXTY SECONDS OF GAME, NOT SIXTY SECONDS OF STANDING HERE. This used to
  // sleep for sixty wall seconds and assert on whatever the bot had managed in
  // them, which made every check below a measurement of how busy the machine
  // was. The loop clamps dt at 0.05 (see _loop), so a host rendering at five
  // frames a second advances 0.25s of game per second of wall time - the bot
  // got a fifteen-second run, never cleared a wave, and 'landed hits' and
  // 'earned credits' failed on a build with nothing wrong with it.
  //
  // The sampling cadence is still one second of WALL time, because the leak
  // canaries are watching real allocation over real time. Only the finish line
  // moved: the run ends when the SIMULATION has had its minute.
  //
  // The wall ceiling is the backstop, and it is not the assertion - it is what
  // stops a genuinely wedged build from hanging the suite forever. A run that
  // hits it reports what it got and the checks below judge that.
  const SIM_SECONDS = 60;
  const MIN_SAMPLES = 60;
  const WALL_CEILING_MS = 5 * 60 * 1000;
  const samples = [];
  const startedAt = Date.now();
  for (;;) {
    await sleep(1000);
    const r = await report();
    samples.push(r);
    peak.powerups = Math.max(peak.powerups, r.powerups);
    peak.ammoPickups = Math.max(peak.ammoPickups, r.ammoPickups);
    peak.projectiles = Math.max(peak.projectiles, r.projectiles);
    peak.geometries = Math.max(peak.geometries, r.geometries);
    peak.programs = Math.max(peak.programs, r.programs);
    peak.textures = Math.max(peak.textures, r.textures);
    const enough = r.simTime >= SIM_SECONDS && samples.length >= MIN_SAMPLES;
    if (enough || Date.now() - startedAt > WALL_CEILING_MS) break;
  }
  const last = samples[samples.length - 1];
  console.log('SIM SECONDS', last.simTime.toFixed(1),
    'over', ((Date.now() - startedAt) / 1000).toFixed(1), 'wall seconds',
    'in', samples.length, 'samples');

  console.log('GEOMETRY SERIES', samples.map((r) => r.geometries).join(','));
  console.log('LIGHT SERIES', samples.map((r) => r.lights).join(','));
  console.log('PROGRAM SERIES', samples.map((r) => r.programs).join(','));
  console.log('TEXTURE SERIES', samples.map((r) => r.textures).join(','));
  console.log('WAVE SERIES', samples.map((r) => r.wave).join(','));
  console.log('PASSIVE ITEM SERIES', samples.map((r) => r.passiveItemCount).join(','));
  // The shared caches are filled lazily, the first time each enemy or
  // projectile type appears, so only the steady state is meaningful.
  const early = samples[Math.floor(samples.length * 2 / 3)];
  const rep = samples[samples.length - 1];
  // Warm every fixed Donation Machine resource, including every shared reward
  // plates, then hammer redraw/reveal/present/dismiss. The ordinary bot may
  // die before its first shop and it never donates deliberately, so a sample
  // series alone could leave this whole installation unrendered and let a
  // per-donation GPU leak pass vacuously.
  const donationResources = await page.evaluate(() => {
    const g = window.__game;
    const machine = g.donationMachine;
    const read = () => ({
      geometries: g.renderer.info.memory.geometries,
      textures: g.renderer.info.memory.textures,
      programs: g.renderer.info.programs.length,
      lights: g._countLights(),
    });
    const before = read();
    const render = () => {
      g.scene.updateMatrixWorld(true);
      g.crt.render(g.scene, g.camera);
    };
    machine.dismiss();
    machine.present(g.player);
    machine.state = 'up';
    machine.rise = 1;
    machine.group.position.y = 0;
    machine.group.traverse((object) => { object.frustumCulled = false; });
    machine.displayGroup.traverse((object) => { object.frustumCulled = false; });
    for (const id of Object.keys(machine.icons)) {
      machine.reveal(id);
      render();
    }
    machine.dismiss();
    machine.present(g.player);
    machine.state = 'up';
    machine.setChance(5);
    render();
    const settled = read();

    for (let i = 0; i < 40; i++) {
      machine.dismiss();
      machine.present(g.player, () => (i % 3 + 0.5) / 3);
      machine.state = 'up';
      machine.rise = 1;
      machine.group.visible = true;
      machine.setChance(5 + (i * 7) % 96);
      machine.startSpin(machine.chance, () => (i % 4) / 4);
      machine.update(1.5, g.time + i);
      render();
      machine.update(1.5, g.time + i + 1.5);
      if (machine.spinWon) {
        const id = Object.keys(machine.icons)[i % Object.keys(machine.icons).length];
        machine.reveal(id);
      }
      render();
      machine.dismiss();
      machine.update(1, g.time + i + 2.5);
      render();
    }
    return { before, settled, after: read(), rewards: Object.keys(machine.icons).length };
  });
  peak.programs = Math.max(peak.programs, donationResources.after.programs);
  peak.textures = Math.max(peak.textures, donationResources.after.textures);
  await page.screenshot({ path: 'test/shot.png' });

  console.log('REPORT', JSON.stringify(rep, null, 2));
  console.log('PEAK', JSON.stringify(peak));
  console.log('DONATION RESOURCES', JSON.stringify(donationResources));
  console.log('CONSOLE ERRORS', JSON.stringify(errors, null, 2));

  const benign = (e) =>
    /AudioContext|swiftshader|WebGL|GpuChannel|passthrough|GPU stall|font/i.test(e);
  const fatal = errors.filter((e) => !benign(e));

  const checks = [
    ['runs', rep && (rep.state === 'playing' || rep.state === 'gameover')],
    ['spawned enemies', rep.spawned > 0],
    ['fired shots', rep.shots > 0],
    ['landed hits', rep.hits > 0],
    // Every wave clear grants one random passive item, so a run past wave 1 must
    // have banked credits and gained a passive item. Without these the wave-clear
    // reward could stop firing entirely and every other check would still pass.
    ['earned credits', rep.credits > 0],
    // The bot claims a totem every wave, so anything past wave 3 must have
    // banked passive items - the guard fires on a normal run rather than passing
    // vacuously, which earlier revisions of it did.
    ['granted passive items', rep.wave < 3 || rep.passiveItemCount > 0],
    // The flawless streak is the run's only credit multiplier now, so the
    // guard is that its two halves agree: a bot that gets hit constantly may
    // legitimately finish on a streak of nothing, but the multiplier must
    // always be exactly what the count says it is - a quarter a wave, capped
    // at three. A renamed field or a cap that drifted fails here.
    ['flawless multiplier matches the streak',
      rep.flawlessMult === Math.min(3, 1 + 0.25 * rep.flawlessStreak)],
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
    // Forced full-catalogue rendering uploads drawings a normal one-minute
    // run never shows. Bound those separately rather than spending the game's
    // ordinary geometry budget on every unclaimed reward at once: one mesh
    // per reward, plus six cabinet geometries and the shared sprite quad.
    ['donation warmup uploads only its fixed cabinet and reward meshes',
      donationResources.settled.geometries - donationResources.before.geometries
        <= donationResources.rewards + 7],
    ['donation machine resources stay fixed after warmup',
      donationResources.after.geometries === donationResources.settled.geometries
        && donationResources.after.textures === donationResources.settled.textures
        && donationResources.after.programs === donationResources.settled.programs
        && donationResources.after.lights === donationResources.settled.lights],
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
    // box and donation cabinet) uploads in one step when a shop first rises,
    // then never grows again. The box's question mark is drawn at construction and uploads with
    // the first frame that shows it. WHEN
    // that step happens depends on how fast the bot clears wave 1, so any
    // assertion pinned to a sample index is flaky - two earlier attempts here
    // both failed on slow runs. What actually matters is that the count only
    // ever settles upward and stays under a ceiling a per-spawn leak would
    // blow straight through.
    ['texture count non-decreasing',
      samples.every((r, i) => i === 0 || r.textures >= samples[i - 1].textures)],
    // The canvases are the part of this that is worth naming and the part that
    // moves: SEVEN PANELS - three totem cards, two console labels (every
    // Station carries its own), the mystery box's card and the Donation
    // Machine card - plus ONE
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
    // The cap had come down from sixteen when the paid row was retired: its
    // three offer cards became one item pedestal. It had gone from twelve to
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
    // And to EIGHTEEN for the MUZZLE BLAST's fire contour: one canvas shared
    // by every blast slot (fireball and petals alike).
    //
    // And to NINETEEN for the shared Donation Machine card. Its roulette
    // uses shader geometry and no texture; one reusable panel supplies the
    // title, cost and floating reward description for all three payment kinds.
    //
    // It is a BUDGET, not a leak canary: the check above ('non-decreasing') is
    // what catches a texture being allocated per wave. This one catches the
    // budget being spent without anyone noticing, which is why raising it is a
    // deliberate edit with a list attached rather than a nudge.
    ['texture count bounded', peak.textures <= 19],
  ];

  const shutter = await page.evaluate(() => {
    const g = window.__game;
    const rig = g.rig;
    const state = { ...g._fillRigState(), mode: 'combat', beat: 1, beatHit: 1, level: 1, bar: 1, downbeat: false };
    rig._lastBar = 0;
    rig._house = 0;
    rig._waveT = rig._staggerT = 0;
    rig.update(1 / 240, state);
    const lit = rig._showOpen && rig.beams.some((b) => b.pivot.visible);
    state.mode = 'house';
    state.bar = 2;
    rig.update(1 / 240, state);
    return { lit, fading: rig._house < 0.5,
      dark: !rig._showOpen && rig.beams.every((b) => !b.pivot.visible)
        && rig.lasers.banks.every((b) => !b.rayMesh.visible && !b.fillMesh.visible) };
  });
  checks.push(['first break beat closes shutters before ambient fade finishes',
    shutter.lit && shutter.fading && shutter.dark]);

  // Sample the real music envelope on BOTH sides of the off-beat boundary.
  // Testing only the boundary misses an anticipation flash just before it.
  const pulseTrace = await page.evaluate(async () => {
    const { BeatMap } = await import('/js/beatmap.js');
    const g = window.__game;
    const originalMusic = g.music;
    const music = Object.assign(Object.create(Object.getPrototypeOf(originalMusic)), originalMusic);
    let time = 0;
    music.analyser = null;
    music._clock = () => time;
    music._heard = (t) => t;
    music.map = new BeatMap({ duration: 10, segments: [{
      t0: 0, t1: 10, anchor: 0, period: 0.5, bpm: 120,
      quantized: true, beatsPerBar: 4, barOffset: 0,
    }] });
    g.music = music;
    try {
      const rig = g.rig;
      rig._lastBar = 3;
      rig._barsHeld = -1;
      rig._look = 0;
      rig._energy = 1;
      rig._house = rig._waveT = rig._staggerT = 0;
      for (const b of rig.lasers.banks) {
        b.playing = true;
        b.mask = 5; // First bar on, second off, third on again.
        b.barsOn = 0;
        b.on = false;
        b.pulsing = true;
        b.move = 0;
        b.emGain0 = b.emGain1 = 1;
      }
      const hits = [];
      const stray = [];
      let approach = 0;
      for (let beat = 0; beat < 8; beat++) {
        for (const offset of [0, 0.04, 0.18, 0.25, 0.42, 0.46, 0.49]) {
          time = beat * 0.5 + offset;
          music.sample(1 / 240);
          rig.update(1 / 240, { ...g._fillRigState(), mode: 'combat', level: 1 });
          const lit = rig.lasers.banks.some((b) => b.rayMesh.visible || b.fillMesh.visible);
          if (offset === 0 && beat < 4) hits.push(lit);
          if ((beat >= 4 || offset >= 0.18) && lit) stray.push(time);
          if (offset >= 0.18 && rig.beams.some((b) => b.pivot.visible)) stray.push(`beam@${time}`);
          if (offset === 0.49) approach = Math.max(approach, music.beat);
        }
      }
      time = 4;
      music.sample(1 / 240);
      rig.update(1 / 240, { ...g._fillRigState(), mode: 'combat', level: 1 });
      return { hits, stray, approach,
        resumed: rig.lasers.banks.some((b) => b.rayMesh.visible) };
    } finally {
      g.music = originalMusic;
    }
  });
  console.log('LASER PULSE TRACE', JSON.stringify(pulseTrace));
  checks.push(['four flashes, no extra flash approaching or during the off beat',
    pulseTrace.hits.length === 4 && pulseTrace.hits.every(Boolean) && pulseTrace.stray.length === 0]);
  checks.push(['ambient anticipation preserved and scheduled laser flashes resume',
    pulseTrace.approach > 0 && pulseTrace.resumed]);

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
