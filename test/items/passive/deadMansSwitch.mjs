import { probeSeventh } from '../../passive-seventh-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeSeventh(page, id);
  check("Dead Man's Switch arms below ten percent and hits all", result.ok, result.detail);
}

