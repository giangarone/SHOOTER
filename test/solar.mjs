// SOLAR, end to end.
//
// WHY THIS EXISTS
//   SOLAR is the theme that attacks the INTERFACE. Everything else in the game
//   takes health, ground or position; three of these four take the two things
//   the player aims with - their sight and their shots - and one of them gives
//   the shots back pointed the wrong way:
//
//     zealot  detonates in a blinding flash when it dies, and only when the
//             player is close. The whole enemy is the decision about range
//     aegis   a mirror that reflects what is fired into it until the plate
//             breaks, worn down by the COUNT of rounds rather than by damage
//     lens    a burning line walked toward the player. Outrun, never dodged
//     halo    takes the crosshair and the hit markers away inside its field
//
//   Two of those reach into the presentation layer, which is why every one of
//   them is asserted as a PAIR: the flash fired close AND did not fire far,
//   the HUD went inside the field AND came back outside it, the plate turned
//   the shot AND stopped turning it once it was spent. A blind that could not
//   be got out of, or a crosshair that never came back, would not look like a
//   bug in an enemy - it would look like a bug in the game.
import { bootPage, launchBrowser, sleep, startServer } from './harness.mjs';

const PORT = 8229;
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const SOLAR_TYPES = ['zealot', 'sniper', 'aegis', 'lens', 'halo', 'shrike'];

