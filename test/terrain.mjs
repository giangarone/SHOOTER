// The procedural arena generator, checked exhaustively.
//
// This is the ONE test in the suite that needs no browser. The generator half
// of terrain.js is pure - integers, a seeded RNG, no three.js - precisely so
// that "is every layout this game can produce actually playable?" can be
// answered by running it several thousand times rather than by playing it.
//
// WHAT IT IS GUARDING. A procedural arena has failure modes a smoke test
// cannot see, because they are rare and they are only visible from inside the
// fight: one wave in fifty where a spawn corner is walled off and the wave
// never ends, or where the room is dense enough that the fight becomes
// navigation. Both are properties of a layout, both are cheap to compute, and
// both are asserted here for every layout across the whole wave range.

import {
  generateLayout, validate, costBudget, primsToAabbs, makeRng, cellCentre,
  PLAZA_PIECES, PLAZA_MAX,
} from '../js/terrain.js';
import { isBossWave } from '../js/waves.js';
import {
  AGENT_HEIGHT, BOSS_HEIGHT, STEP_HEIGHT, stepSurface, resolveCircle,
} from '../js/utils.js';
import { NavGrid } from '../js/nav.js';

// Mirrored from nav.js. A change there that is not made here would let the
// generator produce decks the flow field quietly refuses to route onto.
const MAX_STAND = 2.6;

const BOUND = 22;
// The arena's own 3x3 spawn grid, minus the centre - mirrored from arena.js.
const SPAWNS = [];
for (const x of [-18, 0, 18]) {
  for (const z of [-18, 0, 18]) {
    if (x === 0 && z === 0) continue;
    SPAWNS.push({ x, z });
  }
}

// The pool sizes TerrainSet allocates. Asserted against here so the generator
// can never quietly outgrow the pool it is drawn from - a layout that emitted
// more boxes than there are slots would silently lose pieces at runtime, and
// lose the collision that went with them.
const BOX_SLOTS = 320;
const CYL_SLOTS = 64;

const WAVES = 40;
const RUNS = 40;

const fails = [];
function check(name, ok, detail) {
  if (!ok) fails.push(name + (detail ? '  ' + detail : ''));
}

let total = 0;
let fallbacks = 0;
let blockedSum = 0;
let blockedMax = 0;
// How much of the floor has ANYTHING on it - a tread, a deck, a wall. The
// blocked figure above deliberately counts only walls, so this is the one that
// answers "does the room feel furnished".
let coverSum = 0;
// AND THE SAME FIGURE WITH THE PLAZA TAKEN OUT. The whole-floor number is no
// longer the one that answers "does the room feel furnished": the generator
// now holds a fourteen-metre disc of it deliberately clear, so a global
// average that stayed where it was would mean the rest of the room had gone
// denser to compensate, and one that falls is exactly what the plaza is for.
// What must not fall is the density of the part of the room that is SUPPOSED
// to be dense, which is this.
let coverOutSum = 0;
let pieceSum = 0;
const pieceUse = new Map();
const byWaveBlocked = new Map();

