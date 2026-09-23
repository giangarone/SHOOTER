import { probeSeventh } from '../../passive-seventh-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeSeventh(page, id);
  check("Zero Waste pays an ammo crate again at half value", result.ok, result.detail);
}

