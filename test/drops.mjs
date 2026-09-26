// Drop-system test.
//
// The smoke test only checks that nothing crashes or leaks; the properties
// that make drops FAIR are invisible to it. Drops are rolled per kill now
// rather than paid out of a per-wave budget (see rollDrop in powerups.js),
// so what is worth pinning down has changed with them:
//
//   the rates are the rates     a kill drops at the advertised chance, and
//                               the buffs stay rare - they are the numbers the
//                               whole economy of a wave is tuned against, and
//                               nothing else in the game would notice if one
//                               of them silently doubled
//   need moves health and ammo  and ONLY health and ammo: a player doing badly
//                               gets more of what keeps them alive, never more
//                               damage
//   one drop per kill at most   so a single death can never carpet the floor
//   boss ammo is earned         milestones always pay ammo once; relief only
//                               covers a live boss, an empty floor and <40 rounds
//   boss ammo is reachable      random floor positions exclude terrain and
//                               every boss part, including fallback placements
//
// The old budget assertions are gone with the budget. What replaced the
// guarantee they encoded - two runs of a wave get the same loot - is nothing:
// that was the cost of rolling rather than scheduling, and it was paid on
// purpose.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8217;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT);
await sleep(800);

let browser;
let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
};

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load' });
  await sleep(1500);

  // ---- the advertised rates are the real rates ----
  const rates = await page.evaluate(async () => {
    const { rollDrop, dropChance, POWERUP_TYPES, AMMO_PICKUP } = await import('./js/powerups.js');
    const N = 200000;
    const sample = (hp, ammo, allowAmmo = true) => {
      const t = { nothing: 0 };
      for (let i = 0; i < N; i++) {
        const k = rollDrop(hp, ammo, allowAmmo);
        if (!k) t.nothing++;
        else t[k] = (t[k] || 0) + 1;
      }
      for (const k in t) t[k] = t[k] / N;
      return t;
    };
    return {
      full: sample(1, 1),
      // Just under a full bar. `full` is now the case where health is
      // withheld entirely, so the base rate has to be sampled from a player
      // who is missing something - anything.
      nicked: sample(0.99, 1),
      hurt: sample(0.1, 1),
      dry: sample(1, 0.05),
      noAmmo: sample(1, 0.05, false),
      // A BATTERY IS THE ONLY DROP THAT PAYS OUT IN A CURRENCY THE PLAYER MIGHT
      // NOT OWN - the active item's meter - so it is gated at the roll rather
      // than left to land as a plate that means nothing. Sampled both ways.
      noItem: (() => {
        const t = { nothing: 0 };
        for (let i = 0; i < N; i++) {
          const k = rollDrop(1, 1, true, 1, false);
          if (!k) t.nothing++; else t[k] = (t[k] || 0) + 1;
        }
        for (const k in t) t[k] = t[k] / N;
        return t;
      })(),
      // What the module itself says it should be doing, to check the sample
      // against rather than against numbers copied into this file.
      wantFull: dropChance(1, 1),
      wantDry: dropChance(1, 0.05),
      chances: {
        health: POWERUP_TYPES.health.chance,
        damageBoost: POWERUP_TYPES.damageBoost.chance,
        fireRateBoost: POWERUP_TYPES.fireRateBoost.chance,
        magnet: POWERUP_TYPES.magnet.chance,
        shield: POWERUP_TYPES.shield.chance,
        ammo: AMMO_PICKUP.chance,
      },
    };
  });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const anything = (t) => 1 - t.nothing;

  check('most kills drop nothing', rates.full.nothing > 0.8,
    `nothing=${rates.full.nothing.toFixed(3)}`);
  check('the overall rate matches dropChance()',
    near(anything(rates.full), rates.wantFull, 0.006),
    `sampled=${anything(rates.full).toFixed(4)} stated=${rates.wantFull.toFixed(4)}`);
  check('the overall rate matches dropChance() when starving',
    near(anything(rates.dry), rates.wantDry, 0.008),
    `sampled=${anything(rates.dry).toFixed(4)} stated=${rates.wantDry.toFixed(4)}`);

  // Each buff at its own advertised chance, within sampling noise. Ammo is
  // rolled first and eats a little of everything after it, which is why these
  // are checked at the "full bars" sample where its rate is lowest - and why
  // the tolerance is a fraction of the chance rather than an absolute.
  for (const [key, want] of Object.entries(rates.chances)) {
    if (key === 'ammo' || key === 'health') continue;
    check(`${key} drops at ~${(want * 100).toFixed(1)}% a kill`,
      near(rates.full[key] || 0, want, want * 0.25),
      `sampled=${((rates.full[key] || 0) * 100).toFixed(2)}%`);
  }

  // ---- need moves health and ammo, and nothing else ----
  // The need term is held equal to the base chance, so an empty bar at most
  // DOUBLES the rate - checked from both sides. The lower bound is what says
  // need still does something; the upper is what says the bailout stays a
  // nudge. The samples here sit at 0.81 and 0.90 of the squared need curve,
  // so they land just under the 2x ceiling rather than on it.
  const ratio = (a, b) => (b > 0 ? a / b : 0);
  const healthRatio = ratio(rates.hurt.health || 0, rates.nicked.health || 0);
  const ammoRatio = ratio(rates.dry.ammo || 0, rates.full.ammo || 0);
  check('low health raises the health rate, capped at 2x',
    healthRatio > 1.5 && healthRatio <= 2.05,
    `nicked=${(rates.nicked.health || 0).toFixed(3)} hurt=${(rates.hurt.health || 0).toFixed(3)} x${healthRatio.toFixed(2)}`);
  // A health plate on a full bar is a drop that cannot be spent: it is either
  // walked over for nothing or left to time out. Withheld outright rather
  // than merely made rare - see rollDrop().
  check('a full bar drops no health at all', !rates.full.health,
    `health=${rates.full.health}`);
  check('a bar one point down does', (rates.nicked.health || 0) > 0.03,
    `health=${(rates.nicked.health || 0).toFixed(3)}`);
  check('low ammo raises the ammo rate, capped at 2x',
    ammoRatio > 1.5 && ammoRatio <= 2.05,
    `full=${(rates.full.ammo || 0).toFixed(3)} dry=${(rates.dry.ammo || 0).toFixed(3)} x${ammoRatio.toFixed(2)}`);
  check('need never raises a buff rate',
    near(rates.hurt.shield || 0, rates.full.shield || 0, 0.004)
    && near(rates.hurt.damageBoost || 0, rates.full.damageBoost || 0, 0.006),
    `shield ${(rates.full.shield || 0).toFixed(4)} -> ${(rates.hurt.shield || 0).toFixed(4)}`);
  check('the ammo cap suppresses ammo entirely', !rates.noAmmo.ammo,
    `ammo=${rates.noAmmo.ammo}`);
  // The battery, both ways round. It is rolled at the same flat half a per cent
  // the buffs are, and it is withheld OUTRIGHT - not merely made rare - from a
  // player with no meter to pour it into, exactly as health is at a full bar.
  check('battery drops at ~0.5% a kill',
    Math.abs((rates.full.battery || 0) - 0.005) < 0.0015,
    `sampled=${((rates.full.battery || 0) * 100).toFixed(2)}%`);
  check('a player with no active item is offered no battery at all',
    !rates.noItem.battery, `battery=${rates.noItem.battery}`);
  // Floor is well under the 0.5% base: ammo is rolled first and eats into it,
  // so a starving player sees the buffs at a shade under their flat rate - the
  // point is that they are still reachable, not that they are undiminished.
  check('a starving player still sees buffs',
    (rates.dry.damageBoost || 0) > 0.003,
    `damage=${(rates.dry.damageBoost || 0).toFixed(4)}`);

  // ---- the guaranteed drop honours the same multipliers ----
  // forcedDrop is the same table with "nothing" removed, and for a stretch it
  // quietly ignored crateLuck - PINATA simply did not feel SECOND HELPINGS.
  // Sampled rather than read, because the weight lives in two loops.
  const pinataRates = await page.evaluate(async () => {
    const { forcedDrop } = await import('./js/powerups.js');
    const skew = (crateLuck) => {
      const t = {};
      for (let i = 0; i < 50000; i++) {
        const k = forcedDrop(0.5, 0.5, true, 1, true, false, crateLuck);
        t[k] = (t[k] || 0) + 1;
      }
      return (t.health || 0) / 50000;
    };
    return { plain: skew(1), helped: skew(4) };
  });
  check('second helpings sweetens the guaranteed drop',
    pinataRates.plain > 0 && pinataRates.helped > pinataRates.plain * 1.5,
    `plain=${pinataRates.plain.toFixed(3)} helped=${pinataRates.helped.toFixed(3)}`);

  // ---- boss milestones and ammunition relief ----
  // Drive a real fight on fixed ticks so kills, healing and the bot cannot
  // change the resource boundary while it is being measured.
  const supplies = await page.evaluate(async () => {
    const g = window.__game;
    const P = g.player;
    const { AMMO_PICKUP } = await import('./js/powerups.js');
    const out = {};
    g.autoTest = false;
    g.state = 'paused';
    g._clearEntities();
    P.reset();
    g.setTheme('rust');
    g.wave = 4;
    g.startWave();
    const bf = g.bossFight;
    const b = bf.parts[0];
    const clear = () => {
      g.powerups.forEach((p) => p.destroy());
      g.powerups.length = 0;
    };
    const remove = () => g.powerups.shift().destroy();
    const kinds = () => g.powerups.map((p) => p.typeKey);
    const rewind = () => { clear(); bf.bleedAt = 0; bf.ammoOwed = 0; };
    const tick = () => { g.time += 0.05; g._updateWave(0.05); };

    // Low health used to make all three milestones health drops even when
    // the fight would need ammunition later. The full reserve must not waive
    // supplies already earned through damage either.
    P.health = 1;
    P.reserveAmmo = P.maxReserve;
    const seen = [];
    for (const f of [0.8, 0.75, 0.55, 0.5, 0.3, 0.25]) {
      b.hp = b.maxHp * f;
      tick();
      seen.push(g.powerups.length);
    }
    out.milestones = { seen, kinds: kinds(), crossed: bf.bleedAt };
    b.hp = b.maxHp * 0.9;
    tick();
    b.hp = b.maxHp * 0.2;
    tick();
    out.noRepeat = g.powerups.length === 3;

    rewind();
    b.hp = b.maxHp * 0.2;
    tick();
    out.leap = { kinds: kinds(), crossed: bf.bleedAt };

    const clearFloor = (p) => p.pos.y === 0 && Math.abs(p.pos.x) <= 19.5
      && Math.abs(p.pos.z) <= 19.5
      && !g.arena.obstacles.some((o) => p.pos.x > o.min.x - 0.8 && p.pos.x < o.max.x + 0.8
        && p.pos.z > o.min.z - 0.8 && p.pos.z < o.max.z + 0.8)
      && bf.parts.every((part) => Math.hypot(p.pos.x - part.pos.x, p.pos.z - part.pos.z)
        >= part.radius + 0.8);
    out.openFloor = g.powerups.every(clearFloor);

    // Offer the boss footprint and an obstacle before each chosen open point.
    // A corpse-position spawn, or an unchecked random point, cannot pass.
    const savedObstacles = g.arena.obstacles;
    const savedPos = b.pos.clone();
    const random = Math.random;
    try {
      rewind();
      b.pos.set(0, 0, 12);
      g.arena.obstacles = [...savedObstacles, {
        min: { x: -16, z: -16 }, max: { x: -14, z: -14 },
      }];
      const open = [];
      for (let x = -18; x <= 18; x += 6) {
        for (let z = -18; z <= 18; z += 6) {
          const pos = { x, y: 0, z };
          if (Math.hypot(x, z) >= 10 && clearFloor({ pos })) open.push(pos);
        }
      }
      const chosen = [open[0], open[Math.floor(open.length / 2)], open.at(-1)];
      for (let i = 0; i < 3; i++) {
        const candidates = [b.pos.x, b.pos.z, -15, -15, chosen[i].x, chosen[i].z]
          .map((v) => (v / 19.5 + 1) / 2);
        let n = 0;
        Math.random = () => candidates[n++] ?? 0.5;
        b.hp = b.maxHp * [0.75, 0.5, 0.25][i];
        g._bossBleed();
      }
      out.placement = {
        clear: g.powerups.length === 3 && g.powerups.every(clearFloor),
        selected: g.powerups.every((p, i) => Math.hypot(
          p.pos.x - chosen[i].x, p.pos.z - chosen[i].z
        ) < 1e-8),
        positions: g.powerups.map((p) => [p.pos.x, p.pos.z]),
      };

      rewind();
      b.pos.set(-11.5, 0, 0);
      g.arena.obstacles = [...savedObstacles, {
        min: { x: -14, z: -2 }, max: { x: -9, z: 2 },
      }];
      // Reject all 40 random samples; the fallback's first point is occupied.
      Math.random = () => 0.5;
      b.hp = b.maxHp * 0.2;
      g._bossBleed();
      out.fallback = g.powerups.length === 3 && g.powerups.every(clearFloor);

      rewind();
      g.arena.obstacles = [{ min: { x: -22, z: -22 }, max: { x: 22, z: 22 } }];
      g._bossBleed();
      out.blockedFloor = g.powerups.length === 0 && bf.ammoOwed === 3;
    } finally {
      Math.random = random;
      g.arena.obstacles = savedObstacles;
      b.pos.copy(savedPos);
    }
    g._bossBleed();
    out.floorCleared = g.powerups.length === 3 && bf.ammoOwed === 0
      && g.powerups.every(clearFloor);

    // A full floor queues rewards; healing while blocked must not erase
    // them, and freeing one slot must never break the five-ammo cap.
    rewind();
    for (let i = 0; i < 5; i++) g._placeDrop('ammo', b.pos);
    tick();
    out.ammoCap = { count: g.powerups.length, owed: bf.ammoOwed, crossed: bf.bleedAt };
    b.hp = b.maxHp * 0.9;
    const released = [];
    for (let i = 0; i < 3; i++) {
      remove();
      tick();
      released.push({ count: g.powerups.length, owed: bf.ammoOwed });
    }
    tick();
    out.released = released;
    out.noExtra = g.powerups.length === 5 && bf.ammoOwed === 0;

    rewind();
    b.hp = b.maxHp * 0.2;
    for (let i = 0; i < 12; i++) g._placeDrop('damageBoost', b.pos);
    tick();
    out.floorCap = { count: g.powerups.length, owed: bf.ammoOwed };
    for (let i = 0; i < 3; i++) remove();
    tick();
    out.floorReleased = {
      count: g.powerups.length, ammo: g._ammoActive(), owed: bf.ammoOwed,
    };

    // The same bar drives split/multipart bosses: three drops for the whole
    // fight, not three for every body.
    rewind();
    const other = new g.__EnemyForTest('colossus', b.pos.clone(), 1, 1, 1);
    const otherSpot = out.placement.positions.find(([x, z]) =>
      Math.hypot(x - b.pos.x, z - b.pos.z) > b.radius + other.radius + 1.6);
    other.pos.set(otherSpot[0], 0, otherSpot[1]);
    bf.parts.push(other);
    bf.totalMaxHp = b.maxHp + other.maxHp;
    for (const part of bf.parts) part.hp = part.maxHp * 0.2;
    try {
      const openSpot = out.placement.positions.find(([x, z]) => clearFloor({ pos: { x, y: 0, z } }));
      const candidates = [...otherSpot, ...openSpot].map((v) => (v / 19.5 + 1) / 2);
      let n = 0;
      Math.random = () => candidates[n++] ?? 0.5;
      g._bossBleed();
      out.multipart = { kinds: kinds(), crossed: bf.bleedAt, clear: g.powerups.every(clearFloor) };
    } finally {
      Math.random = random;
      bf.parts.pop();
      other.dispose();
      bf.totalMaxHp = b.maxHp;
    }

    rewind();
    b.hp = b.maxHp * 0.75;
    P.reserveAmmo = 0;
    P.mag = 0;
    g._reliefT = 0;
    tick();
    out.milestoneBeforeRelief = kinds();

    // Every relief check below crosses its deadline on the same live boss.
    // Only the gate under test changes: wave kind, ammunition or loose ammo.
    clear();
    b.hp = b.maxHp;
    P.health = 1;
    P.reserveAmmo = 0;
    P.mag = 0;
    g.bossFight = null;
    g.queue.push('chaser');
    g.spawnTimer = 1e6;
    g._reliefT = 0;
    tick();
    g._updateReliefDrop(10);
    out.normal = kinds();
    g.queue.length = 0;
    g.bossFight = bf;

    P.reserveAmmo = 10;
    P.mag = 30;
    g._reliefT = 0;
    tick();
    out.forty = kinds();
    P.reserveAmmo = 9;
    g._reliefT = 0;
    tick();
    out.thirtyNine = kinds();
    out.distance = Math.hypot(g.powerups[0].pos.x - P.pos.x, g.powerups[0].pos.z - P.pos.z);
    g.powerups[0].type.apply(P, g.time);
    out.amount = P.reserveAmmo === 9 + AMMO_PICKUP.amount;

    clear();
    P.reserveAmmo = 0;
    P.mag = 0;
    g._updateReliefDrop(9.9);
    out.cooldown = kinds();
    g._updateReliefDrop(0.11);
    out.afterCooldown = kinds();

    clear();
    const V = P.pos.constructor;
    g._placeDrop('ammo', new V(15, 0, 15));
    g._reliefT = 0;
    tick();
    g._updateReliefDrop(10);
    out.existing = kinds();
    clear();
    g._updateReliefDrop(2.1);
    out.afterCollection = kinds();

    clear();
    P.reserveAmmo = P.maxReserve;
    P.health = 1;
    g._reliefT = 0;
    tick();
    out.healthOnly = kinds();
    P.reserveAmmo = 0;
    for (let i = 0; i < 12; i++) g._placeDrop('health', b.pos);
    g._reliefT = 0;
    tick();
    out.reliefCap = { count: g.powerups.length, ammo: g._ammoActive() };
    clear();
    g.waveState = 'intermission';
    g._reliefT = 0;
    g._updateReliefDrop(10);
    out.intermission = kinds();
    g.waveState = 'active';
    const parts = bf.parts;
    bf.parts = [];
    g._updateReliefDrop(10);
    g._bossBleed();
    out.defeated = kinds();
    bf.parts = parts;
    b.hp = 0;
    g._updateReliefDrop(10);
    out.zeroHp = kinds();

    // Fresh fights must neither inherit old milestone debt nor a relief
    // deadline shortened by the previous player/wave.
    g._clearEntities();
    g.wave = 4;
    g.startWave();
    P.reserveAmmo = 0;
    P.mag = 0;
    g._updateReliefDrop(9.9);
    out.fresh = { crossed: g.bossFight.bleedAt, owed: g.bossFight.ammoOwed, kinds: kinds() };
    g._updateReliefDrop(0.11);
    out.freshReady = kinds();
    g._clearEntities();
    g.startWave();
    P.reserveAmmo = 0;
    P.mag = 0;
    g._updateReliefDrop(11);
    out.nextNormal = { boss: !!g.bossFight, kinds: kinds() };
    g.setTheme(null);
    return out;
  });
  const ammoOnly = (kinds, count = 1) => kinds.length === count && kinds.every((k) => k === 'ammo');
  check('boss milestones pay ammo exactly at 75%, 50% and 25%, even at low health',
    JSON.stringify(supplies.milestones.seen) === '[0,1,1,2,2,3]'
      && ammoOnly(supplies.milestones.kinds, 3), JSON.stringify(supplies.milestones));
  check('healing and repeated checks never duplicate milestone ammo', supplies.noRepeat);
  check('one hit crossing several milestones earns each one',
    ammoOnly(supplies.leap.kinds, 3) && supplies.leap.crossed === 3, JSON.stringify(supplies.leap));
  check('boss ammo lands at random open floor points away from the boss and obstacles',
    supplies.openFloor && supplies.placement.clear && supplies.placement.selected
      && new Set(supplies.placement.positions.map(String)).size === 3,
    JSON.stringify(supplies.placement));
  check('fallback boss ammo positions remain reachable', supplies.fallback);
  check('no reachable floor defers ammo until a clear location opens',
    supplies.blockedFloor && supplies.floorCleared);
  check('full ammo floor queues all earned milestone supplies',
    supplies.ammoCap.count === 5 && supplies.ammoCap.owed === 3 && supplies.ammoCap.crossed === 3,
    JSON.stringify(supplies.ammoCap));
  check('queued supplies survive healing and release once as slots open',
    supplies.released.every((r, i) => r.count === 5 && r.owed === 2 - i) && supplies.noExtra,
    JSON.stringify(supplies.released));
  check('milestones respect the total pickup cap and resume when room opens',
    supplies.floorCap.count === 12 && supplies.floorCap.owed === 3
      && supplies.floorReleased.count === 12 && supplies.floorReleased.ammo === 3
      && supplies.floorReleased.owed === 0, JSON.stringify(supplies.floorReleased));
  check('multipart boss milestones belong to the shared health bar',
    ammoOnly(supplies.multipart.kinds, 3) && supplies.multipart.crossed === 3);
  check('multipart ammo stays clear of every boss body', supplies.multipart.clear);
  check('milestone ammo prevents simultaneous emergency supplies',
    ammoOnly(supplies.milestoneBeforeRelief), JSON.stringify(supplies.milestoneBeforeRelief));
  check('normal waves never spawn emergency supplies, even with both bars empty',
    supplies.normal.length === 0, JSON.stringify(supplies.normal));
  check('40 total rounds refuse relief; 39 permit one ammo pickup',
    supplies.forty.length === 0 && ammoOnly(supplies.thirtyNine), JSON.stringify(supplies.thirtyNine));
  check('boss relief supplies the normal ammo amount near the player',
    supplies.amount && supplies.distance >= 6 && supplies.distance <= 11, String(supplies.distance));
  check('boss relief preserves the ten-second cooldown',
    supplies.cooldown.length === 0 && ammoOnly(supplies.afterCooldown));
  check('an existing ammo pickup anywhere on the floor blocks emergency ammo',
    ammoOnly(supplies.existing) && ammoOnly(supplies.afterCollection));
  check('low health alone never produces an emergency pickup', supplies.healthOnly.length === 0);
  check('boss relief respects the total pickup cap',
    supplies.reliefCap.count === 12 && supplies.reliefCap.ammo === 0);
  check('intermissions and defeated bosses never spawn relief',
    supplies.intermission.length === 0 && supplies.defeated.length === 0 && supplies.zeroHp.length === 0);
  check('a fresh boss resets milestone debt and the ten-second relief cooldown',
    supplies.fresh.crossed === 0 && supplies.fresh.owed === 0 && supplies.fresh.kinds.length === 0
      && ammoOnly(supplies.freshReady), JSON.stringify(supplies.fresh));
  check('returning to a normal wave removes boss emergency supplies',
    !supplies.nextNormal.boss && supplies.nextNormal.kinds.length === 0);

  // ---- ground zones hand their decals back ----
  // Every lingering zone holds a slot in the creep pool for its whole life.
  // The pool is thirty deep and shared by ash clouds, blight pools and magma
  // trails, so a
  // zone that expired without releasing would go unnoticed until, several
  // waves later, zones silently stopped being drawn at all - the exact failure
  // the decals were added to fix.
  //
  // A slot is a STAMP into the shared creep field now rather than a mesh of
  // its own, so "is it still being drawn" is its alpha rather than a mesh's
  // visible flag. Same question, asked of the thing that answers it.
  const creep = await page.evaluate(async () => {
    const g = window.__game;
    g.state = 'playing';
    g.player.health = g.player.maxHealth;
    g._ash.forEach((a) => g.effects.creepRelease(a.creep));
    g._ash.length = 0;
    g._hazard.forEach((h) => g.effects.creepRelease(h.creep));
    g._hazard.length = 0;
    // NOTHING MAY BE ALIVE THAT LAYS ZONES OF ITS OWN.
    //
    // This block measures that a zone releases its creep slot WHEN IT EXPIRES,
    // which means waiting for the arena to empty of zones - and it used to do
    // that with a live wave running underneath it. That was survivable while a
    // hazard-laying enemy was one roll among six for a slot; it is not
    // survivable now that a wave is a THEME. An EMBER block is a magma, a
    // kiln and an ashwing all laying fire continuously, so the drain condition
    // below can never be reached and the wait times out with a floor full of
    // zones that were never the ones under test.
    g._clearEntities();
    // Still 'active', so no intermission opens and no totems rise - but with
    // one enemy left in the queue that never arrives, because a wave with an
    // empty queue and no enemies COMPLETES, and a wave completing clears every
    // zone in the arena. That would make the check below pass through the
    // wave-clear path rather than through the expiry it exists to measure.
    g.waveState = 'active';
    g.queue.length = 0;
    g.queue.push('chaser');
    g.spawnTimer = 1e6;
    g.player.mods.ashDps = 18;
    g.player.mods.ashRadius = 3.5;
    g.player.mods.ashTime = 1.2;
    // More zones than the per-kind caps hold (8 clouds, 4 pools), so the
    // recycling path is exercised too.
    for (let i = 0; i < 10; i++) g._addAsh({ x: -8 + i * 1.7, z: 4 });
    for (let i = 0; i < 6; i++) g._addHazard(-6 + i * 2.4, 9, 3, 1.2, 9);
    const peak = g.effects.creep.filter((c) => c.used).length;
    await window.__simWait(4, () => g._ash.length + g._hazard.length === 0
      && g.effects.creep.every((c) => !c.used));
    return {
      peak,
      held: g.effects.creep.filter((c) => c.used).length,
      visible: g.effects.creep.filter((c) => c.alpha > 0).length,
      zones: g._ash.length + g._hazard.length,
    };
  });
  check('zone decals are drawn while zones live', creep.peak > 0, `peak=${creep.peak}`);
  check('zone decals return to the pool', creep.held === 0 && creep.visible === 0,
    `held=${creep.held} visible=${creep.visible} zones=${creep.zones}`);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(bad ? `DROP TEST FAIL (${bad})` : 'DROP TEST PASS');
process.exitCode = bad ? 1 : 0;