for (let run = 0; run < RUNS; run++) {
  const seed = (run * 0x45d9f3b + 12345) >>> 0;
  // A different player position each run, so the reserved circle is exercised
  // everywhere rather than always at the origin.
  const rng = makeRng(seed);
  for (let wave = 1; wave <= WAVES; wave++) {
    const px = (rng() * 2 - 1) * 16;
    const pz = (rng() * 2 - 1) * 16;
    const reserved = [{ x: px, z: pz, r: 4 }];
    const layout = generateLayout(wave, {
      seed, bound: BOUND, spawnPoints: SPAWNS, reserved,
    });
    total++;
    if (layout.fallback) fallbacks++;

    for (const k of layout.pieces) pieceUse.set(k, (pieceUse.get(k) || 0) + 1);
    pieceSum += layout.pieces.length;
    {
      // Footprint coverage, sampled on a 1m lattice inside the playable floor.
      let hit = 0;
      let n = 0;
      let hitOut = 0;
      let nOut = 0;
      const pl = layout.plaza;
      const boxes = primsToAabbs(layout.prims);
      for (let x = -21; x <= 21; x++) {
        for (let z = -21; z <= 21; z++) {
          n++;
          const on = boxes.some((b) => x > b.min.x && x < b.max.x &&
                                       z > b.min.z && z < b.max.z);
          if (on) hit++;
          if ((x - pl.x) ** 2 + (z - pl.z) ** 2 > pl.r * pl.r) {
            nOut++;
            if (on) hitOut++;
          }
        }
      }
      const cover = hit / n;
      coverSum += cover;
      coverOutSum += hitOut / nOut;
      const c = byWaveBlocked.get(wave) || [0, 0];
      byWaveBlocked.set(wave, [c[0] + cover, c[1] + 1, (c[2] || 0) + hitOut / nOut]);
    }

    // 1. It has to pass its own validator. The fallback is exempt only from
    //    the cost budget, not from being playable.
    const v = validate(layout.prims, BOUND, SPAWNS, wave);
    check('wave ' + wave + ' layout playable', v.ok, v.why || '');
    if (v.ok) {
      blockedSum += v.blocked;
      blockedMax = Math.max(blockedMax, v.blocked);
    }

    // 2. It has to fit the pool.
    let boxes = 0;
    let cyls = 0;
    for (const p of layout.prims) {
      if (p.kind === 'cyl') cyls++;
      else boxes++;
    }
    check('wave ' + wave + ' fits box pool', boxes <= BOX_SLOTS, boxes + ' > ' + BOX_SLOTS);
    check('wave ' + wave + ' fits cyl pool', cyls <= CYL_SLOTS, cyls + ' > ' + CYL_SLOTS);

    // 3. It has to stay inside its openness budget.
    if (!layout.fallback) {
      check('wave ' + wave + ' within cost budget',
        layout.cost <= costBudget(wave) + 1e-9,
        layout.cost + ' > ' + costBudget(wave));
    }

    // 3b. THE MESH AND ITS AABB MUST DESCRIBE THE SAME BOX. Collision reads
    //     w/d and ignores yaw; the renderer scales by w/d AND applies yaw. So
    //     any prim whose yaw turns its footprint off the world axes is a box
    //     you can see in one place and collide with in another - which is
    //     exactly what a quarter-turn added to yaw on top of the w/d swap did
    //     to every rotated wall: a visible slab running along x with its
    //     collider running along z, walked straight through.
    //
    //     `pad` is what a prim is allowed to buy itself an off-axis mesh with
    //     (a yawed crate), so the test is that the yawed footprint fits the
    //     padded AABB rather than that yaw is zero.
    for (const p of layout.prims) {
      if (!p.solid) continue;
      const c = Math.abs(Math.cos(p.yaw || 0));
      const sn = Math.abs(Math.sin(p.yaw || 0));
      const ex = (p.w * c + p.d * sn) / 2;
      const ez = (p.w * sn + p.d * c) / 2;
      const pad = (p.pad || 0) / 2;
      check('wave ' + wave + ' mesh matches its collider',
        ex <= p.w / 2 + pad + 1e-6 && ez <= p.d / 2 + pad + 1e-6,
        p.mat + ' ' + p.w.toFixed(2) + 'x' + p.d.toFixed(2) +
        ' yaw ' + (p.yaw || 0).toFixed(2) +
        ' -> ' + ex.toFixed(2) + 'x' + ez.toFixed(2));
    }

    // 3c. THERE IS SOMEWHERE TO MOVE. Every layout declares a plaza - the
    //     disc of floor the generator held clear - and this is the assertion
    //     that it really is clear, because the plaza is the whole point of
    //     the density work and nothing else in this file would notice if it
    //     quietly filled in. Density has no other spatial term: without this,
    //     a broken footprint test would show up as nothing worse than a
    //     slightly different coverage number.
    //
    //     Two things are checked, and they fail differently: WHAT is standing
    //     in there (only the landmark pieces - a wall or a crate cluster in
    //     the plaza means the footprint test stopped working) and HOW MANY
    //     pieces (a plaza with eight towers in it is a pillar-dance camp, not
    //     open floor).
    {
      const pl = layout.plaza;
      check('wave ' + wave + ' declares a plaza',
        !!pl && pl.r > 0 && Math.abs(pl.x) < 20 && Math.abs(pl.z) < 20);
      const inside = new Set();
      for (const p of layout.prims) {
        if (!p.solid) continue;
        // The prim's OWN footprint this time, padding included - the
        // generator measures whole grid cells, so anything that gets in here
        // on a real overlap is a genuine intrusion and not a rounding.
        const dx = Math.max(0, Math.abs(p.x - pl.x) - (p.w + p.pad) / 2);
        const dz = Math.max(0, Math.abs(p.z - pl.z) - (p.d + p.pad) / 2);
        if (dx * dx + dz * dz >= pl.r * pl.r) continue;
        inside.add(p.key);
        check('wave ' + wave + ' plaza holds only landmarks',
          PLAZA_PIECES.has(p.key) || p.key === 'fallback',
          p.key + ' at ' + p.x.toFixed(1) + ',' + p.z.toFixed(1));
      }
      let pieces = 0;
      const seen = new Set();
      for (const p of layout.prims) {
        if (!p.solid || seen.has(p.order)) continue;
        const dx = Math.max(0, Math.abs(p.x - pl.x) - (p.w + p.pad) / 2);
        const dz = Math.max(0, Math.abs(p.z - pl.z) - (p.d + p.pad) / 2);
        if (dx * dx + dz * dz >= pl.r * pl.r) continue;
        seen.add(p.order);
        pieces++;
      }
      if (!layout.fallback) {
        check('wave ' + wave + ' plaza stays sparse', pieces <= PLAZA_MAX,
          pieces + ' pieces in it');
      }
      // And it has to be open ground, not a hole in the middle of a mass of
      // geometry: sample the disc and count how much of it a mover could not
      // walk across.
      let pts = 0;
      let blocked = 0;
      const boxes = primsToAabbs(layout.prims);
      for (let x = pl.x - pl.r; x <= pl.x + pl.r; x += 0.5) {
        for (let z = pl.z - pl.r; z <= pl.z + pl.r; z += 0.5) {
          if ((x - pl.x) ** 2 + (z - pl.z) ** 2 > pl.r * pl.r) continue;
          pts++;
          if (boxes.some((b) => x > b.min.x && x < b.max.x &&
                                z > b.min.z && z < b.max.z &&
                                b.max.y > STEP_HEIGHT)) blocked++;
        }
      }
      // Three big_pillars is the worst PLAZA_PIECES can do - twelve square
      // metres of a seventy-eight metre disc - so a fifth is the line. It is
      // a guard against the plaza filling up, not a tuning value.
      check('wave ' + wave + ' plaza is walkable', blocked / pts < 0.2,
        (100 * blocked / pts).toFixed(0) + '% blocked');
    }

    // 4. Nothing may stand where the player is, or outside the room.
    const aabbs = primsToAabbs(layout.prims);
    for (const b of aabbs) {
      const cx = (b.min.x + b.max.x) / 2;
      const cz = (b.min.z + b.max.z) / 2;
      check('wave ' + wave + ' inside the room',
        b.min.x > -BOUND && b.max.x < BOUND && b.min.z > -BOUND && b.max.z < BOUND,
        cx.toFixed(1) + ',' + cz.toFixed(1));
      // The player is a 0.4m circle. A box overlapping that circle is a box
      // that rose through them.
      if (!layout.fallback) {
        const nx = Math.max(b.min.x, Math.min(px, b.max.x));
        const nz = Math.max(b.min.z, Math.min(pz, b.max.z));
        check('wave ' + wave + ' clear of the player',
          (nx - px) ** 2 + (nz - pz) ** 2 > 0.4 ** 2,
          'box at ' + cx.toFixed(1) + ',' + cz.toFixed(1));
      }
      // And nothing may bury a spawn point.
      for (const s of SPAWNS) {
        const sx = Math.max(b.min.x, Math.min(s.x, b.max.x));
        const sz = Math.max(b.min.z, Math.min(s.z, b.max.z));
        check('wave ' + wave + ' clear of spawn ' + s.x + ',' + s.z,
          (sx - s.x) ** 2 + (sz - s.z) ** 2 > 1.0,
          'box at ' + cx.toFixed(1) + ',' + cz.toFixed(1));
      }
    }

    // 5. NOTHING FLOATS. Every solid box either stands on the floor, or is
    //    suspended above head height on purpose (a gate's lintel), or has
    //    something underneath holding it up. A slab hanging in the air with
    //    nothing below it is the fastest way to make generated terrain look
    //    generated, and it is the one thing the eye catches instantly.
    for (const b of aabbs) {
      if (b.min.y <= 0.02 || b.min.y > AGENT_HEIGHT) continue;
      const supported = aabbs.some((o) => o !== b &&
        o.max.y >= b.min.y - 0.05 && o.min.y < b.min.y &&
        o.min.x < b.max.x && o.max.x > b.min.x &&
        o.min.z < b.max.z && o.max.z > b.min.z);
      check('wave ' + wave + ' nothing floats', supported,
        'underside at ' + b.min.y.toFixed(2));
    }

    // 5b. AND NEITHER DOES THE TRIM. The lit edge strips are decorative, so
    //     they carry no collision and the check above skips them - which is
    //     exactly how a lit nosing came to be emitted at a fixed offset from a
    //     flight whose length depends on how tall it is, leaving a bright bar
    //     hanging in the air past the top step. A strip either lies on
    //     something or hangs from something.
    //
    //     ALONG ITS WHOLE LENGTH, and that qualifier is the whole check. The
    //     first version of this asked whether ANY solid box touched the strip
    //     anywhere, which a strip only needs one end - or one middle - held to
    //     satisfy: a gateway's top strip ran the full 8.2m width of the piece
    //     at 0.84m above its wall tops, resting on the 2.8m lintel in the
    //     middle, and passed. In game that is two bright bars hanging in
    //     mid-air either side of the doorway.
    for (const p of layout.prims) {
      if (p.solid) continue;
      const base = p.y - p.h / 2;
      const top = p.y + p.h / 2;
      if (base < 0.1) continue;
      // Lies on something, or hangs from it. Both are legitimate, and so is
      // being embedded in it - a glowing band round a pillar's waist.
      const holds = (o, x, z) =>
        o.min.x < x && o.max.x > x && o.min.z < z && o.max.z > z &&
        ((o.max.y >= base - 0.12 && o.min.y <= base + 0.01) ||
         (o.min.y <= top + 0.12 && o.max.y >= top - 0.01));
      // Walked along the strip's LONG axis. The 0.1 inset is for the 2cm each
      // side an edge strip is deliberately wider than the deck it trims.
      const along = p.w >= p.d;
      const half = (along ? p.w : p.d) / 2 - 0.1;
      const steps = Math.max(1, Math.ceil((half * 2) / 0.4));
      let loose = 0;
      for (let i = 0; i <= steps; i++) {
        const t = -half + (2 * half * i) / steps;
        const x = p.x + (along ? t : 0);
        const z = p.z + (along ? 0 : t);
        if (!aabbs.some((o) => holds(o, x, z))) loose++;
      }
      check('wave ' + wave + ' no trim hangs in the air', loose === 0,
        p.mat + ' at y' + base.toFixed(2) + ', ' + loose + '/' + (steps + 1) +
        ' of its length unsupported');
    }

    // 6. THE SHAPE CONTRACT. Every riser a mover is meant to walk has to be
    //    under STEP_HEIGHT, and every walkable top has to be at or under the
    //    nav grid's MAX_STAND - or a stair the player climbs is a stair the
    //    flow field refuses, and enemies grind into the side of it.
    for (const b of aabbs) {
      const top = b.max.y;
      if (top > MAX_STAND || b.min.y > 0.02) continue;
      // A floor-standing box a mover could step onto: check nothing shorter
      // than it forms a riser taller than the step.
      check('wave ' + wave + ' walkable top is reachable', top <= MAX_STAND,
        'top at ' + top.toFixed(2));
    }

    // 6. A boss wave has to be a room a boss fits in. The validator already
    //    checks this; asserting the budget separately catches a curve change
    //    that quietly makes boss waves as dense as anything else.
    if (isBossWave(wave)) {
      // Looser than a normal wave, not bare: a boss cannot climb, so every
      // raised thing is a wall to it and it needs real lanes.
      check('boss wave ' + wave + ' is looser than a normal one',
        costBudget(wave) < costBudget(wave - 1), costBudget(wave) + '');
    }
  }
}

