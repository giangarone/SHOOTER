// Focused check of the KEY BINDINGS system - the table, the settings screen
// and the save.
//
// WHAT IS ASSERTED
//   1. THE TABLE IS THE ONE PATH. A key rebound through the settings screen
//      moves the player the same frame, and the key it displaced stops doing
//      what it used to - no second list anywhere in the game for the old key
//      to hide in.
//   2. THE SCREEN AGREES. Every binding row on the settings screen names the
//      key the table says it names, and the control sheet on the start screen
//      follows a rebind made underneath it.
//   3. THE SAVE IS REAL. The store is written on the bind, a reloaded page
//      comes up with the rebind in place, and DEFAULTS puts the shipped table
//      back on both the table and the screen.
//   4. A TAKE IS POLITE. A key an action can spare is taken silently - crouch
//      ships with two, so rebinding melee onto C must leave crouch the Ctrl.
//      A key that is an action's LAST one is refused, and the refusal names
//      the row that owns it.
//   5. THE CAPTURE IS A CONVERSATION. The row blinks while it waits, Escape
//      cancels it, and taking the settings screen down cancels it too - a
//      row left listening behind a closed screen would eat the first key of
//      the next run.
//   6. EVERYWHERE THE CONTROLS ARE USED. The rebound keys work in the field
//      (movement), in the HUD prompts (the USE lead names the rebound key),
//      and in the double-tap clock, which follows the forward ACTION and not
//      the physical W.
//   7. THE SCREEN FOLLOWS THE HANDS. The settings screen carries a second
//      block of rows for the controller, and the input mode picks which one
//      the eye gets - asserted here for the swap itself; the pad rows' own
//      rebind behaviour is test/pad.mjs's, on a synthetic DualSense.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8245;
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

  // ?padtest hands out window.__game without a bot driving `input` - the same
  // harness the pad suite uses, because a keyboard rebind is the same kind of
  // seam: real key events, real game state.
  await page.goto(`http://127.0.0.1:${PORT}/?padtest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game', { timeout: 30000 });

  const press = async (code, ms = 60) => {
    await page.keyboard.down(code);
    await new Promise((r) => setTimeout(r, ms));
    await page.keyboard.up(code);
    await new Promise((r) => setTimeout(r, ms));
  };

  // The defaults, read off the table itself, are asserted as the shipped set
  // - a rebind system whose defaults have drifted is one that cannot be reset.
  const defaultsOk = await page.evaluate(() => {
    const g = window.__game;
    const want = {
      forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
      sprint: ['ShiftAny'], jump: ['Space'], crouch: ['KeyC', 'ControlAny'],
      melee: ['KeyV'], reload: ['KeyR'], activeItem: ['KeyQ'], use: ['KeyE'],
      stats: ['Tab'], fullscreen: ['KeyF'],
    };
    for (const id in want) {
      if (JSON.stringify(g.keys.codes(id)) !== JSON.stringify(want[id])) return id;
    }
    return null;
  });
  ok('the shipped table is the default', defaultsOk === null, defaultsOk || '');

  // The action used to be stored as `item`. Renaming the code must not reset a
  // player's chosen key or shoulder button, so both loaders accept the old key
  // and expose it only under the explicit active-item action.
  const legacyItem = await page.evaluate(async () => {
    const keyboard = localStorage.getItem('va-keys');
    const pad = localStorage.getItem('va-pad-keys');
    localStorage.setItem('va-keys', JSON.stringify({ item: ['KeyI'] }));
    localStorage.setItem('va-pad-keys', JSON.stringify({ item: 'L1' }));
    const { Keybinds } = await import('./js/keybind.js?legacy-active-item');
    const keys = new Keybinds();
    if (keyboard === null) localStorage.removeItem('va-keys');
    else localStorage.setItem('va-keys', keyboard);
    if (pad === null) localStorage.removeItem('va-pad-keys');
    else localStorage.setItem('va-pad-keys', pad);
    return { keyboard: keys.codes('activeItem'), pad: keys.padBtn('activeItem') };
  });
  ok('the old item binding migrates to activeItem',
    legacyItem.keyboard[0] === 'KeyI' && legacyItem.pad === 'L1',
    JSON.stringify(legacyItem));

  // ---- 1. the table is the one path ---------------------------------------
  const moveBefore = await page.evaluate(async () => {
    const g = window.__game;
    g.state = 'playing';
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const ev = (type, code) => new KeyboardEvent(type, { code, bubbles: true });
    dispatchEvent(ev('keydown', 'KeyI'));
    await step();
    const down = g.input.forward;
    dispatchEvent(ev('keyup', 'KeyI'));
    await step();
    return down === false && g.input.forward === false;
  });
  ok('I is not forward before the rebind', moveBefore === true);

  // Rebind FORWARD onto I, through the same events the settings screen uses.
  const rebindOk = await page.evaluate(async () => {
    const g = window.__game;
    g._openSettings();
    const row = document.getElementById('bind-forward').querySelector('button');
    row.click();
    const listening = row.classList.contains('listening')
      && row.textContent === 'PRESS A KEY';
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', bubbles: true }));
    const bound = g.keys.codes('forward').includes('KeyI');
    const swallowed = g.input.forward === false;
    const shown = row.textContent === 'I' && !row.classList.contains('listening');
    const wGone = !g.keys.is('forward', 'KeyW');
    return { listening, bound, swallowed, shown, wGone };
  });
  ok('the row says PRESS A KEY while it waits', rebindOk.listening === true);
  ok('the press binds', rebindOk.bound === true);
  ok('and the press itself is swallowed', rebindOk.swallowed === true);
  ok('the row shows the new key', rebindOk.shown === true);
  ok('W stops being forward', rebindOk.wGone === true);

  const moveAfter = await page.evaluate(async () => {
    const g = window.__game;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    // W must not move the player any more - no second list to hide in.
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    await step();
    const wDown = g.input.forward;
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', bubbles: true }));
    await step();
    const iDown = g.input.forward;
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyI', bubbles: true }));
    await step();
    return wDown === false && iDown === true && g.input.forward === false;
  });
  ok('W no longer moves, I does, and the release lands', moveAfter === true);

  // The sheet on the start screen - under the settings screen, so the rebind
  // has to reach it through _syncKeyUi without a mode change to carry it.
  // MOVE is the four directions fused into one cap while they are all single
  // characters, so the rebind shows up inside it: WASD has become IASD.
  const sheetOk = await page.evaluate(() => {
    const g = window.__game;
    const caps = [...document.querySelectorAll('.controls .ctl .key')].map((c) => c.textContent);
    g._closeSubScreen();
    return caps[0] === 'IASD' && caps.includes('SHIFT');
  });
  ok('the start screen sheet shows the rebind', sheetOk === true);

  // ---- 2. the screen agrees with the table ---------------------------------
  // The KEYBOARD rows only - this suite runs on the keyboard, the pad rows
  // are behind the mode's back (offsetParent is null for them) and are the
  // pad suite's to assert on.
  const rowsOk = await page.evaluate(() => {
    const g = window.__game;
    g._openSettings();
    for (const el of document.querySelectorAll('.bind-btn')) {
      if (el.offsetParent === null) continue;
      const id = el.dataset.action;
      if (el.textContent !== g.keys.label(id)) return id;
    }
    return null;
  });
  ok('every row names its key from the table', rowsOk === null, rowsOk || '');

  // ---- 3. the save is real --------------------------------------------------
  const stored = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('va-keys'));
    return raw && raw.forward && raw.forward[0] === 'KeyI';
  });
  ok('the bind is written to the store', stored === true);

  const loadOk = await page.evaluate(async () => {
    // A fresh table, the way a reloaded page would build one.
    const { Keybinds } = await import('./js/keybind.js');
    const k = new Keybinds();
    return k.codes('forward').includes('KeyI');
  });
  ok('a fresh table reads the save', loadOk === true);

  // A REAL reload - same browser profile, same localStorage - must come up
  // with the rebind live.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__game && window.__game.keys', { timeout: 30000 });
  const reloaded = await page.evaluate(async () => {
    const g = window.__game;
    g.state = 'playing';
    const step = () => new Promise((r) => requestAnimationFrame(r));
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', bubbles: true }));
    await step();
    const down = g.input.forward;
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyI', bubbles: true }));
    await step();
    return down === true;
  });
  ok('a reloaded game plays on the new key', reloaded === true);

  const defaultsBtn = await page.evaluate(() => {
    const g = window.__game;
    g._openSettings();
    document.getElementById('btn-reset-keys').click();
    return g.keys.codes('forward').includes('KeyW')
      && document.getElementById('bind-forward').querySelector('button').textContent === 'W';
  });
  ok('DEFAULTS restores the shipped table and the rows', defaultsBtn === true);
  const storedAfterReset = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('va-keys'));
    return raw && raw.crouch.length === 2;
  });
  ok('the store is rewritten by the reset', storedAfterReset === true);

  // ---- 4. a take is polite ---------------------------------------------------
  const spare = await page.evaluate(() => {
    const g = window.__game;
    // CROUCH ships with two keys. Melee taking C leaves crouch the Ctrl -
    // the one spare in the shipped table - and the bind succeeds outright.
    const refused = g.keys.bind('melee', 'KeyC');
    return refused === null && g.keys.codes('crouch').join() === 'ControlAny'
      && g.keys.codes('melee').join() === 'KeyC';
  });
  ok('a spare key is taken and its owner keeps the rest', spare === true);

  const last = await page.evaluate(() => {
    const g = window.__game;
    // RELOAD is down to one key. Melee cannot have it, and the refusal names
    // the row that owns it rather than the row that asked.
    return g.keys.bind('melee', 'KeyR');
  });
  ok("an action's last key is refused", last === 'reload', String(last));

  const stillWorks = await page.evaluate(() => {
    const g = window.__game;
    return g.keys.codes('reload').includes('KeyR') && !g.keys.codes('melee').includes('KeyR');
  });
  ok('the refused bind changes nothing', stillWorks === true);

  // The screen-side refusal: the taken row shakes. The shake is a 700ms
  // class, so the check rides the class itself.
  const shake = await page.evaluate(async () => {
    const g = window.__game;
    const asked = document.getElementById('bind-melee').querySelector('button');
    const owns = document.getElementById('bind-reload').querySelector('button');
    asked.click();
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
    const shaken = owns.classList.contains('taken');
    return { shaken, stillListening: asked.classList.contains('listening') };
  });
  ok('the refusal shakes the row that owns the key', shake.shaken === true);
  ok('and closes the capture', shake.stillListening === false);

  // And the settings screen comes back to a sane state after all that.
  await page.evaluate(() => window.__game._closeSubScreen());

  // ---- 5. the capture is a conversation --------------------------------------
  const escOk = await page.evaluate(() => {
    const g = window.__game;
    g._openSettings();
    const row = document.getElementById('bind-jump').querySelector('button');
    row.click();
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    const closed = !row.classList.contains('listening') && row.textContent === 'SPACE';
    // Escape did double duty this once - closing the capture, then the screen.
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    const screenClosed = g.ui.settingsOv.classList.contains('hidden');
    return closed && screenClosed;
  });
  ok('Escape cancels the capture and still closes the screen', escOk === true);

  const closeOk = await page.evaluate(() => {
    const g = window.__game;
    g._openSettings();
    const row = document.getElementById('bind-jump').querySelector('button');
    row.click();
    g._closeSubScreen();
    // The row is behind a closed screen; the capture must not survive it.
    return !row.classList.contains('listening');
  });
  ok('taking the screen down cancels the capture', closeOk === true);

  // A key pressed into a dead capture must reach the game as itself.
  const notEaten = await page.evaluate(async () => {
    const g = window.__game;
    g.state = 'playing';
    const step = () => new Promise((r) => requestAnimationFrame(r));
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', bubbles: true }));
    await step();
    const jump = g.input.jump;
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ', bubbles: true }));
    await step();
    return jump === false;
  });
  ok('no listening row survives to eat the next key', notEaten === true);

  // THE CLICK THAT OPENED THE CAPTURE LEFT THE BUTTON FOCUSED, and a focused
  // button is live to Space and Enter on the keyUP - the half of the press
  // the bind did not swallow. Rebinding JUMP onto Space and letting go must
  // not click the row again and put it straight back into capture.
  const noRecapture = await page.evaluate(async () => {
    const g = window.__game;
    g._openSettings();
    const row = document.getElementById('bind-jump').querySelector('button');
    row.click();
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    const bound = g.keys.codes('jump').includes('Space');
    // The browser's own activation of a focused button rides keyup; let it
    // land before looking.
    await new Promise((r) => setTimeout(r, 120));
    const reOpened = row.classList.contains('listening');
    row.blur();
    dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
    g.keys.reset();
    g._closeSubScreen();
    return bound === true && reOpened === false;
  });
  ok('the row that just bound does not re-open on the keyup', noRecapture === true);

  // ---- 6. everywhere the controls are used -----------------------------------
  // The USE prompt names the key the table says, not a fixed E.
  const promptOk = await page.evaluate(() => {
    const g = window.__game;
    g.keys.bind('use', 'KeyU');
    return g._useLead().includes('U') && !g._useLead().includes('>E<');
  });
  ok('the USE prompt names the rebound key', promptOk === true, '');

  const promptDefault = await page.evaluate(() => {
    const g = window.__game;
    g.keys.reset();
    return g._useLead().includes('E');
  });
  ok('and E again once reset', promptDefault === true);

  // THE DOUBLE-TAP CLOCK follows the forward ACTION. A rebind onto I must
  // move the dash there too, and W must stop dashing - the clock used to be
  // keyed by the physical key, which a rebind would strand.
  const dashOk = await page.evaluate(async () => {
    const g = window.__game;
    g.state = 'playing';
    g.autoTest = false;
    g.player.giveActiveItem('itemDash');
    g.player.activeItemCharge = 1e9;
    g.keys.bind('forward', 'KeyI');
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const fire = async (code) => {
      g.player.dashEnd = -1;
      dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      await step();
      dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
      await new Promise((r) => setTimeout(r, 320));
      await step();
      dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      await step();
      dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
      await step();
      return g.player.dashEnd > g.time;
    };
    const onW = await fire('KeyW');
    const onI = await fire('KeyI');
    g.keys.reset();
    return onW === false && onI === true;
  });
  ok('the double-tap dash follows the rebind', dashOk === true);

  // Movement, through real page key events - the full path from CDP to the
  // game, on the default table, so the suite ends with the shipped keys proven.
  // Read BEFORE the release: a helper that waits for the keyup would always
  // find the input already cleared.
  const realKeys = {};
  await page.evaluate(() => { window.__game.state = 'playing'; });
  await page.keyboard.down('KeyD');
  await sleep(60);
  realKeys.dDown = await page.evaluate(() => window.__game.input.right);
  await page.keyboard.up('KeyD');
  await sleep(60);
  await page.keyboard.down('ShiftLeft');
  await sleep(60);
  realKeys.sprint = await page.evaluate(() => window.__game.input.sprint);
  await page.keyboard.up('ShiftLeft');
  await sleep(60);
  ok('real key events still reach the game',
    realKeys.dDown === true && realKeys.sprint === true);

  // ---- 7. the screen follows the hands ---------------------------------------
  // The same settings screen carries the CONTROLLER's rows, hidden on a
  // keyboard and swapped in by the input mode - the one behavior this suite
  // can assert without a pad in the room, because the mode is what drives
  // it and the mode can be moved directly. The pad rows' own behaviour is
  // test/pad.mjs's, with a synthetic DualSense behind it.
  const swapOk = await page.evaluate(() => {
    const g = window.__game;
    g._openSettings();
    const kbRow = document.getElementById('bind-forward');
    const padRow = document.getElementById('pbind-jump');
    const kbVisible = () => kbRow.offsetParent !== null && padRow.offsetParent === null;
    const padVisible = () => padRow.offsetParent !== null && kbRow.offsetParent === null;
    const before = kbVisible();
    g._setInputMode('pad');
    const after = padVisible();
    g._setInputMode('kbm');
    return before && after && kbVisible();
  });
  ok('the binding rows swap with the input mode', swapOk === true);
  await page.evaluate(() => window.__game._closeSubScreen());

  // Leave the store clean for whichever suite runs after this one.
  await page.evaluate(() => {
    window.__game.keys.reset();
    localStorage.removeItem('va-keys');
    localStorage.removeItem('va-pad-keys');
  });

  console.log('CONSOLE ERRORS', JSON.stringify(errors));
  ok('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  console.error(err);
  fails++;
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(fails ? `REBIND TEST FAIL (${fails})` : 'REBIND TEST PASS');
process.exit(fails ? 1 : 0);
