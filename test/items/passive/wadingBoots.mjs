import { probeSeventh } from '../../passive-seventh-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeSeventh(page, id);
  check("Wading Boots replace pool damage with a slow", result.ok, result.detail);
}

