import { probeSeventh } from '../../passive-seventh-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeSeventh(page, id);
  check("Thunderclap damages every enemy on reload", result.ok, result.detail);
}

