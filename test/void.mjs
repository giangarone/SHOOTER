// VOID, end to end - the fifth theme built out.
//
// WHY THIS EXISTS
//   Every other theme is answered by POSITIONING. EMBER is answered by moving
//   off the fire, RIME by leaving the field, STRATA by getting out of the
//   corner, VERDANT by not being where you were two seconds ago. VOID is the
//   theme that takes the position itself: the cover you were behind, the
//   ground you meant to stand on, the distance you were keeping.
//
//   Which makes its three mechanics the most invasive in the game - one of
//   them writes to the player's own movement, one opts out of the collision
//   resolver, and one fires from somewhere its owner is not. All three degrade
//   silently: a warp that fires from itself is a shooter, a monolith that
//   respects cover is a slow tank, and a well that does not pull is a patch of
//   coloured floor.
//
//     warp        fires out of a rift rather than out of itself, so there is
//                 never a line for cover to interrupt
//     monolith    the only type that ignores the obstacle resolver - it walks
//                 THROUGH pillars in a dead straight line
//     singularity a hazard kind that deals no damage and no status at all, and
//                 instead MOVES the player - the only one of its sort
//
// WHAT IS ASSERTED
//   1. All six build and survive their AI.
//   2. A warp opens a rift away from itself, and the round comes out of THERE.
//   3. A monolith walks through a solid obstacle instead of round it.
//   4. ...and nothing else does, which is what makes it the mechanic.
//   5. A well drags the player toward it and costs no health at all.
//   6. The MAW bites the instant the player touches it.
//   7. Its ambient drag still moves a player who is doing nothing.
//   8. Its pressure rings come in PAIRS, and are drawn before they hurt.
//   9. The collapse marks the floor under the player and detonates only
//      after the fill - telegraph first, damage second.
//  10. The rift fan hangs its rifts around the PLAYER and fires only after
//      the hang - cover-ignoring bolts, warned in advance.
//  11. The void step marks the landing ring BEFORE the body leaves, lands
//      where the ring said, and bites whoever stood inside it.
//  12. The tear lays all three lanes at once and hurts only once they have
//      filled - the centre lane is aimed through where the player stands.
//  13. The whole scheduler: majors fire several times inside seven seconds
//      and the boss covers ground doing it - the fight is frequent and it
//      MOVES, which is the whole point of the rework.
import { bootPage, launchBrowser, sleep, startServer } from './harness.mjs';

const PORT = 8225;
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const VOID_TYPES = ['wraith', 'warp', 'monolith', 'singularity', 'hexer', 'shade'];

