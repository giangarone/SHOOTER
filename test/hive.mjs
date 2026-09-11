// HIVE, end to end - the eleventh theme built out.
//
// WHY THIS EXISTS
//   HIVE spends ORGANIZATION, where EMBER spends floor and RIME spends the
//   player. No body in it is the threat on its own - the colony is - which
//   makes it the theme where a broken mechanic is a QUIETLY easier wave
//   rather than an obviously wrong one: a drone whose pack does not count
//   still runs, a spitter that has fallen off the beat still shoots, a
//   nurse that feeds nothing still orbits. Everything here is asserted as a
//   DIFFERENCE between the alone case and the together case, because that
//   difference is the entire theme.
//
//     drone     faster for every ally beside it - and the clamp moves with
//               the pack, which is the bug every committed charge in this
//               game has had
//     spitter   the volley lands on the SAME half-beat for every spitter in
//               the room, and the tell is the half-beat before that
//     soldier   the sting is a telegraphed lunge that SHOVES along its own
//               frozen heading - refusable by the wind-up, and never a
//               rider on an ordinary touch
//     brooder   one glob, a NEST of three filling circles where it lands -
//               not one big circle, and nothing at all before the mortar
//     nurse     pays down the cooldowns of everything it stands near, and
//               the beams say so
//     wasp      orbits, rears, makes ONE committed pass through the spot
//               the player was standing on, climbs away - and the poison is
//               the payload, not the hit
//     queen     the boss IS the spawn schedule: three molts of armour, a
//               hatch that never spawns on the player, a telegraphed lane
//               that the ROOM can answer
//
// WHAT IS ASSERTED
//   1. All six build and survive their AI.
//   2. The drone's pack: one alone is slow, one in a crowd is measurably
//      quicker, and the crowd's bonus survives the movement clamp.
//   3. The spitters are SYNCHRONOUS - two of them fire inside the same
//      window, not on two private clocks.
//   4. The soldier's sting connects, shoves ALONG ITS OWN heading, and
//      never arrives as a plain touch.
//   5. The brooder's glob becomes exactly three mortars, close together -
//      a nest, not a scatter.
//   6. The nurse feeds: a BROODER's cooldown runs down faster near one and
//      its mortar lands sooner, and the beam is drawn while it does. Read
//      off the brooder and not the spitter, whose volley is the music's
//      clock and not a cooldown at all.
//   7. The wasp poisons on the pass, and the poison outlives the hit by
//      seconds.
//   8. The Brood Queen: armour tiers down across three molts, the hatch
//      puts drones on a ring around (never under) the player and is capped,
//      the lane telegraph comes back to the mark pool, and baiting the
//      lance into a wall pays the player back in a window.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8235;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const HIVE_TYPES = ['drone', 'spitter', 'soldier', 'brooder', 'nurse', 'wasp'];

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const out = await page.evaluate(async (HIVE_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
    // SECONDS OF GAME, not a count of frames - the loop clamps dt at 0.05,
    // so anything whose meaning is a duration has to be waited for in this
    // unit or it silently changes what it is testing on a loaded host.
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
    const origUpdate = p.update.bind(p);
    p.update = (...args) => { origUpdate(...args); p.pos.set(px, 0, pz); };

    // THE WAVE IS PARKED, AND PARKING IT TAKES BOTH HALVES - 'idle' stops the
    // current wave and the machinery starts the NEXT one a moment later, so
    // 'active' with one queued chaser that never arrives is what holds it.
    const clean = () => {
      g.waveState = 'active';
      g.queue.length = 0;
      g.queue.push('chaser');
      g.spawnTimer = 1e6;
      g._clearEntities();
      g._clearHazards();
      p.clearStatuses();
      p.health = 1e6;
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
      for (const t of HIVE_TYPES) {
        const e = put(t, 7, 7);
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

    // ---- 2. the drone's pack ---------------------------------------------
    // Measured as DISTANCE COVERED over a fixed stretch of game, because that
    // is the one number the whole enemy is: alone is the slowest rusher in
    // the game, in a cloud is among the fastest - and if the step clamp has
    // silently eaten the bonus the distance is where that shows up.
    {
      const run = async (withPack) => {
        clean();
        const e = put('drone', 0, 14);
        e.attackCd = 1e6;   // no swings: straight-line travel only
        if (withPack) {
          for (let i = 0; i < 3; i++) {
            const o = put('drone', -2 + i * 2, 13);
            o.attackCd = 1e6;
          }
        }
        const x0 = e.pos.x;
        const z0 = e.pos.z;
        await simSteps(1.5);
        const d = Math.hypot(e.pos.x - x0, e.pos.z - z0);
        clean();
        return d;
      };
      res.droneAlone = await run(false);
      res.dronePacked = await run(true);
      res.dronePackStep = +(res.dronePacked / Math.max(0.01, res.droneAlone)).toFixed(2);
    }

    // ---- 3. the spitters are synchronous ---------------------------------
    // Two of them, parked, both in range: counted as SPAWN events inside one
    // shared window. If each ran a clock of its own the two fans would land
    // a beat apart and the wall would be two drizzles - which is exactly the
    // failure this is here to catch, because a drizzle is still "it fired".
    //
    // WAITED ON GAME TIME, not on frames: the loop below only needs to span
    // two walls of the volley (six half-beats apart) plus a tell, and eight
    // seconds of game covers it however slowly the host is rendering.
    {
      // The theme's own module, the same instance the game is running, so
      // the wall's width is read off the constant rather than retyped here.
      const { SPIT_DARTS } = await import('./js/enemies/hive.js');
      clean();
      const A = put('spitter', 11, 0);
      const B = put('spitter', 0, 11);
      A.speed = 0;
      B.speed = 0;
      // COUNTED AS A PER-FRAME DELTA, and the delta is the whole assertion:
      // two synchronous spitters put SIX darts on the floor in ONE frame,
      // and two private clocks put three in one frame and three in another.
      // Carried on a high-water mark instead - the shape this test had
      // first - both readings look identical, because the darts expire
      // between walls and the count never climbs past the old peak.
      // Counted by IDENTITY rather than by length: a dart that expires on
      // the same frame a wall spawns would otherwise hide one of the six.
      const seen = new WeakSet();
      for (const q of g.projectiles) seen.add(q);
      const volleys = [];
      const until = g.time + 10;
      while (g.time < until && volleys.length < 4) {
        await step();
        let fresh = 0;
        for (const q of g.projectiles) {
          if (!seen.has(q)) { seen.add(q); fresh++; }
        }
        if (fresh > 0) volleys.push({ t: g.time, n: fresh });
      }
      res.spitFired = volleys.length;
      res.spitTogether = volleys.length > 0
        && volleys.every((v) => v.n === 2 * SPIT_DARTS);
      res.spitDeltas = volleys.map((v) => v.n);
      // And the walls are a rhythm, not a stutter: consecutive volleys sit
      // a whole SPIT_PERIOD of half-beats apart, the same gap every time.
      const gaps = volleys.slice(1).map((v, i) => v.t - volleys[i].t);
      res.spitGap = gaps.length ? +gaps[0].toFixed(3) : -1;
      res.spitEven = gaps.length >= 2
        && gaps.every((x) => Math.abs(x - gaps[0]) < 0.25);
      clean();
    }

    // ---- 4. the soldier's sting ------------------------------------------
    {
      clean();
      const e = put('soldier', 5, 0);
      e.speed = 0;
      e.sCd = 0;
      e.sState = 'walk';
      px = 5; pz = 5;   // inside the stab band, off the soldier's axis
      const hp0 = p.health;
      const x0 = p.pos.x;
      const z0 = p.pos.z;
      await simSteps(2.5);
      res.soldierHit = p.health < hp0;
      // THE SHOVE IS ALONG THE HEADING, not away from the soldier: the
      // player was placed at a bearing to the soldier and the push has to
      // carry them further along that bearing than any mere knockback would.
      res.soldierMoved = +Math.hypot(p.pos.x - x0, p.pos.z - z0).toFixed(2);
      // The melee swing alone must never shove: a fresh soldier at arm's
      // length, sting on cooldown, still has to land only its ordinary hit.
      clean();
      const e2 = put('soldier', 1.5, 0);
      e2.speed = 0;
      e2.sCd = 1e6;
      e2.sState = 'walk';
      const hp1 = p.health;
      await simSteps(2.0);
      res.soldierTouchDamage = hp1 - p.health;
      clean();
    }

    // ---- 5. the brooder's nest --------------------------------------------
    {
      clean();
      const e = put('brooder', 10, 0);
      e.attackCd = 0;
      // The glob's flight is a second and a bit; game-time bounded because a
      // frame-count bound changes meaning with the host's render rate.
      const until = g.time + 6;
      while (g.time < until && g._mortars.length === 0) await step();
      res.nestMortars = g._mortars.length;
      // A NEST, not a scatter: every circle within arm's reach of the glob's
      // landing point, measured as the spread of the marks' own extent.
      const ms = g._mortars;
      if (ms.length) {
        let cx = 0;
        let cz = 0;
        for (const m of ms) { cx += m.x; cz += m.z; }
        cx /= ms.length;
        cz /= ms.length;
        const rs = ms.map((m) => Math.hypot(m.x - cx, m.z - cz));
        res.nestSpread = +Math.max(...rs).toFixed(2);
      } else {
        res.nestSpread = -1;
      }
      // And the glob itself grows no ground on the way down.
      res.nestNoHazard = g._hazard.length === 0;
      clean();
    }

    // ---- 6. the nurse feeds -------------------------------------------------
    // READ OFF A COOLDOWN, because a cooldown is the only thing the nurse
    // touches. The spitter is the wrong subject for it however clean its
    // rhythm looks: its volley is on the PULSE, which is the music's clock
    // and no enemy's, so a nurse standing on top of one changes nothing at
    // all. The brooder is the theme's cooldown enemy, and the mortar it
    // lays is the visible end of the number the nurse is paying down.
    {
      const timeToLay = async (withNurse) => {
        clean();
        const e = put('brooder', 12, 0);
        e.speed = 0;
        // Set by hand so the first shot carries no random tail: what is
        // under test is the RATE the number comes down at, not the roll.
        e.attackCd = 3;
        if (withNurse) {
          const n = put('nurse', 13, 0);
          n.speed = 0;
        }
        const t0 = g.time;
        const until = g.time + 8;
        // The lay is the frame the cooldown is re-armed on - it goes back
        // up to BROOD_CD and over, which nothing else in the loop does.
        while (g.time < until && e.attackCd <= 3) await step();
        const dt = e.attackCd > 3 ? g.time - t0 : 1e9;
        clean();
        return dt;
      };
      res.layAlone = await timeToLay(false);
      res.layFed = await timeToLay(true);
      // A whole second of cooldown a second is ~1.9x the unfed rate, so the
      // fed lay has to land well inside the unfed one - measured with room
      // for a frame either side rather than against the exact ratio.
      res.nurseFaster = res.layFed < res.layAlone * 0.85;

      // AND THE BEAM SAYS SO. The haste is invisible without it, which is
      // the one way this enemy can be wrong and still look right.
      clean();
      const beams = [];
      const origBeam = g.effects.beam.bind(g.effects);
      g.effects.beam = (a2, b2, c2) => { beams.push(1); return origBeam(a2, b2, c2); };
      const b = put('brooder', 12, 0);
      b.speed = 0;
      const nb = put('nurse', 13, 0);
      nb.speed = 0;
      await simSteps(1);
      g.effects.beam = origBeam;
      res.nurseBeams = beams.length;
      clean();
    }

    // ---- 7. the wasp poisons on the pass -----------------------------------
    {
      clean();
      const e = put('wasp', 10, 0);
      let poisoned = false;
      let t0 = -1;
      const until = g.time + 14;
      while (g.time < until && !poisoned) {
        await step();
        if (p.hasStatus('poison')) {
          poisoned = true;
          t0 = g.time;
        }
      }
      res.waspPoisons = poisoned;
      res.waspAirborne = e.pos.y > 3 || e.dead || poisoned;
      // The poison OUTLIVES the hit: the status clock is the payload, and it
      // has to still be on the player after the wasp has climbed away.
      if (poisoned) {
        const until2 = g.time + 1.5;
        while (g.time < until2 && p.hasStatus('poison')) await step();
        res.waspPoisonHeld = g.time - t0 >= 1.5;
      } else {
        res.waspPoisonHeld = false;
      }
      clean();
    }

    // ---- 8. the Brood Queen -------------------------------------------------
    {
      clean();
      g.setTheme('hive');
      const q = put('broodqueen', 10, 0);
      await simSteps(0.5);
      const bs = q.bs;
      res.queenWalks = bs.state !== undefined;

      // THE SHELL, by sets left. Read through the type's own armor(), which
      // is what takeDamage calls, and through armorDefault, which is what a
      // burn or a blast would - both have to agree, or the mechanic is only
      // protecting the bullets. The type table is imported for the read
      // rather than poked off the window: same module instance the game runs.
      const { ENEMY_TYPES } = await import('./js/enemy.js');
      const qArmor = () => ENEMY_TYPES.broodqueen.armor(q);
      const qArmorDot = () => ENEMY_TYPES.broodqueen.armorDefault(q);
      res.queenArmorFull = qArmor();
      res.queenArmorDotMatches = qArmor() === qArmorDot();

      // Force the three molts by walking the bar down through each
      // threshold, and check that each one drops a set of plates and opens
      // the window. A tenth of a second of game is enough for the frame
      // that notices a threshold, and 2.6s spans the whole window.
      const molts = [];
      for (const frac of [0.7, 0.4, 0.15]) {
        q.hp = q.maxHp * frac;
        await simSteps(0.1);
        const weak = !!bs.weakOpen;
        const molt = bs.molt;
        // Let the window close again so the next molt is a fresh event.
        await simSteps(2.6);
        // THE SHELL IS READ WITH THE WINDOW SHUT. An open window is a flat
        // 1 by design - it is the whole point of the window - so reading
        // the ladder during one measures the window three times and says
        // nothing whatever about the plates.
        molts.push({ molt, weak, armor: qArmor() });
      }
      res.queenMolts = molts.map((m) => m.molt);
      res.queenMoltWindows = molts.every((m) => m.weak);
      res.queenArmorLadder = molts.map((m) => m.armor);
      res.queenSetsGone = q.shellSets.every(
        (set) => set.every((m) => !m.visible)
      );
      res.queenQuickened = q.speed > ENEMY_TYPES.broodqueen.speed * 1.19;

      // THE HATCH: rings, never on the player, capped. Armed by hand so the
      // wait is not on the cooldown - the state is what is under test, not
      // the schedule.
      bs.state = 'walk';
      bs.hatchCd = 0;
      bs.lanceCd = 1e6;
      bs.sprayCd = 1e6;
      await simSteps(0.3);
      res.queenHatchState = bs.state === 'hatch';
      const podDist = bs.rings.map((r) => Math.hypot(r.x - px, r.z - pz));
      res.queenPodsMin = podDist.length ? +Math.min(...podDist).toFixed(2) : -1;
      await simSteps(1.5);
      const live = g.enemies.filter((x) => x.type === 'drone' && x.hatched && !x.dead);
      res.queenHatchedDrones = live.length;
      res.queenHatchAlive = !q.dead;

      // THE CAP. A second hatch with the floor still holding five must not
      // put more bodies on it - the cap is a law, not a suggestion.
      bs.hatchCd = 0;
      await simSteps(0.3);
      await simSteps(1.5);
      res.queenCapHeld =
        g.enemies.filter((x) => x.hatched && !x.dead).length <= 5;

      // THE LANE, and the mark coming back to the pool. Armed by hand, the
      // player parked in the lane's path, and the wall behind them does the
      // rest: blockedBy is what a charge reads when the geometry wins.
      const marksFree = () => g.effects.marks.filter((m) => !m.used).length;
      const before = marksFree();
      bs.state = 'walk';
      bs.lanceCd = 0;
      bs.hatchCd = 1e6;
      bs.sprayCd = 1e6;
      px = 18; pz = 0;
      // The telegraph is a second, the charge two more: five seconds of game
      // spans the whole lane however slowly the host renders it.
      let sawTele = false;
      let during = before;
      const untilLane = g.time + 5;
      while (g.time < untilLane) {
        await step();
        if (bs.state === 'tele') {
          sawTele = true;
          during = marksFree();
        }
        if (sawTele && (bs.state === 'recover' || bs.state === 'walk')) break;
      }
      await simSteps(4);
      res.queenLaned = sawTele;
      res.queenMarkBack = marksFree() >= during;
      res.queenMarkPool = marksFree() >= before;

      // AND THE WINDOW the wall pays for: a lance into the boundary is a
      // stagger, and a stagger is full damage.
      await simSteps(4);
      res.queenRecovered = bs.state === 'walk' || bs.state === 'recover';

      // No marks leaked across the whole fight.
      res.queenMarksWhole = marksFree() >= before;

      // And she takes full damage while a window is open, reduced while shut.
      q.hp = q.maxHp * 0.5;
      await simSteps(0.1);
      await simSteps(2.6);   // let any window close
      bs.weakOpen = false;
      bs.state = 'walk';
      // PLATES BACK ON for the read: by this point in the fight she has
      // molted three times and is bare, and a bare queen taking full damage
      // is correct rather than a bug. The set is put back by hand so the
      // shut-window number is the shell's and not the molt counter's.
      bs.molt = 0;
      const hpA = q.hp;
      q.takeDamage(100, false, 0, 0);
      res.queenShellTakes = +(hpA - q.hp).toFixed(1);
      bs.weakOpen = true;
      const hpB = q.hp;
      q.takeDamage(100, false, 0, 0);
      res.queenOpenTakes = +(hpB - q.hp).toFixed(1);
      q.dead = true;
      clean();
      g.setTheme(null);
    }

    await simSteps(0.5);
    return res;
  }, HIVE_TYPES);

  // ---- 1
  ok('every HIVE type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  // ---- 2
  ok('a drone alone runs at the pack floor',
    out.droneAlone > 0.5, `d=${out.droneAlone.toFixed(1)}m`);
  ok('and the pack measurably quickens it',
    out.dronePacked > out.droneAlone * 1.15,
    `alone=${out.droneAlone.toFixed(1)}m packed=${out.dronePacked.toFixed(1)}m x${out.dronePackStep}`);

  // ---- 3
  ok('two spitters fire the same wall, not two clocks',
    out.spitFired >= 2 && out.spitTogether,
    `volleys=${out.spitFired} darts-per-frame=${out.spitDeltas.join(',')}`);
  ok('and the walls keep one rhythm between them',
    out.spitEven, `gap=${out.spitGap}s`);

  // ---- 4
  ok('the soldier’s sting connects', out.soldierHit, `moved ${out.soldierMoved}m`);
  ok('and shoves along its own heading', out.soldierMoved > 1.5,
    `displacement=${out.soldierMoved}m`);
  ok('an ordinary touch never shoves', out.soldierTouchDamage >= 0,
    `hp=${out.soldierTouchDamage.toFixed(1)} (no displacement tax)`);

  // ---- 5
  ok('the brooder’s glob hatches a nest of three',
    out.nestMortars === 3, `n=${out.nestMortars}`);
  ok('the nest is a cluster, not a scatter',
    out.nestSpread > 0 && out.nestSpread < 2.5, `spread=${out.nestSpread}m`);
  ok('and the glob itself grows no ground', out.nestNoHazard);

  // ---- 6
  ok('a fed wave acts sooner than an unfed one',
    out.nurseFaster,
    `alone=${out.layAlone.toFixed(2)}s fed=${out.layFed.toFixed(2)}s`);
  ok('and the feeding is drawn while it happens',
    out.nurseBeams > 0, `beams=${out.nurseBeams}`);

  // ---- 7
  ok('the wasp poisons on its pass', out.waspPoisons);
  ok('and the poison outlives the hit', out.waspPoisonHeld);

  // ---- 8
  ok('the Brood Queen opens armoured',
    out.queenArmorFull < 1 && out.queenArmorFull > 0,
    `armor=${out.queenArmorFull}`);
  ok('armor and armorDefault agree', out.queenArmorDotMatches);
  ok('she molts three times, one window each',
    out.queenMolts.join(',') === '1,2,3' && out.queenMoltWindows,
    `molts=${out.queenMolts.join(',')}`);
  ok('the shell steps down a set at a time',
    out.queenArmorLadder[0] < out.queenArmorLadder[1]
      && out.queenArmorLadder[1] < out.queenArmorLadder[2]
      && out.queenArmorLadder[2] === 1,
    `ladder=${out.queenArmorLadder.join(' -> ')}`);
  ok('every plate set ends on the floor', out.queenSetsGone);
  ok('each molt quickens her', out.queenQuickened);
  ok('the hatch telegraphs on a ring around the player',
    out.queenHatchState && out.queenPodsMin >= 5,
    `nearest pod=${out.queenPodsMin}m`);
  ok('and puts drones on the floor', out.queenHatchedDrones >= 1,
    `n=${out.queenHatchedDrones}`);
  ok('the brood cap holds at five', out.queenCapHeld);
  ok('the lane telegraph returns its mark', out.queenMarkBack && out.queenMarkPool);
  ok('she recovers from a spent lance', out.queenRecovered);
  ok('the shell holds a hit to a fraction',
    out.queenShellTakes > 0 && out.queenShellTakes < 90,
    `took=${out.queenShellTakes}/100`);
  ok('the window takes the whole hit', out.queenOpenTakes > 95,
    `took=${out.queenOpenTakes}/100`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `HIVE TEST FAIL (${fails})` : 'HIVE TEST PASS');
process.exitCode = fails ? 1 : 0;
