import { probeEighth } from '../../passive-eighth-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeEighth(page, id);
  check('Sidechain pulses one point across the room, once per press',
    result.ok, result.detail);
}
