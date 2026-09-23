import { probeSeventh } from '../../passive-seventh-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeSeventh(page, id);
  check("Spray Economy stacks misses and resets on hit", result.ok, result.detail);
}

