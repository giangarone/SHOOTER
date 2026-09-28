// The same short arc is checked by navigation before it offers a jump and
// played by Enemy after it accepts one. Keeping the two together prevents a
// route from promising a landing that collision will refuse halfway through.

export const JUMP_RISE = 1.45;
export const BOSS_JUMP_RISE = 1.6;
export const JUMP_RANGE = 3.5;
export const BOSS_JUMP_RANGE = 6.5;
export const JUMP_COST = 2.5; // grid cells of time spent taking off and landing

export function jumpProgress(t) {
  if (t <= 0.22) return 0;
  if (t >= 0.78) return 1;
  const u = (t - 0.22) / 0.56;
  return u * u * (3 - 2 * u);
}

export function jumpY(from, to, lift, t) {
  return from + (to - from) * t + Math.sin(Math.PI * t) * lift;
}

// The feet clear the tallest crossed surface before the horizontal part of
// the jump begins. The arc has a short takeoff and landing, so an enemy does
// not slide through the side of a crate while its feet are still on the floor.
export function jumpLift(from, to, highest) {
  return Math.max(0.7, (highest - Math.min(from, to) + 0.12) / Math.sin(Math.PI * 0.22));
}

export function jumpClear(ax, ay, az, bx, by, bz, radius, bodyHeight, lift, obstacles) {
  // The largest boss covers more than six metres in one arc. A fixed twenty
  // samples can skip a thin wall between two positions near the fast middle
  // of that flight; sample density follows the length instead.
  const samples = Math.max(20, Math.ceil(Math.hypot(bx - ax, bz - az) * 16));
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = jumpProgress(t);
    const x = ax + (bx - ax) * u;
    const z = az + (bz - az) * u;
    const y = jumpY(ay, by, lift, t);
    for (const b of obstacles) {
      if (x <= b.min.x - radius || x >= b.max.x + radius ||
          z <= b.min.z - radius || z >= b.max.z + radius) continue;
      if (y < b.max.y - 0.06 && y + bodyHeight > b.min.y + 0.03) return false;
    }
  }
  return true;
}
