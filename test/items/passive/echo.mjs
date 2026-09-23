import { probeEighth } from '../../passive-eighth-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeEighth(page, id);
  check('Echo bounces off the room twice and skipstone still only off the floor',
    result.ok, result.detail);
}
