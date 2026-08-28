import { shuffle } from './utils.js';

export function waveConfig(n) {
  const count = Math.min(5 + Math.floor(n * 2.5), 36);
  const shooterRatio = Math.min(0.15 + n * 0.04, 0.45);
  const hpScale = 1 + (n - 1) * 0.18;
  const speedScale = 1 + (n - 1) * 0.04;
  const dmgScale = 1 + (n - 1) * 0.05;
  const spawnInterval = Math.max(0.35, 1.1 - n * 0.05);
  const shooters = Math.min(count, Math.round(count * shooterRatio));
  const queue = [];
  for (let i = 0; i < count; i++) queue.push(i < shooters ? 'shooter' : 'chaser');
  shuffle(queue);
  return { queue, hpScale, speedScale, dmgScale, spawnInterval };
}