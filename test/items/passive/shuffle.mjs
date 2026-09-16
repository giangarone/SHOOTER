export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    // The pick's whole context is the build it lands in, so the test owns
    // one: two owned picks, then the shuffle pressed on top.
    const owned = { ...p.passiveItems };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];

    p.takePassiveItem('speedLoader');
    p.takePassiveItem('speedLoader');
    p.takePassiveItem('speedLoader');
    p.takePassiveItem('tireless');
    p.takePassiveItem('sacrifice');
    const took = p.takePassiveItem(itemId);
    const after = { ...p.passiveItems };

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();

    // The deck was five deep before the pick, and SACRIFICE is a silent bias:
    // the shuffle never re-deals the dealer, and everything else is random.
    return { took, after, sacrificed: p.sacrificed };
  }, id);

  const afterKeys = Object.keys(result.after || {});
  check('Shuffle is taken at max 1',
    result.took === true && result.after.shuffle === 1, JSON.stringify(result));
  check('Shuffle replaced the rest of the build',
    afterKeys.length >= 1 && !('speedLoader' in result.after)
      && !('tireless' in result.after) && !('sacrifice' in result.after),
    JSON.stringify(result));
}
