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
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8233;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const out = await page.evaluate(async (STRATA_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const ENEMY = await import('./js/enemy.js');
    const TYPES = ENEMY.ENEMY_TYPES;
    const THREE = await import('three');
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
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
    const measure = async (frames, fn) => {
      god = false;
      p.health = p.maxHealth;
      const before = p.health;
      if (fn) fn();
      await steps(frames);
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
      await steps(120);
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
      await steps(180);
      res.gargPerched = e.perched === true;
      res.gargHigh = e.pos.y > 4;
      res.gargArmorUp = armorNow();
      res.gargIdleCost = await measure(120);
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

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `STRATA TEST FAIL (${fails})` : 'STRATA TEST PASS');
process.exitCode = fails ? 1 : 0;
