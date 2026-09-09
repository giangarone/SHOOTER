// Collision helpers. The whole game collides in 2D: entities are circles on
// the XZ plane, obstacles are axis-aligned boxes. Y is handled separately by
// the player's step-up test in player.js. Nothing here touches three.js.
//
// An "obstacle" is a plain {min:{x,y,z}, max:{x,y,z}} box from makeAabb(),
// not a THREE.Box3.

// How tall an ordinary ground agent is. This is the line between "cover you
// walk around" and "a walkway you walk under", and THREE separate systems have
// to agree on it or they contradict each other: this collision resolver, the
// NavGrid bake in nav.js, and the `ground` obstacle list in arena.js that
// enemy fire collides with. They all import this rather than each spelling out
// a number, because a catwalk that blocks pathing but not bullets - or the
// reverse - is a maddening bug to track down.
//
// Movers that are not this tall pass their own: the player (shorter) and
// bosses (much taller) both do.
export const AGENT_HEIGHT = 2.5;
// Bosses are 2.2x to 3.2x scale and stand several metres tall, so anything
// suspended overhead is a wall to them rather than something to duck under.
// main.js bakes navBig with this, and boss collision uses it too - if the two
// disagreed, the flow field would route a boss around a deck that collision
// would happily let it walk through.
export const BOSS_HEIGHT = 5;

// THE STEP. How far up a mover walks without being asked to jump.
//
// Everything in the arena is generated now, and generated terrain is made of
// stacked boxes: a stair is four of them, a tiered platform is three. Without
// a step, every one of those edges is a wall you stop dead against and have to
// jump - which turns a staircase into four separate jumps and makes a dense
// arena feel like it is made of furniture rather than of ground.
//
// 0.62 is chosen against the library rather than picked: the tallest single
// riser terrain builds is 0.6 (see terrain.js), so every stair in the game
// walks, and the shortest thing that is meant to be COVER is a 0.95 speaker
// cabinet, which does not. That gap is the whole design - a mover steps onto
// anything shaped like ground and stops against anything shaped like an
// obstacle - and it is why the two numbers must not drift toward each other.
//
// The player, ground enemies and the nav grid all import this. A grid that
// disagreed with collision would route enemies up a step they then bounce off,
// which is the single most maddening class of bug in this file's history.
export const STEP_HEIGHT = 0.62;

// Pushes `pos` out of any box it overlaps, along whichever axis needs the
// smallest correction. Mutates `pos` in place.
//
// `height` is how tall the mover is, and only matters for geometry suspended
// overhead - see the second skip below.
// How many times the push-out below is repeated. ONE PASS IS NOT ENOUGH once
// the arena is built out of clustered boxes: each box is resolved on its own,
// so being pushed out of a stair's second step can put the mover inside its
// third - and the third was already visited, so nothing looks at it again and
// the mover ends the frame standing inside solid geometry.
//
// That is exactly the "obstacles are not quite solid" symptom: not a gap in
// the test, but a correction that was undone by the next box in the list.
// Three passes settles every arrangement the piece library can build; the loop
// exits early the moment a pass moves nothing, so open ground still costs one.
const RESOLVE_PASSES = 3;

export function resolveCircle(pos, radius, obstacles, height = AGENT_HEIGHT) {
  for (let pass = 0; pass < RESOLVE_PASSES; pass++) {
    if (!resolvePass(pos, radius, obstacles, height)) break;
  }
  escape(pos, radius, obstacles, height);
}

