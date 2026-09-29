// STRATA, end to end - the fourth theme built out.
//
// WHY THIS EXISTS
//   The other themes could all be fought in an empty box. This one is about
//   the ROOM: a stone that bounces off the wall behind you, a boulder that
//   caroms across the arena, something that drops out of the truss, something
//   that comes up through the floor. A corner is the worst place in the game
//   to fight a STRATA wave and the open middle is the best, which is the
//   reverse of every other theme.
//
//   Which is exactly why it is the theme most likely to break quietly. Every
//   one of these mechanics degrades into an ordinary enemy rather than into an
//   error: a scree that stops at the wall is a charger, a stone that does not
//   bounce is a slow dart, a geode aiming at the player instead of their path
//   is a mortar, and a gargoyle that drops on sight is a shrike.
//
// WHAT IS ASSERTED
//   1. All six build and survive their AI.
//   2. A scree commits to a roll, cannot steer, and is TURNED by a wall.
//   3. A slinger's stone reflects off a wall - once, and only off a wall.
//   4. A geode fires at where the player HAS BEEN, not where they are.
//   5. A gargoyle holds its perch, is armoured there, comes down only when
//      walked under, and is unarmoured once it has.
//   6. The SIEGE fight: contact always costs, every attack telegraphs before
//      it hurts, the fault is an ordered crack and not a blob, the slide is
//      far faster than the walk, rubble it lays keeps costing, and over a
//      long window it never stops asking questions.
import { bootPage, launchBrowser, sleep, startServer } from './harness.mjs';

const PORT = 8233;
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const STRATA_TYPES = ['scree', 'slinger', 'bulwark', 'geode', 'warden', 'gargoyle'];

