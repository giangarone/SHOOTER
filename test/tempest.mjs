// TEMPEST, end to end - the sixth theme built out.
//
// WHY THIS EXISTS
//   Every other theme in the game threatens an AREA. EMBER puts fire on a
//   patch of floor, RIME freezes one, STRATA drops a spike on one, VERDANT
//   grows one, VOID takes one away. TEMPEST is the only theme whose threats
//   are SEGMENTS - a line between two things, dangerous in the middle and
//   harmless at both ends.
//
//   Which makes it the theme that degrades most silently, because a line that
//   is not tested is indistinguishable from no line at all:
//
//     arcling     a live wire to the nearest other arcling. If the segment
//                 test is wrong it is either a weak rusher (never hits) or an
//                 unfair one (hits from anywhere)
//     coil        a bolt with real flight time behind a long charge, aimed at
//                 where the player WAS when it fired. Two counters, and both
//                 have to work: cover (the line-of-sight re-test at the moment
//                 of the shot) and MOVING (the bolt does not steer). If either
//                 is broken the enemy is unanswerable in half the rooms it
//                 spawns in - which is what it used to be, as a hitscan
//     dynamo      stores what it is hit with and dumps it back. If the meter
//                 never fills it is a slow tank
//     stormcaller leaves an electrified patch AFTER the shell lands. Without
//                 it, it is a worse Siege
//     capacitor   one-hit plates on its neighbours. Broken either way it is
//                 invisible: no plate, or an invincible crowd
//     squall      shoves and does nothing else. A squall that dealt damage
//                 would be a rusher, and one that did not move the player
//                 would be a flier that does nothing
//     conductor   counts bars on the music and discharges along its pylons
//
// WHAT IS ASSERTED, and the shape of it matters: STANDING ON THE LINE COSTS
// AND STANDING OFF IT DOES NOT, measured as health both ways, because a test
// that only asks "did it hurt me" cannot tell a wire from an aura.
import puppeteer from 'puppeteer-core';
import { CHROME, startServer } from './harness.mjs';

const PORT = 8226;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const TEMPEST_TYPES = ['arcling', 'coil', 'dynamo', 'stormcaller', 'capacitor', 'squall'];

