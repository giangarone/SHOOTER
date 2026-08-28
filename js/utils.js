// Collision helpers. The whole game collides in 2D: entities are circles on
// the XZ plane, obstacles are axis-aligned boxes. Y is handled separately by
// the player's step-up test in player.js. Nothing here touches three.js.
//
// An "obstacle" is a plain {min:{x,y,z}, max:{x,y,z}} box from makeAabb(),
// not a THREE.Box3.

// Pushes `pos` out of any box it overlaps, along whichever axis needs the
// smallest correction. Mutates `pos` in place.
export function resolveCircle(pos, radius, obstacles) {
  for (const b of obstacles) {
    // Standing on top of the box: the player is supported, not intersecting,
    // so pushing sideways here would shove them off every ledge.
    if (pos.y >= b.max.y - 0.06) continue;
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
