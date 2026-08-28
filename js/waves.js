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

export function waveEnemyCount(n) {
  return Math.min(5 + Math.floor(n * 2.5), 36);
}

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
