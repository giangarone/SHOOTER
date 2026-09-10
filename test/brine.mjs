// BRINE, end to end - the seventh theme built out.
//
// WHY THIS EXISTS
//   Every theme before this one asks the player to BE SOMEWHERE ELSE. Off the
//   fire, out of the field, out of the corner, off the line. BRINE is the
//   theme built so that being somewhere else is the thing it takes away:
//
//     gulper    strikes, swallows and gives ground. A bite FEEDS it - healed by
//               the health the mouthful took - and the back-step afterwards is
//               the kill window. The one enemy whose lunge is faster than the
//               player's walk, so it arrives; it cannot steer, so it can be
//               stepped off
//     angler    a homing round that is itself a TARGET - the only enemy
//               projectile in the game a pellet can stop
//     barnacle  roots itself and drags the player in, and cover is the only
//               thing that breaks the current
//     vent      the only SOLID hazard in the game: a column that is real
//               geometry for as long as it stands
//     drifter   ink that costs no health at all and takes the player's sight
//     choir     three bodies, one bar, and only one of them is the right one
//               to kill
//
//   Four of those six are invisible when broken rather than obviously wrong.
//   A strike that never arrives is the old latch's bug - a rusher slower than
//   the player it hunts. A bite that does not feed is a plain rusher with a
//   coloured particle. A column that is not solid is a slow lava patch. A
//   current that ignores cover is a brute with no counter. So every assertion
//   below is a PAIR wherever a pair is possible - it struck AND it fed, it
//   walled AND the wall came down, it pulled AND cover stopped it.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8227;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const BRINE_TYPES = ['gulper', 'angler', 'barnacle', 'vent', 'howler', 'drifter'];

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const out = await page.evaluate(async (BRINE_TYPES) => {
    const g = window.__game;
    const p = g.player;
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
    let pinned = true;
    let god = true;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => {
      origUpdate(...args);
      if (pinned) p.pos.set(px, 0, pz);
      if (god) p.health = p.maxHealth;
    };

    // The arena's OWN obstacle lists, kept so the wall test can prove a column
    // was added to them and taken back out again.
    const baseObs = g.arena.obstacles.length;
    const clean = () => {
      g.waveState = 'active';
      g.queue.length = 0;
      g.queue.push('chaser');
      g.spawnTimer = 1e6;
      g._clearEntities();
      g._clearHazards();
      g._mortars.forEach((m) => g.effects.markRelease(m.mark));
      g._mortars.length = 0;
      g.arena.obstacles.length = 0;
      g.arena.ground.length = 0;
      p.clearStatuses();
      g.input.forward = false;
      g.input.back = false;
      g.input.left = false;
      g.input.right = false;
      g.input.jump = false;
      g.input.sprint = false;
      g.input.crouch = false;
      g.input.moveF = 0;
      g.input.moveS = 0;
      pinned = true;
      god = true;
      p.health = p.maxHealth;
      p.invulnEnd = -1;
      p.wardReady = false;
      p.mods.dodgeChance = 0;
      p.meleeActive = 0;
      p.dashEnd = 0;
      px = 0;
      pz = 0;
    };
    const put = (type, x, z) => {
      g.spawnEnemy(type);
      const e = g.enemies[g.enemies.length - 1];
      e.pos.set(x, e.pos.y, z);
      return e;
    };
    const measure = async (frames, fn) => {
      god = false;
      p.health = p.maxHealth;
      p.invulnEnd = -1;
      const h0 = p.health;
      for (let i = 0; i < frames; i++) {
        await step();
        if (fn) fn(i);
      }
      const lost = +(h0 - p.health).toFixed(2);
      god = true;
      p.health = p.maxHealth;
      return lost;
    };

    {
      clean();
      res.emptyCost = await measure(80);
      clean();
    }

    // ---- 1. all six survive being alive ---------------------------------
    {
      clean();
      const built = {};
      const subjects = [];
      for (const t of BRINE_TYPES) {
        const e = put(t, 13, 13);
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

    // ---- 2. the gulper strikes, feeds, and gives ground -------------------
    // THREE HALVES, because any one alone is a broken enemy: a strike that
    // never reaches is the old latch's bug back again (a rusher slower than
    // the player it hunts), a bite that does not feed it is a plain rusher,
    // and a strike with no back-step afterwards is a hit with no answer.
    {
      clean();
      const e = put('gulper', 6, 0);
      // WOUNDED FIRST, or the heal is invisible: a fresh gulper is at full
      // bar and Math.min(maxHp, ...) would swallow the mouthful's whole
      // effect. Half a bar leaves room to see it fed without leaving so
      // little that a single bite's tick kills it mid-test.
      e.takeDamage(e.maxHp * 0.5, true);
      // ZEROED, so the tell starts on the first frame the range gate allows
      // and the measurement is not a race against the spawn cooldown.
      e.gulp = { state: 'walk', t: 0, hx: 0, hz: 1 };
      let struck = false;
      let retreated = false;
      let retreatDist = 0;
      let closest = 99;
      let hpAfter = null;
      let watched = 0;
      for (let i = 0; i < 900; i++) {
        await step();
        closest = Math.min(closest, Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z));
        const gs = e.gulp;
        if (gs && gs.state === 'lunge') struck = true;
        if (struck && gs && gs.state === 'swallow') {
          // FED, decided on the FIRST swallow frame: hp after the bite
          // against the half-bar it was wounded to.
          if (hpAfter === null) hpAfter = e.hp;
          retreated = true;
        }
        if (retreated) {
          // Watched for long enough to see the whole give-ground, then stop:
          // the retreat is a second and a bit, and the assertion is a
          // distance that only grows while this runs.
          if (++watched > 120) break;
          retreatDist = Math.max(retreatDist, Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z));
        }
      }
      res.gulpStruck = struck;
      res.gulpClosest = +closest.toFixed(2);
      // The bite healed it past the half-bar mark, by the health the hit
      // actually took - p is at full health with god on, so the mouthful is
      // the full damage number times the feed multiplier.
      res.gulpFed = hpAfter !== null && hpAfter > e.maxHp * 0.5 + 1;
      res.gulpFedHp = hpAfter === null ? -1 : +hpAfter.toFixed(1);
      res.gulpRetreated = retreated;
      res.gulpRetreatDist = +retreatDist.toFixed(2);
      clean();
    }

    // ---- 3. the angler's bubble is a target -------------------------------
    {
      clean();
      const e = put('angler', 16, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let bubble = null;
      for (let i = 0; i < 700; i++) {
        await step();
        e.pos.set(16, e.pos.y, 0);
        bubble = g.projectiles.find((pr) => pr.type === 'angler');
        if (bubble) break;
      }
      res.anglerFired = !!bubble;
      if (bubble) {
        // It is TAGGED, which is what puts it in the pellet's target list -
        // an untagged round is a round the player cannot shoot at all.
        res.bubbleTagged = bubble.mesh.userData.bubble === bubble;
        res.bubbleShootable = !!bubble.shootable;
        // AND IT STEERS. Measured as the angle between where it was pointed
        // and where the player is, closing over time: a round fired at a
        // pinned player is already aimed, so the test moves the aim point.
        px = 0;
        pz = 12;
        const dot0 = (() => {
          const dx = px - bubble.pos.x;
          const dz = pz - bubble.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const v = Math.hypot(bubble.vel.x, bubble.vel.z) || 1;
          return (dx / d) * (bubble.vel.x / v) + (dz / d) * (bubble.vel.z / v);
        })();
        await steps(30);
        const dot1 = (() => {
          const dx = px - bubble.pos.x;
          const dz = pz - bubble.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const v = Math.hypot(bubble.vel.x, bubble.vel.z) || 1;
          return (dx / d) * (bubble.vel.x / v) + (dz / d) * (bubble.vel.z / v);
        })();
        res.bubbleTurned = +(dot1 - dot0).toFixed(3);
      }
      clean();
    }

    // ---- 4. the barnacle's current, and the cover that breaks it ----------
    {
      const runPull = async (withWall) => {
        clean();
        if (withWall) {
          // Tall, wide and right up against the player, so there is no angle
          // the current can arrive from. A narrow slab left a sliver of open
          // line either side of it and the two runs came out too close
          // together to mean anything.
          const box = new THREE.Box3(
            new THREE.Vector3(2.5, 0, -8),
            new THREE.Vector3(5, 5, 8)
          );
          g.arena.obstacles.push(box);
          g.arena.ground.push(box);
        }
        const e = put('barnacle', 10, 0);
        e.speed = 0;
        pinned = false;
        god = true;
        p.pos.set(0, 0, 0);
        let moved = 0;
        // A FIXED WINDOW, and no early exit. The first version stopped the
        // open run the moment it passed its threshold and let the blocked run
        // go the full distance, so the two numbers were measured over
        // different amounts of time and could not be compared.
        for (let i = 0; i < 700; i++) {
          await step();
          e.pos.set(10, e.pos.y, 0);
          moved = Math.max(moved, p.pos.x);
        }
        pinned = true;
        px = 0;
        pz = 0;
        return +moved.toFixed(2);
      };
      res.barnPull = await runPull(false);
      res.barnBlocked = await runPull(true);
      clean();
    }

    // ---- 5. the vent leaves something SOLID ------------------------------
    {
      clean();
      const e = put('vent', 14, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let raised = 0;
      let h = null;
      for (let i = 0; i < 900; i++) {
        await step();
        e.pos.set(14, e.pos.y, 0);
        h = g._hazard.find((x) => x.kind === 'scald');
        if (h) { raised = g.arena.obstacles.length; break; }
      }
      res.ventRaised = !!h;
      // THE COLUMN IS REAL GEOMETRY, in both lists - obstacles is what bodies
      // are resolved out of and ground is what shots stop against, and a
      // pillar in one but not the other is either a wall you can shoot
      // through or cover you can walk through.
      res.ventInObstacles = raised > 0;
      res.ventInGround = h ? g.arena.ground.indexOf(h.box) >= 0 : false;
      res.ventHasBox = !!(h && h.box);
      // ...AND IT COMES BACK DOWN. A box that went in and never came out is a
      // permanent invisible pillar nobody could explain.
      e.dead = true;
      for (let i = 0; i < 400; i++) {
        await step();
        if (!g._hazard.some((x) => x.kind === 'scald')) break;
      }
      res.ventDropped = g.arena.obstacles.length === 0 && g.arena.ground.length === 0;
      clean();
    }

    // ---- 6. the drifter inks, and it costs nothing ------------------------
    {
      clean();
      const e = put('drifter', 0, 6);
      let inked = false;
      let cloud = -1;
      for (let i = 0; i < 500; i++) {
        await step();
        const h = g._hazard.find((x) => x.kind === 'ink');
        if (h) { inked = true; cloud = h.cloud; break; }
      }
      res.driftInked = inked;
      // THE CLOUD IS THE MECHANIC, not decoration - an ink zone that failed to
      // get a cloud slot is an invisible enemy doing nothing at all.
      res.driftCloud = cloud >= 0;
      const h = g._hazard.find((x) => x.kind === 'ink');
      if (h) {
        e.dead = true;
        px = h.x;
        pz = h.z;
        res.driftCost = await measure(40, () => {});
      } else {
        res.driftCost = -1;
      }
      clean();
    }

    // ---- 7. the choir is three bodies and one bar -------------------------
    {
      clean();
      g.setTheme('brine');
      g.wave = 39;
      g.waveState = 'idle';
      g.interT = 0.05;
      p.health = 100000;
      p.maxHealth = 100000;
      god = false;
      pinned = false;
      let parts = 0;
      let frac = 0;
      for (let i = 0; i < 900; i++) {
        await step();
        if (g.bossFight) {
          parts = Math.max(parts, g.bossFight.parts.length);
          frac = g._bossHpFrac();
          if (parts >= 3) break;
        }
      }
      res.choirParts = parts;
      res.choirKey = g.bossFight ? g.bossFight.key : null;
      // ONE BAR. The pool was divided rather than duplicated, so three bodies
      // read as the same fight the single body was going to be - a bar over
      // one means the split handed out health nobody paid for.
      res.choirFracAtStart = +frac.toFixed(2);
      // LET THEM ALL RUN A FRAME FIRST. The two siblings go in through
      // _pendingSpawns, so the frame the choir forms is a frame on which they
      // exist and have not yet had an ai() - and a body that has never seen
      // three of itself has nothing to notice one of them leaving. The first
      // draft killed on that exact frame and measured nothing.
      await steps(30);
      // Exactly one of them is singing at a time, and it is the only thing
      // that tells the player which one to kill.
      const bodies = g.enemies.filter((e) => e.type === 'choir' && !e.dead);
      res.choirBodies = bodies.length;
      res.choirSinging = bodies.filter((e) => e.bs && e.bs.singing).length;
      // ...and the three have three different voices.
      res.choirVoices = new Set(bodies.map((e) => e.bs && e.bs.voice)).size;
      // KILLING A SILENT ONE FREES THE REST.
      const silent = bodies.find((e) => e.bs && !e.bs.singing);
      const other = bodies.find((e) => e !== silent);
      const freed0 = other && other.bs ? other.bs.freed : 0;
      if (silent) silent.dead = true;
      await steps(10);
      res.choirFreed = other && other.bs ? +other.bs.freed.toFixed(2) : 0;
      res.choirFreedRose = res.choirFreed > freed0;
      g.enemies.forEach((e) => { e.dead = true; });
      await steps(20);
      pinned = true;
      god = true;
      clean();
    }

    await steps(30);
    return res;
  }, BRINE_TYPES);

  ok('an empty arena costs nothing', out.emptyCost === 0, `lost=${out.emptyCost}`);
  ok('every BRINE type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('a gulper strikes at the player', out.gulpStruck, `closest=${out.gulpClosest}m`);
  ok('and a landed bite feeds it', out.gulpFed,
    `closest=${out.gulpClosest}m hp_after=${out.gulpFedHp}`);
  ok('and it gives ground afterwards', out.gulpRetreated && out.gulpRetreatDist > 1.5,
    `retreat=${out.gulpRetreatDist}m`);

  ok('an angler fires a bubble', out.anglerFired);
  ok('and the bubble is a target the player can shoot',
    out.bubbleTagged && out.bubbleShootable);
  ok('and it steers toward the player', out.bubbleTurned > 0.01, `turned=${out.bubbleTurned}`);

  ok('a barnacle drags the player in', out.barnPull > 1.5, `moved=${out.barnPull}m`);
  // RELATIVE, not absolute. The player is not pinned for this one - they have
  // to be movable for the pull to be visible at all - so a little drift is
  // expected in both runs and what is under test is the difference.
  ok('and cover between them breaks the current',
    out.barnBlocked < out.barnPull * 0.35,
    `open=${out.barnPull}m blocked=${out.barnBlocked}m`);

  ok('a vent raises a column', out.ventRaised && out.ventHasBox);
  ok('and the column is real geometry in both lists',
    out.ventInObstacles && out.ventInGround);
  ok('and it comes back down when it expires', out.ventDropped);

  ok('a drifter lays ink', out.driftInked);
  ok('and the ink gets a cloud, which is the whole mechanic', out.driftCloud);
  ok('and standing in it costs no health at all', out.driftCost === 0, `lost=${out.driftCost}`);

  ok('the Drowned Choir stands up as three', out.choirParts === 3,
    `parts=${out.choirParts} boss=${out.choirKey}`);
  ok('and the three share one bar rather than three',
    out.choirFracAtStart > 0.9 && out.choirFracAtStart <= 1.0,
    `frac=${out.choirFracAtStart}`);
  ok('exactly one of them is singing', out.choirSinging === 1,
    `singing=${out.choirSinging}/${out.choirBodies}`);
  ok('and each body carries a different voice', out.choirVoices === 3,
    `voices=${out.choirVoices}`);
  ok('killing a silent one frees the rest', out.choirFreedRose,
    `freed=${out.choirFreed}`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `BRINE TEST FAIL (${fails})` : 'BRINE TEST PASS');
process.exitCode = fails ? 1 : 0;
