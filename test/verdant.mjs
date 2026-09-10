// VERDANT, end to end - the third theme built out.
//
// WHY THIS EXISTS
//   EMBER spends the floor, RIME spends the player, and VERDANT spends TIME:
//   nothing in it happens at the moment it is thrown. A seed lands and is
//   harmless for two seconds. A charge commits and cannot be called back. A
//   cloud outlives the thing that made it. A wound closes back up behind you.
//
//   Which makes it the theme where a broken mechanic looks most like the game
//   working correctly. A seed that never sprouts is a gunner that missed. A
//   heartwood that heals nothing is a support standing quietly at the back.
//   Neither throws, neither logs, and neither would fail any other suite.
//
//     thornling   freezes a heading at the end of a tell and cannot steer -
//                 the ashwing's contract on the ground, and easy to collapse
//                 into an ordinary chaser by accident
//     sporegun    a Spit of a FIFTH kind, and the only one that grows no
//                 ground at all: it becomes a MORTAR, through a hook the
//                 projectile context did not have until this theme
//     bramblehide damage from PROXIMITY rather than from an attack - nothing
//                 else in the game hurts the player without swinging
//     heartwood   the only enemy that gives health back, which is the one
//                 effect a player cannot see happening to them
//     mothcap     the only LOW flier, trailing a cloud that outlives it
//     overgrowth  a boss that never moves, whose damage window is opened by
//                 the PLAYER's position rather than by any clock of its own
//
// WHAT IS ASSERTED
//   1. All six build and survive their AI.
//   2. A thornling commits to a straight charge and cannot steer during it.
//   3. A seed lands harmless and sprouts a telegraphed mortar seconds later.
//   4. Standing next to a bramblehide costs health without it swinging.
//   5. A heartwood heals a hurt neighbour, and stops when it dies.
//   6. A mothcap flies low and leaves a cloud that outlives it.
//   7. The Overgrowth never moves, opens only when the player is close, and
//      answers range with a creeper.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8224;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const VERDANT_TYPES = ['thornling', 'sporegun', 'bramblehide', 'blight', 'heartwood', 'mothcap'];

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const out = await page.evaluate(async (VERDANT_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const TYPES = (await import('./js/enemy.js')).ENEMY_TYPES;
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
    // What a creeper is supposed to lay, mirrored from OG_CREEP_N in enemy.js.
    const OG_CREEP_N_EXPECTED = 5;

    g.autoTest = false;
    g.input.shoot = false;
    g.input.shootFresh = false;
    let px = 0;
    let pz = 0;
    // HEALTH IS TOPPED UP, NOT INFLATED. The obvious way to keep a test
    // subject alive is to give it a million hit points - and it does not work
    // here, because health ABOVE maximum is overheal and the game bleeds it
    // off on purpose (a health pickup is allowed to overshoot). Setting
    // maxHealth to match does not help either: rebuildMods() puts it back.
    //
    // So the player quietly loses about ten a second in a completely empty
    // arena, which is invisible to a test asking "did it hurt me" and fatal to
    // one asking "did it hurt me AT ALL". `god` refills to the real maximum
    // every frame instead, and is switched off only inside the windows where
    // damage is actually being measured. The control check below is what
    // proves the arena is quiet before anything is put in it.
    let god = true;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => {
      origUpdate(...args);
      p.pos.set(px, 0, pz);
      if (god) p.health = p.maxHealth;
    };
    // Runs a window with the refill off, so the only health lost is the
    // health the thing under test took.
    // SECONDS, not frames. This returns HEALTH LOST OVER A WINDOW, and a
    // window counted in frames is up to three times longer on a loaded host -
    // so every number it produces scales with the machine rather than with the
    // thing under test.
    const measure = async (seconds, fn) => {
      god = false;
      p.health = p.maxHealth;
      const before = p.health;
      if (fn) fn();
      await simSteps(seconds);
      const lost = before - p.health;
      god = true;
      return +lost.toFixed(2);
    };

    const clean = () => {
      // THE WAVE IS PARKED, AND PARKING IT TAKES BOTH HALVES.
      //
      // 'idle' stops the current wave, and then the machinery starts the NEXT
      // one a moment later - which in a themed game means six fresh
      // specialists of whatever theme was dealt, spawning into the middle of a
      // measurement. That is not hypothetical: it is what made a bramblehide
      // sixteen metres away appear to deal damage, when what had actually
      // happened was a sporegun wandering in and sprouting a seed underfoot.
      //
      // 'active' with one enemy in the queue that never arrives is what
      // actually holds it: the wave cannot complete (an empty queue and no
      // enemies would complete it, and completing clears every zone in the
      // arena), and it cannot spawn either.
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
    const kinds = (k) => g._hazard.filter((h) => h.kind === k);

    // ---- 0. control: does an EMPTY arena cost the player health? --------
    {
      clean();
      res.idleLoss = await measure(2);
      res.idleMax = p.maxHealth;
      clean();
    }

    // ---- 1. all six survive being alive ---------------------------------
    {
      clean();
      const built = {};
      const subjects = [];
      for (const t of VERDANT_TYPES) {
        const e = put(t, 8, 8);
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

    // ---- 2. the thornling's charge --------------------------------------
    {
      clean();
      const e = put('thornling', 12, 0);
      let ran = false;
      let heading = null;
      let drift = 0;
      let telled = false;
      for (let i = 0; i < 1600; i++) {
        await step();
        const tl = e.tl;
        if (!tl) continue;
        if (tl.state === 'tell') telled = true;
        if (tl.state === 'run') {
          if (!heading) {
            heading = { x: tl.hx, z: tl.hz };
            ran = true;
          } else {
            drift = Math.max(drift, Math.abs(tl.hx - heading.x) + Math.abs(tl.hz - heading.z));
          }
        } else if (ran) break;
      }
      res.thornTelled = telled;
      res.thornRan = ran;
      res.thornDrift = +drift.toFixed(4);
      clean();
    }

    // ---- 3. the seed lands harmless and sprouts later -------------------
    // The whole theme in one check: the gap between being shown a thing and
    // being charged for it.
    {
      clean();
      const e = put('sporegun', 11, 0);
      e.attackCd = 0;
      let mortarAt = -1;
      let hazardsWhenSeedLanded = -1;
      for (let i = 0; i < 1400; i++) {
        await step();
        if (g._mortars.length > 0 && mortarAt < 0) {
          mortarAt = i;
          // A seed grows NO ground - that is the point of the fifth kind.
          hazardsWhenSeedLanded = g._hazard.length;
          break;
        }
      }
      res.seedSprouted = mortarAt >= 0;
      res.seedGrewNoGround = hazardsWhenSeedLanded === 0;
      if (mortarAt >= 0) {
        const m = g._mortars[0];
        res.seedDelay = m.delay;
        // A telegraph with no slot is an attack that lands unannounced, which
        // is the one failure a telegraph must never have.
        res.seedHasMark = m.mark >= 0;
        // And it is harmless while the circle fills.
        // THE SPOREGUN GOES FIRST. It is still orbiting and still throwing,
        // and the question here is only whether the CIRCLE is safe while it
        // fills - a second seed landing during the six frames below would be
        // measured as the first one having hurt somebody.
        for (const x of g.enemies) x.dead = true;
        await steps(2);
        res.seedEarlyLoss = await measure(0.1, () => { px = m.x; pz = m.z; });
        res.seedMortarsThen = g._mortars.length;
        res.seedHarmlessAtFirst = res.seedEarlyLoss === 0;
        // ...and not harmless when it goes off.
        god = false;
        p.health = p.maxHealth;
        const hpB = p.health;
        for (let i = 0; i < 400 && g._mortars.length > 0; i++) await step();
        res.seedHurtsOnSprout = p.health < hpB;
        god = true;
      }
      clean();
    }

    // ---- 4. the bramblehide's thorns ------------------------------------
    {
      clean();
      const e = put('bramblehide', 8, 0);
      e.speed = 0;
      // MEASURED IN THE BAND BETWEEN THE SWING AND THE THORNS, which is what
      // that gap exists for. The first version of this reached into the melee
      // state to switch the swing off and got 98 points of ordinary melee for
      // its trouble - poking an enemy's internals to isolate a mechanic proves
      // something about the poke, not about the enemy. Standing at 4.2m is
      // outside a 3.5m hit and inside a 4.6m aura, so anything that lands here
      // can only be the thorns.
      res.brambleTicks = await measure(2, () => { px = e.pos.x - 4.2; pz = 0; });
      res.brambleHurtsNear = res.brambleTicks > 0;
      // ...and not from across the room.
      // MOVED, AND GIVEN A FRAME TO NOTICE. The thorn clock keeps running
      // while it is out of reach, so the tick it had already banked lands on
      // the first frame it is back in range - and the enemy is a metre wide
      // with a collision circle that has to settle after being teleported.
      // A few frames of slack here is the difference between measuring the
      // aura and measuring the teleport.
      px = 0;
      pz = 0;
      e.pos.set(16, e.pos.y, 0);
      e.thornCd = 0;
      await steps(20);
      // Who actually hit us. _hurtPlayer is the single funnel every source of
      // player damage goes through, so wrapping it names the culprit instead
      // of leaving it to be guessed at from the number.
      const hits = [];
      const origHurt = g._hurtPlayer.bind(g);
      g._hurtPlayer = (d, pos) => {
        hits.push({
          d: +d.toFixed(1),
          at: pos ? +Math.hypot(pos.x - px, pos.z - pz).toFixed(1) : -1,
        });
        return origHurt(d, pos);
      };
      res.brambleFarLoss = await measure(2);
      g._hurtPlayer = origHurt;
      res.brambleFarHits = JSON.stringify(hits.slice(0, 4));
      res.brambleFarDist = +Math.hypot(e.pos.x - px, e.pos.z - pz).toFixed(1);
      res.brambleSafeFar = res.brambleFarLoss === 0;
      clean();
    }

    // ---- 5. the heartwood mends -----------------------------------------
    {
      clean();
      const h = put('heartwood', 4, 0);
      h.speed = 0;
      const hurt = put('chaser', 5, 0);
      hurt.speed = 0;
      hurt.hp = hurt.maxHp * 0.3;
      const hpA = hurt.hp;
      await simSteps(2);
      res.heartHeals = hurt.hp > hpA;
      res.heartGain = +(hurt.hp - hpA).toFixed(1);
      // Never past full - a heal that overshot would make a healed enemy
      // tougher than one that was never hurt.
      hurt.hp = hurt.maxHp;
      await simSteps(1);
      res.heartNoOverheal = hurt.hp <= hurt.maxHp;
      // ...and it stops when the caster dies, which is the reason to shoot it.
      hurt.hp = hurt.maxHp * 0.3;
      h.dead = true;
      const hpB = hurt.hp;
      await simSteps(2);
      res.heartStopsOnDeath = hurt.hp === hpB;
      clean();
    }

    // ---- 6. the mothcap's cloud -----------------------------------------
    {
      clean();
      const e = put('mothcap', 10, 0);
      for (let i = 0; i < 900 && kinds('gas').length === 0; i++) await step();
      res.mothCloud = kinds('gas').length;
      res.mothLow = e.pos.y > 1 && e.pos.y < 4;
      // The cloud OUTLIVES it - killing one overhead leaves the cloud where
      // the player is standing, which is the whole bargain.
      e.dead = true;
      await steps(30);
      res.mothCloudOutlives = kinds('gas').length > 0;
      clean();
    }

    // ---- 7. the Overgrowth ----------------------------------------------
    {
      clean();
      g.setTheme('verdant');
      const e = put('overgrowth', 20, 0);
      const startX = e.pos.x;
      const startZ = e.pos.z;
      const armorNow = () => TYPES.overgrowth.armor(e);

      // Far away: shut, armoured, and it answers with a creeper.
      px = 0;
      pz = 0;
      e.pos.set(20, e.pos.y, 0);
      await simSteps(1);
      res.ogShutFar = !e.bs.open;
      res.ogArmorFar = armorNow();
      // THE PEAK, not the count at some instant. A creeper's five thorns are
      // laid in ONE frame and then expire on five different clocks, so a
      // sample taken a moment later sees however many happen to be left - the
      // first version of this read one and called the mechanic broken.
      let peak = 0;
      let snapshot = [];
      for (let i = 0; i < 900; i++) {
        await step();
        if (g._mortars.length > peak) {
          peak = g._mortars.length;
          snapshot = g._mortars.map((m) => ({ x: m.x, z: m.z, delay: m.delay }));
        }
        if (peak >= OG_CREEP_N_EXPECTED) break;
      }
      res.ogCreeper = peak;
      // A creeper is a LINE marching outward, so its thorns are at increasing
      // distances from the boss and sprout at increasing times.
      if (snapshot.length > 1) {
        const ds = snapshot.map((m) => Math.hypot(m.x - e.pos.x, m.z - e.pos.z));
        const ts = snapshot.map((m) => m.delay);
        let ordered = true;
        const idx = ds.map((d, i) => i).sort((a, b) => ds[a] - ds[b]);
        for (let i = 1; i < idx.length; i++) {
          if (ts[idx[i]] < ts[idx[i - 1]]) ordered = false;
        }
        res.ogCreeperOrdered = ordered;
      }

      // Close in: the canopy opens and it takes full damage.
      px = e.pos.x - 4;
      pz = 0;
      await simSteps(1);
      res.ogOpenNear = e.bs.open;
      res.ogArmorNear = armorNow();
      res.ogCanopyMoved = e.canopy && e.canopy[0].position.y > 2.05 * e.scale;

      // AND IT NEVER MOVED. Not once, through either phase.
      res.ogMoved = +Math.hypot(e.pos.x - startX, e.pos.z - startZ).toFixed(2);
      clean();
      g.setTheme(null);
    }

    await steps(30);
    return res;
  }, VERDANT_TYPES);

  ok('an empty arena costs the player nothing', out.idleLoss === 0,
    `lost=${out.idleLoss} health=${out.idleHealth} max=${out.idleMax}`);
  ok('every VERDANT type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('the thornling winds up before it charges', out.thornTelled);
  ok('it commits to a charge', out.thornRan);
  ok('and cannot steer during it', out.thornDrift === 0, `drift=${out.thornDrift}`);

  ok('a seed sprouts a telegraphed mortar', out.seedSprouted && out.seedHasMark,
    `delay=${out.seedDelay}s mark=${out.seedHasMark}`);
  ok('and grows no ground on landing', out.seedGrewNoGround);
  ok('the floor is safe while the circle fills', out.seedHarmlessAtFirst,
    `lost=${out.seedEarlyLoss} mortars=${out.seedMortarsThen} hazards=${out.seedHazardsThen}`);
  ok('and costs you when it goes off', out.seedHurtsOnSprout);

  ok('standing next to a bramblehide costs health',
    out.brambleHurtsNear, `-${out.brambleTicks}hp at 4.2m, outside its 3.5m swing`);
  ok('and standing away from it does not', out.brambleSafeFar,
    `lost=${out.brambleFarLoss} at ${out.brambleFarDist}m  hits=${out.brambleFarHits}`);

  ok('a heartwood mends a hurt neighbour', out.heartHeals, `+${out.heartGain}hp`);
  ok('and never past full', out.heartNoOverheal);
  ok('and stops the moment it dies', out.heartStopsOnDeath);

  ok('a mothcap flies low and trails a cloud',
    out.mothCloud > 0 && out.mothLow, `n=${out.mothCloud}`);
  ok('and the cloud outlives it', out.mothCloudOutlives);

  ok('the Overgrowth is shut and armoured at range',
    out.ogShutFar && out.ogArmorFar > 0 && out.ogArmorFar < 1, `armor=${out.ogArmorFar}`);
  ok('it answers range with a creeper', out.ogCreeper > 1, `thorns=${out.ogCreeper}`);
  ok('and the creeper marches outward', out.ogCreeperOrdered);
  ok('coming close opens the canopy',
    out.ogOpenNear && out.ogArmorNear === 1 && out.ogCanopyMoved, `armor=${out.ogArmorNear}`);
  ok('and it never takes a step', out.ogMoved < 0.01, `moved=${out.ogMoved}m`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `VERDANT TEST FAIL (${fails})` : 'VERDANT TEST PASS');
process.exitCode = fails ? 1 : 0;
