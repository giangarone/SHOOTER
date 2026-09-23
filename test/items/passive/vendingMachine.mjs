import { probeSeventh } from '../../passive-seventh-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeSeventh(page, id);
  check("Vending Machine drops a powerup and counts fifteen", result.ok, result.detail);
}

