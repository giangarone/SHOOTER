// Wave difficulty curve. Pure data + maths: no three.js, no game state, no
// side effects. main.js calls waveConfig() once when a wave starts and reads
// the scale factors from it for the rest of the wave.

// Spawn mix, same order in both arrays. Weights are relative, not required to
// sum to 1. Keys must match ENEMY_TYPES in enemy.js.
const ENEMY_POOL = ['chaser', 'shooter', 'tank', 'sniper', 'splitter', 'bomber'];
const ENEMY_WEIGHTS = [0.35, 0.20, 0.10, 0.10, 0.15, 0.10];
const WEIGHT_TOTAL = ENEMY_WEIGHTS.reduce((a, b) => a + b, 0);

function pickWeightedType() {
  let r = Math.random() * WEIGHT_TOTAL;
  for (let i = 0; i < ENEMY_WEIGHTS.length; i++) {
    r -= ENEMY_WEIGHTS[i];
    if (r <= 0) return ENEMY_POOL[i];
  }
  return ENEMY_POOL[ENEMY_POOL.length - 1];
}

// Enemies in wave n. powerups.js derives its pickup count from this, so the
// two can't drift apart.
export function waveEnemyCount(n) {
  return Math.min(5 + Math.floor(n * 2.5), 36);
}

// Everything wave n needs. `queue` is a fresh array that main.js shifts from
// as it spawns; the scale factors multiply the base stats in ENEMY_TYPES.
// spawnInterval is seconds between spawns, floored so late waves stay sane.
export function waveConfig(n) {
  const count = waveEnemyCount(n);
  const hpScale = 1 + (n - 1) * 0.18;
  const speedScale = 1 + (n - 1) * 0.04;
  const dmgScale = 1 + (n - 1) * 0.05;
  const spawnInterval = Math.max(0.35, 1.1 - n * 0.05);
  const queue = [];
  for (let i = 0; i < count; i++) queue.push(pickWeightedType());
  return { queue, hpScale, speedScale, dmgScale, spawnInterval };
}
