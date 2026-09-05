// Focused check of the VERSUS HOT SEAT - the turn change, and the two ways a
// turn can end.
//
// WHY THIS EXISTS. Everything in versus happens at a seam: a turn ends, one
// run is written over another while the gun is out of frame, and a countdown
// hands the arena to the other player. Nothing about that seam is visible in a
// single frame, and both bugs it has produced so far were states rather than
// exceptions - a match that asked the winner to pick a passive item, and a
// handoff whose countdown re-armed itself every frame. Neither throws. Neither
// shows up in any other test. So they are asserted here as STATES, several
// seconds apart, exactly as a player would meet them.
//
// WHAT IS ASSERTED
//   1. A match starts on Player 1 with both snapshot slots already seeded, so
//      the first handoff is not a special case.
//   2. Clearing a wave hands over: the pass runs, the caption comes down, and
//      the other player is up on the next wave with their own run restored.
//   3. Dying hands over too, and puts the wave up as a CHALLENGE for the other
//      player rather than ending anything.
//   4. THE COUNTDOWN ACTUALLY RUNS. interT has to fall, and the pass has to end
//      in a live wave - a handoff that never completes is the mode's worst
//      failure and its quietest.
//   5. Clearing a challenge WINS ON THE WAVE, with no passive item set
//      raised. The match is already decided; a pick there is a choice spent
//      being told so.
//   6. The pass cannot be wedged. Forced into the one state that used to pin
//      the countdown at three seconds, it still finishes.
//   7. Nothing damages either player during a pass. Both death paths already
//      refuse to book a death there, so a hit that landed was banked against
//      whoever the body became.
//   8. A player KILLED BY A SHOT, rather than by a test writing zero into their
//      health. This is the one that froze the game: the fatal hit arrives from
//      inside _updateProjectiles' walk of the projectile list, the handoff it
//      starts empties that list underneath the walk, and the next index read is
//      undefined. The throw escapes rAF, which never reschedules - so the game
//      stops dead on the pass caption, which is exactly where a player finds it.
//      Asserted on the CLOCK rather than on frames, because a dead loop cannot
//      serve the frames a rAF-based wait would be asking for.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8226;
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
  await page.setViewport({ width: 1100, height: 620 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.match !== undefined', { timeout: 30000 });

  const results = await page.evaluate(async () => {
    const g = window.__game;
    // ?autotest hands out the bot as well as the Enemy class, and a bot on the
    // sticks would fight every measurement below.
    g.autoTest = false;
    const out = [];
    const t = (name, cond, extra = '') => out.push([name, !!cond, String(extra)]);
    const step = () => new Promise((r) => requestAnimationFrame(r));

    // THE FIELD IS HELD EMPTY. A wave with nothing in it clears on the frame it
    // starts, which is what makes a whole match run inside a test - and what is
    // being measured here is the turn change, never the fight.
    const clear = () => { g.queue.length = 0; g._clearEntities(); };
    // Runs frames until `f` holds. Returns the count, or -1 if it never did.
    const until = async (f, n = 900) => {
      for (let i = 0; i < n; i++) { clear(); if (f()) return i; await step(); }
      return f() ? n : -1;
    };
    // Frames WITHOUT clearing, for the checks that need the arena left alone.
    const raw = async (n) => { for (let i = 0; i < n; i++) await step(); };
    const caption = () => !document.getElementById('handoff').classList.contains('hidden');

    // ---- 1. the match opens ------------------------------------------------
    g.beginGame('versus');
    // Both players are made unkillable by anything but this test.
    g.player.maxHealth = 9999;
    g.player.health = 9999;
    t('a match starts on Player 1', g.match.active === 0 && g.match.wave === 1,
      'active=' + g.match.active + ' wave=' + g.match.wave);
    t('both snapshot slots are seeded', !!g.match.slots[0] && !!g.match.slots[1]);
    t('the match has no winner yet', g.match.winner === -1, String(g.match.winner));

    // ---- 2. a CLEAR hands over ---------------------------------------------
    t('wave 1 starts', (await until(() => g.waveState === 'active')) >= 0, g.waveState);
    t('an empty wave clears', (await until(() => g.waveState === 'intermission')) >= 0, g.waveState);
    // Forfeiting the pick is what ends the turn - see the intermission gate in
    // _updateWave. Claiming one would end it identically and needs a live offer.
    g.totemArea.dismiss();
    t('the pick ending the turn starts a pass', (await until(() => g._pass)) >= 0);
    t('the caption is up', caption());
    t('Player 2 is the incoming player', g.match.active === 1, 'active=' + g.match.active);
    t('the pass completes',
      (await until(() => !g._pass && g.waveState === 'active')) >= 0,
      'pass=' + g._pass + ' state=' + g.waveState + ' interT=' + g.interT.toFixed(2));
    t('the caption came down', !caption());
    t('Player 2 is on wave 2', g.wave === 2 && g.match.wave === 2,
      'wave=' + g.wave + '/' + g.match.wave);
    t('Player 2 has a run of their own', g.player.health > 0, 'hp=' + Math.round(g.player.health));

    // ---- 2b. THE BOX KNOWS WHOSE SLOT IT IS LOOKING AT ---------------------
    //
    // The one item rule that has to hold across a handoff: the mystery box
    // never offers a player what they are already carrying, and "they" is
    // whoever is on the controller RIGHT NOW.
    //
    // Nothing in mysterybox.js implements this and that is the point. Versus is
    // hot seat - one Player instance whose `item` is snapshotted and restored
    // by captureRun/restoreRun - so `player.item` is always the ACTIVE player's,
    // and shuffledPool() reading it is the whole mechanism. What this guards is
    // that `item` is still on the carried side of PLAYER_SKIP: the day someone
    // adds it to that list, the box starts offering player two whatever player
    // one is holding and nothing else in the suite notices.
    g.player.giveItem('itemHeal');
    const p2Pool = g.__poolForTest(g.player.item);
    t('the box excludes the ACTIVE player\'s item',
      !p2Pool.includes('itemHeal') && p2Pool.length === Object.keys(g.__itemsForTest).length - 1,
      'pool=' + p2Pool.length);
    // THE BENCHED PLAYER'S ITEM IS NOT THE BOX'S BUSINESS. Player 1 is sitting
    // in a snapshot holding something else; it has to be on Player 2's reel,
    // because it is not in the slot in front of the box.
    g.match.slots[0].player.item = 'itemFreeze';
    t('the benched player\'s item is still on the reel', p2Pool.includes('itemFreeze'));
    // THE FIELD THIS ALL RESTS ON. `item` is carried because captureRun copies
    // every Player field NOT named in PLAYER_SKIP - so the day someone adds it
    // to that list, the box starts reading a stale slot and nothing else in the
    // suite notices. This is the assertion that would.
    t('a snapshot carries the slot',
      Object.prototype.hasOwnProperty.call(g.match.slots[0].player, 'item')
      && Object.prototype.hasOwnProperty.call(g.match.slots[0].player, 'itemCharge'));
    // A SPIN CANNOT SURVIVE A HANDOFF. _endTurn dismisses the box, which forces
    // it idle - so a snapshot can never carry a half-finished reel into the
    // other player's wave.
    t('no roll is left running across the pass',
      g.mysteryBox.state === 'idle' && !g.mysteryBox.offered,
      g.mysteryBox.state);
    // Put Player 2 back as this section found them, so the turn order the rest
    // of this file walks is untouched.
    g.player.item = null;
    g.player.itemCharge = 0;

    // ---- 3-4. a DEATH hands over, and the countdown runs -------------------
    g.player.maxHealth = 9999;
    g.player.health = 0;
    t('dying starts a pass', (await until(() => g._pass, 300)) >= 0,
      'pass=' + g._pass + ' state=' + g.state);
    t('the run is not over', g.state === 'playing', g.state);
    t('the wave goes up as a challenge for Player 1',
      g.match.active === 0 && g.match.turn === 'challenge',
      'active=' + g.match.active + ' turn=' + g.match.turn);
    // THE ASSERTION THIS FILE WAS WRITTEN FOR. A countdown that does not fall
    // is a match stuck on the pass screen with nothing on the console to say so.
    const before = g.interT;
    await raw(20);
    t('THE COUNTDOWN RUNS', g.interT < before - 0.05,
      'interT ' + before.toFixed(2) + ' -> ' + g.interT.toFixed(2));

    // ---- 7. nobody is hurt mid-pass ---------------------------------------
    const hp = g.player.health;
    g._hurtPlayer(500, g.player.pos);
    g._hurtPlayerDot(500);
    t('damage during a pass is refused', g.player.health === hp,
      'hp ' + Math.round(hp) + ' -> ' + Math.round(g.player.health));

    t('the pass to Player 1 completes',
      (await until(() => !g._pass && g.waveState === 'active')) >= 0,
      'pass=' + g._pass + ' state=' + g.state + ' waveState=' + g.waveState
      + ' interT=' + g.interT.toFixed(2));
    t('the caption came down', !caption());
    t('Player 1 got their run back alive', g.player.health > 0,
      'hp=' + Math.round(g.player.health));

    // ---- 5. clearing the challenge WINS, on the wave -----------------------
    g.player.maxHealth = 9999;
    g.player.health = 9999;
    t('the challenge wave resolves',
      (await until(() => g.state === 'gameover' || g.waveState === 'intermission')) >= 0,
      'state=' + g.state + ' waveState=' + g.waveState);
    t('THE WIN IS IMMEDIATE', g.state === 'gameover' && g.match.winner === 0,
      'state=' + g.state + ' winner=' + g.match.winner);
    t('no passive item set was raised for it', !g.totemArea.active,
      g.totemArea.active ? 'RAISED' : 'none');
    t('the caption is down on the win screen', !caption());

    // ---- 6. the pass cannot be wedged --------------------------------------
    // `intermission` reached while a pass is running used to re-book the turn
    // through _endTurn on every frame, and _endTurn re-arms interT - so the
    // countdown sat at HANDOFF_TIME for as long as anyone cared to watch. The
    // state is forced here rather than reached, because no path is known to
    // reach it: the point is that the pass no longer depends on one.
    g.beginGame('versus');
    g.player.maxHealth = 9999;
    g.player.health = 9999;
    await until(() => g.waveState === 'active');
    await until(() => g.waveState === 'intermission');
    g.totemArea.dismiss();
    await until(() => g._pass);
    g.waveState = 'intermission';
    const wedged = g.interT;
    await raw(30);
    t('a forced intermission does not pin the countdown', g.interT < wedged - 0.05,
      'interT ' + wedged.toFixed(2) + ' -> ' + g.interT.toFixed(2));
    t('and the pass still finishes',
      (await until(() => !g._pass && g.waveState === 'active')) >= 0,
      'pass=' + g._pass + ' waveState=' + g.waveState + ' interT=' + g.interT.toFixed(2));
    t('with the caption down', !caption());

    // ---- 8. a REAL death, taken mid-sweep ----------------------------------
    // Everything above kills a player by writing zero into their health, which
    // is booked by the loop at the end of the frame - the one safe moment there
    // is. A round in the air books it from inside the sweep instead, and that
    // is the whole difference between the two.
    g.beginGame('versus');
    g.player.maxHealth = 9999;
    g.player.health = 9999;
    await until(() => g.waveState === 'active');
    await until(() => g.waveState === 'intermission');
    g.totemArea.dismiss();
    await until(() => g._pass);
    await until(() => !g._pass && g.waveState === 'active');
    t('Player 2 is on the controller', g.match.active === 1, 'active=' + g.match.active);

    // FOUR ROUNDS, NOT ONE. The list is walked backwards, so a single shot is
    // the last thing the walk touches and the bug hides; the rounds behind the
    // fatal one are what the loop reaches for after the list has been emptied.
    g.player.maxHealth = 20;
    g.player.health = 1;
    const at = g.player.pos;
    for (let i = 0; i < 4; i++) g._spawnProjectile(at.x + 3, 1.2, at.z + 3 + i * 0.15);
    t('four rounds are in the air', g.projectiles.length === 4, String(g.projectiles.length));

    // COUNTED FROM INSIDE THE FRAME. What has to still be turning is the
    // GAME's loop, and the page's own rAF proves nothing about it: a throw
    // inside the loop only stops the renderer from asking for another frame,
    // and the page goes on serving them to everyone else - this test included.
    // So the counter rides a call only the loop makes, and the frames below are
    // driven from the page, which is what keeps a dead loop a failure here
    // rather than a wait that never returns.
    let frames = 0;
    const hud = g._updateHud.bind(g);
    g._updateHud = () => { frames++; hud(); };
    await raw(30);
    t('the shot ended Player 2\'s turn', g._pass || g.match.active === 0,
      'pass=' + g._pass + ' active=' + g.match.active);
    t('the run did not end', g.state === 'playing', g.state);
    const framesBefore = frames;
    await raw(20);
    t('THE FRAME LOOP SURVIVED THE DEATH', frames > framesBefore + 5,
      'frames ' + framesBefore + ' -> ' + frames);

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

console.log(fails ? `VERSUS TEST FAIL (${fails})` : 'VERSUS TEST PASS');
process.exit(fails ? 1 : 0);