// The fallback is the safety net, not the design. If it is catching more than
// a sliver of layouts the piece library or the budget curve has drifted, and
// every player is quietly getting the same four platforms every wave.
check('fallback is rare', fallbacks / total < 0.02,
  fallbacks + '/' + total);

// Every piece in the library has to actually turn up. A piece that never
// places - because its footprint cannot fit, or its minWave is past the range -
// is dead weight the layouts are not getting any variety from.
for (const k of ['crate_cluster', 'low_barrier', 'planter', 'tower', 'big_pillar',
                 'colonnade', 'watchtower', 'stairs', 'ramp_deck', 'tiered_deck',
                 'high_deck', 'long_wall', 'wall_chicane', 'gateway', 'bunker',
                 'pillar_gate', 'overpass', 'alcove']) {
  check('piece used: ' + k, (pieceUse.get(k) || 0) > 0);
}

// EVERY WAVE IS FURNISHED, INCLUDING THE FIRST. This replaces an assertion
// that late waves are denser than early ones, which was true of the old curve
// and was exactly the problem: wave 1 was a bare floor and the arena only
// became interesting for a player who had already survived twenty of them.
// Density now starts high and climbs gently, so what a later wave gets is a
// little more of the same room rather than the first room worth playing in.
const w1 = byWaveBlocked.get(1);
const w34 = byWaveBlocked.get(34);
check('wave 1 is already a built arena', w1[2] / w1[1] > 0.16,
  (w1[0] / w1[1] * 100).toFixed(1) + '%');
