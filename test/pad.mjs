// Focused check of DUALSENSE SUPPORT, driven through a synthetic gamepad.
//
// WHAT THIS EXISTS FOR
//   The controller path cannot be tested by calling methods: nearly all of it
//   is about the seam between a polled device and a game that was written for
//   a keyboard. So the pad here is a fake object behind navigator.getGamepads,
//   the game is loaded with ?padtest (which hands out the handle and NOTHING
//   else - no bot writing `input` underneath the measurement), and every
//   assertion below is made by pressing a button and looking at what the game
//   did with it.
//
// WHAT IS ASSERTED
//    1. A DualSense is recognised and anything else is ignored outright.
//    2. Touching the pad takes the interface over; the prompts and the control
//       sheet change with it.
//    3. CROSS on the start screen starts the run, and the same held press does
//       not also read as a jump on the next frame.
//    4. The left stick is ANALOGUE - half a push is half the distance.
//    5. The right stick turns the view, and L2 raises the gun - which zooms,
//       tightens the cone and turns the view at its own sensitivity.
//    6. R2 fires, R3 melees, SQUARE reloads, the TOUCH PAD holds the build
//       sheet, and R1 fires the active item.
//    7. OPTIONS pauses and un-pauses; the D-pad walks the menu, and a
//       settings row spends left/right on its own value rather than on moving
//       the selection. EXIT asks before it exits, the question backs out under
//       CIRCLE like any other sub-screen, and confirming it leaves the run and
//       the fight behind on the main screen.
//    8. Aim assist works inside its cone and not outside it, and its pull
//       closes an error rather than opening one.
//    9. Vibration reaches the actuator, and stops when it is turned off.
//   10. A pad unplugged mid-run pauses instead of leaving the player standing.
//   11. CREATE opens the debug panel, which parks the run and dims the beam
//       like every other screen with small caps to read. Its theme row pins
//       the schedule - the two-click path to any theme at any wave that the
//       one-at-a-time roster makes necessary - and its SEARCH box narrows
//       both item grids to the cards matching the query and drops a section
//       that came up empty.
//   12. THE BUTTONS ARE REBINDABLE. The settings screen grows a CONTROLLER
//       BINDINGS block in pad mode (and hides the keyboard's), a press on a
//       listening row becomes the binding - swapping with whichever action
//       owned the button - and the rebinding reaches the field, the prompt
//       and the start screen's sheet. CROSS/CIRCLE/OPTIONS cancel a capture
//       rather than binding, DEFAULTS puts the shipped layout back, and the
//       save is real: a fresh table reads it.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8212;
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
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  // THE FAKE PAD. Installed before any of the game's modules run, because
  // pad.js reads navigator.getGamepads on its very first frame.
  await page.evaluateOnNewDocument(() => {
    const pad = {
      id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })),
      // Counted rather than performed: the assertion is that the game asks for
      // vibration at the right moments, which is all a browser can be held to.
      vibrationActuator: {
        effects: [],
        playEffect(type, params) {
          this.effects.push({ type, ...params });
          return Promise.resolve('complete');
        },
        reset() {
          this.resets = (this.resets || 0) + 1;
          return Promise.resolve('complete');
        },
      },
    };
    window.__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => (pad.connected ? [pad] : [null]),
    });
  });

  await page.goto(`http://127.0.0.1:${PORT}/?padtest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.pad', { timeout: 30000 });

  const results = await page.evaluate(async () => {
    const g = window.__game;
    const pad = window.__pad;
    const out = [];
    const t = (name, cond, extra = '') => out.push([name, !!cond, String(extra)]);
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const frames = async (n) => { for (let i = 0; i < n; i++) await step(); };
    const B = {
      CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3, L1: 4, R1: 5, L2: 6, R2: 7,
      OPTIONS: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
      TOUCHPAD: 17, CREATE: 8,
    };
    const set = (i, on) => {
      pad.buttons[i].pressed = on;
      pad.buttons[i].value = on ? 1 : 0;
    };
    const tap = async (i, hold = 2) => {
      set(i, true);
      await frames(hold);
      set(i, false);
      await frames(2);
    };
    const stick = (a, b, c, d) => { pad.axes = [a, b, c, d]; };
    // The arena keeps spawning underneath every trial below, and an enemy that
    // walks into the player changes the very numbers being measured.
    const clearField = () => {
      g.queue.length = 0;
      g._pendingSpawns.length = 0;
      g._clearEntities();
    };

    // ---- 1. detection and the hand-over -----------------------------------
    t('starts on keyboard', g.inputMode === 'kbm', g.inputMode);
    t('keyboard control sheet', document.querySelectorAll('.controls .ctl').length === 15
      && !document.querySelector('.controls').classList.contains('pad'));
    // The rows appear when a pad is PLUGGED IN. The interface only changes
    // when one is picked up, which is the next test down.
    t('settings unlocked by connection', document.body.classList.contains('pad-seen'));
    t('interface still on keyboard', !document.body.classList.contains('pad-mode'));

    // CROSS on the start screen: one press has to both take the interface over
    // and press the button the selection is sitting on.
    set(B.CROSS, true);
    await frames(2);
    t('pad takes over', g.inputMode === 'pad', g.inputMode);
    t('pad-mode class', document.body.classList.contains('pad-mode'));
    t('pad-seen class', document.body.classList.contains('pad-seen'));
    t('controller sheet swapped', document.querySelectorAll('.controls.pad .ctl').length === 15);
    t('prompts name buttons', g._useLead().includes('pad-cap'), g._useLead());
    t('cross started the run', g.state === 'playing', g.state);
    // The press is still physically down. It must not also have been read as a
    // jump on the frame after the menu spent it.
    await frames(2);
    t('start press not reused as jump', g.input.jump === false);
    set(B.CROSS, false);
    await frames(2);
    t('no pointer lock in pad mode', document.pointerLockElement === null);

    // Triangle is the real rebindable Use path into a Donation Machine. Raise
    // only that bank and stand inside the ammo cabinet's radius so this proves
    // the controller poll, action table and shared resolver all reach the
    // same one-donation payment as keyboard Use.
    const donation = g.donationMachines.byKind.ammo;
    g.donationMachines.present(g.player);
    for (const m of g.donationMachines.machines) {
      m.state = 'up';
      m.rise = 1;
      m.group.visible = true;
    }
    g.player.pos.set(donation.pos.x - 1.5, 0, donation.pos.z);
    g.player.reserveAmmo = 60;
    await tap(B.TRIANGLE);
    t('triangle performs one ammo donation',
      g.player.donationProgress.ammo === 1 && g.player.reserveAmmo === 30,
      `progress=${g.player.donationProgress.ammo} reserve=${g.player.reserveAmmo}`);
    g.donationMachines.dismiss();

    // ---- 2. analogue movement ---------------------------------------------
    // Same push, twice: once at full deflection and once at half, measured as
    // a SPEED over a window of GAME TIME. Never a distance over a frame
    // count: walking has no acceleration (the stick writes the velocity
    // outright each frame), so a frame-counted trial measures the frame rate
    // as much as the stick - on a loaded shard the dt clamp hands one frame
    // three times the simulation of another, and this comparison once read a
    // half-tilt walk as FARTHER than a full-tilt one for exactly that reason.
    const walk = async (tilt) => {
      clearField();
      g.player.pos.set(0, 0, 0);
      g.player.yaw = 0;
      g.player.moveVX = 0;
      g.player.moveVZ = 0;
      stick(0, -tilt, 0, 0);
      // Half a second is what the old 30-frame window amounted to on a
      // healthy host; the frame ceiling is only a backstop against a dead
      // clock. Dividing by the time the clock actually delivered cancels the
      // window's ragged last frame against the distance it bought.
      const t0 = g.time;
      for (let i = 0; i < 600 && g.time - t0 < 0.5; i++) { clearField(); await step(); }
      const d = Math.hypot(g.player.pos.x, g.player.pos.z) / (g.time - t0);
      stick(0, 0, 0, 0);
      await frames(4);
      return d;
    };
    const full = await walk(1);
    const half = await walk(0.5);
    // A SPEED now (m/s), so the gate is against BASE_SPEED's 10 rather than a
    // distance.
    t('left stick moves the player', full > 6, full.toFixed(2));
    // Half a stick is not half a keyboard - the deadzone eats the first fifth
    // of the travel - so this is a band, not a number.
    const ratio = half / full;
    t('movement is analogue', ratio > 0.2 && ratio < 0.75, 'ratio ' + ratio.toFixed(2));

    // ---- 3. the right stick, and L2 ---------------------------------------
    const turn = async (aim) => {
      g.player.yaw = 0;
      set(B.L2, aim);
      // Held long enough for the raise to finish before the rate is measured,
      // then the measurement itself.
      if (aim) await frames(20);
      g.player.yaw = 0;
      stick(0, 0, 1, 0);
      // The stick drives a RATE (see _padLook), so a rate is what is
      // measured: a third of a second of game time - the 20 frames a healthy
      // host gave this window - and the answer divided by whatever the clock
      // actually delivered. Two frame-counted windows divided by each other
      // compare the frame rates underneath them, not the sensitivities.
      const t0 = g.time;
      for (let i = 0; i < 400 && g.time - t0 < 1 / 3; i++) await step();
      stick(0, 0, 0, 0);
      const turned = Math.abs(g.player.yaw) / (g.time - t0);
      set(B.L2, false);
      await frames(20);
      return turned;
    };
    const open = await turn(false);
    const aimed = await turn(true);
    // A RATE now (rad/s); the old 0.4 over a third of a second is 1.2.
    t('right stick turns the view', open > 1.2, open.toFixed(2));
    t('aiming turns slower', aimed < open * 0.85, aimed.toFixed(2) + ' vs ' + open.toFixed(2));

    // ---- 3b. the sights ----------------------------------------------------
    const hipFov = g.camera.fov;
    const hipSpread = g._shotSpread();
    const hipGunX = g.player.gun.position.x;
    set(B.L2, true);
    await frames(20);
    const aimFov = g.camera.fov;
    const aimSpread = g._shotSpread();
    const aimGunX = g.player.gun.position.x;
    const aimT = g.player.aimT;
    set(B.L2, false);
    await frames(20);
    t('L2 raises the gun', aimT > 0.99, aimT.toFixed(3));
    t('aiming zooms in', aimFov < hipFov - 15, hipFov + ' -> ' + aimFov.toFixed(1));
    t('aiming tightens the cone', aimSpread < hipSpread * 0.2,
      hipSpread.toFixed(4) + ' -> ' + aimSpread.toFixed(4));
    t('the gun centres', Math.abs(aimGunX) < 0.01 && hipGunX > 0.2,
      hipGunX.toFixed(2) + ' -> ' + aimGunX.toFixed(2));
    t('lowering restores the hip pose',
      g.player.aimT === 0 && g.camera.fov === hipFov
      && Math.abs(g.player.gun.position.x - hipGunX) < 0.001);

    // Inverted look flips the pitch and nothing else.
    g.player.pitch = 0;
    stick(0, 0, 0, -1);
    await frames(10);
    const upPitch = g.player.pitch;
    g._invertLook = true;
    g.player.pitch = 0;
    await frames(10);
    const invPitch = g.player.pitch;
    g._invertLook = false;
    stick(0, 0, 0, 0);
    await frames(2);
    t('stick up looks up', upPitch > 0.1, upPitch.toFixed(2));
    t('invert look flips pitch', invPitch < -0.1, invPitch.toFixed(2));

    // ---- 4. the action buttons --------------------------------------------
    clearField();
    const shotsBefore = g.stats.shotsFired;
    pad.vibrationActuator.effects.length = 0;
    set(B.R2, true);
    await frames(20);
    set(B.R2, false);
    await frames(2);
    t('R2 fires', g.stats.shotsFired > shotsBefore, String(g.stats.shotsFired - shotsBefore));
    t('firing rumbles', pad.vibrationActuator.effects.length > 0,
      String(pad.vibrationActuator.effects.length));

    set(B.R3, true);
    await frames(2);
    const meleeHeld = g.input.melee;
    set(B.R3, false);
    await frames(2);
    t('R3 melees', meleeHeld === true && g.input.melee === false);

    g.player.mag = 1;
    await tap(B.SQUARE);
    t('square reloads', g.player.reloading > 0, g.player.reloading.toFixed(2));

    // THE BUILD SHEET IS ON THE TOUCH PAD. It moved off Triangle when Triangle
    // became TAKE, and it is held rather than toggled - the arena keeps running
    // underneath it either way.
    set(B.TOUCHPAD, true);
    await frames(3);
    const statsUp = g._statsHeld;
    set(B.TOUCHPAD, false);
    await frames(3);
    t('the touch pad holds the build sheet', statsUp === true && g._statsHeld === false);
    // ...and Triangle, which used to, must not any more - it takes things now,
    // and a face button that did both would open the sheet on every pickup.
    set(B.TRIANGLE, true);
    await frames(3);
    const statsOnTriangle = g._statsHeld;
    set(B.TRIANGLE, false);
    await frames(3);
    t('triangle no longer opens it', statsOnTriangle === false);

    // L3 LATCHES. One click starts the run and the player keeps running until
    // something stops them - here, letting go of the stick.
    clearField();
    g.player.stamina = 100;
    g.player.staminaLocked = false;
    stick(0, 1, 0, 0);
    await frames(4);
    await tap(B.L3);
    await frames(4);
    const latched = g.player.sprinting;
    // The click is long released; the run has to still be going.
    const stillRunning = g.player.sprinting;
    stick(0, 0, 0, 0);
    await frames(6);
    const stoppedWithTheStick = g.player.sprinting;
    // And it must not resume on its own when the player moves again.
    stick(0, 1, 0, 0);
    await frames(6);
    const notResumed = g.player.sprinting;
    // A second click while running puts it away.
    await tap(B.L3);
    await frames(4);
    const runningAgain = g.player.sprinting;
    await tap(B.L3);
    await frames(4);
    const clickedOff = g.player.sprinting;
    stick(0, 0, 0, 0);
    await frames(4);
    t('L3 latches the sprint on', latched === true && stillRunning === true);
    t('standing still ends the run', stoppedWithTheStick === false);
    t('and it does not resume on its own', notResumed === false);
    t('a second click stops it', runningAgain === true && clickedOff === false);

    // R1 FIRES THE ACTIVE ITEM - the shoulder over the trigger finger, which is
    // where a button pressed mid-firefight has to be. It must not fire an item
    // that is not charged, and an empty slot must be harmless.
    g.player.activeItem = null;
    g.player.activeItemCharge = 0;
    await tap(B.R1);
    t('R1 with an empty slot does nothing', g.player.activeItem === null);

    g.player.giveActiveItem('itemDash');
    g.player.dashEnd = -1;
    await tap(B.R1);
    // NOT `activeItemCharge === 0`: the press spends the charge and the very next
    // frame starts refilling it, so by the time tap() has released the button
    // the bar is already a tenth of a second up. What firing means is that the
    // effect landed and the item is no longer ready.
    t('R1 fires the active item',
      !g.player.activeItemReady && g.player.dashEnd > g.time, String(g.player.activeItemCharge));

    // ...and a second press, on an empty bar, spends nothing.
    g.player.dashEnd = -1;
    await tap(B.R1);
    t('R1 on an empty bar spends nothing', g.player.dashEnd < g.time);

    // AND THE PROMPT NAMES THE BUTTON THAT ACTUALLY TAKES THINGS. This is the
    // regression that prompted the rebind: TAKE sat on R1 while the prompt said
    // CIRCLE, so the one button the prompt named was the crouch. The lead is
    // built in one place for exactly this reason, and this reads it.
    const lead = g._useLead();
    t('the take prompt names triangle',
      lead.includes('g-triangle') && !lead.includes('g-circle'), lead);

    // ---- 5. aim assist -----------------------------------------------------
    clearField();
    // THE ARENA IS TAKEN OUT OF THE WAY, not just the player pinned.
    //
    // Every check below measures an ANGLE and a RANGE, but _assistTarget also
    // runs a line-of-sight test against the arena's cover - and the layout is
    // generated fresh every wave, so whether a crate happens to stand on the
    // 14m line being measured is a property of which wave the bot reached.
    // That is why this trial failed on a loaded machine and passed on an idle
    // one with the same build: the run got further, the layout was different,
    // and 'assist finds a target in the cone' found a pillar instead.
    //
    // Line of sight is not what these three assertions are for, and pinning
    // the player - which they already did - only fixed one end of the line.
    const arenaCover = g.arena.obstacles;
    g.arena.obstacles = [];
    g.player.pos.set(0, 0, 0);
    g.player.yaw = 0;
    g.player.pitch = 0;
    // The dash fired two checks ago is still in flight, and it would carry the
    // player out from under every angle measured below.
    g.player.dashEnd = -1;
    g.player.moveVX = 0;
    g.player.moveVZ = 0;
    g.spawnEnemy('chaser');
    const e = g.enemies[g.enemies.length - 1];
    // AND IT IS NAILED DOWN. place() below re-pins the enemy at the top of
    // every test iteration, but the game's own frame runs AFTER that - so a
    // chaser doing what a chaser does walked out from under the angle being
    // measured, and the magnetism trial was pulling toward wherever it had got
    // to rather than toward the 5 degrees it was set at. It closed the gap or
    // it did not depending on how many frames the host managed, which is the
    // same defect as every wall-clock wait in this suite, wearing a hat.
    e.speed = 0;
    // Placed RELATIVE TO THE PLAYER and re-placed every frame: what is being
    // measured is an angle, and an enemy pinned to the world would drift out
    // of the cone the moment the player moved a metre.
    const place = (deg, dist) => {
      const a = (deg * Math.PI) / 180;
      e.pos.set(
        g.player.pos.x + Math.sin(a) * dist, 0, g.player.pos.z - Math.cos(a) * dist
      );
      e.group.position.copy(e.pos);
      e.group.updateMatrixWorld(true);
    };
    place(5, 14);
    const near = g._assistTarget();
    t('assist finds a target in the cone', !!near, near ? near.t.toFixed(2) : 'null');
    place(30, 14);
    t('assist ignores a target outside it', g._assistTarget() === null);
    place(5, 200);
    t('assist ignores a distant target', g._assistTarget() === null);

    // THE PULL, measured on its own. The stick being pushed is the LEFT one -
    // the player is running, not looking - so the only thing in the game that
    // can move the view during this trial is magnetism. Assist off is
    // therefore the control: the view must not move at all.
    let seen = 0;
    const closeIn = async (assist) => {
      g._aimAssist = assist;
      g.player.yaw = 0;
      g.player.pitch = 0;
      seen = 0;
      stick(0.6, 0, 0, 0);
      for (let i = 0; i < 40; i++) {
        // Pinned. The player is walking, which is the whole point - but where
        // they walk TO decides what is between them and the target, and a
        // trial whose line of sight depends on which crate they wandered
        // behind measures the arena rather than the assist.
        g.player.pos.set(0, 0, 0);
        place(5, 14);
        if (g._assistTarget()) seen++;
        await step();
      }
      stick(0, 0, 0, 0);
      await frames(2);
      return Math.abs((5 * Math.PI) / 180 + g.player.yaw);
    };
    const start = (5 * Math.PI) / 180;
    const withOff = await closeIn(false);
    const withOn = await closeIn(true);
    g._aimAssist = true;
    g.arena.obstacles = arenaCover;
    t('assist off never moves the view', Math.abs(withOff - start) < 1e-6,
      withOff.toFixed(4));
    t('magnetism closes the gap', withOn < withOff * 0.95,
      withOn.toFixed(4) + ' vs ' + withOff.toFixed(4) + ' seen ' + seen);
    clearField();

    // ---- 6. pausing and the menus -----------------------------------------
    await tap(B.OPTIONS);
    t('options pauses', g.state === 'paused', g.state);
    t('menu takes a selection', !!g.menu.el, g.menu.el ? g.menu.el.id : 'none');
    const first = g.menu.el;
    pad.axes = [0, 0, 0, 0];
    set(B.DOWN, true);
    await frames(2);
    set(B.DOWN, false);
    await frames(2);
    t('d-pad moves the selection', g.menu.el !== first,
      (first && first.id) + ' -> ' + (g.menu.el && g.menu.el.id));
    // CIRCLE is BACK, and on the pause screen back is the game.
    await tap(B.CIRCLE);
    t('circle resumes', g.state === 'playing', g.state);

    // SETTINGS is reachable and its steppers step, which is the one control on
    // any of these screens that is not a plain button.
    await tap(B.OPTIONS);
    g._openSettings();
    await frames(2);
    // THE ROWS, WALKED WITH THE PAD. A stepper is one stop, not two keys, and
    // left/right on it moves the VALUE - the bug this replaced was a selection
    // that walked from the minus key to the plus key and changed nothing.
    g.menu.focus(document.getElementById('sens-pips').closest('.stepper'));
    const startSens = g._padSens;
    set(B.RIGHT, true);
    await frames(2);
    set(B.RIGHT, false);
    await frames(2);
    const afterRight = g._padSens;
    const stayedOnRow = g.menu.el === document.getElementById('sens-pips').closest('.stepper');
    set(B.LEFT, true);
    await frames(2);
    set(B.LEFT, false);
    await frames(2);
    t('right steps a settings row up', afterRight === startSens + 1,
      startSens + ' -> ' + afterRight);
    t('the selection stays on the row', stayedOnRow === true,
      g.menu.el && g.menu.el.className);
    t('left steps it back down', g._padSens === startSens, String(g._padSens));
    // Down from a stepper must land on the next ROW, not on the other key of
    // the one it is leaving.
    set(B.DOWN, true);
    await frames(2);
    set(B.DOWN, false);
    await frames(2);
    t('down leaves the row', g.menu.el !== document.getElementById('sens-pips').closest('.stepper')
      && !!g.menu.el, g.menu.el && (g.menu.el.id || g.menu.el.className));

    const sens = g._padSens;
    g._stepSens(g._sensDial, 1);
    t('sensitivity steps', g._padSens === Math.min(8, sens + 1), String(g._padSens));
    const aimSens = g._padAimSens;
    g._stepSens(g._aimSensDial, -1);
    t('aim sensitivity is its own dial',
      g._padAimSens === Math.max(1, aimSens - 1) && g._padSens === Math.min(8, sens + 1),
      g._padSens + ' / ' + g._padAimSens);
    t('sensitivity changes the turn rate', g._sensMult() > 0.4 && g._sensMult() <= 2,
      g._sensMult().toFixed(2));
    g._closeSubScreen();
    await frames(2);

    // ---- 6a. the buttons are rebindable ------------------------------------
    //
    // The pad half of the binding table, driven the way a player drives it:
    // the settings screen, a row clicked open, a button pressed. The press
    // goes through the synthetic pad's poll, so what is being measured is
    // the whole path - hardware index to table to game - with nothing
    // short-circuited.
    g._openSettings();
    await frames(2);
    // THE BLOCKS SWAP WITH THE HANDS. The pad player sees the pad rows, the
    // keyboard rows are gone, and the note says what cancels.
    t('pad mode shows the pad rows',
      document.getElementById('pbind-jump') && document.getElementById('pbind-jump').offsetParent !== null,
      '');
    t('and hides the keyboard rows',
      document.getElementById('bind-forward').offsetParent === null, '');
    // THE CAPS ARE DRAWN, not spelled: a face button is its glyph, which is
    // the one thing a player holding a PlayStation pad reads before the
    // word. JUMP defaults to CROSS.
    const jumpCap = document.querySelector('#pbind-jump .bind-btn');
    t('the default caps are glyphs',
      !!jumpCap.querySelector('.g-cross'), jumpCap.innerHTML);
    // The shipped defaults, off the table: JUMP cross / TAKE triangle.
    t('the shipped pad table is the default',
      g.keys.padBtn('jump') === 'cross' && g.keys.padBtn('use') === 'triangle',
      g.keys.padBtn('jump') + ' / ' + g.keys.padBtn('use'));

    // A REBIND, the whole path: click the JUMP row, press SQUARE. Square was
    // RELOAD's, so the two swap - the pad's one-button-per-action rule - and
    // the field obeys the next frame.
    const pRow = document.querySelector('#pbind-jump .bind-btn');
    pRow.click();
    await frames(1);
    const listeningPad = pRow.classList.contains('listening')
      && pRow.textContent === 'PRESS A BUTTON';
    set(B.SQUARE, true);
    await frames(2);
    const squareBound = g.keys.padBtn('jump') === 'square';
    const reloadTook = g.keys.padBtn('reload') === 'cross';
    const capSwapped = jumpCap.querySelector('.g-square') !== null
      && document.querySelector('#pbind-reload .bind-btn').querySelector('.g-cross') !== null;
    const closed = !pRow.classList.contains('listening');
    set(B.SQUARE, false);
    await frames(2);
    t('the pad row says PRESS A BUTTON while it waits', listeningPad === true);
    t('square binds jump', squareBound === true, g.keys.padBtn('jump'));
    t('the swap hands reload the cross it displaced', reloadTook === true,
      g.keys.padBtn('reload'));
    t('both caps follow the swap', capSwapped === true);
    t('the capture closes on the bind', closed === true);

    // THE FIELD OBEYS. Square is jump now and cross is reload; a held square
    // reads as a held jump, and a press of cross starts a reload. Needs the
    // arena live - the settings screen is up and the run is paused under it,
    // and every action method refuses a state that is not 'playing'.
    g._closeSubScreen();
    await frames(2);
    g.state = 'playing';
    clearField();
    g.player.mag = 2;
    set(B.SQUARE, true);
    await frames(2);
    const squareJumps = g.input.jump === true;
    set(B.SQUARE, false);
    await frames(2);
    await tap(B.CROSS);
    const crossReloads = g.player.reloading > 0;
    t('square is jump in the field', squareJumps === true);
    t('cross is reload after the swap', crossReloads === true,
      g.player.reloading.toFixed(2));

    // BACK TO THE SETTINGS SCREEN for the cancel and save trials - the rows
    // only exist there, and the mode is still the pad's. The run is PAUSED
    // first: the capture is read by _padMenu, and a live arena would spend
    // the presses in the field instead.
    g.pause();
    await frames(2);
    g._openSettings();
    await frames(2);

    // THE PROMPT AND THE SHEET follow the table, not the plastic: the lead
    // names the bound buttons and the start screen's sheet swaps them in.
    // TAKE is still on triangle here, so the lead is the shipped one - what
    // is being asserted is that it is built from the table, which the swap
    // on the rows above has already proven reaches the caps.
    const leadAfter = g._useLead();
    t('the take prompt still names triangle', leadAfter.includes('g-triangle'), leadAfter);
    const sheetJump = g.keys.padSheet().find((r) => r[1] === 'JUMP')[0];
    const sheetReload = g.keys.padSheet().find((r) => r[1] === 'RELOAD')[0];
    t('the pad sheet carries the rebind',
      sheetJump === 'square' && sheetReload === 'cross', sheetJump + ' / ' + sheetReload);

    // CROSS CANCELS rather than binding. The click that opened the row and
    // the press that means "confirm" are the same button, so CROSS can never
    // be the binding it is confirming with.
    document.querySelector('#pbind-jump .bind-btn').click();
    await frames(1);
    set(B.CROSS, true);
    await frames(2);
    const crossCanceled = !document.querySelector('#pbind-jump .bind-btn').classList.contains('listening')
      && g.keys.padBtn('jump') === 'square';
    set(B.CROSS, false);
    await frames(2);
    t('cross cancels the capture without binding', crossCanceled === true,
      g.keys.padBtn('jump'));

    // A FIXED press - the D-pad - closes the row and keeps the binding: the
    // pad's one-word "no", the same answer Meta gets on the keyboard.
    document.querySelector('#pbind-jump .bind-btn').click();
    await frames(1);
    set(B.DOWN, true);
    await frames(2);
    const dpadRefused = !document.querySelector('#pbind-jump .bind-btn').classList.contains('listening')
      && g.keys.padBtn('jump') === 'square';
    set(B.DOWN, false);
    await frames(2);
    t('the d-pad is refused as a binding', dpadRefused === true, g.keys.padBtn('jump'));

    // THE SAVE IS REAL: a fresh table, the way a reloaded page would build
    // one, comes up with the swap in place - and DEFAULTS puts the shipped
    // layout back on both the table and the caps.
    const rawPad = JSON.parse(localStorage.getItem('va-pad-keys'));
    t('the pad bind is written to the store',
      !!rawPad && rawPad.jump === 'square' && rawPad.reload === 'cross');
    const freshPad = await (async () => {
      const { Keybinds } = await import('./js/keybind.js');
      const k = new Keybinds();
      return k.padBtn('jump') === 'square';
    })();
    t('a fresh table reads the pad save', freshPad === true);
    document.getElementById('btn-reset-keys').click();
    await frames(1);
    const padDefaultsBack = g.keys.padBtn('jump') === 'cross'
      && g.keys.padBtn('reload') === 'square'
      && !!document.querySelector('#pbind-jump .bind-btn .g-cross');
    t('DEFAULTS restores the shipped pad layout', padDefaultsBack === true);
    localStorage.removeItem('va-pad-keys');
    g._closeSubScreen();
    await frames(2);
    // The section below walks the PAUSE screen's exit button, and the run was
    // unpaused above to prove the rebinding in the field - back to the state
    // the suite was in before this section touched anything.
    g.pause();
    await frames(2);

    // ---- 6b. EXIT, and the question in front of it -------------------------
    //
    // The one control on the pause screen that throws the run away, so it is
    // the one that is not allowed to do anything on a single press. It opens a
    // confirmation, and that confirmation is a SUB-SCREEN like SETTINGS - which
    // is the whole reason it needs asserting here: CIRCLE, OPTIONS and BACK all
    // route through _subScreenOpen, so a screen that forgot to declare itself
    // one would be a screen the pad could not back out of.
    const shown = (el) => !el.classList.contains('hidden');
    document.getElementById('btn-exit-pause').click();
    await frames(2);
    t('exit asks before it exits', shown(g.ui.confirmOv) && g.state === 'paused', g.state);
    t('the pause menu is still underneath it', shown(g.ui.pauseOv));
    t('and the pad is pointed at the question', g._menuRoot() === g.ui.confirmOv);
    // The safe answer is the one the selection starts on, and the one the big
    // lit button is - a player who mashes CROSS keeps their run.
    t('the selection starts on the safe answer',
      g.menu.el === document.getElementById('btn-exit-no'),
      g.menu.el && g.menu.el.id);
    await tap(B.CIRCLE);
    t('circle backs out of the question, not out of the run',
      !shown(g.ui.confirmOv) && g.state === 'paused', g.state);

    document.getElementById('btn-exit-pause').click();
    await frames(2);
    document.getElementById('btn-exit-no').click();
    await frames(2);
    t('and so does cancelling it', !shown(g.ui.confirmOv) && g.state === 'paused');

    document.getElementById('btn-exit-pause').click();
    await frames(2);
    document.getElementById('btn-exit-yes').click();
    await frames(4);
    t('CONFIRMING RETURNS TO THE MAIN SCREEN',
      g.state === 'menu' && shown(g.ui.startOv), g.state);
    t('with the pause screen and the question gone',
      !shown(g.ui.pauseOv) && !shown(g.ui.confirmOv));
    t('and the HUD down', g.ui.hud.classList.contains('hidden'));
    // The menu is drawn over a LIVE arena, so an abandoned fight left standing
    // would be visible through the wash.
    t('the fight behind the menu is over',
      g.enemies.length === 0 && g.queue.length === 0, 'enemies ' + g.enemies.length);
    // OPTIONS is START on this screen, which is how the pad gets back in.
    await tap(B.OPTIONS);
    t('and a fresh run starts clean from it',
      g.state === 'playing' && g.wave === 0 && g.credits === 0,
      'wave ' + g.wave + ' credits ' + g.credits);
    await frames(2);

    await tap(B.OPTIONS);
    t('options pauses again', g.state === 'paused', g.state);
    await tap(B.OPTIONS);
    t('options un-pauses', g.state === 'playing', g.state);

    // ---- 7. vibration can be turned off ------------------------------------
    g.pad.rumbleOn = false;
    pad.vibrationActuator.effects.length = 0;
    g.pad.rumble(1, 1, 100, 4);
    t('vibration setting is obeyed', pad.vibrationActuator.effects.length === 0);
    g.pad.rumbleOn = true;

    // ---- 7b. the debug panel, on CREATE ------------------------------------
    //
    // The pad's other flat button and the one thing in the game that uses it.
    // It is asserted HERE, with the other menu screens, because its failure
    // mode is the same as theirs: a panel that is up but forgot to declare
    // itself reading matter leaves the scanlines at full strength across a
    // wall of small caps, which is a state, not an exception - nothing throws
    // and the panel itself works perfectly. `body.reading` is the class every
    // other screen sets, so it is what is asserted, not the opacity.
    //
    // The THEME ROW is exercised here too, end to end, because its whole
    // reason to exist is that a theme that cannot be reached in two clicks
    // is a theme that only the suites ever see: the row is dealt off the
    // theme table, a click pins the schedule through the same setTheme() the
    // suites drive, and OFF hands the order back. Asserted on the SCHEDULE
    // ITSELF - which block themeForWave deals for the next wave - rather
    // than on the button's class, which would pass with the wiring broken
    // in exactly the way that matters.
    await tap(B.CREATE);
    t('create opens the debug panel',
      !g.ui.debugPanel.classList.contains('hidden'), g.state);
    t('the panel parks the run in paused', g.state === 'paused', g.state);
    t('the beam is down while the panel is up',
      document.body.classList.contains('reading'));
    {
      // The three exclusive catalogues are dealt from the same discovered
      // pools as their cabinets. Counts, sections and click paths all stay
      // current when a reward definition is added without this suite learning
      // its name.
      const { DONATION_ITEMS } = await import('./js/items/donation/index.js');
      const donationDefs = g._debugDonationDefs();
      t('each Donation Machine pool has its own debug section',
        Object.entries(DONATION_ITEMS).every(([kind, pool]) =>
          g.ui.debugDonations[kind].children.length === Object.keys(pool).length),
        Object.entries(g.ui.debugDonations)
          .map(([kind, grid]) => `${kind}=${grid.children.length}`).join(' '));
      const reward = donationDefs.ammo[0];
      const tile = g.ui._debugTiles[reward.id].el;
      delete g.player.donationItems[reward.id];
      g.player.rebuildMods();
      tile.click();
      t('a donation reward tile grants through the real ownership path',
        !!g.player.donationItems[reward.id] && tile.classList.contains('on'), reward.id);
      tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      t('right-click removes a donation reward and refreshes its tile',
        !g.player.donationItems[reward.id] && !tile.classList.contains('on'), reward.id);
    }
    {
      // One theme button per theme, plus OFF. Counted from the table the
      // buttons were dealt from, not a literal - a theme landing is the row
      // growing, and the suite should not have to be told.
      const { THEMES, themeForWave } = await import('./js/themes.js');
      const btns = g.ui.debugThemes.querySelectorAll('button');
      const off = btns[0];
      t('the theme row carries every theme plus OFF',
        btns.length === Object.keys(THEMES).length + 1,
        'buttons ' + btns.length + ' themes ' + Object.keys(THEMES).length);
      // The schedule itself, read the way the wave builder will read it:
      // whichever theme the next block draws, whatever the deck dealt. This,
      // not the button's class, is the thing the row exists to change.
      const nextBlockTheme = () => themeForWave(g._themeSeed, g.wave + 1, g._forcedTheme);
      t('unpinned, the deck owns the schedule', g._forcedTheme === null);
      const emberBtn = [...btns].find((b) => b.textContent === 'EMBER');
      emberBtn.click();
      t('a click pins the schedule to that theme',
        g._forcedTheme === 'ember' && nextBlockTheme() === 'ember',
        'forced=' + g._forcedTheme + ' next=' + nextBlockTheme());
      t('the pin is drawn on the row',
        emberBtn.classList.contains('pinned') && !off.classList.contains('pinned'));
      off.click();
      t('OFF hands the order back to the deck',
        g._forcedTheme === null, 'forced=' + g._forcedTheme);
      t('and the row says so', off.classList.contains('pinned'));
    }
    {
      // THE SEARCH BOX. Asserted on what is left STANDING, the same way the
      // theme row is asserted on the schedule: a filter whose listener never
      // ran, or whose match rule stopped agreeing with what a card says,
      // passes nothing here. The queries are derived from the defs the panel
      // itself was dealt, so a pool renaming survives without the suite being
      // edited - and the haystack formula (the name and the effect lines,
      // exactly what a card says) is restated here on purpose, because THAT
      // is the contract.
      const search = g.ui.debugSearch;
      const type = (q) => {
        search.value = q;
        search.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const donationDefs = Object.values(g._debugDonationDefs()).flat();
      const defs = [...g._debugPassiveDefs(), ...g._debugActiveDefs(), ...donationDefs];
      const hayOf = (d) => (d.name + ' ' +
        (Array.isArray(d.effects) ? d.effects.map((e) => e[0]).join(' ') : '')).toLowerCase();
      const itemGrids = [
        g.ui.debugActives, g.ui.debugPassives, ...Object.values(g.ui.debugDonations),
      ];
      const standing = () =>
        itemGrids.flatMap((grid) => [...grid.children])
          .filter((el) => !el.classList.contains('filtered'));
      const actSec = g.ui.debugActives.closest('.debug-sec');
      const pasSec = g.ui.debugPassives.closest('.debug-sec');
      // A NAME QUERY. Every word has to land on a card for the card to stay,
      // so a full name should leave its own card plus only genuine overlaps.
      const pick = g._debugPassiveDefs().find((d) =>
        defs.filter((x) => d.name.toLowerCase().split(/\s+/).every((w) => hayOf(x).includes(w)))
          .length < defs.length) || g._debugPassiveDefs()[0];
      type(pick.name);
      t('a query narrows every grid to the cards holding it',
        standing().length > 0 && standing().length < defs.length,
        `q="${pick.name}" ${standing().length}/${defs.length}`);
      t('every card still standing says every word of it',
        standing().every((el) =>
          pick.name.toLowerCase().split(/\s+/).every((w) =>
            el.textContent.toLowerCase().includes(w))));
      // A PASSIVES-ONLY WORD: some word in a passive's name that no active's
      // name or effect line contains. Typing it must leave the ACTIVE
      // ITEM section with nothing to show - at which point the section hides
      // rather than sitting over an empty grid, because a header over nothing
      // reads as "the box is broken", not "no matches".
      const actHay = g._debugActiveDefs().map(hayOf);
      const passOnly = g._debugPassiveDefs()
        .flatMap((d) => d.name.toLowerCase().split(/[^a-z]+/))
        .filter(Boolean)
        .find((w) => !actHay.some((h) => h.includes(w)));
      type(passOnly || pick.name);
      t('a section with no matches hides with its header',
        actSec.classList.contains('hidden')
        && !pasSec.classList.contains('hidden'),
        'word=' + (passOnly || pick.name));
      type('qqqq wwww');
      t('a query nothing holds empties every item section',
        itemGrids.every((grid) => grid.closest('.debug-sec').classList.contains('hidden')));
      type('');
      t('and clearing the box puts every card back',
        standing().length === defs.length
        && itemGrids.every((grid) => !grid.closest('.debug-sec').classList.contains('hidden')),
        `${standing().length}/${defs.length}`);
    }
    await tap(B.CREATE);
    t('create closes it again', g.ui.debugPanel.classList.contains('hidden'));
    t('and the run resumes', g.state === 'playing', g.state);
    t('the beam is back up with it', !document.body.classList.contains('reading'));

    // ---- 8. the hard gate and the unplug -----------------------------------
    const realId = pad.id;
    pad.id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
    await frames(2);
    t('non-DualSense ignored', g.pad.connected === false);
    pad.id = realId;
    await frames(2);
    t('DualSense picked back up', g.pad.connected === true);

    // Unplugged mid-fight. The safe state is the pause screen, not a player
    // standing still in a room full of enemies.
    g.state = 'playing';
    g._setInputMode('pad');
    await frames(2);
    pad.connected = false;
    await frames(3);
    t('unplug pauses the run', g.state === 'paused', g.state);
    t('unplug hands back to keyboard', g.inputMode === 'kbm', g.inputMode);

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

console.log(fails ? `PAD TEST FAIL (${fails})` : 'PAD TEST PASS');
process.exit(fails ? 1 : 0);
