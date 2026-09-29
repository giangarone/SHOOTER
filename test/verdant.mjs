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
//     overgrowth  a boss that WALKS the room and sows it as it goes: five
//                 attacks on a short rhythm, each one of the theme's own
//                 ideas grown to boss scale - and whose damage window is
//                 still opened by the PLAYER's position rather than by any
//                 clock of its own
//
// WHAT IS ASSERTED
//   1. All six build and survive their AI.
//   2. A thornling commits to a straight charge and cannot steer during it.
//   3. A seed lands harmless and sprouts a telegraphed mortar seconds later.
//   4. Standing next to a bramblehide costs health without it swinging.
//   5. A heartwood heals a hurt neighbour, and stops when it dies.
//   6. A mothcap flies low and leaves a cloud that outlives it.
//   7. The Overgrowth: it walks between attack commitments, the window is
//      still the player's, contact costs immediately, and each of the five
//      attacks - seedfall, root sunder, bramble trample, spore bloom,
//      grasping thicket - fires from its real place in the fight. An enrage
//      under half the bar shortens every clock the fight runs on.
import { bootPage, launchBrowser, sleep, startServer } from './harness.mjs';

const PORT = 8224;
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
  const { page, errors } = await bootPage(browser, PORT);

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

    // ---- 7. the Overgrowth ------------------------------------------------
    // The rework made the tree walk: it stalks between attack commitments and
    // sows the arena as it goes. Each mechanic is isolated by bankrupting the
    // REST of its schedule - the fight's clocks all live on bs, so that is
    // the honest way in rather than poking at internals mid-flight.
    {
      const results = res;
      // ---- 7a. IT WALKS. ---------------------------------------------------
      // With every attack bankrupted there is nothing left but the stalk: if
      // the tree does not cover ground in three seconds, it is not hunting.
      {
        clean();
        g.setTheme('verdant');
        const e = put('overgrowth', 16, 8);
        px = 0;
        pz = 0;
        await simSteps(0.2);
        e.bs.atk = 1e6;
        for (const k of ['volleyCd', 'sunderCd', 'trampleCd', 'bloomCd', 'nooseCd']) e.bs[k] = 1e6;
        // PATH LENGTH, not net displacement: with attacks bankrupted the boss
        // hangs a ring off the player and reseats around them, so an honest
        // walk can end near where it started. A rooted tree walks ZERO path;
        // a hunting one covers metres of it. That is the whole rework claim.
        let path = 0;
        let lx = e.pos.x;
        let lz = e.pos.z;
        const until = g.time + 3;
        while (g.time < until) {
          await step();
          path += Math.hypot(e.pos.x - lx, e.pos.z - lz);
          lx = e.pos.x;
          lz = e.pos.z;
        }
        results.ogMoved = +path.toFixed(2);
        results.ogInArena = Math.abs(e.pos.x) <= 21.2 && Math.abs(e.pos.z) <= 21.2;
        clean();
      }

      // ---- 7b. the window is still the player's. ---------------------------
      // THE PEAK armour and canopy asserts survive the rework word for word:
      // shut and armoured at range, open and full-damage within sixteen, and
      // the canopy visibly apart when it is. The boss walking under the
      // window changes whose problem the range is, never whose CHOICE it is.
      {
        clean();
        g.setTheme('verdant');
        const e = put('overgrowth', 20, 0);
        await simSteps(0.2);
        e.bs.atk = 1e6;
        for (const k of ['volleyCd', 'sunderCd', 'trampleCd', 'bloomCd', 'nooseCd']) e.bs[k] = 1e6;
        const armorNow = () => TYPES.overgrowth.armor(e);
        px = 0;
        pz = 0;
        await simSteps(0.6);
        results.ogShutFar = !e.bs.open;
        results.ogArmorFar = armorNow();
        px = e.pos.x - 12;
        pz = e.pos.z;
        await simSteps(0.6);
        results.ogOpenMid = e.bs.open;
        results.ogArmorMid = armorNow();
        px = e.pos.x - 4;
        pz = e.pos.z;
        await simSteps(0.8);
        results.ogOpenNear = e.bs.open;
        results.ogArmorNear = armorNow();
        results.ogCanopyMoved = e.canopy && e.canopy[0].position.y > 2.05 * e.scale;
        clean();
      }

      // ---- 7c. TOUCHING IT COSTS, NOW. --------------------------------------
      // Melee held at sixty seconds and every attack bankrupted: whoever
      // hurts the player ON the body can only be the touch. Half a second of
      // contact is the window - the first frame of it is already too late.
      {
        clean();
        g.setTheme('verdant');
        const e = put('overgrowth', 0, 12);
        px = 0;
        pz = 0;
        await simSteps(0.2);
        e.bs.atk = 1e6;
        for (const k of ['volleyCd', 'sunderCd', 'trampleCd', 'bloomCd', 'nooseCd']) e.bs[k] = 1e6;
        e.attackCd = 60;
        e.bs.touchCd = 0;
        god = false;
        p.health = p.maxHealth;
        const before = p.health;
        px = e.pos.x - (e.radius + 0.5);
        pz = e.pos.z;
        await simSteps(0.4);
        // Sixty seconds of melee clock decays by at most a frame of dt across
        // this window, so nothing but the touch can land in it.
        results.ogTouchLoss = +(before - p.health).toFixed(2);
        god = true;
        p.health = p.maxHealth;
        clean();
      }

      // ---- 7d. seedfall: a real volley, and every seed a delayed mortar. ---
      {
        clean();
        g.setTheme('verdant');
        const e = put('overgrowth', 13, 0);
        px = 0;
        pz = 0;
        await simSteps(0.2);
        e.bs.atk = 0.2;
        for (const k of ['volleyCd', 'sunderCd', 'trampleCd', 'bloomCd', 'nooseCd'])
          e.bs[k] = k === 'volleyCd' ? 0 : 1e6;
        // Counted as THROWN, not airborne at once: the ripple lands its first
        // seed within the same beat its last one leaves the canopy, so a
        // concurrency peak under-reads the volley by construction.
        let thrown = 0;
        let inFlight = 0;
        let mortarPeak = 0;
        let hazPeak = 0;
        for (let i = 0; i < 1200; i++) {
          await step();
          const now = g.projectiles.filter((pr) => pr.kind === 'seed').length;
          if (now > inFlight) thrown += now - inFlight;
          inFlight = now;
          mortarPeak = Math.max(mortarPeak, g._mortars.length);
          hazPeak = Math.max(hazPeak, g._hazard.length);
          if (thrown >= 4 && mortarPeak >= 4) break;
        }
        results.ogSeeds = thrown;
        results.ogSeedMortars = mortarPeak;
        results.ogSeedHazards = hazPeak;
        clean();
      }

      // ---- 7e. root sunder: a fissure down a locked line. ------------------
      {
        clean();
        g.setTheme('verdant');
        const e = put('overgrowth', 10, 0);
        px = 0;
        pz = 0;
        await simSteps(0.2);
        e.bs.atk = 0.2;
        for (const k of ['volleyCd', 'sunderCd', 'trampleCd', 'bloomCd', 'nooseCd'])
          e.bs[k] = k === 'sunderCd' ? 0 : 1e6;
        // THE PEAK, not the count at some instant: the thorns are laid in one
        // frame and expire on as many clocks.
        let peak = 0;
        let snapshot = [];
        for (let i = 0; i < 600; i++) {
          await step();
          if (g._mortars.length > peak) {
            peak = g._mortars.length;
            snapshot = g._mortars.map((m) => ({
              x: m.x, z: m.z, delay: m.delay,
              sx: e.pos.x, sz: e.pos.z,
            }));
          }
          if (peak >= 5) break;
        }
        results.ogSunderN = peak;
        if (peak === 0) {
          results.ogSunderDbg = JSON.stringify({
            state: e.bs.state, dist: +Math.hypot(e.pos.x - px, e.pos.z - pz).toFixed(2),
            atk: +e.bs.atk.toFixed(2),
            marks: g.effects.marks.filter((m) => m.used).length,
          });
        }
        if (snapshot.length > 2) {
          const ds = snapshot.map((m) => Math.hypot(m.x - m.sx, m.z - m.sz));
          const ts = snapshot.map((m) => m.delay);
          let ordered = true;
          const idx = ds.map((d, i) => i).sort((a, b) => ds[a] - ds[b]);
          for (let i = 1; i < idx.length; i++) {
            if (ts[idx[i]] < ts[idx[i - 1]]) ordered = false;
          }
          results.ogSunderOrdered = ordered;
          results.ogSunderSpan = +(Math.max(...ds) - Math.min(...ds)).toFixed(2);
        }
        clean();
      }

      // ---- 7f. the bramble trample: lane, rush, landing ring. --------------
      {
        clean();
        g.setTheme('verdant');
        const e = put('overgrowth', 11, 0);
        px = 0;
        pz = 0;
        await simSteps(0.2);
        // The boss hunts between beats, so the dispatch's read of range is
        // pinned instead: the player stands nine metres down a clear axis at
        // the moment the clock fires, and the FIRST rush is the one measured -
        // a later one could honestly start from arm's length and cross less
        // ground, which proves nothing about the mechanic.
        px = e.pos.x - 9;
        pz = e.pos.z;
        e.bs.atk = 0;
        for (const k of ['volleyCd', 'sunderCd', 'trampleCd', 'bloomCd', 'nooseCd'])
          e.bs[k] = k === 'trampleCd' ? 0 : 1e6;
        let sawLane = false;
        let sawRush = false;
        let rushFrom = null;
        let rushMoved = 0;
        let eruptRing = 0;
        let ringWindow = -1;
        for (let i = 0; i < 1200; i++) {
          await step();
          if (e.bs.state === 'trample') {
            sawLane = sawLane || g.effects.marks.some((m) => m.used && m.lane.visible);
          }
          if (e.bs.state === 'rush') {
            sawRush = true;
            if (!rushFrom) rushFrom = { x: e.pos.x, z: e.pos.z };
            rushMoved = Math.max(rushMoved, Math.hypot(e.pos.x - rushFrom.x, e.pos.z - rushFrom.z));
          }
          if (sawRush && e.bs.state !== 'rush') {
            if (ringWindow < 0) ringWindow = i;
            eruptRing = Math.max(eruptRing, g._mortars.length);
            if (i > ringWindow + 120) break;
          }
        }
        results.ogLaneDrawn = sawLane;
        results.ogRush = sawRush;
        results.ogRushMoved = +rushMoved.toFixed(2);
        results.ogEruptRing = eruptRing;
        clean();
      }

      // ---- 7g. the spore bloom: a burst that becomes ground. ---------------
      {
        clean();
        g.setTheme('verdant');
        const e = put('overgrowth', 5, 0);
        px = 0;
        pz = 0;
        await simSteps(0.2);
        e.bs.atk = 0.2;
        for (const k of ['volleyCd', 'sunderCd', 'trampleCd', 'bloomCd', 'nooseCd'])
          e.bs[k] = k === 'bloomCd' ? 0 : 1e6;
        for (let i = 0; i < 600 && kinds('gas').length < 3; i++) await step();
        results.ogBloomClouds = kinds('gas').length;
        clean();
      }

      // ---- 7h. the grasping thicket, rung around the PLAYER. ---------------
      {
        clean();
        g.setTheme('verdant');
        const e = put('overgrowth', 20, 0);
        px = 0;
        pz = 0;
        await simSteps(0.2);
        e.bs.atk = 0.2;
        for (const k of ['volleyCd', 'sunderCd', 'trampleCd', 'bloomCd', 'nooseCd'])
          e.bs[k] = k === 'nooseCd' ? 0 : 1e6;
        let peak = 0;
        let snapshot = [];
        for (let i = 0; i < 600; i++) {
          await step();
          if (g._mortars.length > peak) {
            peak = g._mortars.length;
            snapshot = g._mortars.map((m) => ({ x: m.x, z: m.z, bx: e.pos.x, bz: e.pos.z }));
          }
          if (peak >= 5) break;
        }
        results.ogNooseN = peak;
        if (snapshot.length >= 5) {
          // The noose is thrown at the player's feet (the origin, where they
          // are pinned), NOT rung around the boss - opposite shapes.
          const dp = snapshot.map((m) => Math.hypot(m.x, m.z));
          const db = snapshot.map((m) => Math.hypot(m.x - m.bx, m.z - m.bz));
          results.ogNooseOnPlayer =
            dp.every((d) => d > 2.5 && d < 6.8) && Math.min(...db) > 10;
          // ...and it has a door: one angular gap visibly wider than the rest.
          const angs = snapshot.map((m) => Math.atan2(m.z, m.x)).sort((a, b) => a - b);
          angs.push(angs[0] + Math.PI * 2);
          let maxGap = 0;
          for (let i = 1; i < angs.length; i++) maxGap = Math.max(maxGap, angs[i] - angs[i - 1]);
          results.ogNooseMaxGap = +maxGap.toFixed(2);
          results.ogNooseGap = maxGap >= 2.0;
        }
        clean();
      }

      // ---- 7i. under half the bar it stops pacing itself. ------------------
      {
        clean();
        g.setTheme('verdant');
        const e = put('overgrowth', 12, 0);
        px = 0;
        pz = 0;
        await simSteps(0.2);
        results.ogCalmFirst = e.bs.enraged !== true;
        e.hp = e.maxHp * 0.45;
        await simSteps(0.4);
        results.ogEnraged = e.bs.enraged === true;
        // ...and growth with it: the enraged volley is two seeds longer.
        // Counted as THROWN, not airborne at once: the first seed lands within
        // the same beat the sixth leaves the canopy, so a concurrency peak
        // under-reads by construction.
        e.bs.atk = 0.2;
        for (const k of ['volleyCd', 'sunderCd', 'trampleCd', 'bloomCd', 'nooseCd'])
          e.bs[k] = k === 'volleyCd' ? 0 : 1e6;
        let thrown = 0;
        let inFlight = 0;
        for (let i = 0; i < 900; i++) {
          await step();
          const now = g.projectiles.filter((pr) => pr.kind === 'seed').length;
          if (now > inFlight) thrown += now - inFlight;
          inFlight = now;
          if (thrown >= 6 && i > 300) break;
        }
        results.ogRageSeeds = thrown;
        clean();
        g.setTheme(null);
      }
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

  ok('the Overgrowth walks the arena between its commitments',
    out.ogMoved >= 3.5 && out.ogInArena, `moved=${out.ogMoved}m in 3s`);
  ok('and the window is still the player\'s: shut and armoured at range',
    out.ogShutFar && out.ogArmorFar > 0 && out.ogArmorFar < 1, `armor=${out.ogArmorFar}`);
  ok('open and full-damage within it',
    out.ogOpenMid && out.ogArmorMid === 1, `armor=${out.ogArmorMid} at 12m`);
  ok('the canopy visibly parting in the close band',
    out.ogOpenNear && out.ogArmorNear === 1 && out.ogCanopyMoved, `armor=${out.ogArmorNear}`);
  ok('touching it costs immediately, attack or no attack',
    out.ogTouchLoss > 0, `-${out.ogTouchLoss}hp in 0.4s of contact`);
  ok('seedfall: a volley of seeds arches out of the canopy',
    out.ogSeeds >= 4, `peak=${out.ogSeeds}`);
  ok('each seed sprouting a telegraphed mortar and growing no ground',
    out.ogSeedMortars >= 4 && out.ogSeedHazards === 0,
    `mortars=${out.ogSeedMortars} hazards=${out.ogSeedHazards}`);
  ok('root sunder lays a fissure down a locked line',
    out.ogSunderN >= 5 && out.ogSunderOrdered && out.ogSunderSpan > 9,
    `thorns=${out.ogSunderN} span=${out.ogSunderSpan}m ${out.ogSunderDbg || ''}`);
  ok('the bramble trample draws its lane and then comes down it',
    out.ogLaneDrawn && out.ogRush && out.ogRushMoved >= 5,
    `lane=${out.ogLaneDrawn} rush=${out.ogRush} moved=${out.ogRushMoved}m`);
  ok('and lands in a ring of thorns', out.ogEruptRing >= 3, `ring=${out.ogEruptRing}`);
  ok('the spore bloom leaves lingering clouds around the trunk',
    out.ogBloomClouds >= 3, `clouds=${out.ogBloomClouds}`);
  ok('the grasping thicket rings the PLAYER, with a door out',
    out.ogNooseN >= 5 && out.ogNooseOnPlayer && out.ogNooseGap,
    `thorns=${out.ogNooseN} maxGap=${out.ogNooseMaxGap}rad`);
  ok('under half the bar it stops pacing itself',
    out.ogEnraged && out.ogRageSeeds >= 6,
    `calmFirst=${out.ogCalmFirst} seeds=${out.ogRageSeeds}`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `VERDANT TEST FAIL (${fails})` : 'VERDANT TEST PASS');
process.exitCode = fails ? 1 : 0;