// One push-out sweep. Returns true if anything moved, so the loop above can
// stop as soon as the position is settled.
function resolvePass(pos, radius, obstacles, height) {
  let moved = false;
  for (const b of obstacles) {
    // Standing on top of the box: the mover is supported, not intersecting, so
    // pushing sideways here would shove them off every ledge.
    if (pos.y >= b.max.y - 0.06) continue;
    // The mirror image: a deck suspended above head height is something you
    // walk UNDER, not into. Without this every raised walkway would carve an
    // invisible pillar all the way down to the floor.
    //
    // THE EPSILON IS LOAD-BEARING, and it pairs this test with the player's
    // ceiling check. That check stops a jump with the head EXACTLY on a deck's
    // underside - the one position where a strict `>` here decides the mover
    // is no longer underneath, and shoves them sideways out from under the
    // deck. Touching the underside is being under it.
    if (b.min.y >= pos.y + height - 0.03) continue;
    const minX = b.min.x - radius;
    const maxX = b.max.x + radius;
    const minZ = b.min.z - radius;
    const maxZ = b.max.z + radius;
    if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
      const pl = pos.x - minX;
      const pr = maxX - pos.x;
      const zl = pos.z - minZ;
      const zr = maxZ - pos.z;
      // Distance to each face of the expanded box; exit through the nearest.
      const m = Math.min(pl, pr, zl, zr);
      if (m === pl) pos.x = minX;
      else if (m === pr) pos.x = maxX;
      else if (m === zl) pos.z = minZ;
      else pos.z = maxZ;
      moved = true;
    }
  }
  return moved;
}

// How far the escape below will look for open ground, and in what steps. Eight
// metres covers the widest solid mass the piece library can build - a
// staircase run plus the deck it leads to - and a quarter of a metre is finer
// than any gap a mover could stand in anyway.
const ESCAPE_REACH = 8;
const ESCAPE_STEP = 0.25;

// ---- getting OUT of solid geometry ---------------------------------------
//
// The push-out above assumes the mover is TOUCHING a box - overlapping its
// edge, on the way past. It has no answer for a mover fully inside a mass of
// them, and worse, it oscillates: leaving one tread of a staircase puts you in
// the next, whose own nearest face sends you straight back. The mover ends the
// frame exactly where it started, standing inside solid geometry - which is
// precisely where a camera sees through the world.
//
// That is not hypothetical here. A staircase is four or five treads standing
// edge to edge, and anything that MOVES A MOVER WITHOUT WALKING IT - a Maw's
// pull, a knockback, a spawn, a run starting - can drop one into the middle of
// it.
//
// So this does not push, it SEARCHES: step outward along each of the four axes
// until a position is found that overlaps nothing, and take the nearest. It
// cannot oscillate, because it never moves anywhere it has not already checked
// is clear. It runs only for a mover that is genuinely embedded - the common
// case pays one overlap scan that finds nothing and returns.
function escape(pos, radius, obstacles, height) {
  if (!overlapsAny(pos.x, pos.z, pos.y, radius, obstacles, height)) return;
  let bestX = pos.x;
  let bestZ = pos.z;
  let bestD = Infinity;
  for (let d = ESCAPE_STEP; d <= ESCAPE_REACH; d += ESCAPE_STEP) {
    // Nearest first, so the first distance that yields anything wins and the
    // mover leaves by the shortest route out.
    for (let k = 0; k < 4; k++) {
      const x = pos.x + (k === 0 ? d : k === 1 ? -d : 0);
      const z = pos.z + (k === 2 ? d : k === 3 ? -d : 0);
      if (overlapsAny(x, z, pos.y, radius, obstacles, height)) continue;
      if (d < bestD) {
        bestD = d;
        bestX = x;
        bestZ = z;
      }
    }
    if (bestD < Infinity) break;
  }
  pos.x = bestX;
  pos.z = bestZ;
}

// Does a circle at (x, z) on this mover's level overlap anything solid? Same
// two skips resolveCircle uses, so the two can never disagree about what
// counts as being inside something.
function overlapsAny(x, z, y, radius, obstacles, height) {
  for (const b of obstacles) {
    if (y >= b.max.y - 0.06) continue;
    if (b.min.y >= y + height - 0.03) continue;
    if (x > b.min.x - radius && x < b.max.x + radius &&
        z > b.min.z - radius && z < b.max.z + radius) return true;
  }
  return false;
}

/**
 * The surface a GROUND-LOCKED mover belongs on at `pos`: the top of the
 * highest box it overlaps that is within one step above its feet, or the floor
 * when there is nothing under it.
 *
 * Unlike stepSurface this looks DOWN as well as up, because a mover with no
 * jump of its own has no other way to come off a stair - it is not falling,
 * it is walking, and the ground under it simply changes height. The caller
 * decides how fast to descend; going up is instant, which is what a step is.
 */
