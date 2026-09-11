// THE TWENTY-SEVEN PASSIVE ITEMS ADDED AFTER THE THIRD POOL, and the five
// things about them that nothing else in the test set was watching:
//
//   1. THE BEAT AS A DAMAGE SOURCE. SYNCOPATION and HEARTBEAT are the first
//      picks in the game that put damage in the room off the MUSIC rather than
//      off the trigger, and both of them ride the pulse EDGE. The failure mode
//      is invisible in play and total in effect: a reader that samples the
//      pulse value wrong fires twice in a short frame, or never at all, and
//      either way the card is a lie. Both are asserted as a COUNT of events
//      over a known number of beats.
//   2. PARITY OF THE MAGAZINE. ODD COUPLE and EVEN BETTER read `magAtShot` -
//      what the TRIGGER saw - and the trap is that zero is an even number: a
//      BELT FED DREAM or CASH CANNON round reports zero, so a missing gate
//      turns EVEN BETTER into an unconditional bonus for exactly the two builds
//      that have no magazine at all. There is an assertion for that alone.
//   3. THE MELEE, WHICH IS NOW THREE PICKS DEEP. LONG ARM changes a reach,
//      SCYTHE changes how many bodies one swing touches, and THROAT CUT does
//      not deal damage at all - it writes the body out. Each is asserted as a
//      DIFFERENCE, because a reach that is set correctly and read nowhere looks
//      identical from outside.
//   4. THE SHIELD, WHICH NOW HAS A BAR. Three picks put points into it and
//      until this block nothing on screen said so. The HUD assertion reads the
//      actual transforms UI.setHealth writes, because "the shield is in the
//      player object" was always true and was never the bug.
//   5. THE TURRET AS A FAMILY. SHARED MAG, VENOMGRID and HELLSPITTER all read
//      the player's mods LIVE inside Turret.update, which is the opposite of
//      what the turret does with its DAMAGE - that is snapshotted at the throw.
//      Both halves of that are asserted, because the two rules sit four lines
//      apart and the wrong one is easy to copy.
//
// AND THE ONE THAT WOULD HAVE COST AN AFTERNOON: BEDBUGS books a fraction of
// every hit as a second hit. Booked through the shot path instead of through
// hurtEnemy it would arm a bite that armed a bite, and the damage from one
// magazine would grow without bound - slowly enough that it reads as a good
// build for about fifteen seconds. The `bedbugsNoCascade` assertion is the
// whole reason that one is paid where it is.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8243;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 620 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const r = await page.evaluate(async () => {
    const g = window.__game;
    g.autoTest = false;
    const P = g.player;
    const UP = g.__upgradesForTest;
    const o = {};
    const V = P.pos.constructor;
    const step = () => new Promise((res) => requestAnimationFrame(res));

    const bare = () => {
      for (const k of Object.keys(P.upgrades)) delete P.upgrades[k];
      P.rebuildMods();
      P.health = P.maxHealth;
      P.shield = 0;
      P.shieldEnd = 0;
      P.stamina = 100;
      P.staminaLocked = false;
      P.sprinting = false;
      P.aiming = false;
      P.crouching = false;
      P.sliding = false;
      P.pos.set(0, 0, 0);
      P.magAtShot = 0;
      P.lastShotCost = 1;
      P.dimeEnd = 0;
      P.fruitsLeft = 0;
      P.clearStatuses();
      P.itemCharge = 0;
      // NO BLOOM. _shotSpread opens a cone from sustained fire, and several
      // assertions below fire six hundred rounds and read the MISS rate off
      // them - a cone that grew as the burst went on would make those a
      // measure of the bloom rather than of the pick.
      P.bloom = 0;
      g._bites.length = 0;
      for (const p of g._ice) g.effects.creepRelease(p.creep);
      g._ice.length = 0;
      g._iceLaying = false;
    };
    const give = (id) => { P.upgrades[id] = 1; P.rebuildMods(); };
    const clearField = () => { g.enemies.length = 0; };
    // THE CAMERA IS THE RAY. `_firePellet` casts from the camera, not from the
    // player's yaw, and the camera is only brought into line with the player by
    // the frame loop - so a fixture that sets `P.yaw` and calls `g.shoot()`
    // fires wherever the camera happened to be left pointing, which is how an
    // entire block of this suite once measured a stream of misses. Same trick
    // test/headshot.mjs uses, and for the same reason.
    const aimAt = (e) => {
      e.group.position.copy(e.pos);
      e.group.updateMatrixWorld(true);
      const at = new V();
      e.hitbox.getWorldPosition(at);
      g.camera.position.set(P.pos.x, at.y, P.pos.z);
      g.camera.lookAt(at);
      g.camera.updateMatrixWorld(true);
    };
    /**
     * ONE ROUND, LANDED, WITH NO DICE IN IT.
     *
     * Two things make a raw `g.shoot()` a bad measuring instrument, and both of
     * them look like a broken pick rather than a broken fixture:
     *
     *   1. THE ROOM IS IN THE WAY. `shoot()` raycasts the arena as well as the
     *      bodies, and the arena is GENERATED - a crate between the fixture's
     *      player and its enemy eats the round on some layouts and not others.
     *      So the trigger is pulled again until something actually lands.
     *   2. THE CRIT IS A DIE ROLL, AND SO IS THE HEADSHOT. Every run starts on
     *      a 5% crit at 1.5x, and the cone `_shotSpread` opens means a round
     *      aimed at a body's centre clips its HEAD sphere some of the time -
     *      which doubles the number. Both are the size of the effects being
     *      measured here, so both are taken off for the shot: the crit chance
     *      is zeroed and the body's head is untagged, and each has its own
     *      suite already (test/headshot.mjs owns the second).
     *
     * `mag` is what the magazine holds for EVERY try, re-seated each time:
     * without it the retry empties the gun after thirty pulls and the last ten
     * are dry clicks - and, worse, the parity picks below read the count the
     * trigger saw, which would then be a different number on every attempt.
     *
     * @returns {number} what the body actually took, or 0 if nothing ever did.
     */
    const fireOnce = (e, hp = 1e9, mag = 30) => {
      const savedCrit = P.mods.critChance;
      P.mods.critChance = 0;
      // `head !== true` is exactly what _firePellet's head pass tests, so this
      // is the narrowest possible way to say "measure the body".
      const savedHead = e.head.userData.head;
      e.head.userData.head = false;
      let dealt = 0;
      for (let tries = 0; tries < 40 && dealt === 0; tries++) {
        e.hp = hp;
        e.maxHp = hp;
        e.dead = false;
        aimAt(e);
        P.mag = mag;
        P.fireCd = 0;
        P.reloading = 0;
        P.bloom = 0;
        g.input.shootFresh = true;
        g.shoot();
        g.input.shootFresh = false;
        dealt = hp - e.hp;
      }
      P.mods.critChance = savedCrit;
      e.head.userData.head = savedHead;
      return dealt;
    };
    const spawn = (type = 'chaser', x = 2, z = 2) => {
      const e = new g.__EnemyForTest(type, new V(x, 0, z), 40, 1, 1);
      g.scene.add(e.group);
      g.enemies.push(e);
      return e;
    };
    // THE MUSIC HAS TO RUN. Every rhythmic thing in this game hangs off
    // Music.pulse, so a helper that drives the game step directly and never
    // samples the music advances no beats at all - which would make the two
    // rhythm picks below assert nothing while appearing to pass.
    const tick = (n, dt = 0.05) => {
      for (let i = 0; i < n; i++) {
        g.time += dt;
        g.music.sample(dt);
        g._updateEnemies(dt);
      }
    };
    // Beats, without the enemy step: the two rhythm picks are read from the
    // frame loop rather than from the enemy sweep, so this is the clock they
    // actually live on.
    const beats = (n, dt = 0.05) => {
      let seen = 0;
      let last = g.music.pulse;
      for (let i = 0; i < n; i++) {
        g.time += dt;
        g.music.sample(dt);
        if (g.music.pulse !== last) {
          last = g.music.pulse;
          if (g.music.pulseWhole) seen++;
        }
        g._updateBeatPicks();
      }
      return seen;
    };

    g.state = 'playing';
    g.waveState = 'active';
    bare();

    // ---- 1. THE MUSIC -------------------------------------------------------

    // SYNCOPATION. One body, once a whole beat, for one of the player's shots.
    //
    // COUNTED AS EVENTS AGAINST BEATS. A damage total would pass just as well
    // for a pick that fired every frame and dealt a hundredth as much, which is
    // precisely the bug an edge-reader has.
    bare();
    clearField();
    const syncTarget = spawn('chaser', 3, 3);
    syncTarget.hp = 1e9;
    syncTarget.maxHp = 1e9;
    g._beatPulse = -1;
    let syncBeats = beats(200);
    o.syncBeatsBare = syncBeats;
    o.syncBareDealt = 1e9 - syncTarget.hp;
    bare();
    give('syncopation');
    syncTarget.hp = 1e9;
    g._beatPulse = -1;
    // The first edge after a pick is deliberately skipped - see _updateBeatPicks
    // - so the count is taken over a window that starts after it.
    beats(20);
    const syncBefore = syncTarget.hp;
    const syncHits = [];
    let lastHp = syncTarget.hp;
    let seenBeats = 0;
    {
      let last = g.music.pulse;
      for (let i = 0; i < 400; i++) {
        g.time += 0.05;
        g.music.sample(0.05);
        if (g.music.pulse !== last) {
          last = g.music.pulse;
          if (g.music.pulseWhole) seenBeats++;
        }
        g._updateBeatPicks();
        if (syncTarget.hp !== lastHp) { syncHits.push(1); lastHp = syncTarget.hp; }
      }
    }
    o.syncBeats = seenBeats;
    o.syncEvents = syncHits.length;
    o.syncPerEvent = syncHits.length ? (syncBefore - syncTarget.hp) / syncHits.length : 0;
    o.syncShot = P.dotHit;

    // HEARTBEAT. A coin per body per downbeat, and a flat point when it wins.
    // The assertion is that EVERY body is offered the roll, which is the half
    // that makes the pick about the size of the wave.
    bare();
    clearField();
    const beatCrowd = [];
    for (let i = 0; i < 20; i++) {
      const e = spawn('chaser', -20 + i * 2, 14);
      e.hp = 1e6;
      e.maxHp = 1e6;
      beatCrowd.push(e);
    }
    give('heartbeat');
    g._beatPulse = -1;
    const hbBeats = beats(400);
    o.hbBeats = hbBeats;
    o.hbTouched = beatCrowd.filter((e) => e.hp < 1e6).length;
    const hbTotal = beatCrowd.reduce((s, e) => s + (1e6 - e.hp), 0);
    // Twenty bodies at a fifth each is four points a beat, so the total over a
    // known number of beats is a rate that can be checked rather than a number
    // that merely has to be positive.
    o.hbPerBeat = hbBeats ? hbTotal / hbBeats : 0;
    clearField();

    // ---- 2. THE MAGAZINE, READ AS A NUMBER ----------------------------------

    // ODD COUPLE and EVEN BETTER, through the real trigger. Read off what
    // actually lands on a body, because the whole question is whether the pick
    // reaches the damage at all.
    const shotAt = (mag, keys) => {
      bare();
      for (const k of keys) P.upgrades[k] = 1;
      P.rebuildMods();
      clearField();
      const e = spawn('chaser', 0, -8);
      e.hp = 1e7;
      e.maxHp = 1e7;
      P.pos.set(0, 0, 0);
      P.reserveAmmo = 300;
      const dealt = fireOnce(e, 1e7, mag);
      clearField();
      return dealt;
    };
    o.parityBase19 = shotAt(19, []);
    o.parityBase20 = shotAt(20, []);
    o.oddOn19 = shotAt(19, ['oddCouple']);
    o.oddOn20 = shotAt(20, ['oddCouple']);
    o.evenOn20 = shotAt(20, ['evenBetter']);
    o.evenOn19 = shotAt(19, ['evenBetter']);
    o.bothOn19 = shotAt(19, ['oddCouple', 'evenBetter']);
    // THE ZERO TRAP. A round billed off the reserve reports magAtShot 0, and 0
    // is even - so without the gate EVEN BETTER would be a free +20% to a BELT
    // FED DREAM build on every shot it ever fires.
    bare();
    give('evenBetter');
    P.magAtShot = 0;
    o.evenZeroGated = true;
    {
      clearField();
      const e = spawn('chaser', 0, -8);
      e.hp = 1e7;
      e.maxHp = 1e7;
      P.upgrades.beltFedDream = 1;
      P.rebuildMods();
      P.reserveAmmo = 300;
      P.pos.set(0, 0, 0);
      o.evenBeltDealt = fireOnce(e, 1e7);
      o.evenBeltMagAtShot = P.magAtShot;
      clearField();
    }
    bare();
    {
      clearField();
      const e = spawn('chaser', 0, -8);
      e.hp = 1e7;
      e.maxHp = 1e7;
      P.upgrades.beltFedDream = 1;
      P.rebuildMods();
      P.reserveAmmo = 300;
      P.pos.set(0, 0, 0);
      o.beltPlainDealt = fireOnce(e, 1e7);
      clearField();
    }

    // HOT MAG, off the LIVE magazine - the one rate mod in the getter that
    // does, because the card says "currently".
    bare();
    P.mag = 0;
    const hotBase = P.effectiveFireRate;
    give('hotMag');
    P.mag = 0;
    o.hotEmpty = P.effectiveFireRate / hotBase;
    P.mag = 30;
    o.hotFull = P.effectiveFireRate / hotBase;
    P.mag = 15;
    o.hotHalf = P.effectiveFireRate / hotBase;
    // AND REFUSED WHERE THERE IS NO MAGAZINE. `mag` mirrors the reserve under
    // BELT FED DREAM, so a percent a round would read three hundred.
    P.upgrades.beltFedDream = 1;
    P.rebuildMods();
    P.mag = 300;
    o.hotBelted = P.effectiveFireRate / hotBase;
    bare();

    // POCKET GRENADE. The round that emptied the magazine, as a blast - so the
    // assertion is that a SECOND body, one the shot never touched, is hurt.
    const lastRoundBlast = (mag, keys) => {
      bare();
      for (const k of keys) P.upgrades[k] = 1;
      P.rebuildMods();
      clearField();
      const aim = spawn('chaser', 0, -8);
      aim.hp = 1e7; aim.maxHp = 1e7;
      const near2 = spawn('chaser', 2.2, -8);
      near2.hp = 1e7; near2.maxHp = 1e7;
      P.pos.set(0, 0, 0);
      P.reserveAmmo = 300;
      // RETRIED ON THE AIMED BODY AND READ OFF THE BYSTANDER. fireOnce's own
      // retry cannot serve here: what is under test is the BLAST, so both
      // bodies have to be reset together on every attempt and the reading
      // taken from the try that actually landed. A fixture that fired once and
      // read the bystander is a fixture that reports "no blast" every time the
      // generated room happens to put a crate in the way.
      const savedCrit = P.mods.critChance;
      P.mods.critChance = 0;
      aim.head.userData.head = false;
      let aimed = 0;
      for (let tries = 0; tries < 40 && aimed === 0; tries++) {
        aim.hp = 1e7; aim.maxHp = 1e7; aim.dead = false;
        near2.hp = 1e7; near2.maxHp = 1e7; near2.dead = false;
        aimAt(aim);
        P.mag = mag;
        P.fireCd = 0;
        P.reloading = 0;
        P.bloom = 0;
        g.input.shootFresh = true;
        g.shoot();
        g.input.shootFresh = false;
        aimed = 1e7 - aim.hp;
      }
      P.mods.critChance = savedCrit;
      const out = { aimed, bystander: 1e7 - near2.hp };
      clearField();
      return out;
    };
    o.pocketLastBare = lastRoundBlast(1, []);
    o.pocketLast = lastRoundBlast(1, ['pocketGrenade']);
    o.pocketMid = lastRoundBlast(20, ['pocketGrenade']);

    // PRODIGAL ROUNDS. A shot that touched NOTHING comes back, and one that hit
    // does not - which is the whole line between this and BRASS ECHO.
    const missRate = (aimAtBody) => {
      bare();
      give('prodigalRounds');
      clearField();
      P.pos.set(0, 0, 0);
      if (aimAtBody) {
        // A TANK AT FIVE METRES. The hit case asserts that NOT ONE of six
        // hundred rounds is paid back, so the target has to be one the cone
        // cannot miss - a chaser at eight metres is a body the spread clips the
        // edge of often enough to make the assertion a dice roll.
        const e = spawn('tank', 0, -5);
        e.hp = 1e9; e.maxHp = 1e9;
        aimAt(e);
      } else {
        // STRAIGHT UP, where there is nothing at all: the arena's ceiling is a
        // raycast target, so this is a shot that stops on geometry and touches
        // no body - which is exactly what the card means by a miss.
        g.camera.position.set(0, 1.6, 0);
        g.camera.lookAt(0, 40, 0);
        g.camera.updateMatrixWorld(true);
      }
      let back = 0;
      for (let i = 0; i < 600; i++) {
        P.mag = 30;
        P.reserveAmmo = 100;
        P.fireCd = 0;
        P.reloading = 0;
        const before = P.reserveAmmo;
        g.input.shootFresh = true;
        g.shoot();
        g.input.shootFresh = false;
        if (P.reserveAmmo > before) back++;
      }
      clearField();
      return back / 600;
    };
    o.prodigalMissRate = missRate(false);
    o.prodigalHitRate = missRate(true);

    // FULL LOAD. The reserve AND the magazine, which is the part no other
    // refill in the game does for free.
    bare();
    give('fullLoad');
    P.reserveAmmo = 10;
    P.mag = 3;
    P.reloading = 1.2;
    o.fullLoadGave = g._fullLoad();
    o.fullLoadReserve = P.reserveAmmo + P.mag;
    o.fullLoadMag = P.mag === P.magSize;
    o.fullLoadCancelledReload = P.reloading === 0;
    // A PLAYER ALREADY FULL IS NOT TOLD ABOUT IT. The banner line is folded
    // into the clear caption, and a line announcing nothing is noise.
    o.fullLoadQuiet = g._fullLoad();
    bare();
    o.fullLoadUnowned = g._fullLoad();

    // ---- 3. THE MELEE -------------------------------------------------------

    // LONG ARM. Asserted as a DIFFERENCE across the SAME distance: a body at
    // six metres is out of reach bare and in reach with the pick, which is the
    // only form of this that a mis-set constant cannot pass.
    const swingAt = (dist, keys) => {
      bare();
      for (const k of keys) P.upgrades[k] = 1;
      P.rebuildMods();
      clearField();
      const e = spawn('chaser', 0, -dist);
      e.hp = 1e7; e.maxHp = 1e7;
      P.pos.set(0, 0, 0);
      P.yaw = 0;
      P.meleeCd = 0;
      g._meleeStrike();
      const dealt = 1e7 - e.hp;
      clearField();
      return dealt;
    };
    o.reachNearBare = swingAt(2.5, []);
    o.reachFarBare = swingAt(6.0, []);
    o.reachFarLong = swingAt(6.0, ['longArm']);
    o.reachWayOut = swingAt(9.0, ['longArm']);

    // SCYTHE. Everything in the ARC, at the FULL number - not a share of it,
    // which is what separates it from SHARED PAIN.
    const sweep = (keys) => {
      bare();
      for (const k of keys) P.upgrades[k] = 1;
      P.rebuildMods();
      clearField();
      // Three in the arc in front, one squarely behind.
      const arc = [spawn('chaser', 0, -2.6), spawn('chaser', -1.4, -2.4),
        spawn('chaser', 1.4, -2.4)];
      const behind = spawn('chaser', 0, 2.6);
      for (const e of arc.concat(behind)) { e.hp = 1e7; e.maxHp = 1e7; }
      P.pos.set(0, 0, 0);
      P.yaw = 0;
      P.meleeCd = 0;
      g._meleeStrike();
      const out = {
        hit: arc.filter((e) => e.hp < 1e7).length,
        dealt: arc.map((e) => 1e7 - e.hp).filter((d) => d > 0),
        behind: 1e7 - behind.hp,
      };
      clearField();
      return out;
    };
    o.sweepBare = sweep([]);
    o.sweepScythe = sweep(['scythe']);

    // THROAT CUT. It does not DEAL damage, it writes the body out - which is
    // the only reading under which "instantly kills" survives armour. Asserted
    // against a Colossus, whose plating is what breaks the naive version.
    const cutTest = (frac, type, keys) => {
      bare();
      for (const k of keys) P.upgrades[k] = 1;
      P.rebuildMods();
      clearField();
      const e = spawn(type, 0, -2.4);
      e.hp = e.maxHp * frac;
      P.pos.set(0, 0, 0);
      P.yaw = 0;
      P.meleeCd = 0;
      g._meleeStrike();
      const out = { dead: e.dead, left: e.hp / e.maxHp };
      clearField();
      return out;
    };
    o.cutJustUnder = cutTest(0.45, 'chaser', ['throatCut']);
    o.cutJustOver = cutTest(0.55, 'chaser', ['throatCut']);
    o.cutBare = cutTest(0.45, 'chaser', []);
    // A BOSS IS REFUSED OUTRIGHT. Any boss will do; the flag is what is tested.
    o.cutBoss = (() => {
      bare();
      give('throatCut');
      clearField();
      const e = spawn('chaser', 0, -2.4);
      e.boss = true;
      e.hp = e.maxHp * 0.1;
      P.pos.set(0, 0, 0);
      P.yaw = 0;
      P.meleeCd = 0;
      const out = g._throatCut(e);
      clearField();
      return out;
    })();
    // AND IT REACHES EVERY BODY A SCYTHE SWEEP TOUCHED, not just the target.
    o.cutSweep = (() => {
      bare();
      P.upgrades.throatCut = 1;
      P.upgrades.scythe = 1;
      P.rebuildMods();
      clearField();
      const arc = [spawn('chaser', 0, -2.6), spawn('chaser', -1.4, -2.4),
        spawn('chaser', 1.4, -2.4)];
      for (const e of arc) e.hp = e.maxHp * 0.2;
      P.pos.set(0, 0, 0);
      P.yaw = 0;
      P.meleeCd = 0;
      g._meleeStrike();
      const n = arc.filter((e) => e.dead).length;
      clearField();
      return n;
    })();

    // ---- 4. THE SHIELD, AND THE BAR IT IS NOW DRAWN ON ----------------------

    // BALLAST TANKS. A FLOOR and not a write, which is what stops the pick
    // punishing the one build most likely to own it.
    bare();
    give('ballastTanks');
    P.shield = 0;
    P.armWaveGrants();
    o.ballastOpen = P.shield;
    o.ballastNoClock = P.shieldEnd;
    P.shield = 80;
    P.armWaveGrants();
    o.ballastKeepsMore = P.shield;
    P.shield = 10;
    P.armWaveGrants();
    o.ballastLiftsLess = P.shield;
    bare();
    P.armWaveGrants();
    o.ballastUnowned = P.shield;

    // THE HUD. Read off the transforms UI.setHealth actually writes, because
    // "the number is on the player" was always true and was never the bug.
    const bar = () => {
      const hp = g.ui.hpBar.style.transform;
      const sh = g.ui.hpShield.style.transform;
      const num = (s, key) => {
        const m = s.match(new RegExp(key + '\\(([-\\d.]+)'));
        return m ? parseFloat(m[1]) : null;
      };
      return {
        hp: num(hp, 'scaleX'),
        shield: num(sh, 'scaleX'),
        offset: num(sh, 'translateX'),
        text: g.ui.hpText.textContent,
      };
    };
    g.ui._c = {};
    g.ui.setHealth(100, 100, 0);
    o.barNoShield = bar();
    g.ui._c = {};
    g.ui.setHealth(100, 100, 50);
    o.barFullPlusShield = bar();
    g.ui._c = {};
    g.ui.setHealth(50, 100, 50);
    o.barHalfPlusShield = bar();
    g.ui._c = {};
    // ONE POINT IS STILL A CELL. A reserve the player owns and cannot see is a
    // reserve they will not spend.
    g.ui.setHealth(100, 100, 1);
    o.barOnePoint = bar();

    // PLASMA BAG, through the crate's OWN apply() - a test that re-implemented
    // the payload would be asserting on its own copy of the thing under test.
    const crate = () => g.__powerupsForTest.health.apply(P, g.time);
    bare();
    P.health = 50;
    crate();
    o.crateShieldBare = P.shield;
    bare();
    give('plasmaBag');
    P.health = 50;
    crate();
    o.crateShieldOne = P.shield;
    crate();
    o.crateShieldTwo = P.shield;
    o.crateShieldNoClock = P.shieldEnd;
    // AND THE PLATE IS NO LONGER WITHHELD AT A FULL BAR, because a crate
    // carrying shield CAN be spent up there.
    // SAMPLED, NOT ASKED ONCE. forcedDrop is a PROPORTIONAL draw over whatever
    // is still eligible (see its note), so one call is a die roll: what is
    // being asserted is that the health plate is in the draw at all, and the
    // only honest way to read that is over a run of them.
    const healthDraws = () => {
      P.health = P.maxHealth;
      P.reserveAmmo = P.maxReserve;
      P.mag = P.magSize;
      P.item = null;
      let n = 0;
      for (let i = 0; i < 300; i++) if (g._pinataKind() === 'health') n++;
      return n;
    };
    bare();
    o.healthDrawsBare = healthDraws();
    bare();
    give('plasmaBag');
    o.healthDrawsWithBag = healthDraws();
    bare();

    // ---- 5. STAYING ALIVE ---------------------------------------------------

    // FLOW RELOAD, on the rounds ARRIVING. Driven through the real reload so
    // the edge under test is the one the game uses.
    //
    // AND SOMETHING HAS TO BE ALIVE WHILE IT RUNS. This is the one block above
    // the shooting fixtures that turns the REAL frame loop, and an empty field
    // is a cleared wave: the arena sinks, the totems rise, and every later
    // fixture's round stops on a pedestal that was not there when it was
    // written. One body parked far away keeps the wave open and nothing else.
    const keepWaveOpen = () => {
      clearField();
      const keeper = spawn('chaser', 0, -34);
      keeper.hp = 1e9;
      keeper.maxHp = 1e9;
      return keeper;
    };
    bare();
    give('flowReload');
    keepWaveOpen();
    P.mag = 1;
    P.reserveAmmo = 100;
    P.invulnEnd = 0;
    P.flowFx = false;
    P.startReload();
    o.flowMidReload = P.invulnEnd;
    // POLLED, NOT SLEPT. The window is one second long and a reload is under
    // two, so a fixture that steps a fixed ninety frames and then reads the
    // clock is reading a window that has already closed - which looks exactly
    // like the pick never firing.
    o.flowWindow = 0;
    for (let i = 0; i < 200; i++) {
      await step();
      if (P.invulnEnd > 0) { o.flowWindow = P.invulnEnd - g.time; break; }
    }
    o.flowAfter = P.invulnEnd > g.time;
    bare();
    keepWaveOpen();
    P.mag = 1;
    P.reserveAmmo = 100;
    P.invulnEnd = 0;
    P.startReload();
    for (let i = 0; i < 90; i++) await step();
    o.flowUnowned = P.invulnEnd;
    clearField();
    // AND THE ROOM IS PUT BACK THE WAY THE FIXTURES BELOW EXPECT IT. A totem
    // set that DID rise would otherwise stand in front of the player for the
    // rest of the suite.
    g.totemArea.dismiss();
    g.mysteryBox.dismiss();
    g.waveState = 'active';
    g.state = 'playing';

    // BELLOWS. FULL means full - a hard line, not a band.
    bare();
    const guardBase = P.incomingMult;
    give('bellows');
    P.stamina = 100;
    o.bellowsFull = P.incomingMult / guardBase;
    P.stamina = 99;
    o.bellowsNearlyFull = P.incomingMult / guardBase;
    P.stamina = 10;
    o.bellowsEmpty = P.incomingMult / guardBase;
    P.stamina = 100;

    // STERILE FIELD. A heal worth a WHOLE POINT cleanses; a per-frame trickle
    // does not, which is the difference between this pick and IRON LUNG.
    bare();
    give('sterileField');
    P.applyStatus('poison', 8);
    P.applyStatus('fire', 5);
    P.health = 10;
    P.heal(0.02);
    o.sterileTrickleKept = P.hasStatus('poison') && P.hasStatus('fire');
    P.heal(25);
    o.sterileHealCleansed = !P.hasStatus('poison') && !P.hasStatus('fire');
    // AND A HEAL THAT FIT NOWHERE STILL CLEANSES: the player spent it either way.
    P.applyStatus('poison', 8);
    P.health = P.maxHealth;
    P.heal(25);
    o.sterileFullBarCleansed = !P.hasStatus('poison');
    bare();
    P.applyStatus('poison', 8);
    P.health = 10;
    P.heal(25);
    o.sterileUnowned = P.hasStatus('poison');
    P.clearStatuses();

    // CRASH CART. A FLOOR at the bottom of the bar, through the crate's own
    // apply() - so FIRE SALE, SLOW RELEASE and GRISTLE all still see it.
    bare();
    give('crashCart');
    P.health = 15;
    crate();
    o.crashLow = P.health;
    bare();
    give('crashCart');
    P.health = 25;
    crate();
    o.crashAbove = P.health;
    bare();
    P.health = 15;
    crate();
    o.crashUnowned = P.health;

    // ---- 6. WHAT YOUR SHOTS CARRY -------------------------------------------

    // BEDBUGS. A quarter of the hit, two seconds on, and the bite CANNOT arm
    // another bite - which is the assertion this whole file exists for.
    bare();
    give('bedbugs');
    clearField();
    const bugTarget = spawn('chaser', 0, -8);
    bugTarget.hp = 1e9;
    bugTarget.maxHp = 1e9;
    P.pos.set(0, 0, 0);
    P.mag = 30;
    P.reserveAmmo = 300;
    // FIRED THROUGH THE RETRY, and the bites booked by the rounds that were
    // eaten by the room are dropped with them: only the pull that LANDED is
    // the one under test.
    g._bites.length = 0;
    const bugImmediate = fireOnce(bugTarget);
    g._bites = g._bites.filter((b) => b.en === bugTarget);
    o.bedbugsBooked = g._bites.length;
    o.bedbugsOwed = g._bites.length ? g._bites[0].dmg : 0;
    o.bedbugsShot = bugImmediate;
    // Nothing lands before the delay is up.
    g.time += 1.0;
    g._updateBites();
    o.bedbugsEarly = (1e9 - bugTarget.hp) === bugImmediate;
    g.time += 1.5;
    g._updateBites();
    o.bedbugsBite = (1e9 - bugTarget.hp) - bugImmediate;
    // AND NOTHING NEW WAS BOOKED BY IT. A bite that armed a bite would leave
    // the list non-empty here, and the damage from one magazine would grow
    // without bound.
    o.bedbugsNoCascade = g._bites.length === 0;
    // A BITE OWED TO A CORPSE IS DROPPED, on DELAYED FUSE's terms.
    g._bites.length = 0;
    fireOnce(bugTarget);
    const owedToDead = g._bites.length;
    bugTarget.dead = true;
    g.time += 3;
    g._updateBites();
    o.bedbugsDroppedOnDeath = owedToDead > 0 && g._bites.length === 0;
    clearField();

    // SPLASHBACK. What is on the PLAYER, on the body they hit - and only the
    // four statuses an enemy can actually carry.
    bare();
    give('splashback');
    clearField();
    const splashTarget = spawn('chaser', 0, -8);
    splashTarget.hp = 1e9;
    splashTarget.maxHp = 1e9;
    P.applyStatus('poison', 8);
    P.applyStatus('fire', 5);
    P.applyStatus('slowness', 6);
    P.pos.set(0, 0, 0);
    P.mag = 30;
    P.reserveAmmo = 300;
    fireOnce(splashTarget);
    o.splashPoison = splashTarget.status.poison > 0;
    o.splashBurn = splashTarget.status.burn > 0;
    o.splashSlow = splashTarget.status.slow > 0;
    o.splashPower = splashTarget._dot ? splashTarget._dot.poison : 0;
    // WEAKNESS AND CURSE HAVE NO ENEMY FORM. Carrying them alone must land
    // nothing at all rather than throwing or inventing a status.
    clearField();
    const splashOnly = spawn('chaser', 0, -8);
    splashOnly.hp = 1e9;
    splashOnly.maxHp = 1e9;
    P.clearStatuses();
    P.applyStatus('weakness', 8);
    P.applyStatus('curse', 8);
    P.mag = 30;
    P.reserveAmmo = 300;
    fireOnce(splashOnly);
    o.splashNothingTransferable =
      splashOnly.status.poison === 0 && splashOnly.status.burn === 0
      && splashOnly.status.slow === 0 && splashOnly.status.fear === 0;
    P.clearStatuses();
    clearField();
    // AND A CLEAN PLAYER PUTS NOTHING ON ANYTHING.
    bare();
    give('splashback');
    const splashClean = spawn('chaser', 0, -8);
    splashClean.hp = 1e9;
    splashClean.maxHp = 1e9;
    P.mag = 30;
    P.reserveAmmo = 300;
    fireOnce(splashClean);
    o.splashCleanPlayer = splashClean.status.poison === 0 && splashClean.status.burn === 0;
    clearField();

    // ---- 7. THE TURRETS -----------------------------------------------------

    // One turret, driven through its own update on a real pulse edge. The
    // context is the game's own, so what is under test is the code the arena
    // runs rather than a re-implementation of it.
    // QUORUM IS HOW A TURRET IS STOOD UP WITHOUT AN ITEM PRESS. _quorumTurret
    // refuses outright at quorumMax 0, so the pick has to be owned for any of
    // this block to have a gun to test - it changes nothing else here, because
    // its own counter only ever moves on a kill.
    const fireTurret = (keys, reserve) => {
      bare();
      P.upgrades.quorum = 1;
      for (const k of keys) P.upgrades[k] = 1;
      P.rebuildMods();
      clearField();
      for (const d of g._deployed) d.destroy();
      g._deployed.length = 0;
      P.reserveAmmo = reserve;
      const mark = spawn('chaser', 4, 4);
      mark.hp = 1e9;
      mark.maxHp = 1e9;
      g._quorumTurret();
      const t = g._deployed.find((d) => d.quorum);
      if (!t) return null;
      t.pos.set(2, 0, 2);
      const ctx = g._deployCtx;
      ctx.obstacles = [];
      // TWO EDGES: the first is swallowed by the turret's own first-pulse guard
      // (see Turret.update), so the shot under test is the second.
      let fired = 0;
      let before = mark.hp;
      for (let i = 0; i < 3; i++) {
        ctx.pulse = 100 + i;
        ctx.pulseWhole = i % 2 === 0;
        ctx.time = g.time;
        t.update(0.016, ctx);
        if (mark.hp < before) { fired++; before = mark.hp; }
      }
      const out = {
        fired,
        dealt: 1e9 - mark.hp,
        reserveLeft: P.reserveAmmo,
        poison: mark.status.poison,
        burn: mark.status.burn,
        snapshot: t.damage,
      };
      for (const d of g._deployed) d.destroy();
      g._deployed.length = 0;
      clearField();
      return out;
    };
    o.turretBare = fireTurret([], 300);
    o.turretShared = fireTurret(['sharedMag'], 300);
    o.turretSharedDry = fireTurret(['sharedMag'], 0);
    o.turretVenom = fireTurret(['venomgrid'], 300);
    o.turretHell = fireTurret(['hellspitter'], 300);
    // THE DAMAGE IS SNAPSHOTTED AND THE PICKS ARE LIVE. Two rules four lines
    // apart, and copying the wrong one is the easy mistake - so both halves are
    // asserted here.
    o.turretLiveMods = (() => {
      bare();
      give('quorum');
      clearField();
      for (const d of g._deployed) d.destroy();
      g._deployed.length = 0;
      P.reserveAmmo = 300;
      const mark = spawn('chaser', 4, 4);
      mark.hp = 1e9; mark.maxHp = 1e9;
      g._quorumTurret();
      const t = g._deployed.find((d) => d.quorum);
      t.pos.set(2, 0, 2);
      const snap = t.damage;
      // Claimed AFTER the turret was standing.
      give('venomgrid');
      const ctx = g._deployCtx;
      ctx.obstacles = [];
      for (let i = 0; i < 3; i++) {
        ctx.pulse = 200 + i;
        ctx.pulseWhole = i % 2 === 0;
        t.update(0.016, ctx);
      }
      const out = { poisoned: mark.status.poison > 0, sameDamage: t.damage === snap };
      for (const d of g._deployed) d.destroy();
      g._deployed.length = 0;
      clearField();
      return out;
    })();

    // ---- 8. THE FLOOR -------------------------------------------------------

    // VINTAGE ORBS. Read through the field's own payout, at a known age.
    bare();
    const M = g.money;
    M.clear();
    M.setVintage(0);
    M.setLifetime(20);
    M._add(0, 0.4, 0, 0, 0, 0, 100, 0);
    M.time = M.born[0] + 10;
    o.vintageOffValue = M._worth(0);
    M.setVintage(0.01);
    o.vintageTenSeconds = M._worth(0);
    M.time = M.born[0];
    o.vintageFresh = M._worth(0);
    // CLAMPED AT THE FUSE, which is what makes the ceiling a fact about the
    // code rather than about the despawn sweep's timing.
    M.time = M.born[0] + 1000;
    o.vintageCapped = M._worth(0);
    // AND FIRE SALE'S SHORTER FUSE IS A SHORTER CEILING, which is the honest
    // reading: the bonus is paid for time on the floor and that pick halves it.
    M.setLifetime(10);
    o.vintageShortFuse = M._worth(0);
    M.setVintage(0);
    M.setLifetime(20);
    M.clear();

    // FIRST FRUITS. Armed by the wave, spent by kills, and never banked.
    bare();
    give('firstFruits');
    P.fruitsLeft = 0;
    P.armWaveGrants();
    o.fruitsArmed = P.fruitsLeft;
    P.fruitsLeft = 1;
    P.armWaveGrants();
    o.fruitsNotBanked = P.fruitsLeft;
    bare();
    P.armWaveGrants();
    o.fruitsUnowned = P.fruitsLeft;

    // COLD FOOT. Laid by the SPRINT, and it slows rather than burning.
    bare();
    give('coldFoot');
    P.pos.set(0, 0, 0);
    P.sprinting = false;
    g._iceLaying = false;
    g._updateIce(0.05);
    o.iceNotSprinting = g._ice.length;
    P.sprinting = true;
    g._updateIce(0.05);
    o.iceFirstPatch = g._ice.length;
    for (let i = 1; i <= 8; i++) {
      P.pos.set(i * 1.2, 0, 0);
      g._updateIce(0.05);
    }
    o.iceTrail = g._ice.length;
    // AND WHAT STANDS IN IT IS SLOWED AND NOT HURT.
    clearField();
    const chilled = spawn('chaser', 0, 0);
    chilled.pos.copy(g._ice[0] ? new V(g._ice[0].x, 0, g._ice[0].z) : new V(0, 0, 0));
    chilled.hp = 1e7;
    chilled.maxHp = 1e7;
    g._updateIce(0.05);
    o.iceSlows = chilled.status.slow > 0;
    o.iceDoesNotHurt = chilled.hp === 1e7;
    clearField();
    for (const p of g._ice) g.effects.creepRelease(p.creep);
    g._ice.length = 0;

    // ---- 9. THE ITEM SLOT ---------------------------------------------------

    // JUMPER CABLES. On a BLOW and not on a tick, which is the line that makes
    // it a pick rather than a way to farm charge by standing in lava.
    bare();
    give('jumperCables');
    P.item = 'itemHeal';
    P.itemCharge = 0;
    P.health = P.maxHealth;
    g._hurtPlayer(5, new V(0, 1, 3));
    o.cablesOnHit = P.itemCharge;
    P.itemCharge = 0;
    g._hurtPlayerDot(5);
    o.cablesOnDot = P.itemCharge;
    bare();
    P.item = 'itemHeal';
    P.itemCharge = 0;
    P.health = P.maxHealth;
    g._hurtPlayer(5, new V(0, 1, 3));
    o.cablesUnowned = P.itemCharge;

    // DIME NOVEL. Off the PRESS, and the window is read at the roll.
    bare();
    give('dimeNovel');
    P.item = 'itemHeal';
    P.itemCharge = 999;
    P.dimeEnd = 0;
    P.aiming = false;
    P.trueStrikeLeft = 0;
    P.dominoNext = false;
    const rollRate = () => {
      let hits = 0;
      for (let i = 0; i < 20000; i++) if (P.rollCrit()) hits++;
      return hits / 20000;
    };
    o.dimeBefore = rollRate();
    g.tryItem();
    o.dimeArmed = P.dimeEnd - g.time;
    o.dimeAfter = rollRate();
    // AND IT ENDS. The window is read off the frame clock, so winding the clock
    // past it is the whole test.
    P.dimeEnd = P.now - 1;
    o.dimeLapsed = rollRate();
    bare();

    // ---- 10. THE POOL -------------------------------------------------------

    const NEWKEYS = [
      'syncopation', 'heartbeat',
      'oddCouple', 'evenBetter', 'hotMag', 'pocketGrenade', 'prodigalRounds',
      'fullLoad',
      'longArm', 'scythe', 'throatCut',
      'ballastTanks', 'plasmaBag',
      'flowReload', 'bellows', 'sterileField', 'crashCart',
      'bedbugs', 'splashback',
      'sharedMag', 'venomgrid', 'hellspitter',
      'vintageOrbs', 'firstFruits', 'coldFoot',
      'jumperCables', 'dimeNovel',
    ];
    o.newCount = NEWKEYS.length;
    o.missing = NEWKEYS.filter((k) => !UP[k]);
    o.notSingleTier = NEWKEYS.filter((k) => UP[k] && UP[k].max !== 1);
    // NO TWO NAMES ALIKE, across the passive pool AND the item pool. This is
    // the assertion that caught IRON LUNG twice and EMERGENCY RATIONS nearly
    // twice: two things called the same thing in the HUD is a player who cannot
    // tell what they are carrying.
    const names = {};
    o.nameClashes = [];
    for (const [k, d] of Object.entries(UP)) {
      if (names[d.name]) o.nameClashes.push(d.name + ': ' + names[d.name] + '/' + k);
      names[d.name] = k;
    }
    for (const [k, d] of Object.entries(g.__itemsForTest)) {
      if (names[d.name]) o.nameClashes.push(d.name + ': ' + names[d.name] + '/' + k);
      names[d.name] = k;
    }
    // NO NEW COLOUR ALREADY IN USE. Scoped to the new keys, the way the two
    // pools before it scope theirs: six pairs in the OLD pool share a value and
    // every one of them is deliberate - a pick and the status it belongs to.
    const isNew = new Set(NEWKEYS);
    const held = {};
    for (const [k, d] of Object.entries(UP)) {
      if (!isNew.has(k)) (held[d.theme] = held[d.theme] || []).push(k);
    }
    o.themeClashes = [];
    for (const k of NEWKEYS) {
      const t = UP[k].theme;
      if (held[t]) o.themeClashes.push(k + '/' + held[t][0]);
      (held[t] = held[t] || []).push(k);
    }

    // ---- 11. ALL TWENTY-SEVEN AT ONCE, THROUGH A REAL LOOP ------------------

    //
    // Every new pick owned, a crowd on the floor, the trigger down, the music
    // running and the actual frame loop turning - so the beat readers, the ice
    // trail, the bite sweep, the melee sweep, the turret and the per-hit path
    // are all exercised together rather than each being poked in isolation.
    bare();
    for (const k of NEWKEYS) P.upgrades[k] = 1;
    P.rebuildMods();
    clearField();
    // FAR ENOUGH TO CLOSE, NOT CLOSE ENOUGH TO SWARM: what is under test is
    // that twenty-seven picks can run in one frame, not that the build wins.
    for (let i = 0; i < 5; i++) spawn('chaser', -6 + i * 3, -20);
    P.health = P.maxHealth;
    P.stamina = 100;
    P.sprinting = true;
    P.mag = 3;
    P.reserveAmmo = 200;
    P.item = 'itemHeal';
    P.itemCharge = 999;
    g.input.shoot = true;
    g.state = 'playing';
    for (let i = 0; i < 90; i++) await step();
    g.input.shoot = false;
    P.sprinting = false;
    o.survived = true;
    o.aliveAfter = P.health > 0;
    o.stateAfter = g.state;
    // AND THE ZONES DRAIN. Ice holds a creep handle out of a pool thirty deep,
    // and a trail that never released one would starve every other zone in the
    // game after two waves.
    for (const p of g._ice) g.effects.creepRelease(p.creep);
    g._ice.length = 0;
    g._bites.length = 0;
    o.iceDrained = g._ice.length === 0;

    return o;
  });

  // ---- the music ----
  ok('the beat clock actually advances', r.syncBeats > 8, String(r.syncBeats));
  ok('syncopation does nothing unowned', r.syncBareDealt === 0, String(r.syncBareDealt));
  // ONCE A BEAT, NOT ONCE A FRAME. The count is what this suite exists to
  // check: a reader that fired per frame would be off by a factor of forty.
  ok('and fires exactly once per whole beat', r.syncEvents === r.syncBeats,
    `events=${r.syncEvents} beats=${r.syncBeats}`);
  ok('and each one is worth a shot of the player’s own',
    r.syncShot > 0 && near(r.syncPerEvent / r.syncShot, 1, 0.02),
    `per=${r.syncPerEvent} shot=${r.syncShot}`);

  ok('heartbeat reaches every body in the room', r.hbTouched === 20, String(r.hbTouched));
  // Twenty bodies at a fifth each is four a beat. A wide band: it is a coin
  // toss twenty times a beat and the point is the RATE, not the sample.
  ok('and pays about a fifth of them a point each',
    Math.abs(r.hbPerBeat - 4) < 1.2, `${r.hbPerBeat} per beat over ${r.hbBeats}`);

  // ---- the magazine ----
  ok('an odd magazine is worth nothing on its own',
    near(r.parityBase19, r.parityBase20, 0.01),
    `19=${r.parityBase19} 20=${r.parityBase20}`);
  ok('odd couple pays +20% on nineteen rounds',
    near(r.oddOn19 / r.parityBase19, 1.2, 0.01), String(r.oddOn19 / r.parityBase19));
  ok('and nothing on twenty', near(r.oddOn20 / r.parityBase20, 1, 0.01),
    String(r.oddOn20 / r.parityBase20));
  ok('even better pays +20% on twenty',
    near(r.evenOn20 / r.parityBase20, 1.2, 0.01), String(r.evenOn20 / r.parityBase20));
  ok('and nothing on nineteen', near(r.evenOn19 / r.parityBase19, 1, 0.01),
    String(r.evenOn19 / r.parityBase19));
  ok('and holding both pays exactly one of them',
    near(r.bothOn19 / r.parityBase19, 1.2, 0.01), String(r.bothOn19 / r.parityBase19));
  // THE ZERO TRAP, and it is the assertion this pair most needs: a round billed
  // straight off the reserve reports magAtShot 0, and 0 is an even number.
  ok('a belt-fed round reports no magazine at all', r.evenBeltMagAtShot === 0,
    String(r.evenBeltMagAtShot));
  ok('and even better pays it nothing',
    near(r.evenBeltDealt, r.beltPlainDealt, 0.01),
    `with=${r.evenBeltDealt} without=${r.beltPlainDealt}`);

  ok('hot mag pays nothing on an empty magazine', near(r.hotEmpty, 1), String(r.hotEmpty));
  ok('and +30% on a full one', near(r.hotFull, 1.3, 0.001), String(r.hotFull));
  ok('and half that at half a magazine', near(r.hotHalf, 1.15, 0.001), String(r.hotHalf));
  ok('and nothing at all to a build with no magazine', near(r.hotBelted, 1),
    String(r.hotBelted));

  ok('pocket grenade does nothing unowned', r.pocketLastBare.bystander === 0,
    String(r.pocketLastBare.bystander));
  ok('and the last round catches a body the shot never touched',
    r.pocketLast.bystander > 0, String(r.pocketLast.bystander));
  ok('and a round from the middle of the magazine does not',
    r.pocketMid.bystander === 0, String(r.pocketMid.bystander));

  ok('prodigal rounds pays back about a fifth of misses',
    Math.abs(r.prodigalMissRate - 0.2) < 0.05, String(r.prodigalMissRate));
  ok('and never pays for a shot that connected', r.prodigalHitRate === 0,
    String(r.prodigalHitRate));

  ok('full load fills the reserve', r.fullLoadReserve >= 300, String(r.fullLoadReserve));
  ok('and the magazine with it', r.fullLoadMag);
  ok('and cancels a reload that was in flight', r.fullLoadCancelledReload);
  ok('and says nothing to a player already full', r.fullLoadQuiet === 0,
    String(r.fullLoadQuiet));
  ok('and does nothing unowned', r.fullLoadUnowned === 0, String(r.fullLoadUnowned));

  // ---- the melee ----
  ok('a bare swing reaches a body at 2.5m', r.reachNearBare > 0, String(r.reachNearBare));
  ok('and does not reach one at 6m', r.reachFarBare === 0, String(r.reachFarBare));
  ok('long arm reaches the same body at 6m', r.reachFarLong > 0, String(r.reachFarLong));
  ok('and still stops somewhere', r.reachWayOut === 0, String(r.reachWayOut));

  ok('a bare swing takes exactly one body in the arc', r.sweepBare.hit === 1,
    String(r.sweepBare.hit));
  ok('scythe takes all three', r.sweepScythe.hit === 3, String(r.sweepScythe.hit));
  // THE FULL NUMBER AND NOT A SHARE OF IT, which is what separates this pick
  // from SHARED PAIN - a split would show as three unequal, smaller figures.
  ok('and every one of them takes the same full blow',
    r.sweepScythe.dealt.length === 3
      && Math.abs(Math.max(...r.sweepScythe.dealt) - Math.min(...r.sweepScythe.dealt)) < 0.01
      && near(r.sweepScythe.dealt[0], r.sweepBare.dealt[0], 0.01),
    r.sweepScythe.dealt.map((d) => Math.round(d)).join('/'));
  ok('and nothing behind the player', r.sweepScythe.behind === 0,
    String(r.sweepScythe.behind));

  ok('throat cut finishes a body under half', r.cutJustUnder.dead);
  ok('and leaves one just over it alive', !r.cutJustOver.dead,
    String(r.cutJustOver.left));
  ok('and a bare swing does not finish it', !r.cutBare.dead, String(r.cutBare.left));
  ok('and a boss is refused outright', r.cutBoss === false, String(r.cutBoss));
  ok('and a scythe sweep cuts every throat in the arc', r.cutSweep === 3,
    String(r.cutSweep));

  // ---- the shield ----
  ok('ballast tanks opens a wave on fifty', r.ballastOpen === 50, String(r.ballastOpen));
  ok('and puts no clock on it', r.ballastNoClock === 0, String(r.ballastNoClock));
  // A FLOOR AND NOT A WRITE: a run also holding SECOND SKIN must not be CUT
  // BACK to fifty by its own passive item.
  ok('and never takes shield away', r.ballastKeepsMore === 80, String(r.ballastKeepsMore));
  ok('and lifts a thin one to the floor', r.ballastLiftsLess === 50,
    String(r.ballastLiftsLess));
  ok('and does nothing unowned', r.ballastUnowned === 0, String(r.ballastUnowned));

  ok('the bar is all health with no shield',
    near(r.barNoShield.hp, 1) && r.barNoShield.shield === 0,
    JSON.stringify(r.barNoShield));
  // THE DENOMINATOR GROWS. Drawn against max health alone the shield has
  // nowhere to go on a full bar - which is the state BALLAST TANKS puts the
  // player in at the top of every single wave.
  ok('a full bar plus fifty shield still shows the shield',
    r.barFullPlusShield.shield > 0
      && near(r.barFullPlusShield.hp + r.barFullPlusShield.shield, 1, 0.051),
    JSON.stringify(r.barFullPlusShield));
  ok('and two thirds of it is health',
    Math.abs(r.barFullPlusShield.hp - 0.667) < 0.06, String(r.barFullPlusShield.hp));
  ok('and the shield starts where the health ends',
    near(r.barFullPlusShield.offset / 100, r.barFullPlusShield.hp, 0.051),
    `offset=${r.barFullPlusShield.offset}% hp=${r.barFullPlusShield.hp}`);
  ok('and the readout names it', /\+50/.test(r.barFullPlusShield.text),
    r.barFullPlusShield.text);
  // FIFTY HEALTH AND FIFTY SHIELD ON A HUNDRED BAR IS A THIRD AND A THIRD, not
  // a half and a half: the denominator is max HP plus shield, so a third of the
  // track is empty and that emptiness is the fifty health that is GONE. Drawn
  // half and half the player would be told they were at full strength.
  ok('half health and fifty shield each take a third of the track',
    Math.abs(r.barHalfPlusShield.hp - 0.35) < 0.06
      && Math.abs(r.barHalfPlusShield.shield - 0.35) < 0.06,
    `hp=${r.barHalfPlusShield.hp} shield=${r.barHalfPlusShield.shield}`);
  // ONE POINT IS STILL A CELL: a reserve the player cannot see is one they will
  // not spend.
  ok('and a single point of shield still lights a cell',
    r.barOnePoint.shield > 0, String(r.barOnePoint.shield));

  ok('a crate gives no shield on its own', r.crateShieldBare === 0,
    String(r.crateShieldBare));
  ok('plasma bag gives ten', r.crateShieldOne === 10, String(r.crateShieldOne));
  ok('and two crates give twenty', r.crateShieldTwo === 20, String(r.crateShieldTwo));
  ok('and puts no clock on it', r.crateShieldNoClock === 0, String(r.crateShieldNoClock));
  ok('a health plate is withheld at a full bar', r.healthDrawsBare === 0,
    String(r.healthDrawsBare));
  // A PROPORTIONAL DRAW, not a guarantee: the health plate's own weight against
  // the buffs and the ammo crate is what decides how often it comes up. What is
  // asserted is that it is IN the draw, which bare it provably is not.
  ok('and offered once the crate is worth something up there',
    r.healthDrawsWithBag > 30, String(r.healthDrawsWithBag));

  // ---- staying alive ----
  ok('flow reload buys nothing until the rounds arrive', r.flowMidReload === 0,
    String(r.flowMidReload));
  ok('and a second when they do', r.flowAfter && r.flowWindow > 0.3,
    String(r.flowWindow));
  ok('and a bare reload buys nothing', r.flowUnowned === 0, String(r.flowUnowned));

  ok('bellows takes 15% off at full stamina', near(r.bellowsFull, 0.85),
    String(r.bellowsFull));
  // FULL MEANS FULL - a hard line, not a band, on PACE CAR's terms.
  ok('and nothing one point short', near(r.bellowsNearlyFull, 1),
    String(r.bellowsNearlyFull));
  ok('and nothing on an empty bar', near(r.bellowsEmpty, 1), String(r.bellowsEmpty));

  // THE THRESHOLD IS THE WHOLE PICK: without it this is IRON LUNG for anything
  // carrying a regeneration trickle.
  ok('sterile field lets a per-frame trickle through', r.sterileTrickleKept);
  ok('and a real heal washes everything off', r.sterileHealCleansed);
  ok('and a heal that fit nowhere still cleanses', r.sterileFullBarCleansed);
  ok('and a bare heal cleanses nothing', r.sterileUnowned);

  ok('crash cart heals a hundred at the bottom of the bar', r.crashLow >= 100,
    String(r.crashLow));
  ok('and the ordinary crate just over the line', r.crashAbove <= 51,
    String(r.crashAbove));
  ok('and a bare crate is the ordinary crate', r.crashUnowned <= 41,
    String(r.crashUnowned));

  // ---- what your shots carry ----
  ok('bedbugs books a bite per pellet that landed', r.bedbugsBooked > 0,
    String(r.bedbugsBooked));
  ok('and it is a quarter of what the round was worth',
    r.bedbugsShot > 0 && near(r.bedbugsOwed / (r.bedbugsShot / r.bedbugsBooked), 0.25, 0.01),
    `owed=${r.bedbugsOwed} shot=${r.bedbugsShot} over ${r.bedbugsBooked}`);
  ok('and nothing lands before the two seconds are up', r.bedbugsEarly);
  ok('and a quarter of the hit lands when they are',
    near(r.bedbugsBite / r.bedbugsShot, 0.25, 0.02),
    `bite=${r.bedbugsBite} shot=${r.bedbugsShot}`);
  // THE ASSERTION THIS FILE EXISTS FOR. A bite that armed a bite would leave
  // the list non-empty, and one magazine's damage would grow without bound.
  ok('and a bite cannot arm another bite', r.bedbugsNoCascade);
  ok('and a bite owed to a corpse is dropped', r.bedbugsDroppedOnDeath);

  ok('splashback passes the burn on', r.splashBurn);
  ok('and the poison', r.splashPoison);
  ok('and the chill', r.splashSlow);
  ok('at the strength of the player’s own shot', r.splashPower > 0,
    String(r.splashPower));
  // WEAKNESS AND CURSE HAVE NO ENEMY FORM. Carrying only those must land
  // nothing rather than throwing or inventing a status.
  ok('and carries nothing an enemy cannot hold', r.splashNothingTransferable);
  ok('and a clean player puts nothing on anything', r.splashCleanPlayer);

  // ---- the turrets ----
  ok('a turret fires on the beat at all', r.turretBare.fired > 0,
    String(r.turretBare.fired));
  ok('shared mag triples the shot',
    r.turretBare.dealt > 0 && near(r.turretShared.dealt / r.turretBare.dealt, 3, 0.02),
    `bare=${r.turretBare.dealt} shared=${r.turretShared.dealt}`);
  ok('and bills the reserve for it', r.turretShared.reserveLeft < 300,
    String(r.turretShared.reserveLeft));
  ok('and the reserve is untouched without the pick', r.turretBare.reserveLeft === 300,
    String(r.turretBare.reserveLeft));
  // THE LINE THAT MAKES IT SAFE TO TAKE BLIND: the worst case is the turret the
  // player already had, never a turret that has stopped working.
  ok('and out of ammunition it keeps firing at the ordinary number',
    r.turretSharedDry.fired === r.turretBare.fired
      && near(r.turretSharedDry.dealt, r.turretBare.dealt, 0.01),
    `dry=${r.turretSharedDry.dealt} bare=${r.turretBare.dealt}`);
  ok('a bare turret leaves no status', r.turretBare.poison === 0 && r.turretBare.burn === 0,
    `p=${r.turretBare.poison} b=${r.turretBare.burn}`);
  ok('venomgrid poisons what it hits', r.turretVenom.poison > 0,
    String(r.turretVenom.poison));
  ok('and leaves nothing burning', r.turretVenom.burn === 0, String(r.turretVenom.burn));
  ok('hellspitter sets fire to it', r.turretHell.burn > 0, String(r.turretHell.burn));
  ok('and leaves nothing poisoned', r.turretHell.poison === 0,
    String(r.turretHell.poison));
  // TWO RULES FOUR LINES APART: the damage is snapshotted at the throw and the
  // picks are read live, and copying the wrong one is the easy mistake.
  ok('a turret already standing picks up a status claimed after it',
    r.turretLiveMods.poisoned);
  ok('and its damage is still the gun it was built out of',
    r.turretLiveMods.sameDamage);

  // ---- the floor ----
  ok('an orb is worth its face value without the pick',
    near(r.vintageOffValue, 100), String(r.vintageOffValue));
  ok('vintage orbs pays a percent a second', near(r.vintageTenSeconds, 110, 0.01),
    String(r.vintageTenSeconds));
  ok('and a fresh orb is worth exactly its face', near(r.vintageFresh, 100, 0.01),
    String(r.vintageFresh));
  // THE CEILING IS WHAT MAKES IT UNFARMABLE: twenty seconds of fuse is +20% and
  // no more, however long the clock is wound on.
  ok('and it cannot be ripened past the fuse', near(r.vintageCapped, 120, 0.01),
    String(r.vintageCapped));
  ok('and a shorter fuse is a lower ceiling', near(r.vintageShortFuse, 110, 0.01),
    String(r.vintageShortFuse));

  ok('first fruits arms three at a wave', r.fruitsArmed === 3, String(r.fruitsArmed));
  ok('and a wave that spent none banks none', r.fruitsNotBanked === 3,
    String(r.fruitsNotBanked));
  ok('and arms nothing unowned', r.fruitsUnowned === 0, String(r.fruitsUnowned));

  ok('cold foot lays nothing standing still', r.iceNotSprinting === 0,
    String(r.iceNotSprinting));
  ok('and the first patch lands at the start of the run', r.iceFirstPatch === 1,
    String(r.iceFirstPatch));
  ok('and a run leaves a line of them', r.iceTrail > 3, String(r.iceTrail));
  ok('and what stands in it is slowed', r.iceSlows);
  // IT SLOWS AND IT DOES NOT BURN. There is already one thing the player lays
  // behind them that deals damage.
  ok('and not hurt', r.iceDoesNotHurt);

  // ---- the item slot ----
  ok('jumper cables pays three on a blow', r.cablesOnHit === 3, String(r.cablesOnHit));
  // ON A BLOW AND NOT ON A TICK. Paying the damage-over-time door would make
  // standing in lava the fastest way to charge an item in the game.
  ok('and nothing at all on a burning tick', r.cablesOnDot === 0, String(r.cablesOnDot));
  ok('and nothing unowned', r.cablesUnowned === 0, String(r.cablesUnowned));

  ok('dime novel rolls at the base rate before the press',
    Math.abs(r.dimeBefore - 0.05) < 0.012, String(r.dimeBefore));
  ok('and the press opens twenty seconds', near(r.dimeArmed, 20, 0.2),
    String(r.dimeArmed));
  ok('and the roll is twenty points better inside it',
    Math.abs(r.dimeAfter - 0.25) < 0.02, String(r.dimeAfter));
  ok('and the base rate is back when it lapses',
    Math.abs(r.dimeLapsed - 0.05) < 0.012, String(r.dimeLapsed));

  // ---- the pool ----
  ok('all twenty-seven are accounted for', r.newCount === 27, String(r.newCount));
  ok('every new passive item is in the pool', r.missing.length === 0, r.missing.join(', '));
  ok('every one of them is a single tier', r.notSingleTier.length === 0,
    r.notSingleTier.join(', '));
  ok('no two offers in the game share a name', r.nameClashes.length === 0,
    r.nameClashes.join(', '));
  ok('no new passive item lands on a colour already in use', r.themeClashes.length === 0,
    r.themeClashes.join(', '));
  ok('a live loop with all twenty-seven owned survives',
    r.survived && r.aliveAfter && r.stateAfter === 'playing', r.stateAfter);
  ok('and the ice trail gives its creep handles back', r.iceDrained);

  ok('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(fails === 0 ? 'FOURTH POOL TEST PASS' : `FOURTH POOL TEST FAIL (${fails})`);
process.exit(fails === 0 ? 0 : 1);
