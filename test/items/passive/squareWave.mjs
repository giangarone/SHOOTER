import { probeEighth } from '../../passive-eighth-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeEighth(page, id);
  check('Square Wave doubles the odd pulls and leaves the even ones plain',
    result.ok, result.detail);
}