export function groundSurface(pos, radius, obstacles, step = STEP_HEIGHT) {
  let best = 0;
  const ceil = pos.y + step;
  for (const b of obstacles) {
    const top = b.max.y;
    if (top <= best || top > ceil) continue;
    if (pos.x <= b.min.x - radius || pos.x >= b.max.x + radius) continue;
    if (pos.z <= b.min.z - radius || pos.z >= b.max.z + radius) continue;
    best = top;
  }
  return best;
}

/**
 * The highest surface a mover standing at `pos` may step up onto.
 *
 * Only boxes the mover's circle actually overlaps count, and only those whose
 * top is within `step` of the mover's feet - so this finds the stair tread in
 * front of you and never the wall beside it. Returns the current foot height
 * when there is nothing to climb, so the caller can compare and move on.
 *
 * IT ONLY EVER LOOKS UP. Stepping DOWN is gravity's job: snapping a mover down
 * onto whatever is beneath them would glue them to the floor over a gap and
 * take away the fall off the end of a platform, which is a real part of moving
 * around up there.
 *
 * @param {{x:number,y:number,z:number}} pos
 * @param {number} radius
 * @param {object[]} obstacles
 * @param {number} step   how far up is walkable - STEP_HEIGHT for everything
 *   that is not deliberately different
 */
export function stepSurface(pos, radius, obstacles, step = STEP_HEIGHT) {
  let best = pos.y;
  const ceil = pos.y + step;
  for (const b of obstacles) {
    const top = b.max.y;
    // Already at or above it, or too tall to walk onto. The second test is
    // what keeps a wall a wall: a mover cannot climb a 2.6m slab 0.62m at a
    // time, because a slab is ONE box whose top is out of reach in one go.
    if (top <= best || top > ceil) continue;
    if (pos.x <= b.min.x - radius || pos.x >= b.max.x + radius) continue;
    if (pos.z <= b.min.z - radius || pos.z >= b.max.z + radius) continue;
    best = top;
  }
  return best;
}

// True if a point is inside any box. Used by projectiles, which are treated as
// points rather than circles.
export function pointInObstacle(p, obstacles) {
  for (const b of obstacles) {
    if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z) return true;
  }
  return false;
}

// Centre + size -> min/max box. x,y,z is the centre, w,h,d the full extents.
export function makeAabb(x, y, z, w, h, d) {
  return {
    min: { x: x - w / 2, y: y - h / 2, z: z - d / 2 },
    max: { x: x + w / 2, y: y + h / 2, z: z + d / 2 },
  };
}

// True if the straight XZ segment a->b clears every obstacle, treating the
// mover as a circle of `radius` (each box is expanded by it, the standard
// Minkowski trick). Used by the navigation grid to decide whether an enemy can
// simply walk at the player, and to shortcut the corners off a grid path.
//
// Slab test per box: clip the segment's [0,1] parameter range against the x
// and z spans in turn. If a range survives both, the segment is inside that
// box somewhere along its length.
// `standY` is the height the LINE is being fired from, and boxes whose tops are
// at or below it are skipped. It exists for one case: a turret standing on a
// platform is inside that platform's XZ footprint, and a test with no Y at all
// answers "blocked" for every line out of it - so a gun placed on top of the
// arena's own geometry could never see anything. Left at -Infinity by default,
// so every existing caller behaves exactly as it did: a knee-high crate still
// stops a shot from a gun on the floor beside it.
export function segmentClear(ax, az, bx, bz, radius, obstacles, standY = -Infinity) {
  const dx = bx - ax;
  const dz = bz - az;
  for (const o of obstacles) {
    if (o.max.y <= standY + 0.06) continue;
    const minX = o.min.x - radius;
    const maxX = o.max.x + radius;
    const minZ = o.min.z - radius;
    const maxZ = o.max.z + radius;
    let t0 = 0;
    let t1 = 1;
    // A near-zero component means the segment is parallel to that pair of
    // faces: it either starts between them for its whole length or misses the
    // box outright, and there is no range to clip.
    if (Math.abs(dx) < 1e-8) {
      if (ax < minX || ax > maxX) continue;
    } else {
      let ta = (minX - ax) / dx;
      let tb = (maxX - ax) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-8) {
      if (az < minZ || az > maxZ) continue;
    } else {
      let ta = (minZ - az) / dz;
      let tb = (maxZ - az) / dz;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    return false;
  }
  return true;
}
