// Donation Machine integration: one fixture, three payment paths, fair roulette
// landings, per-player progression, forfeiture and permanent shared rewards.
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
  await page.waitForFunction('window.__game && window.__game.donationMachine', { timeout: 30000 });

  const results = await page.evaluate(async () => {
    const g = window.__game;
    const p = g.player;
    const out = [];
    const t = (name, condition, extra = '') => out.push([name, !!condition, String(extra)]);
    g.autoTest = false;
    g.state = 'playing';
    g.waveState = 'intermission';
    g.queue.length = 0;
    g._clearEntities();

    const m = g.donationMachine;
    const random = Math.random;
    const poolIds = Object.keys(g.__donationItemsForTest);
    const step = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const tick = (seconds) => {
      m.update(seconds, g.time + seconds);
      g._donationEvents();
    };
    const machine = (kind) => {
      g._dismissDonationMachine();
      m.present(p, () => ({ ammo: 0.5, health: 1.5, credits: 2.5 }[kind]) / 3);
      m.state = 'up';
      m.rise = 1;
      m.group.position.y = 0;
      m.displayGroup.position.y = 0;
      return m;
    };
    const reset = () => {
      g._dismissDonationMachine();
      p.reset();
      g.credits = 0;
      g.money.clear();
      machine('ammo');
    };
    g._presentTotems();
    reset();

    // ---- one cabinet and one stable shop deal --------------------------
    const { cap } = await import('./js/padmenu.js');
    const { DONATION_KINDS, DONATION_SPIN_SECONDS, randomDonationKind,
      randomUnownedDonationItem } = await import('./js/donation-machines.js');
    const picks = Array.from({ length: 300 }, (_, i) => randomDonationKind(() => (i + 0.5) / 300));
    t('each machine kind occupies exactly one third of the random range',
      DONATION_KINDS.every((kind) => picks.filter((k) => k === kind).length === 100));
    const positions = [];
    const prompts = [];
    for (const kind of DONATION_KINDS) {
      machine(kind);
      positions.push(`${m.pos.x},${m.pos.z}`);
      const targets = [];
      m.addTargets(targets);
      t(`${kind} shop has one cabinet and one hit target`, targets.length === 1 && targets[0] === m.hit);
      const chosen = m.kind;
      m.present(p, () => 0);
      g._itemReroll();
      t(`${kind} shop rerolls retain the chosen cabinet`, m.kind === chosen);
      g.inputMode = 'kbm';
      prompts.push(g._usePrompt({ kind: 'donation', target: m })[0]);
    }
    t('every variant stands left of the box, aligned with an outer passive item',
      new Set(positions).size === 1 && m.pos.x > g.mysteryBox.pos.x
        && m.pos.x === g.totemArea.totems[2].pos.x
        && m.pos.z === g.mysteryBox.pos.z, positions.join(' / '));
    const config = g.__donationConfigForTest;
    t('payment colors are red, yellow and green',
      config.health.color === 0xff3b30 && config.ammo.color === 0xffd600 && config.credits.color === 0x00e676);
    t('payment costs are 25 health, 90 reserve ammo and 1000 credits',
      config.health.cost === 25 && config.ammo.cost === 90 && config.credits.cost === 1000);
    t('keyboard prompts show rebound Use and each fixed cost',
      prompts.every((text) => text.includes(g.keys.label('use')))
        && prompts[0].includes('90 AMMO') && prompts[1].includes('25 HP') && prompts[2].includes('$1,000'),
      prompts.join(' | '));
    t('prompts show neither shoot nor numeric probability',
      prompts.every((text) => !text.includes('SHOOT') && !text.includes('%')));
    g.inputMode = 'pad';
    t('controller prompt uses the rebound Use button',
      g._usePrompt({ kind: 'donation', target: machine('ammo') })[0].includes(cap(g.keys.padBtn('use'))));
    g.inputMode = 'kbm';
    t('machine label has no background frame',
      m.panel.canvas.getContext('2d').getImageData(10, 10, 1, 1).data[3] === 0);
    t('roulette replaces all meter and tier state',
      !!m.wheel && !m.meter && !('donationProgress' in p) && !('donationTiers' in p));

    // ---- price boundaries and independent loss resolution --------------
    reset();
    p.reserveAmmo = 89;
    const shortAmmo = g._useDonationMachine(m);
    p.reserveAmmo = 90;
    p.mag = p.magSize;
    const heldMag = p.mag;
    const ammoPaid = g._useDonationMachine(m, () => 0.99);
    const repeated = g._useDonationMachine(m, () => 0);
    t('ammo payment uses exactly 90 reserve rounds and never the magazine',
      !shortAmmo && ammoPaid && p.reserveAmmo === 0 && p.mag === heldMag);
    t('spin lock refuses another payment and leaves chance unchanged until settlement',
      !repeated && m.spinning && p.donationChance === 10 && m.spinChance === 10);
    tick(2.9);
    t('a spin remains active before three seconds', m.spinning && p.donationChance === 10);
    tick(0.1);
    t('a completed loss adds five points and expands the wedge',
      !m.spinning && p.donationChance === 15 && m.wheelMaterial.uniforms.uChance.value === 0.15);
    machine('health');
    t('chance follows the player across shops and payment kinds',
      p.donationChance === 15 && m.chance === 15);
    p.health = 25; p.shield = 50;
    const shortHp = g._useDonationMachine(m);
    p.health = 26;
    const oldHurt = p.lastHurt;
    const oldWaveDamage = g.waveDamageTaken;
    const healthPaid = g._useDonationMachine(m, () => 0.99);
    t('health payment cannot kill and bypasses shield and damage reactions',
      !shortHp && healthPaid && p.health === 1 && p.shield === 50
        && p.lastHurt === oldHurt && g.waveDamageTaken === oldWaveDamage);
    tick(DONATION_SPIN_SECONDS);
    machine('credits');
    g.credits = 999;
    const shortCredits = g._useDonationMachine(m);
    g.credits = 1000; p.spentTotal = 0; p.mods.highStakes = 1;
    const creditsPaid = g._useDonationMachine(m, () => 0.99);
    t('credits payment bills 1000 through the ledger without High Stakes waiver',
      !shortCredits && creditsPaid && g.credits === 0 && p.spentTotal === 1000);
    p.mods.highStakes = 0;
    tick(DONATION_SPIN_SECONDS);
    t('three different payment kinds advance the same progression', p.donationChance === 25);

    // ---- wheel landing, guaranteed win and collection ------------------
    const landings = [0, 0.099, 0.1, 0.149, 0.15, 0.49, 0.5, 0.999];
    for (const chance of [10, 15, 50, 100]) {
      for (const landing of landings) {
        reset(); p.donationChance = chance; m.setChance(chance);
        g._useDonationMachine(m, () => landing);
        tick(DONATION_SPIN_SECONDS);
        const phase = ((-m.wheelMaterial.uniforms.uAngle.value % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        t(`chance ${chance} landing ${landing} matches the wheel`,
          !!m.pendingId === (landing < chance / 100)
            && Math.abs(phase - landing * 2 * Math.PI) < 1e-8);
      }
    }
    reset(); g.credits = 100000;
    const progression = [p.donationChance];
    for (let i = 0; i < 18; i++) {
      machine('credits');
      g._useDonationMachine(m, () => 0.999);
      tick(DONATION_SPIN_SECONDS);
      progression.push(p.donationChance);
    }
    t('loss progression reaches 100 without overshooting',
      progression.every((chance, i) => chance === 10 + 5 * i), progression.join(','));
    machine('ammo'); p.reserveAmmo = 90;
    g._useDonationMachine(m, () => 0.999);
    tick(DONATION_SPIN_SECONDS);
    const reward = m.pendingId;
    t('100 guarantees an unowned reward and resets the chance',
      !!reward && p.donationChance === 10 && !p.donationItems[`donation/${reward}`]);
    t('a win disables and sinks the body while its reward stays floating',
      m.completedThisShop && m.state === 'sinking' && m.displayGroup.visible
        && m.displayGroup.position.y === 0 && m.icons[reward].visible);
    const pickupPrompt = g._usePrompt({ kind: 'donation', target: m })[0];
    t('won reward names Use to collect', pickupPrompt.includes(g.keys.label('use'))
      && pickupPrompt.includes(g.__donationItemsForTest[reward].name));
    tick(1);
    t('reward remains usable after the cabinet is hidden', m.state === 'hidden'
      && !!m.usable(m.pos) && !!m.pendingId);
    t('reward pickup grants once through shared ownership and the build sheet',
      g._takeDonationReward(m) && !g._takeDonationReward(m)
        && !!p.donationItems[`donation/${reward}`]
        && g._statPassives().some((row) => row.id === `donation/${reward}`));
    t('collecting never reopens the completed cabinet', !m.usable(m.pos));

    // A former health-pool reward can come from an ammo payment, and its
    // one-time hook only runs when the player actually collects it.
    reset(); p.health = 7;
    const rewardIndex = poolIds.indexOf('secondHeart');
    g._useDonationMachine(m, () => 0);
    Math.random = () => (rewardIndex + 0.5) / poolIds.length;
    tick(DONATION_SPIN_SECONDS);
    Math.random = random;
    const healthBeforeTake = p.health;
    g._takeDonationReward(m);
    t('ammo roulette can award SECOND HEART and runs its hook on collection',
      healthBeforeTake === 7 && p.health === p.maxHealth
        && p.donationItems['donation/secondHeart']);

    // ---- closure and pool exhaustion -----------------------------------
    reset(); machine('credits'); g.credits = 2000;
    g._useDonationMachine(m, () => 0);
    tick(1);
    // Every real totem claim path closes through this same method.
    const closingTotem = g.totemArea.totems[0];
    closingTotem.state = 'up';
    g._claimTotem(closingTotem, true);
    g._dismissDonationMachine();
    tick(10);
    t('closing a shop forfeits a hidden win, retains payment and raises chance once',
      p.donationChance === 15 && g.credits === 1000 && !m.spinning
        && !m.pendingId && Object.keys(p.donationItems).length === 0);
    machine('credits'); p.donationChance = 100; m.setChance(100); g.credits = 2000;
    g._useDonationMachine(m, () => 0.99);
    g._dismissDonationMachine();
    t('forfeiture at 100 remains capped at 100', p.donationChance === 100);
    machine('credits'); g.credits = 2000;
    g._useDonationMachine(m, () => 0);
    tick(DONATION_SPIN_SECONDS);
    g._dismissDonationMachine();
    t('uncollected win is forfeited without changing the reset chance',
      p.donationChance === 10 && !m.pendingId && Object.keys(p.donationItems).length === 0);
    g._presentTotems();
    reset();
    for (let i = 0; i < poolIds.length; i++) {
      machine(DONATION_KINDS[i % 3]);
      p.health = p.maxHealth; p.reserveAmmo = p.maxReserve; g.credits = 2000;
      g._useDonationMachine(m, () => 0);
      Math.random = () => 0;
      tick(DONATION_SPIN_SECONDS);
      Math.random = random;
      g._takeDonationReward(m);
    }
    machine('credits'); g.credits = 2000;
    const soldOutPaid = g._useDonationMachine(m);
    t('every kind draws unique rewards from the same complete pool',
      Object.keys(p.donationItems).length === poolIds.length);
    t('shared exhaustion refuses payment and shows SOLD OUT',
      !soldOutPaid && g.credits === 2000 && m.soldOut
        && g._donationBlocked(m) === 'SOLD OUT' && randomUnownedDonationItem(p) === null);
    g._debugDropDonation(`donation/${poolIds[0]}`);
    t('removing a debug reward reopens a sold-out cabinet immediately',
      !m.soldOut && g._useDonationMachine(m, () => 0.99));
    tick(DONATION_SPIN_SECONDS);
    t('rewards remain separate from the normal passive pool',
      poolIds.every((id) => !Object.hasOwn(g.__passiveItemsForTest, `donation/${id}`)));
    t('placeholder rewards are gone from the shared pool',
      !poolIds.some((id) => ['fatHandgun', 'magnaCarta', 'slideRule', 'fleshBank',
        'platedDessert', 'soulHarvest', 'lateFee', 'thinBlood', 'deathClause'].includes(id)));

    // ---- real game clock, pause and shot-only cover ---------------------
    reset();
    const beforeShot = p.reserveAmmo;
    p.pos.set(m.pos.x, 0, m.pos.z - 2);
    p.yaw = Math.PI; p.pitch = 0; p.applyCamera();
    g.shoot();
    t('shots cannot buy spins or change roulette chance',
      !m.spinning && p.reserveAmmo === beforeShot && p.donationChance === 10);
    g._useDonationMachine(m, () => 0.99);
    await step();
    g.pause();
    const frozenElapsed = m.spinElapsed;
    const frozenChance = p.donationChance;
    for (let i = 0; i < 8; i++) await step();
    t('pausing freezes the roulette and progression',
      m.spinElapsed === frozenElapsed && p.donationChance === frozenChance && m.spinning);
    g.resume();
    for (let i = 0; i < 700 && m.spinning; i++) await step();
    t('the actual frame loop settles a resumed three-second spin once',
      !m.spinning && m.spinElapsed === 3 && p.donationChance === 15);

    // ---- the original reward mechanics ----------------------------
    reset();
    const baseDamage = p.getEffectiveDamage(10);
    const baseRate = p.effectiveFireRate;
    const baseMag = p.magSize;
    for (const id of ['overpressure', 'clockworkSear', 'drumMajor', 'ghostCasings', 'skullReceipt']) p.takeDonationItem(id, g);
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
    p.takeDonationItem('secondHeart', g);
    t('SECOND HEART adds 20 max health and fills the new bar on pickup',
      p.maxHealth === oldMax + 20 && p.health === p.maxHealth,
      `${p.health}/${p.maxHealth}`);
    p.takeDonationItem('panicPlate', g);
    p.health = 50;
    const atFifty = p.incomingMult;
    p.health = 49;
    const underFifty = p.incomingMult;
    t('PANIC PLATE halves damage only below 50 HP',
      atFifty === 1 && underFifty === 0.5,
      `at50=${atFifty} under50=${underFifty}`);
    p.takeDonationItem('ivoryDrip', g);
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
    p.takeDonationItem('signingBonus', g);
    t('SIGNING BONUS grants exactly $10,000 on pickup', g.credits === 10125,
      `credits=${g.credits}`);
    p.takeDonationItem('remoteDeposit', g);
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
    p.takeDonationItem('scrapMetal', g);
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
    p.takeDonationItem('chainLetter', g);
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
    p.takeDonationItem('lighter', g);
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
    p.takeDonationItem('snake', g);
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
    p.takeDonationItem('luckyNumber', g);
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
    p.takeDonationItem('paperCrown', g);
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
    p.takeDonationItem('halfTruth', g);
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
    p.takeDonationItem('badOmen', g);
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
    p.takeDonationItem('ammoAlchemist', g);
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
    p.takeDonationItem('ceramicSkin', g);
    t('CERAMIC SKIN adds exactly 40 max health', p.maxHealth === skinBase + 40,
      `${skinBase} -> ${p.maxHealth}`);

    // MED SCHOOL, ILL WILL, MALICE AFORETHOUGHT - flat modifiers.
    p.takeDonationItem('medSchool', g);
    const medCrit = p.mods.critChance - 0.05;
    p.takeDonationItem('illWill', g);
    const illDmg = p.mods.damage;
    p.takeDonationItem('maliceAforethought', g);
    t('MED SCHOOL adds exactly 30% crit chance',
      Math.abs(medCrit - 0.3) < 1e-9, `crit=${p.mods.critChance}`);
    t('ILL WILL grants 15% and MALICE AFORETHOUGHT 20% on top of it',
      Math.abs(illDmg - 1.15) < 1e-9 && Math.abs(p.mods.damage - 1.38) < 1e-9,
      `dmg=${p.mods.damage}`);

    // DIRECT DEPOSIT: every fifth shot pays 1 HP.
    reset();
    p.takeDonationItem('directDeposit', g);
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
    p.takeDonationItem('goldStar', g);
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
    p.takeDonationItem('karma', g);
    p.health = 40; g.credits = 2000;
    g._useDonationMachine(machine('credits'));
    t('KARMA heals 5 HP per donation made', p.health === 45 && g.credits === 1000,
      `health=${p.health} credits=${g.credits}`);

    // CREDITS - TITHING BLADE: a tenth of damage dealt, into the balance.
    reset();
    p.takeDonationItem('tithingBlade', g);
    g.credits = 0;
    const titheTarget = new (g.__EnemyForTest)('chaser', new V(0, 0, -9), 1, 1, 1);
    titheTarget.takeDamage(100);
    const bankedTithe = g.credits;
    titheTarget.dispose();
    g.scene.remove(titheTarget.group);
    t('TITHING BLADE converts 10% of damage dealt to credits instantly',
      bankedTithe === 10, `credits=${bankedTithe}`);

    // NEXT OF KIN: the drop table's luck multiplier.
    p.takeDonationItem('nextOfKin', g);
    t('NEXT OF KIN raises every drop roll by 30%',
      Math.abs(p.mods.dropLuck - 1.3) < 1e-9, `dropLuck=${p.mods.dropLuck}`);

    // THE TAB: purchases reach into debt, down to a hard -$10,000.
    p.reserveAmmo = 0; g.credits = 200;
    const blockedWithoutTab = g._stationBlocked(g.totemArea.ammoStation);
    p.takeDonationItem('theTab', g);
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
    p.takeDonationItem('houseMoney', g);
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
    p.takeDonationItem('widowsMite', g);
    g.credits = 3200.5;
    const miteGrant = g._widowsMite();
    const miteLands = g.credits;
    const miteEven = (g.credits = 6000, g._widowsMite());
    t("WIDOW'S MITE tops a sub-$5,000 shop entry up to exactly $5,000",
      Math.abs(miteGrant - 1799.5) < 1e-9 && miteLands === 5000
        && miteEven === 0 && g.credits === 6000,
      `grant=${miteGrant}`);

    // A new run cannot inherit an unfinished payment from the old body.
    machine('credits'); g.credits = 2000;
    g._useDonationMachine(m, () => 0);
    g.autoTest = true;
    g.beginGame();
    t('a new run resets chance and rewards and cancels an old spin',
      p.donationChance === 10 && Object.keys(p.donationItems).length === 0
        && !m.spinning && !m.pendingId);

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
