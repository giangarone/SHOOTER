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
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8230;
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
    // The block's theme is PINNED, not dealt: the check below reads the
    // subtitle's colour back, and a TEMPEST block would make it vacuous -
    // TEMPEST's own hue is the cyan the subtitle falls back to, so a banner
    // that never wrote its tint would look correct to it and to the eye.
    g.setTheme('verdant');
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
    // THE THEME IS SAID IN A MATCH TOO. A match's waves all open through
    // startWave() rather than at the pick (a caption over the pass screen
    // would announce a fight the next player has not started - see
    // _cueWaveOpen), and the subtitle used to be silenced there with the
    // rest: fifty waves of two runs and never once which block of five
    // either was in. Wave 1 opens the first block, so there is a theme to
    // read the moment the match's first wave starts - and the hue is the one
    // themes.js gives that block, read back through the same custom property
    // the stylesheet does, so a banner quietly falling back to plain cyan
    // (which is one theme's actual colour and so cannot be spotted by eye)
    // fails here rather than nobody.
    {
      const sub = document.getElementById('bannersub');
      // getComputedStyle hands back rgb() notation, so the hue is compared as
      // CHANNELS rather than as a hex string.
      const got = getComputedStyle(sub).color.match(/\d+/g).map(Number);
      const want = g._themeCaptionColor(1);
      const rgb = [(want >> 16) & 255, (want >> 8) & 255, want & 255];
      t('the opening wave says the block\'s theme in a match',
        sub.classList.contains('show') && sub.textContent === g._themeCaption(1),
        '"' + sub.textContent + '"');
      t('and the theme word is in the block\'s own colour',
        got.length === 3 && got.every((c, i) => Math.abs(c - rgb[i]) <= 1),
        got.join(',') + ' vs ' + rgb.join(','));
      // Unpinned, so every match the suite opens after this one is dealt the
      // ordinary way - the pin exists for the two checks above and nothing else.
      g.setTheme(null);
    }
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
    // A FRAME FIRST, and it is not a delay for its own sake: the harness leaves
    // an empty wave behind, that wave clears on the way in, and a wave cleared
    // without taking a hit now hands the player a full bar and a full reserve
    // back (see Player.resupply). Health written before that lands is health
    // the resupply undoes, and the four rounds below would then be measuring
    // the reward rather than the walk they are here to test.
    await raw(2);
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

    // ---- 9. FOUR PLAYERS --------------------------------------------------
    //
    // The whole scenario table, walked as states. Everything above is the SEAM
    // - one run written over another - and holds whatever the player count is.
    // What is asserted here is the RULE: the ladder goes up on every clear,
    // a failure PINS the wave while everybody else attempts it, and who is
    // left afterwards.
    //
    // Driven through the real game rather than through VersusMatch on its own,
    // because the bug this is most likely to catch is not in the arithmetic -
    // it is main.js and the match disagreeing about which wave the arena is
    // building.
    const clearTurn = async () => {
      await until(() => g.waveState === 'intermission' || g.state === 'gameover');
      if (g.state === 'gameover') return;
      g.totemArea.dismiss();
      await until(() => g._pass || g.state === 'gameover');
      if (g.state === 'gameover') return;
      await until(() => !g._pass && g.waveState === 'active');
    };
    // NOTHING HERE CLEARS THE FIELD, and that is the whole of why it is
    // written out rather than reusing `until`.
    //
    // `until` empties the arena on every frame it waits, and an empty arena is
    // a CLEARED WAVE. For most turns that is harmless - the clear stops at the
    // totem pick and the death books first - but on the last contestant's turn
    // a clear is a WIN, taken by _updateWave before the death check at the end
    // of the frame ever runs. A fail helper that cleared the field would
    // therefore hand the match to the player it was asked to kill, on exactly
    // the turn that decides the match, and every assertion after it would be
    // measuring a different game. So this one waits on raw frames and leaves
    // the wave with something in it.
    const rawUntil = async (f, n = 400) => {
      for (let i = 0; i < n; i++) { if (f()) return i; await step(); }
      return f() ? n : -1;
    };
    const failTurn = async () => {
      await rawUntil(() => g.waveState === 'active');
      g.player.health = 0;
      await rawUntil(() => g._pass || g.state === 'gameover');
      if (g.state === 'gameover') return;
      await rawUntil(() => !g._pass && g.waveState === 'active');
      g.player.maxHealth = 9999; g.player.health = 9999;
    };
    // Starts a four-handed match parked on wave 7, which is where the scenario
    // table is written. The debug jump is used deliberately: it is the path a
    // person testing this will take, so a jump that desynced the arena counter
    // from the match counter would fail here rather than in someone's hands.
    const four = async () => {
      g.beginGame('versus', 4);
      g.player.maxHealth = 9999; g.player.health = 9999;
      g._debugJumpToWave(7);
      g.match.wave = 7;
      // Raw, for the reason in failTurn: this leaves a wave with a queue in it
      // rather than one that is already clear.
      await rawUntil(() => g.waveState === 'active');
      g.player.maxHealth = 9999; g.player.health = 9999;
    };

    g.beginGame('versus', 4);
    t('4P: four slots are seeded', g.match.slots.filter(Boolean).length === 4,
      String(g.match.slots.filter(Boolean).length));
    t('4P: everyone is in, P1 up', g.match.alive.join() === '0,1,2,3'
      && g.match.active === 0, 'alive=' + g.match.alive);

    // THE LADDER. One rung per clear, and the seat moves on.
    g.player.maxHealth = 9999; g.player.health = 9999;
    await until(() => g.waveState === 'active');
    await clearTurn();
    t('4P: a clear advances the wave and passes to P2',
      g.wave === 2 && g.match.wave === 2 && g.match.active === 1,
      'wave=' + g.wave + '/' + g.match.wave + ' active=' + g.match.active);
    await clearTurn();
    await clearTurn();
    await clearTurn();
    t('4P: four rungs later it is P1 again, on wave 5',
      g.match.active === 0 && g.wave === 5 && g.match.wave === 5,
      'active=' + g.match.active + ' wave=' + g.wave + '/' + g.match.wave);

    // A FAILURE PINS THE WAVE. This is the assertion the mode's whole shape
    // rests on: the contest exists to put every survivor on the SAME wave, so
    // a clear inside one must not move the counter.
    await four();
    t('4P: the debug jump moved BOTH counters',
      g.wave === 7 && g.match.wave === 7, 'wave=' + g.wave + '/' + g.match.wave);
    await failTurn();                       // P1 falls on wave 7
    t('4P: a failure opens a contest, P2 up, wave pinned',
      g.match.active === 1 && g.wave === 7 && g.match.wave === 7 && !!g.match.contest,
      'active=' + g.match.active + ' wave=' + g.wave + '/' + g.match.wave);
    t('4P: nobody is out yet', g.match.alive.length === 4, String(g.match.alive.length));
    await clearTurn();
    t('4P: a CLEAR INSIDE A CONTEST does not move the wave',
      g.wave === 7 && g.match.wave === 7 && g.match.alive.length === 4,
      'wave=' + g.wave + '/' + g.match.wave);
    await clearTurn();                      // P3 clears
    await clearTurn();                      // P4 clears - contest closes
    t('4P: three clear, one fails -> the failer alone is out',
      g.match.alive.join() === '1,2,3' && g.match.winner === -1,
      'alive=' + g.match.alive);
    t('4P: the ladder resumes ABOVE the contest wave',
      g.match.wave === 8 && g.wave === 8, 'wave=' + g.wave + '/' + g.match.wave);

    // TWO OUT AT ONCE, and the endgame of a four-handed match is a two-handed
    // one playing by the same rules.
    await four();
    await failTurn();                       // P1 falls
    await clearTurn();                      // P2 clears
    await failTurn();                       // P3 falls
    await clearTurn();                      // P4 clears - closes
    t('4P: two clear, two fail -> a 2P match at wave 8',
      g.match.alive.join() === '1,3' && g.match.wave === 8 && g.match.winner === -1,
      'alive=' + g.match.alive + ' wave=' + g.match.wave);

    // THE AMNESTY. A wave that beats the whole field eliminates nobody, and it
    // goes back to whoever failed it first - which is the four-handed shape of
    // the `retry` the two-player rules already had.
    await four();
    await failTurn();
    await failTurn();
    await failTurn();
    await failTurn();
    t('4P: everybody fails -> NOBODY is out',
      g.match.alive.length === 4 && g.match.winner === -1, 'alive=' + g.match.alive);
    t('4P: the wave is still 7, and back with the first failer',
      g.match.wave === 7 && g.wave === 7 && g.match.active === 0
      && g.match.turn === 'retry',
      'wave=' + g.wave + '/' + g.match.wave + ' active=' + g.match.active
      + ' turn=' + g.match.turn);

    // THE WIN, and the choice that is not spent being told about it.
    await four();
    await failTurn();                       // P1 falls
    await failTurn();                       // P2 falls
    await failTurn();                       // P3 falls
    t('4P: the last contestant is up to win', g.match.wouldWin() && g.match.active === 3,
      'active=' + g.match.active);
    await until(() => g.state === 'gameover' || g.waveState === 'intermission');
    t('4P: clearing it wins outright', g.state === 'gameover' && g.match.winner === 3,
      'state=' + g.state + ' winner=' + g.match.winner);
    t('4P: no passive item set was raised for the win', !g.totemArea.active,
      g.totemArea.active ? 'RAISED' : 'none');

    // ---- 10. THE CREDIT SPLIT ---------------------------------------------
    //
    // Money scales with how many players are still in, because the wave
    // counter climbs on every clear and each of them therefore fights about a
    // quarter of a four-handed run while paying its prices.
    g.beginGame('solo');
    t('$: solo pays once', g._playerMult() === 1, String(g._playerMult()));
    g.beginGame('versus', 4);
    t('$: four players pay four times', g._playerMult() === 4, String(g._playerMult()));
    g.match.alive = [0, 1];
    t('$: and TWO after two are eliminated', g._playerMult() === 2, String(g._playerMult()));

    // THE ITEM-CHARGE GUARD. _dropMoney spawns the split figure and RETURNS
    // the unsplit one, because the return value is what becomes active-item
    // charge in _collectOrb - and charge is spent inside the wave it is earned
    // in, so multiplying it is not compensation, it is four times the uptime.
    // This is the assertion that catches the two being collapsed back into one.
    const spawn = g.money.spawn.bind(g.money);
    let spawned = 0;
    g.money.spawn = (pos, amt, ...rest) => { spawned = amt; return spawn(pos, amt, ...rest); };
    g.beginGame('solo');
    g.player.rebuildMods();
    const soloRet = g._dropMoney(g.player.pos, 100, 4, 2);
    const soloSpawn = spawned;
    g.beginGame('versus', 4);
    g.player.rebuildMods();
    const fourRet = g._dropMoney(g.player.pos, 100, 4, 2);
    const fourSpawn = spawned;
    t('$: four players see 4x the money on the floor',
      Math.abs(fourSpawn - soloSpawn * 4) < 1e-6, soloSpawn + ' -> ' + fourSpawn);
    t('$: but the ITEM CHARGE figure is unchanged',
      Math.abs(fourRet - soloRet) < 1e-6, soloRet + ' vs ' + fourRet);
    // AND THE BOSS IS OUT OF IT, because it is already handed to everyone.
    g._dropMoney(g.player.pos, 100, 4, 2, undefined, false);
    t('$: an unsplit payout is paid at face value',
      Math.abs(spawned - soloSpawn) < 1e-6, soloSpawn + ' vs ' + spawned);
    g.money.spawn = spawn;

    // THE BOSS MIRROR REACHES ALL THREE. Whoever draws the boss turn is not
    // supposed to walk off with the run's largest single payout while three
    // people watch.
    g.beginGame('versus', 4);
    const before$ = g.match.slots.map((s) => s.game.credits);
    g._bossDeathPos = g.player.pos.clone();
    g._payBossBonus();
    const after$ = g.match.slots.map((s) => s.game.credits);
    const paid = g.match.alive
      .filter((i) => i !== g.match.active)
      .every((i) => after$[i] > before$[i]);
    t('$: every benched player is paid the boss bounty', paid,
      before$.join() + ' -> ' + after$.join());
    t('$: the player who fought it is not paid twice',
      after$[g.match.active] === before$[g.match.active],
      String(after$[g.match.active]));

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