try {
  browser = await launchBrowser();
  const { page, errors } = await bootPage(browser, PORT);

  const out = await page.evaluate(async (STRATA_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const ENEMY = await import('./js/enemy.js');
    const TYPES = ENEMY.ENEMY_TYPES;
    const THREE = await import('three');
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
    // SECONDS OF GAME, not a count of frames. The loop clamps dt at 0.05, so a
    // frame is worth 1/60s of game on an idle machine and up to 0.05s on a
    // loaded one - the same steps(n) simulates THREE TIMES more game on a slow
    // host. Anything whose meaning is a duration has to be waited for in this
    // unit or it silently changes what it is testing.
    const simSteps = async (seconds) => {
      const until = g.time + seconds;
      while (g.time < until) await step();
    };
    const res = {};

    g.autoTest = false;
    g.input.shoot = false;
    g.input.shootFresh = false;
    let px = 0;
    let pz = 0;
    let god = true;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => {
      origUpdate(...args);
      p.pos.set(px, 0, pz);
      if (god) p.health = p.maxHealth;
    };
    // SECONDS, not frames. What this measures is damage taken over a WINDOW,
    // and a window counted in frames is three times longer on a loaded host -
    // which turns "costs nothing while it is up there" into a question about
    // whether the gargoyle stays perched for six seconds rather than two.
    const measure = async (seconds, fn) => {
      god = false;
      p.health = p.maxHealth;
      const before = p.health;
      if (fn) fn();
      await simSteps(seconds);
      const lost = before - p.health;
      god = true;
      return +lost.toFixed(2);
    };

    const clean = () => {
      // Parked with a queue sentinel - 'idle' alone lets the machinery start
      // the NEXT wave into the middle of a measurement. See test/verdant.mjs.
      g.waveState = 'active';
      g.queue.length = 0;
      g.queue.push('chaser');
      g.spawnTimer = 1e6;
      g._clearEntities();
      g._clearHazards();
      g._mortars.forEach((m) => g.effects.markRelease(m.mark));
      g._mortars.length = 0;
      p.clearStatuses();
      god = true;
      p.health = p.maxHealth;
      p.invulnEnd = -1;
      p.wardReady = false;
      p.mods.dodgeChance = 0;
      px = 0;
      pz = 0;
    };
    const put = (type, x, z) => {
      g.spawnEnemy(type);
      const e = g.enemies[g.enemies.length - 1];
      e.pos.set(x, e.pos.y, z);
      return e;
    };

    // ---- 1. all six survive being alive ---------------------------------
    {
      clean();
      const built = {};
      const subjects = [];
      for (const t of STRATA_TYPES) {
        const e = put(t, 9, 9);
        subjects.push(e);
        built[t] = !!(e.group && e.group.children.length > 2);
      }
      await simSteps(2);
      res.allBuilt = Object.values(built).every(Boolean);
      res.builtDetail = built;
      res.subjectsAlive = subjects.filter((e) => !e.dead).length;
      res.subjectsMade = subjects.length;
      clean();
    }

    // ---- 2. the scree rolls, cannot steer, and is turned by a wall -------
    {
      clean();
      // Player pinned near a wall with the scree inboard of them, so the roll
      // is aimed AT the wall and has to meet it inside the test's window.
      //
      // AND THE COVER IS CLEARED FIRST. A roll now ends when it meets a crate
      // - deliberately, so cover answers a scree - which means a layout with
      // anything at all between the two of them measures the terrain generator
      // rather than the wall. The subject here is the carom.
      g.arena.obstacles.length = 0;
      g.arena.ground.length = 0;
      px = 19;
      pz = 0;
      const e = put('scree', 8, 0);
      let rolled = false;
      let heading = null;
      let drift = 0;
      let bounced = false;
      let flipped = false;
      let maxX = 0;
      let blocked = 0;
      for (let i = 0; i < 1800; i++) {
        await step();
        const sc = e.sc;
        if (!sc) continue;
        if (sc.state === 'roll') {
          maxX = Math.max(maxX, Math.abs(e.pos.x));
          blocked = Math.max(blocked, e.blockedBy || 0);
          if (!heading) {
            heading = { x: sc.hx, z: sc.hz };
            rolled = true;
          } else {
            // A bounce REVERSES the heading, so drift is only meaningful up to
            // the first turn - after that a changed heading is the mechanic
            // working, not the enemy steering.
            //
            // THE ORDER MATTERS. The frame a bounce happens is the frame the
            // heading flips, so `bounced` has to be updated BEFORE drift is
            // sampled or that one frame's reversal is recorded as steering -
            // which is exactly what it was, reading a drift of 2.
            if (sc.left < 3) bounced = true;
            if (!bounced) {
              drift = Math.max(drift, Math.abs(sc.hx - heading.x) + Math.abs(sc.hz - heading.z));
            }
            if (bounced && Math.sign(sc.hx) !== Math.sign(heading.x)) flipped = true;
          }
        }
        if (bounced && flipped) break;
      }
      res.screeMaxX = +maxX.toFixed(1);
      res.screeLeft = e.sc ? e.sc.left : -1;
      res.screeBlocked = +blocked.toFixed(2);
      res.screeRolled = rolled;
      res.screeDrift = +drift.toFixed(4);
      res.screeBounced = bounced;
      res.screeReversed = flipped;
      clean();
    }

    // ---- 3. the slinger's stone reflects off a wall ----------------------
    // Driven directly rather than waiting for a slinger to line one up: the
    // subject is the ROUND, and aiming it at a wall by hand is the only way to
    // be sure it met one.
    {
      clean();
      const from = new THREE.Vector3(18, 1.2, 0);
      const toward = new THREE.Vector3(40, 1.2, 0);   // straight at the +x wall
      const shot = new ENEMY.Projectile(
        g.scene, g.effects.glowTex, from.x, from.y, from.z, toward, 18, 5, 'slinger'
      );
      res.slingBouncesArmed = shot.bounces;
      g.projectiles.push(shot);
      const vx0 = shot.vel.x;
      let vxAfter = vx0;
      let alive = true;
      for (let i = 0; i < 240; i++) {
        await step();
        if (!g.projectiles.includes(shot)) { alive = false; break; }
        vxAfter = shot.vel.x;
        if (Math.sign(vxAfter) !== Math.sign(vx0)) break;
      }
      res.slingSurvivedWall = alive;
      res.slingReversed = Math.sign(vxAfter) !== Math.sign(vx0);
      res.slingSpent = shot.bounces;
      // A round with no bounce left must NOT reflect again - one turn is the
      // whole contract, because the player has to be able to predict it.
      const plain = new ENEMY.Projectile(
        g.scene, g.effects.glowTex, from.x, from.y, from.z, toward, 18, 5, 'shooter'
      );
      res.plainBouncesArmed = plain.bounces;
      g.projectiles.push(plain);
      let plainAlive = true;
      for (let i = 0; i < 240; i++) {
        await step();
        if (!g.projectiles.includes(plain)) { plainAlive = false; break; }
      }
      res.plainDiedAtWall = !plainAlive;
      clean();
    }

    // ---- 4. the geode fires at the player's PATH -------------------------
    {
      clean();
      const e = put('geode', 15, 0);
      e.speed = 0;
      // Walk the player along a line so "where they were" and "where they are"
      // are unmistakably different places.
      let t = 0;
      for (let i = 0; i < 1600; i++) {
        t += 0.06;
        px = Math.min(12, t * 1.6);
        pz = 0;
        await step();
        if (g._mortars.length > 0) break;
      }
      const ms = g._mortars.map((m) => ({ x: m.x, z: m.z }));
      res.geodeSpikes = ms.length;
      // THE POINT: at least one spike is well behind the player, on ground
      // they have already left. A geode aiming at the player would put all of
      // them within a stride.
      const dists = ms.map((m) => Math.hypot(m.x - px, m.z - pz));
      res.geodeNearest = ms.length ? +Math.min(...dists).toFixed(1) : -1;
      res.geodeFarthest = ms.length ? +Math.max(...dists).toFixed(1) : -1;
      res.geodeTrails = ms.length > 1 && Math.max(...dists) > 1.5;
      clean();
    }

    // ---- 5. the gargoyle holds its perch ---------------------------------
    {
      clean();
      const e = put('gargoyle', 12, 0);
      const armorNow = () => TYPES.gargoyle.armor(e);
      // Well away from underneath it. It must simply sit there.
      px = 0;
      pz = 0;
      await simSteps(3);
      res.gargPerched = e.perched === true;
      res.gargHigh = e.pos.y > 4;
      res.gargArmorUp = armorNow();
      res.gargIdleCost = await measure(2);
      const restX = e.pos.x;
      const restZ = e.pos.z;

      // Walk under it.
      px = e.pos.x;
      pz = e.pos.z;
      for (let i = 0; i < 600 && e.perched; i++) await step();
      res.gargDropped = !e.perched;
      // It drops where it was perched rather than chasing across the room.
      res.gargDropDrift = +Math.hypot(e.pos.x - restX, e.pos.z - restZ).toFixed(1);
      for (let i = 0; i < 600 && !e.slammed; i++) await step();
      res.gargSlammed = !!e.slammed;
      res.gargLow = e.pos.y < 1.5;
      res.gargArmorDown = armorNow();
      clean();
    }

    // ---- 6. SIEGE: the reworked boss -------------------------------------
    // The suite that owns the fight. What is asserted, per attack, is the
    // DIFFERENCE - a windup that costs nothing against a landing that does,
    // the crack's ordered circles against a blob, the slide's speed against
    // the walk's, rubble against clear floor. Each attack is forced open on
    // its own cooldown so it is the only thing firing.
    {
      clean();
      g.arena.obstacles.length = 0;
      g.arena.ground.length = 0;
      const mortarLog = [];
      const origMortar = g._addMortar.bind(g);
      g._addMortar = (x, z, r, delay, dmg, ground) => {
        mortarLog.push({
          x: +x.toFixed(2), z: +z.toFixed(2), r, delay,
          dmg: +dmg.toFixed(1), ground: !!ground,
        });
        origMortar(x, z, r, delay, dmg, ground);
      };
      // Pins one attack's clock at zero and every other far away, so the
      // answer measured below belongs to the attack and not to the kit.
      const freezeOthers = (boss, open) => {
        for (const k of ['stompCd', 'faultCd', 'slideCd', 'salvoCd', 'rubbleCd']) {
          boss.bs[k] = k === open ? 0 : 999;
        }
        boss.bs.chain = 0;
      };
      res.touchLost = 0;
      res.stompEntered = false;
      res.stompMarked = false;
      res.stompFillCost = 0;
      res.stompPlanted = false;
      res.stompHit = 0;
      res.faultN = 0;
      res.faultOrdered = false;
      res.laneMarked = false;
      res.lanePlanted = false;
      res.slideSeen = false;
      res.slideSpeed = 0;
      res.laneWall = false;
      res.laneWallRecover = 0;
      res.slideShells = 0;
      res.salvoFired = false;
      res.salvoN = 0;
      res.salvoNear = false;
      res.rubbleLaid = false;
      res.rubbleShelled = false;
      res.rubbleCost = 0;
      res.attacksIn20 = 0;
      res.attackKinds = 0;
      res.attackDetail = {};
      res.bossPace = 0;

      // A. TOUCH: standing against the body costs, immediately, no windup.
      {
        const boss = put('siege', 0, 0);
        await steps(2);
        res.bossBuilt = !!(boss.group && boss.bs && boss.bs.state === 'walk');
        freezeOthers(boss, 'none');
        boss.bs.chain = 999;
        px = boss.pos.x + 1.9;
        pz = boss.pos.z;
        res.touchLost = await measure(1.6);
        clean();
      }

      // B. STOMP: telegraphed on a held mark, the fill costs nothing, the
      // boss plants to do it, and the landing is real.
      {
        const boss = put('siege', 0, 0);
        await steps(2);
        freezeOthers(boss, 'stompCd');
        px = 5.6;
        pz = 0;
        for (let i = 0; i < 500 && !res.stompEntered; i++) {
          await step();
          res.stompEntered = boss.bs.state === 'stomp';
        }
        if (res.stompEntered) {
          res.stompMarked = boss.bs.mark >= 0;
          const plantX = boss.pos.x;
          res.stompFillCost = await measure(0.4);
          res.stompPlanted = Math.abs(boss.pos.x - plantX) < 0.3;
          res.stompHit = await measure(1.4);
        }
        clean();
      }

      // C. FAULT LINE: a crack racing from its feet toward where the player
      // stood - several circles, ordered along the bearing, staggered in time.
      {
        const boss = put('siege', -2, 0);
        await steps(2);
        freezeOthers(boss, 'faultCd');
        px = 14;
        pz = 0;
        const m0 = mortarLog.length;
        for (let i = 0; i < 500 && mortarLog.length - m0 < 4; i++) await step();
        const crack = mortarLog.slice(m0, m0 + 8);
        res.faultN = crack.length;
        res.faultOrdered = crack.length >= 4
          && crack.every((m) => Math.abs(m.z) < 2)
          && crack.every((m, i) => i === 0 || m.x - crack[i - 1].x > 2.5)
          && crack[crack.length - 1].x - crack[0].x > 8
          && crack.every((m, i) => i === 0 || m.delay > crack[i - 1].delay);
        clean();
      }

      // D. LANDSLIDE: the lane is drawn and held before it moves, then the
      // boss crosses far faster than it walks - and the wall pays the slam
      // back with a fan of shells and no stagger window.
      {
        const boss = put('siege', 2, 0);
        await steps(2);
        freezeOthers(boss, 'slideCd');
        px = 12;
        pz = 6.5;
        const m0 = mortarLog.length;
        let laneX = null;
        let laneZ = null;
        let sx = 0, sz = 0, st0 = 0, dodged = false;
        res.laneMark0 = -2;
        res.laneDrift = 0;
        for (let i = 0; i < 900; i++) {
          await step();
          const st = boss.bs.state;
          if (st === 'lane') {
            // The dodge: the lane locks at the telegraph, so the pinned
            // player steps off it the moment it locks.
            if (!dodged) { dodged = true; pz = -9; }
            if (res.laneMark0 === -2) res.laneMark0 = boss.bs.mark;
            if (boss.bs.mark >= 0) res.laneMarked = true;
            if (laneX !== null) {
              res.laneDrift = Math.max(res.laneDrift,
                Math.hypot(boss.pos.x - laneX, boss.pos.z - laneZ));
            }
            laneX = boss.pos.x;
            laneZ = boss.pos.z;
          }
          if (st === 'slide') {
            res.slideSeen = true;
            if (st0 > 0 && g.time > st0 + 0.04) {
              res.slideSpeed = Math.max(res.slideSpeed,
                Math.hypot(boss.pos.x - sx, boss.pos.z - sz) / (g.time - st0));
            }
            sx = boss.pos.x;
            sz = boss.pos.z;
            st0 = g.time;
          }
          if (st === 'recover') {
            res.laneWallRecover = boss.bs.t;
            res.laneWall = Math.abs(boss.pos.x) > 18 || Math.abs(boss.pos.z) > 18;
            break;
          }
          if (boss.dead) break;
        }
        res.lanePlanted = res.laneDrift < 0.05;
        res.slideSpeed = +res.slideSpeed.toFixed(1);
        res.slideShells = mortarLog.length - m0;
        clean();
      }

      // E. QUARRY SALVO: a volley is several shells at once, all of them
      // around where the player was standing.
      {
        const boss = put('siege', 0, 0);
        await steps(2);
        freezeOthers(boss, 'salvoCd');
        px = 13;
        pz = 0;
        const m0 = mortarLog.length;
        for (let i = 0; i < 400 && !res.salvoFired; i++) {
          await step();
          res.salvoFired = mortarLog.length - m0 >= 4;
        }
        res.salvoN = mortarLog.length - m0;
        res.salvoNear = res.salvoN > 0 &&
          mortarLog.slice(m0).every((m) => Math.hypot(m.x - px, m.z - pz) < 12.5);
        clean();
      }

      // F. OVERBURDEN: what lands becomes rubble, and rubble costs for as
      // long as it lies there - measured with the boss parked out of reach.
      {
        const boss = put('siege', 0, 0);
        await steps(2);
        freezeOthers(boss, 'rubbleCd');
        px = 12;
        pz = 0;
        const m0 = mortarLog.length;
        for (let i = 0; i < 600 && !res.rubbleLaid; i++) {
          await step();
          res.rubbleLaid = g._hazard.some((h) => h.kind === 'rubble');
        }
        res.rubbleShelled = mortarLog.slice(m0).some((m) => m.ground);
        if (res.rubbleLaid) {
          const patch = g._hazard.find((h) => h.kind === 'rubble');
          boss.pos.set(-14, 0, -14);
          boss.speed = 0;
          px = patch.x;
          pz = patch.z;
          res.rubbleCost = await measure(1.4);
        }
        clean();
      }

      // G. PACE: on its own clocks it never stops asking, and the pursuit is
      // faster than the old walk - measured over straight open floor, where
      // 2.9 speed is all the old boss had and the weave is the only tax.
      {
        const boss = put('siege', 0, -20);
        await steps(2);
        const t0 = g.time;
        let prev = 'walk';
        let flip = 0;
        px = 12;
        pz = 12;
        while (g.time - t0 < 20) {
          await step();
          const st = boss.bs.state;
          if (st !== 'walk' && st !== prev) {
            res.attacksIn20++;
            res.attackDetail[st] = (res.attackDetail[st] || 0) + 1;
          }
          prev = st;
          if (++flip % 240 === 0) { px = -px; pz = -pz; }
        }
        res.attackKinds = Object.keys(res.attackDetail).length;
        clean();
      }
      {
        const boss = put('siege', 0, -18);
        await steps(2);
        freezeOthers(boss, 'none');
        boss.bs.chain = 999;
        px = 0;
        pz = 0;
        await simSteps(0.6);
        const sx = boss.pos.x;
        const sz = boss.pos.z;
        const t0 = g.time;
        await simSteps(2.5);
        res.bossPace = +((Math.hypot(boss.pos.x - sx, boss.pos.z - sz) / (g.time - t0)).toFixed(2));
        clean();
      }
      g._addMortar = origMortar;
    }

    await steps(30);
    return res;
  }, STRATA_TYPES);

  ok('every STRATA type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('a scree commits to a roll', out.screeRolled);
  ok('and cannot steer during it', out.screeDrift === 0, `drift=${out.screeDrift}`);
  ok('the wall turns it rather than stopping it', out.screeBounced && out.screeReversed,
    `maxX=${out.screeMaxX} left=${out.screeLeft} blockedBy=${out.screeBlocked}`);

  ok('a slinger round is armed with a bounce', out.slingBouncesArmed === 1,
    `n=${out.slingBouncesArmed}`);
  ok('and the wall reflects it instead of breaking it',
    out.slingSurvivedWall && out.slingReversed);
  ok('the bounce is spent, so it turns only once', out.slingSpent === 0,
    `left=${out.slingSpent}`);
  ok('an ordinary round still breaks on the wall',
    out.plainBouncesArmed === 0 && out.plainDiedAtWall);

  ok('a geode erupts several spikes at once', out.geodeSpikes > 1, `n=${out.geodeSpikes}`);
  ok('and they follow the path rather than the player',
    out.geodeTrails, `nearest=${out.geodeNearest}m farthest=${out.geodeFarthest}m`);

  ok('a gargoyle holds its perch when nobody is under it',
    out.gargPerched && out.gargHigh);
  ok('and costs nothing while it is up there', out.gargIdleCost === 0,
    `lost=${out.gargIdleCost}`);
  ok('it is armoured on the perch',
    out.gargArmorUp > 0 && out.gargArmorUp < 0.3, `armor=${out.gargArmorUp}`);
  ok('walking under it brings it down', out.gargDropped && out.gargSlammed && out.gargLow);
  ok('it drops where it perched rather than chasing', out.gargDropDrift < 4,
    `drift=${out.gargDropDrift}m`);
  ok('and on the floor it is unarmoured', out.gargArmorDown === 1, `armor=${out.gargArmorDown}`);

  ok('siege builds its boss model and state', out.bossBuilt);
  ok('siege: touching the body costs immediately', out.touchLost > 5,
    `lost=${out.touchLost}`);
  ok('siege: the stomp telegraphs on a held mark', out.stompEntered && out.stompMarked);
  ok('and the fill costs nothing until it lands', out.stompFillCost === 0,
    `cost=${out.stompFillCost}`);
  ok('and it plants to do it', out.stompPlanted);
  ok('and the landing is real', out.stompHit > 10, `lost=${out.stompHit}`);
  ok('siege: the fault is a crack, not a blob', out.faultN >= 4 && out.faultOrdered,
    `n=${out.faultN}`);
  ok('siege: the landslide draws its lane before it moves',
    out.laneMarked && out.lanePlanted,
    `mark0=${out.laneMark0} drift=${out.laneDrift}`);
  ok('and it crosses at far more than walking pace',
    out.slideSeen && out.slideSpeed >= 12, `peak=${out.slideSpeed}m/s`);
  ok('and the wall pays the slam back, without a stagger',
    out.laneWall && out.laneWallRecover > 0.95 && out.slideShells >= 3,
    `recover=${out.laneWallRecover} shells=${out.slideShells}`);
  ok('siege: the salvo is several circles around the player',
    out.salvoFired && out.salvoN >= 4 && out.salvoNear, `n=${out.salvoN}`);
  ok('siege: the overburden leaves rubble that bites',
    out.rubbleLaid && out.rubbleShelled && out.rubbleCost > 6,
    `cost=${out.rubbleCost}`);
  ok('siege: it never stops asking questions',
    out.attacksIn20 >= 6 && out.attackKinds >= 3,
    `entries=${out.attacksIn20} kinds=${JSON.stringify(out.attackDetail)}`);
  ok('siege: its pursuit beats the old planted pace', out.bossPace > 3.3,
    `pace=${out.bossPace}m/s`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `STRATA TEST FAIL (${fails})` : 'STRATA TEST PASS');
process.exitCode = fails ? 1 : 0;