try {
  browser = await launchBrowser();
  const { page, errors } = await bootPage(browser, PORT);

  const out = await page.evaluate(async (VOID_TYPES) => {
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
      // UNPINNABLE, unlike the other theme suites. VOID's whole point is that
      // it moves the player, so the block that measures the well has to let
      // them actually be moved - pinning would hold them still and the pull
      // would be perfectly invisible.
      if (pinned) p.pos.set(px, 0, pz);
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
      // AND THE BOXES, which every later theme suite clears and this one did
      // not. The monolith block pushes a solid box across the middle of the
      // arena and nothing took it back out, so the well block below was
      // dropping its well INSIDE that box and measuring a player being pulled
      // into a wall and ejected out of it - which came out as +3.6m most runs
      // and as a flight to the far wall on the ones where the resolver threw
      // them the other way. Intermittent, and nothing to do with the well.
      g.arena.obstacles.length = 0;
      g.arena.ground.length = 0;
      p.clearStatuses();
      // AND THE MOVEMENT KEYS. `autoTest = false` stops the bot from WRITING
      // the input every frame, it does not clear what the bot was already
      // holding - so the player kept walking in whatever direction it happened
      // to be going when the suite took over. Harmless in every block that
      // pins the player, and the entire explanation for the well block:
      // measuring a two-and-a-half metres-per-second pull against a walk
      // that never stopped gave +3.6m, +21.6m, -21.6m and 0.06m on four runs
      // of identical code.
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

    // ---- 1. all six survive being alive ---------------------------------
    {
      clean();
      const built = {};
      const subjects = [];
      for (const t of VOID_TYPES) {
        const e = put(t, 10, 10);
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

    // ---- 2. the warp fires out of its rift ------------------------------
    {
      clean();
      const e = put('warp', 14, 0);
      e.speed = 0;
      e.attackCd = 0;
      let riftX = null;
      let riftZ = null;
      for (let i = 0; i < 1200; i++) {
        await step();
        if (e.riftT > 0 && riftX === null) {
          riftX = e.riftX;
          riftZ = e.riftZ;
        }
        if (riftX !== null && g.projectiles.length > 0) break;
      }
      res.warpOpened = riftX !== null;
      if (riftX !== null) {
        // THE RIFT IS NOT ON THE WARP. If it opened at its own feet the whole
        // mechanic collapses into an ordinary shooter.
        res.warpRiftFromSelf = +Math.hypot(riftX - e.pos.x, riftZ - e.pos.z).toFixed(1);
        // ...and it is near the PLAYER, which is what makes cover useless.
        res.warpRiftFromPlayer = +Math.hypot(riftX - px, riftZ - pz).toFixed(1);
      }
      const shot = g.projectiles[0];
      if (shot) {
        // The round starts AT the rift, not at the enemy.
        res.warpShotFromRift = +Math.hypot(shot.pos.x - riftX, shot.pos.z - riftZ).toFixed(1);
        res.warpShotFromSelf = +Math.hypot(shot.pos.x - e.pos.x, shot.pos.z - e.pos.z).toFixed(1);
      }
      clean();
    }

    // ---- 3/4. the monolith walks through cover, and nothing else does ----
    // Driven with a real obstacle put directly between the two of them, so
    // what is measured is the resolver rather than the pathfinder.
    {
      const runThrough = async (type) => {
        clean();
        // One box on the line between them. `ground` is what the collision
        // resolver reads; `obstacles` is what steering reads - a type that
        // ignores one and not the other would slide along it forever, so both
        // are set and both have to be ignored for a crossing to happen.
        const box = new THREE.Box3(
          new THREE.Vector3(4, 0, -3),
          new THREE.Vector3(7, 3, 3)
        );
        g.arena.obstacles.length = 0;
        g.arena.ground.length = 0;
        g.arena.obstacles.push(box);
        g.arena.ground.push(box);
        // AND THE NAV GRID IS REBAKED AGAINST IT. clean() empties the arena
        // lists but nothing re-bakes the grid, so the tank below would be
        // steered by a bake of a layout that is no longer standing - one that
        // sometimes aimed it straight into the box (blocked, test passes) and
        // sometimes routed it around a wall that wasn't there (crossed, test
        // fails), on the roll of the run's seed. The box is the only thing in
        // the room; the tank should be steered by the room that is.
        g.nav.rebake(g.arena.obstacles);
        const e = put(type, 14, 0);
        px = 0;
        pz = 0;
        let crossed = false;
        let minX = 99;
        // WHETHER THE BODY WAS EVER INSIDE THE BOX ITSELF, which is the
        // resolver's actual contract and the only thing that separates the
        // two types. Reaching the far side proves nothing on its own: a tank
        // that steers round the box is the nav grid WORKING, not the wall
        // failing - the old assertion read exactly that detour as a leak, on
        // the runs where the stale bake happened to route one. A body inside
        // the footprint is a body the resolver never pushed back out, and
        // only a type that phases can be there.
        let through = false;
        for (let i = 0; i < 1400; i++) {
          await step();
          minX = Math.min(minX, e.pos.x);
          if (e.pos.x > 4 && e.pos.x < 7 && e.pos.z > -3 && e.pos.z < 3) through = true;
          // Through means out the far side of the box.
          if (e.pos.x < 3.5) { crossed = true; break; }
        }
        return { crossed, minX: +minX.toFixed(1), through };
      };
      const mono = await runThrough('monolith');
      res.monoCrossed = mono.crossed && mono.through;
      res.monoMinX = mono.minX;
      // The control. A tank is the monolith's role-mate and steers by the same
      // grid; if it is ever inside the footprint, the resolver let a body that
      // does not phase stand in solid geometry, and the test above proves
      // nothing at all. Whether it grinds into the near face or walks round
      // the end is the pathfinder's business, not the wall's.
      const tank = await runThrough('tank');
      res.tankBlocked = !tank.through;
      res.tankMinX = tank.minX;
      res.tankThrough = tank.through;
      clean();
    }

    // ---- 5. the well drags, and costs nothing ---------------------------
    {
      clean();
      // INSIDE its radius, which the first version of this was not: the well
      // is seven metres across and it was dropped eight metres away, so the
      // player was standing outside the only thing being measured and it
      // correctly did nothing. Far enough to have somewhere to be dragged,
      // near enough to be in it.
      g._addHazard(5, 0, 7.0, 2.2, 0, 'well');
      res.wellPlaced = g._hazard.length;
      pinned = false;
      god = false;
      p.pos.set(0, 0, 0);
      p.health = p.maxHealth;
      const hp0 = p.health;
      const d0 = Math.hypot(p.pos.x - 5, p.pos.z);
      // MEASURED AS A DIRECTION AND STOPPED THE MOMENT IT IS PROVEN, not as a
      // displacement over a fixed number of frames.
      //
      // The pull is per-frame and the well is seven metres across, so a fixed
      // frame count measures TIME on a machine whose frames are not all the
      // same length: on a loaded one the player crosses the centre inside the
      // window, the pull reverses behind them, and they leave the well
      // entirely - which came out as +3.6m, +21.6m and -21.6m on three runs of
      // the same code. None of that is the well being wrong; all of it is the
      // question being asked over the wrong interval.
      // AND THE WELL IS RE-LAID WHEN IT LAPSES. It lives 2.2 seconds, which is
      // fewer frames than this loop has whenever the machine is loaded - so
      // the other half of the flake was the opposite of the first: a window
      // that ran out before the player had been moved at all, reported as
      // 0.06m. Between the re-lay and the early break the measurement now
      // depends on neither the frame rate nor the clock. The bar is 0.4m and
      // not a metre for the same reason: what is under test is the DIRECTION
      // the well moves somebody, and how far it gets to move them inside one
      // window is a fact about the machine.
      let closest = d0;
      let pulled = false;
      for (let i = 0; i < 400; i++) {
        await step();
        if (!g._hazard.some((h) => h.kind === 'well')) {
          g._addHazard(5, 0, 7.0, 2.2, 0, 'well');
        }
        const d = Math.hypot(p.pos.x - 5, p.pos.z);
        closest = Math.min(closest, d);
        if (d < d0 - 0.4) {
          pulled = true;
          break;
        }
      }
      res.wellMoved = +(d0 - closest).toFixed(2);
      res.wellCost = +(hp0 - p.health).toFixed(2);
      pinned = true;
      god = true;
      // It pulls TOWARD itself, so the player ends up nearer than they began.
      res.wellPulledIn = pulled;
      clean();
    }

    // ---- 6. the maw bites on contact, immediately --------------------------
    // Touch is the one boss requirement with no telegraph to lean on: the
    // frame the player is inside the body's pad, health moves.
    {
      clean();
      const e = put('maw', 1.6, 0);
      god = false;
      p.health = p.maxHealth;
      const hp0 = p.health;
      await simSteps(0.5);
      res.mawTouch = +(hp0 - p.health).toFixed(1);
      god = true;
      clean();
    }

    // ---- 7. the ambient drag still moves a player who does nothing --------
    {
      clean();
      pinned = false;
      god = true;
      p.pos.set(0, 0, 0);
      put('maw', 12, 0);
      await simSteps(1.2);
      res.mawDragged = +p.pos.x.toFixed(2);
      pinned = true;
      clean();
    }

    // ---- 8. the pressure rings come in pairs, and are drawn first ---------
    // Measured as mark-seen to damage-landed, because that interval IS the
    // dodge the rings exist to offer.
    {
      clean();
      const e = put('maw', 9, 0);
      await simSteps(0.3);
      e.bs.ringCd = 0;
      god = false;
      p.health = p.maxHealth;
      const hp0 = p.health;
      let seenRing = -1;
      let hurtAt = -1;
      let maxRings = 0;
      for (let i = 0; i < 400 && hurtAt < 0; i++) {
        await step();
        if (seenRing < 0 && e.bs.rings.length > 0) seenRing = g.time;
        maxRings = Math.max(maxRings, e.bs.rings.length);
        if (hp0 - p.health > 0) hurtAt = g.time;
      }
      res.ringSeen = seenRing >= 0;
      res.ringWarned = hurtAt >= 0 && seenRing >= 0 ? +(hurtAt - seenRing).toFixed(2) : -1;
      res.ringPaired = maxRings >= 2;
      god = true;
      clean();
    }

    // ---- 9. the collapse marks under the player, then detonates ----------
    {
      clean();
      const e = put('maw', 14, 0);
      await simSteps(0.3);
      e.bs.collapseCd = 0;
      god = false;
      p.health = p.maxHealth;
      const hp0 = p.health;
      let markSeen = -1;
      let hurtAt = -1;
      let onPlayer = -1;
      for (let i = 0; i < 500; i++) {
        await step();
        const im = e.bs.implosions[0];
        if (markSeen < 0 && im) {
          markSeen = g.time;
          onPlayer = +Math.hypot(im.x, im.z).toFixed(1);
        }
        if (hurtAt < 0 && hp0 - p.health > 0) hurtAt = g.time;
        if (markSeen >= 0 && hurtAt >= 0) break;
      }
      res.colMark = markSeen >= 0;
      res.colOnPlayer = onPlayer;
      res.colWarned = hurtAt >= 0 && markSeen >= 0 ? +(hurtAt - markSeen).toFixed(2) : -1;
      god = true;
      clean();
    }

    // ---- 10. the rift fan hangs around the player, then fires ------------
    // Counted at SPAWN like boss.mjs counts Schism's volley, and timed from
    // the first frame the fan phase is live - an instant burst would be an
    // undodgeable one, which is the thing the hang exists to prevent.
    {
      clean();
      const e = put('maw', 0, 12);
      await simSteps(0.3);
      const bs = e.bs;
      bs.ringCd = 99; bs.collapseCd = 99; bs.stepCd = 99; bs.fissureCd = 99; bs.novaCd = 99;
      bs.fanCd = 0;
      const orig = g._spawnProjectile.bind(g);
      const bolts = [];
      let fanSeen = -1;
      g._spawnProjectile = (x, y, z, t, ss, sr) => {
        if (t === 'maw') bolts.push({ x, z, at: g.time });
        return orig(x, y, z, t, ss, sr);
      };
      for (let i = 0; i < 400; i++) {
        await step();
        if (fanSeen < 0 && bs.phase === 'fan') fanSeen = g.time;
        if (bolts.length >= 4 && bs.phase !== 'fan') break;
      }
      g._spawnProjectile = orig;
      res.fanCast = fanSeen >= 0;
      res.fanBolts = bolts.length;
      res.fanTele = bolts.length && fanSeen >= 0 ? +(bolts[0].at - fanSeen).toFixed(2) : -1;
      // Every bolt leaves from ~6.5m off the PLAYER, not off the boss - that
      // gap is the whole cover-ignoring point of the attack.
      res.fanFromRift = bolts.length
        ? +Math.max(...bolts.map((b) => Math.abs(Math.hypot(b.x, b.z) - 6.5))).toFixed(1)
        : -1;
      clean();
    }

    // ---- 11. the void step marks the landing before it leaves ------------
    // The player is then stood inside the marked ring on purpose: what is
    // being measured is that the landing bite is the ring's promise kept.
    // Spawned at 18 rather than 14 - the maw closes ~1m during the init walk
    // and the step gate is 13m, so a 14m spawn is one wave's speed scaling
    // away from never casting.
    {
      clean();
      const e = put('maw', 18, 0);
      await simSteps(0.3);
      const bs = e.bs;
      bs.ringCd = 99; bs.collapseCd = 99; bs.fanCd = 99; bs.fissureCd = 99; bs.novaCd = 99;
      bs.stepCd = 0;
      god = false;
      p.health = p.maxHealth;
      const hp0 = p.health;
      let markSeen = -1;
      let bossAtMark = 0;
      let landX = 0;
      let landZ = 0;
      let stepBit = false;
      for (let i = 0; i < 200; i++) {
        await step();
        if (markSeen < 0 && bs.phase === 'fold') {
          markSeen = g.time;
          // How far the boss was from the player when the ring appeared: it
          // has to still be across the room, or the mark came after the move.
          bossAtMark = Math.hypot(e.pos.x - px, e.pos.z - pz);
          landX = bs.landX;
          landZ = bs.landZ;
          // Inside the landing ring (3.6m) but outside the body's own touch
          // pad (2.7m), so the bite measured is the LANDING's, not contact's.
          px = landX + 3.0;
          pz = landZ;
        }
        if (markSeen >= 0 && bs.phase === 'form') {
          stepBit = hp0 - p.health > 0;
          break;
        }
      }
      res.stepMarked = markSeen >= 0 && bossAtMark > 8;
      res.stepLanded = markSeen >= 0
        ? +Math.hypot(e.pos.x - landX, e.pos.z - landZ).toFixed(1) : -1;
      res.stepLandNear = markSeen >= 0 ? +Math.hypot(landX, landZ).toFixed(1) : -1;
      res.stepBites = stepBit;
      res.stepDbg = {
        phase: bs.phase,
        stepCd: +bs.stepCd.toFixed(2),
        dist: +Math.hypot(e.pos.x - px, e.pos.z - pz).toFixed(1),
        marksUsed: g.effects.marks.filter((m) => m.used).length,
      };
      god = true;
      clean();
    }

    // ---- 12. the tear lays all three lanes, then runs them ---------------
    // The player is parked dead ahead of the maw, on the centre lane's
    // bearing at cast: the assertion is that the lane is AIMED THROUGH them
    // and that the hurt waits out the fill.
    {
      clean();
      px = 7.5; pz = 0;
      const e = put('maw', -8, 0);
      await simSteps(0.3);
      const bs = e.bs;
      bs.ringCd = 99; bs.collapseCd = 99; bs.fanCd = 99; bs.stepCd = 99; bs.novaCd = 99;
      bs.fissureCd = 0;
      god = false;
      p.health = p.maxHealth;
      const hp0 = p.health;
      let lanesSeen = -1;
      let nLanes = 0;
      let hurtAt = -1;
      for (let i = 0; i < 300; i++) {
        await step();
        if (lanesSeen < 0 && bs.lanes.length) {
          lanesSeen = g.time;
          nLanes = bs.lanes.length;
        }
        if (hurtAt < 0 && hp0 - p.health > 0) hurtAt = g.time;
        if (lanesSeen >= 0 && hurtAt >= 0) break;
      }
      res.tearLanes = lanesSeen >= 0 && nLanes === 3;
      res.tearWarned = hurtAt >= 0 && lanesSeen >= 0 ? +(hurtAt - lanesSeen).toFixed(2) : -1;
      god = true;
      clean();
    }

    // ---- 13. the scheduler: frequent majors, and a boss that MOVES -------
    // MAJORS ONLY are counted (a phase entered from free, or a collapse
    // thrown) because rings were the old fight's entire repertoire - three
    // majors inside eight seconds is the rework's cadence claim, and the path
    // length is its movement claim.
    //
    // THE PINNED PLAYER IS WALKED BACKWARDS, because the maw is a stalker: it
    // closes to its seven-and-a-half metre orbit and stays there, and the
    // step and the collapse only exist past their range gates. Holding ~14m
    // is the fight as a runner meets it - the boss following, and attacking
    // the following - and without it two of the four majors can never fire.
    {
      clean();
      px = 0; pz = 10;
      const e = put('maw', -10, 0);
      await simSteps(0.3);
      let majors = 0;
      let path = 0;
      let lx = e.pos.x;
      let lz = e.pos.z;
      let prevPhase = e.bs.phase;
      let prevImp = 0;
      const t0 = g.time;
      while (g.time < t0 + 8) {
        await step();
        const mdx = e.pos.x - px;
        const mdz = e.pos.z - pz;
        const md = Math.hypot(mdx, mdz);
        if (md < 14) {
          let nx = px - (mdx / md) * (14 - md);
          let nz = pz - (mdz / md) * (14 - md);
          // Slide along the wall rather than through it, so the runner never
          // runs out of arena and hands the distance back.
          const rr = Math.hypot(nx, nz);
          if (rr > 18) { nx *= 18 / rr; nz *= 18 / rr; }
          px = nx;
          pz = nz;
        }
        path += Math.hypot(e.pos.x - lx, e.pos.z - lz);
        lx = e.pos.x;
        lz = e.pos.z;
        if (e.bs.phase !== prevPhase) {
          if (prevPhase === '') majors++;
          prevPhase = e.bs.phase;
        }
        if (e.bs.implosions.length > prevImp) majors++;
        prevImp = e.bs.implosions.length;
      }
      res.majors = majors;
      res.bossPath = +path.toFixed(1);
      clean();
    }

    await steps(30);
    return res;
  }, VOID_TYPES);

  ok('every VOID type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('a warp opens a rift', out.warpOpened);
  ok('and it opens away from the warp itself',
    out.warpRiftFromSelf > 4, `${out.warpRiftFromSelf}m from itself`);
  ok('and beside the player, where cover cannot help',
    out.warpRiftFromPlayer > 1 && out.warpRiftFromPlayer < 9,
    `${out.warpRiftFromPlayer}m from the player`);
  ok('the round comes out of the rift, not out of the warp',
    out.warpShotFromRift < 1.5 && out.warpShotFromSelf > 4,
    `rift+${out.warpShotFromRift}m self+${out.warpShotFromSelf}m`);

  ok('a monolith walks through solid cover', out.monoCrossed,
    `reached x=${out.monoMinX}`);
  ok('and its role-mate is stopped by the same box',
    out.tankBlocked, `tank reached x=${out.tankMinX}, inside=${out.tankThrough}`);

  ok('a well is laid on the floor', out.wellPlaced > 0);
  ok('it drags the player toward it', out.wellPulledIn, `closed ${out.wellMoved}m`);
  ok('and costs no health at all', out.wellCost === 0, `lost=${out.wellCost}`);

  ok('the maw bites the instant the player touches it',
    out.mawTouch > 0, `lost=${out.mawTouch}`);
  ok('its ambient drag moves a player who is doing nothing',
    out.mawDragged > 0.5, `drifted ${out.mawDragged}m`);
  ok('its pressure rings are drawn before they can hurt',
    out.ringSeen && out.ringWarned >= 0.4, `warned ${out.ringWarned}s`);
  ok('and they come in pairs', out.ringPaired);
  ok('the collapse marks the floor under the player',
    out.colMark && out.colOnPlayer < 1.5, `mark ${out.colOnPlayer}m off the player`);
  ok('and detonates only after the fill',
    out.colWarned >= 0.9, `waited ${out.colWarned}s`);
  ok('the rift fan casts around the player, not around the boss',
    out.fanCast && out.fanBolts === 4 && out.fanFromRift <= 1.5,
    `${out.fanBolts} bolts, worst rift offset ${out.fanFromRift}m`);
  ok('and nothing leaves during the hang',
    out.fanTele >= 0.7, `first bolt ${out.fanTele}s after the cast`);
  ok('the void step marks its landing while the boss is still far away',
    out.stepMarked, JSON.stringify(out.stepDbg));
  ok('lands where the ring said it would',
    out.stepLanded >= 0 && out.stepLanded <= 0.6,
    `off by ${out.stepLanded}m, ring ${out.stepLandNear}m from the player`);
  ok('and bites whoever stood inside the ring', out.stepBites);
  ok('the tear lays three lanes at once', out.tearLanes);
  ok('and hurts only once they have filled',
    out.tearWarned >= 1.2, `waited ${out.tearWarned}s`);

  ok('the reworked scheduler keeps throwing majors',
    out.majors >= 3, `${out.majors} majors in 8s`);
  ok('and the boss covers ground doing it',
    out.bossPath >= 8, `${out.bossPath}m walked`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `VOID TEST FAIL (${fails})` : 'VOID TEST PASS');
process.exitCode = fails ? 1 : 0;
