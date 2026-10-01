// LUNAR, end to end - the theme where THE FLOOR IS A SUGGESTION.
//
// WHY THIS EXISTS
//   Every LUNAR enemy is about the block's thin air - things arrive by air,
//   leave the floor, or take the player's feet out from under them - and the
//   block itself runs at three-fifths gravity. Each probe asserts the ONE
//   idea as a difference:
//
//     the block    a jump under lunar pull simply hangs longer than a jump
//                  under the standard pull
//     moonhare     bounds rather than runs: the crouch, the airborne arc,
//                  and the thump on the landing
//     lander       fires in PAIRS, and being pressed lights its burn
//     craterback   the slam LAUNCHES a player standing in the ring - and
//                  does nothing vertiginous to one standing clear of it
//     meteorbell   three staggered warned mortars, and their telegraph
//                  handles all come home
//     tidecaller   one ring slides a HELD ally toward the player (and does
//                  not reach a distant one)
//     moonmoth     one dive, three touchdowns, and the line it chose is the
//                  line that collects
//     eclipse      fan volleys, a walking shower, a crossing leap that pops
//                  the landing, a tide that only pays against feet on the
//                  floor - and no marks left behind when it dies mid-ring
import { bootPage, launchBrowser, sleep, startServer } from './harness.mjs';

const PORT = 8284;
const server = startServer(PORT);
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const LUNAR_TYPES = ['moonhare', 'lander', 'craterback', 'meteorbell', 'tidecaller', 'moonmoth'];