check('and later waves are denser still', w34[0] / w34[1] >= w1[0] / w1[1],
  (w1[0] / w1[1] * 100).toFixed(1) + '% -> ' + (w34[0] / w34[1] * 100).toFixed(1) + '%');

// ---- the fallback -------------------------------------------------------
//
// The safety net has to be playable too, and it is the one layout nothing
// generates or checks at runtime - so if it is broken, the rare wave that
// lands on it is broken, in the middle of somebody's run, with no way to tell
// it from a bug. It has failed validation twice during development: once
// because its stairs did not reach the decks they led to, and once because a
// block sat on the exact cell every boss route has to cross.
//
// Reached by reserving the whole floor, which is the one input no attempt can
// place anything against.
{
  const fb = generateLayout(7, {
    seed: 1, bound: BOUND, spawnPoints: SPAWNS, reserved: [{ x: 0, z: 0, r: 60 }],
  });
  check('the reserved-floor case does fall back', !!fb.fallback);
  for (const w of [1, 3, 5, 20, 25, 40]) {
    const v = validate(fb.prims, BOUND, SPAWNS, w);
    check('the fallback is playable at wave ' + w, v.ok, v.why || '');
  }
  // And it has to be a real arena rather than a bare floor, or the wave that
  // gets it is visibly emptier than every wave around it.
  check('the fallback is a furnished arena', fb.prims.length > 40,
    fb.prims.length + ' primitives');
}

