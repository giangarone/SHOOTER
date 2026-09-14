# Active item test fragments

Add `<item-id>.mjs` beside this file and export
`async function run({ page, check, id })`. The shared `item-modules` suite
starts one real game and calls every fragment; no registry edit is needed.
