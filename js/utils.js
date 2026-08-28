export function resolveCircle(pos, radius, obstacles) {
  for (const b of obstacles) {
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
      const m = Math.min(pl, pr, zl, zr);
      if (m === pl) pos.x = minX;
      else if (m === pr) pos.x = maxX;
      else if (m === zl) pos.z = minZ;
      else pos.z = maxZ;
    }
  }
}

export function pointInObstacle(p, obstacles) {
  for (const b of obstacles) {
    if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z) return true;
  }
  return false;
}

export function makeAabb(x, y, z, w, h, d) {
  return {
    min: { x: x - w / 2, y: y - h / 2, z: z - d / 2 },
    max: { x: x + w / 2, y: y + h / 2, z: z + d / 2 },
  };
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}