import { probeEighth } from '../../passive-eighth-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeEighth(page, id);
  check('Chorus adds two 60%-damage projectiles per shot for one round',
    result.ok, result.detail);
}
