// CATHEDRAL, end to end - the twelfth theme built out.
//
// WHY THIS EXISTS
//   CATHEDRAL is the theme where LOOKING AWAY IS THE MISTAKE. Everything in
//   it is a threshold, and every mechanic here is one crossing:
//
//     penitent    visibly folds into a kneel and takes 30% less damage there;
//                 the kneel is still the tell for the hard hit on the rise
//     curate      its round walks THROUGH cover. The answer is movement,
//                 never geometry - the one gunner a pillar cannot answer
//     pallbearer  fully vulnerable; it hoists the coffin, marks a fixed lane,
//                 charges down it and slams, then leaves a punish window
//     thurible    walks a veil of incense that costs no health and takes
//                 SIGHT - the ink's mechanic, walked rather than thrown
//     sacristan   every enemy that dies near it TOLLS, and the toll chills
//                 the player wherever they are. The one support paid by
//                 the kill rather than by the minute
//     vigil       holds station and draws a beam; the beam slows, and the
//                 lance goes along the locked bearing rather than at the
//                 player
//
//   The headline assertions follow the both-ways shape the other theme
//   suites use: the thing with the mechanic against the thing without it.
//   A penitent is measured kneeling against standing; a curate's round is
//   measured with a wall between it and the player and a shooter's round
//   in the same place; a pallbearer's committed slam is measured on its lane
//   and after a sidestep; a vigil's lance is measured on the beam against off it.
import { bootPage, launchBrowser, sleep, startServer } from './harness.mjs';

const PORT = 8247;
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const CATHEDRAL_TYPES = ['penitent', 'curate', 'pallbearer', 'thurible', 'sacristan', 'vigil'];