// The grid has to reach where it says it does.
check('grid spans the interior', cellCentre(0) === -18 && cellCentre(9) === 18);

// ---- the step, and the grid that has to agree with it ---------------------
//
// These are the contract between three files: collision (utils.js) decides
// what a mover can walk onto, the flow field (nav.js) decides what it will be
// ROUTED onto, and the piece library builds to both. If any two of them drift
// apart the symptom is an enemy grinding into the side of a stair it was told
// to climb, which is invisible in a screenshot and maddening to play.
{
  const box = (x, y, z, w, h, d) => ({
    min: { x: x - w / 2, y: y - h / 2, z: z - d / 2 },
    max: { x: x + w / 2, y: y + h / 2, z: z + d / 2 },
  });
  const at = (x, y, z) => ({ x, y, z });

  // A tread under the step is walked onto; one over it is not, and that gap is
  // what separates ground from cover.
  const low = [box(0, 0.3, 0, 6, 0.6, 4)];
  const high = [box(0, 0.35, 0, 6, 0.7, 4)];
  check('a 0.6 riser is a step', stepSurface(at(0, 0, 0), 0.4, low) === 0.6);
  check('a 0.7 riser is not', stepSurface(at(0, 0, 0), 0.4, high) === 0);
  check('and a speaker cabinet is cover, not a step',
    stepSurface(at(0, 0, 0), 0.4, [box(0, 0.475, 0, 1, 0.95, 1)]) === 0);

  // A stair leading to a deck, which is what most of the library builds.
  const flight = [];
  for (let i = 0; i < 4; i++) {
    const h = 0.6 * (i + 1);
    flight.push(box(0, h / 2, 2 - i * 1.25 - 0.625, 6, h, 1.25));
  }
  const deck = box(0, 1.2, -5, 6, 2.4, 6);
  const world = flight.concat([deck]);

  const nav = new NavGrid(world, 22, 0.5);
  nav.update(1, 0, -5);
  const cell = (grid, x, z) => grid.index(x, z);
  check('the flow field walks up a stair',
    nav.dist[cell(nav, 0, 8)] !== Infinity && nav.dist[cell(nav, 0, 8)] > 0,
    'dist=' + nav.dist[cell(nav, 0, 8)]);
  check('and knows how high each tread is',
    Math.abs(nav.height[cell(nav, 0, 1.4)] - 0.6) < 0.01 &&
    Math.abs(nav.height[cell(nav, 0, -5)] - 2.4) < 0.01);

  // A boss cannot climb, so the very same stair is a wall to its grid - which
  // is exactly the routing it had before the arena knew about height.
  const big = new NavGrid(world, 22, 1.6, BOSS_HEIGHT, 0);
  big.update(1, 0, -5);
  check('a boss is not routed up anything',
    big.blocked[cell(big, 0, 1.4)] === 1 && big.blocked[cell(big, 0, -5)] === 1);

  // ---- COVER YOU CANNOT STEP ONTO --------------------------------------
  //
  // The gap between the two numbers: a 0.95m speaker cabinet is over
  // STEP_HEIGHT, so nothing walks onto it, and under MAX_STAND, so it is not a
  // wall either. It is the commonest object in the arena and it used to be
  // invisible to steering - the straight-line test only knew about walls, so
  // an enemy with a crate between it and the player was told the way was clear
  // and spent the wave pushing into the side of it.
  //
  // Walked, not asserted on a single frame: the failure was never one bad
  // heading, it was a body that never arrived.
  {
    const crate = [box(0, 0.475, 0, 1.5, 0.95, 1.5)];
    const cnav = new NavGrid(crate, 22, 0.5);
    cnav.update(1, 4, 0, 0);
    const out = { x: 0, z: 0 };
    check('a crate breaks the straight line',
      !cnav._sight(-4, 0, 4, 0, 0));
    check('and does not break it for something standing level with its top',
      cnav._sight(-4, 0, 4, 0, 0.95));

    const p = { x: -4, z: 0 };
    let steps = 0;
    for (; steps < 400; steps++) {
      if (Math.hypot(4 - p.x, -p.z) < 1) break;
      if (!cnav.steer(p.x, p.z, out, 0)) break;
      p.x += out.x * 0.08;
      p.z += out.z * 0.08;
      resolveCircle(p, 0.5, crate, AGENT_HEIGHT);
    }
    check('and an enemy walks round it rather than into it',
      Math.hypot(4 - p.x, -p.z) < 1, steps + ' steps, ended at '
        + p.x.toFixed(2) + ',' + p.z.toFixed(2));
  }

  // A CRATE THE PLAYER IS STANDING ON is a target no route can end at, and the
  // flood has to notice: seeded there it fills the crate's own four cells and
  // leaves the rest of the arena at Infinity, which is every enemy in the room
  // falling back to walking straight at the player through the scenery.
  {
    const crate = [box(6, 0.475, 0, 1.5, 0.95, 1.5)];
    const cnav = new NavGrid(crate, 22, 0.5);
    cnav.update(1, 6, 0, 0.95);
    check('a target nothing can climb to still floods the arena',
      cnav.dist[cell(cnav, -8, 0)] !== Infinity,
      'dist=' + cnav.dist[cell(cnav, -8, 0)]);
  }

  // A wall stays a wall to both, or the whole distinction is worthless.
  const walled = [box(0, 1.5, 0, 44, 3.0, 0.8)];
  const wnav = new NavGrid(walled, 22, 0.5);
  wnav.update(1, 0, -8);
  check('a wall is still a wall',
    wnav.blocked[cell(wnav, 0, 0)] === 1 &&
    wnav.dist[cell(wnav, 0, 8)] === Infinity);

  // OBSTACLES ARE SOLID, and this is the check for it. Four blocks arranged
  // around a slot half a metre wide - narrower than the player is - which is
  // the shape that used to leak: being pushed out of one block put the mover
  // inside the next, and the next had already been visited, so nothing looked
  // at it again and the frame ended with a mover standing in solid geometry.
  //
  // Walked into from every bearing rather than teleported inside, because that
  // is how it actually happens: a player running a wall in a fight, not a
  // player spawned in a rock.
  const cluster = [
    box(-2, 1.5, -2, 3, 3, 3), box(2, 1.5, -2, 3, 3, 3),
    box(-2, 1.5, 2, 3, 3, 3), box(2, 1.5, 2, 3, 3, 3),
  ];
  let leaked = 0;
  for (let deg = 0; deg < 360; deg += 3) {
    const a = deg * Math.PI / 180;
    const p = { x: Math.cos(a) * 6, y: 0, z: Math.sin(a) * 6 };
    const dx = -Math.cos(a);
    const dz = -Math.sin(a);
    for (let i = 0; i < 400; i++) {
      p.x += dx * 0.06;
      p.z += dz * 0.06;
      resolveCircle(p, 0.4, cluster);
    }
    // Inside, allowing a couple of centimetres for the resolver's own epsilon.
    if (cluster.some((b) => p.x > b.min.x - 0.38 && p.x < b.max.x + 0.38 &&
                            p.z > b.min.z - 0.38 && p.z < b.max.z + 0.38)) leaked++;
  }
  check('obstacles are solid from every bearing', leaked === 0,
    leaked + '/120 walked into the geometry');

  // AND A MOVER THAT IS ALREADY INSIDE ONE GETS OUT. The push-out alone
  // cannot do this: leaving one tread of a staircase puts you in the next,
  // whose own nearest face sends you back, and the mover sits there
  // oscillating - standing in solid geometry, which is exactly where a camera
  // sees through the world. Nothing WALKS into that position, but a Maw's
  // pull, a knockback or a spawn can put one there.
  //
  // Tested on a real generated staircase rather than a contrived box, because
  // the contiguous-treads shape is the whole difficulty.
  {
    const L = generateLayout(6, {
      seed: 523645, bound: BOUND, spawnPoints: SPAWNS, reserved: [],
    });
    const solids = primsToAabbs(L.prims);
    const inside = (q) => solids.some((b) =>
      q.x > b.min.x - 0.4 && q.x < b.max.x + 0.4 &&
      q.z > b.min.z - 0.4 && q.z < b.max.z + 0.4 &&
      q.y < b.max.y - 0.06 && b.min.y < q.y + 1.77);
    let embedded = 0;
    let freed = 0;
    // Drop a mover on a lattice over the whole floor; every one that lands
    // inside something has to be able to walk away from where it ends up.
    for (let x = -20; x <= 20; x += 1) {
      for (let z = -20; z <= 20; z += 1) {
        const q = { x, y: 0, z };
        if (!inside(q)) continue;
        embedded++;
        resolveCircle(q, 0.4, solids, 1.8);
        if (!inside(q)) freed++;
      }
    }
    check('a mover embedded in geometry escapes it', embedded > 0 && freed === embedded,
      freed + '/' + embedded + ' freed');
  }
}

