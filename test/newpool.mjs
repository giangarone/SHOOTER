// THE POOL ADDED AFTER THE CRIT WAS A DIE ROLL - three active items and sixteen
// passive ones - and the two systems they needed that did not exist:
//
//   1. PER-HIT RESOLUTION. rollCrit() throws a die once per trigger pull, and
//      it always did. Four of the six new crit passive items ask a question
//      about the BODY - has it ever been hit, how many times, how far away is
//      it - which the trigger cannot answer. Game._resolveHit and _hitMult are
//      where the roll becomes an answer, and most of this file is about them.
//   2. COMPANIONS. Two things that are alive for the whole run, in a list of
//      their own, standing up and down off `mods` rather than off a pick - so
//      that a versus handover swaps the pets with the build for free.
//
// AND THE THING THAT IS EASIEST TO GET WRONG AND HARDEST TO SEE: a shotgun.
// Nine pellets into one chest is ONE hit as far as Telltale's counter and
// Assassin's freshness are concerned. Without the per-shot cache a scattergun
// would tick the tally eight times a shell and Telltale would read as a
// permanent crit - which looks like good luck, not like a bug, for a long time.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8234;
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
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const r = await page.evaluate(async () => {
    const g = window.__game;
    g.autoTest = false;
    const P = g.player;
    const UP = g.__upgradesForTest;
    const ITEMS = g.__itemsForTest;
    const o = {};
    const step = () => new Promise((res) => requestAnimationFrame(res));

    // A clean build. rebuildMods replays the owned list from DEFAULT_MODS, so
    // emptying the list is the whole reset.
    const bare = () => {
      for (const k of Object.keys(P.upgrades)) delete P.upgrades[k];
      P.rebuildMods();
      P.adrenalineStacks = 0;
      P.itemCritEnd = 0;
      P.balance = 0;
    };
    const give = (id, n = 1) => { P.upgrades[id] = n; P.rebuildMods(); };
    // A body to shoot at, standing where the test puts it. Not on the roster -
    // nothing here wants the wave logic or the death sweep involved.
    const V = g.player.pos.constructor;
    const dummy = (x = 0, z = 0) => new g.__EnemyForTest('chaser', new V(x, 0, z), 1, 1, 1);
    bare();
    P.pos.set(0, 0, 0);

    // ---- 1. THE CRIT FAMILY, at the hit ------------------------------------
    //
    // _resolveHit(en, rolled) is called with the trigger's die. Passing false
    // is what isolates each passive item: anything that comes back true did it
    // on its own account.
    o.baseCrit = { chance: P.mods.critChance, mult: P.mods.critMult };

    give('deadeye');
    o.deadeye = P.mods.critChance;
    bare();
    give('marksman');
    o.marksman = P.mods.critChance;
    bare();
    give('deadeye');
    give('marksman');
    o.bothChance = P.mods.critChance;
    give('deadCenter');
    o.centerChance = P.mods.critChance;
    o.centerMult = P.mods.critMult;
    bare();

    // ASSASSIN: the first hit on a fresh body, and never again on that body.
    give('assassin');
    {
      const e = dummy();
      g._shotCrit.clear();
      const first = g._resolveHit(e, false);
      g._shotCrit.clear();
      const second = g._resolveHit(e, false);
      g._shotCrit.clear();
      const other = g._resolveHit(dummy(), false);
      o.assassin = { first, second, other };
    }
    bare();

    // TELLTALE: hits 3, 6, 9 and nothing in between.
    give('telltale');
    {
      const e = dummy();
      const seq = [];
      for (let i = 0; i < 9; i++) {
        g._shotCrit.clear();
        seq.push(g._resolveHit(e, false) ? 1 : 0);
      }
      o.telltale = seq.join('');
      // A SHOTGUN. Eight pellets into the same body inside ONE trigger pull:
      // the set is cleared once, before the volley, exactly as _fire does it.
      const e2 = dummy();
      g._shotCrit.clear();
      const pellets = [];
      for (let i = 0; i < 8; i++) pellets.push(g._resolveHit(e2, false) ? 1 : 0);
      o.pelletTally = e2.hitTally;
      o.pelletsAgree = pellets.every((v) => v === pellets[0]);
      g._shotCrit.clear();
    }
    bare();

    // SWEET SPOT: the window crits everything, and it does NOT overwrite the
    // build's own multiplier - a DEAD CENTER run presses this and gets 3x.
    give('deadCenter');
    P.item = 'itemCrit';
    P.itemCharge = ITEMS.itemCrit.charge;
    g.running.start(g, 'itemCrit', ITEMS.itemCrit);
    {
      const e = dummy();
      g._shotCrit.clear();
      o.sweetSpotCrit = g._resolveHit(e, false);
      o.sweetSpotMult = g._hitMult(e, true);
      g._shotCrit.clear();
    }
    g.running.clear(g);
    o.sweetSpotEnded = P.itemCritEnd === 0;
    bare();

    // ---- 2. RANGE ----------------------------------------------------------
    P.pos.set(0, 0, 0);
    give('longshot');
    {
      const near = g._hitMult(dummy(0, 1), false);
      const mid = g._hitMult(dummy(0, 20), false);
      const far = g._hitMult(dummy(0, 40), false);
      const beyond = g._hitMult(dummy(0, 60), false);
      o.longshot = { near: +near.toFixed(3), mid: +mid.toFixed(3), far: +far.toFixed(3), beyond: +beyond.toFixed(3) };
    }
    bare();
    give('pointBlank');
    {
      o.pointBlank = {
        inside: +g._hitMult(dummy(0, 4.5), false).toFixed(3),
        edge: +g._hitMult(dummy(0, 5), false).toFixed(3),
        outside: +g._hitMult(dummy(0, 5.5), false).toFixed(3),
      };
    }
    bare();

    // ---- 3. WHAT A HIT TAKEN IS WORTH --------------------------------------
    g.state = 'playing';
    give('bloodMoney');
    // `maxHealth` is a GETTER built out of the mods, so it cannot be assigned -
    // health is set well under it instead, which is what every heal below needs
    // anyway.
    P.health = P.maxHealth;
    P.invulnEnd = -1;
    P.wardReady = false;
    g.credits = 0;
    g._hurtPlayer(20, P.pos);
    o.bloodMoney = g.credits;
    bare();

    give('adrenaline');
    {
      const flat = P.getEffectiveDamage(100);
      for (let i = 0; i < 3; i++) { P.health = P.maxHealth; g._hurtPlayer(5, P.pos); }
      const three = P.getEffectiveDamage(100) / flat;
      for (let i = 0; i < 30; i++) { P.health = P.maxHealth; g._hurtPlayer(5, P.pos); }
      const capped = P.getEffectiveDamage(100) / flat;
      o.adrenaline = { three: +three.toFixed(3), capped: +capped.toFixed(3), stacks: P.adrenalineStacks };
    }
    // The wave boundary is the reset, and startWave is where it happens.
    g.startWave();
    o.adrenalineReset = P.adrenalineStacks;
    bare();

    // ---- 4. THE REST -------------------------------------------------------
    give('warChest');
    {
      const at0 = P.getEffectiveDamage(P.weapon.damage);
      P.balance = 999;
      const at999 = P.getEffectiveDamage(P.weapon.damage);
      P.balance = 5400;
      const at5400 = P.getEffectiveDamage(P.weapon.damage);
      o.warChest = { at0, sameUnder1k: at999 === at0, gain: at5400 - at0 };
    }
    P.balance = 0;
    bare();

    give('crouchfire');
    {
      const stand = P.effectiveFireRate;
      P.crouching = true;
      const crouch = P.effectiveFireRate;
      P.sliding = true;
      const slide = P.effectiveFireRate;
      P.crouching = false;
      P.sliding = false;
      o.crouchfire = { ratio: +(crouch / stand).toFixed(3), slideIsPlain: slide === stand };
    }
    bare();

    give('rabbitsFoot');
    o.dropLuck = +P.mods.dropLuck.toFixed(3);
    bare();

    // TWIN CELL. One number, twice as deep - see Player.itemChargeMax.
    P.giveItem('itemHeal');
    const cost = ITEMS.itemHeal.charge;
    o.oneCharge = { max: P.itemChargeMax, charges: P.itemCharges, ready: P.itemReady };
    P.addItemCharge(cost);
    o.overflowDropped = P.itemCharge === cost;
    give('twinCell');
    o.twinMax = P.itemChargeMax === cost * 2;
    P.addItemCharge(cost);
    o.twinBanked = { charges: P.itemCharges, first: P.itemChargeFrac(0), second: P.itemChargeFrac(1) };
    P.spendItem();
    o.afterOneSpend = { charges: P.itemCharges, ready: P.itemReady, second: P.itemChargeFrac(1) };
    P.spendItem();
    o.afterTwoSpends = { charges: P.itemCharges, ready: P.itemReady };
    // Half a charge on top of a full one: the first bar reads full and the
    // second reads half, which is the whole of what the HUD is handed.
    P.itemCharge = cost * 1.5;
    o.halfSpare = { first: P.itemChargeFrac(0), second: P.itemChargeFrac(1) };
    bare();
    P.item = null;
    P.itemCharge = 0;

    // ---- 5. BLOODSPORT, through the real kill sweep ------------------------
    give('bloodsport');
    P.health = P.maxHealth - 20;
    const hurtTo = P.health;
    {
      const e = dummy(1, 1);
      g.enemies.push(e);
      e.dead = true;
      e.meleeKill = true;
      g._updateEnemies(0.016);
      o.bloodsport = P.health - hurtTo;
      g.enemies.length = 0;
    }
    bare();

    // ---- 6. THE COMPANIONS -------------------------------------------------
    o.noPets = !g._companions[0] && !g._companions[1];
    give('magpie');
    give('lamprey');
    g._syncCompanions();
    o.petsUp = !!g._companions[0] && !!g._companions[1];
    o.petsInScene = !!(g._companions[0].group.parent && g._companions[1].group.parent);
    // The bird collects, through the SAME callback the player's magnet pays
    // through - so the credits, the charge slice and Blood From Stone all
    // happen once, in _collectOrb, whoever walked onto the orb.
    g.money.clear();
    g.credits = 0;
    {
      const bird = g._companions[0];
      bird.pos.set(9, 0, 9);
      g.money.spawn({ x: 9, y: 0.4, z: 9 }, 40, 1, 0);
      // The orb has to land before it can be stood on.
      for (let i = 0; i < 40; i++) g.money.update(0.016, { x: 99, y: 0, z: 99 }, 0.1, () => {});
      const before = g.credits;
      const took = g.money.collectAt(9, 9, 1.2, g._onOrb);
      o.magpieTook = took > 0 && g.credits > before;
    }

    // ---- 6b. THE BIRD ROUTES, IT DOES NOT GRIND ---------------------------
    //
    // The enemies were given a flow field (nav.js) because a body that walks
    // a straight line at its target presses into the first crate on that line
    // and stays there. The bird walks too, so it gets the same three cases:
    // a wall between it and the money, money up a flight of stairs, and money
    // no route can fix. All on a bare floor with exactly the geometry each
    // case asks for - a generated interior would put the measurement under
    // the layout's control rather than the mechanic's.
    //
    // SUCCESS IS READ OFF bird.collected, never off the orb count: an orb
    // that times out also empties the floor, and a suite that counted orbs
    // would pass on the bird standing still for twenty seconds.
    {
      const bird = g._companions[0];
      // Bare floor, wave pinned open (an empty queue would clear the wave
      // and regenerate the layout mid-measurement), obstacles exactly what
      // the case puts there.
      const bareFloor = () => {
        if (g.terrain.state !== 'hidden') {
          g.terrain.reset();
          g.terrain.clearCollision();
          g.nav.rebake(g.arena.obstacles);
          g.navBig.rebake(g.arena.obstacles);
        }
        g.waveState = 'active';
        if (!g.queue.length) g.queue.push('chaser');
        g.spawnTimer = 1e9;
        g.arena.obstacles.length = 0;
        bird.rebake(g.arena.obstacles);
        g.money.clear();
      };
      const box = (x, z, w, h, d, top) => {
        g.arena.obstacles.push({
          min: { x: x - w / 2, y: top - h, z: z - d / 2 },
          max: { x: x + w / 2, y: top, z: z + d / 2 },
        });
        bird.rebake(g.arena.obstacles);
      };
      // One settled orb at a spot: spawned with no spread so it drops
      // straight, then aged past the arc without ever being near the player.
      const drop = (x, z) => {
        g.money.spawn({ x, y: 0.4, z }, 40, 1, 0);
        for (let i = 0; i < 40; i++) g.money.update(0.016, { x: 99, y: 0, z: 99 }, 0.1, () => {});
      };
      // THE PLAYER IS PARKED OUTSIDE THE MAGNET AND INSIDE THE LEASH for
      // every case below: at (0, 18) every orb here stands 14-20m from them -
      // past the 5.5m magnet, which would otherwise claim the money through
      // the floor and pass the case without the bird doing anything - and
      // inside the bird's 22m leash, which would otherwise have the bird
      // ignore the money for a different reason.
      const run = (limit, startX, startZ) => {
        P.pos.set(0, 0, 18);
        P.vel.set(0, 0, 0);
        bird.pos.set(startX, 0, startZ);
        bird.think = 0;
        const before = bird.collected;
        let frames = 0;
        for (; frames < limit; frames++) {
          bird.update(0.05, g._compCtx);
          if (bird.collected > before) break;
        }
        return { got: bird.collected > before, frames };
      };

      // A WALL between the bird and the money, taller than either can step
      // and longer than the leash, so the only way to the orb is round an
      // end of it - 30m of detour the patience window has to survive.
      bareFloor();
      box(0, 0, 1.2, 3, 30, 3);
      drop(-4, 0);
      o.magpieWall = (() => {
        const r = run(400, 4, 0);
        return r.got && r.frames < 400;
      })();

      // THE MONEY IS UP A FLIGHT. Four 0.6 risers - the enemy step, so every
      // tread reads as ground - with the orb on the top one. The bird has to
      // climb, which is the ground query running before the push-out; the
      // version that resolved first spent the ceiling pressed against the
      // lowest tread.
      bareFloor();
      for (let i = 0; i < 4; i++) box(0, 6 - i * 1.25, 3, 0.6 * (i + 1), 1.25, 0.6 * (i + 1));
      drop(0, 2.25);
      o.magpieClimbs = (() => {
        const r = run(400, 0, 14);
        return r.got && r.frames < 400 && bird.pos.y > 2;
      })();

      // A BURIED ORB. Money can settle inside a wall - the spawn arc ignores
      // the scenery - and there is no route to the middle of a block. The
      // bird starts nearest the buried one so it is tried FIRST, has to write
      // it off inside the patience window, shun the position, and then take
      // the reachable orb standing on open floor. The shun is what stops the
      // bird re-picking the nearest - i.e. the same buried - orb forever.
      bareFloor();
      box(8, 0, 4, 3, 4, 3);
      drop(8, 0);
      drop(-8, 0);
      o.magpieWriteOff = (() => {
        const r = run(600, 14, 0);
        return r.got && r.frames < 600 && bird._shun.length > 0;
      })();

      // And the write-off refused the GEOMETRY, not the position: the same
      // spot with the block gone is money again. rebake() clears the shun
      // list with the grid, so a new room's floor is not fenced off by the
      // last room's burials.
      bareFloor();
      drop(8, 0);
      o.magpieShunCleared = (() => {
        const r = run(400, -14, 0);
        return r.got && r.frames < 400;
      })();
    }

    // The leech bites on the beat and heals when it lands the last hit.
    {
      const leech = g._companions[1];
      const e = dummy(1.5, 0);
      e.hp = 5;
      g.enemies.push(e);
      P.pos.set(0, 0, 0);
      P.health = P.maxHealth - 20;
      const hurt = P.health;
      leech.pos.copy(e.pos).setY(1.0);
      leech.target = e;
      leech._lastPulse = -99;
      leech.update(0.016, Object.assign({}, g._compCtx, { pulse: 1, time: g.time }));
      o.leech = { killed: e.dead, healed: P.health - hurt };
      g.enemies.length = 0;
    }
    // Dropping the passive items takes the pets down again.
    bare();
    g._syncCompanions();
    o.petsDown = !g._companions[0] && !g._companions[1];

    // ---- 7. ORGAN GRINDER --------------------------------------------------
    //
    // The lure is the item, and the whole of it is one field swap on the enemy
    // context - so what is worth asserting is that an enemy WALKS THE OTHER WAY
    // and that nothing an enemy does can reach the player while it is out.
    g._clearDeployed();
    P.pos.set(0, 0, 0);
    P.yaw = 0;
    P.item = 'itemMonkey';
    P.itemCharge = ITEMS.itemMonkey.charge;
    g.tryItem();
    o.monkeyThrown = g._deployed.length === 1 && g._deployed[0].lure === true;
    {
      const mk = g._deployed[0];
      // Landed by hand rather than waited for: the arc is the Bomb's and is
      // tested there.
      mk.pos.set(0, 0, -14);
      mk.land();
      o.monkeyArmed = mk.armed;
      const e = dummy(0, -25);
      g.enemies.push(e);
      const before = e.pos.z;
      g._updateEnemies(0.05);
      // The monkey is at z -14 and the player at 0, so an enemy at z -25 walks
      // toward the monkey by moving in +z, and would walk the same way for the
      // player - which is why the enemy is put BEYOND the monkey. Toward the
      // decoy is +z but only as far as it; the assertion that matters is the
      // ctx swap itself.
      o.lureTaken = g._enemyCtx.player !== P && g._enemyCtx.player.pos === mk.pos;
      // THE DECOY HAS TO BE A COMPLETE STAND-IN, and this is the assertion
      // that says so. The first version carried `pos` and `eyeInto` because a
      // grep for `ctx.player.` found only those - and a wraith reads the player
      // through a local alias (`const p = ctx.player; p.forwardInto(...)`) that
      // the grep never saw. It threw inside the enemy sweep, which is inside
      // rAF, which never reschedules: the whole game stopped on the frame the
      // item was pressed. Checked against the real Player rather than against a
      // hand-written list, so a member added there is caught here.
      {
        const d = g._enemyCtx.player;
        o.decoyMissing = ['pos', 'vel', 'yaw', 'eyeH', 'eyeInto', 'forwardInto']
          .filter((k) => d[k] === undefined);
        // And they have to WORK, not merely exist.
        const V = P.pos.constructor;
        o.decoyCallable = (() => {
          try {
            d.eyeInto(new V());
            d.forwardInto(new V());
            return true;
          } catch (err) { return false; }
        })();
      }
      o.lureBlocksHits = g._enemyCtx.onHitPlayer !== g._onHitPlayer;
      o.lureDropsNav = g._enemyCtx.nav === null;
      o.enemyClosedOnMonkey = Math.abs(e.pos.z - mk.pos.z) < Math.abs(before - mk.pos.z);
      // And nothing an enemy does lands: the swapped hook is a no-op.
      P.health = P.maxHealth;
      g._enemyCtx.onHitPlayer(50, P.pos, e);
      o.lureAbsorbsDamage = P.health === P.maxHealth;
      g.enemies.length = 0;
      // The blast, and the hand back.
      mk.fuse = 0.0001;
      g._updateDeployed(0.05);
      o.monkeyGone = g._deployed.length === 0;
      g._updateEnemies(0.016);
      o.lureHandedBack = g._enemyCtx.player === P
        && g._enemyCtx.onHitPlayer === g._onHitPlayer
        && g._enemyCtx.nav === g.nav;
    }

    // ---- 8. BANDOLIER ------------------------------------------------------
    P.reserveAmmo = 10;
    P.item = 'itemAmmo';
    P.itemCharge = ITEMS.itemAmmo.charge;
    g.tryItem();
    o.bandolier = P.reserveAmmo;
    P.reserveAmmo = P.maxReserve;
    P.itemCharge = ITEMS.itemAmmo.charge;
    g.tryItem();
    o.bandolierCapped = P.reserveAmmo === P.maxReserve;

    // ---- 9. THE POOL ITSELF ------------------------------------------------
    o.newPassives = ['deadeye', 'marksman', 'deadCenter', 'assassin', 'telltale',
      'longshot', 'pointBlank', 'bloodMoney', 'adrenaline', 'rabbitsFoot',
      'crouchfire', 'bloodsport', 'warChest', 'twinCell', 'magpie', 'lamprey']
      .filter((k) => !UP[k]);
    o.newActives = ['itemCrit', 'itemAmmo', 'itemMonkey'].filter((k) => !ITEMS[k]);
    // Every entry in the pool wears its own colour: the palette is how a totem
    // is read from across the arena, and two entries on one value is two things
    // the player cannot tell apart before the icon resolves.
    // NEW ENTRIES ONLY. The pool already had six pairs sharing a value before
    // any of this - cryo/crystallize, venom/neurotoxin and four more, all of
    // them near neighbours whose recolouring is somebody else's change. What
    // this guards is that none of the sixteen added here landed on a colour
    // that was already spoken for, which is the failure that would make two
    // totems unreadable apart from across the arena.
    const NEWKEYS = ['deadeye', 'marksman', 'deadCenter', 'assassin', 'telltale',
      'longshot', 'pointBlank', 'bloodMoney', 'adrenaline', 'rabbitsFoot',
      'crouchfire', 'bloodsport', 'warChest', 'twinCell', 'magpie', 'lamprey'];
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

    // A few frames with everything owned at once, to be sure the pets, the
    // lure and the per-hit path survive a real loop together.
    for (const k of o.newPassives.length ? [] : ['magpie', 'lamprey', 'deadeye',
      'assassin', 'telltale', 'longshot', 'pointBlank', 'adrenaline',
      'bloodMoney', 'crouchfire', 'rabbitsFoot', 'bloodsport', 'warChest',
      'twinCell', 'deadCenter', 'marksman']) P.upgrades[k] = 1;
    P.rebuildMods();
    g.state = 'playing';
    for (let i = 0; i < 30; i++) await step();
    o.survivedFrames = true;
    return o;
  });

  // ---- the crit family ----
  ok('a run starts with a crit to lose', r.baseCrit.chance > 0 && r.baseCrit.mult > 1,
    JSON.stringify(r.baseCrit));
  ok('deadeye is +15 points', Math.abs(r.deadeye - 0.20) < 1e-9, String(r.deadeye));
  ok('marksman is +25 points', Math.abs(r.marksman - 0.30) < 1e-9, String(r.marksman));
  ok('the two stack to 45%', Math.abs(r.bothChance - 0.45) < 1e-9, String(r.bothChance));
  ok('dead center triples the payout', r.centerMult === 3, String(r.centerMult));
  ok('dead center halves whatever chance the build had',
    Math.abs(r.centerChance - 0.225) < 1e-9, String(r.centerChance));
  ok('assassin crits the first hit on a body', r.assassin.first);
  ok('and never that body again', !r.assassin.second);
  ok('but does crit the next body', r.assassin.other);
  ok('telltale crits every third hit', r.telltale === '001001001', r.telltale);
  ok('a shotgun is ONE hit on the tally', r.pelletTally === 1, String(r.pelletTally));
  ok('and all its pellets agree about the crit', r.pelletsAgree);
  ok('sweet spot crits without a roll', r.sweetSpotCrit);
  ok('and does not overwrite dead center', r.sweetSpotMult === 3, String(r.sweetSpotMult));
  ok('the window hands itself back', r.sweetSpotEnded);

  // ---- range ----
  ok('longshot pays nothing at the muzzle', r.longshot.near < 1.01, JSON.stringify(r.longshot));
  ok('longshot ramps', r.longshot.mid > r.longshot.near && r.longshot.far > r.longshot.mid);
  ok('longshot tops out at +30%', Math.abs(r.longshot.far - 1.3) < 1e-6, String(r.longshot.far));
  ok('and does not run away past its range', r.longshot.beyond === r.longshot.far);
  ok('point blank pays inside five metres', Math.abs(r.pointBlank.inside - 1.3) < 1e-6,
    JSON.stringify(r.pointBlank));
  ok('including exactly at five', Math.abs(r.pointBlank.edge - 1.3) < 1e-6);
  ok('and nothing outside it', r.pointBlank.outside === 1);

  // ---- hits taken ----
  ok('blood money pays on damage taken', r.bloodMoney === 40, String(r.bloodMoney));
  ok('adrenaline is +4% a hit', Math.abs(r.adrenaline.three - 1.12) < 1e-6,
    String(r.adrenaline.three));
  ok('adrenaline caps at +40%', Math.abs(r.adrenaline.capped - 1.4) < 1e-6,
    String(r.adrenaline.capped));
  ok('and the stacks stop climbing with it', r.adrenaline.stacks === 10,
    String(r.adrenaline.stacks));
  ok('the wave resets it', r.adrenalineReset === 0, String(r.adrenalineReset));

  // ---- the rest ----
  ok('war chest pays nothing under $1,000', r.warChest.sameUnder1k);
  ok('war chest is +1 damage per $1,000', Math.abs(r.warChest.gain - 5) < 1e-6,
    String(r.warChest.gain));
  ok('crouchfire is +20% crouched', Math.abs(r.crouchfire.ratio - 1.2) < 1e-6,
    String(r.crouchfire.ratio));
  ok('and a slide is not a crouch', r.crouchfire.slideIsPlain);
  ok("rabbit's foot lifts every drop chance 15%", Math.abs(r.dropLuck - 1.15) < 1e-9,
    String(r.dropLuck));
  ok('bloodsport heals a melee kill', r.bloodsport === 3, String(r.bloodsport));

  // ---- twin cell ----
  ok('one charge is the default', r.oneCharge.charges === 1 && r.oneCharge.ready,
    JSON.stringify(r.oneCharge));
  ok('and the overflow is dropped without it', r.overflowDropped);
  ok('twin cell doubles the ceiling', r.twinMax);
  ok('the second charge banks', r.twinBanked.charges === 2, JSON.stringify(r.twinBanked));
  ok('both bars read full', r.twinBanked.first === 1 && r.twinBanked.second === 1);
  ok('spending one leaves the other ready',
    r.afterOneSpend.charges === 1 && r.afterOneSpend.ready && r.afterOneSpend.second === 0,
    JSON.stringify(r.afterOneSpend));
  ok('spending both empties the slot',
    r.afterTwoSpends.charges === 0 && !r.afterTwoSpends.ready);
  ok('a part-filled spare reads as an overlay on a full bar',
    r.halfSpare.first === 1 && Math.abs(r.halfSpare.second - 0.5) < 1e-9,
    JSON.stringify(r.halfSpare));

  // ---- the companions ----
  ok('a bare run has no pets', r.noPets);
  ok('the build stands them up', r.petsUp && r.petsInScene);
  ok('the magpie collects, through the player’s own payout', r.magpieTook);
  ok('the magpie routes round a wall to the money', r.magpieWall);
  ok('the magpie climbs a flight for money on it', r.magpieClimbs);
  ok('the magpie writes off a buried orb and takes the reachable one',
    r.magpieWriteOff);
  ok('and a cleared room un-shuns the position', r.magpieShunCleared);
  ok('the lamprey finishes and heals', r.leech.killed && r.leech.healed === 2,
    JSON.stringify(r.leech));
  ok('losing the build takes them down', r.petsDown);

  // ---- organ grinder ----
  ok('the monkey is thrown and it is a lure', r.monkeyThrown);
  ok('it arms when it lands', r.monkeyArmed);
  ok('the crowd is handed the monkey instead of the player', r.lureTaken);
  ok('and the decoy is a complete stand-in for a player',
    r.decoyMissing.length === 0 && r.decoyCallable, r.decoyMissing.join(', '));
  ok('and nothing an enemy does can reach the player', r.lureBlocksHits && r.lureAbsorbsDamage);
  ok('the nav grid is dropped for the duration', r.lureDropsNav);
  ok('an enemy closes on it', r.enemyClosedOnMonkey);
  ok('the fuse ends it', r.monkeyGone);
  ok('and the player is handed back', r.lureHandedBack);

  // ---- bandolier ----
  ok('bandolier grants 30 rounds', r.bandolier === 40, String(r.bandolier));
  ok('and clamps at the reserve cap', r.bandolierCapped);

  // ---- the pool ----
  ok('every new passive item is in the pool', r.newPassives.length === 0, r.newPassives.join(', '));
  ok('every new active item is in the pool', r.newActives.length === 0, r.newActives.join(', '));
  ok('no new passive item lands on a colour already in use',
    r.themeClashes.length === 0, r.themeClashes.join(', '));
  ok('a loop with the whole new pool owned survives', r.survivedFrames);

  // ---- AND ALL OF IT IN TWO-PLAYER --------------------------------------
  //
  // Versus is a hot seat: one Player instance whose fields are snapshotted and
  // written back at each handover. Everything above is a Player field or a
  // Game list, so what has to hold is that the SNAPSHOT carries the per-player
  // ones and that the shared ones are rebuilt from the incoming build. The two
  // that could not be got right by accident are the pets - which are scene
  // objects, not fields - and Adrenaline, which is a counter one player earned.
  const v = await page.evaluate(async () => {
    const g = window.__game;
    g.autoTest = false;
    const out = {};
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const clear = () => { g.queue.length = 0; g._clearEntities(); };
    const until = async (f, n = 900) => {
      for (let i = 0; i < n; i++) { clear(); if (f()) return true; await step(); }
      return f();
    };
    // ONE WHOLE TURN. The wave is held empty so it clears on the frame it
    // starts, and the pick that ends the intermission is FORFEITED - claiming
    // one would end the turn identically and needs a live offer standing. The
    // pass then runs on its own clock. Mirrors test/versus.mjs.
    const handOver = async () => {
      if (!(await until(() => g.waveState === 'intermission'))) return false;
      g.totemArea.dismiss();
      if (!(await until(() => g._pass))) return false;
      return until(() => !g._pass && g.waveState === 'active');
    };

    g.beginGame('versus');
    const P = g.player;
    P.maxHealth = 9999;
    P.health = 9999;
    out.opened = g.match.active === 0;

    // PLAYER ONE takes the pets, the crit build and some adrenaline.
    for (const k of ['magpie', 'lamprey', 'assassin', 'deadeye']) P.upgrades[k] = 1;
    P.upgrades.adrenaline = 1;
    P.rebuildMods();
    P.adrenalineStacks = 6;
    P.giveItem('itemMonkey');
    g._syncCompanions();
    out.p1Pets = !!g._companions[0] && !!g._companions[1];
    out.p1Crit = g.player.mods.critChance;

    // Hand over. _endTurn snapshots and restores; the pass runs on its own clock.
    out.handed = (await handOver()) && g.match.active === 1;

    // PLAYER TWO has their own build, which is empty - so no pets, no crit
    // bonus, no adrenaline and no monkey in the slot.
    g._syncCompanions();
    out.p2NoPets = !g._companions[0] && !g._companions[1];
    out.p2Crit = g.player.mods.critChance;
    out.p2NoAdrenaline = g.player.adrenalineStacks === 0;
    out.p2NoItem = g.player.item !== 'itemMonkey';

    // Player two takes their OWN new-pool build, deliberately different.
    g.player.maxHealth = 9999;
    g.player.health = 9999;
    for (const k of ['twinCell', 'warChest', 'bloodMoney']) g.player.upgrades[k] = 1;
    g.player.rebuildMods();
    g.player.giveItem('itemCrit');
    g.player.addItemCharge(1000);
    out.p2TwoCharges = g.player.itemCharges === 2;
    g.credits = 7000;
    g.player.balance = g.credits;
    out.p2WarChest = g.player.getEffectiveDamage(g.player.weapon.damage);

    // And back to player one, who must find everything exactly as they left it.
    out.backToP1 = (await handOver()) && g.match.active === 0;
    g._syncCompanions();
    out.p1PetsBack = !!g._companions[0] && !!g._companions[1];
    out.p1CritBack = g.player.mods.critChance === out.p1Crit;
    // ADRENALINE DOES NOT COME BACK, and that is the design rather than a
    // leak: the stacks reset at the end of every wave, and player one's wave
    // ended when they handed the controller over. What has to hold is that the
    // reset lands on whoever is about to play - startWave() runs AFTER the
    // snapshot has been written back - so neither player can ever start a wave
    // holding the other's ramp, or their own last one's.
    out.p1AdrenalineReset = g.player.adrenalineStacks === 0;
    out.p1ItemBack = g.player.item === 'itemMonkey';
    // ...and none of player two's.
    out.p1NoTwinCell = g.player.mods.itemChargeCap === 1;
    out.p1NoWarChest = g.player.mods.warChest === 0;
    return out;
  });

  ok('[2P] a match opens on player one', v.opened);
  ok('[2P] player one owns the pets and the crit build', v.p1Pets && v.p1Crit > 0.05,
    String(v.p1Crit));
  ok('[2P] the turn changes', v.handed);
  ok('[2P] player two inherits no pets', v.p2NoPets);
  ok('[2P] player two inherits no crit build', v.p2Crit === 0.05, String(v.p2Crit));
  ok('[2P] player two inherits no adrenaline', v.p2NoAdrenaline);
  ok('[2P] player two inherits no active item', v.p2NoItem);
  ok('[2P] player two banks their own two charges', v.p2TwoCharges);
  ok('[2P] player two is paid their own war chest', v.p2WarChest > 34, String(v.p2WarChest));
  ok('[2P] the turn comes back', v.backToP1);
  ok('[2P] player one gets their pets back', v.p1PetsBack);
  ok('[2P] and their crit build', v.p1CritBack);
  ok('[2P] and a wave of their own to build adrenaline in', v.p1AdrenalineReset);
  ok('[2P] and their item', v.p1ItemBack);
  ok('[2P] and none of player two’s', v.p1NoTwinCell && v.p1NoWarChest);

  // ---- DELAYED FUSE AGAINST A BODY THE SIZE OF A BOSS ---------------------
  //
  // The item deals ALL of its damage as a blast, and blasts used to be measured
  // from the enemy's `pos` - the point its feet are on. On the ordinary roster
  // that is inside the body and nothing was ever wrong. On a COLOSSUS, whose
  // `pos` is on the floor under six metres of boss, a fuse stuck in the chest
  // went off two and a half metres from `pos` and a 2.5m radius measured from
  // `pos` found nothing at all: the whole build did literally zero damage to
  // the one enemy it had the most rounds to put into.
  //
  // Two halves, and both are asserted because either one alone still reads as
  // "the item does nothing":
  //   the GEOMETRY - the blast has to reach a body whose middle is metres above
  //   the point it stands on
  //   the ARMOUR   - a Colossus's plating is a STATE (core open or shut), and a
  //   blast arrives with no direction, so it used to be held at the shut value
  //   even while the core stood wide open
  const fuse = await page.evaluate(async () => {
    const g = window.__game;
    const P = g.player;
    const V = P.pos.constructor;
    const out = {};
    for (const k of Object.keys(P.upgrades)) delete P.upgrades[k];
    P.upgrades.delayedFuse = 1;
    P.rebuildMods();

    // A round parked in the chest, exactly where a player aiming at the core
    // would put it, and then run past the fuse's own delay.
    const blow = async (weakOpen) => {
      g.enemies.length = 0;
      g._fuses.length = 0;
      const e = new g.__EnemyForTest('colossus', new V(0, 0, 0), 1, 1, 1);
      e.bs.weakOpen = weakOpen;
      g.enemies.push(e);
      const hp0 = e.hp;
      // Chest height on the hit sphere - the point a pellet that hit the core
      // would report, and the point the old code measured 2.56m away from.
      g._stick(e, 1000, new V(e.pos.x, e.pos.y + e.hitY, e.pos.z));
      await window.__simWait(P.mods.fuseDelay + 0.5);
      const dealt = +(hp0 - e.hp).toFixed(1);
      g.enemies.length = 0;
      return dealt;
    };
    out.chestHeight = await blow(false);
    out.coreOpen = await blow(true);
    // The control: the same round parked at the enemy's FEET, which is where
    // the old measurement thought every round was. It has to hurt too - a fix
    // that only worked at chest height would be a second special case.
    out.atFeet = await (async () => {
      g.enemies.length = 0;
      g._fuses.length = 0;
      const e = new g.__EnemyForTest('colossus', new V(0, 0, 0), 1, 1, 1);
      g.enemies.push(e);
      const hp0 = e.hp;
      g._stick(e, 1000, new V(e.pos.x, e.pos.y + 0.3, e.pos.z));
      await window.__simWait(P.mods.fuseDelay + 0.5);
      const dealt = +(hp0 - e.hp).toFixed(1);
      g.enemies.length = 0;
      return dealt;
    })();
    return out;
  });

  ok('[fuse] a round stuck in a Colossus\'s chest actually explodes on it',
    fuse.chestHeight > 0, `dealt=${fuse.chestHeight}`);
  ok('[fuse] and one stuck at its feet does too',
    fuse.atFeet > 0, `dealt=${fuse.atFeet}`);
  ok('[fuse] the open core takes the blast at full value, not the plated value',
    fuse.coreOpen > fuse.chestHeight * 3,
    `shut=${fuse.chestHeight} open=${fuse.coreOpen}`);

  ok('no console errors', errors.length === 0, errors.join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? 'NEW POOL TEST FAIL' : 'NEW POOL TEST PASS');
process.exit(fails ? 1 : 0);
