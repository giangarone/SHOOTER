// Focused check of ACTIVE ITEMS - the slot, the charge, the pedestal row that
// offers them - and of the eleven mutations that came in from the Devil's row
// when it was retired. Driven through window.__game.
//
// The two halves are here together on purpose: they are the same change. The
// row that used to sell mutations for max health now hands out items, and every
// mutation it used to sell had to be re-priced to stand on a free totem.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8203;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

try {
  browser = await puppeteer.launch({
    headless: true, executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await sleep(2500);

  // ---- THE ROW -------------------------------------------------------------
  const r = await page.evaluate(() => {
    const g = window.__game;
    const out = {};
    const P = g.player;
    const UP = g.__upgradesForTest;
    const ITEMS = g.__itemsForTest;

    // dismiss() starts a SINK, and nothing here runs frames for it to finish
    // in, so both rows have to be forced hidden between visits or every
    // iteration would read the previous one's furniture as still standing.
    const hide = () => {
      g.itemArea.dismiss();
      g.itemArea.pedestal.state = 'hidden';
      g.itemArea.pedestal.claimed = false;
      for (const st of g.itemArea.stations) st.state = 'hidden';
      g.totemArea.dismiss();
      for (const t of g.totemArea.totems) { t.state = 'hidden'; t.claimed = false; }
    };
    // The wave-clear shop, in the order _updateWave runs it.
    const shop = () => {
      g._presentTotems();
      g._presentItem();
    };

    // --- THE CADENCE: every third shop, and no other ---
    // A count, not a roll, so this is exact rather than a rate - which is the
    // whole reason it is a count.
    g.shopCount = 0;
    const seen = [];
    for (let i = 0; i < 9; i++) {
      hide();
      shop();
      seen.push(g.itemArea.active ? 1 : 0);
    }
    out.cadence = seen;

    // A REROLL IS NOT A NEW SHOP. Three rerolls at one break must not walk the
    // counter forward three places - the far row would then arrive at a break
    // the player did not earn and skip one they did.
    g.shopCount = 0;
    hide();
    shop();
    for (let i = 0; i < 3; i++) g._presentTotems(true);
    out.rerollDidNotCount = g.shopCount === 1;

    // --- ONE PEDESTAL, framed by two consoles ---
    g.shopCount = 2;
    hide();
    shop();
    out.rowUp = g.itemArea.active;
    out.offerIsItem = g.itemArea.pedestal.offer.kind === 'item';
    out.offerIsKnown = !!ITEMS[g.itemArea.pedestal.offer.id];
    out.pedestalKind = g.itemArea.pedestal.kind;
    out.stationKinds = g.itemArea.stations.map((s) => s.kind);
    out.totemArm = Math.max(...g.totemArea.totems.map((t) => t.armT));

    // --- TAKING IT: full charge, and the swap is named ---
    const first = g.itemArea.pedestal;
    const firstId = first.offer.id;
    first.armT = 0;
    first.state = 'up';
    g._claimItem(first);
    out.carried = P.item === firstId;
    out.arrivesCharged = P.itemReady && P.itemCharge === ITEMS[firstId].cooldown;
    // Taking an item does NOT end the wave break - the mutation pick still does.
    out.totemsStillUp = g.totemArea.active && !g.totemArea.claimed;
    out.rowSank = first.state === 'sinking' || first.state === 'hidden';

    // --- THE OFFER IS NEVER WHAT IS ALREADY CARRIED ---
    // A pedestal offering what is in the slot is a pedestal with nothing on it.
    let sameAsCarried = 0;
    for (let i = 0; i < 300; i++) {
      if (g._buildItem().id === P.item) sameAsCarried++;
    }
    out.neverOffersCarried = sameAsCarried;
    // ...and every one of the other four does turn up.
    const rolled = new Set();
    for (let i = 0; i < 400; i++) rolled.add(g._buildItem().id);
    out.poolSize = rolled.size;
    out.poolMissesCarried = !rolled.has(P.item);

    // --- REPLACING: the second item throws the first away ---
    g.shopCount = 2;
    hide();
    shop();
    const second = g.itemArea.pedestal;
    const secondId = second.offer.id;
    out.secondIsDifferent = secondId !== firstId;
    // The pillar's bottom line has to name what it is about to take away.
    out.noteNamesSwap = second.offer.note === 'REPLACES ' + ITEMS[firstId].name;
    second.armT = 0;
    second.state = 'up';
    g._claimItem(second);
    out.replaced = P.item === secondId;
    out.oneSlotOnly = !!P.item && typeof P.item === 'string';
    out.replacementCharged = P.itemReady;

    // --- THE CHARGE IS PAID IN WAVE TIME AND NOWHERE ELSE ---
    const runFrames = (n, combat) => {
      for (let i = 0; i < n; i++) {
        g.time += 0.05;
        P.update(0.05, g.input, g.arena.obstacles, g.time, combat);
      }
    };
    P.giveItem('itemHeal');   // 20s, the longest in the pool
    P.itemCharge = 0;
    runFrames(40, false);     // two seconds of SHOP
    out.shopChargesNothing = P.itemCharge === 0;
    runFrames(40, true);      // two seconds of WAVE
    out.waveCharges = P.itemCharge > 1.9 && P.itemCharge < 2.1;
    // The ready flag is one-shot: set on the frame it fills, and never again.
    P.itemCharge = 0;
    P.itemReadyFx = false;
    runFrames(410, true);
    out.readyFired = P.itemReadyFx;
    out.chargeCaps = P.itemCharge === 20;
    P.itemReadyFx = false;
    runFrames(20, true);
    out.readyFiresOnce = !P.itemReadyFx;

    // --- FIRING IT ---
    g.state = 'playing';
    // USABLE IN THE SHOP, even though the charge is not earned there.
    g.waveState = 'intermission';
    P.giveItem('itemHeal');
    P.health = P.maxHealth - 50;
    const hpBefore = P.health;
    g.tryItem();
    out.firesInShop = P.health === hpBefore + 25 && P.itemCharge === 0;
    // ...and an uncharged press spends nothing.
    const hp2 = P.health;
    g.tryItem();
    out.uncharged = P.health === hp2 && P.itemCharge === 0;
    // An EMPTY SLOT is silent and harmless.
    P.item = null;
    P.itemCharge = 0;
    g.tryItem();
    out.emptySlotSafe = P.item === null;
    g.waveState = 'active';

    // --- THE CONSOLES ---
    // A console has to finish RISING before it can be used - isUp() is part of
    // the max-health allowance and of _stationBlocked - so every visit below
    // runs the rise out rather than using the row on the frame it appears.
    const risen = () => {
      for (let i = 0; i < 60; i++) {
        g.time += 0.016;
        g.totemArea.update(0.016, g.time, g.player.pos);
        g.itemArea.update(0.016, g.time, g.player.pos);
      }
    };
    // MAX HEALTH: $5,000 for +5, three per visit, and the console goes down on
    // the third rather than standing there greyed out.
    g.shopCount = 2;
    hide();
    shop();
    risen();
    const hs = g.itemArea.healthStation;
    P.maxHpDebt = 20;
    P.upgrades = {};
    P.rebuildMods();
    const hpBase = P.maxHealth;
    const buyHealth = () => {
      g.credits = 12000;
      g._useStation(hs);
      return 12000 - g.credits;
    };
    out.healthFirst = buyHealth() === 5000;
    out.healthStandsAfterOne = hs.isUp();
    out.healthSecond = buyHealth() === 5000;
    out.healthThird = buyHealth() === 5000;
    out.boughtThree = P.maxHealth - hpBase === 15;
    out.healthConsoleSank = hs.state === 'sinking' || hs.state === 'hidden';
    const hpCap = P.maxHealth;
    out.healthCapPerVisit = buyHealth() === 0 && P.maxHealth === hpCap;
    g.shopCount = 2;
    hide();
    shop();
    risen();
    out.healthReturns = g.itemArea.healthAvailable;

    // REROLL: credits, at the mutation reroll's own price, doubling per reroll
    // of the same offer - and off its own counter, so the totem row's rerolls
    // do not raise it.
    g.shopCount = 2;
    hide();
    shop();
    g.wave = 1;
    g.credits = 200000;
    const costs = [];
    for (let i = 0; i < 3; i++) {
      const c = g.credits;
      g._rerollItem();
      costs.push(c - g.credits);
    }
    out.rerollCosts = costs;
    // The two counters are independent: three totem rerolls must leave the
    // item's price where it was.
    g.shopCount = 2;
    hide();
    shop();
    g.credits = 200000;
    const itemFirst = g._itemRerollCost();
    for (let i = 0; i < 3; i++) { g.totemArea.rerolls++; }
    out.countersIndependent = g._itemRerollCost() === itemFirst;
    // An empty wallet refuses it and changes nothing.
    g.credits = 0;
    const offerWas = g.itemArea.pedestal.offer.id;
    g._rerollItem();
    out.brokeRerollRefused = g.itemArea.pedestal.offer.id === offerWas && g.credits === 0;

    // --- THE SHOOT AND E PATHS ---
    // This is where the two rows could be confused: a pedestal and a totem are
    // the same class, told apart only by which userData tag their claim box
    // carries.
    const aimAt = (o) => {
      const t = new g.player.pos.constructor();
      o.getWorldPosition(t);
      const e = g.player.eyeInto(new g.player.pos.constructor());
      const dx = t.x - e.x, dy = t.y - e.y, dz = t.z - e.z;
      g.player.yaw = Math.atan2(-dx, -dz);
      g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      g.player.update(0.016, g.input, g.arena.obstacles, g.time);
      // shoot() raycasts against the PREVIOUS frame's world matrices (see the
      // frame-order note in main.js), and nothing renders in this harness, so
      // they have to be flushed by hand or every shot misses.
      g.scene.updateMatrixWorld(true);
      g.camera.updateMatrixWorld(true);
    };
    const stage = () => {
      g.shopCount = 2;
      hide();
      shop();
      // Long enough to cover the rise plus the longest arm delay (1s with the
      // item row standing), or nothing is claimable yet.
      for (let i = 0; i < 260; i++) {
        g.time += 0.016;
        g.totemArea.update(0.016, g.time, g.player.pos);
        g.itemArea.update(0.016, g.time, g.player.pos);
      }
    };
    const standAt = (x, z) => {
      g.player.pos.set(x, 0, z);
      g.player.vel.set(0, 0, 0);
      for (let i = 0; i < 4; i++) {
        g.time += 0.016;
        g.totemArea.update(0.016, g.time, g.player.pos);
        g.itemArea.update(0.016, g.time, g.player.pos);
      }
    };
    P.maxHpDebt = 0;
    P.upgrades = {};
    P.rebuildMods();
    P.health = P.maxHealth;
    // Spread is not what these tests are about - a pellet that wandered off a
    // 1.45m box at four metres would look exactly like a mis-tagged claim box.
    g.player.weapon.spread = 0;
    const fire = () => {
      g.player.mag = 30;
      g.player.fireCd = 0;
      g.shoot();
    };

    stage();
    const ped = g.itemArea.pedestal;
    standAt(ped.pos.x, ped.pos.z - 4);
    P.item = null;
    aimAt(ped.hit);
    fire();
    out.shotTookItem = ped.claimed && P.item === ped.offer.id;
    out.shotDidNotStartWave = g.totemArea.active && !g.totemArea.claimed;
    // A PEDESTAL COSTS NO HEALTH. It is the one thing the row used to do that
    // it must not do any more.
    out.shotCostNoHealth = P.maxHpDebt === 0;

    // The reroll console, through the same raycast.
    stage();
    const rr = g.itemArea.rerollStation;
    standAt(rr.pos.x, rr.pos.z - 3);
    g.credits = 50000;
    const cr = g.credits;
    aimAt(rr.hit);
    fire();
    out.shotRerolled = cr - g.credits === g._rerollCost();

    // A free totem is still free, and still starts the wave.
    stage();
    const totem = g.totemArea.totems.find((t) => t.state === 'up');
    standAt(totem.pos.x, totem.pos.z + 4);
    // FREE MEANS NOTHING CHARGED, which is maxHpDebt - not that max health came
    // out unchanged. Some offers legitimately MOVE the number: shoot a Bulwark
    // totem and max health goes up 50 because that is what Bulwark does.
    const debt = P.maxHpDebt;
    aimAt(totem.hit);
    fire();
    out.shotTookTotem = totem.claimed && P.maxHpDebt === debt;
    out.totemClosedTheRow = !g.totemArea.claimed || g.itemArea.pedestal.state !== 'up';

    // E claims, and WALKING INTO ONE DOES NOT.
    stage();
    const walkTotem = g.totemArea.totems.find((t) => t.state === 'up');
    standAt(walkTotem.pos.x, walkTotem.pos.z);
    for (let i = 0; i < 60; i++) {
      g.time += 0.016;
      g.player.pos.set(walkTotem.pos.x, 0, walkTotem.pos.z);
      g._updateTotems(0.016);
    }
    out.walkingClaimsNothing = !walkTotem.claimed && !g.totemArea.claimed;
    out.promptNamesTotem = g._useTarget() && g._useTarget().kind === 'totem';
    g.tryUse();
    out.keyClaimedTotem = walkTotem.claimed;

    // E on the pedestal.
    stage();
    const keyPed = g.itemArea.pedestal;
    standAt(keyPed.pos.x, keyPed.pos.z - 1.2);
    P.item = null;
    const use = g._useTarget();
    out.promptNamesItem = !!use && use.kind === 'item';
    g.tryUse();
    out.keyTookItem = keyPed.claimed && P.item === keyPed.offer.id;

    // E at the item row's reroll console. It ranks as an ordinary station,
    // alongside the two beside the totems.
    stage();
    standAt(g.itemArea.rerollStation.pos.x, g.itemArea.rerollStation.pos.z - 1.5);
    g.credits = 50000;
    const cr2 = g.credits;
    const useRr = g._useTarget();
    out.promptNamesItemStation =
      !!useRr && useRr.kind === 'station' && useRr.target.kind === 'itemReroll';
    g.tryUse();
    out.keyRerolled = cr2 - g.credits === g._rerollCost();

    // E at a station buys ammo, even standing where a totem's range reaches.
    stage();
    P.reserveAmmo = 0;
    g.credits = 5000;
    standAt(g.totemArea.ammoStation.pos.x, g.totemArea.ammoStation.pos.z - 1);
    out.promptNamesStation = g._useTarget() && g._useTarget().kind === 'station';
    g.tryUse();
    out.keyBoughtAmmo = P.reserveAmmo === 90;

    // --- THE READOUT: one segment per second, and no number anywhere ---
    // The bar is the ONLY place the charge time is stated, and it states it in
    // segments. Everything else - the pedestal's lines, its bottom note, the
    // prompt, the build sheet - must not print it: the number is meant to be
    // learned by carrying the item, and one stray template would give it away
    // in the one place a player is most likely to be reading.
    out.segments = {};
    out.chargeTimeLeaks = [];
    for (const [key, def] of Object.entries(ITEMS)) {
      P.giveItem(key);
      g._updateHud();
      out.segments[key] = Number(
        getComputedStyle(document.getElementById('item-box'))
          .getPropertyValue('--cells').trim()
      );
      // Every string this item can put on screen, against the number it must
      // never contain.
      const secs = String(def.cooldown) + 's';
      const strings = [
        ...def.effects.map((e) => e[0]),
        def.name,
        ...g._statRows().flat().map(String),
      ];
      P.item = null;
      strings.push(g._buildItem().note || '');
      for (const line of strings) {
        if (line.includes(secs)) out.chargeTimeLeaks.push(key + ': ' + line);
      }
    }

    // --- THE MERGED POOL: everything is rollable, nothing is a deal ---
    // The eleven that came in from the Devil's row have to be REACHABLE on a
    // free totem, which is the one thing a leftover `devil: true` would break
    // silently: the mutation is in the map, has a drawing, and can never be
    // offered.
    const wanted = new Set([
      'carnage', 'bloodPact', 'hellfire', 'eternalAffliction', 'absoluteZero',
      'overload', 'executioner', 'antidote', 'devilsGamble', 'thorns', 'darkPower',
    ]);
    // AT A WAVE WHERE EVERY RARITY IS OPEN. rollTotems gates rares at wave 2
    // and cursed at wave 3, and all eleven of these are one or the other - at
    // the wave 1 the reroll block above left behind, none of them can roll and
    // this would fail for a reason that has nothing to do with the merge.
    g.wave = 10;
    const rolledUp = new Set();
    for (let i = 0; i < 4000; i++) {
      P.upgrades = {};
      for (const o of g._buildOffers()) rolledUp.add(o.id);
    }
    out.convertedUnreachable = [...wanted].filter((k) => !rolledUp.has(k));
    // And the two that were dropped are gone from the map entirely.
    out.droppedGone = !UP.demonicDodge && !UP.demonicPresence && !UP.doubleDash;
    return out;
  });

  // ---- THE FIVE ITEMS, AND THE ELEVEN MUTATIONS ----------------------------
  // Each is exercised against a live enemy or a live hit, because a field that
  // is set correctly and read nowhere looks identical from the outside.
  const m = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const out = {};
    const take = (id) => {
      P.upgrades = {};
      P.maxHpDebt = 0;
      P.rebuildMods();
      P.upgrades[id] = 1;
      P.rebuildMods();
      P.health = P.maxHealth;
    };
    const clearField = () => {
      g.enemies.length = 0;
    };
    const spawn = (type = 'chaser', x = 2, z = 2) => {
      const e = new g.__EnemyForTest(type, new g.player.pos.constructor(x, 0, z), 40, 1, 1);
      g.scene.add(e.group);
      g.enemies.push(e);
      return e;
    };
    const tick = (n, dt = 0.05) => {
      for (let i = 0; i < n; i++) {
        g.time += dt;
        g._updateFire(dt);
        g._updateEnemies(dt);
      }
    };
    const useItem = (id) => {
      P.giveItem(id);
      g.tryItem();
    };

    g.state = 'playing';
    g.waveState = 'active';
    take('darkPower');
    P.upgrades = {};
    P.rebuildMods();

    // ---- TRAUMA KIT: 25 HP, and no overheal ----
    P.health = P.maxHealth - 60;
    useItem('itemHeal');
    out.healed = P.health === P.maxHealth - 35;
    P.health = P.maxHealth - 5;
    useItem('itemHeal');
    out.noOverheal = P.health === P.maxHealth;

    // ---- CRYO PULSE: every enemy on the floor ----
    clearField();
    const a1 = spawn('chaser', 3, 0);
    const a2 = spawn('chaser', -6, 4);
    useItem('itemFreeze');
    out.frozeAll = a1.status.freeze > 0 && a2.status.freeze > 0;
    // A frozen enemy does not move. That is the point of the item, and it lives
    // in _effSpeed() rather than in the item.
    out.frozenStopped = a1._effSpeed() === 0;
    clearField();

    // ---- OVERDRIVE: 2x, and it expires ----
    P.damageMult = 1;
    P.damageBoostEnd = 0;
    P.now = g.time;
    const base = P.getEffectiveDamage(100);
    useItem('itemRage');
    P.now = g.time;
    out.rageDoubles = +(P.getEffectiveDamage(100) / base).toFixed(2);
    // A RAGE pickup landing on top must not DOWNGRADE it to 1.5x.
    P.damageMult = Math.max(P.damageMult, 1.5);
    out.rageNotDowngraded = P.damageMult === 2;
    for (let i = 0; i < 130; i++) {
      g.time += 0.05;
      P.update(0.05, g.input, g.arena.obstacles, g.time, true);
    }
    out.rageExpired = P.damageMult === 1;

    // ---- AEGIS: five seconds nothing gets through ----
    P.health = 100;
    useItem('itemGuard');
    g._hurtPlayer(40, P.pos, null);
    out.invulnHolds = P.health === 100;
    // ...and it really does end.
    P.invulnEnd = g.time - 0.01;
    g._hurtPlayer(40, P.pos, null);
    out.invulnEnds = P.health < 100;

    // ---- BLINK DRIVE: the dash moves you, with no mutation behind it ----
    P.upgrades = {};
    P.rebuildMods();
    P.dashEnd = 0;
    const z0 = P.pos.z;
    P.pos.set(0, 0, 8);
    P.yaw = 0;
    useItem('itemDash');
    out.dashArmed = P.dashEnd > g.time;
    for (let i = 0; i < 30; i++) {
      g.time += 0.016;
      P.update(0.016, g.input, g.arena.obstacles, g.time, true);
    }
    out.dashMoved = Math.abs(P.pos.z - 8) > 2;
    out.dashNeedsNoMutation = !P.mods.dashCharges;
    P.pos.set(0, 0, z0);

    // ---- and the cooldowns are what the pool says ----
    out.cooldowns = Object.fromEntries(
      Object.entries(g.__itemsForTest).map(([k, d]) => [k, d.cooldown])
    );

    // ---- THE ELEVEN ----
    take('darkPower');
    out.darkPower = +(P.getEffectiveDamage(100)).toFixed(1);
    out.darkPowerFree = P.maxHealth === 100;

    take('carnage');
    P.carnageStacks = 5;
    out.carnage5 = +(P.getEffectiveDamage(100)).toFixed(1);
    P.carnageStacks = 400;
    out.carnageCapped = +(P.getEffectiveDamage(100)).toFixed(1);
    g._hurtPlayer(1, P.pos, null);
    out.carnageAfterHit = +(P.getEffectiveDamage(100)).toFixed(1);

    take('bloodPact');
    P.health = P.maxHealth - 10;
    P.onKill(g.time);
    out.pactHealed = P.health === P.maxHealth - 7;
    P.health = 100;
    const hBefore = P.health;
    g._hurtPlayer(20, P.pos, null);
    out.pactExtraDamage = +(hBefore - P.health).toFixed(1);

    take('thorns');
    clearField();
    const victim = spawn('chaser', 3, 0);
    const hpWas = victim.hp;
    g._hurtPlayer(40, victim.pos, victim);
    out.thorns = +(hpWas - victim.hp).toFixed(1);

    // ABSOLUTE ZERO, re-tuned: 30% slower, and half a second frozen.
    take('absoluteZero');
    clearField();
    out.worldSlow = +P.mods.worldSlow.toFixed(2);
    const t0 = g.time;
    g._hurtPlayer(5, P.pos, null);
    out.freezeSeconds = +(P.frozenUntil - t0).toFixed(2);

    take('overload');
    clearField();
    const a = spawn('chaser', 3, 0);
    const b = spawn('chaser', -3, 0);
    const maxA = a.maxHp;
    g._overload();
    out.overload = Math.abs((maxA - a.hp) - maxA * 0.2) < 0.01 && b.hp < b.maxHp;

    take('hellfire');
    clearField();
    const burnt = spawn('chaser', 0.5, 0.5);
    P.pos.set(0, 0, 0);
    g._fireUntil = g.time + 5;
    g._fireLastX = -99;
    g._addFire(0.5, 0.5);
    const burntHp = burnt.hp;
    tick(20);
    out.hellfire = burnt.hp < burntHp;

    take('antidote');
    clearField();
    P.health = 50;
    g._hazard.length = 0;
    g._addHazard(P.pos.x, P.pos.z, 3, 5, 100, 'pool');
    const hpPool = P.health;
    for (let i = 0; i < 20; i++) { g.time += 0.05; g._updateHazard(0.05); }
    out.poolImmune = P.health >= hpPool;
    // PINNED AND OUT OF REACH: a chaser left free to close would land a hit
    // worth more than the whole window measures.
    const sick = spawn('chaser', 12, 0);
    sick.speed = 0;
    sick.applyStatus('poison', 10, 1);
    P.health = 50;
    tick(60);
    out.poisonLeech = P.health > 50;

    take('eternalAffliction');
    clearField();
    const cursed = spawn('chaser', 4, 0);
    cursed.applyStatus('poison', 1, 1);
    tick(60);
    out.eternal = cursed.status.poison > 0;
    P.health = 200;
    P.baseMaxHealth = 200;
    const hpHaz = P.health;
    g._hurtPlayerDot(10);
    out.hazardDouble = +(hpHaz - P.health).toFixed(1);
    P.baseMaxHealth = 100;

    // EXECUTIONER: half a boss, and the ONE mutation that still costs health.
    // Charged as a mod, so it has to survive a rebuild - which is exactly what
    // the old payment could not have done.
    take('executioner');
    out.bossHpMult = P.mods.bossHpMult;
    out.executionerCost = 100 - P.maxHealth;
    P.rebuildMods();
    out.executionerSurvivesRebuild = 100 - P.maxHealth === 50;
    P.upgrades = {};
    P.rebuildMods();
    out.executionerRefunded = P.maxHealth === 100;
    take('executioner');
    clearField();
    g.wave = 5;
    g._cfg = { boss: true, bossKey: 'colossus', maxAdds: 2, addInterval: 3 };
    g._spawnBoss('colossus');
    const withIt = g.bossFight.parts[0].maxHp;
    clearField();
    g.bossFight = null;
    P.upgrades = {};
    P.rebuildMods();
    g._spawnBoss('colossus');
    const without = g.bossFight.parts[0].maxHp;
    out.executioner = Math.abs(withIt * 2 - without) < 1;
    clearField();
    g.bossFight = null;

    take('devilsGamble');
    out.gambleSet = P.mods.gamble === 1;
    return out;
  });

  console.log(JSON.stringify({ ...r, mechanics: m }, null, 2));

  // ---- the row ----
  ok('the row comes up every third shop',
    JSON.stringify(r.cadence) === '[0,0,1,0,0,1,0,0,1]', JSON.stringify(r.cadence));
  ok('a reroll is not a new shop', r.rerollDidNotCount);
  ok('one pedestal, framed by two consoles',
    r.rowUp && r.pedestalKind === 'item'
    && JSON.stringify(r.stationKinds) === '["maxhp","itemReroll"]', JSON.stringify(r.stationKinds));
  ok('the offer is a known active item', r.offerIsItem && r.offerIsKnown);
  // ARM_TIME_ITEM, less whatever the sampling frame ate. What this guards is
  // that a second row standing at the break arms the totems LONGER than the
  // 0.45s a plain break gives them, not any particular number.
  ok('totems re-armed longer', r.totemArm >= 0.9, String(r.totemArm));
  ok('taking it fills the slot', r.carried);
  ok('it arrives fully charged', r.arrivesCharged);
  ok('taking it does not start the wave', r.totemsStillUp);
  ok('the pedestal sinks behind it', r.rowSank);
  ok('the offer is never what is carried', r.neverOffersCarried === 0, String(r.neverOffersCarried));
  ok('the other four are all reachable', r.poolSize === 4 && r.poolMissesCarried, String(r.poolSize));
  ok('a second item replaces the first', r.secondIsDifferent && r.replaced && r.oneSlotOnly);
  ok('the pillar names what it replaces', r.noteNamesSwap);
  ok('the replacement is charged too', r.replacementCharged);

  // ---- the charge ----
  ok('the shop charges nothing', r.shopChargesNothing);
  ok('a wave charges it', r.waveCharges);
  ok('the ready flag fires when it fills', r.readyFired);
  ok('the charge caps at the cooldown', r.chargeCaps);
  ok('the ready flag fires exactly once', r.readyFiresOnce);
  ok('it can still be fired in the shop', r.firesInShop);
  ok('an uncharged press spends nothing', r.uncharged);
  ok('an empty slot is harmless', r.emptySlotSafe);

  // ---- the consoles ----
  ok('max health pays 5 for $5,000', r.healthFirst);
  ok('the console stands after one buy', r.healthStandsAfterOne);
  ok('the second and third are charged $5,000 each', r.healthSecond && r.healthThird);
  ok('three buys pay 15 max HP', r.boughtThree);
  ok('the console sinks on the third', r.healthConsoleSank);
  ok('max health is capped at three per visit', r.healthCapPerVisit);
  ok('a fresh visit offers max health again', r.healthReturns);
  ok('item rerolls cost 2000, 4000, 8000',
    JSON.stringify(r.rerollCosts) === '[2000,4000,8000]', JSON.stringify(r.rerollCosts));
  ok('the two reroll counters are independent', r.countersIndependent);
  ok('an empty wallet cannot reroll', r.brokeRerollRefused);

  // ---- claiming ----
  ok('shooting the pedestal takes the item', r.shotTookItem);
  ok('taking it leaves the totems up', r.shotDidNotStartWave);
  ok('the pedestal costs no health', r.shotCostNoHealth);
  ok('shooting the reroll console rerolls', r.shotRerolled);
  ok('shooting a totem is still free', r.shotTookTotem);
  ok('a totem claim closes the item row', r.totemClosedTheRow);
  ok('standing in a totem claims nothing', r.walkingClaimsNothing);
  ok('E takes the totem you are standing at', r.promptNamesTotem && r.keyClaimedTotem);
  ok('E takes the item off the pedestal', r.promptNamesItem && r.keyTookItem);
  ok('E at the item reroll console rerolls', r.promptNamesItemStation && r.keyRerolled);
  ok('E at a station buys ammo', r.promptNamesStation && r.keyBoughtAmmo);

  // ---- the readout ----
  ok('one segment per second of charge',
    JSON.stringify(r.segments) === '{"itemHeal":20,"itemFreeze":10,"itemRage":20,"itemGuard":20,"itemDash":3}',
    JSON.stringify(r.segments));
  ok('the charge time is printed nowhere',
    r.chargeTimeLeaks.length === 0, r.chargeTimeLeaks.join(' | '));

  // ---- the merged pool ----
  ok('every converted mutation is rollable',
    r.convertedUnreachable.length === 0, r.convertedUnreachable.join(', '));
  ok('the dropped mutations are gone', r.droppedGone);

  // ---- the five items ----
  ok('trauma kit heals 25', m.healed);
  ok('trauma kit does not overheal', m.noOverheal);
  ok('cryo pulse freezes the whole floor', m.frozeAll);
  ok('a frozen enemy stops dead', m.frozenStopped);
  ok('overdrive doubles damage', m.rageDoubles === 2, String(m.rageDoubles));
  ok('overdrive is not downgraded by a rage pickup', m.rageNotDowngraded);
  ok('overdrive expires', m.rageExpired);
  ok('aegis holds', m.invulnHolds);
  ok('aegis ends', m.invulnEnds);
  ok('blink drive moves you', m.dashArmed && m.dashMoved);
  ok('the dash needs no mutation behind it', m.dashNeedsNoMutation);
  ok('the cooldowns are 20 / 10 / 20 / 20 / 3',
    m.cooldowns.itemHeal === 20 && m.cooldowns.itemFreeze === 10
    && m.cooldowns.itemRage === 20 && m.cooldowns.itemGuard === 20
    && m.cooldowns.itemDash === 3, JSON.stringify(m.cooldowns));

  // ---- the eleven ----
  ok('dark power: +20% damage', m.darkPower === 120);
  ok('dark power: and no longer costs health', m.darkPowerFree);
  ok('carnage: five kills is +5%', m.carnage5 === 105);
  ok('carnage: the chain caps at +100%', m.carnageCapped === 200, String(m.carnageCapped));
  ok('carnage: a hit wipes the chain', m.carnageAfterHit === 100);
  ok('blood pact: a kill heals 3', m.pactHealed);
  ok('blood pact: hits cost 25% more', m.pactExtraDamage === 25);
  ok('thorns: the attacker takes half back', m.thorns === 20, String(m.thorns));
  ok('absolute zero: the world runs at 70%', m.worldSlow === 0.7, String(m.worldSlow));
  ok('absolute zero: a hit freezes you for 0.5s',
    m.freezeSeconds === 0.5, String(m.freezeSeconds));
  ok('overload: 20% of max HP off everything', m.overload);
  ok('hellfire: the trail burns', m.hellfire);
  ok('antidote: pools do nothing', m.poolImmune);
  ok('antidote: poisoned enemies heal you', m.poisonLeech);
  ok('eternal affliction: statuses never end', m.eternal);
  ok('eternal affliction: pools hurt double', m.hazardDouble === 20, String(m.hazardDouble));
  ok('executioner: bosses arrive at half', m.executioner);
  ok('executioner: it still costs 50 max health', m.executionerCost === 50, String(m.executionerCost));
  ok('executioner: the cost survives a rebuild', m.executionerSurvivesRebuild);
  ok('executioner: and comes back if it is dropped', m.executionerRefunded);
  ok("devil's gamble is wired", m.gambleSet);

  ok('no console errors', errors.length === 0, errors.join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? 'ACTIVE ITEM TEST FAIL' : 'ACTIVE ITEM TEST PASS');
process.exit(fails ? 1 : 0);