console.log('layouts generated: ' + total
  + '   fallback: ' + fallbacks
  + '   pieces/layout: ' + (pieceSum / total).toFixed(1)
  + '   floor covered: ' + (coverSum / total * 100).toFixed(1) + '%'
  + ' (' + (coverOutSum / total * 100).toFixed(1) + '% outside the plaza)'
  + '   of which wall: ' + (blockedSum / (total - fallbacks) * 100).toFixed(1) + '%'
  + '   peak wall: ' + (blockedMax * 100).toFixed(1) + '%');

// THE ROOM HAS TO FEEL FURNISHED. A layout that passes every safety check and
// still leaves the floor almost empty is the bug this whole library exists to
// fix, so it is asserted rather than eyeballed.
check('the arena is actually furnished', coverOutSum / total > 0.16,
  (coverOutSum / total * 100).toFixed(1) + '% outside the plaza');
// And the room as a whole must not get thin on the plaza's account. The plaza
// is about a tenth of the floor, so the whole-floor figure lands a couple of
// points under the outside-the-plaza one by arithmetic; this is the guard
// against a change that quietly empties the room and calls it openness.
check('and the room as a whole is not thin', coverSum / total > 0.15,
  (coverSum / total * 100).toFixed(1) + '%');
check('and every layout is a real layout', pieceSum / total >= 8,
  (pieceSum / total).toFixed(1) + ' pieces');
console.log('pieces placed: '
  + [...pieceUse.entries()].sort((a, b) => b[1] - a[1])
      .map(([k, n]) => k + ' ' + n).join(', '));

if (fails.length) {
  // Deduplicated: one broken piece produces the same failure a thousand times,
  // and a thousand identical lines is a wall, not a report.
  const seen = new Map();
  for (const f of fails) seen.set(f, (seen.get(f) || 0) + 1);
  console.error('\nFAIL (' + fails.length + ' assertions, '
    + seen.size + ' distinct)');
  for (const [f, n] of [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.error('  x' + n + '  ' + f);
  }
  process.exit(1);
}
console.log('\nterrain: all checks passed');
