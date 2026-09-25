// Donation Machine integration: the fixtures, three payment paths, independent
// ladders, non-duplicate catalogues, reveal state and permanent build rewards.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8261;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const check = (name, condition, extra = '') => {
  console.log((condition ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!condition) fails++;
};

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push('PAGEERROR: ' + error.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, {
    waitUntil: 'load', timeout: 30000,
  });
  await page.waitForFunction('window.__game && window.__game.donationMachines', { timeout: 30000 });

  const results = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    const out = [];
    const t = (name, condition, extra = '') => out.push([name, !!condition, String(extra)]);
    g.autoTest = false;
    g.state = 'playing';
    g.waveState = 'intermission';
    g.queue.length = 0;
    g._clearEntities();

    const area = g.donationMachines;
    const machine = (kind) => area.byKind[kind];
    const own = (kind) => Object.keys(p.donationItems)
      .filter((key) => key.startsWith(`donation/${kind}/`));
    const reset = () => {
      Object.assign(p.donationProgress, { ammo: 0, health: 0, credits: 0 });
      Object.assign(p.donationTiers, { ammo: 0, health: 0, credits: 0 });
      for (const key of Object.keys(p.donationItems)) delete p.donationItems[key];
      for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
      p.rebuildMods();
      p.health = p.maxHealth;
      p.reserveAmmo = p.maxReserve;
      p.shield = 0;
      g.credits = 0;
      p.spentTotal = 0;
      for (const m of area.machines) {
        m.clearPending();
        m.completedThisShop = false;
        m.state = 'up';
        m.rise = 1;
        m.group.visible = true;
        m.group.position.y = 0;
        m.displayGroup.visible = true;
        m.displayGroup.position.y = 0;
        m.setProgress(0, 5, false);
      }
    };

    reset();
    area.present(p);
    for (const m of area.machines) { m.state = 'up'; m.rise = 1; }

    // ---- fixtures and prompts -------------------------------------------
    const snap = area.snapshot(p);
    t('three separate machines rise in the shop',
      snap.length === 3 && snap.every((m) => m.state === 'up'), JSON.stringify(snap));
    t('machine colours are yellow, red and green',
      machine('ammo').config.color === 0xffd600
        && machine('health').config.color === 0xff2d6f
        && machine('credits').config.color === 0x00e676);
    t('machine costs are fixed at 30, 10 and 1000',
      machine('ammo').config.cost === 30
        && machine('health').config.cost === 10
        && machine('credits').config.cost === 1000);
    t('the cabinets occupy three distinct positions',
      new Set(area.machines.map((m) => `${m.pos.x},${m.pos.z}`)).size === 3);
    const xs = area.machines.map((m) => m.pos.x);
    t('the bank is behind the Mystery Box at its nearest wall',
      area.machines.every((m) => m.pos.z > g.mysteryBox.pos.z && m.pos.z > 18)
        && new Set(area.machines.map((m) => m.pos.z)).size === 1,
      `boxZ=${g.mysteryBox.pos.z} machineZ=${machine('health').pos.z}`);
    t('the bank is perfectly centred on the Mystery Box',
      machine('health').pos.x === g.mysteryBox.pos.x
        && Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - g.mysteryBox.pos.x) < 1e-9,
      `boxX=${g.mysteryBox.pos.x} xs=${xs.join(',')}`);
    const sortedXs = [...xs].sort((a, b) => a - b);
    t('the cabinets leave a little air between each other',
      sortedXs[1] - sortedXs[0] === 3.0 && sortedXs[2] - sortedXs[1] === 3.0,
      `xs=${sortedXs.join(',')}`);
    const cornerAlpha = area.machines.map((m) =>
      m.panel.canvas.getContext('2d').getImageData(10, 10, 1, 1).data[3]);
    t('machine labels have no background fill or frame',
      cornerAlpha.every((alpha) => alpha === 0), cornerAlpha.join(','));

    p.reserveAmmo = 300;
    p.health = p.maxHealth;
    g.credits = 5000;
    g.inputMode = 'kbm';
    const keyboardPrompts = area.machines.map((m) => g._usePrompt({ kind: 'donation', target: m })[0]);
    t('keyboard prompts name Use and every fixed cost',
      keyboardPrompts.every((text) => text.includes(g.keys.label('use')))
        && keyboardPrompts[0].includes('30 AMMO')
        && keyboardPrompts[1].includes('10 HP')
        && keyboardPrompts[2].includes('$1,000'), keyboardPrompts.join(' | '));
    t('donation prompts never advertise shooting',
      keyboardPrompts.every((text) => !text.includes('SHOOT')), keyboardPrompts.join(' | '));
    g.inputMode = 'pad';
    const padPrompt = g._usePrompt({ kind: 'donation', target: machine('ammo') })[0];
    t('pad prompt names the rebound Use button',
      padPrompt.includes(g.keys.padBtn('use')) && !padPrompt.includes(g.keys.padBtn('shoot')),
      padPrompt);
    g.inputMode = 'kbm';

    // A centred pellet reaches the cabinet and stops, but cannot donate.
    p.pos.set(machine('ammo').pos.x - 3, 0, machine('ammo').pos.z);
    p.yaw = -Math.PI / 2;
    p.pitch = 0;
    p.applyCamera();
    g.scene.updateMatrixWorld(true);
    const ammoBeforeShot = p.reserveAmmo;
    const progressBeforeShot = p.donationProgress.ammo;
    g._firePellet(p.eyeInto(g._killPos), g._buildShotTargets({ props: true }), 0, p.weapon);
    t('shots never donate', p.reserveAmmo === ammoBeforeShot
      && p.donationProgress.ammo === progressBeforeShot);

    // ---- exact refusal thresholds ---------------------------------------
    reset();
    const ammo = machine('ammo');
    p.reserveAmmo = 29;
    const ammoLow = g._useDonationMachine(ammo);
    p.reserveAmmo = 30;
    const ammoPaid = g._useDonationMachine(ammo);
    t('ammo refuses below 30 reserve rounds without charging',
      !ammoLow && p.donationProgress.ammo === 1, `reserve=${p.reserveAmmo}`);
    t('ammo pays exactly 30 reserve rounds', ammoPaid && p.reserveAmmo === 0);

    const health = machine('health');
    p.health = 10;
    p.shield = 40;
    const damageBefore = g.waveDamageTaken;
    const healthLow = g._useDonationMachine(health);
    p.health = 11;
    const healthPaid = g._useDonationMachine(health);
    t('health requires at least 11 HP', !healthLow && healthPaid && p.health === 1);
    t('health donation bypasses shields and damage reactions',
      p.shield === 40 && g.waveDamageTaken === damageBefore,
      `shield=${p.shield} damage=${g.waveDamageTaken - damageBefore}`);

    const credits = machine('credits');
    g.credits = 999;
    const creditsLow = g._useDonationMachine(credits);
    g.credits = 1000;
    p.spentTotal = 0;
    const creditsPaid = g._useDonationMachine(credits);
    t('credits refuse below $1,000 and then charge exactly $1,000',
      !creditsLow && creditsPaid && g.credits === 0);
    t('credit donations use the shared spending ledger', p.spentTotal === 1000,
      `spent=${p.spentTotal}`);
    t('the three progress tracks are independent',
      p.donationProgress.ammo === 1
        && p.donationProgress.health === 1
        && p.donationProgress.credits === 1,
      JSON.stringify(p.donationProgress));

    // ---- completion, pickup, tiers and non-duplicates -------------------
    reset();
    const rateBeforeReward = p.mods.fireRate;
    p.reserveAmmo = 10000;
    const random = Math.random;
    Math.random = () => 0;
    for (let i = 0; i < 5; i++) g._useDonationMachine(ammo);
    Math.random = random;
    t('five donations complete the first tier',
      p.donationTiers.ammo === 1 && p.donationProgress.ammo === 0
        && ammo.completedThisShop && ammo.pendingId === 'clockworkSear'
        && own('ammo').length === 0,
      `tiers=${p.donationTiers.ammo} pending=${ammo.pendingId}`);
    t('the completed meter is full as the cabinet starts sinking',
      ammo.state === 'sinking'
        && ammo.meterMaterial.uniforms.uFilled.value === 5
        && ammo.meterMaterial.uniforms.uSections.value === 5);
    const rewardBar = (() => {
      const def = g.__donationItemsForTest.ammo[ammo.pendingId];
      const d = ammo.panel.canvas.getContext('2d').getImageData(192, 23, 1, 1).data;
      const theme = [(def.theme >> 16) & 255, (def.theme >> 8) & 255, def.theme & 255];
      const machine = [(ammo.config.color >> 16) & 255, (ammo.config.color >> 8) & 255, ammo.config.color & 255];
      return { got: [d[0], d[1], d[2]], theme, machine };
    })();
    t('the reward panel wears the item theme, not the machine colour',
      rewardBar.got[0] === rewardBar.theme[0]
        && rewardBar.got[1] === rewardBar.theme[1]
        && rewardBar.got[2] === rewardBar.theme[2],
      `got=${rewardBar.got.join(',')} theme=${rewardBar.theme.join(',')} machine=${rewardBar.machine.join(',')}`);

    const paidAtCompletion = p.reserveAmmo;
    const locked = g._useDonationMachine(ammo);
    p.health = 100;
    const otherWorks = g._useDonationMachine(health);
    t('only the completing machine is disabled for this shop',
      !locked && p.reserveAmmo === paidAtCompletion && otherWorks
        && p.donationProgress.health === 1);

    area.update(30, g.time + 30, p.pos, p);
    t('the cabinet sinks but an unclaimed reward remains indefinitely',
      ammo.state === 'hidden' && !ammo.group.visible
        && ammo.pendingId === 'clockworkSear' && ammo.displayGroup.visible
        && ammo.icons.clockworkSear.visible && own('ammo').length === 0);
    const pickupPrompt = g._usePrompt({ kind: 'donation', target: ammo })[0];
    t('the floating reward asks for a second Use press',
      pickupPrompt.includes(g.keys.label('use'))
        && pickupPrompt.includes('TAKE') && pickupPrompt.includes('CLOCKWORK SEAR'),
      pickupPrompt);

    p.pos.copy(ammo.pos);
    g.tryUse();
    t('the second Use press grants and removes the floating reward',
      !!p.donationItems['donation/ammo/clockworkSear']
        && !ammo.pendingId && !ammo.displayGroup.visible);
    t('the picked-up reward is replayed into modifiers',
      p.mods.fireRate === rateBeforeReward * 1.2,
      `before=${rateBeforeReward} donation=${p.mods.fireRate}`);
    t('the build sheet includes picked-up donation rewards',
      g._statPassives().some((row) => row.id === 'donation/ammo/clockworkSear'));
    t('pickup does not re-enable the completed cabinet',
      ammo.state === 'hidden' && ammo.completedThisShop);

    const startShop = () => {
      area.present(p);
      for (const m of area.machines) {
        m.state = 'up';
        m.rise = 1;
        m.group.visible = true;
        m.group.position.y = 0;
        m.displayGroup.visible = true;
        m.displayGroup.position.y = 0;
      }
    };

    // Always choosing index zero now takes the next unowned id: it cannot
    // hand Clockwork Sear out again even though the RNG repeats exactly.
    Math.random = () => 0;
    startShop();
    p.reserveAmmo = 10000;
    for (let i = 0; i < 6; i++) g._useDonationMachine(ammo);
    g._takeDonationReward(ammo);
    startShop();
    p.reserveAmmo = 10000;
    for (let i = 0; i < 7; i++) g._useDonationMachine(ammo);
    g._takeDonationReward(ammo);
    Math.random = random;
    t('requirements advance 5 to 6 to 7', p.donationTiers.ammo === 3,
      `tiers=${p.donationTiers.ammo}`);
    t('draws are non-duplicate within the machine pool',
      own('ammo').length === 3 && new Set(own('ammo')).size === 3,
      own('ammo').join(', '));
    // Ammo has five genuinely distinct rewards. Finish its last two tiers so
    // sold-out is still proved against the actual directory, not a stale
    // placeholder count.
    for (let tier = 3; tier < Object.keys(g.__donationItemsForTest.ammo).length; tier++) {
      startShop();
      p.reserveAmmo = 10000;
      for (let i = 0; i < 5 + tier; i++) g._useDonationMachine(ammo);
      g._takeDonationReward(ammo);
    }
    startShop();
    const beforeSoldOut = p.reserveAmmo;
    const refusedSoldOut = g._useDonationMachine(ammo);
    t('an exhausted pool is sold out and costs nothing',
      !refusedSoldOut && p.reserveAmmo === beforeSoldOut
        && area.snapshot(p).find((m) => m.kind === 'ammo').soldOut);

    // Declining a reward leaves it through the shop, then forfeits it when
    // that shop closes. Merely generating an item is not ownership.
    for (const key of own('health')) delete p.donationItems[key];
    p.donationProgress.health = 0;
    p.donationTiers.health = 0;
    p.rebuildMods();
    startShop();
    p.health = p.maxHealth;
    for (let i = 0; i < 5; i++) g._useDonationMachine(health);
    area.update(30, g.time + 60, p.pos, p);
    const declinedId = health.pendingId;
    t('an unclaimed reward never auto-grants or times out',
      !!declinedId && own('health').length === 0 && health.displayGroup.visible);
    area.dismiss();
    t('closing the shop removes an unclaimed reward without granting it',
      !health.pendingId && own('health').length === 0 && !health.displayGroup.visible);

    // The same non-duplicate ladder is shared as machinery, not ownership:
    // exhaust the other two and prove each one fills only its own namespace.
    const exhaust = (kind) => {
      const m = machine(kind);
      for (const key of own(kind)) delete p.donationItems[key];
      p.donationProgress[kind] = 0;
      p.donationTiers[kind] = 0;
      const count = Object.keys(g.__donationItemsForTest[kind]).length;
      for (let tier = 0; tier < count; tier++) {
        startShop();
        if (kind === 'health') p.health = Math.max(p.maxHealth, 100);
        else g.credits = 100000;
        const required = 5 + tier;
        for (let i = 0; i < required; i++) g._useDonationMachine(m);
        g._takeDonationReward(m);
      }
    };
    Math.random = () => 0;
    exhaust('health');
    exhaust('credits');
    Math.random = random;
    t('health and credit pools draw every reward without duplicates',
      own('health').length === 3 && new Set(own('health')).size === 3
        && own('credits').length === 2 && new Set(own('credits')).size === 2,
      `health=${own('health').join(',')} credits=${own('credits').join(',')}`);

    // Same filename in another pool would still be a different compound key;
    // the currently seeded pools are also three distinct catalogue objects.
    t('reward pools are separate from each other and the passive pool',
      g.__donationItemsForTest.ammo !== g.__donationItemsForTest.health
        && g.__donationItemsForTest.health !== g.__donationItemsForTest.credits
        && !Object.keys(g.__passiveItemsForTest).some((id) => id.startsWith('donation/')));

    const poolIds = Object.fromEntries(Object.entries(g.__donationItemsForTest)
      .map(([kind, pool]) => [kind, Object.keys(pool)]));
    t('placeholder rewards are completely gone from every machine pool',
      !poolIds.ammo.some((id) => ['fatHandgun', 'magnaCarta', 'slideRule'].includes(id))
        && !poolIds.health.some((id) => ['fleshBank', 'platedDessert', 'soulHarvest'].includes(id))
        && !poolIds.credits.some((id) => ['lateFee', 'thinBlood', 'deathClause'].includes(id)),
      JSON.stringify(poolIds));

    // ---- the ten exclusive reward mechanics ----------------------------
    reset();
    const baseDamage = p.getEffectiveDamage(10);
    const baseRate = p.effectiveFireRate;
    const baseMag = p.magSize;
    for (const id of poolIds.ammo) p.takeDonationItem('ammo', id, g);
    t('OVERPRESSURE grants exactly 40% damage',
      Math.abs(p.getEffectiveDamage(10) / baseDamage - 1.4) < 1e-9);
    t('CLOCKWORK SEAR grants exactly 20% fire rate',
      Math.abs(p.effectiveFireRate / baseRate - 1.2) < 1e-9);
    t('DRUM MAJOR adds exactly 30 rounds of magazine capacity',
      p.magSize === baseMag + 30, `${baseMag} -> ${p.magSize}`);

    p.mag = 10;
    p.reserveAmmo = 100;
    p.reloading = 0;
    p.fireCd = 0;
    Math.random = () => 0;
    const freeShot = p.tryShoot(true);
    const afterFree = p.mag;
    p.fireCd = 0;
    Math.random = () => 0.99;
    const paidShot = p.tryShoot(true);
    Math.random = random;
    t('GHOST CASINGS makes a successful 40% roll cost no ammo',
      freeShot === 'shot' && afterFree === 10 && p.lastAmmoSpent === 1,
      `afterFree=${afterFree}`);
    t('GHOST CASINGS leaves a failed roll paying normally',
      paidShot === 'shot' && p.mag === 9, `mag=${p.mag}`);
    const refund = p.refundLastShotAmmo();
    t('SKULL RECEIPT restores the exact ammunition a shot spent',
      refund && p.mag === 10 && p.lastShotCost === 0, `mag=${p.mag}`);

    reset();
    const oldMax = p.maxHealth;
    p.health = 7;
    p.takeDonationItem('health', 'secondHeart', g);
    t('SECOND HEART adds 20 max health and fills the new bar on pickup',
      p.maxHealth === oldMax + 20 && p.health === p.maxHealth,
      `${p.health}/${p.maxHealth}`);
    p.takeDonationItem('health', 'panicPlate', g);
    p.health = 50;
    const atFifty = p.incomingMult;
    p.health = 49;
    const underFifty = p.incomingMult;
    t('PANIC PLATE halves damage only below 50 HP',
      atFifty === 1 && underFifty === 0.5,
      `at50=${atFifty} under50=${underFifty}`);
    p.takeDonationItem('health', 'ivoryDrip', g);
    p.shield = 0;
    p._donationShieldAcc = 0;
    const neutral = { move: { x: 0, z: 0 }, look: { x: 0, y: 0 } };
    let tickTime = g.time;
    for (let i = 0; i < 120; i++) {
      tickTime += 1 / 60;
      p.update(1 / 60, neutral, g.arena.obstacles, tickTime, false);
    }
    const shopShield = p.shield;
    for (let i = 0; i < 1500; i++) {
      tickTime += 1 / 60;
      p.update(1 / 60, neutral, g.arena.obstacles, tickTime, true);
    }
    t('IVORY DRIP creates no shield outside combat', shopShield === 0,
      `shield=${shopShield}`);
    t('IVORY DRIP generates one shield per combat second and caps at 20',
      p.shield === 20, `shield=${p.shield}`);

    reset();
    g.credits = 125;
    p.takeDonationItem('credits', 'signingBonus', g);
    t('SIGNING BONUS grants exactly $10,000 on pickup', g.credits === 10125,
      `credits=${g.credits}`);
    p.takeDonationItem('credits', 'remoteDeposit', g);
    g.money.clear();
    g.credits = 0;
    p.flawlessStreak = 0;
    const floorShare = g._dropMoney(p.pos, 100);
    let floorValue = 0;
    for (let i = 0; i < g.money.count; i++) floorValue += g.money.value[i];
    t('REMOTE DEPOSIT banks half of every floor payout immediately',
      g.credits === 50 && floorShare === 50, `bank=${g.credits} return=${floorShare}`);
    t('REMOTE DEPOSIT leaves the other half as ordinary floor credits',
      Math.abs(floorValue - 50) < 1e-4, `floor=${floorValue}`);

    // A new run owns none of the ledgers that survived the previous shops.
    g.autoTest = true;
    g.beginGame();
    t('a new run resets progress, tiers and claimed rewards',
      Object.values(p.donationProgress).every((n) => n === 0)
        && Object.values(p.donationTiers).every((n) => n === 0)
        && Object.keys(p.donationItems).length === 0,
      JSON.stringify({ progress: p.donationProgress, tiers: p.donationTiers }));

    return out;
  });

  for (const [name, condition, extra] of results) check(name, condition, extra);
  check('no console errors', errors.length === 0, errors.join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(fails ? 'DONATION TEST FAIL' : 'DONATION TEST PASS');
process.exit(fails ? 1 : 0);