try {
  browser = await launchBrowser();
  const { page, errors } = await bootPage(browser, PORT);

  const out = await page.evaluate(async (CATHEDRAL_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
    // SECONDS OF GAME, not a count of frames. The loop clamps dt at 0.05, so
    // a frame is worth 1/60s of game on an idle machine and up to 0.05s on a
    // loaded one - the same steps(n) simulates THREE TIMES more game on a
    // slow host. Anything whose meaning is a duration has to be waited for in
    // this unit or it silently changes what it is testing.
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
      // A player who dies inside a god=false window parks the WHOLE GAME in
      // 'gameover' - the loop stops updating, and every section after reads a
      // frozen arena while failing for reasons that have nothing to do with
      // what they assert. The cost windows below are ALLOWED to be lethal on
      // a starting bar, so the state goes back the way every section needs
      // it, exactly the way `waveState` above does.
      g.state = 'playing';
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
      for (const t of CATHEDRAL_TYPES) {
        const e = put(t, 14, 14);
        subjects.push(e);
        built[t] = !!(e.group && e.group.children.length > 2);
      }
      // Two seconds of GAME - a pallbearer closed this distance in six
      // seconds of wall-clock on a loaded host and the suite reported it
      // dying of its own approach as a type that did not survive its AI.
      await simSteps(2);
      res.allBuilt = Object.values(built).every(Boolean);
      res.builtDetail = built;
      res.subjectsAlive = subjects.filter((e) => !e.dead).length;
      res.subjectsMade = subjects.length;
      clean();
    }

    // ---- 2. a penitent visibly kneels and reduces damage ----------------
    // THE BOTH-WAYS TEST. The same blow against the same penitent, kneeling
    // and standing - what is measured is the health that came off. The pose
    // is asserted with it: changing an armour number while the hat blinks out
    // would pass the arithmetic and preserve the bug this test exists for.
    {
      clean();
      const e = put('penitent', 6, 0);
      e.speed = 0;
      e.pState = 'kneel';
      e.pT = 10;          // held in the kneel past any rise
      px = 0;
      pz = 0;
      await simSteps(0.3);
      res.penUpperDrop = +(-e.penUpper.position.y / e.scale).toFixed(2);
      res.penLegFold = +(e.penLegs[0].rotation.x - 0.28).toFixed(2);
      res.penHoodVisible = e.penHood.visible;
      const hp0 = e.hp;
      e.takeDamage(10, false, 0, 1);
      res.penKneelBlow = +(hp0 - e.hp).toFixed(2);
      // ...and standing, the same blow. The difference between the two is
      // the kneel and nothing else.
      e.pState = 'walk';
      e.pT = 10;
      const hp1 = e.hp;
      e.takeDamage(10, false, 0, 1);
      res.penStandBlow = +(hp1 - e.hp).toFixed(2);
      clean();
    }

    // ---- 3. THE RISE IS THE ATTACK --------------------------------------
    // The penitent kneels at the player and the stroke lands on the rise -
    // measured as cost, with the player standing in the reach of it.
    {
      clean();
      const e = put('penitent', 2.2, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let knelt = false;
      let rose = false;
      const lost = await measure(300, () => {
        e.pos.set(2.2, e.pos.y, 0);
        if (e.pState === 'kneel') knelt = true;
        if (knelt && e.pState === 'walk') rose = true;
      });
      res.penKnelt = knelt;
      res.penRose = rose;
      res.penStroke = lost;
      clean();
    }

    // ---- 4. a curate's round walks through cover ------------------------
    // THE HEADLINE. A shooter's round and a curate's round, fired across the
    // same piece of solid geometry at the same player: the shooter's breaks
    // on the box, and the curate's does not. What is measured is the cost -
    // a ghost round that stopped at the wall would be an ordinary gunner
    // with a rider on it, and nothing about the enemy would look wrong.
    {
      clean();
      // Stand the player behind a real solid box, and each gunner on the far
      // side of it, firing across.
      px = 2.5;
      pz = 0;
      // A crate between the player and where the gunner will stand: 1.5m
      // wide, centred on the line between them.
      const { Box3, Vector3 } = await import('three');
      const wall = new Box3(
        new Vector3(-1.0, 0, -0.75),
        new Vector3(1.0, 2.4, 0.75)
      );
      g.arena.obstacles.push(wall);
      g.arena.ground.push(wall);
      // The shooter's round first: it has to break, or the test measures
      // a wall that was never in the way.
      const shooter = put('shooter', -3.5, 0);
      shooter.speed = 0;
      shooter.attackCd = 0;
      let shooterCost = 0;
      {
        god = false;
        p.health = p.maxHealth;
        p.invulnEnd = -1;
        const h0 = p.health;
        for (let i = 0; i < 130; i++) {
          await step();
          shooter.pos.set(-3.5, shooter.pos.y, 0);
        }
        shooterCost = +(h0 - p.health).toFixed(2);
        god = true;
        p.health = p.maxHealth;
      }
      // ...and the curate's, across the same box.
      const curate = put('curate', -3.5, 0);
      curate.speed = 0;
      curate.attackCd = 0;
      curate.cuT = 0;
      let curateCost = 0;
      {
        god = false;
        p.health = p.maxHealth;
        p.invulnEnd = -1;
        const h0 = p.health;
        for (let i = 0; i < 260; i++) {
          await step();
          curate.pos.set(-3.5, curate.pos.y, 0);
        }
        curateCost = +(h0 - p.health).toFixed(2);
        god = true;
        p.health = p.maxHealth;
      }
      res.covShooterCost = shooterCost;
      res.covCurateCost = curateCost;
      // The box goes with the wave's own sweep.
      g.arena.obstacles.splice(g.arena.obstacles.indexOf(wall), 1);
      g.arena.ground.splice(g.arena.ground.indexOf(wall), 1);
      clean();
    }

    // ---- 5. the pallbearer's burden charge -------------------------------
    // Fully vulnerable, with a committed line and a whole-model tell. Run the
    // same attack twice: stay on the announced lane, then step sideways as
    // soon as the coffin rises.
    {
      clean();
      const e = put('pallbearer', 8, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      await simSteps(0.4);
      e.speed = 0;
      // No hidden armour remains: a directional hit and a directionless hit
      // both land at full value.
      const hp0 = e.hp;
      e.takeDamage(40, false, 0, 1);
      res.pallDirected = +(hp0 - e.hp).toFixed(2);
      const hp1 = e.hp;
      e.takeDamage(20, true);
      res.pallDot = +(hp1 - e.hp).toFixed(2);

      const burden = async (sidestep) => {
        clean();
        // This assertion is about staying on or stepping off the committed
        // lane. A procedural pillar in that lane correctly makes the charge
        // slam early, but would turn the test into a roll of the room seed.
        const heldObstacles = g.arena.obstacles.splice(0);
        const q = put('pallbearer', 7, 0);
        px = 0;
        pz = 0;
        await steps(2);
        q.palCd = 0;
        god = false;
        p.health = p.maxHealth;
        p.invulnEnd = -1;
        const h0 = p.health;
        let sawTell = false;
        let sawCharge = false;
        let sawRecover = false;
        let sawLane = false;
        let lift = 0;
        let floor = 99;
        const until = g.time + 7;
        while (g.time < until && !sawRecover) {
          await step();
          if (q.palState === 'tell') {
            sawTell = true;
            sawLane ||= q.palMark >= 0;
            if (sidestep) pz = 6;
          }
          if (q.palState === 'charge') sawCharge = true;
          if (q.palState === 'recover') {
            sawRecover = true;
            // One more frame lets the impact pose put the coffin on the floor.
            await step();
          }
          lift = Math.max(lift, -q.palCoffin.rotation.x);
          floor = Math.min(floor, q.palCoffin.position.y / q.scale);
        }
        const lost = +(h0 - p.health).toFixed(2);
        god = true;
        p.health = p.maxHealth;
        g.arena.obstacles.push(...heldObstacles);
        return {
          lost, sawTell, sawCharge, sawRecover, sawLane,
          lift: +lift.toFixed(2), floor: +floor.toFixed(2),
          markReleased: q.palMark === -1,
        };
      };
      res.pallOnLane = await burden(false);
      res.pallOffLane = await burden(true);

      // Death is only death now: no banked retaliation and no consecrated
      // patch appearing after the body has already been beaten.
      clean();
      const h = put('pallbearer', 1, 0);
      px = 0;
      pz = 0;
      await steps(2);
      god = false;
      p.health = p.maxHealth;
      p.invulnEnd = -1;
      const deathHp = p.health;
      h.takeDamage(h.hp + 1, true);
      await steps(10);
      res.pallDeathCost = +(deathHp - p.health).toFixed(2);
      res.pallDeathHallow = g._hazard.some((x) => x.kind === 'hallow');
      god = true;
      clean();
    }

    // ---- 6. the thurible's veil takes sight, not health ------------------
    // The veil is watched for directly: incense on the floor with a cloud
    // over it, and standing in it costs NOTHING - which is the difference
    // between this and every other patch the game lays.
    {
      clean();
      const e = put('thurible', 4, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let veil = null;
      for (let i = 0; i < 700; i++) {
        await step();
        e.pos.set(4, e.pos.y, 0);
        veil = g._hazard.find((x) => x.kind === 'incense');
        if (veil) break;
      }
      res.thurVeil = !!veil;
      res.thurCloud = !!(veil && veil.cloud >= 0);
      if (veil) {
        px = veil.x;
        pz = veil.z;
        res.thurCost = await measure(40, () => {});
      }
      clean();
    }

    // ---- 7. the sacristan charges by the kill ----------------------------
    // A body dies inside the ring and the player - who is NOT standing near
    // the sacristan, and not touching the body - is chilled anyway. Then the
    // same death outside the ring, which has to cost nothing at all.
    {
      clean();
      const sac = put('sacristan', 6, 0);
      sac.speed = 0;
      sac.sacCd = 0;
      const body = put('chaser', 7, 0);
      body.speed = 0;
      px = -8;
      pz = 8;
      await steps(30);
      body.dead = true;
      await steps(8);
      res.sacChilled = p.status.slowness > 0;
      res.sacCleared = p.status.slowness === 0 || p.status.slowness < 6;
      p.clearStatuses();
      // ...and the same death well outside the ring.
      const far = put('chaser', -12, 0);
      far.speed = 0;
      sac.sacCd = 0;
      await steps(10);
      far.dead = true;
      await steps(8);
      res.sacFarChilled = p.status.slowness > 0;
      // THE COOLDOWN. A crowd dying in one burst is a bill paid once: a
      // second death inside the bell's own lockout chills for the LONGER
      // clock, never twice over.
      p.clearStatuses();
      sac.sacCd = 0;
      await steps(10);
      const b1 = put('chaser', 7, 0);
      const b2 = put('chaser', 7.5, 0);
      b1.speed = 0;
      b2.speed = 0;
      await steps(6);
      b1.dead = true;
      b2.dead = true;
      await steps(8);
      res.sacOnce = p.status.slowness > 0;
      res.sacCdAfter = +(sac.sacCd || 0).toFixed(2);
      clean();
    }

    // ---- 8. the vigil's lance goes along the beam ------------------------
    // THE BOTH-WAYS TEST, the weeper's shape. The vigil's tell locks a
    // bearing; the player is stood ON the locked line or well OFF it. A
    // lance that aimed at the player rather than along the beam would pass
    // the second and fail the first.
    {
      const runVigil = async (standOnBeam) => {
        clean();
        const e = put('vigil', 12, 0);
        e.speed = 0;
        e.vgLanceCd = 0.01;
        e.vgState = 'watch';
        px = 0;
        pz = 0;
        let sawTell = false;
        const lost = await measure(420, () => {
          e.pos.set(12, e.pos.y, 0);
          if (e.vgState === 'tell') {
            sawTell = true;
            // The locked bearing, read off the enemy exactly as it will be
            // read at the moment of the shot.
            const ang = e.vgAng;
            // Where the line crosses the player's distance from the vigil.
            const d = Math.hypot(e.pos.x - px, e.pos.z - pz);
            const lx = e.pos.x + Math.cos(ang) * d;
            const lz = e.pos.z + Math.sin(ang) * d;
            if (standOnBeam) {
              px = lx;
              pz = lz;
            } else {
              // OFF it, and further from the vigil than the line is: if this
              // costs nothing it cannot be because the lance is short.
              const away = Math.atan2(-(lz - e.pos.z), -(lx - e.pos.x));
              px = e.pos.x + Math.cos(away) * (d + 4);
              pz = e.pos.z + Math.sin(away) * (d + 4);
            }
          }
        });
        return { lost, sawTell };
      };
      const onBeam = await runVigil(true);
      const offBeam = await runVigil(false);
      res.vigTell = onBeam.sawTell;
      res.vigOn = onBeam.lost;
      res.vigOff = offBeam.lost;
      // ...and the beam itself slows whoever stands in it, which is what
      // loads the lance.
      clean();
      const e = put('vigil', 10, 0);
      e.speed = 0;
      e.vgState = 'watch';
      e.vgLanceCd = 999;
      px = 0;
      pz = 0;
      await steps(30);
      res.vigSlowed = p.status.slowness > 0;
      clean();
    }

    // ---- 9. THE RELIQUARY -----------------------------------------------
    // THE OFFICE, end to end. The boss is five rites on their own clocks,
    // and the shrine MOVES: the fan off the lantern (five rounds in one
    // breath), the peal's ring with its one gap (a dozen rounds at once and
    // the beam on the way out), the candles fixing the player's trail, the
    // procession's painted lane crossed at a stride, and the kneel whose
    // rise is the hit. The toll and the opening stay, the armour does not.
    {
      clean();
      const e = put('reliquary', 12, 0);
      e.rate = 1;
      px = 0;
      pz = 0;
      // PER-TICK SALVO BOOKKEEPING. A fan is five rounds in one tick and a
      // peal's ring is twelve - the two are told apart by the count alone,
      // which is the difference between them that matters. An in-flight
      // count would miss rounds that already died on a wall.
      const origSpawn = g._spawnProjectile.bind(g);
      let lastTick = -1;
      let tickShots = 0;
      let fanSalvo = 0;
      let ringSalvo = 0;
      let lanceSpeed = 0;
      const flushTick = () => {
        if (tickShots >= 4 && tickShots <= 7) fanSalvo = Math.max(fanSalvo, tickShots);
        if (tickShots >= 10) ringSalvo = Math.max(ringSalvo, tickShots);
        tickShots = 0;
      };
      g._spawnProjectile = (x, y, z, type, ss, sr) => {
        const out = origSpawn(x, y, z, type, ss, sr);
        if (type === 'reliquary') {
          if (g.time !== lastTick) { flushTick(); lastTick = g.time; }
          tickShots++;
          lanceSpeed = Math.max(lanceSpeed, ss);
        }
        return out;
      };
      const seen = { volley: 0, peal: 0, watch: 0, candles: 0, kneel: 0, proc: 0, lane: false };
      let sawToll = false;
      let sawOpen = false;
      let litMax = 0;
      let hallowMax = 0;
      let travel = 0;
      let lastX = e.pos.x;
      let lastZ = e.pos.z;
      let minX = 99, maxX = -99, minZ = 99, maxZ = -99;
      const t0 = g.time;
      // The player circles the room at mid range, so all five rites get
      // their launch conditions met - pinned in one spot, the procession
      // could never show its lane and the fight would be the old corner one.
      while (g.time - t0 < 45) {
        await step();
        const ang = g.time * 0.5;
        px = 10 * Math.cos(ang);
        pz = 10 * Math.sin(ang);
        if (e.dead) break;
        const bs = e.bs;
        if (!bs) continue;
        if (bs.state === 'volley') seen.volley++;
        if (bs.state === 'peal') seen.peal++;
        if (bs.state === 'watch') seen.watch++;
        if (bs.state === 'candles') { seen.candles++; litMax = Math.max(litMax, bs.lit); }
        if (bs.state === 'kneel') seen.kneel++;
        if (bs.state === 'proc') seen.proc++;
        if (bs.state === 'procTell' && bs.mark >= 0) seen.lane = true;
        // THE TOLL: the chill arrives from across the room, with no other
        // source of cold in the arena.
        if (!sawToll && e.hp <= e.maxHp * 0.62 && p.status.slowness > 0
            && !g._hazard.some((x) => x.kind === 'frost' || x.kind === 'hail')) {
          sawToll = true;
        }
        // THE OPENING is forced early, so the whole loop below is read in
        // the fight's fastest phase - everything it must survive, it does.
        if (!sawOpen) {
          e.hp = Math.min(e.hp, e.maxHp * 0.29);
          if (e.bs.opened) sawOpen = true;
        }
        hallowMax = Math.max(hallowMax, g._hazard.filter((x) => x.kind === 'hallow').length);
        travel += Math.hypot(e.pos.x - lastX, e.pos.z - lastZ);
        lastX = e.pos.x;
        lastZ = e.pos.z;
        minX = Math.min(minX, e.pos.x);
        maxX = Math.max(maxX, e.pos.x);
        minZ = Math.min(minZ, e.pos.z);
        maxZ = Math.max(maxZ, e.pos.z);
        // TRAVEL IS PART OF THE BREAK: the loop keeps going until the shrine
        // has genuinely crossed ground, not merely until every state has
        // been touched for one frame - a procession seen for its first
        // frame proves the lane, not the crossing. The LANCE is part of it
        // for the same reason: the watch's tell outlasts a break that only
        // asked whether the rite had begun.
        if (seen.volley > 0 && seen.peal > 0 && litMax >= 5 && seen.kneel > 0
          && seen.proc > 0 && sawToll && sawOpen && fanSalvo >= 4
          && ringSalvo >= 10 && lanceSpeed >= 1.5 && travel > 45) break;
      }
      flushTick();
      g._spawnProjectile = origSpawn;
      res.relVolley = seen.volley > 0;
      res.relFan = fanSalvo;
      res.relPeal = seen.peal > 0;
      res.relRingSalvo = ringSalvo;
      res.relWatch = seen.watch > 0;
      res.relLance = lanceSpeed;
      res.relCandles = seen.candles > 0;
      res.relCandleLitMax = litMax;
      res.relProc = seen.proc > 0 && seen.lane;
      res.relToll = sawToll;
      res.relOpen = sawOpen;
      res.relHallow = hallowMax;
      res.relTravel = +travel.toFixed(1);
      res.relRoamX = +(maxX - minX).toFixed(1);
      res.relRoamZ = +(maxZ - minZ).toFixed(1);
      // NO ARMOUR, EVER: the row is gone from the type, and the same blow
      // lands in full before the opening and after it.
      const { ENEMY_TYPES: TYPES } = await import('./js/enemy.js');
      res.relArmorless = TYPES.reliquary.armor === undefined;
      clean();
    }

    // ---- 10. touching the shrine costs immediately ------------------------
    {
      clean();
      put('reliquary', 0, 0);
      px = 0;
      pz = 0;
      res.relTouch = await measure(24);
      clean();
    }

    // ---- 11. the rise, and the candles, cost whoever stands still --------
    // THE BOTH-WAYS SHAPE the suite uses: a pinned player through each rite.
    // The rise is measured kneel-to-hit; the candles land their whole trail
    // on a player who never moved.
    {
      clean();
      // THE BAR IS RAISED FOR THIS WINDOW, the way test/boss.mjs raises it.
      // A rise landing on a pinned player is more than a starting bar holds,
      // and a player who dies mid-measure stops the whole game - every later
      // section would read a frozen arena and fail for reasons that have
      // nothing to do with what they assert.
      const keepMax = p.maxHealth;
      p.maxHealth = 100000;
      p.health = 100000;
      const e = put('reliquary', 5.5, 0);
      e.rate = 1;
      // bs is born on the first ai() call - the cd override must come after
      // a step, or the init pass writes right over it.
      await steps(2);
      e.bs.riseCd = 0;
      px = 0;
      pz = 0;
      let sawKneel = false;
      let sawRise = false;
      const lost = await measure(320, () => {
        if (e.bs.state === 'kneel') sawKneel = true;
        if (sawKneel && e.bs.state === 'recover') sawRise = true;
      });
      res.relRisePose = sawKneel && sawRise;
      res.relRiseCost = lost;
      clean();
      const e2 = put('reliquary', 14, 0);
      e2.rate = 1;
      await steps(2);
      e2.bs.candlesCd = 0;
      e2.bs.volleyCd = 999;
      e2.bs.procCd = 999;
      e2.bs.pealCd = 999;
      e2.bs.riseCd = 999;
      e2.bs.watchCd = 999;
      px = 0;
      pz = 0;
      let lit = 0;
      const lost2 = await measure(420, () => {
        if (e2.bs.state === 'candles') lit = Math.max(lit, e2.bs.lit);
      });
      res.relCandleLit = lit;
      res.relCandleCost = lost2;
      clean();
      // The bar goes back to what the run brought in, so nothing downstream
      // measures against a player who was never meant to have one.
      p.maxHealth = keepMax;
      p.health = keepMax;
    }

    // ---- 12. the head is hittable -----------------------------------------
    // THE BUG THIS EXISTS FOR: the reliquary's head sphere used to hang
    // under both its lamps and its eyes, so a round placed squarely on the
    // face passed over both spheres and MISSED - A boss with no hittable
    // head. The pellet is driven straight down the barrel at each sphere,
    // so what is measured is geometry, not luck.
    {
      clean();
      const e = put('reliquary', 0, -8);
      e.hp = 1e6;
      e.maxHp = 1e6;
      px = 0;
      pz = 0;
      await steps(2);
      e.group.position.copy(e.pos);
      e.group.updateMatrixWorld(true);
      const { Vector3 } = await import('three');
      const shootAt = (mesh) => {
        const at = new Vector3();
        mesh.getWorldPosition(at);
        g.camera.position.set(0, at.y, 0);
        g.camera.lookAt(at);
        g.camera.updateMatrixWorld(true);
        const targets = [];
        for (const en of g.enemies) { targets.push(en.hitbox); targets.push(en.head); }
        const before = e.hp;
        g._beginShot();
        g._firePellet(new Vector3(0, at.y, 0), targets, 0, g.player.weapon, 1, false);
        return { dealt: +(before - e.hp).toFixed(2), head: g._shotWasHead };
      };
      const headUp = shootAt(e.head);
      const bodyHit = shootAt(e.hitbox);
      res.relHeadShot = headUp.dealt;
      res.relWasHead = headUp.head;
      res.relBodyShot = bodyHit.dealt;

      // ---- 12b. the whole shrine flashes, head included --------------------
      // THE BUG THIS EXISTS FOR: the boss's head region is an arch, a span
      // and a crown of candles - all accent material - so a headshot landed
      // damage while nothing at the head turned white. The accents are the
      // instance's own clones now: they join the flash, restore when it
      // ends, and the SHARED pair the theme's other six bodies wear is
      // never written, so no other cathedral enemy can flash in sympathy.
      //
      // The flash lands on the first UPDATE after the blow, so one step is
      // taken before reading it - and the rites are silenced for the window,
      // because a volley fired mid-read re-arms the flash and fakes the
      // restore.
      e.bs.rest = 999;
      const { SHARED_MATS } = await import('./js/enemies/shared.js');
      const sharedGiltBefore = SHARED_MATS.cathGilt.emissive.getHex();
      const acc = e.flashMats;
      const accentAt = () => acc.map(
        (f) => [f.mat.emissive.getHex(), +f.mat.emissiveIntensity.toFixed(2)]);
      await step();
      const during = accentAt();
      await steps(20);
      const after = accentAt();
      res.relAccentFlash = during;
      res.relAccentRestored = after;
      res.relAccentBase = acc.map((f) => [f.hex, f.i]);

      // And a PENITENT hit through its own body leaves the shared pair
      // alone - the boss's clones must not have leaked the flash onto the
      // rest of the roster's materials.
      const pe = put('penitent', 4, 0);
      pe.takeDamage(5);
      await step();
      res.relSharedAfterHit = [
        SHARED_MATS.cathGilt.emissive.getHex(),
        SHARED_MATS.cathStone.emissive.getHex(),
      ];
      res.relSharedUntouched = res.relSharedAfterHit[0] === sharedGiltBefore
        && res.relSharedAfterHit[1] === 0x000000;
      clean();
    }

    await steps(30);
    return res;
  }, CATHEDRAL_TYPES);

  ok('an empty arena costs nothing', out.emptyCost === 0, `lost=${out.emptyCost}`);
  ok('every CATHEDRAL type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('a penitent visibly lowers its whole body into the kneel',
    out.penUpperDrop > 0.3 && out.penLegFold > 0.7 && out.penHoodVisible,
    `drop=${out.penUpperDrop} fold=${out.penLegFold} hood=${out.penHoodVisible}`);
  ok('a penitent takes 30% less damage while it kneels',
    out.penKneelBlow === 7, `blow=${out.penKneelBlow} of 10`);
  ok('and the same blow lands in full when it is standing',
    out.penStandBlow === 10, `blow=${out.penStandBlow} of 10`);
  ok('a penitent kneels at the player and rises into a stroke',
    out.penKnelt && out.penRose, `knelt=${out.penKnelt} rose=${out.penRose}`);
  ok('and the stroke costs whoever is in reach of it',
    out.penStroke > 0, `lost=${out.penStroke}`);

  ok('a shooter round breaks on cover',
    out.covShooterCost === 0, `lost=${out.covShooterCost}`);
  ok('and a curate round walks THROUGH it',
    out.covCurateCost > 0, `lost=${out.covCurateCost}`);

  ok('a pallbearer is fully vulnerable to direct and directionless damage',
    out.pallDirected === 40 && out.pallDot === 20,
    `direct=${out.pallDirected} dot=${out.pallDot}`);
  ok('the pallbearer shows its tell, lane, charge and recovery',
    out.pallOnLane.sawTell && out.pallOnLane.sawLane &&
      out.pallOnLane.sawCharge && out.pallOnLane.sawRecover && out.pallOnLane.markReleased,
    JSON.stringify(out.pallOnLane));
  ok('and the coffin visibly rises before slamming to the floor',
    out.pallOnLane.lift > 1 && out.pallOnLane.floor < 0.55,
    `lift=${out.pallOnLane.lift} floor=${out.pallOnLane.floor}`);
  ok('staying on the committed lane costs health',
    out.pallOnLane.lost > 0, `lost=${out.pallOnLane.lost}`);
  ok('and stepping sideways during the tell avoids the slam',
    out.pallOffLane.lost === 0, `lost=${out.pallOffLane.lost}`);
  ok('killing a pallbearer causes no retaliation or hallow patch',
    out.pallDeathCost === 0 && !out.pallDeathHallow,
    `lost=${out.pallDeathCost} hallow=${out.pallDeathHallow}`);

  ok('a thurible lays a veil of incense', out.thurVeil);
  ok('and the veil hangs a cloud, which is the whole mechanic', out.thurCloud);
  ok('and standing in the veil costs NO health at all',
    out.thurCost === 0, `lost=${out.thurCost}`);

  ok('a sacristan chills the player for a death inside its ring',
    out.sacChilled, `slowness=${out.sacCleared}`);
  ok('and a death outside the ring costs nothing',
    !out.sacFarChilled);
  ok('a crowd dying in a burst is a bill paid once',
    out.sacOnce && out.sacCdAfter > 0, `cd=${out.sacCdAfter}`);

  ok('a vigil locks its beam before it fires', out.vigTell);
  ok('standing on the locked line when the lance leaves costs',
    out.vigOn > 0, `lost=${out.vigOn}`);
  ok('and standing off it costs nothing',
    out.vigOff === 0, `lost=${out.vigOff}`);
  ok('and the beam itself slows whoever it watches', out.vigSlowed);

  ok('the Reliquary throws the fan, FIVE rounds off the lantern',
    out.relVolley && out.relFan >= 5, `volley=${out.relVolley} fan=${out.relFan}`);
  ok('and the bell rings a RING with a gap, not another fan',
    out.relPeal && out.relRingSalvo >= 10, `peal=${out.relPeal} ring=${out.relRingSalvo}`);
  ok('the watch locks its beam and throws the one fast lance',
    out.relWatch && out.relLance >= 1.5, `watch=${out.relWatch} lanceSpeed=${out.relLance}`);
  ok('the candles light one at a time',
    out.relCandles && out.relCandleLitMax >= 5, `lit=${out.relCandleLitMax}`);
  ok('the procession paints a lane and takes the fight ACROSS the room',
    out.relProc && out.relTravel >= 40,
    `lane=${out.relProc} roamX=${out.relRoamX} roamZ=${out.relRoamZ} travel=${out.relTravel}`);
  ok('the room is still consecrated where the shrine has walked',
    out.relHallow > 0, `patches=${out.relHallow}`);
  ok('and under two thirds the bell tolls on its own', out.relToll);
  ok('and under a third the reliquary opens', out.relOpen);
  ok('and there is NO armour left on it, in either state',
    out.relArmorless, `armorless=${out.relArmorless}`);

  ok('touching the shrine costs immediately', out.relTouch > 0, `lost=${out.relTouch}`);
  ok('the kneel is seen, and the rise costs whoever stayed in the circle',
    out.relRisePose && out.relRiseCost > 0, `pose=${out.relRisePose} lost=${out.relRiseCost}`);
  ok('and the candles cost whoever stands still',
    out.relCandleLit >= 5 && out.relCandleCost > 0, `lit=${out.relCandleLit} lost=${out.relCandleCost}`);

  ok('a round on the reliquary\'s FACE lands as a headshot',
    out.relWasHead && out.relHeadShot > 0, `head=${out.relHeadShot} registered=${out.relWasHead}`);
  ok('and is worth exactly double a body shot',
    out.relBodyShot > 0 && Math.abs(out.relHeadShot / out.relBodyShot - 2) < 0.02,
    `head=${out.relHeadShot} body=${out.relBodyShot}`);

  ok('the whole shrine flashes white, the accent head included',
    out.relAccentFlash && out.relAccentFlash.every((f) => f[0] === 0xffffff && f[1] === 0.9),
    `flash=${JSON.stringify(out.relAccentFlash)}`);
  ok('and the accents come back to their own colours when it ends',
    JSON.stringify(out.relAccentRestored) === JSON.stringify(out.relAccentBase),
    `now=${JSON.stringify(out.relAccentRestored)} base=${JSON.stringify(out.relAccentBase)}`);
  ok('and the theme\'s shared materials are never written by it',
    out.relSharedUntouched, `gilt/stone=${JSON.stringify(out.relSharedAfterHit)}`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `CATHEDRAL TEST FAIL (${fails})` : 'CATHEDRAL TEST PASS');
process.exitCode = fails ? 1 : 0;
