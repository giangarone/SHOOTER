// Focused check of CROUCHING, SLIDING, and the melee swing that replaced the
// old floor-ring sweep.
//
// WHAT IS ASSERTED
//   1. The button TOGGLES a crouch: one press latches it, releasing does not
//      stand the player up, and a second press does. The camera drops with it.
//   2. Crouching is slower than walking, and it refuses the sprint.
//   3. The same button at a sprint SLIDES instead - faster than the sprint it
//      came out of, and it does NOT end when the button is released. It ends
//      on its own clock, standing rather than crouched, and it spends stamina.
//   4. A jump is available at any point in a slide, and it KEEPS the slide's
//      speed: the launch is still moving faster than a sprint at the apex.
//   5. THE DIVE. Sprint, jump, and the button pressed IN THE AIR does not
//      crouch there - it is buffered, and the landing spends it as a slide.
//      Held or tapped, with the sprint key already released. A jump with no
//      run behind it is still the plain crouch toggle it always was.
//   6. Melee hits exactly one enemy per swing, lands on a delay rather than on
//      the button, draws no ring on the floor, and pays double for the kill.
//   7. Movement foley: footsteps in the posture's own kind, at the stride's
//      rate and in phase with the gun dip, push-off and landing voices for
//      the jumps, one voice per slide, silence over stairs - and the melee
//      split into a whoosh on the button and a crunch on the connect.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8219;
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
  browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const results = await page.evaluate(async () => {
    const THREE = await import('three');
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
    // ?autotest, because the Enemy class is only handed out there - and the
    // bot that comes with it has to be taken off the sticks first, or it
    // rewrites `input` under every measurement below.
    g.autoTest = false;
    const p = g.player;
    const out = [];
    const t = (name, cond, extra = '') => out.push([name, !!cond, String(extra)]);
    const step = () => new Promise((r) => requestAnimationFrame(r));
    // The spawner would otherwise walk something into the player halfway
    // through a measurement and change the numbers being measured.
    const clear = () => { g.queue.length = 0; g._clearEntities(); clearArena(); };
    const frames = async (n) => { for (let i = 0; i < n; i++) { clear(); await step(); } };
    const set = (o) => Object.assign(g.input, o);
    const rest = async () => {
      set({
        forward: false, back: false, left: false, right: false,
        sprint: false, shoot: false, aim: false, crouch: false, jump: false, melee: false,
      });
      p.crouching = false;
      p.sliding = false;
      p.slideT = 0;
      p._momW = 0;
      p.pos.set(0, 0, 0);
      p.moveVX = 0;
      p.moveVZ = 0;
      p.dashEnd = -1;
      p.yaw = 0;
      p.stamina = 100;
      p.staminaLocked = false;
      await frames(6);
    };

    g.beginGame();
    await frames(4);
    await rest();

    // ---- 1. the toggle ----------------------------------------------------
    set({ crouch: true });
    await frames(2);
    const downOnPress = p.crouching;
    set({ crouch: false });
    await frames(20);
    const heldWithoutButton = p.crouching;
    const eyeDown = p.eyeH;
    set({ crouch: true });
    await frames(2);
    set({ crouch: false });
    await frames(30);
    const upOnSecond = p.crouching;
    const eyeUp = p.eyeH;
    t('a press crouches', downOnPress === true);
    t('and it stays down when the button is let go', heldWithoutButton === true);
    t('a second press stands up', upOnSecond === false);
    t('the camera drops with the crouch and comes back',
      eyeDown < 1.2 && eyeUp > 1.65, eyeDown.toFixed(2) + ' -> ' + eyeUp.toFixed(2));

    // ---- 2. what crouching costs ------------------------------------------
    const travel = async (o, n = 30) => {
      await rest();
      set(o);
      await frames(n);
      const d = Math.hypot(p.pos.x, p.pos.z);
      const state = { sprinting: p.sprinting, sliding: p.sliding, crouching: p.crouching };
      return { d, ...state };
    };
    const walk = await travel({ forward: true });
    await rest();
    set({ crouch: true });
    await frames(2);
    set({ crouch: false, forward: true });
    await frames(30);
    const crouchWalk = Math.hypot(p.pos.x, p.pos.z);
    const crouchSprint = p.sprinting;
    t('crouching is slower than walking', crouchWalk < walk.d * 0.7,
      walk.d.toFixed(2) + ' -> ' + crouchWalk.toFixed(2));
    t('and it refuses the sprint', crouchSprint === false);

    // ---- 3. the slide ------------------------------------------------------
    const sprint = await travel({ forward: true, sprint: true });
    await rest();
    // Up to speed first: the slide is only offered to a player who is already
    // running, which is the whole rule that separates it from the crouch.
    set({ forward: true, sprint: true });
    await frames(20);
    const wasSprinting = p.sprinting;
    const stamBefore = p.stamina;
    // MEASURED IN THE SAME RUN rather than against the constant: a headless
    // frame is worth several of a real one, and the slide's envelope decays
    // with time - so anything sampled a fixed number of FRAMES later is
    // sampled at whatever point of the curve the machine happened to reach.
    const sprintSpeed = Math.hypot(p.vel.x, p.vel.z);
    set({ crouch: true });
    await frames(1);
    const slidStraightAway = p.sliding;
    const slideSpeed = Math.hypot(p.vel.x, p.vel.z);
    // RELEASED IMMEDIATELY. A slide is a committed move and must not care.
    set({ crouch: false });
    await frames(2);
    const stillSlidingAfterRelease = p.sliding;
    // The height is an EASE (see CROUCH_POSE_TIME), so it is sampled once the
    // player is properly down rather than on the frame the slide opened.
    await frames(5);
    const slideEye = p.eyeH;
    await frames(90);
    const endedOnItsOwn = p.sliding;
    const endedStanding = p.crouching;
    const stamAfter = p.stamina;
    t('a sprint plus the button slides', wasSprinting === true && slidStraightAway === true);
    t('and letting go does not end it', stillSlidingAfterRelease === true);
    t('a slide is faster than the sprint it came out of',
      slideSpeed > sprintSpeed * 1.05, slideSpeed.toFixed(2) + ' vs ' + sprintSpeed.toFixed(2));
    t('the camera is lower than a crouch', slideEye < 0.95, slideEye.toFixed(2));
    t('it ends on its own clock', endedOnItsOwn === false);
    t('and it ends STANDING, not crouched', endedStanding === false);
    t('a slide spends stamina', stamAfter < stamBefore - 20,
      stamBefore.toFixed(0) + ' -> ' + stamAfter.toFixed(0));
    t('a slide covers ground', sprint.d > walk.d, sprint.d.toFixed(2));

    // ---- 4. jumping out of one --------------------------------------------
    await rest();
    set({ forward: true, sprint: true });
    await frames(20);
    const sprintBeforeSlide = Math.hypot(p.vel.x, p.vel.z);
    set({ crouch: true });
    await frames(1);
    // Jumped out of the FIRST frames of the slide, and both samples are taken
    // either side of the launch - the envelope is still decaying, so a gap
    // between them would be measuring the decay rather than the momentum.
    set({ crouch: false, jump: true });
    await frames(1);
    const speedInSlide = Math.hypot(p.vel.x, p.vel.z);
    await frames(1);
    const leftTheFloor = !p.onGround;
    const slideEndedOnJump = p.sliding;
    await frames(6);
    const speedInAir = Math.hypot(p.vel.x, p.vel.z);
    set({ jump: false });
    await frames(40);
    await rest();
    t('a slide can be jumped out of', leftTheFloor === true && slideEndedOnJump === false);
    t('and the jump keeps the slide speed',
      speedInAir > speedInSlide * 0.98 && speedInAir > sprintBeforeSlide * 1.05,
      speedInSlide.toFixed(2) + ' -> ' + speedInAir.toFixed(2)
      + ' (sprint ' + sprintBeforeSlide.toFixed(2) + ')');

    // ---- 5. the dive: sprint, jump, crouch in the air, land sliding --------
    //
    // The move the crouch button could NOT do: in the air there is no floor to
    // slide along, so the press used to fall through to the toggle and the
    // player landed in a squat having asked for the opposite. It is buffered
    // now - see SLIDE_BUFFER in player.js.
    await rest();
    set({ forward: true, sprint: true });
    await frames(25);
    const ranAt = Math.hypot(p.vel.x, p.vel.z);
    const sprintingAtTakeoff = p.sprinting;
    set({ jump: true });
    await frames(2);
    // THE SPRINT KEY IS RELEASED ON THE WAY UP, which is what most players
    // actually do and what no live measurement of speed would survive: air
    // speed drops to the walk the instant it is let go. The takeoff is what
    // earns the slide, so the takeoff is what the player remembers.
    set({ jump: false, sprint: false });
    await frames(2);
    const airborne = !p.onGround;
    const runRemembered = p._groundRun;
    set({ crouch: true });
    await frames(2);
    const crouchedInAir = p.crouching;
    const buffered = p._slideBuf > 0;
    let landedAt = -1;
    for (let i = 0; i < 90 && !p.sliding; i++) {
      await frames(1);
      if (p.onGround && landedAt < 0) landedAt = i;
    }
    set({ crouch: false });
    const dived = p.sliding;
    const diveSpeed = Math.hypot(p.vel.x, p.vel.z);
    const crouchedOnLanding = p.crouching;
    for (let i = 0; i < 120 && p.sliding; i++) await frames(1);
    const diveEndedStanding = !p.sliding && !p.crouching;
    t('the run is on before the jump', sprintingAtTakeoff === true, ranAt.toFixed(2));
    t('and the takeoff is remembered in the air', airborne === true && runRemembered === true);
    t('the air press does NOT crouch in mid-air', crouchedInAir === false);
    t('it is buffered against the landing instead', buffered === true);
    t('and the landing turns it into a slide', dived === true, 'landed at frame ' + landedAt);
    t('a dive lands sliding, not crouched', crouchedOnLanding === false);
    t('the dive is faster than the sprint that fed it',
      diveSpeed > ranAt, ranAt.toFixed(2) + ' -> ' + diveSpeed.toFixed(2));
    t('and it ends standing like any other slide', diveEndedStanding === true);

    // A TAP rather than a hold: the buffer alone has to carry it across the
    // rest of the jump, which is the whole reason it is a second long.
    await rest();
    set({ forward: true, sprint: true });
    await frames(25);
    set({ jump: true });
    await frames(2);
    set({ jump: false, sprint: false });
    await frames(2);
    set({ crouch: true });
    await frames(1);
    set({ crouch: false });
    for (let i = 0; i < 90 && !p.sliding && !p.onGround; i++) await frames(1);
    await frames(2);
    const tapDived = p.sliding;
    for (let i = 0; i < 120 && p.sliding; i++) await frames(1);
    t('a TAP in the air lands as a slide too', tapDived === true);

    // AND THE MOVE THAT IS NOT A DIVE. A jump with no run behind it is still
    // an ordinary crouch toggle, in the air and on the ground, or every
    // hop-and-duck in the game would have quietly become a slide.
    await rest();
    set({ forward: true });
    await frames(10);
    set({ jump: true });
    await frames(2);
    set({ jump: false });
    await frames(2);
    set({ crouch: true });
    await frames(2);
    set({ crouch: false });
    const walkCrouchedInAir = p.crouching;
    const walkBuffered = p._slideBuf > 0;
    for (let i = 0; i < 90 && !p.onGround; i++) await frames(1);
    await frames(4);
    const walkLandedCrouched = p.crouching && !p.sliding;
    t('a walking jump still toggles the crouch in the air',
      walkCrouchedInAir === true && walkBuffered === false);
    t('and it lands crouched rather than sliding', walkLandedCrouched === true);
    await rest();

    // ---- 6. the swing ------------------------------------------------------
    // Three bodies stacked in front of the player, all inside the old arc.
    const Enemy = g.__EnemyForTest;
    const spawn3 = () => {
      clear();
      const made = [];
      for (const [x, z] of [[0, -2], [-1.4, -1.6], [1.4, -1.6]]) {
        const e = new Enemy('chaser', new THREE.Vector3(x, 0, z), 1, 1, 1);
        e.group.position.copy(e.pos);
        g.scene.add(e.group);
        g.enemies.push(e);
        made.push(e);
      }
      return made;
    };
    await rest();
    p.meleeCd = 0;
    let mob = spawn3();
    const hp0 = mob.map((e) => e.hp);
    const idlePose = p.gun.position.clone();
    // The frames() helper clears the arena, so the swing is stepped by hand.
    g.tryMelee();
    const armed = p.meleeAnim > 0;
    await step();
    const hurtOnTheButton = mob.filter((e, i) => e.hp < hp0[i]).length;
    const swungTo = p.gun.position.distanceTo(idlePose);
    for (let i = 0; i < 20; i++) await step();
    const hurt = mob.filter((e, i) => e.hp < hp0[i]).length;
    const backHome = p.gun.position.distanceTo(idlePose);
    t('the swing lands on a delay, not on the button', hurtOnTheButton === 0);
    t('and it hits exactly one enemy', hurt === 1, 'hit ' + hurt + ' of 3');
    t('the swing throws the gun out of its rest pose', armed && swungTo > 0.02,
      swungTo.toFixed(3));
    t('and puts it back', backHome < 0.02, backHome.toFixed(3));

    // No ring. The pool is shared, so this asserts the melee did not claim one.
    const ringsUp = () => g.effects.rings.filter((r) => r.life > 0).length;
    for (let i = 0; i < 40; i++) await step();
    clear();
    for (let i = 0; i < 40; i++) await step();
    const ringsBefore = ringsUp();
    p.meleeCd = 0;
    mob = spawn3();
    g.tryMelee();
    for (let i = 0; i < 20; i++) await step();
    t('no ring is drawn on the floor', ringsUp() === ringsBefore,
      ringsBefore + ' -> ' + ringsUp());

    // ---- and what a melee kill is worth -----------------------------------
    // Measured at the DROP, not at the balance: the money leaves the body as
    // orbs and only reaches `credits` once they are walked over, so reading
    // g.credits here would be timing the magnet rather than the payout.
    const kill = async (melee) => {
      clear();
      for (let i = 0; i < 30; i++) await step();
      await rest();
      g.comboKills = 0;
      g.comboTimer = 0;
      p.meleeCd = 0;
      let paid = 0;
      const real = g._dropMoney.bind(g);
      g._dropMoney = (pos, amount) => { paid += amount; };
      const e = new Enemy('chaser', new THREE.Vector3(0, 0, -2), 1, 1, 1);
      e.group.position.copy(e.pos);
      g.scene.add(e.group);
      g.enemies.push(e);
      if (melee) {
        e.hp = 1;
        g.tryMelee();
        for (let i = 0; i < 30; i++) await step();
      } else {
        e.hp = 1;
        e.takeDamage(50);
        for (let i = 0; i < 6; i++) await step();
      }
      g._dropMoney = real;
      return paid;
    };
    const shot = await kill(false);
    const swung = await kill(true);
    t('a shot kill pays what the body is worth', shot > 0, String(shot));
    t('a melee kill pays double', Math.abs(swung - shot * 2) < 1e-6,
      swung + ' vs ' + shot * 2);

    // ---- 7. movement foley --------------------------------------------------
    // Spies on the five movement voices (plus the air jump's new one), then
    // walks, sprints, crouches, jumps, lands and slides across the same bare
    // floor. The spies replace the recipes, not the flags - the whole one-shot
    // path through PLAYER_FX is what is being exercised.
    const sfxCalls = { step: [], stepPhase: [], jump: 0, airJump: 0, land: [], slide: 0, swing: 0, crunch: 0 };
    g.sfx.step = (k) => { sfxCalls.step.push(k); sfxCalls.stepPhase.push(g.player._bobPhase); };
    g.sfx.meleeSwing = () => sfxCalls.swing++;
    g.sfx.meleeHit = () => sfxCalls.crunch++;
    g.sfx.jump = () => sfxCalls.jump++;
    g.sfx.airJump = () => sfxCalls.airJump++;
    g.sfx.land = (s) => sfxCalls.land.push(s);
    g.sfx.slide = () => sfxCalls.slide++;
    const foleyRest = async () => {
      await rest();
      sfxCalls.step.length = 0;
      sfxCalls.stepPhase.length = 0;
      sfxCalls.jump = 0;
      sfxCalls.airJump = 0;
      sfxCalls.land.length = 0;
      sfxCalls.slide = 0;
    };

    // Walk: walk steps only, at the stride's own cadence.
    await foleyRest();
    set({ forward: true });
    await frames(90);
    const walkSteps = sfxCalls.step.slice();
    const walkPhases = sfxCalls.stepPhase.slice(0, walkSteps.length);
    t('walking plays walk footsteps',
      walkSteps.length >= 3 && walkSteps.every((k) => k === 'walk'),
      walkSteps.length + ' steps');
    // IN SYNC WITH THE GUN. The dip bottoms out at PI/2 and 3PI/2 and tops
    // out at 0 and PI, so a step the stride actually placed sits nearer a
    // minimum than a maximum - and a step fired off a drifting accumulator
    // would sit nearer neither. Compared as means rather than maxima, so one
    // long headless frame cannot fail it.
    const circ = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const meanTo = (refs) => walkPhases.reduce(
      (s, p) => s + Math.min(...refs.map((r) => circ(p, r))), 0) / walkPhases.length;
    t('footsteps land with the dip, not against it',
      meanTo([Math.PI / 2, 3 * Math.PI / 2]) < meanTo([0, Math.PI]),
      'dip ' + meanTo([Math.PI / 2, 3 * Math.PI / 2]).toFixed(2)
      + ' vs top ' + meanTo([0, Math.PI]).toFixed(2));

    // Sprint: sprint steps, and more of them over the same frames. Stamina is
    // topped up throughout: ninety slow headless frames outlast the bar, and
    // the run dropping to a walk halfway would be measuring the bar rather
    // than the boots.
    await foleyRest();
    set({ forward: true, sprint: true });
    for (let i = 0; i < 90; i++) { await frames(1); p.stamina = 100; }
    const runSteps = sfxCalls.step.slice();
    t('sprinting plays sprint footsteps',
      runSteps.length >= 3 && runSteps.every((k) => k === 'sprint'),
      runSteps.length + ' steps');
    t('a sprint steps faster than a walk',
      runSteps.length > walkSteps.length,
      walkSteps.length + ' -> ' + runSteps.length);

    // Crouched: the soft kind, at the slow gear's rate.
    await foleyRest();
    set({ crouch: true });
    await frames(2);
    set({ crouch: false, forward: true });
    await frames(90);
    const crouchSteps = sfxCalls.step.slice();
    t('crouching plays crouch footsteps',
      crouchSteps.length >= 1 && crouchSteps.every((k) => k === 'crouch'),
      crouchSteps.length + ' steps');

    // Ground jump and the landing that follows it - a pure hop, so the
    // strength below is the strength of one jump and nothing else.
    await foleyRest();
    set({ jump: true });
    await frames(2);
    set({ jump: false });
    const tookOff = sfxCalls.jump;
    for (let i = 0; i < 120 && (!p.onGround || p.pos.y > 0.01); i++) await frames(1);
    await frames(3);
    t('a ground jump sounds the push-off', tookOff >= 1, String(tookOff));
    t('and the landing lands once', sfxCalls.land.length === 1,
      sfxCalls.land.length + ' landings');
    t('with a strength inside 0..1',
      sfxCalls.land.every((s) => s >= 0.15 && s <= 1),
      sfxCalls.land.map((s) => s.toFixed(2)).join(','));
    const hopStrength = sfxCalls.land[0];

    // The air jump keeps its own voice, on a fresh flight.
    await foleyRest();
    set({ jump: true });
    await frames(2);
    set({ jump: false });
    await frames(4);
    // The air charge granted directly: Double Jump owns the economy, this
    // only needs the voice the flag pays for.
    p.jumpsLeft = 1;
    set({ jump: true });
    await frames(2);
    const aired = sfxCalls.airJump;
    set({ jump: false });
    for (let i = 0; i < 120 && (!p.onGround || p.pos.y > 0.01); i++) await frames(1);
    await frames(3);
    t('an air jump keeps its own voice', aired === 1, String(aired));

    // A long fall lands harder than the hop - the strength is the drop, so
    // the same jump sounds the same on any machine.
    await foleyRest();
    p.pos.set(0, 4, 0);
    p.vel.set(0, 0, 0);
    for (let i = 0; i < 120 && (!p.onGround || p.pos.y > 0.01); i++) await frames(1);
    await frames(3);
    t('a long fall lands harder than a hop',
      sfxCalls.land.length === 1 && sfxCalls.land[0] > hopStrength + 0.2,
      hopStrength.toFixed(2) + ' -> ' + sfxCalls.land.map((s) => s.toFixed(2)).join(','));

    // Slide: one voice for the whole move, and no footsteps inside it.
    await foleyRest();
    set({ forward: true, sprint: true });
    await frames(25);
    set({ crouch: true });
    await frames(1);
    set({ crouch: false });
    const slidOpen = p.sliding && sfxCalls.slide === 1;
    let stepsDuringSlide = 0;
    for (let i = 0; i < 120 && p.sliding; i++) {
      const before = sfxCalls.step.length;
      await frames(1);
      if (p.sliding) stepsDuringSlide += sfxCalls.step.length - before;
    }
    t('a slide plays its voice once',
      slidOpen && sfxCalls.slide === 1, String(sfxCalls.slide));
    t('and no footsteps play inside it', stepsDuringSlide === 0,
      String(stepsDuringSlide));

    // Stairs: a half-metre kerb stepped up and off in silence. Stepped by
    // hand - the frames() helper clears the arena, kerb included.
    await foleyRest();
    const kerb = { min: { x: -2, y: 0, z: -4 }, max: { x: 2, y: 0.5, z: -2 } };
    g.arena.obstacles.push(kerb);
    set({ forward: true });
    let maxY = 0;
    for (let i = 0; i < 120; i++) {
      await step();
      maxY = Math.max(maxY, p.pos.y);
    }
    set({ forward: false });
    const crossed = Math.abs(p.pos.z) > 3;
    const steppedOff = Math.abs(p.pos.y) < 0.05;
    g.arena.obstacles.pop();
    t('a kerb is stepped up without a landing',
      maxY > 0.4 && sfxCalls.land.length === 0,
      'maxY ' + maxY.toFixed(2) + ', landings ' + sfxCalls.land.length);
    t('and stepped off in silence too',
      crossed && steppedOff && sfxCalls.land.length === 0,
      'z ' + p.pos.z.toFixed(2) + ' y ' + p.pos.y.toFixed(2));

    // The melee, in two halves. A whiff is the whoosh and nothing after it;
    // a connect lands the crunch on the strike's delay, not on the button.
    // Stepped by hand - frames() would clear the victim.
    await foleyRest();
    p.meleeCd = 0;
    g.tryMelee();
    await frames(20);
    t('a swing sounds the whoosh on the button', sfxCalls.swing === 1,
      String(sfxCalls.swing));
    t('and a miss stays silent after it', sfxCalls.crunch === 0,
      String(sfxCalls.crunch));
    sfxCalls.swing = 0;
    sfxCalls.crunch = 0;
    p.meleeCd = 0;
    clear();
    const victim = new Enemy('chaser', new THREE.Vector3(0, 0, -2), 1, 1, 1);
    victim.group.position.copy(victim.pos);
    g.scene.add(victim.group);
    g.enemies.push(victim);
    g.tryMelee();
    for (let i = 0; i < 30; i++) await step();
    t('a connect lands the crunch with the strike',
      sfxCalls.swing === 1 && sfxCalls.crunch === 1,
      'swing ' + sfxCalls.swing + ' crunch ' + sfxCalls.crunch);

    clear();
    return out;
  });

  for (const [name, cond, extra] of results) ok(name, cond, extra);

  // The bindings themselves, through real keys rather than through `input`.
  for (const key of ['KeyC', 'ControlLeft']) {
    await page.keyboard.down(key);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 60)));
    const down = await page.evaluate(() => window.__game.input.crouch);
    await page.keyboard.up(key);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 60)));
    const up = await page.evaluate(() => window.__game.input.crouch);
    ok(key + ' is a crouch key', down === true && up === false);
  }

  console.log('CONSOLE ERRORS', JSON.stringify(errors));
  ok('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  console.error(err);
  fails++;
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(fails ? `CROUCH TEST FAIL (${fails})` : 'CROUCH TEST PASS');
process.exit(fails ? 1 : 0);
