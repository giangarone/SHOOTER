import { probeSeventh } from '../../helpers/passive-seventh-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeSeventh(page, id);
  check("Blood Tax trades five max HP for damage", result.ok, result.detail);
}

