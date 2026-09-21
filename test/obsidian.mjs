// OBSIDIAN, end to end - the twelfth theme built out.
//
// WHY THIS EXISTS
//   OBSIDIAN spends GEOMETRY where every other theme spends ground, health,
//   information or bodies. Every mechanic in the theme is a LINE the player
//   is shown before it exists, and the suite asserts each one as that line:
//
//     clast     commits to a lunge it cannot steer. The assertion is the
//               both-ways shape: pinned in the lane costs, pinned off it
//               does not
//     lancet    fires a WALL of three, and the wall follows you. The
//               needles are counted as they leave, and their homing is
//               measured as a TURN - a round that never steers would pass
//               this, so it is the one thing this enemy has
//     maser     a shell in front and a heart behind it. The same blow from
//               the front and from the back, and the difference is the
//               enemy
//     knapper   the only artillery whose landing is a WALL - real solid
//               geometry, in the obstacle list, gone again three seconds
//               later
//     mirror    opens a growing rift beside the player that cuts after a
//               full second. Standing where it opens costs; standing
//               outside the radius it ends at does not
//     glasswing sweeps a slow crimson arc, then drops along it. On the arc
//               costs, off it costs nothing - the weeper's test with an
//               edge's promise
//
//   And the boss: a lane that telegraphs before the sweep commits to it,
//   three circles that fill before they land, two solid walls either side
//   of the lane the player was using, and a face that splits under a third
//   of the bar - full damage from there, where the shut face ate a third.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8252;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const OBSIDIAN_TYPES = ['clast', 'lancet', 'maser', 'knapper', 'mirror', 'glasswing'];

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const out = await page.evaluate(async (OBSIDIAN_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
    // SECONDS OF GAME, not a count of frames. The loop clamps dt at 0.05, so
    // a frame is worth 1/60s of game on an idle machine and up to 0.05s on
    // a loaded one - the same steps(n) simulates THREE TIMES more game on a
    // slow host. Anything whose meaning is a duration has to be waited for
    // in this unit or it silently changes what it is testing.
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
    // GOD, NOT A BIG NUMBER. `p.health = 1e6` is overheal and bleeds off, and
    // `p.maxHealth = 1e6` is undone by rebuildMods() - so a harness that used
    // either lost about ten health a second in a completely empty arena.
    let god = true;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => {
      origUpdate(...args);
      if (pinned) p.pos.set(px, 0, pz);
      if (god) p.health = p.maxHealth;
    };

    const clean = () => {
      // PARKED, NOT IDLE. `waveState = 'idle'` stops the current wave and
      // then the machinery starts the NEXT one, spawning six fresh specialists
      // into the middle of a measurement.
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
      px = 0;
      pz = 0;
    };
    const put = (type, x, z) => {
      g.spawnEnemy(type);
      const e = g.enemies[g.enemies.length - 1];
      e.pos.set(x, e.pos.y, z);
      return e;
    };
    // A CLEAR FIRING LINE, read off the live arena. The layout is generated
    // per session, so a test that pins an enemy at (12,0) and a player at
    // the origin is drawing its line across whatever cover that session
    // happened to put in the middle - the lunge slammed into a crate, the
    // shard popped on a pillar, and the suite reported the LAYOUT as a
    // failure of the enemy. This walks angles at the wanted radius and
    // returns the first spot whose whole line to the pin is free of
    // obstacle boxes between the floor and the flight the test needs.
    const clearSpot = (radius, yLo = 0, yHi = 3.8) => {
      for (let t = 0; t < Math.PI * 2; t += Math.PI / 24) {
        const x = Math.cos(t) * radius;
        const z = Math.sin(t) * radius;
        let ok = true;
        for (const b of g.arena.obstacles) {
          if (b.max.y < yLo || b.min.y > yHi) continue;
          for (let k = 0; k <= 24; k++) {
            const u = k / 24;
            const sx = x * u;
            const sz = z * u;
            if (sx > b.min.x - 0.4 && sx < b.max.x + 0.4
              && sz > b.min.z - 0.4 && sz < b.max.z + 0.4) {
              ok = false;
              break;
            }
          }
          if (!ok) break;
        }
        if (ok) return { x, z };
      }
      // Nothing clear at that radius this session: fall back to the first
      // angle and let the assertion fail honestly rather than silently.
      return { x: radius, z: 0 };
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
      for (const t of OBSIDIAN_TYPES) {
        const e = put(t, 14, 14);
        subjects.push(e);
        built[t] = !!(e.group && e.group.children.length > 2);
      }
      // Two seconds of GAME - the rusher covers 6m in that time at walk, and
      // 14m out leaves 8m of margin before anything reaches the player.
      await simSteps(2);
      res.allBuilt = Object.values(built).every(Boolean);
      res.builtDetail = built;
      res.subjectsAlive = subjects.filter((e) => !e.dead).length;
      res.subjectsMade = subjects.length;
      clean();
    }

    // ---- 2. the clast's lunge is a LINE ----------------------------------
    // THE BOTH-WAYS TEST. The heading is locked at the moment the tell ends
    // (see aiClast - the same contract the thornling's charge keeps), so the
    // dodge has to happen AFTER the commit to be a dodge at all. The player
    // stands still through the tell, then either stays on the locked lane or
    // steps one metre off it perpendicular; a lunge that tracked the player
    // rather than its committed heading would pass the first and fail the
    // second.
    //
    // THE CLAST IS PINNED ONLY WHILE IT WALKS. Pinning it through the lunge
    // erased the lunge's own motion - the suite was measuring a statue that
    // never crossed the room - so the pin holds while `state !== 'lunge'`
    // and lets go the frame the commit happens. The player is pinned
    // throughout, which is the half that matters.
    {
      const runClast = async (offLane) => {
        clean();
        const spot = clearSpot(10);
        const e = put('clast', spot.x, spot.z);
        e.attackCd = 1e6;
        e.cl = { state: 'tell', t: 0.05, hx: 0, hz: 1, hit: false };
        px = 0;
        pz = 0;
        let lane = null;
        let done = false;
        const lost = await measure(240, () => {
          if (e.cl.state !== 'lunge') e.pos.set(spot.x, e.pos.y, spot.z);
          if (e.cl.state === 'lunge' && !lane) {
            lane = { x: e.cl.hx, z: e.cl.hz };
            if (offLane) {
              // One step off the lane, perpendicular to it - after the
              // commit, which is the only time stepping is an answer.
              px = -lane.z * 3;
              pz = lane.x * 3;
            }
          }
          // THE MEASUREMENT IS THE LUNGE AND NOTHING ELSE. After the lunge
          // the clast walks and swings like any rusher, and a swing landed
          // during the tail of the window was being counted as the lunge.
          // Once the first lunge is over the run is over: the enemy is
          // pinned far out of reach for whatever frames remain.
          if (lane && e.cl.state !== 'lunge') {
            done = true;
            e.pos.set(20, e.pos.y, 20);
            px = 0;
            pz = 0;
          }
        });
        return done ? lost : -1;
      };
      res.clastOn = await runClast(false);
      res.clastOff = await runClast(true);
      // And it is a COMMIT: once the lunge starts the heading never turns,
      // which is what makes the line a line. The heading is captured at the
      // first lunge frame and compared against the last of THAT SAME lunge,
      // with the player standing off the lane from the moment of the commit
      // - so this also proves a committed miss costs nothing. The watch ends
      // with the lunge: a second one would lock a NEW heading at a NEW
      // player position, which is the enemy doing its job rather than
      // steering the first line.
      {
        clean();
        const spot = clearSpot(10);
        const e = put('clast', spot.x, spot.z);
        e.attackCd = 1e6;
        e.cl = { state: 'tell', t: 0.05, hx: 0, hz: 1, hit: false };
        px = 0;
        pz = 0;
        let first = null;
        let sawLunge = false;
        let steered = false;
        let lunges = 0;
        const h0 = p.health;
        god = false;
        for (let i = 0; i < 240; i++) {
          await step();
          if (e.cl.state !== 'lunge') e.pos.set(spot.x, e.pos.y, spot.z);
          if (e.dead) break;
          if (e.cl.state === 'lunge') {
            if (!sawLunge) {
              sawLunge = true;
              first = { x: e.cl.hx, z: e.cl.hz };
              // Off the lane, perpendicular to it, from the frame of the
              // commit - the same step the dodge run takes, taken here so
              // the hit test and the steering test are one experiment.
              px = -first.z * 3;
              pz = first.x * 3;
            }
            if (Math.abs(e.cl.hx - first.x) > 0.01
              || Math.abs(e.cl.hz - first.z) > 0.01) {
              steered = true;
            }
          } else if (sawLunge) {
            // The first lunge is over; stop watching.
            lunges = 1;
            break;
          }
        }
        god = true;
        p.health = p.maxHealth;
        res.clastCommitted = sawLunge && !steered;
        res.clastMisses = +(h0 - p.health).toFixed(2);
      }
      clean();
    }

    // ---- 3. the lancet's wall follows, slowly -----------------------------
    // Three needles counted as they leave, and the wall's TURN measured off
    // one needle's own velocity: the wall is fired at where the player
    // STANDS, and the player steps aside the moment it leaves - a wall that
    // never homed would fly dead straight through the empty spot, and this
    // is the one thing that separates it from a spitter's fan.
    {
      clean();
      const spot = clearSpot(11);
      const e = put('lancet', spot.x, spot.z);
      e.speed = 0;
      px = 0;
      pz = 0;
      let fired = 0;
      let turned = false;
      let first = null;
      let stepped = false;
      for (let i = 0; i < 900; i++) {
        await step();
        e.pos.set(spot.x, e.pos.y, spot.z);
        const live = g.projectiles.filter((q) => q.type === 'lancet');
        fired = Math.max(fired, live.length);
        // The turn test: the FIRST needle of the wall, tracked from the
        // frame it leaves. Cumulative rather than frame-to-frame - a slow
        // home is the whole design (LANCET_HOME), and the difference
        // between two adjacent frames sits inside the noise of one step.
        if (!first) {
          const n = live[0];
          if (n) first = { a: Math.atan2(n.vel.z, n.vel.x) };
        } else if (!stepped) {
          // The wall is in the air: step the player a body's width aside,
          // across the wall's line. Homing turns the needle after them; a
          // plain round keeps its bearing.
          stepped = true;
          const away = first.a + Math.PI / 2;
          px = px + Math.cos(away) * 2;
          pz = pz + Math.sin(away) * 2;
        } else {
          const n = g.projectiles.find((q) => q.type === 'lancet');
          if (n) {
            const a1 = Math.atan2(n.vel.z, n.vel.x);
            let d = a1 - first.a;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            if (Math.abs(d) > 0.25) turned = true;
          }
        }
        if (turned) break;
      }
      res.lanWall = fired;
      res.lanHomes = turned;
      clean();
    }

    // ---- 4. the maser is two halves --------------------------------------
    // THE PLATE. The same blow from in front of the maser and from behind
    // it - the borer's own test, because the two enemies are the same idea
    // in different themes. The maser faces the player, so a round from the
    // player's side lands on the shell and one arriving from beyond it
    // lands on the heart.
    {
      clean();
      const e = put('maser', 8, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      await simSteps(0.4);
      e.speed = 0;
      const blow = (fromX) => {
        const dx = e.pos.x - fromX;
        const d = Math.hypot(dx, 0) || 1;
        const hp0 = e.hp;
        e.takeDamage(20, false, dx / d, 0, null);
        return +(hp0 - e.hp).toFixed(2);
      };
      res.masFront = blow(0);
      res.masRear = blow(e.pos.x * 2);
      res.masYawSane = isFinite(e.group.rotation.y);
      clean();
      // And the pulse. It fires out of the SWING, so there is no measuring
      // it without the swing - what is measurable is the whole cadence:
      // standing where the swing AND its pulse both land costs more than
      // standing out of reach of either, and the gap is wider than a swing
      // alone explains (a swing is one hit; the swing-plus-pulse band pays
      // the swing's number AND the pulse's 6).
      {
        const runPulse = async (inBand) => {
          clean();
          const m = put('maser', 6, 0);
          m.speed = 0;
          m.attackCd = 0;
          px = inBand ? 6 + 2.2 : 6 + 6;
          pz = 0;
          const lost = await measure(200, () => {
            m.pos.set(6, m.pos.y, 0);
          });
          return lost;
        };
        res.masPulseIn = await runPulse(true);
        res.masPulseOut = await runPulse(false);
        clean();
      }
    }

    // ---- 5. the knapper's wall is real geometry ---------------------------
    // It goes up under a filling circle, it is IN THE OBSTACLE LIST (the
    // whole mechanic - cover you can neither walk nor shoot through), and
    // it comes back down on its own.
    {
      clean();
      const e = put('knapper', 14, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let sawMark = false;
      let sawWall = false;
      let sawGone = false;
      let boxChecked = null;
      for (let i = 0; i < 2200; i++) {
        await step();
        e.pos.set(14, e.pos.y, 0);
        if (g._mortars.length > 0) sawMark = true;
        const h = g._hazard.find((x) => x.kind === 'edge');
        if (h) {
          sawWall = true;
          // Captured the MOMENT the wall is found: the box goes back out of
          // both lists the frame the hazard expires, and checking after the
          // loop measured a box that had already come down.
          if (!boxChecked) {
            boxChecked = {
              life: +h.life.toFixed(1),
              inObstacles: g.arena.obstacles.includes(h.box),
              inGround: g.arena.ground.includes(h.box),
            };
          }
        }
        if (sawWall && !h) {
          sawGone = true;
          break;
        }
      }
      res.knapTelegraph = sawMark;
      res.knapWall = sawWall;
      res.knapGone = sawGone;
      if (boxChecked) {
        res.knapWallLife = boxChecked.life;
        // And the box is in BOTH lists - a wall that stopped one and not
        // the other would be either cover you can walk through or a wall
        // you can shoot through (see _raiseWall).
        res.knapBoxInObstacles = boxChecked.inObstacles;
        res.knapBoxInGround = boxChecked.inGround;
      }
      clean();
    }

    // ---- 6. the mirror's rift is a growing question -----------------------
    // The both-ways shape again: standing where the rift opens when it cuts
    // costs, and standing outside the radius it ends at does not. The rift
    // is aimed AHEAD of the player's drift, so the test pins the player and
    // reads the mark's own coordinates rather than guessing where it went.
    {
      const runMirror = async (standAside) => {
        clean();
        const m = put('mirror', 10, 0);
        m.speed = 0;
        m.mirCd = 0.01;
        px = 0;
        pz = 0;
        let riftAt = null;
        let sawMark = false;
        const lost = await measure(400, () => {
          m.pos.set(10, m.pos.y, 0);
          const mk = g.effects.marks.find((x) => x.used);
          if (mk && mk.group.visible && !sawMark) {
            sawMark = true;
            riftAt = { x: mk.group.position.x, z: mk.group.position.z };
          }
          // Once the rift's centre is known, either stay on it or step well
          // outside its FINAL radius (2.6 + 4.0 = 6.6).
          if (riftAt && standAside) {
            const dx = px - riftAt.x;
            const dz = pz - riftAt.z;
            const d = Math.hypot(dx, dz) || 1;
            if (d < 7.5) {
              px = riftAt.x + (dx / d) * 8.5;
              pz = riftAt.z + (dz / d) * 8.5;
            }
          }
        });
        return { lost, sawMark };
      };
      const onRift = await runMirror(false);
      const offRift = await runMirror(true);
      res.mirTell = onRift.sawMark;
      res.mirOn = onRift.lost;
      res.mirOff = offRift.lost;
      clean();
    }

    // ---- 7. the glasswing sweeps a line -----------------------------------
    // The weeper's both-ways test with an edge's promise: standing on the
    // arc when the shard leaves costs, standing off it costs nothing.
    //
    // THE PLAYER RIDES THE ARC ONLY WHILE IT IS BEING DRAWN. Once the shot
    // has left, the line is fixed and the player freezes on it - the shard
    // flies straight (no homing on this round), so following the arc after
    // the shot would step OFF the line the shard actually took, and the
    // suite measured a miss that was the harness's own doing.
    //
    // AND THE SHARD IS SLOWED, through the same speedScale argument the
    // ai already passes. At full speed a clamped frame (dt 0.05) moves the
    // round 1.7m - past the whole 0.7m hit sphere in one step, so under
    // load the suite measured a tunnel. The aim, the bearing and the
    // mechanic are untouched; only the crossing is made legible to the
    // per-frame hit test.
    {
      const runWing = async (standWithArc) => {
        clean();
        const orig = g._spawnProjectile.bind(g);
        g._spawnProjectile = (x, y, z, type, ss, sr) =>
          orig(x, y, z, type, type === 'glasswing' ? 0.35 : ss, sr);
        // A CLEAR LINE, at a height band that covers the shard's whole
        // descent - the drop climbs down from the wing's altitude to the
        // player's eye, and a crate in the middle popped it mid-flight in
        // sessions whose plaza happened not to be on this bearing.
        const spot = clearSpot(11, 0, 6.5);
        const e = put('glasswing', spot.x, spot.z);
        e.speed = 0;
        e.wingCd = 0.01;
        px = 0;
        pz = 0;
        let sawTell = false;
        let frozen = false;
        let done = false;
        const lost = await measure(420, () => {
          e.pos.set(spot.x, e.pos.y, spot.z);
          if (e.wingState === 'tell') {
            sawTell = true;
            const ang = e.wingAng;
            let d = Math.hypot(e.pos.x - px, e.pos.z - pz);
            if (standWithArc) {
              // RIDDEN A FRAME AHEAD OF THE BEARING. The pin lands on the
              // arc the player was shown one frame ago and the shot
              // leaves along the arc's CURRENT bearing, so a pin dead on
              // the line sits a sweep-frame behind where the shard is
              // actually aimed - a systematic near-miss at 0.71 of the 0.7
              // hit sphere. Pulling the pin toward the wing along the
              // line puts the crossing inside the sphere with margin, and
              // the off-arc run is unaffected (it steps four metres
              // clear).
              d = Math.max(2.2, d - 0.3);
              px = e.pos.x + Math.cos(ang) * d;
              pz = e.pos.z + Math.sin(ang) * d;
            } else if (!frozen) {
              frozen = true;
              const away = Math.atan2(-Math.sin(ang), -Math.cos(ang));
              px = e.pos.x + Math.cos(away) * (d + 4);
              pz = e.pos.z + Math.sin(away) * (d + 4);
            }
          } else if (sawTell) {
            // The tell is over: the shard is in the air along the last
            // drawn bearing, the player stays wherever that left them,
            // and once the round is spent the run is over - the climb
            // afterwards is the window the enemy exists to hand, not a
            // thing this measurement is about.
            frozen = true;
            if (!g.projectiles.some((q) => q.type === 'glasswing')) {
              done = true;
              e.pos.set(20, e.pos.y, 20);
            }
          }
        });
        g._spawnProjectile = orig;
        return { lost: done ? lost : -1, sawTell };
      };
      const onLine = await runWing(true);
      const offLine = await runWing(false);
      res.wingTell = onLine.sawTell;
      res.wingOn = onLine.lost;
      res.wingOff = offLine.lost;
      clean();
    }

    // ---- 8. THE SMOKING MIRROR -------------------------------------------
    {
      clean();
      const e = put('mirrorboss', 10, 0);
      e.speed = 0;
      e.rate = 1;
      px = 0;
      pz = 0;
      let sawLane = false;
      let sawRain = false;
      let sawWalls = false;
      let sawSplit = false;
      let crescentFired = false;
      for (let i = 0; i < 4000; i++) {
        await step();
        e.pos.set(10, e.pos.y, 0);
        // The lane: any mark used by the boss's own state machine.
        if (e.bs && e.bs.state === 'crescent-tell') sawLane = true;
        if (e.bs && e.bs.state === 'crescent') {
          sawLane = true;
          crescentFired = true;
        }
        if (g._mortars.length >= 3) sawRain = true;
        if (g._hazard.filter((x) => x.kind === 'edge').length >= 2) sawWalls = true;
        // THE SPLIT, walked to the threshold by hand the way the schism
        // suite walks its tiers: the AI has to notice on its own.
        if (!sawSplit) {
          e.hp = e.maxHp * 0.25;
          if (e.bs && e.bs.split) sawSplit = true;
        }
        if (sawLane && sawRain && sawWalls && sawSplit) break;
      }
      res.bossLane = sawLane;
      res.bossCrescent = crescentFired;
      res.bossRain = sawRain;
      res.bossWalls = sawWalls;
      res.bossSplit = sawSplit;
      // THE SPLIT'S DEAL, driven through the live type block the way the
      // colossus core check drives it: shut, the face eats a third of
      // everything; open, it takes full. The two must never disagree with
      // what the player can SEE (the seam's blaze and the ENRAGED banner).
      if (sawSplit) {
        const { ENEMY_TYPES } = await import('./js/enemy.js');
        const saved = e.bs.split;
        e.bs.split = false;
        res.bossArmorShut = ENEMY_TYPES.mirrorboss.armor(e, 0, 1);
        e.bs.split = true;
        res.bossArmorOpen = ENEMY_TYPES.mirrorboss.armor(e, 0, 1);
        e.bs.split = saved;
      }
      clean();
    }

    await steps(30);
    return res;
  }, OBSIDIAN_TYPES);

  ok('an empty arena costs nothing', out.emptyCost === 0, `lost=${out.emptyCost}`);
  ok('every OBSIDIAN type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('a clast on the lane pays for it', out.clastOn > 0, `lost=${out.clastOn}`);
  ok('and a step off the lane costs nothing', out.clastOff === 0, `lost=${out.clastOff}`);  ok('and the lunge is committed, not tracking',
    out.clastCommitted, `steered=${!out.clastCommitted}`);
  ok('and a lunge that misses line-crosses for free',
    out.clastMisses === 0, `lost on a miss=${out.clastMisses}`);

  ok('a lancet fires a wall of three', out.lanWall >= 3, `in the air at once=${out.lanWall}`);
  ok('and the wall turns toward you', out.lanHomes);

  ok('a maser is shelled from the front',
    out.masFront < out.masRear, `front=${out.masFront} rear=${out.masRear}`);
  ok('and the shell never reaches its own heart',
    out.masRear >= 19.5, `rear=${out.masRear} of 20`);
  ok('a swing landed in the pulse band costs more than standing clear',
    out.masPulseIn > out.masPulseOut,
    `near=${out.masPulseIn} far=${out.masPulseOut}`);

  ok('a knapper strikes under a telegraph', out.knapTelegraph);
  ok('and the blade is real geometry in both lists',
    out.knapWall && out.knapBoxInObstacles && out.knapBoxInGround);
  ok('and it comes down on its own', out.knapGone, `life=${out.knapWallLife}`);

  ok('a mirror opens its rift under a telegraph', out.mirTell);
  ok('standing in it when it cuts costs', out.mirOn > 0, `lost=${out.mirOn}`);
  ok('and standing clear of its final radius costs nothing',
    out.mirOff === 0, `lost=${out.mirOff}`);

  ok('a glasswing sweeps a line before it drops', out.wingTell);
  ok('standing on the arc when the shard leaves costs',
    out.wingOn > 0, `lost=${out.wingOn}`);
  ok('and standing off the arc costs nothing',
    out.wingOff === 0, `lost=${out.wingOff}`);

  ok('the Smoking Mirror telegraphs the crescent lane', out.bossLane);
  ok('and sweeps down it', out.bossCrescent);
  ok('and calls the rain', out.bossRain);
  ok('and raises the walls', out.bossWalls);
  ok('and under a third of the bar the face splits', out.bossSplit);
  ok('and the split face takes what the shut face did not',
    out.bossArmorShut !== undefined && out.bossArmorOpen === 1
      && out.bossArmorShut < 1,
    `shut=${out.bossArmorShut} open=${out.bossArmorOpen}`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `OBSIDIAN TEST FAIL (${fails})` : 'OBSIDIAN TEST PASS');
process.exitCode = fails ? 1 : 0;
