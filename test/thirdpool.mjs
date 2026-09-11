// THE TWENTY-SEVEN PASSIVE ITEMS ADDED AFTER THE POSTURE POOL, and the four
// things about them that nothing else in the test set was watching:
//
//   1. RUNNING TOTALS. PAPER TRAIL counts every credit a run has ever spent,
//      RAFFLE TICKET counts every box it has ever bought and GRISTLE banks max
//      health off crates. All three live on the Player rather than in `mods`,
//      because mods are replayed from DEFAULT_MODS on every draft pick - so
//      the assertion that matters for each of them is that a totem claimed
//      AFTERWARDS does not hand the total back. That is the failure mode this
//      file exists for, and it is invisible in play: the number is only ever
//      slightly too small.
//   2. ONE-PER-TRIGGER-PULL. PITY PARTY counts droughts and RED HARVEST tosses
//      a coin, and both are settled once per shot however many pellets landed
//      - the same rule the crit family follows and the same way a scattergun
//      breaks it.
//   3. GATES ON A POSTURE OR A PLACE. TIGHTROPE reads height, RUNNING ON FUMES
//      reads the stamina lockout's own line, COLD BLOOD reads a quarter of the
//      bar and IRON LITURGY reads the sights. Each of them is asserted as a
//      DIFFERENCE - the same stat with the gate open and shut - because a
//      number that is set correctly and read nowhere looks identical from
//      outside.
//   4. THE WAVE BOUNDARY. HIGH INTEREST, MOVING DAY and CURTAIN CALL all fire
//      at a clear, in a particular order relative to the orb sweep and the
//      medical bill, and two of them would read as doing nothing at all if
//      that order were wrong.
//
// AND THE ONE THAT COST AN AFTERNOON: two methods of the same name in one
// class body. `_transfuse` was already BLOOD TRANSFUSION's, three thousand
// lines up; a second one silently replaced it, the item stopped working, and
// what surfaced was a null dereference in test/active.mjs. Nothing here can
// catch that directly - but the last block in this file walks every new pick
// through a live loop, which is what made it reproducible.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8242;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 620 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const r = await page.evaluate(async () => {
    const g = window.__game;
    g.autoTest = false;
    const P = g.player;
    const UP = g.__upgradesForTest;
    const o = {};
    const V = P.pos.constructor;
    const step = () => new Promise((res) => requestAnimationFrame(res));

    // A clean build. rebuildMods replays the owned list from DEFAULT_MODS, so
    // emptying the list is the whole reset - but the RUN TOTALS are on the
    // player and deliberately survive it, which is what several of the
    // assertions below are about, so they are cleared by hand.
    const bare = () => {
      for (const k of Object.keys(P.upgrades)) delete P.upgrades[k];
      P.rebuildMods();
      P.health = P.maxHealth;
      P.stamina = 100;
      P.staminaLocked = false;
      P.aiming = false;
      P.crouching = false;
      P.sliding = false;
      P.pos.set(0, 0, 0);
      P.magAtShot = 0;
      P.pityMiss = 0;
      P.pityNext = false;
      P.pityShot = false;
      P.healOwed = 0;
      P.healRate = 0;
      P.quorumKills = 0;
    };
    const give = (id) => { P.upgrades[id] = 1; P.rebuildMods(); };
    const clearField = () => { g.enemies.length = 0; };
    const spawn = (type = 'chaser', x = 2, z = 2) => {
      const e = new g.__EnemyForTest(type, new V(x, 0, z), 40, 1, 1);
      g.scene.add(e.group);
      g.enemies.push(e);
      return e;
    };
    // THE MUSIC HAS TO RUN, for the reason test/active.mjs carries at length:
    // every damage-over-time tick in this game hangs off Music.pulse, so a
    // helper that drives the enemy step directly and never samples the music
    // lands no poison at all.
    const tick = (n, dt = 0.05) => {
      for (let i = 0; i < n; i++) {
        g.time += dt;
        g.music.sample(dt);
        g._updateEnemies(dt);
      }
    };

    g.state = 'playing';
    g.waveState = 'active';
    P.spentTotal = 0;
    P.boxesBought = 0;
    P.crateHp = 0;
    bare();

    // ---- 1. THE GUN, AND THE MOMENTS IT IS BETTER --------------------------

    // CROWBAR. The swing, and the rounds it pays for.
    bare();
    clearField();
    const cbTarget = spawn('chaser', 0, -2);
    P.yaw = 0;                                   // -sin/-cos: facing -Z
    P.reserveAmmo = 10;
    const cbBefore = cbTarget.hp;
    g._meleeStrike();
    o.meleePlain = cbBefore - cbTarget.hp;
    o.meleePlainAmmo = P.reserveAmmo - 10;
    bare();
    clearField();
    const cbTarget2 = spawn('chaser', 0, -2);
    P.yaw = 0;
    P.reserveAmmo = 10;
    give('crowbar');
    const cbBefore2 = cbTarget2.hp;
    g._meleeStrike();
    o.meleeCrow = cbBefore2 - cbTarget2.hp;
    o.meleeCrowAmmo = P.reserveAmmo - 10;
    // A SWING THAT CAUGHT NOTHING PAYS NOTHING, which is the whole of why the
    // ten rounds hang off the target rather than off the button.
    clearField();
    P.reserveAmmo = 10;
    P.meleeCd = 0;
    g._meleeStrike();
    o.meleeMissAmmo = P.reserveAmmo - 10;

    // HARM WANDS. The bottom of the magazine, read off what the TRIGGER saw.
    bare();
    P.magAtShot = 30;
    const wandsBase = P.effectiveFireRate;
    give('harmWands');
    P.magAtShot = 30;
    o.wandsTop = P.effectiveFireRate / wandsBase;
    P.magAtShot = 15;
    o.wandsEdge = P.effectiveFireRate / wandsBase;
    P.magAtShot = 4;
    o.wandsBottom = P.effectiveFireRate / wandsBase;

    // TIGHTROPE. Height, and nothing else.
    bare();
    const highBase = P.effectiveFireRate;
    give('tightrope');
    P.pos.y = 0;
    o.ropeFloor = P.effectiveFireRate / highBase;
    P.pos.y = 2.5;
    o.ropeRaised = P.effectiveFireRate / highBase;
    P.pos.y = 0;

    // RUNNING ON FUMES. The lockout's own line - see Player.staminaLow.
    bare();
    const fumesRate = P.effectiveFireRate;
    const fumesDmg = P.getEffectiveDamage(100);
    give('runningOnFumes');
    P.stamina = 100;
    o.fumesFullRate = P.effectiveFireRate / fumesRate;
    o.fumesFullDmg = P.getEffectiveDamage(100) / fumesDmg;
    P.stamina = 5;
    o.fumesLow = P.staminaLow;
    o.fumesLowRate = P.effectiveFireRate / fumesRate;
    o.fumesLowDmg = P.getEffectiveDamage(100) / fumesDmg;
    P.stamina = 100;

    // ---- 2. THE CRIT FAMILY, THREE MORE ------------------------------------

    // IRON LITURGY, off the aim flag.
    bare();
    give('ironLiturgy');
    P.aiming = false;
    P.trueStrikeLeft = 0;
    o.liturgyHip = P.mods.critChance;
    // rollCrit is the only place the bonus is added, so the chance itself is
    // read by rolling a great many and counting - a deterministic read of
    // mods.critChance would miss a bonus applied at the roll, which is exactly
    // where this one is.
    const rollRate = () => {
      let hits = 0;
      for (let i = 0; i < 20000; i++) if (P.rollCrit()) hits++;
      return hits / 20000;
    };
    P.aiming = false;
    o.liturgyHipRate = rollRate();
    P.aiming = true;
    o.liturgyAdsRate = rollRate();
    P.aiming = false;

    // PITY PARTY. Five LANDED shots without a crit.
    bare();
    give('pityParty');
    o.pityArmSteps = [];
    for (let i = 0; i < 5; i++) {
      P.settlePity(true, false);
      o.pityArmSteps.push(P.pityNext);
    }
    o.pityOwed = P.pityNext;
    o.pityCrit = P.rollCrit();
    o.pityShotFlag = P.pityShot;
    // FIVE TIMES, FLAT - not five times critMult.
    const pityBody = new g.__EnemyForTest('chaser', new V(0, 0, -3), 40, 1, 1);
    o.pityMult = g._hitMult(pityBody, true);
    P.settlePity(true, true);
    o.pityShotCleared = P.pityShot;
    o.pityResetOnCrit = P.pityMiss;
    // A SHOT THAT TOUCHED NOTHING IS NOT A DROUGHT.
    P.pityMiss = 0;
    P.pityNext = false;
    for (let i = 0; i < 10; i++) P.settlePity(false, false);
    o.pityMissesIgnored = P.pityMiss === 0 && !P.pityNext;

    // RED HARVEST. Half of crits heal a point.
    bare();
    give('redHarvest');
    P.health = P.maxHealth - 40;
    let harvested = 0;
    for (let i = 0; i < 400; i++) {
      const before = P.health;
      g._critHeal(true);
      if (P.health > before) harvested++;
      P.health = Math.min(P.health, P.maxHealth - 40);
    }
    o.harvestRate = harvested / 400;
    // A NON-CRIT NEVER PAYS.
    P.health = P.maxHealth - 40;
    for (let i = 0; i < 200; i++) g._critHeal(false);
    o.harvestNonCrit = P.health === P.maxHealth - 40;

    // ---- 3. DAMAGE, AND WHAT IT IS MEASURED AGAINST -------------------------

    // FEVER DREAM. The status on the PLAYER.
    bare();
    const feverBase = P.getEffectiveDamage(100);
    give('feverDream');
    P.clearStatuses();
    o.feverClean = P.getEffectiveDamage(100) / feverBase;
    P.applyStatus('poison');
    o.feverPoisoned = P.getEffectiveDamage(100) / feverBase;
    // AND ONLY POISON: being on fire is not being poisoned.
    P.clearStatuses();
    P.applyStatus('fire');
    o.feverBurning = P.getEffectiveDamage(100) / feverBase;
    P.clearStatuses();

    // LONG HAUL. Seconds of a boss fight, uncapped, and bosses only.
    bare();
    give('longHaul');
    const haulBoss = new g.__EnemyForTest('chaser', new V(0, 0, -3), 40, 1, 1);
    haulBoss.boss = true;
    const haulMook = new g.__EnemyForTest('chaser', new V(0, 0, -3), 40, 1, 1);
    const heldBoss = g.bossFight;
    g.bossFight = { startedAt: g.time, parts: [haulBoss] };
    o.haulOpen = g._hitMult(haulBoss, false);
    g.bossFight.startedAt = g.time - 60;
    o.haulMinute = g._hitMult(haulBoss, false);
    g.bossFight.startedAt = g.time - 120;
    o.haulTwoMinutes = g._hitMult(haulBoss, false);
    o.haulMook = g._hitMult(haulMook, false);
    g.bossFight = heldBoss;

    // SECONDARY INFECTION. The one status that stacks, three deep.
    bare();
    clearField();
    const poisoned = spawn('chaser', 0, -3);
    poisoned.applyStatus('poison', 8, 10);
    o.stacksBare = poisoned.poisonStacks;
    poisoned.applyStatus('poison', 8, 10);
    poisoned.applyStatus('poison', 8, 10);
    o.stacksBareAfterThree = poisoned.poisonStacks;
    give('secondaryInfection');
    // Pushed the way main.js pushes it, from the frame loop.
    g.__setPoisonCap(P.mods.poisonStacks);
    clearField();
    const stacked = spawn('chaser', 0, -3);
    stacked.applyStatus('poison', 8, 10);
    o.stackOne = stacked.poisonStacks;
    stacked.applyStatus('poison', 8, 10);
    stacked.applyStatus('poison', 8, 10);
    o.stackThree = stacked.poisonStacks;
    stacked.applyStatus('poison', 8, 10);
    o.stackCapped = stacked.poisonStacks;
    // And the tick is worth the stack. Two bodies, one clean and one stacked,
    // over the same beats.
    clearField();
    const single = spawn('chaser', -4, -3);
    const triple = spawn('chaser', 4, -3);
    single.applyStatus('poison', 8, 10);
    triple.applyStatus('poison', 8, 10);
    triple.applyStatus('poison', 8, 10);
    triple.applyStatus('poison', 8, 10);
    const singleHp = single.hp;
    const tripleHp = triple.hp;
    tick(120);
    o.poisonSingle = singleHp - single.hp;
    o.poisonTriple = tripleHp - triple.hp;
    // The stack dies with the timer.
    clearField();
    const lapsing = spawn('chaser', 0, -3);
    lapsing.applyStatus('poison', 0.6, 1);
    lapsing.applyStatus('poison', 0.6, 1);
    tick(40);
    o.stackLapsed = lapsing.poisonStacks;
    g.__setPoisonCap(1);
    clearField();

    // UNDERFED. The enemy, not the player.
    bare();
    const plainHp = new g.__EnemyForTest('chaser', new V(0, 0, -3), 40, 1, 1).maxHp;
    give('underfed');
    o.underfedMult = P.mods.enemyHpMult;
    o.underfedHp = new g.__EnemyForTest(
      'chaser', new V(0, 0, -3), 40 * P.mods.enemyHpMult, 1, 1
    ).maxHp / plainHp;

    // ---- 4. STAYING ALIVE ---------------------------------------------------

    // COLD BLOOD. A line on the bar, not a ramp.
    bare();
    give('coldBlood');
    P.health = P.maxHealth;
    o.coldFull = P.incomingMult;
    P.health = P.maxHealth * 0.26;
    o.coldJustAbove = P.incomingMult;
    P.health = P.maxHealth * 0.24;
    o.coldBelow = P.incomingMult;
    P.health = P.maxHealth;

    // MONEY BELT. Per $500, capped at 20%.
    bare();
    give('moneyBelt');
    P.balance = 0;
    o.beltBroke = P.incomingMult;
    P.balance = 499;
    o.beltUnderOne = P.incomingMult;
    P.balance = 2500;
    o.beltFive = P.incomingMult;
    P.balance = 100000;
    o.beltCapped = P.incomingMult;
    P.balance = 0;

    // FRESH BANDAGES rides the reload signal in the frame loop, so it is
    // asserted through the mod and the gate rather than through a hand-rolled
    // copy of the branch - see the live-loop block at the foot of this file,
    // which is what actually exercises the reload.
    bare();
    give('freshBandages');
    o.bandage = P.mods.bandage;

    // SLOW RELEASE. A POOL and a RATE, and two crates stack as two.
    bare();
    give('slowRelease');
    P.health = 1;
    const crate = () => g.__powerupsForTest.health.apply(P, g.time);
    crate();
    o.slowOwedOne = P.healOwed;
    o.slowRateOne = P.healRate;
    o.slowInstant = P.health;
    crate();
    o.slowOwedTwo = P.healOwed;
    o.slowRateTwo = P.healRate;
    // Ten seconds of it pays half of what is owed, at twice the rate.
    const owedBefore = P.healOwed;
    for (let i = 0; i < 200; i++) P._tickSlowRelease(0.05);
    o.slowHalfPaid = owedBefore - P.healOwed;
    for (let i = 0; i < 400; i++) P._tickSlowRelease(0.05);
    o.slowDrained = P.healOwed === 0 && P.healRate === 0;
    // AND A CRATE WITHOUT THE PICK IS STILL INSTANT.
    bare();
    P.health = 1;
    crate();
    o.plainCrate = P.health;
    o.plainCrateOwes = P.healOwed;

    // GRISTLE. A bank of its own, and it survives a draft pick.
    bare();
    give('gristle');
    P.crateHp = 0;
    const maxBefore = P.maxHealth;
    let banked = 0;
    for (let i = 0; i < 400; i++) if (P.bankCrateHealth()) banked++;
    o.gristleRate = banked / 400;
    o.gristleMax = P.maxHealth - maxBefore;
    o.gristleIsBank = P.crateHp;
    // THE POINT OF THE WHOLE FIELD: a totem claimed afterwards must not hand
    // it back. hpBanked is SCAR TISSUE's and is capped by hpBankCap; this is
    // not, and the two must not share.
    const beforeRebuild = P.maxHealth;
    give('overclock');
    o.gristleSurvives = P.maxHealth === beforeRebuild;
    P.crateHp = 0;

    // STRAY MERCY. A projectile that never landed.
    bare();
    give('strayMercy');
    o.mercyChance = P.mods.strayMercy;
    P.health = 20;
    g._strayMercy(new V(0, 1, -2));
    o.mercyHealed = P.health - 20;
    // AND NOTHING WAS HIT: carnage keeps its stacks and the wave stays clean.
    bare();
    give('strayMercy');
    give('carnage');
    P.carnageStacks = 5;
    g.waveDamageTaken = 0;
    P.health = 20;
    g._strayMercy(new V(0, 1, -2));
    o.mercyKeepsCarnage = P.carnageStacks === 5 && g.waveDamageTaken === 0;

    // CURTAIN CALL. Three crates, wherever the last body fell.
    bare();
    give('curtainCall');
    for (const p of g.powerups) p.destroy();
    g.powerups.length = 0;
    g._lastKillPos = new V(5, 0, 5);
    P.health = P.maxHealth;          // a full bar must not withhold them
    g._curtainCall();
    o.curtainCrates = g.powerups.filter((p) => p.typeKey === 'health').length;
    for (const p of g.powerups) p.destroy();
    g.powerups.length = 0;
    // ...and a run without the pick gets nothing.
    bare();
    g._lastKillPos = new V(5, 0, 5);
    g._curtainCall();
    o.curtainBare = g.powerups.length;

    // ---- 5. MONEY -----------------------------------------------------------

    // HIGH INTEREST. A fifth of the balance, at the boundary, compounding.
    bare();
    give('highInterest');
    const heldCredits = g.credits;
    g.credits = 1000;
    o.interestOne = g._payInterest();
    o.interestBalanceOne = g.credits;
    o.interestTwo = g._payInterest();
    o.interestBalanceTwo = g.credits;
    g.credits = 0;
    o.interestBroke = g._payInterest();
    // ...and nothing at all without it.
    bare();
    g.credits = 1000;
    o.interestBare = g._payInterest();
    g.credits = heldCredits;

    // PAPER TRAIL. Every credit ever spent, through one door.
    bare();
    give('paperTrail');
    P.spentTotal = 0;
    const trailBase = P.getEffectiveDamage(100);
    o.trailUnderOneK = P.getEffectiveDamage(100) / trailBase;
    P.spentTotal = 999;
    o.trailJustUnder = P.getEffectiveDamage(100) / trailBase;
    P.spentTotal = 10000;
    o.trailTenK = P.getEffectiveDamage(100) / trailBase;
    // AND _spend IS THE ONLY DOOR. Every till in the shop goes through it.
    P.spentTotal = 0;
    const creditsHeld = g.credits;
    g.credits = 50000;
    g._spend(1200);
    g._payReroll(800);
    o.trailCounted = P.spentTotal;
    o.trailBilled = 50000 - g.credits;
    // ...and it survives a draft pick, for the reason the crate bank does.
    give('overclock');
    o.trailSurvives = P.spentTotal === 2000;
    g.credits = creditsHeld;
    P.spentTotal = 0;

    // RAFFLE TICKET. The charge rate, per box bought.
    bare();
    P.giveItem('itemHeal');
    P.itemCharge = 0;
    P.addItemCharge(10);
    o.raffleBare = P.itemCharge;
    give('raffleTicket');
    P.boxesBought = 4;
    P.itemCharge = 0;
    P.addItemCharge(10);
    o.raffleFour = P.itemCharge;
    // ...and the count is a RUN total, not a shop's.
    give('overclock');
    o.raffleSurvives = P.boxesBought === 4;
    P.boxesBought = 0;

    // FIRE SALE. Twice the value, and the fuse that pays for it.
    bare();
    P.reserveAmmo = 0;
    g.__ammoPickupForTest.apply(P, g.time);
    o.ammoPlain = P.reserveAmmo;
    give('fireSale');
    P.reserveAmmo = 0;
    g.__ammoPickupForTest.apply(P, g.time);
    o.ammoSale = P.reserveAmmo;
    o.saleDespawn = P.mods.lootDespawn;
    // The orb fuse is pushed from the frame loop; assert the push, not a copy.
    g.money.setLifetime(20 * P.mods.lootDespawn);
    o.orbFuse = g.money.life;
    g.money.setLifetime(20);

    // MOVING DAY. What is on the floor at the clear, in rounds.
    bare();
    give('movingDay');
    g.money.clear();
    for (let i = 0; i < 6; i++) g.money.spawn(new V(i, 0, 0), 15, 1);
    o.orbsDown = g.money.count;
    P.reserveAmmo = 0;
    g._movingDay();
    o.movingGot = P.reserveAmmo;
    // THE ORBS ARE NOT CONSUMED - the sweep still pays their credits.
    o.movingKeptOrbs = g.money.count === o.orbsDown;
    // ...and the reserve cap is the only ceiling.
    P.reserveAmmo = P.maxReserve - 3;
    g._movingDay();
    o.movingCapped = P.reserveAmmo === P.maxReserve;
    g.money.clear();

    // ---- 6. MOVEMENT --------------------------------------------------------

    // UPDRAFT. Held jump, and it CLIMBS.
    bare();
    give('updraft');
    o.floatArmed = P.mods.floatDrain > 0 && P.mods.floatRise > 0 && P.mods.floatLift > 0;
    const held = { ...g.input, jump: true };
    // A FALL IS CAUGHT AND THEN TURNED ROUND, over frames rather than on one:
    // the lift is an acceleration, so the assertion is the SHAPE, not a single
    // value - still falling after one frame, rising by the time it settles.
    P.onGround = false;
    P.pos.set(0, 6, 0);
    P.vel.set(0, -14, 0);
    P.stamina = 100;
    P.staminaLocked = false;
    P.update(0.05, held, g.arena.obstacles, g.time, true);
    o.floatAfterOne = P.vel.y;
    for (let i = 0; i < 12; i++) P.update(0.05, held, g.arena.obstacles, g.time, true);
    o.floatSettled = P.vel.y;
    o.floatSpent = 100 - P.stamina;
    // AND IT ACTUALLY GAINS HEIGHT from a standing start on the floor.
    bare();
    give('updraft');
    P.pos.set(0, 0, 0);
    P.vel.set(0, 0, 0);
    P.onGround = false;
    P.stamina = 100;
    P.staminaLocked = false;
    for (let i = 0; i < 20; i++) P.update(0.05, held, g.arena.obstacles, g.time, true);
    o.floatClimbed = P.pos.y;
    // THE LID STOPS IT. The room is a closed box and the ceiling was never a
    // collider before this pick could reach it - a climb that did not stop
    // leaves the venue entirely.
    for (let i = 0; i < 400; i++) {
      P.stamina = 100;
      P.staminaLocked = false;
      P.update(0.05, held, g.arena.obstacles, g.time, true);
    }
    o.floatCeiling = P.pos.y;
    o.floatHead = P.pos.y + Math.max(1.8, P.eyeH + 0.25);
    o.ceilY = g.__ceilForTest;
    // A LOCKED BAR DOES NOT CLIMB: the lockout is the sprint's, and it is what
    // stops the pick being flight.
    P.pos.set(0, 6, 0);
    P.vel.set(0, -14, 0);
    P.stamina = 0;
    P.staminaLocked = true;
    P.onGround = false;
    P.update(0.05, held, g.arena.obstacles, g.time, true);
    o.floatLocked = P.vel.y;
    // AND IT NEVER CAPS A FASTER CLIMB. A jump leaves at JUMP_V, well over the
    // float's own terminal, and holding the button must not pull it DOWN to
    // that - pressing jump would make you go less high.
    P.pos.set(0, 6, 0);
    P.vel.set(0, 9, 0);
    P.stamina = 100;
    P.staminaLocked = false;
    P.onGround = false;
    P.update(0.05, held, g.arena.obstacles, g.time, true);
    o.floatRising = P.vel.y;
    // THE WHOLE BAR, IN SECONDS OF CLIMB, AND IN METRES. The pair the exploit
    // is priced against - see the note on the pick. The height is what the
    // assertion actually cares about: one bar must not reach the lid.
    o.floatBarSeconds = +(100 / P.mods.floatDrain).toFixed(2);
    o.floatBarMetres = +(o.floatBarSeconds * P.mods.floatRise).toFixed(2);
    o.lidHeight = g.__ceilForTest - Math.max(1.8, P.eyeH + 0.25);
    P.pos.set(0, 0, 0);
    P.vel.set(0, 0, 0);
    P.onGround = true;

    // JACKPOT. One ground hop in a hundred.
    bare();
    give('jackpot');
    o.jackpotChance = P.mods.jackpot;
    let jackpots = 0;
    const jumpInput = { ...g.input, jump: true };
    for (let i = 0; i < 4000; i++) {
      P.pos.set(0, 0, 0);
      P.vel.set(0, 0, 0);
      P.onGround = true;
      P.health = 1;
      P.reserveAmmo = 0;
      P._prevJump = false;
      P.update(0.016, jumpInput, g.arena.obstacles, g.time, true);
      if (P.jackpotFx) {
        jackpots++;
        P.jackpotFx = false;
        if (jackpots === 1) {
          o.jackpotHp = P.health === P.maxHealth;
          o.jackpotAmmo = P.reserveAmmo === P.maxReserve;
        }
      }
    }
    o.jackpotRate = jackpots / 4000;
    P.pos.set(0, 0, 0);
    P.vel.set(0, 0, 0);
    P.onGround = true;
    P.health = P.maxHealth;

    // SCORCHED EARTH. The slide lays the reload trail's own patches.
    bare();
    give('scorchedEarth');
    g._fire.length = 0;
    g._fireLaying = false;
    g._fireUntil = 0;
    P.sliding = false;
    g._updateFire(0.05);
    o.fireNotSliding = g._fire.length;
    P.sliding = true;
    P.pos.set(0, 0, 0);
    g._updateFire(0.05);
    o.fireFirstPatch = g._fire.length;
    for (let i = 1; i <= 8; i++) {
      P.pos.set(i * 1.6, 0, 0);
      g._updateFire(0.05);
    }
    o.fireTrail = g._fire.length;
    o.firePower = g._fire.length ? g._fire[0].power : 0;
    P.sliding = false;
    for (const f of g._fire) g.effects.creepRelease(f.creep);
    g._fire.length = 0;
    g._fireLaying = false;

    // QUORUM. Ten bodies, one gun, its own cap.
    bare();
    give('quorum');
    for (const d of g._deployed) d.destroy();
    g._deployed.length = 0;
    for (let i = 0; i < 3; i++) g._quorumTurret();
    o.quorumUp = g._deployed.filter((d) => d.quorum).length;
    g._quorumTurret();
    o.quorumCapped = g._deployed.filter((d) => d.quorum).length;
    o.quorumLife = g._deployed[0] ? g._deployed[0].life : 0;
    for (const d of g._deployed) d.destroy();
    g._deployed.length = 0;

    // ---- 7. THE POOL --------------------------------------------------------

    const NEWKEYS = [
      'crowbar', 'harmWands', 'tightrope', 'runningOnFumes',
      'ironLiturgy', 'pityParty', 'redHarvest',
      'feverDream', 'longHaul', 'secondaryInfection', 'underfed',
      'coldBlood', 'freshBandages', 'curtainCall', 'slowRelease', 'strayMercy',
      'gristle', 'highInterest', 'paperTrail', 'moneyBelt', 'fireSale',
      'movingDay', 'raffleTicket', 'updraft', 'jackpot', 'scorchedEarth',
      'quorum',
    ];
    o.missing = NEWKEYS.filter((k) => !UP[k]);
    // EVERY ONE IS MAX 1, which is the contract the whole block is written to:
    // zero means not owned, and every reader tests for it.
    o.notSingleTier = NEWKEYS.filter((k) => UP[k] && UP[k].max !== 1);
    // NO TWO NAMES ALIKE, across the passive pool AND the item pool. The
    // collision this catches is not cosmetic: two things called the same thing
    // in the HUD is a player who cannot tell what they are carrying.
    const names = {};
    o.nameClashes = [];
    for (const [k, d] of Object.entries(UP)) {
      if (names[d.name]) o.nameClashes.push(d.name + ': ' + names[d.name] + '/' + k);
      names[d.name] = k;
    }
    for (const [k, d] of Object.entries(g.__itemsForTest)) {
      if (names[d.name]) o.nameClashes.push(d.name + ': ' + names[d.name] + '/' + k);
      names[d.name] = k;
    }
    // NO NEW COLOUR ALREADY IN USE. The totem is read before its icon
    // resolves, so two picks on one hue are two picks that cannot be told
    // apart across the arena.
    //
    // SCOPED TO THE NEW KEYS, the way test/newpool.mjs scopes its own: six
    // pairs in the OLD pool share a value (crystallize/cryo, ashen/blastCorpse
    // and four more) and every one of them is deliberate - they are a pick and
    // the status it belongs to. Asserting over the whole table would be
    // asserting that somebody else's decision was wrong.
    const isNew = new Set(NEWKEYS);
    const held2 = {};
    for (const [k, d] of Object.entries(UP)) {
      if (!isNew.has(k)) (held2[d.theme] = held2[d.theme] || []).push(k);
    }
    o.themeClashes = [];
    for (const k of NEWKEYS) {
      const t = UP[k].theme;
      if (held2[t]) o.themeClashes.push(k + '/' + held2[t][0]);
      (held2[t] = held2[t] || []).push(k);
    }

    // ---- 8. ALL TWENTY-SEVEN AT ONCE, THROUGH A REAL LOOP -------------------
    //
    // The block that would have caught the duplicate method name: every new
    // pick owned, a crowd on the floor, the trigger down, and the actual frame
    // loop running - so the reload branch, the float, the fire trail, the
    // turret and the per-hit path are all exercised together rather than each
    // being poked in isolation.
    bare();
    for (const k of NEWKEYS) P.upgrades[k] = 1;
    P.rebuildMods();
    clearField();
    // FAR ENOUGH TO CLOSE, NOT CLOSE ENOUGH TO SWARM. An earlier version put
    // five chasers three metres away and started the player at 40% - which
    // made the assertion a fight the player sometimes lost, and a suite that
    // fails on a dice roll is worse than no suite. What is being tested here
    // is that twenty-seven picks can all run in one frame, not that the build
    // wins; the health gates each have their own assertion above.
    for (let i = 0; i < 5; i++) spawn('chaser', -6 + i * 3, -20);
    P.health = P.maxHealth;
    // A LOW BAR AND A NEARLY EMPTY MAGAZINE, so RUNNING ON FUMES is live and a
    // reload actually happens inside the window - which is what puts FRESH
    // BANDAGES, HELLFIRE's arming branch and PRIMED MAG on the same path.
    P.stamina = 20;
    P.mag = 3;
    g.input.shoot = true;
    g.state = 'playing';
    for (let i = 0; i < 90; i++) await step();
    g.input.shoot = false;
    o.survived = true;
    o.aliveAfter = P.health > 0;
    o.stateAfter = g.state;

    return o;
  });

  // ---- the gun ----
  ok('crowbar swings for four times the damage',
    near(r.meleeCrow / r.meleePlain, 4, 0.02),
    `plain=${Math.round(r.meleePlain)} crowbar=${Math.round(r.meleeCrow)}`);
  ok('and a plain swing pays no ammo', r.meleePlainAmmo === 0, String(r.meleePlainAmmo));
  ok('and a crowbar hit pays ten', r.meleeCrowAmmo === 10, String(r.meleeCrowAmmo));
  ok('and a swing that caught nothing pays none', r.meleeMissAmmo === 0,
    String(r.meleeMissAmmo));

  ok('harm wands does nothing at the top of the magazine', near(r.wandsTop, 1),
    String(r.wandsTop));
  ok('and +50% on the fifteenth round from the bottom', near(r.wandsEdge, 1.5),
    String(r.wandsEdge));
  ok('and all the way down', near(r.wandsBottom, 1.5), String(r.wandsBottom));

  ok('tightrope pays nothing on the floor', near(r.ropeFloor, 1), String(r.ropeFloor));
  ok('and +25% off it', near(r.ropeRaised, 1.25), String(r.ropeRaised));

  ok('running on fumes pays nothing on a full bar',
    near(r.fumesFullRate, 1) && near(r.fumesFullDmg, 1),
    `rate=${r.fumesFullRate} dmg=${r.fumesFullDmg}`);
  ok('and the red is the lockout’s own line', r.fumesLow);
  ok('and it doubles damage there', near(r.fumesLowDmg, 2), String(r.fumesLowDmg));
  ok('and lifts the rate by half', near(r.fumesLowRate, 1.5), String(r.fumesLowRate));

  // ---- the crit family ----
  ok('iron liturgy is not folded into the base chance', near(r.liturgyHip, 0.05),
    String(r.liturgyHip));
  ok('and the hip rolls at the base rate', Math.abs(r.liturgyHipRate - 0.05) < 0.012,
    String(r.liturgyHipRate));
  ok('and the sights roll at +25 points', Math.abs(r.liturgyAdsRate - 0.30) < 0.02,
    String(r.liturgyAdsRate));

  ok('pity party arms on the fifth landed shot',
    r.pityArmSteps.join(',') === 'false,false,false,false,true', r.pityArmSteps.join(','));
  ok('and the next roll is certain', r.pityOwed && r.pityCrit);
  ok('and the shot is marked as the owed one', r.pityShotFlag);
  ok('and it lands as a flat 5x', near(r.pityMult, 5), String(r.pityMult));
  ok('and the mark is cleared by the same trigger pull', r.pityShotCleared === false);
  ok('and a crit resets the drought', r.pityResetOnCrit === 0, String(r.pityResetOnCrit));
  ok('and a shot that touched nothing is not a drought', r.pityMissesIgnored);

  ok('red harvest heals about half of crits', Math.abs(r.harvestRate - 0.5) < 0.06,
    String(r.harvestRate));
  ok('and a non-crit never pays', r.harvestNonCrit);

  // ---- damage ----
  ok('fever dream pays nothing unpoisoned', near(r.feverClean, 1), String(r.feverClean));
  ok('and doubles damage while poisoned', near(r.feverPoisoned, 2), String(r.feverPoisoned));
  ok('and burning is not poisoned', near(r.feverBurning, 1), String(r.feverBurning));

  ok('long haul opens at nothing', near(r.haulOpen, 1), String(r.haulOpen));
  ok('and is +24% after a minute', near(r.haulMinute, 1.24), String(r.haulMinute));
  ok('and does not stop climbing', near(r.haulTwoMinutes, 1.48), String(r.haulTwoMinutes));
  ok('and pays nothing against anything that is not a boss', near(r.haulMook, 1),
    String(r.haulMook));

  ok('poison refreshes rather than stacking without the pick',
    r.stacksBare === 1 && r.stacksBareAfterThree === 1,
    `${r.stacksBare}/${r.stacksBareAfterThree}`);
  ok('secondary infection starts a fresh body at one', r.stackOne === 1, String(r.stackOne));
  ok('and stacks to three', r.stackThree === 3, String(r.stackThree));
  ok('and no further', r.stackCapped === 3, String(r.stackCapped));
  ok('and three stacks tick for three times one',
    r.poisonSingle > 0 && near(r.poisonTriple / r.poisonSingle, 3, 0.2),
    `single=${r.poisonSingle} triple=${r.poisonTriple}`);
  ok('and the stack dies with the timer', r.stackLapsed === 1, String(r.stackLapsed));

  ok('underfed takes a fifth off', near(r.underfedMult, 0.8), String(r.underfedMult));
  ok('and the body that spawns is that much thinner', near(r.underfedHp, 0.8, 0.01),
    String(r.underfedHp));

  // ---- staying alive ----
  ok('cold blood pays nothing on a full bar', near(r.coldFull, 1), String(r.coldFull));
  ok('and nothing just above the line', near(r.coldJustAbove, 1), String(r.coldJustAbove));
  ok('and takes 30% off below it', near(r.coldBelow, 0.7), String(r.coldBelow));

  ok('money belt pays nothing broke', near(r.beltBroke, 1), String(r.beltBroke));
  ok('and nothing under the first $500', near(r.beltUnderOne, 1), String(r.beltUnderOne));
  ok('and 1% per $500', near(r.beltFive, 0.95), String(r.beltFive));
  ok('and stops at 20%', near(r.beltCapped, 0.8), String(r.beltCapped));

  ok('fresh bandages is armed at 2 HP', r.bandage === 2, String(r.bandage));

  ok('a crate without slow release is instant',
    r.plainCrate === 26 && r.plainCrateOwes === 0,
    `${r.plainCrate}/${r.plainCrateOwes}`);
  // Twice a crate is 50, not 100: the crate is 25 and the card says 2x.
  ok('slow release owes twice the crate and pays none of it now',
    near(r.slowOwedOne, 50) && r.slowInstant === 1,
    `owed=${r.slowOwedOne} hp=${r.slowInstant}`);
  ok('and drips it over twenty seconds', near(r.slowRateOne, 2.5), String(r.slowRateOne));
  ok('a second crate stacks the pool', near(r.slowOwedTwo, 100), String(r.slowOwedTwo));
  ok('and stacks the RATE with it', near(r.slowRateTwo, 5), String(r.slowRateTwo));
  // THE POINT OF STACKING AS A POOL AND A RATE: two crates finish in the same
  // twenty seconds one does, at twice the speed - not in forty at one speed,
  // which is what a single shared clock would have given.
  ok('so two crates still finish in twenty seconds',
    near(r.slowHalfPaid, 50, 1), String(r.slowHalfPaid));
  ok('and the pool closes cleanly', r.slowDrained);

  ok('gristle banks about three crates in ten', Math.abs(r.gristleRate - 0.3) < 0.05,
    String(r.gristleRate));
  ok('and every point lands on the bar',
    r.gristleMax === r.gristleIsBank && r.gristleIsBank > 0,
    `max=${r.gristleMax} bank=${r.gristleIsBank}`);
  ok('and a draft pick does not hand it back', r.gristleSurvives);

  ok('stray mercy is a 5% roll', near(r.mercyChance, 0.05), String(r.mercyChance));
  ok('and pays 20 HP', r.mercyHealed === 20, String(r.mercyHealed));
  ok('and nothing was hit', r.mercyKeepsCarnage);

  ok('curtain call drops three crates on a full bar', r.curtainCrates === 3,
    String(r.curtainCrates));
  ok('and a run without it drops none', r.curtainBare === 0, String(r.curtainBare));

  // ---- money ----
  ok('high interest pays a fifth', r.interestOne === 200 && r.interestBalanceOne === 1200,
    `${r.interestOne}/${r.interestBalanceOne}`);
  ok('and it compounds', r.interestTwo === 240 && r.interestBalanceTwo === 1440,
    `${r.interestTwo}/${r.interestBalanceTwo}`);
  ok('and an empty wallet earns nothing', r.interestBroke === 0, String(r.interestBroke));
  ok('and a run without it earns nothing', r.interestBare === 0, String(r.interestBare));

  ok('paper trail pays nothing under $1,000',
    near(r.trailUnderOneK, 1) && near(r.trailJustUnder, 1),
    `${r.trailUnderOneK}/${r.trailJustUnder}`);
  ok('and +1% per $1,000 spent', near(r.trailTenK, 1.1), String(r.trailTenK));
  ok('and every till in the shop counts',
    r.trailCounted === 2000 && r.trailBilled === 2000,
    `counted=${r.trailCounted} billed=${r.trailBilled}`);
  ok('and a draft pick does not hand it back', r.trailSurvives);

  ok('a charge point is a charge point without the ticket', r.raffleBare === 10,
    String(r.raffleBare));
  ok('raffle ticket is +5% a box', near(r.raffleFour, 12), String(r.raffleFour));
  ok('and the count is the run’s, not the shop’s', r.raffleSurvives);

  ok('fire sale doubles an ammo crate', r.ammoSale === r.ammoPlain * 2,
    `${r.ammoPlain} -> ${r.ammoSale}`);
  ok('and cuts the fuse by 70%', near(r.saleDespawn, 0.3), String(r.saleDespawn));
  ok('and the orbs go with it', near(r.orbFuse, 6), String(r.orbFuse));

  ok('moving day pays 5 rounds an orb', r.orbsDown === 6 && r.movingGot === 30,
    `orbs=${r.orbsDown} ammo=${r.movingGot}`);
  ok('and leaves the orbs for the sweep to pay', r.movingKeptOrbs);
  ok('and stops at the reserve cap', r.movingCapped);

  // ---- movement ----
  ok('updraft is armed with a drain, a rise and a lift', r.floatArmed);
  ok('and one frame only slows a fall', r.floatAfterOne < 0 && r.floatAfterOne > -14,
    String(r.floatAfterOne));
  ok('and it turns the fall into a climb', r.floatSettled > 0, String(r.floatSettled));
  ok('and settles at the rise speed', near(r.floatSettled, 6, 0.01),
    String(r.floatSettled));
  ok('and it spends the bar', r.floatSpent > 0, String(r.floatSpent));
  ok('and it gains real height off the floor', r.floatClimbed > 4,
    String(r.floatClimbed));
  ok('and the lid stops it', r.floatHead <= r.ceilY + 1e-6,
    `head=${r.floatHead} ceil=${r.ceilY}`);
  ok('and it stops just under it rather than short of it',
    r.floatHead > r.ceilY - 0.01, `head=${r.floatHead} ceil=${r.ceilY}`);
  ok('and a locked bar does not climb', r.floatLocked < -10, String(r.floatLocked));
  ok('and it never caps a faster climb', r.floatRising > 7.5, String(r.floatRising));
  // The pick buys the high ground and not a home up there. The assertion is the
  // HEIGHT rather than the seconds: what must stay true is that one bar cannot
  // reach the roof, and that survives a change to either number.
  ok('and one bar cannot reach the lid', r.floatBarMetres < r.lidHeight,
    `bar=${r.floatBarMetres}m lid=${r.lidHeight.toFixed(2)}m (${r.floatBarSeconds}s)`);

  ok('jackpot is a 1% roll', near(r.jackpotChance, 0.01), String(r.jackpotChance));
  ok('and it fires about that often', Math.abs(r.jackpotRate - 0.01) < 0.006,
    String(r.jackpotRate));
  ok('and it pays the whole bar', r.jackpotHp, String(r.jackpotHp));
  ok('and the whole reserve', r.jackpotAmmo, String(r.jackpotAmmo));

  ok('scorched earth lays nothing when not sliding', r.fireNotSliding === 0,
    String(r.fireNotSliding));
  ok('and the first patch lands at the start of the slide', r.fireFirstPatch === 1,
    String(r.fireFirstPatch));
  ok('and a slide leaves a line of them', r.fireTrail > 3, String(r.fireTrail));
  ok('and each one carries a real burn', r.firePower > 0, String(r.firePower));

  ok('quorum stands up its turrets', r.quorumUp === 3, String(r.quorumUp));
  ok('and caps them', r.quorumCapped === 3, String(r.quorumCapped));
  ok('and they live ten seconds', near(r.quorumLife, 10), String(r.quorumLife));

  // ---- the pool ----
  ok('every new passive item is in the pool', r.missing.length === 0, r.missing.join(', '));
  ok('every one of them is a single tier', r.notSingleTier.length === 0,
    r.notSingleTier.join(', '));
  ok('no two offers in the game share a name', r.nameClashes.length === 0,
    r.nameClashes.join(', '));
  ok('no new passive item lands on a colour already in use', r.themeClashes.length === 0,
    r.themeClashes.join(', '));
  ok('a live loop with all twenty-seven owned survives',
    r.survived && r.aliveAfter && r.stateAfter === 'playing', r.stateAfter);

  ok('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(fails === 0 ? 'THIRD POOL TEST PASS' : `THIRD POOL TEST FAIL (${fails})`);
process.exit(fails === 0 ? 0 : 1);