try {
  browser = await launchBrowser();
  const { page, errors } = await bootPage(browser, PORT);

  // The block's gravity dial, as pure config - the headless run checks the
  // number before the browser is asked to prove it moves a jump.
  const gravCfg = await page.evaluate(async () => {
    const { waveConfig } = await import('./js/waves.js');
    const { ENEMY_TYPES } = await import('./js/enemy.js');
    const have = (k) => Object.prototype.hasOwnProperty.call(ENEMY_TYPES, k);
    const lunar = waveConfig(7, 99, have, 'lunar');
    const rust = waveConfig(7, 99, have, 'rust');
    return { lunar: lunar.themeGravity, rust: rust.themeGravity, boss: lunar.theme, color: lunar.themeColor };
  });
  ok('a LUNAR wave config carries its own gravity',
    gravCfg.lunar > 0.3 && gravCfg.lunar < 1 && gravCfg.rust === 1,
    `lunar=${gravCfg.lunar} rust=${gravCfg.rust}`);

  const out = await page.evaluate(async (LUNAR_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
    // SECONDS OF GAME, not a count of frames. The loop clamps dt at 0.05, so
    // a frame is worth 1/60s of game on an idle machine and up to 0.05s on a
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
    // py === null leaves the vertical ALONE - the pop and the jump probes need
    // the pin to hold the floor XZ without stapling the player to it.
    let py = 0;
    let pinned = true;
    let god = true;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => {
      origUpdate(...args);
      if (pinned) p.pos.set(px, py === null ? p.pos.y : py, pz);
      if (god) p.health = p.maxHealth;
    };

    const clean = () => {
      // 'active' with a forever-stalled queue: an idle wave boundary would
      // replace g._cfg mid-probe - and any probe poking a field onto the cfg
      // would be measuring a config the game had already thrown away.
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
      py = 0;
      p.health = p.maxHealth;
      p.vel.y = 0;
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
    const marksUsed = () => g.effects.marks.filter((m) => m.used).length;
    const mortars = () => g._mortars.length;

    {
      clean();
      res.emptyCost = await (async () => {
        god = false;
        const h0 = p.health;
        await simSteps(1.3);
        const lost = +(h0 - p.health).toFixed(2);
        god = true;
        return lost;
      })();
      clean();
    }

    // ---- 0. the block's pull, in the loop ---------------------------------
    // The game writes the wave's themeGravity onto the player every frame;
    // the probe writes it onto the LIVE cfg the same way a wave change does,
    // then times a jump from rest against the control case. A jump's hang
    // time goes as 1/gravity, so 0.6 buys about two-thirds more air. Written
    // EVERY step, because the frame below only ever reads the current cfg.
    {
      let gravNow = 1;
      const hangTime = async () => {
        clean();
        pinned = false;
        await steps(10);
        // Settle to the floor first, whatever heights the last probe left.
        p.pos.set(0, 0, 0);
        p.vel.y = 0;
        let air = 0;
        for (let i = 0; i < 50; i++) {
          g._cfg.themeGravity = gravNow;
          g.input.jump = i === 0;
          await step();
          if (p.pos.y > 0.15) air++;
        }
        g.input.jump = false;
        // let the landing finish
        await steps(30);
        pinned = true;
        return air;
      };
      gravNow = 1;
      res.hangFull = await hangTime();
      gravNow = 0.6;
      res.hangLunar = await hangTime();
      gravNow = 1;
      await steps(3);
      res.gravRestored = p.gravityTheme;
      clean();
    }

    // ---- 1. all six survive being alive ---------------------------------
    {
      clean();
      const built = {};
      const subjects = [];
      for (const t of LUNAR_TYPES) {
        const e = put(t, 14, 14);
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

    // ---- 2. the moonhare BOUNDS -------------------------------------------
    // Pinned at the hop's target: the crouch, the airborne arc, the arrival
    // across ground a walk could not have covered, and the thump charging.
    // The crouch is ARMED rather than waited for: hopCd is the organic clock
    // and a loaded host can fold several game frames into one sample, so a
    // tell that is only watched for can be watched straight past. Arming it
    // asks the same question - does the crouch precede the arc - without the
    // race.
    {
      clean();
      const e = put('moonhare', 10, 0);
      await steps(6);
      e.hopCd = 0;
      let sawWind = false;
      let sawAir = false;
      let minDist = 10;
      god = false;
      const h0 = p.health;
      const until = g.time + 7;
      while (g.time < until) {
        await step();
        if (e.hop === 'wind') sawWind = true;
        if (e.jumpTime > 0) sawAir = true;
        minDist = Math.min(minDist, Math.hypot(e.pos.x, e.pos.z));
        if (e.dead) break;
      }
      res.thumpCost = +(h0 - p.health).toFixed(2);
      god = true;
      p.health = p.maxHealth;
      res.hareWind = sawWind;
      res.hareAir = sawAir;
      res.hareClosed = +minDist.toFixed(1);
      clean();
    }

    // ---- 3. the lander's pair, and its burn -------------------------------
    {
      clean();
      const e = put('lander', 15, 0);
      e.speed = 0;
      let peakPair = 0;
      const until = g.time + 7;
      while (g.time < until && peakPair < 2) {
        await step();
        e.pos.set(15, e.pos.y, 0);
        peakPair = Math.max(peakPair, g.projectiles.filter((x) => x.type === 'lander').length);
      }
      res.landerPair = peakPair;
      // Pressed, it burns - probed on a FRESH unit at full speed: the one
      // above had its speed zeroed to hold station for the pair probe, and a
      // burn at zero speed would be a test of the probe, not the lander.
      e.dead = true;
      const e2 = put('lander', 6.5, 0);
      let burnSeen = false;
      let movedFar = 0;
      const startX = e2.pos.x;
      const startZ = e2.pos.z;
      px = 4;
      pz = 0;
      const until2 = g.time + 6;
      while (g.time < until2) {
        await step();
        if (e2.burnT > 0) burnSeen = true;
        movedFar = Math.max(movedFar, Math.hypot(e2.pos.x - startX, e2.pos.z - startZ));
        if (e2.dead) break;
      }
      res.landerBurn = burnSeen;
      res.landerMoved = +movedFar.toFixed(1);
      clean();
    }

    // ---- 4. the moonquake ---------------------------------------------------
    {
      clean();
      // 2.2, deliberately INSIDE the windup's start range: the brink of it
      // would be an assertion about a boundary, and what is under test is the
      // slam.
      const e = put('craterback', 2.2, 0);
      e.speed = 0;
      py = null;              // floor is held, the sky is not
      god = false;
      let peakVy = 0;
      const h0 = p.health;
      const until = g.time + 6;
      while (g.time < until) {
        await step();
        e.pos.set(2.2, e.pos.y, 0);
        peakVy = Math.max(peakVy, p.vel.y);
        if (peakVy > 3) break;
      }
      res.popCost = +(h0 - p.health).toFixed(2);
      god = true;
      p.health = p.maxHealth;
      res.popLaunched = peakVy;
      // ...and the CONTROL: the same slam with the floor held elsewhere does
      // nothing vertical to a player outside the ring.
      const e2alive = !e.dead;
      px = 12;
      pz = 12;
      p.vel.y = 0;
      let peakVyFar = 0;
      const until2 = g.time + 4;
      while (g.time < until2) {
        await step();
        if (e2alive) e.pos.set(2.6, e.pos.y, 0);
        peakVyFar = Math.max(peakVyFar, p.vel.y);
      }
      res.popFar = peakVyFar;
      py = 0;
      clean();
    }

    // ---- 5. the bell's three warned stones, and nothing left over ---------
    {
      clean();
      const bell = put('meteorbell', 13, 0);
      bell.speed = 0;
      const marks0 = marksUsed();
      let peakMortars = 0;
      let tolled = false;
      const until = g.time + 9;
      while (g.time < until) {
        await step();
        bell.pos.set(13, bell.pos.y, 0);
        peakMortars = Math.max(peakMortars, mortars());
        if (peakMortars >= 2) tolled = true;
        if (tolled && mortars() === 0 && g.time > until - 3) break;
      }
      // Give every rock time to land, then count the pool.
      await simSteps(3);
      res.bellMortars = peakMortars;
      res.bellMortarsLeft = mortars();
      res.bellMarksHome = marksUsed() === marks0;
      clean();
    }

    // ---- 6. the tide comes in ---------------------------------------------
    {
      clean();
      const tide = put('tidecaller', 11, 0);
      tide.speed = 0;
      const nearBody = put('chaser', 15, 0);
      nearBody.speed = 0;
      nearBody.attackCd = 999;
      const farBody = put('chaser', 13, 19);
      farBody.speed = 0;
      farBody.attackCd = 999;
      await steps(30);
      const nearBefore = Math.hypot(nearBody.pos.x - px, nearBody.pos.z - pz);
      const farBefore = Math.hypot(farBody.pos.x - px, farBody.pos.z - pz);
      tide.tideCd = 0;
      await simSteps(2.5);
      res.tideNearIn = +(nearBefore - Math.hypot(nearBody.pos.x - px, nearBody.pos.z - pz)).toFixed(2);
      res.tideFarStill = +(farBefore - Math.hypot(farBody.pos.x - px, farBody.pos.z - pz)).toFixed(2);
      clean();
    }

    // ---- 7. the moth skips -------------------------------------------------
    {
      clean();
      const e = put('moonmoth', 10, 0);
      let sawSkip = false;
      let troughs = 0;
      let lastLow = false;
      god = false;
      const h0 = p.health;
      const until = g.time + 9;
      while (g.time < until) {
        await step();
        if (e.mothState === 'skip') sawSkip = true;
        // Count separate low passes over the deck rather than low FRAMES -
        // a skim held close to the floor reads as one touchdown otherwise.
        const low = e.pos.y < 1.0;
        if (e.mothState === 'skip' && low && !lastLow) troughs++;
        lastLow = low;
        if (e.dead) break;
      }
      res.mothSkip = sawSkip;
      res.mothTroughs = troughs;
      res.mothCost = +(h0 - p.health).toFixed(2);
      god = true;
      p.health = p.maxHealth;
      clean();
    }

    // ---- 8. ECLIPSE ---------------------------------------------------------
    // Driven on the same pinned rig as the roster probes, but with the boss's
    // own state machine provoked one cast at a time: the probes silence every
    // other cooldown and drop the think timer, so what fires is the cast
    // under test and nothing else.
    {
      clean();
      const boss = put('eclipse', 10, 10);
      await simSteps(0.3);      // one ai tick initialises bs before tests write it
      res.bossBuilt = !!(boss.group && boss.coronaG && boss.coronaG.children.length === 14);
      const silence = (except) => {
        boss.bs.cdFan = except === 'fan' ? 0 : 999;
        boss.bs.cdRain = except === 'rain' ? 0 : 999;
        boss.bs.cdFall = except === 'fall' ? 0 : 999;
        boss.bs.cdTide = except === 'tide' ? 0 : 999;
        boss.bs.t = 0;
      };
      const toProwl = () => {
        if (boss.bs.state !== 'prowl' && boss.bs.state !== 'recover') return;
        boss.bs.state = 'prowl';
        boss.bs.t = 0;
      };

      // THE FAN: a tell, then crescent rounds - two volleys of seven.
      silence('fan');
      toProwl();
      let fanPeak = 0;
      let fanTelled = false;
      let untilB = g.time + 6;
      while (g.time < untilB) {
        await step();
        if (boss.bs.state === 'fanTell') fanTelled = true;
        fanPeak = Math.max(fanPeak, g.projectiles.filter((x) => x.type === 'eclipse').length);
        if (fanPeak >= 7) break;
      }
      res.bossFanTell = fanTelled;
      res.bossFanPeak = fanPeak;
      // The volley's own life (4s) and the two probes below outlast it; left
      // to expire through the ordinary update rather than dropped by hand,
      // so no mesh is ever stranded off the array.
      await simSteps(4.5);

      // THE SHOWER: the volley walks - warned circles arrive staggered and
      // their marks come home.
      boss.pos.set(12, boss.pos.y, 10);
      px = 0; pz = 0;
      silence('rain');
      toProwl();
      let rainPeak = 0;
      untilB = g.time + 7;
      while (g.time < untilB) {
        await step();
        rainPeak = Math.max(rainPeak, mortars());
        if (rainPeak >= 3) break;
      }
      await simSteps(3.5);
      res.bossRain = rainPeak;
      res.bossRainHome = mortars() === 0 && marksUsed() <= 1;

      // THE LEAP: marked, airborne, crossing the room, and the landing throws
      // whoever the mark was for. Tried across a few bearings rather than
      // one: the arena is generated, and a layout that happens to put cover
      // on one line makes the boss refuse THAT line - a refused leap is the
      // mechanic working, so the probe walks around the room instead of
      // asserting on one roll of the terrain.
      let fallMarked = false;
      let fellAir = false;
      let peakVy = 0;
      let startD = 0;
      const spots = [[5, 5], [-7, 1], [2, -8]];
      god = false;
      const h1 = p.health;
      for (const [sx, sz2] of spots) {
        boss.pos.set(-sx * 1.2, 0, -sz2 * 1.2);
        px = sx; pz = sz2;
        py = null;
        silence('fall');
        toProwl();
        startD = Math.hypot(boss.pos.x - px, boss.pos.z - pz);
        fellAir = false;
        peakVy = 0;
        const untilFall = g.time + 5.5;
        while (g.time < untilFall) {
          await step();
          if (boss.bs.state === 'fallTell' && marksUsed() > 0) fallMarked = true;
          // STATE-GATED, not jumpTime-gated: the boss takes ordinary nav
          // jumps while it prowls - over crates, the same as every walker -
          // and jumpTime alone cannot tell the moonfall from one of those.
          // Only 'fallAir' is the leap, and only it knows where it is going.
          if (boss.jumpTime > 0 && boss.bs.state === 'fallAir') {
            fellAir = true;
            // RIDE THE MARK. The boss falls back to a higher arc or a half
            // crossing when the generated layout refuses the full one, so
            // the only layout-independent way to assert the landing is to
            // read the spot it actually committed to and stand the player
            // on it: the mark is the contract, and the probe holds it there.
            if (typeof boss.bs.landX === 'number' && (px !== boss.bs.landX || pz !== boss.bs.landZ)) {
              px = boss.bs.landX;
              pz = boss.bs.landZ;
            }
          }
          peakVy = Math.max(peakVy, p.vel.y);
          if (fellAir && boss.jumpTime <= 0 && boss.bs.state === 'recover') break;
          if (boss.dead) break;
        }
        if (fellAir || boss.dead) break;
      }
      // Read the cost BEFORE the rig heals the player, or it reads the heal.
      res.fallCost = +(h1 - p.health).toFixed(2);
      god = true;
      p.health = p.maxHealth;
      res.fallMarked = fallMarked;
      res.fallAir = fellAir;
      res.fallMoved = +(startD - Math.hypot(boss.pos.x - px, boss.pos.z - pz)).toFixed(1);
      res.fallPop = +peakVy.toFixed(1);
      py = 0;

      // THE TIDE: the two-second drag, then the ring that only pays against
      // feet on the floor.
      boss.pos.set(4.6, 0, 0);
      px = 0; pz = 0;
      silence('tide');
      toProwl();
      let tideSeen = false;
      god = false;
      let h2 = p.health;
      untilB = g.time + 6;
      while (g.time < untilB) {
        await step();
        if (boss.bs.state === 'tide') tideSeen = true;
        if (tideSeen && boss.bs.state !== 'tide') break;
      }
      res.tideSeen = tideSeen;
      res.tideGroundCost = +(h2 - p.health).toFixed(2);
      god = true;
      p.health = p.maxHealth;

      // ...and the same ring with the player held OFF it.
      py = 1.4;
      silence('tide');
      toProwl();
      god = false;
      h2 = p.health;
      untilB = g.time + 6;
      while (g.time < untilB) {
        await step();
        if (boss.bs.state === 'tide' && boss.bs.t <= 0) break;
        if (boss.bs.state !== 'tide' && g.time > untilB - 4) break;
      }
      await steps(10);
      res.tideAirCost = +(h2 - p.health).toFixed(2);
      god = true;
      p.health = p.maxHealth;
      py = 0;

      // DEATH MID-RING: the pool must come back with it.
      silence('tide');
      toProwl();
      untilB = g.time + 3;
      while (g.time < untilB && boss.bs.state !== 'tide') await step();
      const heldAtDeath = boss.bs.state === 'tide';
      boss.takeDamage(1e9);
      await simSteps(1.2);
      res.eclipseHeldCast = heldAtDeath;
      res.eclipseMarksHome = marksUsed() === 0;
      clean();
    }

    await steps(30);
    return res;
  }, LUNAR_TYPES);

  ok('an empty arena costs nothing', out.emptyCost === 0, `lost=${out.emptyCost}`);
  ok('lunar air hangs a jump well past the standard pull',
    out.hangLunar > out.hangFull * 1.25,
    `airFrames full=${out.hangFull} lunar=${out.hangLunar}`);

  ok('every LUNAR type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('the moonhare crouches, leaps off the floor, crosses ground and lands for the thump',
    out.hareWind && out.hareAir && out.hareClosed < 5 && out.thumpCost > 0,
    `wind=${out.hareWind} air=${out.hareAir} minDist=${out.hareClosed} thump=${out.thumpCost}`);

  ok('the lander fires in pairs', out.landerPair >= 2, `in the air at once=${out.landerPair}`);
  ok('and pressing it lights the burn',
    out.landerBurn && out.landerMoved > 1.5, `burn=${out.landerBurn} moved=${out.landerMoved}`);

  ok('the craterback slam launches a player standing in the ring',
    out.popLaunched > 3, `peakVel.y=${out.popLaunched}`);
  ok('and the same slam does nothing vertical outside the ring',
    out.popFar < 1, `far peakVel.y=${out.popFar}`);

  ok("the bell's toll becomes staggered warned stones",
    out.bellMortars >= 2, `in the air at once=${out.bellMortars}`);
  ok('and every stone lands and every mark comes home',
    out.bellMortarsLeft === 0 && out.bellMarksHome, `left=${out.bellMortarsLeft}`);

  ok("the tidecaller's ring slides a nearby ally toward the player",
    out.tideNearIn > 1.2, `closed=${out.tideNearIn}m`);
  ok('and does not reach an ally outside the ring',
    Math.abs(out.tideFarStill) < 0.5, `far=${out.tideFarStill}m`);

  ok('the moonmoth skips down its line three times, and the line collects',
    out.mothSkip && out.mothTroughs >= 2 && out.mothCost > 0,
    `skip=${out.mothSkip} troughs=${out.mothTroughs} cost=${out.mothCost}`);

  ok('eclipse builds with its full corona', out.bossBuilt);
  ok('the corona fan winds up then fills the air',
    out.bossFanTell && out.bossFanPeak >= 7, `tell=${out.bossFanTell} in the air=${out.bossFanPeak}`);
  ok('the meteor shower walks and its marks come home',
    out.bossRain >= 3 && out.bossRainHome, `mortars=${out.bossRain} home=${out.bossRainHome}`);
  ok('moonfall marks ground, crosses the room, and its landing throws the marked player',
    out.fallMarked && out.fallAir && out.fallMoved > 4 && out.fallPop > 3 && out.fallCost > 0,
    `marked=${out.fallMarked} air=${out.fallAir} closed=${out.fallMoved} pop=${out.fallPop} cost=${out.fallCost}`);
  ok('the tide pays a player with feet on the floor',
    out.tideSeen && out.tideGroundCost > 0, `cost=${out.tideGroundCost}`);
  ok('and not one held off it',
    out.tideAirCost === 0, `cost=${out.tideAirCost}`);
  ok('a boss killed mid-tide hands its mark back',
    out.eclipseHeldCast && out.eclipseMarksHome);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `LUNAR TEST FAIL (${fails})` : 'LUNAR TEST PASS');
process.exitCode = fails ? 1 : 0;
