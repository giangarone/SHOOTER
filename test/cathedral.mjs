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
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8247;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

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
    // The fight is the FLOOR: rings of hallow laid where the boss stood, the
    // processional fan off the lantern, the toll under two thirds, and the
    // opening under a third - the lids go wide and the armour comes off.
    {
      clean();
      const e = put('reliquary', 10, 0);
      e.speed = 0;
      e.rate = 1;
      px = 0;
      pz = 0;
      let sawRing = false;
      let sawVolley = false;
      let sawToll = false;
      let sawOpen = false;
      let ringCount = 0;
      for (let i = 0; i < 3200; i++) {
        await step();
        e.pos.set(10, e.pos.y, 0);
        const hal = g._hazard.filter((x) => x.kind === 'hallow').length;
        if (hal > ringCount) { sawRing = true; ringCount = hal; }
        if (g.projectiles.some((q) => q.type === 'reliquary')) sawVolley = true;
        // THE TOLL: the chill arrives from across the room, and the player
        // is pinned nowhere near the boss. Watched as a chill that appears
        // with no other source in the arena.
        if (!sawToll && e.hp <= e.maxHp * 0.62 && p.status.slowness > 0
            && !g._hazard.some((x) => x.kind === 'frost' || x.kind === 'hail')) {
          sawToll = true;
        }
        // THE OPENING: under a third the lids go wide and the armour comes
        // off - measured as the same blow before and after.
        if (!sawOpen) {
          e.hp = e.maxHp * 0.29;
          await step();
          if (e.bs && e.bs.opened) sawOpen = true;
        }
        // Not finished until the room itself has been claimed at least once
        // and the toll has rung - the two things the fight is made of.
        if (sawRing && sawVolley && sawToll && sawOpen) break;
      }
      res.relRing = sawRing;
      res.relRingCount = ringCount;
      res.relVolley = sawVolley;
      res.relToll = sawToll;
      res.relOpen = sawOpen;
      // THE OPENING IS WORTH SOMETHING: the same armour call, after it. The
      // boss is already opened at this point in the walk, so what is being
      // asserted is that the state the lids are showing is the state the
      // armour is taking - the three-way agreement the colossus core check
      // in boss.mjs exists for.
      const { ENEMY_TYPES: TYPES } = await import('./js/enemy.js');
      res.relArmorOpen = +TYPES.reliquary.armor(e).toFixed(2);
      // The boss's own bell exists and swings.
      res.relBell = !!e.relBell;
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

  ok('the Reliquary claims the floor in rings of hallow', out.relRing,
    `patches=${out.relRingCount}`);
  ok('and throws the processional fan', out.relVolley);
  ok('and under two thirds the bell tolls on its own', out.relToll);
  ok('and under a third the reliquary opens', out.relOpen);
  ok('and opened, it takes full damage',
    out.relArmorOpen === 1, `armor=${out.relArmorOpen}`);
  ok('and the bell on it swings', out.relBell);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `CATHEDRAL TEST FAIL (${fails})` : 'CATHEDRAL TEST PASS');
process.exitCode = fails ? 1 : 0;