try {
  browser = await launchBrowser();
  const { page, errors } = await bootPage(browser, PORT);

  const out = await page.evaluate(async (SOLAR_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const { ENEMY_TYPES } = await import('./js/enemy.js');
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
    // These pairs measure SOLAR mechanics. A randomly generated ordinary
    // room may shorten a boss leap legitimately; terrain traversal is covered
    // by its own suite. Keep the venue, but remove the generated interior.
    g._resetTerrain();
    g.input.shoot = false;
    g.input.shootFresh = false;
    let px = 0;
    let pz = 0;
    let py = 0;
    let pinned = true;
    let god = true;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => {
      origUpdate(...args);
      if (pinned) p.pos.set(px, py, pz);
      if (god) p.health = p.maxHealth;
    };

    const clean = () => {
      g.waveState = 'active';
      g.queue.length = 0;
      g.queue.push('chaser');
      g.spawnTimer = 1e6;
      g._clearEntities();
      g._clearHazards();
      g._mortars.forEach((m) => g.effects.markRelease(m.mark));
      g._mortars.length = 0;
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
      g.rig._blindT = 0;
      px = 0;
      pz = 0;
      py = 0;
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
      for (const t of SOLAR_TYPES) {
        const e = put(t, 15, 15);
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

    // ---- 2. the zealot's flash is a decision about RANGE -----------------
    {
      const blindAt = async (dist) => {
        clean();
        const e = put('zealot', dist, 0);
        e.speed = 0;
        await steps(6);
        e.pos.set(dist, e.pos.y, 0);
        e.takeDamage(1e6);
        await steps(3);
        return +g.rig._blindT.toFixed(2);
      };
      res.blindClose = await blindAt(1.2);
      res.blindFar = await blindAt(19);
      clean();
      // ...and it GOES. A blind that did not run out would not read as an
      // enemy at all, it would read as the game having broken.
      const e = put('zealot', 1.2, 0);
      e.speed = 0;
      await steps(6);
      e.pos.set(1.2, e.pos.y, 0);
      e.takeDamage(1e6);
      // THE PEAK ACROSS THE WHOLE BLIND, not a sample a fixed number of frames
      // in. The white holds for the first third of the duration and then
      // fades, and on a loaded machine three frames can be most of that hold -
      // so a single reading is a race with the frame rate, which is exactly
      // how this suite failed once inside a long chain and never on its own.
      let peak = 0;
      for (let i = 0; i < 300; i++) {
        await step();
        peak = Math.max(peak, g.rig.flash);
        if (g.rig._blindT <= 0) break;
      }
      res.blindPeak = +peak.toFixed(2);
      res.blindCleared = g.rig._blindT <= 0;
      clean();
    }

    // ---- 3. the aegis turns the shot until the plate is spent -------------
    // Driven through the REAL trigger - g.shoot() - rather than by calling the
    // reflect test directly, because what is being asserted is the wiring
    // through _firePellet as much as the arc itself.
    {
      clean();
      p.yaw = 0;
      p.pitch = 0;
      const e = put('aegis', 0, -6);
      e.speed = 0;
      await steps(10);
      e.pos.set(0, e.pos.y, -6);
      const hp0 = e.hp;
      const plate0 = e.plateHp;
      // COUNTED BY IDENTITY, not by the length of the list. A reflected round
      // is spawned six metres from the player and reaches them in about three
      // tenths of a second, so a before/after count over a ten-frame window
      // can see one spawn and the previous one expire and conclude that
      // nothing happened - which is exactly what the first version did.
      const seen = new Set();
      let shots = 0;
      // Enough shots to break an eight-hit plate twice over.
      // WAITS FOR THE SHOT TO ACTUALLY FIRE, rather than counting frames.
      // shoot() respects the weapon's rate of fire and silently refuses a pull
      // that is too soon - the first version called it every other frame,
      // landed five of twenty-four, and concluded the plate did not wear down.
      // A fixed ten frames fixed that on an idle machine and was still a race
      // with the frame rate on a busy one, so the loop now retries until the
      // magazine actually moves.
      for (let i = 0; i < 24; i++) {
        p.reserveAmmo = 300;
        let fired = false;
        for (let f = 0; f < 40 && !fired; f++) {
          p.mag = 30;
          e.pos.set(0, e.pos.y, -6);
          g.shoot();
          if (p.mag < 30) fired = true;
          await step();
          for (const pr of g.projectiles) {
            if (pr.type === 'aegis') seen.add(pr);
          }
        }
        if (!fired) break;
        shots++;
        // A few frames after the shot so the reflected round exists to be seen.
        for (let f = 0; f < 6; f++) {
          await step();
          for (const pr of g.projectiles) {
            if (pr.type === 'aegis') seen.add(pr);
          }
        }
        if (e.plateHp <= 0) break;
      }
      res.aegisPlateNow = e.plateHp;
      res.aegisDead = e.dead;
      res.aegisHp = Math.round(e.hp);
      res.aegisHp0 = Math.round(hp0);
      res.aegisProj = g.projectiles.map((x) => x.type).join(',');
      res.aegisPlate0 = plate0;
      res.aegisReflected = seen.size;
      res.aegisShots = shots;
      // WHILE THE PLATE HELD, NOTHING GOT THROUGH.
      // WHAT THE PLATE WAS WORTH, measured as a PAIR against the same number of
      // shots once it is gone - not as "nothing got through at all", which was
      // the first version and was simply wrong. The plate is a FACING and the
      // gun has a cone: some pellets land on the body beside the mirror, and
      // they are supposed to. What the enemy promises is that shooting AT the
      // plate is a bad trade, and that is a comparison rather than an absolute.
      res.aegisPlatedLoss = +(hp0 - e.hp).toFixed(1);
      res.aegisPlateSpent = e.plateHp <= 0;
      // ...and now the same shot lands.
      // TEN FRAMES AGAIN, for the fire rate - a follow-up shot fired three
      // frames after the last one is a trigger pull the weapon refuses.
      // The same shots again with the mirror gone, so the two runs are
      // comparable: the same weapon, the same range, the same count.
      const hp1 = e.hp;
      for (let i = 0; i < shots; i++) {
        let fired = false;
        for (let f = 0; f < 40 && !fired; f++) {
          p.mag = 30;
          p.reserveAmmo = 300;
          e.pos.set(0, e.pos.y, -6);
          g.shoot();
          if (p.mag < 30) fired = true;
          await step();
        }
        if (!fired || e.dead) break;
      }
      res.aegisBareLoss = +(hp1 - e.hp).toFixed(1);
      res.aegisThroughAfter = e.hp < hp1;
      // The arc, checked directly: a hit that arrived from BEHIND is not on
      // the mirror, and there is no way to ask that through a live shot -
      // the enemy turns to face the player, so its back is never presented.
      // A FRESH ONE, and the bearing derived from where it actually stands.
      //
      // Both halves of that were bugs. The probe used to reuse the enemy the
      // two shooting loops had just been firing at - which, on a machine slow
      // enough to let every one of those shots land, was a CORPSE by the time
      // the probe ran: the body had been handed to the corpse pool and thrown
      // apart, so the plate mesh was four metres away in the wrong direction
      // and the arc read backwards. And the bearing was hardcoded as "the
      // player is at +z from it", which was true when the block started and
      // false after a brute had been walking through two loops.
      const probe = put('aegis', 0, -6);
      probe.speed = 0;
      await steps(8);
      probe.pos.set(0, probe.pos.y, -6);
      await steps(2);
      const ax = px - probe.pos.x;
      const az = pz - probe.pos.z;
      const am = Math.hypot(ax, az) || 1;
      probe.plateHp = 8;
      res.aegisProbeAlive = !probe.dead && g.enemies.includes(probe);
      // A round from the player travels the OTHER way down that line.
      res.aegisArcFront = ENEMY_TYPES.aegis.reflect(probe, -ax / am, -az / am, null);
      res.aegisArcBack = ENEMY_TYPES.aegis.reflect(probe, ax / am, az / am, null);
      clean();
    }

    // ---- 4. the lens walks a line, it does not drop one -------------------
    {
      clean();
      const e = put('lens', 16, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let first = null;
      let last = null;
      let glare = 0;
      for (let i = 0; i < 700; i++) {
        await step();
        e.pos.set(16, e.pos.y, 0);
        if (e.lensX !== undefined) {
          if (first === null) first = Math.hypot(e.lensX - px, e.lensZ - pz);
          last = Math.hypot(e.lensX - px, e.lensZ - pz);
        }
        glare = Math.max(glare, g._hazard.filter((h) => h.kind === 'glare').length);
        if (glare > 4 && last !== null && last < 2) break;
      }
      res.lensGlare = glare;
      res.lensClosedIn = first !== null && last !== null && last < first - 4;
      res.lensFirst = first === null ? -1 : +first.toFixed(1);
      res.lensLast = last === null ? -1 : +last.toFixed(1);
      clean();
    }

    // ---- 5. the halo takes the crosshair, and gives it back ---------------
    {
      clean();
      const e = put('halo', 4, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let inside = false;
      for (let i = 0; i < 300; i++) {
        await step();
        e.pos.set(4, e.pos.y, 0);
        if (document.body.classList.contains('hudblind')) { inside = true; break; }
      }
      res.haloBlinds = inside;
      // OUT OF THE FIELD AND IT COMES BACK. Same refresh-and-lapse contract the
      // conduit's buff keeps - there is no state to get stuck on, and this is
      // the assertion that proves it.
      px = 19;
      pz = 0;
      let back = false;
      for (let i = 0; i < 200; i++) {
        await step();
        e.pos.set(4, e.pos.y, 0);
        if (!document.body.classList.contains('hudblind')) { back = true; break; }
      }
      res.haloReleases = back;
      // ...and killing it releases it too, which is the same lapse from the
      // other end.
      px = 4.5;
      pz = 0;
      for (let i = 0; i < 200; i++) {
        await step();
        e.pos.set(4, e.pos.y, 0);
        if (document.body.classList.contains('hudblind')) break;
      }
      e.dead = true;
      let freed = false;
      for (let i = 0; i < 200; i++) {
        await step();
        if (!document.body.classList.contains('hudblind')) { freed = true; break; }
      }
      res.haloDeathReleases = freed;
      // And it costs no health at all - the whole enemy is the readout.
      const e2 = put('halo', 4, 0);
      e2.speed = 0;
      px = 0;
      pz = 0;
      res.haloCost = await measure(60, () => { e2.pos.set(4, e2.pos.y, 0); });
      clean();
    }

    // ---- 6. HERALD: the sun, rehearsed -------------------------------------
    // The boss keeps the theme's promise at boss scale: every ceremony is
    // ANNOUNCED (a lane, a filling circle, a rolling ring), every one is
    // dodgeable by the answer it names, and the fight never stands still.
    // Each block below pins one ceremony by dealing bs.next - nothing in the
    // game writes that field - and the assertions are all PAIRED: the hit is
    // measured against the dodge, never against nothing happening.
    {
      const { segBlocked } = await import('./js/enemies/shared.js');
      // A freshly spawned boss, with bs initialised and its first stalk beat
      // still unspent, so the pinned ceremony is the FIRST thing it does.
      const spawnBoss = async (x, z) => {
        const e = put('herald', x, z);
        await simSteps(0.3);
        return e;
      };
      const waitState = async (e, want, capSecs = 8) => {
        const until = g.time + capSecs;
        while (g.time < until) {
          await step();
          if (e.bs && e.bs.state === want) return true;
        }
        return false;
      };
      // A bearing from the boss that has clear line of sight at radius r -
      // the lance and the flare both ask LIGHT to reach the player, and a
      // pillar in the way is a legitimate answer in the game, so a test that
      // wants the hit has to pick a lane the sun can actually travel down.
      const clearBearing = (bx, bz, r) => {
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2;
          const tx = bx + Math.cos(ang) * r;
          const tz = bz + Math.sin(ang) * r;
          if (Math.abs(tx) > 20 || Math.abs(tz) > 20) continue;
          if (!segBlocked(bx, 3.4, bz, tx, 0.9, tz, g.arena.obstacles)) return ang;
        }
        return null;
      };

      // -- cadence, variety, travel -----------------------------------------
      {
        clean();
        const b = await spawnBoss(0, -12);
        px = 0; pz = 0;
        const seen = new Set();
        let last = '';
        let attacks = 0;
        let travelled = 0;
        let lx = b.pos.x;
        let lz = b.pos.z;
        const t0 = g.time;
        // Well over one full pass through the routine, so every ceremony has
        // been armed at least once, and the walk between them is measured too.
        while (g.time - t0 < 28 && !b.dead) {
          if (b.bs.state !== last) {
            if (last === 'windup') { attacks++; seen.add(b.bs.attack); }
            last = b.bs.state;
          }
          travelled += Math.hypot(b.pos.x - lx, b.pos.z - lz);
          lx = b.pos.x; lz = b.pos.z;
          await step();
        }
        res.heraldAttacks = attacks;
        res.heraldKindCount = seen.size;
        res.heraldKinds = [...seen].sort().join(',');
        res.heraldTravelled = +travelled.toFixed(1);
        clean();
      }

      // -- touching the sun burns, whatever it is doing ----------------------
      // Fear holds the boss in its stagger, so the ONLY way it can hurt a
      // player pinned against it in this window is the contact rule itself.
      {
        clean();
        const b = await spawnBoss(0, 0);
        b.status.fear = 5;
        // Ordinary-wave terrain can push a boss away from its spawn point.
        // Keep the contact probe beside its actual body, on the same surface.
        px = b.pos.x + 1.6; pz = b.pos.z; py = b.pos.y;
        // Sixty frames, not a hundred and thirty: a frame is worth up to 0.05s
        // of game on a slow host, and thirty more frames here is the
        // difference between "burned twice" and "dead mid-measure".
        res.heraldTouch = await measure(60, () => {
          b.status.fear = 5;
          px = b.pos.x + 1.6; pz = b.pos.z; py = b.pos.y;
        });
        clean(); px = 0; pz = 0;
      }

      // -- the spears are nine rounds, thrown without stopping ---------------
      {
        clean();
        const b = await spawnBoss(0, -12);
        px = 0; pz = 0;
        b.bs.next = 'spears';
        const seenP = new Set();
        let fired = 0;
        const until = g.time + 6;
        while (g.time < until && fired < 9) {
          await step();
          for (const pr of g.projectiles) {
            if (pr.type === 'herald' && !seenP.has(pr)) { seenP.add(pr); fired++; }
          }
        }
        res.heraldSpears = fired;
        clean();
      }

      // -- the corona: grounded is caught, airborne is not -------------------
      {
        clean();
        const b = await spawnBoss(0, -12);
        px = 0; pz = 0;
        b.bs.next = 'corona';
        await waitState(b, 'windup');
        // A ring-riding window, in the suite's own measure() pattern: the loss
        // is read BEFORE god mode goes back on, or the hit is restored away
        // before it is ever counted.
        const runRings = async (boss, airborne) => {
          god = false; p.invulnEnd = -1; p.health = p.maxHealth;
          const h0 = p.health;
          const until = g.time + 1.8;
          while (g.time < until) {
            if (boss.bs.rings.length) { px = boss.bs.rings[0].x + 7; pz = boss.bs.rings[0].z; }
            py = airborne ? 0.8 : 0;
            await step();
          }
          py = 0;
          const lost = +(h0 - p.health).toFixed(2);
          god = true; p.health = p.maxHealth;
          return lost;
        };
        px = b.pos.x + 7; pz = b.pos.z;
        res.heraldRingGround = await runRings(b, false);
        clean();
        const b2 = await spawnBoss(0, -12);
        px = b2.pos.x + 7; pz = b2.pos.z;
        b2.bs.next = 'corona';
        await waitState(b2, 'windup');
        res.heraldRingAir = await runRings(b2, true);
        clean();
      }

      // -- the lance: in the beam burns, off the corridor does not ------------
      {
        clean();
        const b = await spawnBoss(0, -12);
        px = 0; pz = 0;
        b.bs.next = 'lance';
        await waitState(b, 'windup');
        const ang = clearBearing(b.pos.x, b.pos.z, 8);
        res.heraldLanceLane = ang !== null;
        if (ang !== null) {
          // Aim the sweep through the clear lane: with dir held at +1 the beam
          // starts at `from` and crosses `ang` about half a second in.
          b.bs.dir = 1;
          b.bs.from = ang - 0.3;
          b.bs.bearing = b.bs.from;
          px = b.pos.x + Math.cos(ang) * 8;
          pz = b.pos.z + Math.sin(ang) * 8;
          god = false; p.invulnEnd = -1; p.health = p.maxHealth;
          const h0 = p.health;
          await waitState(b, 'lance');
          await simSteps(2.0);
          res.heraldLanceHit = +(h0 - p.health).toFixed(2);
          god = true; p.health = p.maxHealth;
        }
        clean();
        const b2 = await spawnBoss(0, -12);
        px = 0; pz = 0;
        b2.bs.next = 'lance';
        await waitState(b2, 'windup');
        const ang2 = clearBearing(b2.pos.x, b2.pos.z, 8);
        if (ang2 !== null) {
          b2.bs.dir = 1;
          b2.bs.from = ang2 - 0.3;
          b2.bs.bearing = b2.bs.from;
          // BEHIND the beam's start edge: the sweep never visits this bearing.
          px = b2.pos.x + Math.cos(ang2 - 1.2) * 8;
          pz = b2.pos.z + Math.sin(ang2 - 1.2) * 8;
          god = false; p.invulnEnd = -1; p.health = p.maxHealth;
          const h0 = p.health;
          await waitState(b2, 'lance');
          await simSteps(2.9);
          res.heraldLanceMiss = +(h0 - p.health).toFixed(2);
          god = true; p.health = p.maxHealth;
        } else {
          res.heraldLanceMiss = 0;
        }
        clean();
      }

      // -- the leap: it comes down where you stood, and leaving is the dodge --
      {
        // Nothing within r metres of (x,z) that a body could trip over. The
        // pin must sit on floor the boss can actually land on - a crate's
        // corner is a legitimate no-landing zone in the game, so the same
        // rule applies to the test.
        const clearDisc = (x, z, r) => {
          for (const box of g.arena.obstacles) {
            if (box.min.y > 0.9) continue;
            const nx = Math.max(box.min.x, Math.min(x, box.max.x));
            const nz = Math.max(box.min.z, Math.min(z, box.max.z));
            if (Math.hypot(x - nx, z - nz) < r) return false;
          }
          return true;
        };
        const openSpot = (cx, cz, awayFrom) => {
          for (const r of [0, 3, 6, 9, 12, 15, 18]) {
            for (let i = 0; i < 12; i++) {
              const sx = cx + Math.cos((i / 12) * Math.PI * 2) * r;
              const sz = cz + Math.sin((i / 12) * Math.PI * 2) * r;
              if (Math.abs(sx) > 17 || Math.abs(sz) > 17) continue;
              if (awayFrom && Math.hypot(sx - awayFrom[0], sz - awayFrom[1]) < 9) continue;
              if (clearDisc(sx, sz, 4)) return [sx, sz];
            }
          }
          return null;
        };
        clean();
        const spot = openSpot(0, 0, null);
        res.heraldLeapSpot = !!spot;
        if (spot) {
          // Settle BEFORE the sun rises: the leap leads the player's velocity,
          // and a freshly-teleported pin carries a phantom stride. With no
          // boss in the room there is nothing to wait out but that.
          px = spot[0]; pz = spot[1];
          await simSteps(1.2);
          const b = await spawnBoss(0, -12);
          // Arm the ceremony NOW, not when the stalk timer happens to empty -
          // the arming is the moment the target is snapped, and waiting on a
          // load-dependent timer was measuring the pin's velocity, not the leap.
          b.bs.next = 'leap';
          if (b.bs.state === 'stalk') b.bs.t = 0;
          god = false; p.invulnEnd = -1; p.health = p.maxHealth;
          const h0 = p.health;
          await waitState(b, 'leapAir', 10);
          await waitState(b, 'recover', 10);
          res.heraldLeapHit = +(h0 - p.health).toFixed(2);
          res.heraldLeapDist = +Math.hypot(b.pos.x - spot[0], b.pos.z - spot[1]).toFixed(2);
          god = true; p.health = p.maxHealth;
          // Re-stage, and properly: after the first descent the boss is
          // standing ON the mark it just made, and the leap rightly refuses
          // to arm at arm's length. Put it back across the room the way a
          // spawned one arrives, then deal it the same ceremony.
          const off = openSpot(spot[0] > 0 ? -8 : 8, spot[1], spot);
          const far = openSpot(-spot[0] || 8, -spot[1] || -8, spot);
          if (far) {
            b.pos.set(far[0], 0, far[1]);
            b.jumpTime = 0;
            b.bs.state = 'stalk';
            b.bs.t = 0.3;
          }
          b.bs.next = 'leap';
          await waitState(b, 'windup', 10);
          if (off) { px = off[0]; pz = off[1]; }
          // The first landing leaves fire and a burn on the player. This
          // comparison measures the second slam, not that earlier damage.
          g._clearHazards();
          p.clearStatuses();
          god = false; p.invulnEnd = -1; p.health = p.maxHealth;
          const h1 = p.health;
          await waitState(b, 'recover', 10);
          res.heraldLeapDodged = +(h1 - p.health).toFixed(2);
          god = true; p.health = p.maxHealth;
        }
        clean(); px = 0; pz = 0;
      }

      // -- the flare: sight, priced by proximity ------------------------------
      {
        clean();
        const b = await spawnBoss(0, -12);
        px = 0; pz = 0;
        b.bs.next = 'flare';
        await waitState(b, 'windup');
        const ang = clearBearing(b.pos.x, b.pos.z, 5);
        res.heraldFlareLane = ang !== null;
        if (ang !== null) {
          px = b.pos.x + Math.cos(ang) * 5;
          pz = b.pos.z + Math.sin(ang) * 5;
        }
        await waitState(b, 'recover', 4);
        let peak = 0;
        for (let i = 0; i < 12; i++) { await step(); peak = Math.max(peak, g.rig._blindT); }
        res.heraldFlareClose = +peak.toFixed(2);
        clean();
        const b2 = await spawnBoss(0, -12);
        px = 0; pz = 12;   // twenty-four metres - well past the sun's reach
        b2.bs.next = 'flare';
        await waitState(b2, 'recover', 4);
        let peak2 = 0;
        for (let i = 0; i < 12; i++) { await step(); peak2 = Math.max(peak2, g.rig._blindT); }
        res.heraldFlareFar = +peak2.toFixed(2);
        clean(); px = 0; pz = 0;
      }

      // -- the brands draw a ring and leave it burning ------------------------
      {
        clean();
        const b = await spawnBoss(0, -12);
        px = 0; pz = 0;
        b.bs.next = 'brands';
        let marks = 0;
        const until = g.time + 4;
        while (g.time < until) {
          await step();
          marks = Math.max(marks, g._mortars.length);
        }
        res.heraldBrands = marks;
        // ...and what they leave is the lens's own glare.
        let glare = 0;
        const until2 = g.time + 1.5;
        while (g.time < until2) {
          await step();
          glare = Math.max(glare, g._hazard.filter((h) => h.kind === 'glare').length);
        }
        res.heraldBrandGlare = glare;
        clean();
      }

      // -- and every telegraph handle comes back ------------------------------
      {
        clean();
        const b = await spawnBoss(0, -12);
        px = 0; pz = 0;
        b.bs.next = 'lance';
        await waitState(b, 'lance');
        // Killed mid-beam, with a corona also in the air: the ring marks and
        // the state mark all have to come home.
        b.bs.next = 'corona';
        b.takeDamage(1e6);
        await simSteps(1.2);
        clean();
        await simSteps(2.5);
        res.heraldMarks = g.effects.marks.filter((m) => m.used).length;
        clean();
      }
    }

    document.body.classList.remove('hudblind');
    await steps(30);
    return res;
  }, SOLAR_TYPES);

  ok('an empty arena costs nothing', out.emptyCost === 0, `lost=${out.emptyCost}`);
  ok('every SOLAR type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('a zealot killed close blinds the player', out.blindClose > 0.3, `t=${out.blindClose}s`);
  ok('and one killed across the room does not', out.blindFar === 0, `t=${out.blindFar}s`);
  ok('and the blind is a real white-out', out.blindPeak > 0.85, `flash=${out.blindPeak}`);
  ok('and it runs out on its own', out.blindCleared);

  ok('an aegis turns the shots fired into its plate',
    out.aegisReflected > 0,
    `${out.aegisReflected} of ${out.aegisShots} shots came back; plate ${out.aegisPlate0}->${out.aegisPlateNow} hp ${out.aegisHp0}->${out.aegisHp} dead=${out.aegisDead} air=[${out.aegisProj}]`);
  ok('and the plate is worth most of what is fired at it',
    out.aegisBareLoss > out.aegisPlatedLoss * 2,
    `plated lost ${out.aegisPlatedLoss}hp, bare lost ${out.aegisBareLoss}hp over the same shots`);
  ok('the plate is spent by the rounds that land on it',
    out.aegisPlateSpent, `started at ${out.aegisPlate0}`);
  ok('and then the same shot lands', out.aegisThroughAfter);
  ok('the mirror is a FACING: front reflects, back does not',
    out.aegisArcFront === true && out.aegisArcBack === false,
    `front=${out.aegisArcFront} back=${out.aegisArcBack} alive=${out.aegisProbeAlive}`);

  ok('a lens burns a line across the floor', out.lensGlare > 4, `patches=${out.lensGlare}`);
  ok('and the line WALKS toward the player rather than landing on them',
    out.lensClosedIn, `${out.lensFirst}m -> ${out.lensLast}m`);

  ok('a halo takes the crosshair inside its field', out.haloBlinds);
  ok('and walking out of the field gives it back', out.haloReleases);
  ok('and so does killing it', out.haloDeathReleases);
  ok('and it costs no health at all', out.haloCost === 0, `lost=${out.haloCost}`);

  ok('the herald attacks without pausing', out.heraldAttacks >= 9,
    `${out.heraldAttacks} ceremonies in 28s`);
  ok('...and varies them, five of six distinct kinds in one pass',
    out.heraldKindCount >= 5, `[${out.heraldKinds}]`);
  ok('the herald keeps moving between and during ceremonies',
    out.heraldTravelled > 40, `${out.heraldTravelled}m travelled`);
  ok('touching the herald burns, no attack needed', out.heraldTouch > 0,
    `lost=${out.heraldTouch}`);
  ok('the spears are nine fanned rounds', out.heraldSpears === 9,
    `got=${out.heraldSpears}`);
  ok('a corona ring catches a grounded player', out.heraldRingGround > 0,
    `lost=${out.heraldRingGround}`);
  ok('...and jumping it is the whole answer', out.heraldRingAir === 0,
    `lost=${out.heraldRingAir}`);
  ok('the lance burns whoever stands in the beam', out.heraldLanceHit > 0,
    `lost=${out.heraldLanceHit} lane=${out.heraldLanceLane}`);
  ok('...and not whoever stands off the corridor', out.heraldLanceMiss === 0,
    `lost=${out.heraldLanceMiss}`);
  ok('the leap lands where the player stood, and on them',
    out.heraldLeapDist < 6 && out.heraldLeapHit > 0,
    `dist=${out.heraldLeapDist} lost=${out.heraldLeapHit}`);
  ok('...and stepping off the mark dodges it whole', out.heraldLeapDodged === 0,
    `lost=${out.heraldLeapDodged}`);
  ok('the flare takes sight up close', out.heraldFlareClose > 0.2,
    `t=${out.heraldFlareClose} lane=${out.heraldFlareLane}`);
  ok('...and does not reach across the room', out.heraldFlareFar === 0,
    `t=${out.heraldFlareFar}`);
  ok('the brands arrive as a marked ring', out.heraldBrands >= 4,
    `${out.heraldBrands} mortars`);
  ok('...and leave burning ground behind them', out.heraldBrandGlare >= 4,
    `${out.heraldBrandGlare} glare patches`);
  ok('every telegraph handle comes home', out.heraldMarks === 0,
    `held=${out.heraldMarks}`);

  const collision = await page.evaluate(async () => {
    const g = window.__game;
    const { Projectile } = await import('./js/enemy.js');
    const THREE = await import('three');
    const target = new THREE.Vector3(0, 1.7, 0);
    let hits = 0;
    const ctx = { player: { eyeInto: (v) => v.copy(target) }, obstacles: [], onHitPlayer: () => { hits++; } };
    const results = [];
    for (const dt of [0.016, 0.033, 0.05]) {
      const shot = new Projectile(g.scene, g.effects.glowTex, -0.8, 1.7, 0, target, 32, 5, 'herald');
      let result;
      for (let i = 0; i < 4; i++) { result = shot.update(dt, ctx); if (result !== 'alive') break; }
      results.push(result === 'hit');
      g.scene.remove(shot.mesh);
      const before = hits;
      const wall = { min: { x: -0.2, y: 0, z: -2 }, max: { x: -0.1, y: 3, z: 2 } };
      target.x = 0.7;
      ctx.obstacles = [wall];
      const covered = new Projectile(g.scene, g.effects.glowTex, -0.8, 1.7, 0, target, 32, 5, 'herald');
      for (let i = 0; i < 4; i++) { result = covered.update(dt, ctx); if (result !== 'alive') break; }
      results.push(result === 'wall' && hits === before);
      g.scene.remove(covered.mesh);
      const ghost = new Projectile(g.scene, g.effects.glowTex, -0.8, 1.7, 0, target, 32, 5, 'curate');
      for (let i = 0; i < 4; i++) { result = ghost.update(dt, ctx); if (result !== 'alive') break; }
      results.push(result === 'hit');
      g.scene.remove(ghost.mesh);
      ctx.obstacles = [];
      target.x = 0;
      const bounce = new Projectile(g.scene, g.effects.glowTex, 21.3, 1.7, 0,
        new THREE.Vector3(30, 1.7, 0), 32, 5, 'slinger');
      bounce.update(dt, ctx);
      results.push(bounce.vel.x < 0 && bounce.bounces === 0 && bounce.pos.x <= 21.6);
      g.scene.remove(bounce.mesh);
    }
    return results;
  });
  ok('swept rounds hit players, respect nearer cover, preserve ghosts and bounce remainders at 16/33/50ms', collision.every(Boolean), JSON.stringify(collision));

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `SOLAR TEST FAIL (${fails})` : 'SOLAR TEST PASS');
process.exitCode = fails ? 1 : 0;
