// Focused check of SHOOTING ACCURACY, and of the two things that widen the
// cone the gun fires through without moving where it is pointed.
//
// THE DISTINCTION THIS FILE EXISTS TO DEFEND: recoil and spread are separate
// costs. Recoil moves the point of aim and the player answers it with the
// stick. Spread leaves the point of aim exactly where it was and widens the
// cone around it, and the only answer to it is to stop firing. A change that
// quietly folded one into the other would still look right on screen and would
// have taken a mechanic out of the game, so both are measured here, separately,
// off the same trigger pull.
//
// WHAT IS ASSERTED
//   1. A held trigger BLOOMS: the cone opens round after round, and the
//      crosshair - which is the cone, drawn - opens with it.
//   2. It SATURATES. A magazine held down reaches a worst case and stays
//      there; it does not open until the reticle leaves the screen.
//   3. It RECOVERS, quickly, and all the way back to the resting cone the
//      moment the trigger comes up.
//   4. Recoil is still its own thing: the same fire that bloomed the cone put
//      pitch into the view, and the two numbers move independently.
//   5. HAIR TRIGGER charges for its rate in both currencies - a much stronger
//      kick than it used to have, a flat widening the player can see before
//      they fire, and a far bigger cone at full bloom.
import puppeteer from 'puppeteer-core';
import { CHROME, startServer } from './harness.mjs';

const PORT = 8232;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

