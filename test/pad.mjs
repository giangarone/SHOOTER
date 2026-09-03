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
//    6. R2 fires, R3 melees, SQUARE reloads, TRIANGLE holds the build sheet.
//    7. OPTIONS pauses and un-pauses; the D-pad walks the menu, and a
//       settings row spends left/right on its own value rather than on moving
//       the selection. EXIT asks before it exits, the question backs out under
//       CIRCLE like any other sub-screen, and confirming it leaves the run and
//       the fight behind on the main screen.
//    8. Aim assist works inside its cone and not outside it, and its pull
//       closes an error rather than opening one.
//    9. Vibration reaches the actuator, and stops when it is turned off.
//   10. A pad unplugged mid-run pauses instead of leaving the player standing.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8211;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { stdio: 'inherit' });
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

    // ---- 2. analogue movement ---------------------------------------------
    // Same push, same frames, twice: once at full deflection and once at half.
    const walk = async (tilt) => {
      clearField();
      g.player.pos.set(0, 0, 0);
      g.player.yaw = 0;
      g.player.moveVX = 0;
      g.player.moveVZ = 0;
      stick(0, -tilt, 0, 0);
      for (let i = 0; i < 30; i++) { clearField(); await step(); }
      const d = Math.hypot(g.player.pos.x, g.player.pos.z);
      stick(0, 0, 0, 0);
      await frames(4);
      return d;
    };
    const full = await walk(1);
    const half = await walk(0.5);
    t('left stick moves the player', full > 3, full.toFixed(2));
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
      await frames(20);
      stick(0, 0, 0, 0);
      const turned = Math.abs(g.player.yaw);
      set(B.L2, false);
      await frames(20);
      return turned;
    };
    const open = await turn(false);
    const aimed = await turn(true);
    t('right stick turns the view', open > 0.4, open.toFixed(2));
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

    set(B.TRIANGLE, true);
    await frames(3);
    const statsUp = g._statsHeld;
    set(B.TRIANGLE, false);
    await frames(3);
    t('triangle holds the build sheet', statsUp === true && g._statsHeld === false);

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

    // L1 dashes, but only for a build that has a dash to spend - the button
    // must not invent charges the keyboard would not have had.
    g.player.mods.dashCharges = 2;
    g.player.dashLeft = 2;
    g.player.dashEnd = -1;
    await tap(B.L1);
    t('L1 dashes', g.player.dashLeft === 1, String(g.player.dashLeft));

    // ---- 5. aim assist -----------------------------------------------------
    clearField();
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
      g.state === 'playing' && g.wave === 0 && g.score === 0,
      'wave ' + g.wave + ' score ' + g.score);
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