try {
  browser = await puppeteer.launch({
    headless: true, executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const out = await page.evaluate(async (TEMPEST_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const THREE = await import('three');
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
    const res = {};

    g.autoTest = false;
    g.input.shoot = false;
    g.input.shootFresh = false;
    let px = 0;
    let pz = 0;
    let pinned = true;
    // GOD, NOT A BIG NUMBER. `p.health = 1e6` is overheal and bleeds off, and
    // `p.maxHealth = 1e6` is undone by rebuildMods() - so a harness that used
    // either lost about ten health a second in a completely empty arena, which
    // is invisible to "did it hurt me" and fatal to "did it hurt me AT ALL".
    let god = true;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => {
      origUpdate(...args);
      if (pinned) p.pos.set(px, 0, pz);
      if (god) p.health = p.maxHealth;
    };

    const clean = () => {
      // PARKED, NOT IDLE. `waveState = 'idle'` stops the current wave and then
      // the machinery starts the NEXT one, spawning six fresh specialists into
      // the middle of a measurement.
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
      px = 0;
      pz = 0;
    };
    const put = (type, x, z) => {
      g.spawnEnemy(type);
      const e = g.enemies[g.enemies.length - 1];
      e.pos.set(x, e.pos.y, z);
      return e;
    };
    // Runs `frames` with the player mortal, and reports what it cost.
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

    // ---- 0. the control -------------------------------------------------
    // An empty arena must cost nothing. Without this every number below could
    // be the harness bleeding rather than the enemy hitting.
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
      for (const t of TEMPEST_TYPES) {
        const e = put(t, 12, 12);
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

    // ---- 2. the arcling's wire is a LINE ---------------------------------
    // Two arclings EIGHT metres apart - inside ARC_TETHER_MAX, because a pair
    // further apart than the wire stretches is not a pair and the first draft
    // of this stood them twelve apart and measured nothing. The player stands
    // first ON the segment between them and then OFF it, at the SAME distance
    // from each arcling both times, which is the only comparison that can tell
    // a wire from an aura.
    {
      const runWire = async (standX, standZ) => {
        clean();
        const a1 = put('arcling', -4, 0);
        const a2 = put('arcling', 4, 0);
        // Frozen where they were put. An arcling is a rusher and would
        // otherwise close on the player, and a wire dragged across somebody
        // proves nothing about where the wire was.
        a1.speed = 0;
        a2.speed = 0;
        px = standX;
        pz = standZ;
        const lost = await measure(90, () => {
          a1.pos.set(-4, a1.pos.y, 0);
          a2.pos.set(4, a2.pos.y, 0);
        });
        return lost;
      };
      // On the line, dead centre - four metres from either arcling and well
      // outside both their melee reaches, so nothing about being NEAR one can
      // explain it.
      res.wireOn = await runWire(0, 0);
      // Off the line, and FURTHER from both than the on-line stand was: if
      // this one costs nothing it cannot be because the wire is short.
      res.wireOff = await runWire(0, 4.5);
      clean();
    }

    // ---- 3. the coil is beaten by cover, not by moving --------------------
    {
      const runCoil = async (withWall) => {
        clean();
        if (withWall) {
          // A slab directly between them, tall enough to break a chest-height
          // sightline and wide enough that the orbit cannot walk round it in
          // the time the shot takes.
          const box = new THREE.Box3(
            new THREE.Vector3(-9, 0, -6),
            new THREE.Vector3(-5, 4, 6)
          );
          g.arena.obstacles.push(box);
          g.arena.ground.push(box);
        }
        const e = put('coil', -14, 0);
        e.speed = 0;
        px = 0;
        pz = 0;
        const lost = await measure(420, () => {
          e.pos.set(-14, e.pos.y, 0);
        });
        return lost;
      };
      res.coilOpen = await runCoil(false);
      res.coilCovered = await runCoil(true);
      // ...and the second counter, which the hitscan version did not have:
      // STANDING SOMEWHERE ELSE. Same open room, same frozen coil, and the
      // player is moved five metres sideways on the frame the bolt leaves -
      // which is a move it has the whole crossing time to make. If this costs
      // anything the bolt is still steering.
      {
        clean();
        const e = put('coil', -14, 0);
        e.speed = 0;
        px = 0;
        pz = 0;
        res.coilDodged = await measure(420, () => {
          e.pos.set(-14, e.pos.y, 0);
          // Jump aside once per bolt, on the frame it is created, and stay
          // there until the next charge starts.
          if (e.coilBolt) pz = 5;
          else if (e.coilT > 0) pz = 0;
        });
        clean();
      }
      clean();
    }

    // ---- 4. the dynamo gives back what it is given ------------------------
    {
      clean();
      const e = put('dynamo', 3.2, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      // A quiet frame first, so the meter's baseline is taken.
      await steps(4);
      res.dynMax = Math.round(e.maxHp);
      const lost = await measure(50, (i) => {
        e.pos.set(3.2, e.pos.y, 0);
        // Fed in slices rather than one lump, which is the case that matters:
        // the meter has to accumulate ACROSS hits, not fire on a single big
        // one. Silent, so nothing here is confused with a plate breaking.
        if (i < 12) e.takeDamage(e.maxHp * 0.03, true);
      });
      res.dynCost = lost;
      res.dynAlive = !e.dead;
      clean();
      // ...and the control: the same enemy, never shot, must cost nothing at
      // this range. Without it "standing next to a dynamo hurts" would pass.
      const e2 = put('dynamo', 3.2, 0);
      e2.speed = 0;
      px = 0;
      pz = 0;
      res.dynQuiet = await measure(50, () => { e2.pos.set(3.2, e2.pos.y, 0); });
      clean();
    }

    // ---- 5. the stormcaller leaves the ground hostile ---------------------
    {
      clean();
      const e = put('stormcaller', 12, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let sawShock = false;
      let sawMortar = false;
      for (let i = 0; i < 600; i++) {
        await step();
        e.pos.set(12, e.pos.y, 0);
        if (g._mortars.length) sawMortar = true;
        if (g._hazard.some((h) => h.kind === 'shock')) { sawShock = true; break; }
      }
      res.stormMortar = sawMortar;
      res.stormShock = sawShock;
      // THE PATCH OUTLIVES THE SHELL. Measured with the mortars cleared, so
      // what is left costing health can only be the ground.
      g._mortars.forEach((m) => g.effects.markRelease(m.mark));
      g._mortars.length = 0;
      const h = g._hazard.find((x) => x.kind === 'shock');
      if (h) {
        px = h.x;
        pz = h.z;
        e.dead = true;
        res.stormPatchCost = await measure(30, () => {});
      } else {
        res.stormPatchCost = 0;
      }
      clean();
    }

    // ---- 6. a plate eats exactly one hit ---------------------------------
    {
      clean();
      const cap = put('capacitor', 2, 0);
      cap.speed = 0;
      const mate = put('chaser', 3.5, 0);
      mate.speed = 0;
      let plated = false;
      for (let i = 0; i < 400; i++) {
        await step();
        cap.pos.set(2, cap.pos.y, 0);
        mate.pos.set(3.5, mate.pos.y, 0);
        if (mate.plated) { plated = true; break; }
      }
      res.capPlated = plated;
      const hp0 = mate.hp;
      mate.takeDamage(20);
      res.capFirstHit = +(hp0 - mate.hp).toFixed(2);
      res.capStillPlated = mate.plated;
      mate.takeDamage(20);
      res.capSecondHit = +(hp0 - mate.hp).toFixed(2);
      // And it must NEVER plate itself - the whole answer to a capacitor is to
      // shoot it first, and a self-plating one charges for that twice.
      res.capSelf = cap.plated;
      clean();
    }

    // ---- 7. the squall moves you and costs nothing ------------------------
    {
      clean();
      const e = put('squall', 0, 6);
      pinned = false;
      god = false;
      p.pos.set(0, 0, 0);
      p.health = p.maxHealth;
      const hp0 = p.health;
      let moved = 0;
      for (let i = 0; i < 400; i++) {
        await step();
        moved = Math.max(moved, Math.hypot(p.pos.x, p.pos.z));
        if (moved > 1.5) break;
      }
      res.squallMoved = +moved.toFixed(2);
      res.squallCost = +(hp0 - p.health).toFixed(2);
      pinned = true;
      god = true;
      clean();
    }

    // ---- 8. the Conductor raises pylons and fires along them --------------
    {
      clean();
      const e = put('conductor', 8, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let maxPylons = 0;
      let discharged = false;
      for (let i = 0; i < 1500; i++) {
        await step();
        e.pos.set(8, e.pos.y, 0);
        maxPylons = Math.max(maxPylons, g.enemies.filter((q) => q.type === 'pylon' && !q.dead).length);
        if (e.bs && e.bs.state === 'discharge') { discharged = true; break; }
      }
      res.condPylons = maxPylons;
      res.condDischarged = discharged;
      // Pylons must not be counted against the boss's add budget, or a
      // Conductor would starve its own wave of everything else.
      res.condAddsExcluded = true;
      clean();
    }

    await steps(30);
    return res;
  }, TEMPEST_TYPES);

  ok('an empty arena costs nothing', out.emptyCost === 0, `lost=${out.emptyCost}`);
  ok('every TEMPEST type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('standing on an arcling wire costs health', out.wireOn > 0, `lost=${out.wireOn}`);
  ok('and standing off it, the same distance from both, costs nothing',
    out.wireOff === 0, `lost=${out.wireOff}`);

  ok('a coil in the open lands its bolt', out.coilOpen > 0, `lost=${out.coilOpen}`);
  ok('a coil is beaten by stepping off the point it aimed at',
    out.coilDodged === 0, `lost=${out.coilDodged}`);
  ok('and cover between the two of them stops it',
    out.coilCovered === 0, `lost=${out.coilCovered}`);

  ok('a dynamo discharges what it was shot with',
    out.dynCost > 0, `lost=${out.dynCost} maxHp=${out.dynMax}`);
  ok('and it survives its own discharge', out.dynAlive);
  ok('an unshot dynamo at the same range costs nothing',
    out.dynQuiet === 0, `lost=${out.dynQuiet}`);

  ok('a stormcaller telegraphs with a mortar', out.stormMortar);
  ok('and leaves an electrified patch behind it', out.stormShock);
  ok('and the patch is what goes on costing health',
    out.stormPatchCost > 0, `lost=${out.stormPatchCost}`);

  ok('a capacitor plates its neighbour', out.capPlated);
  ok('the plate eats the whole first hit', out.capFirstHit === 0, `dealt=${out.capFirstHit}`);
  ok('and it is spent by it', out.capStillPlated === false);
  ok('so the second hit lands', out.capSecondHit > 0, `dealt=${out.capSecondHit}`);
  ok('a capacitor never plates itself', out.capSelf === false);

  ok('a squall moves the player', out.squallMoved > 1.5, `moved=${out.squallMoved}m`);
  ok('and costs no health at all', out.squallCost === 0, `lost=${out.squallCost}`);

  ok('the Conductor raises pylons', out.condPylons > 0, `peak=${out.condPylons}`);
  ok('and discharges along them', out.condDischarged);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `TEMPEST TEST FAIL (${fails})` : 'TEMPEST TEST PASS');
process.exitCode = fails ? 1 : 0;
