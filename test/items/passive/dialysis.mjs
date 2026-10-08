import { probeSeventh } from '../../helpers/passive-seventh-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeSeventh(page, id);
  check("Dialysis produces three poison ticks over two beats", result.ok, result.detail);
}

