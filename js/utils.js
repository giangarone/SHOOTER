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
// Bosses are 2.2x to 3.2x scale and stand several metres tall, so the
// perimeter catwalks are a wall to them rather than something to duck under.
// main.js bakes navBig with this, and boss collision uses it too - if the two
// disagreed, the flow field would route a boss around a deck that collision
// would happily let it walk through.
export const BOSS_HEIGHT = 5;

// Pushes `pos` out of any box it overlaps, along whichever axis needs the
// smallest correction. Mutates `pos` in place.
//
// `height` is how tall the mover is, and only matters for geometry suspended
// overhead - see the second skip below.
export function resolveCircle(pos, radius, obstacles, height = AGENT_HEIGHT) {
  for (const b of obstacles) {
    // Standing on top of the box: the player is supported, not intersecting,
    // so pushing sideways here would shove them off every ledge.
    if (pos.y >= b.max.y - 0.06) continue;
    // The mirror image of the test above: a catwalk suspended above head
    // height is something you walk UNDER, not into. Without this every raised
    // walkway would carve an invisible pillar all the way down to the floor,
    // for enemies as well as the player.
    if (b.min.y > pos.y + height) continue;
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
    }
  }
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
export function segmentClear(ax, az, bx, bz, radius, obstacles) {
  const dx = bx - ax;
  const dz = bz - az;
  for (const o of obstacles) {
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
