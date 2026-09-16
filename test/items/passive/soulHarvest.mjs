export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    const saved = { hp: p.health, shield: p.shield };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();

    // ONKILL IS THE WHOLE PICK: a kill rolls for the shield. Force the roll to
    // land and check the point banks with the clock CANCELLED (the plasmaBag
    // rule: a shield outrunning a kill does not count down on it).
    const random = Math.random;
    Math.random = () => 0;
    p.shield = 0; p.shieldEnd = 0;
    p.onKill && p.onKill(g.time);
    const after = p.shield;
    Math.random = random;

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();
    p.health = saved.hp;
    p.shield = saved.shield;

    return { after };
  }, id);

  check('Soul Harvest banks a shield point on a kill',
    result.after === 1, JSON.stringify(result));
}
