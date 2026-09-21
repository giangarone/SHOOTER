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
    p.passiveItems.fatHandgun = 1;
    p.rebuildMods();
    const reloadWithNormal = p.mods.reloadMult;
    p.reserveAmmo = 10000;
    const random = Math.random;
    Math.random = () => 0;
    for (let i = 0; i < 5; i++) g._useDonationMachine(ammo);
    Math.random = random;
    t('five donations complete the first tier',
      p.donationTiers.ammo === 1 && p.donationProgress.ammo === 0
        && ammo.completedThisShop && ammo.pendingId === 'fatHandgun'
        && own('ammo').length === 0,
      `tiers=${p.donationTiers.ammo} pending=${ammo.pendingId}`);
    t('the completed meter is full as the cabinet starts sinking',
      ammo.state === 'sinking'
        && ammo.meterMaterial.uniforms.uFilled.value === 5
        && ammo.meterMaterial.uniforms.uSections.value === 5);

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
        && ammo.pendingId === 'fatHandgun' && ammo.displayGroup.visible
        && ammo.icons.fatHandgun.visible && own('ammo').length === 0);
    const pickupPrompt = g._usePrompt({ kind: 'donation', target: ammo })[0];
    t('the floating reward asks for a second Use press',
      pickupPrompt.includes(g.keys.label('use'))
        && pickupPrompt.includes('TAKE') && pickupPrompt.includes('FAT HANDGUN'),
      pickupPrompt);

    p.pos.copy(ammo.pos);
    g.tryUse();
    t('the second Use press grants and removes the floating reward',
      !!p.donationItems['donation/ammo/fatHandgun']
        && !ammo.pendingId && !ammo.displayGroup.visible);
    t('normal-pool ownership does not exclude a namespaced reward',
      !!p.passiveItems.fatHandgun
        && !!p.donationItems['donation/ammo/fatHandgun']);
    t('the picked-up reward is replayed into modifiers',
      p.mods.reloadMult < reloadWithNormal,
      `normal=${reloadWithNormal} donation=${p.mods.reloadMult}`);
    t('the build sheet includes picked-up donation rewards',
      g._statPassives().some((row) => row.id === 'donation/ammo/fatHandgun'));
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
    // hand Fat Handgun out again even though the RNG repeats exactly.
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
      for (let tier = 0; tier < 3; tier++) {
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
    t('health and credit pools also draw all three rewards without duplicates',
      own('health').length === 3 && new Set(own('health')).size === 3
        && own('credits').length === 3 && new Set(own('credits')).size === 3,
      `health=${own('health').join(',')} credits=${own('credits').join(',')}`);

    // Same filename in another pool would still be a different compound key;
    // the currently seeded pools are also three distinct catalogue objects.
    t('reward pools are separate from each other and the passive pool',
      g.__donationItemsForTest.ammo !== g.__donationItemsForTest.health
        && g.__donationItemsForTest.health !== g.__donationItemsForTest.credits
        && !Object.keys(g.__passiveItemsForTest).some((id) => id.startsWith('donation/')));

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
