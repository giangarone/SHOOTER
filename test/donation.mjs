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
    t('machine costs are fixed at 60, 20 and 1000',
      machine('ammo').config.cost === 60
        && machine('health').config.cost === 20
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
        && keyboardPrompts[0].includes('60 AMMO')
        && keyboardPrompts[1].includes('20 HP')
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
    p.reserveAmmo = 59;
    const ammoLow = g._useDonationMachine(ammo);
    p.reserveAmmo = 60;
    const ammoPaid = g._useDonationMachine(ammo);
    t('ammo refuses below 60 reserve rounds without charging',
      !ammoLow && p.donationProgress.ammo === 1, `reserve=${p.reserveAmmo}`);
    t('ammo pays exactly 60 reserve rounds', ammoPaid && p.reserveAmmo === 0);

    const health = machine('health');
    p.health = 20;
    p.shield = 40;
    const damageBefore = g.waveDamageTaken;
    const healthLow = g._useDonationMachine(health);
    p.health = 21;
    const healthPaid = g._useDonationMachine(health);
    t('health requires at least 21 HP', !healthLow && healthPaid && p.health === 1);
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
    p.reserveAmmo = 10000;
    const random = Math.random;
    Math.random = () => 0;
    for (let i = 0; i < 5; i++) g._useDonationMachine(ammo);
    Math.random = random;
    t('five donations complete the first tier',
      p.donationTiers.ammo === 1 && p.donationProgress.ammo === 0
        && ammo.completedThisShop && ammo.pendingId === 'ammoAlchemist'
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
        && ammo.pendingId === 'ammoAlchemist' && ammo.displayGroup.visible
        && ammo.icons.ammoAlchemist.visible && own('ammo').length === 0);
    const pickupPrompt = g._usePrompt({ kind: 'donation', target: ammo })[0];
    t('the floating reward asks for a second Use press',
      pickupPrompt.includes(g.keys.label('use'))
        && pickupPrompt.includes('TAKE') && pickupPrompt.includes('AMMO ALCHEMIST'),
      pickupPrompt);

    p.pos.copy(ammo.pos);
    g.tryUse();
    t('the second Use press grants and removes the floating reward',
      !!p.donationItems['donation/ammo/ammoAlchemist']
        && !ammo.pendingId && !ammo.displayGroup.visible);
    t('the picked-up reward is replayed into modifiers',
      p.mods.donationAlchemist === 8,
      `donationAlchemist=${p.mods.donationAlchemist}`);
    t('the build sheet includes picked-up donation rewards',
      g._statPassives().some((row) => row.id === 'donation/ammo/ammoAlchemist'));
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
    for (let i = 0; i < 5; i++) {
      p.health = Math.max(p.maxHealth, 100);
      g._useDonationMachine(health);
    }
    area.update(30, g.time + 60, p.pos, p);
    const declinedId = health.pendingId;
    t('an unclaimed reward never auto-grants or times out',
      !!declinedId && own('health').length === 0 && health.displayGroup.visible);
    area.dismiss();
    t('closing the shop removes an unclaimed reward without granting it',
      !health.pendingId && own('health').length === 0 && !health.displayGroup.visible);

    // The same non-duplicate ladder is shared as machinery, not ownership:
    // exhaust the other two and prove each one fills only its own namespace.
    // Health pays from the bar, so the bar is refilled around EACH donation -
    // longer ladders outrun any single shop's worth of health.
    const exhaust = (kind) => {
      const m = machine(kind);
      for (const key of own(kind)) delete p.donationItems[key];
      p.donationProgress[kind] = 0;
      p.donationTiers[kind] = 0;
      const count = Object.keys(g.__donationItemsForTest[kind]).length;
      for (let tier = 0; tier < count; tier++) {
        startShop();
        const required = 5 + tier;
        for (let i = 0; i < required; i++) {
          if (kind === 'health') p.health = Math.max(p.maxHealth, 100);
          else g.credits = 100000;
          g._useDonationMachine(m);
        }
        g._takeDonationReward(m);
      }
    };
    Math.random = () => 0;
    exhaust('health');
    exhaust('credits');
    Math.random = random;
    const healthPool = Object.keys(g.__donationItemsForTest.health).length;
    const creditsPool = Object.keys(g.__donationItemsForTest.credits).length;
    t('health and credit pools draw every reward without duplicates',
      own('health').length === healthPool && new Set(own('health')).size === healthPool
        && own('credits').length === creditsPool && new Set(own('credits')).size === creditsPool,
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

    // ---- the second generation's twenty-one mechanics -------------------
    const V = p.pos.constructor;
    const fakeBody = () => ({
      wardT: 0, hp: 100, maxHp: 100, dead: false, boss: false, radius: 0.4,
      pos: new V(0, 0, -3), everHit: false, hitTally: 0, markTally: 0, marked: false,
      carapace: 0, buffT: 0, freezeVuln: 1, type: 'chaser',
      status: { freeze: 0, burn: 0, poison: 0, slow: 0, fear: 0 },
      takeDamage() {}, applyStatus(status, duration, power) { this.applied = { status, duration, power }; },
    });

    // AMMO - SCRAP METAL: a partial reload seats full and converts the
    // leftovers one for one; the fresh magazine is billed in FULL.
    reset();
    p.takeDonationItem('ammo', 'scrapMetal', g);
    p.reserveAmmo = 300; p.reloading = 0; p.mag = 7;
    const magSizeWas = p.magSize;
    p.startReload();
    p.update(p.reloadTime + 0.05, neutral, g.arena.obstacles, (g.time || 1) + 10, true);
    t('SCRAP METAL converts leftover rounds into shield points',
      p.shield === 7 && p.magOnReload === 7, `shield=${p.shield}`);
    t('SCRAP METAL bills the fresh magazine in full',
      p.mag === magSizeWas && p.reserveAmmo === 300 - magSizeWas && p.scrapFx,
      `mag=${p.mag} reserve=${p.reserveAmmo}`);

    // CHAIN LETTER: builds per hit to its 40% cap, broken by one miss.
    reset();
    p.takeDonationItem('ammo', 'chainLetter', g);
    const chainBase = p.effectiveFireRate;
    p.bumpChain(true); p.bumpChain(true);
    const afterTwo = p.effectiveFireRate / chainBase;
    for (let i = 0; i < 20; i++) p.bumpChain(true);
    t('CHAIN LETTER climbs 4% per connected shot',
      Math.abs(afterTwo - 1.08) < 1e-9 && p.chainHits === 22,
      `afterTwo=${afterTwo} hits=${p.chainHits}`);
    t('CHAIN LETTER caps at +40% and a miss resets it',
      p.effectiveFireRate / chainBase === 1.4 && (p.bumpChain(false), p.chainHits === 0),
      `rate=${p.effectiveFireRate / chainBase}`);

    // LIGHTER and SNAKE: a crit lands its status, an ordinary shot does not.
    reset();
    p.takeDonationItem('ammo', 'lighter', g);
    let fb = fakeBody();
    g._beginShot();
    g._landShot(fb, fb.pos, new V(0, 0, -1), 0, 0, true);
    const critApplied = { ...fb.applied };
    fb = fakeBody();
    g._beginShot();
    g._landShot(fb, fb.pos, new V(0, 0, -1), 0, 0, false);
    const flatApplied = fb.applied;
    t('LIGHTER burns a critical hit for 3s',
      critApplied.status === 'burn' && critApplied.duration === 3
        && critApplied.power === p.fireTickDamage,
      JSON.stringify(critApplied));
    p.takeDonationItem('ammo', 'snake', g);
    fb = fakeBody();
    g._beginShot();
    g._landShot(fb, fb.pos, new V(0, 0, -1), 5, 0, true);
    t('SNAKE poisons the same critical hit for 4s',
      fb.applied.status === 'poison' && fb.applied.duration === 4
        && fb.applied.power === p.poisonTickDamage, JSON.stringify(fb.applied));
    t('neither status lands off a non-critical hit', flatApplied === undefined,
      JSON.stringify(flatApplied));

    // LUCKY NUMBER: the seventh trigger pull crits whatever the die says and
    // heals on landing; a miss spends the flag and pays nothing.
    reset();
    p.takeDonationItem('ammo', 'luckyNumber', g);
    Math.random = () => 0.999;
    const luckyRolls = [0, 0, 0, 0, 0, 0, 0].map(() => p.rollCrit());
    const luckyArmed = luckyRolls.slice(0, 6).every((r) => r === false)
      && luckyRolls[6] === true && p.luckyShot === true && p.luckyShots === 0;
    p.health = 40;
    g._critHeal(true);
    const luckyLandedHp = p.health;
    for (let i = 0; i < 7; i++) p.rollCrit();
    g._critHeal(false);
    const luckyMissedHp = p.health;
    Math.random = random;
    t('LUCKY NUMBER makes every seventh shot a guaranteed crit',
      luckyArmed, JSON.stringify(luckyRolls));
    t('LUCKY NUMBER heals 2 HP when its crit lands and not when it misses',
      luckyLandedHp === 42 && luckyMissedHp === 42 && p.luckyShot === false,
      `landed=${luckyLandedHp} missed=${luckyMissedHp}`);
    // PAPER CROWN: full health adds its 40% to the crit die.
    reset();
    p.takeDonationItem('ammo', 'paperCrown', g);
    p.health = p.maxHealth;
    Math.random = () => 0.4;
    const crownFull = p.rollCrit();
    p.health = p.maxHealth - 40;
    const crownHurt = p.rollCrit();
    Math.random = random;
    t('PAPER CROWN only rolls at full health',
      crownFull === true && crownHurt === false, `${crownFull}/${crownHurt}`);

    // HALF TRUTH: the second of two crits is the doubled one.
    reset();
    p.takeDonationItem('ammo', 'halfTruth', g);
    const hitK = [];
    for (let i = 0; i < 3; i++) {
      fb = fakeBody();
      g._beginShot();
      g._resolveHit(fb, true);
      hitK.push(g._hitMult(fb, true));
    }
    t('HALF TRUTH doubles every other critical hit',
      hitK[0] === p.mods.critMult && hitK[1] === p.mods.critMult * 2
        && hitK[2] === p.mods.critMult,
      JSON.stringify(hitK));

    // BAD OMEN: the thirteenth kill burns everything left standing.
    reset();
    p.takeDonationItem('ammo', 'badOmen', g);
    g.enemies.length = 0;
    const omenA = fakeBody(); const omenB = fakeBody();
    g.enemies.push(omenA, omenB);
    p.omenKills = 12;
    g._badOmen();
    t('BAD OMEN burns every standing enemy for 4s on the thirteenth kill',
      p.omenKills === 0 && omenA.applied.status === 'burn'
        && omenA.applied.duration === 4 && omenB.applied.status === 'burn',
      JSON.stringify([omenA.applied, omenB.applied]));
    g.enemies.length = 0;

    // AMMO ALCHEMIST: a crate arms an eight-second element; shots carry it.
    reset();
    p.takeDonationItem('ammo', 'ammoAlchemist', g);
    Math.random = () => 0;
    g._armAlchemy();
    Math.random = random;
    const armedBurn = p.alchemistEl && p.alchemistEl.label === 'BURN'
      && p.alchemistEnd === g.time + 8;
    fb = fakeBody();
    g._beginShot();
    g._landShot(fb, fb.pos, new V(0, 0, -1), 0, 0);
    t('AMMO ALCHEMIST arms a random 8s element off the ammo pickup',
      armedBurn && fb.applied && fb.applied.status === 'burn'
        && fb.applied.power === p.fireTickDamage,
      `el=${p.alchemistEl && p.alchemistEl.label} end=${p.alchemistEnd - g.time}`);
    p.alchemistEl = null; p.alchemistEnd = 0;

    // HEALTH - CERAMIC SKIN.
    reset();
    const skinBase = p.maxHealth;
    p.takeDonationItem('health', 'ceramicSkin', g);
    t('CERAMIC SKIN adds exactly 40 max health', p.maxHealth === skinBase + 40,
      `${skinBase} -> ${p.maxHealth}`);

    // MED SCHOOL, ILL WILL, MALICE AFORETHOUGHT - flat modifiers.
    p.takeDonationItem('health', 'medSchool', g);
    const medCrit = p.mods.critChance - 0.05;
    p.takeDonationItem('health', 'illWill', g);
    const illDmg = p.mods.damage;
    p.takeDonationItem('health', 'maliceAforethought', g);
    t('MED SCHOOL adds exactly 30% crit chance',
      Math.abs(medCrit - 0.3) < 1e-9, `crit=${p.mods.critChance}`);
    t('ILL WILL grants 15% and MALICE AFORETHOUGHT 20% on top of it',
      Math.abs(illDmg - 1.15) < 1e-9 && Math.abs(p.mods.damage - 1.38) < 1e-9,
      `dmg=${p.mods.damage}`);

    // DIRECT DEPOSIT: every fifth shot pays 1 HP.
    reset();
    p.takeDonationItem('health', 'directDeposit', g);
    p.health = 50; p.shotTally = 0;
    for (let i = 0; i < 4; i++) p._noteShot();
    const beforeFifth = p.health;
    p._noteShot();
    t('DIRECT DEPOSIT heals 1 HP on every fifth shot',
      beforeFifth === 50 && p.health === 51 && p.shotTally === 5,
      `hp=${p.health} tally=${p.shotTally}`);

    // GOLD STAR: ten clean kills per permanent step, capped, replayed by
    // rebuildMods - and wiped by damage through _hurtPlayer's own ledger.
    reset();
    p.takeDonationItem('health', 'goldStar', g);
    for (let i = 0; i < 10; i++) g._goldStarKill();
    t('GOLD STAR banks a permanent +4% damage step per ten clean kills',
      p.goldStars === 1 && p.goldKills === 0
        && Math.abs(p.mods.damage - 1.04) < 1e-9,
      `stars=${p.goldStars} dmg=${p.mods.damage}`);
    for (let i = 0; i < 130; i++) g._goldStarKill();
    t('GOLD STAR caps its ladder at the promised +40%',
      p.goldStars === 10 && Math.abs(p.mods.damage - 1.4) < 1e-9,
      `stars=${p.goldStars} dmg=${p.mods.damage}`);

    // KARMA: a heal per donation, whatever the machine.
    reset();
    p.takeDonationItem('health', 'karma', g);
    p.health = 40; g.credits = 2000;
    g._useDonationMachine(machine('credits'));
    t('KARMA heals 5 HP per donation made', p.health === 45 && g.credits === 1000,
      `health=${p.health} credits=${g.credits}`);

    // CREDITS - TITHING BLADE: a tenth of damage dealt, into the balance.
    reset();
    p.takeDonationItem('credits', 'tithingBlade', g);
    g.credits = 0;
    const titheTarget = new (g.__EnemyForTest)('chaser', new V(0, 0, -9), 1, 1, 1);
    titheTarget.takeDamage(100);
    const bankedTithe = g.credits;
    titheTarget.dispose();
    g.scene.remove(titheTarget.group);
    t('TITHING BLADE converts 10% of damage dealt to credits instantly',
      bankedTithe === 10, `credits=${bankedTithe}`);

    // NEXT OF KIN: the drop table's luck multiplier.
    p.takeDonationItem('credits', 'nextOfKin', g);
    t('NEXT OF KIN raises every drop roll by 30%',
      Math.abs(p.mods.dropLuck - 1.3) < 1e-9, `dropLuck=${p.mods.dropLuck}`);

    // THE TAB: purchases reach into debt, down to a hard -$10,000.
    p.reserveAmmo = 0; g.credits = 200;
    const blockedWithoutTab = g._stationBlocked(g.totemArea.ammoStation);
    p.takeDonationItem('credits', 'theTab', g);
    g.credits = 200;
    const beforeTab = g._stationBlocked(g.totemArea.ammoStation);
    const ammoCost = g._ammoCost();
    g._useStation(g.totemArea.ammoStation);
    const spentIntoDebt = g.credits === 200 - ammoCost && p.reserveAmmo === 90 && ammoCost > 200;
    g.credits = -9499;
    const atFloorEdge = g._canAfford(500);
    g.credits = -9501;
    const pastFloorEdge = g._canAfford(500);
    t('THE TAB lets a purchase run the balance negative',
      blockedWithoutTab !== null && beforeTab === null && spentIntoDebt,
      `blocked=${blockedWithoutTab} credits=${g.credits}`);
    t('THE TAB refuses only past its -$10,000 floor',
      atFloorEdge === true && pastFloorEdge === false,
      `edge=${atFloorEdge} past=${pastFloorEdge}`);
    t('THE TAB opens the credit-running machine on an empty wallet',
      (g.credits = 0, g._donationBlocked(machine('credits')) === null));

    // HOUSE MONEY: the first thirty seconds of a wave pay double.
    reset();
    p.takeDonationItem('credits', 'houseMoney', g);
    p.flawlessStreak = 0; g.credits = 0;
    g.waveState = 'active'; g._waveStartedAt = g.time;
    let houseFloor = 0;
    g.money.clear(); g._dropMoney(p.pos, 100);
    for (let i = 0; i < g.money.count; i++) houseFloor += g.money.value[i];
    g._waveStartedAt = g.time - 31;
    let houseLate = 0;
    g.money.clear(); g._dropMoney(p.pos, 100);
    for (let i = 0; i < g.money.count; i++) houseLate += g.money.value[i];
    g.waveState = 'intermission'; g._waveStartedAt = undefined;
    t('HOUSE MONEY doubles payouts inside the first 30s of a wave only',
      Math.abs(houseFloor - 200) < 1e-4 && Math.abs(houseLate - 100) < 1e-4,
      `early=${houseFloor} late=${houseLate}`);
    g.money.clear();

    // WIDOW'S MITE: a shop-entry top-up, exactly to the line.
    p.takeDonationItem('credits', 'widowsMite', g);
    g.credits = 3200.5;
    const miteGrant = g._widowsMite();
    const miteLands = g.credits;
    const miteEven = (g.credits = 6000, g._widowsMite());
    t("WIDOW'S MITE tops a sub-$5,000 shop entry up to exactly $5,000",
      Math.abs(miteGrant - 1799.5) < 1e-9 && miteLands === 5000
        && miteEven === 0 && g.credits === 6000,
      `grant=${miteGrant}`);

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
