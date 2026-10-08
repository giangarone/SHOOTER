import { probeSeventh } from '../../helpers/passive-seventh-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeSeventh(page, id);
  check("Spendthrift scales with shots this wave", result.ok, result.detail);
}

