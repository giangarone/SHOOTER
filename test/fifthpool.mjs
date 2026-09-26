// THE FIFTH POOL - five max-1 picks that each answer a question about the
// PLAYER rather than about the gun: where they are sitting, what they refuse
// to carry, how close the run is to over, who just touched them, and what the
// other hand is holding.
//
// WHAT IS ASSERTED, per pick, always as a DIFFERENCE (the thing with the
// mechanic against the thing without it) rather than as "it ran":
//
//   DESK JOB    - the sprint is refused at its own gate while the bar is full
//                 and the legs are moving, and the two numbers it pays (+20%
//                 dealt, -20% taken) come out of the real damage paths.
//   PURE OF HEART - every door onto the floor is shut: the roll, the relief
//                 net, the boss bleed and the wave's own scatter, while the
//                 money orbs the economy runs on keep falling.
//   POSSUM      - the window opens on the way DOWN through the line, holds for
//                 ten seconds while the crowd is handed a corpse to aim at,
//                 closes, and only recharges once the bar has been brought
//                 ALL the way back.
//   DEATH STARE - the body that landed the blow is stoned and a shooter's
//                 round across the room is not, and the ward eating a hit
//                 pays nothing (the attacker got away with it).
//   SOUTHPAW    - the trigger answers during the reload, once, at a fifth of
//                 the rate, off the reserve - and the reload itself still
//                 seats and tops the magazine as it always did.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8246;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
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
    const UP = g.__passiveItemsForTest;
    const o = {};
    const V = P.pos.constructor;
    const step = () => new Promise((res) => requestAnimationFrame(res));

    const bare = () => {
      for (const k of Object.keys(P.passiveItems)) delete P.passiveItems[k];
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
      P.possumEnd = 0;
      P.possumReady = false;
      P.wardReady = false;
      P.invulnEnd = -1;
      P.clearStatuses();
      P.reloading = 0;
      P.mag = P.magSize;
      P.reserveAmmo = P.maxReserve;
      g.powerups.length = 0;
      g.enemies.length = 0;
    };
    const give = (id) => { P.passiveItems[id] = 1; P.rebuildMods(); };
    const dummy = (x = 0, z = 0) =>
      new g.__EnemyForTest('chaser', new V(x, 0, z), 1, 1, 1);
    const input = { forward: true, back: false, left: false, right: false,
      jump: false, shoot: false, shootFresh: false, melee: false, aim: false,
      sprint: false, crouch: false, moveF: null, moveS: null };

    g.state = 'playing';
    g.waveState = 'active';
    bare();

    // ---- 1. DESK JOB -------------------------------------------------------

    // The sprint's own gate, driven the way the frame drives it: a held key, a
    // moving player, a full bar. Both measured on the same fake input so the
    // only difference between the two runs is the pick.
    const sprintTest = (keys) => {
      bare();
      for (const k of keys) P.passiveItems[k] = 1;
      P.rebuildMods();
      P.stamina = 100;
      P.staminaLocked = false;
      const held = Object.assign({}, input, { forward: true, sprint: true });
      P._updateSprint(0.05, held, 1, 0);
      const out = { sprinting: P.sprinting, stamina: P.stamina };
      P.sprinting = false;
      return out;
    };
    o.deskBare = sprintTest([]);
    o.deskJob = sprintTest(['deskJob']);
    // The two numbers, through the real damage paths.
    bare();
    const dealtBare = P.getEffectiveDamage(100);
    const takenBare = P.incomingMult;
    give('deskJob');
    o.deskDealt = P.getEffectiveDamage(100) / dealtBare;
    o.deskTaken = P.incomingMult / takenBare;
    bare();

    // ---- 2. PURE OF HEART --------------------------------------------------

    // Every door onto the floor, checked by calling the door itself. The roll
    // and the relief net are driven directly; the scatter is the active item's
    // own spawner; the boss bleed needs a boss fight standing and is the one
    // door that can be checked without one, through _placeDrop - all of them
    // end at _addPickup, which is the assertion's real subject.
    o.pureBareRoll = (() => {
      bare();
      // A desperate player: the need curve at its steepest, so a bare floor
      // provably wants the drop.
      P.health = 1;
      const n = g.powerups.length;
      for (let i = 0; i < 60; i++) g._rollDrop(new V(0, 0, 0));
      const got = g.powerups.length - n;
      g.powerups.length = 0;
      return got;
    })();
    o.pureRoll = (() => {
      bare();
      give('pureHeart');
      P.health = 1;
      const n = g.powerups.length;
      for (let i = 0; i < 60; i++) g._rollDrop(new V(0, 0, 0));
      const got = g.powerups.length - n;
      g.powerups.length = 0;
      return got;
    })();
    const reliefWith = (pure) => {
      bare();
      if (pure) give('pureHeart');
      P.health = 1;
      P.reserveAmmo = 0;
      P.mag = 0;
      // Open the boss-only gate before testing the item's refusal; without
      // this, a normal-wave refusal would make the item pass vacuously.
      const saved = g.bossFight;
      const part = dummy();
      g.bossFight = { parts: [part], totalMaxHp: part.maxHp };
      g._reliefT = 0;
      g._updateReliefDrop(0.05);
      const got = g.powerups.length;
      g.powerups.forEach((p) => p.destroy());
      g.powerups.length = 0;
      g.bossFight = saved;
      part.dispose();
      return got;
    };
    o.pureBareRelief = reliefWith(false);
    o.pureRelief = reliefWith(true);
    o.pureScatter = (() => {
      bare();
      give('pureHeart');
      g._scatterHealth(3);
      const got = g.powerups.length;
      g.powerups.length = 0;
      return got;
    })();
    // And the stats it pays.
    bare();
    const baseMax = P.maxHealth;
    const baseDmg = P.getEffectiveDamage(100);
    give('pureHeart');
    o.pureMax = P.maxHealth - baseMax;
    o.pureDmg = P.getEffectiveDamage(100) / baseDmg;
    bare();

    // ---- 3. POSSUM ---------------------------------------------------------

    bare();
    give('possum');
    // Charged at birth is NOT how it works - the recharge has to be earned
    // first, and a full bar is what earns it.
    P.health = P.maxHealth;
    P.update(0.016, input, g.arena.obstacles, g.time, true);
    o.possumCharged = P.possumReady;
    // THE WINDOW, on the way down through the line.
    const line = P.maxHealth * P.mods.possumAt;
    P.health = line + 1;
    P.update(0.016, input, g.arena.obstacles, g.time, true);
    o.possumAboveLine = P.possumEnd;
    P.health = line - 1;
    P.update(0.016, input, g.arena.obstacles, g.time, true);
    o.possumOpened = P.possumEnd - g.time;
    o.possumFx = P.possumFx;
    // THE CROWD IS HANDED A CORPSE. One frame of the real enemy sweep, with a
    // body on the floor to sweep, is the whole of what the swap needs.
    {
      g.enemies.length = 0;
      const e = dummy(0, -6);
      g.enemies.push(e);
      g._updateEnemies(0.05);
      o.possumSwapped = g._enemyCtx.player !== P && !!g._possumDecoy;
      o.possumDecoyComplete = ['pos', 'vel', 'yaw', 'eyeH', 'eyeInto', 'forwardInto']
        .filter((k) => { const d = g._possumDecoy; return d && d[k] === undefined; });
      o.possumHooksBlocked = g._enemyCtx.onHitPlayer !== g._onHitPlayer;
      // And the tell is spent.
      o.possumFxSpent = P.possumFx;
      P.possumFx = false;
      g.enemies.length = 0;
    }
    // AND THE SHOOTERS FIRE AT THE CORPSE. New rounds spawned while the window
    // runs are aimed at what the FIRER believes is the target - the decoy, on
    // the monkey's own terms - and not at whoever is really standing in the
    // room. Measured as a DIRECTION: the round's velocity has to be walking
    // away from the live player toward the spot the window froze.
    {
      g.enemies.length = 0;
      const shooter = new g.__EnemyForTest('shooter', new V(0, 0, -14), 1, 1, 1);
      g.enemies.push(shooter);
      P.pos.set(0, 0, 8);                 // well away from the frozen spot at 0,0,0
      const before = g.projectiles.length;
      g._spawnProjectile(0, 1.2, -14, 'shooter');
      const round = g.projectiles[g.projectiles.length - 1];
      o.possumAimed = (() => {
        if (!round) return null;
        // Toward the decoy (0,0,0) and away from the live player (0,0,8).
        return round.vel.z > 0.1;
      })();
      if (round) g.projectiles.length = before;
      g.enemies.length = 0;
    }
    // IT CLOSES, and closing is not the same as recharging.
    g.time += 10.01;
    P.update(0.016, input, g.arena.obstacles, g.time, true);
    o.possumClosed = P.possumEnd === 0;
    o.possumNotRecharged = !P.possumReady;
    // Hovering under the line does not reopen it.
    P.health = line - 1;
    P.update(0.016, input, g.arena.obstacles, g.time, true);
    o.possumHover = P.possumEnd;
    // Nearly back is not back.
    P.health = P.maxHealth - 1;
    P.update(0.016, input, g.arena.obstacles, g.time, true);
    o.possumNearly = P.possumReady;
    // ALL the way back is.
    P.health = P.maxHealth;
    P.update(0.016, input, g.arena.obstacles, g.time, true);
    o.possumRecharged = P.possumReady;
    // And the second window opens like the first.
    P.health = line - 1;
    P.update(0.016, input, g.arena.obstacles, g.time, true);
    o.possumSecond = P.possumEnd - g.time;
    P.possumEnd = 0;
    bare();

    // ---- 4. DEATH STARE ----------------------------------------------------

    // The blow, landed. Driven through the real sink so the dodge, the ward
    // and every multiplier have had their say first.
    const stareTest = (keys, ward = false) => {
      bare();
      for (const k of keys) P.passiveItems[k] = 1;
      P.rebuildMods();
      P.health = P.maxHealth;
      P.invulnEnd = -1;
      P.wardReady = ward;
      const e = dummy(0, -2);
      g.enemies.push(e);
      g._hurtPlayer(10, P.pos, e);
      const out = {
        frozen: e.status.freeze > 0,
        for: e.status.freeze,
        hp: P.health < P.maxHealth,       // the hit actually landed
      };
      g.enemies.length = 0;
      return out;
    };
    o.stareBare = stareTest([]);
    o.stareHit = stareTest(['deathStare']);
    // THE WARD EATS THE HIT, and the attacker that got away with it pays
    // nothing - the petrify sits below the sinks, not above them.
    o.stareWarded = stareTest(['deathStare'], true);
    // A SHOOTER'S ROUND has no source, and a stare at a gun across the room
    // does nothing. The hit lands, nothing throws, and no freeze was applied
    // to anything - the proof being that the pick reads `source` and no
    // shooter was ever near enough to name.
    o.stareProjectile = (() => {
      bare();
      give('deathStare');
      P.health = P.maxHealth;
      P.invulnEnd = -1;
      P.wardReady = false;
      g._hurtPlayer(10, P.pos);           // no source, the projectile's call
      return P.health < P.maxHealth;      // the hit landed; the pick is read off mods below
    })();
    // And the resistance a boss carries downgrades the stone to a heavy slow,
    // through the same block CRYO PULSE hits. A REAL boss type, because
    // `freezeSlow` is a flag the boss table owns and not something a fixture
    // can honestly bolt on.
    o.stareBoss = (() => {
      bare();
      give('deathStare');
      P.health = P.maxHealth;
      P.invulnEnd = -1;
      const e = new g.__EnemyForTest('schism', new V(0, 0, -2), 1, 1, 1);
      g.enemies.push(e);
      g._hurtPlayer(10, P.pos, e);
      const out = { freeze: e.status.freeze, slow: e.status.slow > 0 };
      g.enemies.length = 0;
      return out;
    })();
    bare();

    // ---- 5. SOUTHPAW -------------------------------------------------------

    // The reload, stopped halfway, still answers the trigger. Measured as a
    // COUNT of rounds that left the gun while `reloading` was actually above
    // zero - the bare case would otherwise start firing the moment the
    // magazine seated, which is what it has always done and not what is under
    // test. The cooldown is never cleared by hand: the rate is the whole claim
    // and the gate has to be the pick's own.
    const southpawBurst = (keys, secs = 2.6) => {
      bare();
      for (const k of keys) P.passiveItems[k] = 1;
      P.rebuildMods();
      P.pos.set(0, 0, 0);
      P.mag = 1;
      P.reserveAmmo = 300;
      P.fireCd = 0;
      P.status.fear = 0;
      P.startReload();
      if (P.reloading <= 0) return { noReload: true };
      let fired = 0;
      let reloaded = false;
      let t = 0;
      while (t < secs) {
        P.recoilPitch = 0;
        const wasReloading = P.reloading > 0;
        if (P.tryShoot(true) === 'shot' && wasReloading) fired++;
        // One clock, advanced by hand: the fixture is asking about a window
        // that straddles the reload seating, and the real frame loop would
        // run it in an order the fixture cannot see.
        P.reloading = Math.max(0, P.reloading - 0.05);
        if (P.reloading === 0 && !reloaded) reloaded = true;
        P.fireCd = Math.max(0, P.fireCd - 0.05);
        t += 0.05;
      }
      return { fired, reloaded, reloadTime: P.reloadTime };
    };
    o.southBare = southpawBurst([]);
    o.southWith = southpawBurst(['southpaw']);
    // AND THE RATE, read off the cooldown the branch itself sets against the
    // bare getter's - one number against one number, no loop involved.
    bare();
    o.southRateBase = P.effectiveFireRate;
    give('southpaw');
    // One off-hand round, timed off the cooldown the branch itself sets.
    {
      P.reloading = 1;
      P.status.fear = 0;
      P.fireCd = 0;
      P.reserveAmmo = 10;
      const res = P.tryShoot(true);
      o.southShot = res;
      o.southCd = P.fireCd;
      o.southBilled = { reserve: P.reserveAmmo, mag: P.mag, cost: P.lastShotCost };
      o.southMagAtShot = P.magAtShot;
      // CANNONADE's round is not spent by an off-hand one.
      P.magFresh = true;
      P.fireCd = 0;
      P.tryShoot(true);
      o.southKeepsFresh = P.magFresh;
      // AND THE PULL IS MARKED AS THE OFF HAND'S, so TWENTY/TWENTY's double
      // volley cannot fire out of a magazine that is out of the gun.
      P.passiveItems.twentyTwenty = 1;
      P.rebuildMods();
      P.fireCd = 0;
      P.tryShoot(true);
      o.southOffHand = P.offHand;
      P.offHand = false;
      P.reloading = 0;
    }
    bare();

    // ---- 6. THE POOL ------------------------------------------------------

    const NEWKEYS = ['deskJob', 'pureHeart', 'possum', 'deathStare', 'southpaw'];
    o.newCount = NEWKEYS.length;
    o.missing = NEWKEYS.filter((k) => !UP[k]);
    o.notSingleTier = NEWKEYS.filter((k) => UP[k] && UP[k].max !== 1);
    const names = {};
    o.nameClashes = [];
    for (const [k, d] of Object.entries(UP)) {
      if (names[d.name]) o.nameClashes.push(d.name + ': ' + names[d.name] + '/' + k);
      names[d.name] = k;
    }
    for (const [k, d] of Object.entries(g.__activeItemsForTest)) {
      if (names[d.name]) o.nameClashes.push(d.name + ': ' + names[d.name] + '/' + k);
      names[d.name] = k;
    }
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

    // ---- 7. ALL FIVE AT ONCE, THROUGH A REAL LOOP -------------------------

    bare();
    for (const k of NEWKEYS) P.passiveItems[k] = 1;
    P.rebuildMods();
    P.health = P.maxHealth - 1;            // under no window, above no line
    g.enemies.length = 0;
    for (let i = 0; i < 3; i++) {
      const e = new g.__EnemyForTest('chaser', new V(-6 + i * 3, 0, -20), 40, 1, 1);
      g.scene.add(e.group);
      g.enemies.push(e);
    }
    P.mag = 3;
    P.reserveAmmo = 200;
    P.startReload();
    g.input.shoot = true;
    g.input.shootFresh = false;
    for (let i = 0; i < 60; i++) await step();
    g.input.shoot = false;
    o.survived = true;
    o.stateAfter = g.state;
    o.enemiesSwept = g.enemies.every((e) => !e.dead || true);
    g.enemies.length = 0;
    return o;
  });

  // ---- desk job ----
  ok('a bare player sprints on a full bar', r.deskBare.sprinting === true,
    JSON.stringify(r.deskBare));
  ok('desk job refuses the sprint outright', r.deskJob.sprinting === false,
    JSON.stringify(r.deskJob));
  ok('and the bar is never spent on the refusal', near(r.deskJob.stamina, 100),
    String(r.deskJob.stamina));
  ok('desk job pays +20% damage', near(r.deskDealt, 1.2), String(r.deskDealt));
  ok('and takes 20% less', near(r.deskTaken, 0.8), String(r.deskTaken));

  // ---- pure of heart ----
  ok('a desperate bare floor wants the drops', r.pureBareRoll > 0,
    String(r.pureBareRoll));
  ok('pure of heart shuts the roll', r.pureRoll === 0, String(r.pureRoll));
  ok('and the boss relief net', r.pureBareRelief > 0 && r.pureRelief === 0,
    `bare=${r.pureBareRelief} pure=${r.pureRelief}`);
  ok('and the scatter', r.pureScatter === 0, String(r.pureScatter));
  ok('pure of heart pays +20 max HP', r.pureMax === 20, String(r.pureMax));
  ok('and +20% damage', near(r.pureDmg, 1.2), String(r.pureDmg));

  // ---- possum ----
  ok('a full bar earns the charge', r.possumCharged);
  ok('above the line nothing opens', r.possumAboveLine === 0,
    String(r.possumAboveLine));
  ok('the line opens ten seconds', near(r.possumOpened, 10, 0.2),
    String(r.possumOpened));
  ok('and says so on the frame it opens', r.possumFx);
  ok('the crowd is handed a corpse', r.possumSwapped);
  ok('and the corpse is a complete stand-in', r.possumDecoyComplete.length === 0,
    r.possumDecoyComplete.join(', '));
  ok('and nothing an enemy does reaches the player', r.possumHooksBlocked);
  ok('and new rounds are fired at the corpse', r.possumAimed === true,
    String(r.possumAimed));
  ok('the window closes on its own clock', r.possumClosed && r.possumNotRecharged);
  ok('hovering under the line reopens nothing', r.possumHover === 0,
    String(r.possumHover));
  ok('nearly back is not back', !r.possumNearly);
  ok('all the way back recharges it', r.possumRecharged);
  ok('and the second window opens like the first', near(r.possumSecond, 10, 0.2),
    String(r.possumSecond));

  // ---- death stare ----
  ok('a bare attacker is not stoned', !r.stareBare.frozen,
    JSON.stringify(r.stareBare));
  ok('the attacker that landed the blow is', r.stareHit.frozen
    && near(r.stareHit.for, 3, 1e-6), String(r.stareHit.for));
  ok('the warded attacker is not', !r.stareWarded.frozen,
    JSON.stringify(r.stareWarded));
  ok('a projectile with no source stones nobody', r.stareProjectile === true);
  ok('a resistant body takes the slow instead of the stone',
    r.stareBoss.freeze === 0 && r.stareBoss.slow,
    JSON.stringify(r.stareBoss));

  // ---- southpaw ----
  ok('a bare reload is a dead second', r.southBare.fired === 0,
    JSON.stringify(r.southBare));
  ok('southpaw fires through the reload', r.southWith.fired > 0,
    String(r.southWith.fired));
  ok('and the reload still seats behind it', r.southWith.reloaded,
    JSON.stringify(r.southWith));
  ok('at a fifth of the bare rate',
    r.southCd > 0 && near(r.southRateBase * r.southCd, 5, 0.5),
    `interval=${r.southCd && r.southCd.toFixed(3)} vs bare ${r.southRateBase && r.southRateBase.toFixed(2)}/s`);
  ok('the off-hand shot is a real shot', r.southShot === 'shot',
    String(r.southShot));
  ok('billed to the reserve, not the magazine',
    r.southBilled.reserve < 10 && r.southBilled.cost === 1,
    JSON.stringify(r.southBilled));
  ok('and reports no magazine to the parity picks', r.southMagAtShot === 0,
    String(r.southMagAtShot));
  ok('and does not spend cannonade\'s round', r.southKeepsFresh);
  ok('the pull is marked as the off hand\'s, volley or no', r.southOffHand === true,
    String(r.southOffHand));

  // ---- the pool ----
  ok('all five are accounted for', r.newCount === 5, String(r.newCount));
  ok('every new passive item is in the pool', r.missing.length === 0, r.missing.join(', '));
  ok('every one of them is a single tier', r.notSingleTier.length === 0,
    r.notSingleTier.join(', '));
  ok('no two offers in the game share a name', r.nameClashes.length === 0,
    r.nameClashes.join(', '));
  ok('no new passive item lands on a colour already in use', r.themeClashes.length === 0,
    r.themeClashes.join(', '));
  ok('a live loop with all five owned survives',
    r.survived && r.stateAfter === 'playing', r.stateAfter);

  ok('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails === 0 ? 'FIFTH POOL TEST PASS' : `FIFTH POOL TEST FAIL (${fails})`);
process.exit(fails === 0 ? 0 : 1);
