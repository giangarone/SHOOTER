import { shuffle } from './utils.js';

const ENEMY_POOL = ['chaser', 'shooter', 'tank', 'sniper', 'splitter', 'bomber'];
const ENEMY_WEIGHTS = [0.35, 0.20, 0.10, 0.10, 0.15, 0.10];

function pickWeightedType() {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < ENEMY_WEIGHTS.length; i++) {
    acc += ENEMY_WEIGHTS[i];
    if (r <= acc) return ENEMY_POOL[i];
  }
  return ENEMY_POOL[ENEMY_POOL.length - 1];
}

export function waveConfig(n) {
  const count = Math.min(5 + Math.floor(n * 2.5), 36);
  const hpScale = 1 + (n - 1) * 0.18;
  const speedScale = 1 + (n - 1) * 0.04;
  const dmgScale = 1 + (n - 1) * 0.05;
  const spawnInterval = Math.max(0.35, 1.1 - n * 0.05);
  const queue = [];
  for (let i = 0; i < count; i++) queue.push(pickWeightedType());
  return { queue, hpScale, speedScale, dmgScale, spawnInterval };
}