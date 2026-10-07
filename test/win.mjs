// THE WIN - clearing wave 50 in solo banks the streak, and nothing else does.
//
// Clearing wave 50 in solo parks the run on the win screen and banks +1, once
// per run. Dying or EXITing before the win zeroes the streak; dying or EXITing
// after it keeps what was banked. Versus never opens the screen and never
// touches the store, so a match can neither build a streak nor break one.
// The menu shows the stored streak, refreshed on every show.
//
// Asserted as STATES through the real wave-clear path, not as unit calls:
// the trigger lives in _updateWave's clear branch, and a direct _claimWin()
// would pass with the wiring cut.
import { launchBrowser, sleep, startServer, bootPage } from './harness.mjs';

const PORT = 8235;
const server = startServer(PORT);
await sleep(800);

let browser;
let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
};

try {
  browser = await launchBrowser();
  const { page, errors } = await bootPage(browser, PORT);

  // The real clear path: an empty wave-50 arena clears on the frames it runs.
  // The poll lives INSIDE the page - requestAnimationFrame does not exist in
  // node, and a node-side sleep would be measuring the wall clock rather than
  // the loop (see __simWait in js/main.js).
  const clearWave50 = () => page.evaluate(() => new Promise((done) => {
    const g = window.__game;
    // 900 frames of budget, counted in the loop rather than on a clock.
    let n = 0;
    const budgeted = () => {
      g.queue.length = 0;
      g._clearEntities();
      g.bossFight = null;
      if (g.state === 'won' || ++n >= 900) { done(g.state === 'won'); return; }
      requestAnimationFrame(budgeted);
    };
    budgeted();
  }));

  // ---- 1. solo: clearing 50 wins, banks +1, parks on the screen ----
  const won = await page.evaluate(async () => {
    const g = window.__game;
    g.autoTest = false;
    localStorage.setItem('va-win-streak', '0');
    g.beginGame('solo');
    g.player.maxHealth = 99999;
    g.player.health = 99999;
    g.wave = 50;
    g.waveState = 'active';
    g.spawnTimer = 999;
    return true;
  });
  check('a solo run reaches the trigger', won);
  check('clearing wave 50 opens the win screen', await clearWave50());
  const banked = await page.evaluate(() => ({
    state: window.__game.state,
    wave: window.__game.wave,
    streak: localStorage.getItem('va-win-streak'),
    shown: !document.getElementById('overlay-win').classList.contains('hidden'),
    run: document.getElementById('win-streak-run').textContent,
  }));
  check('the run parks in won', banked.state === 'won', banked.state);
  check('the streak banks exactly once', banked.streak === '1', `streak=${banked.streak}`);
  check('the screen says so', banked.shown && banked.run === '1', `run=${banked.run}`);

  // ---- 2. CONTINUE resumes the same break ----
  await page.evaluate(() => { document.getElementById('btn-win-continue').click(); });
  await sleep(300);
  const cont = await page.evaluate(() => ({
    state: window.__game.state,
    wave: window.__game.wave,
    waveState: window.__game.waveState,
    shown: !document.getElementById('overlay-win').classList.contains('hidden'),
    streak: localStorage.getItem('va-win-streak'),
  }));
  check('CONTINUE resumes playing', cont.state === 'playing', cont.state);
  check('on the same wave break', cont.wave === 50 && cont.waveState === 'intermission',
    `wave=${cont.wave} ${cont.waveState}`);
  check('the screen comes down', !cont.shown);
  check('the banked streak survives the resume', cont.streak === '1', `streak=${cont.streak}`);

  // ---- 3. dying AFTER the win keeps the streak ----
  await page.evaluate(() => { window.__game.player.health = 0; });
  await page.waitForFunction('window.__game.state === "gameover"', { timeout: 15000 });
  const kept = await page.evaluate(() => localStorage.getItem('va-win-streak'));
  check('a death after the win keeps the streak', kept === '1', `streak=${kept}`);

  // ---- 4. dying BEFORE the win zeroes it ----
  const dead = await page.evaluate(() => {
    localStorage.setItem('va-win-streak', '3');
    window.__game.beginGame('solo');
    window.__game.gameOver();
    return localStorage.getItem('va-win-streak');
  });
  check('a death before the win zeroes the streak', dead === '0', `streak=${dead}`);

  // ---- 5. EXITing BEFORE the win zeroes it ----
  const exited = await page.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('va-win-streak', '4');
    g.beginGame('solo');
    g.pause();
    g._exitToMenu();
    return {
      streak: localStorage.getItem('va-win-streak'),
      state: g.state,
      menu: document.getElementById('win-streak').textContent,
    };
  });
  check('EXITing before the win zeroes the streak', exited.streak === '0', `streak=${exited.streak}`);
  check('and the menu shows it', exited.menu === '0', `menu=${exited.menu}`);

  // ---- 6. BACK TO MENU keeps the win ----
  await page.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('va-win-streak', '0');
    g.beginGame('solo');
    g._claimWin();
  });
  await sleep(200);
  await page.evaluate(() => { document.getElementById('btn-win-menu').click(); });
  await sleep(300);
  const keptMenu = await page.evaluate(() => ({
    state: window.__game.state,
    streak: localStorage.getItem('va-win-streak'),
    menu: document.getElementById('win-streak').textContent,
  }));
  check('BACK TO MENU lands on the menu', keptMenu.state === 'menu', keptMenu.state);
  check('and keeps the banked win', keptMenu.streak === '1', `streak=${keptMenu.streak}`);
  check('which the menu shows', keptMenu.menu === '1', `menu=${keptMenu.menu}`);

  // ---- 7. versus: no screen, no touch ----
  const vs = await page.evaluate(async () => {
    const g = window.__game;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    localStorage.setItem('va-win-streak', '5');
    g.beginGame('versus', 2);
    g.player.maxHealth = 99999;
    g.player.health = 99999;
    g.match.slots.forEach((s) => {
      if (s && s.player) { s.player.maxHealth = 99999; s.player.health = 99999; }
    });
    g.wave = 50;
    g.match.wave = 50;
    g.waveState = 'active';
    g.spawnTimer = 999;
    let wonScreen = false;
    for (let i = 0; i < 900; i++) {
      g.queue.length = 0;
      g._clearEntities();
      g.bossFight = null;
      if (g.state === 'won') { wonScreen = true; break; }
      if (g._pass || g.waveState === 'idle') break;
      await step();
    }
    const streakAfterClear = localStorage.getItem('va-win-streak');
    // A versus death is a lost wave, never a streak reset.
    g.gameOver();
    return {
      wonScreen,
      streakAfterClear,
      afterDeath: localStorage.getItem('va-win-streak'),
      state: g.state,
    };
  });
  check('versus never opens the win screen', !vs.wonScreen, vs.state);
  check('a versus clear banks nothing', vs.streakAfterClear === '5', `streak=${vs.streakAfterClear}`);
  check('a versus death resets nothing', vs.afterDeath === '5', `streak=${vs.afterDeath}`);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(bad ? `WIN TEST FAIL (${bad})` : 'WIN TEST PASS');
process.exitCode = bad ? 1 : 0;
