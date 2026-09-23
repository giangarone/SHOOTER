import { probeSeventh } from '../../passive-seventh-probe.mjs';

export async function run({ page, check, id }) {
  const result = await probeSeventh(page, id);
  check("Zero Waste grants half an expiring crate wherever it lies, and nothing extra for walking over one", result.ok, result.detail);
}
