// SYNTHESIZER. Three assertions, one per thing the card promises: the rented
// effect is really in the stat block, the reroll never deals the ids that
// have no rentable effect (or itself), and a landlord removed by SACRIFICE
// really does end the tenancy.
export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const ITEMS = g.__passiveItemsForTest;
    const owned = { ...p.passiveItems };
    const savedSynth = p.synthItem;
    const savedHealth = p.health;
    const out = { rerolls: [], excluded: [], illegal: [], stacked: false };
    const EXCLUDED = ['synthesizer', 'sacrifice', 'shuffle', 'deathwish'];
    const bare = () => {
      for (const k of Object.keys(p.passiveItems)) delete p.passiveItems[k];
      p.rebuildMods();
    };

    bare();
    out.bareRate = p.mods.fireRate;

    // 1. THE RENTAL IS IN THE STAT BLOCK. SYNTHESIZER held, overclock
    // rented: the +20% fire rate has to arrive through rebuildMods without
    // a single edit to the owned list.
    p.passiveItems[itemId] = 1;
    p.synthItem = 'overclock';
    p.rebuildMods();
    out.rentedRate = p.mods.fireRate;
    out.rentedList = Object.keys(p.passiveItems);
    // And it STACKS with a copy the player actually owns rather than
    // replacing it: the rental is one more pick's worth.
    p.passiveItems.overclock = 1;
    p.rebuildMods();
    out.stackedRate = p.mods.fireRate;
    delete p.passiveItems.overclock;

    // 2. THE REROLL. Thirty real draws: every one must name a legal preset
    // and be a CHANGE, because the card says a new one each wave.
    let prev = p.synthItem;
    for (let i = 0; i < 30; i++) {
      const rolled = g._rerollWaveItems();
      out.rerolls.push(p.synthItem);
      if (EXCLUDED.includes(p.synthItem)) out.excluded.push(p.synthItem);
      if (!ITEMS[p.synthItem]) out.illegal.push(p.synthItem);
      if (p.synthItem === prev) out.repeated = (out.repeated || 0) + 1;
      prev = p.synthItem;
      if (!rolled.synth) out.noBanner = true;
    }
    // The clamps takePassiveItem makes: whatever the rental did to the caps,
    // the HUD must not be showing numbers the new block cannot defend.
    out.healthOver = p.health > p.maxHealth;
    out.magOver = p.mag > p.magSize;
    out.reserveOver = p.reserveAmmo > p.maxReserve;

    // 3. THE LANDLORD GONE. SACRIFICE can eat the synthesizer; the rental
    // must not survive it.
    p.synthItem = 'overclock';
    bare();
    out.afterEviction = p.mods.fireRate;

    // 4. THE FIRST PRESET ARRIVES WITH THE PICK. A real takePassiveItem runs
    // the definition's onTake, so the wave the player walks into next is
    // already wearing a rental - "an effect each wave" cannot start empty.
    bare();
    p.takePassiveItem(itemId);
    out.atPick = p.synthItem;
    out.atPickLegal = !!p.synthItem && !!ITEMS[p.synthItem]
      && !['synthesizer', 'sacrifice', 'shuffle', 'deathwish'].includes(p.synthItem);

    for (const k of Object.keys(p.passiveItems)) delete p.passiveItems[k];
    Object.assign(p.passiveItems, owned);
    p.synthItem = savedSynth;
    p.rebuildMods();
    p.health = savedHealth;
    return out;
  }, id);

  check('Synthesizer rents a real effect into the stat block',
    Math.abs(result.rentedRate - result.bareRate * 1.2) < 1e-9
      && result.rentedList.length === 1 && result.rentedList[0] === id,
    JSON.stringify(result));
  check('The rental stacks with an owned copy rather than replacing it',
    Math.abs(result.stackedRate - result.bareRate * 1.44) < 1e-9,
    JSON.stringify(result));
  check('Every reroll is a legal, changing preset',
    result.rerolls.length === 30 && result.excluded.length === 0
      && result.illegal.length === 0 && !result.repeated && !result.noBanner,
    JSON.stringify(result));
  check('The reroll never leaves the run over a cap',
    !result.healthOver && !result.magOver && !result.reserveOver,
    JSON.stringify(result));
  check('A removed synthesizer ends the tenancy',
    Math.abs(result.afterEviction - result.bareRate) < 1e-9,
    JSON.stringify(result));
  check('The first preset arrives with the pick itself',
    result.atPickLegal === true,
    JSON.stringify({ atPick: result.atPick }));
}
