import { probeEighth } from '../../passive-eighth-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeEighth(page, id);
  check('Midi Cable rerolls the carried item, fully charged, and only that',
    result.ok, result.detail);
}
