import { probeSeventh } from '../../passive-seventh-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeSeventh(page, id);
  check("Coin Laundry doubles full-health orbs", result.ok, result.detail);
}