try {
  browser = await puppeteer.launch({
    headless: true, executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const results = await page.evaluate(async () => {
    const g = window.__game;
    // THE ARENA IS PROCEDURAL, so a fixture that walks a fixed path across it
    // is measuring the layout as much as the mechanic. This clears the
    // generated interior and pins the wave open - an empty queue would clear
    // the wave, sink the shop in and generate a fresh layout mid-measurement -
    // so every run below happens on the same bare floor.
    const clearArena = () => {
      if (g.terrain.state !== 'hidden') {
        g.terrain.reset();
        g.terrain.clearCollision();
        g.nav.rebake(g.arena.obstacles);
        g.navBig.rebake(g.arena.obstacles);
      }
      // A wave with an empty queue clears on the frame it starts, which sinks
      // the shop in and generates a fresh layout halfway through whatever is
      // being measured. One entry that never spawns holds it open instead.
      g.waveState = 'active';
      if (!g.queue.length) g.queue.push('chaser');
      g.spawnTimer = 1e9;
    };
    // The bot that comes with ?autotest has to be taken off the sticks, or it
    // rewrites `input` under every measurement below.
    g.autoTest = false;
    const p = g.player;
    const out = [];
    const t = (name, cond, extra = '') => out.push([name, !!cond, String(extra)]);
    const step = () => new Promise((r) => requestAnimationFrame(r));
    // NOTHING MAY BE STANDING IN FRONT OF THE PLAYER. Two separate reasons,
    // and the second one is why this file was flaky for a long time.
    //
    // The spawner would walk something into the player halfway through a
    // measurement and shove them, and a shoved player is a moving player -
    // which is its own term in the cone.
    //
    // AND THE PLAYER IS FIRING DOWN THE MIDDLE OF THE ARENA AT THE SHOP. Every
    // measurement here holds the trigger for dozens of frames from the spawn
    // point, facing the totem row - and because this loop empties the arena on
    // every frame, each wave completes instantly and raises a fresh set of
    // totems into the line of fire. The player was picking up two or three
    // passive items per trigger pull, at random, DURING the measurement: the
    // resting cone was read off a clean gun and the bloomed cone off whatever
    // the totems happened to be offering. A Hollow Point broke the cone
    // assertions, a Bloodlust or a Detonator broke the fire-rate one (both take
    // a quarter of it), and the run that picked up nothing relevant passed.
    // Roughly one run in four failed, always somewhere different.
    //
    // Forced HIDDEN rather than dismissed: dismiss() only starts a sink, and a
    // sinking pillar is still a raycast target.
    const clear = () => {
      g.queue.length = 0;
      g._clearEntities();
      for (const t of g.totemArea.totems) { t.state = 'hidden'; t.claimed = false; }
      for (const st of g.totemArea.stations) st.state = 'hidden';
      g.mysteryBox.riseState = 'hidden';
      g.mysteryBox.group.visible = false;
      clearArena();
    };
    const frames = async (n) => { for (let i = 0; i < n; i++) { clear(); await step(); } };
    // A WAIT MEASURED IN GAME TIME, which is what every number in this file
    // actually depends on: the bloom recovers at 3.2 a second, the kick decays
    // by 0.33 a second, and the rounds that build both arrive at a rate per
    // second. A frame COUNT is none of those things - dt is clamped to 0.05 in
    // _loop, so thirty frames is anywhere from half a second to a second and a
    // half of game time depending on how fast the machine is drawing.
    //
    // That is not a hypothetical. 'the kick decays on its own' asserts the
    // recoil is under a fifth of its peak, which needs 1.45s (0.33^1.45 = 0.2)
    // and used to be given thirty frames - passing only because this harness
    // was slow enough to hit the dt clamp on every single frame, 30 x 0.05 =
    // 1.5s, with 0.05s to spare. Speeding the harness up by any amount broke
    // it. The assertion was measuring the machine, not the gun.
    //
    // The wall-clock guard is a deadlock stop, not a measurement: if the game
    // clock ever stops advancing this must fail an assertion rather than hang.
    const secs = async (n) => {
      const t0 = g.time;
      const wall = performance.now();
      while (g.time - t0 < n && performance.now() - wall < 20000) {
        clear();
        await step();
      }
    };
    const set = (o) => Object.assign(g.input, o);
    // THE CROSSHAIR AS THE PLAYER SEES IT, read off the DOM rather than
    // recomputed - the claim being tested is that the reticle and the raycast
    // cannot disagree, so reading the same number twice would prove nothing.
    const gap = () => parseFloat(getComputedStyle(g.ui.crosshair).getPropertyValue('--gap'));
    const rest = async () => {
      set({
        forward: false, back: false, left: false, right: false,
        sprint: false, shoot: false, aim: false, crouch: false, jump: false, melee: false,
      });
      p.bloom = 0;
      p.recoilPitch = 0;
      // A reload mid-measurement would stop the gun for a second and a half.
      p.mag = 9999;
      p.reserveAmmo = 9999;
      await frames(6);
    };

    g.beginGame();
    await frames(4);
    await rest();

    // ---- 1..3. the held trigger -------------------------------------------
    const restCone = g._shotSpread();
    const restGap = gap();
    set({ shoot: true });
    await secs(0.25);
    const earlyCone = g._shotSpread();
    await secs(1.5);
    const heldCone = g._shotSpread();
    const heldGap = gap();
    const heldBloom = p.bloom;
    // THE CAP, checked every frame rather than sampled at the end. A charge
    // that overshot and settled back would read as a cap from either side of
    // it and would not be one.
    let peak = 0;
    for (let i = 0; i < 60; i++) { await frames(1); peak = Math.max(peak, p.bloom); }
    const cappedCone = g._shotSpread();
    set({ shoot: false });
    // The bloom recovers at BLOOM_RECOVER (3.2) a second after a hold of about
    // a tenth, so a full second is comfortably enough to settle from the cap -
    // and 'all the way back' is asserted to within 1e-6, so 'enough' has to be
    // a real margin rather than just about.
    await secs(1.0);
    const settledCone = g._shotSpread();
    const settledGap = gap();
    t('a few rounds already open the cone', earlyCone > restCone,
      restCone.toFixed(4) + ' -> ' + earlyCone.toFixed(4));
    t('a held trigger opens it much further', heldCone > earlyCone && heldCone > restCone * 1.4,
      earlyCone.toFixed(4) + ' -> ' + heldCone.toFixed(4));
    t('and the crosshair opens with it', heldGap > restGap + 2,
      restGap + ' -> ' + heldGap);
    t('THE BLOOM SATURATES rather than climbing forever', heldBloom > 0.99,
      heldBloom.toFixed(3));
    t('and half a magazine later it is still at the same cap',
      Math.abs(cappedCone - heldCone) < 0.005 && peak <= 1,
      heldCone.toFixed(4) + ' -> ' + cappedCone.toFixed(4) + ' peak ' + peak.toFixed(3));
    t('letting go settles it all the way back', Math.abs(settledCone - restCone) < 1e-6,
      settledCone.toFixed(4) + ' vs ' + restCone.toFixed(4));
    t('and the crosshair comes back with it', settledGap === restGap,
      heldGap + ' -> ' + settledGap);

    // ---- 4. recoil is not spread ------------------------------------------
    await rest();
    const aimBefore = p.pitch;
    set({ shoot: true });
    await secs(0.5);
    set({ shoot: false });
    const kicked = p.recoilPitch;
    const bloomed = p.bloom;
    t('the same fire also kicks the pitch', kicked > 0.02, kicked.toFixed(3));
    t('and blooms the cone', bloomed > 0.1, bloomed.toFixed(2));
    // THE POINT OF AIM ITSELF NEVER MOVED. Recoil is an OFFSET on top of it -
    // see the note on RECOIL_DECAY - and spread is a cone around it. Neither
    // is allowed to write into where the player is looking.
    t('but neither of them moved where the player is aiming',
      p.pitch === aimBefore, 'pitch ' + p.pitch);
    // And they come back on their own clocks: the kick decays exponentially,
    // the cone settles linearly, so one is not the other wearing a hat.
    // 0.33^2 = 0.109, so two seconds leaves the kick at about a ninth of its
    // peak against a threshold of a fifth. Nearly twice the margin it needs,
    // which is the point: the number being checked is the decay CONSTANT, and a
    // window sized to only just clear it is a window that fails on a fast frame.
    await secs(2.0);
    t('the kick decays on its own', p.recoilPitch < kicked * 0.2,
      kicked.toFixed(3) + ' -> ' + p.recoilPitch.toFixed(3));

    // ---- 5. HAIR TRIGGER ---------------------------------------------------
    // One trigger pull of a fixed length, measured before and after the card,
    // so the two readings differ by the passive item and by nothing else.
    const trial = async () => {
      await rest();
      const idle = g._shotSpread();
      // THE WORST CASE, SET RATHER THAN EARNED. What is being compared is what
      // a full charge is WORTH, and holding the trigger for a fixed number of
      // frames does not measure that: the headless harness runs at whatever
      // frame time clearing the arena leaves it, and the card being tested
      // raises the fire rate, so the two runs would not even fire the same
      // number of rounds. Pinning the charge takes the clock out of it.
      p.bloom = 1;
      const cone = g._shotSpread();
      p.bloom = 0;
      // Recoil, though, IS earned - over one trigger pull of a fixed length.
      // The extra rounds a raised fire rate gets through that window are part
      // of what the card costs, so they belong in the reading. A fixed length
      // in GAME TIME: measured in frames, a machine drawing faster would put
      // fewer rounds through the same "window" and the card would look weaker
      // for it, which is the opposite of what this is trying to say.
      set({ shoot: true });
      await secs(2.0);
      const recoil = p.recoilPitch;
      set({ shoot: false });
      await secs(0.5);
      return { idle, cone, recoil };
    };
    const before = await trial();
    p.takeUpgrade('hairTrigger');
    p.takeUpgrade('hairTrigger');
    await frames(4);
    const after = await trial();
    t('Hair Trigger stacks to its max', p.upgrades.hairTrigger === 2, p.upgrades.hairTrigger);
    t('it widens the RESTING cone, before a shot is fired',
      after.idle > before.idle * 1.2,
      before.idle.toFixed(4) + ' -> ' + after.idle.toFixed(4));
    t('and the fully bloomed cone far more',
      after.cone > before.cone * 1.9,
      before.cone.toFixed(4) + ' -> ' + after.cone.toFixed(4));
    t('THE RECOIL PENALTY IS NOW A REAL ONE',
      after.recoil > before.recoil * 2.5,
      before.recoil.toFixed(3) + ' -> ' + after.recoil.toFixed(3));
    t('both accuracy mods are set, and neither stands in for the other',
      p.mods.bloomMult > 1 && p.mods.spreadAdd > 0,
      'bloomMult=' + p.mods.bloomMult.toFixed(2) + ' spreadAdd=' + p.mods.spreadAdd.toFixed(3));
    t('and the rate it was bought for is still there',
      p.mods.fireRate > 1.4, p.mods.fireRate.toFixed(2));

    await rest();
    clear();
    return out;
  });

  for (const [name, cond, extra] of results) ok(name, cond, extra);

  console.log('CONSOLE ERRORS', JSON.stringify(errors));
  ok('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  console.error(err);
  fails++;
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(fails ? `ACCURACY TEST FAIL (${fails})` : 'ACCURACY TEST PASS');
process.exit(fails ? 1 : 0);
