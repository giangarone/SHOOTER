import { probeEighth } from '../../passive-eighth-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeEighth(page, id);
  check('Wavetable carries one element per magazine, in order, on the reload',
    result.ok, result.detail);
}
