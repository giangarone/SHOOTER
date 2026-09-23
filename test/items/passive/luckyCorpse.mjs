import { probeSeventh } from '../../passive-seventh-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeSeventh(page, id);
  check("Lucky Corpse drops three health and three ammo", result.ok, result.detail);
}

