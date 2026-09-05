// Focused check of ACTIVE ITEMS - the slot, the charge, and the MYSTERY BOX
// that hands them out - and of the eleven passive items that came in from the
// max-health row when it was retired. Driven through window.__game.
//
// The two halves are here together on purpose: they are the same change. The
// row that used to sell passive items for max health became a pedestal that
// gave items away, and then a box that sells them; every passive item it used
// to sell had to be re-priced to stand on a free totem.
//
// WHAT THE BOX HALF IS ACTUALLY GUARDING, since a lot of it looks like a state
// machine being poked: that a roll is charged EXACTLY ONCE and always the same
// amount however many are bought, that the reel MOVES rather than showing one
// item for four seconds, that the item the player is carrying cannot appear on
// it, and that the shot path and the E path are the same funnel.
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

  // ---- THE MYSTERY BOX -----------------------------------------------------
  const r = await page.evaluate(() => {
    const g = window.__game;
    const out = {};
    const P = g.player;
    const UP = g.__upgradesForTest;
    const ITEMS = g.__itemsForTest;

    // dismiss() starts a SINK, and nothing here runs frames for it to finish
    // in, so the furniture has to be forced hidden between visits or every
    // iteration would read the previous one's as still standing.
    const hide = () => {
      g.mysteryBox.dismiss();
      g.mysteryBox.riseState = 'hidden';
      g.mysteryBox.state = 'idle';
      g.mysteryBox.group.visible = false;
      g.totemArea.dismiss();
      for (const t of g.totemArea.totems) { t.state = 'hidden'; t.claimed = false; }
    };
    // The wave-clear shop, in the order _updateWave runs it.
    const shop = () => {
      g._presentTotems();
      g._presentBox();
    };
    // Runs the box's rise out. canBuy is gated on riseState, so nothing below
    // may use the box on the frame it appears.
    const risen = () => {
      for (let i = 0; i < 60; i++) {
        g.time += 0.016;
        g.totemArea.update(0.016, g.time, P.pos);
        g.mysteryBox.update(0.016, g.time, P.pos);
      }
    };
    // Drives a bought roll through the lid and the whole reel, stopping the
    // frame an item is actually on offer. Bounded, so a box that never lands
    // fails the assertion rather than hanging the harness.
    const spin = () => {
      for (let i = 0; i < 500 && !g.mysteryBox.offered; i++) {
        g.time += 0.016;
        g.mysteryBox.update(0.016, g.time, P.pos);
      }
      return g.mysteryBox.offered;
    };

    // --- IT IS THERE EVERY SHOP ---
    // The row this replaced came up on a count of shops. Nine shops, nine
    // boxes: the schedule is gone, not shortened.
    const seen = [];
    for (let i = 0; i < 9; i++) {
      hide();
      shop();
      seen.push(g.mysteryBox.active ? 1 : 0);
    }
    out.everyShop = seen;
    // A REROLL OF THE TOTEMS IS NOT A NEW BOX EITHER. It re-presents the near
    // row and must leave the far one exactly as it was - mid-spin included.
    hide();
    shop();
    risen();
    g.credits = 100000;
    g._buyBoxRoll();
    const spinningWas = g.mysteryBox.state;
    g._presentTotems(true);
    out.totemRerollLeftTheBox = g.mysteryBox.state === spinningWas;

    // --- THE BOX ITSELF ---
    hide();
    shop();
    // READ BEFORE THE RISE IS RUN OUT. armT counts down once the totem lands,
    // so a sample taken after risen() is measuring how long the harness spent
    // stepping rather than what the totems were armed FOR.
    out.totemArm = Math.max(...g.totemArea.totems.map((t) => t.armT));
    risen();
    out.boxUp = g.mysteryBox.active && g.mysteryBox.riseState === 'up';
    out.boxStartsShut = g.mysteryBox.state === 'idle' && g.mysteryBox.lid === 0;
    out.boxStartsBuyable = g.mysteryBox.canBuy;
    out.boxOffersNothingShut = g.mysteryBox.offered === null;
    // THE FAR ROW HAS NO CONSOLES ANY MORE. The box is the offer and the till.
    out.noStationInRange = typeof g.mysteryBox.stationInRange !== 'function';

    // --- PAYING FOR A ROLL ---
    g.wave = 1;
    g.credits = 100000;
    g.totemArea.boxRolls = 0;
    const before = g.credits;
    // READ BEFORE THE PURCHASE. Buying steps the box's own counter, so asking
    // _boxCost() afterwards is asking what the NEXT roll costs.
    const quoted = g._boxCost();
    g._buyBoxRoll();
    out.rollCharged = before - g.credits;
    out.rollCostIsBoxCost = out.rollCharged === quoted;
    out.opensOnPurchase = g.mysteryBox.state === 'opening';
    // A SECOND PRESS MID-SPIN BUYS NOTHING. The box sells one thing at a time.
    const midSpin = g.credits;
    g._buyBoxRoll();
    out.noDoubleBuy = g.credits === midSpin && g.mysteryBox.state !== 'idle';

    // --- THE REEL ---
    // It must MOVE - a reel that showed one item for four seconds and then
    // called it a reveal would pass every other check in this file.
    const shown = new Set();
    let ticks = 0;
    for (let i = 0; i < 500 && !g.mysteryBox.offered; i++) {
      g.time += 0.016;
      g.mysteryBox.update(0.016, g.time, P.pos);
      if (g.mysteryBox.event === 'tick') ticks++;
      if (g.mysteryBox.showing) shown.add(g.mysteryBox.showing);
    }
    out.reelTicks = ticks;
    out.reelShowedMany = shown.size;
    out.reelIsAllRealItems = [...shown].every((k) => !!ITEMS[k]);
    out.landed = g.mysteryBox.offered;
    out.landedIsReal = !!ITEMS[out.landed];
    out.landedIsOnTheReel = g.mysteryBox.reel.includes(out.landed);
    out.stateIsRevealed = g.mysteryBox.state === 'revealed';

    // --- TAKING IT: full charge, and the box stays ---
    const firstId = out.landed;
    P.item = null;
    g._grabBox();
    out.carried = P.item === firstId;
    out.arrivesCharged = P.itemReady && P.itemCharge === ITEMS[firstId].charge;
    // Taking it does NOT end the wave break - the passive item pick still
    // does.
    out.totemsStillUp = g.totemArea.active && !g.totemArea.claimed;
    // ...and unlike the pedestal it replaced, the BOX DOES NOT GO AWAY. It is
    // never spent; it shuts and can be paid again.
    out.boxStandsAfterTake = g.mysteryBox.active;
    out.boxShutsAfterTake = g.mysteryBox.state === 'closing';
    out.nothingOfferedAfterTake = g.mysteryBox.offered === null;
    for (let i = 0; i < 40; i++) { g.time += 0.016; g.mysteryBox.update(0.016, g.time, P.pos); }
    out.buyableAgainAfterTake = g.mysteryBox.canBuy;

    // --- THE PRICE DOES NOT CLIMB ---
    // The whole point of the box over the reroll it is priced like. Five rolls
    // in one visit, every one the same money.
    g.wave = 1;
    g.credits = 100000;
    g.totemArea.boxRolls = 0;
    const costs = [];
    for (let n = 0; n < 5; n++) {
      const c = g.credits;
      g._buyBoxRoll();
      costs.push(c - g.credits);
      // Run it out and let the item sink back, so the next roll starts clean.
      for (let i = 0; i < 1200 && !g.mysteryBox.canBuy; i++) {
        g.time += 0.05;
        g.mysteryBox.update(0.05, g.time, P.pos);
      }
    }
    out.fiveRollsOneVisit = costs;
    // ...and it DOES climb with the wave, on the block boundary every other
    // price in the game steps on.
    g.totemArea.boxRolls = 0;
    g.wave = 1; const w1 = g._boxCost();
    g.wave = 5; const w5 = g._boxCost();
    g.wave = 6; const w6 = g._boxCost();
    g.wave = 11; const w11 = g._boxCost();
    out.waveLadder = [w1, w5, w6, w11];
    g.wave = 1;

    hide();
    shop();
    risen();

    // --- AN EMPTY WALLET ROLLS NOTHING ---
    g.credits = 0;
    g._buyBoxRoll();
    out.brokeRefused = g.mysteryBox.state === 'idle' && g.credits === 0;
    out.brokeStillBuyable = g.mysteryBox.canBuy;

    // --- THE TEN SECONDS ---
    // An item nobody takes goes back in, and the box sells another.
    g.credits = 100000;
    g._buyBoxRoll();
    const stranded = spin();
    out.strandedLanded = !!stranded;
    P.item = null;
    // Ten seconds and a bit, at a coarse step - the descent is continuous and
    // nothing here depends on the frame rate.
    for (let i = 0; i < 260; i++) { g.time += 0.05; g.mysteryBox.update(0.05, g.time, P.pos); }
    out.strandedGone = g.mysteryBox.offered === null;
    out.strandedNotGranted = P.item === null;
    out.buyableAfterStranding = g.mysteryBox.canBuy;
    // ...and a grab one frame before the deadline still works, so the window is
    // the ten seconds it says it is rather than nine and a bit.
    g._buyBoxRoll();
    spin();
    for (let i = 0; i < 190; i++) { g.time += 0.05; g.mysteryBox.update(0.05, g.time, P.pos); }
    out.stillOfferedLate = !!g.mysteryBox.offered;
    const lateId = g.mysteryBox.offered;
    g._grabBox();
    out.lateGrabWorks = P.item === lateId;

    // --- THE POOL NEVER CONTAINS WHAT IS CARRIED ---
    // Not merely "never wins": the carried item must not even flash past on the
    // reel, or the player watches the box offer them what they already have.
    let carriedOnReel = 0;
    let poolWrongSize = 0;
    const everRolled = new Set();
    for (let i = 0; i < 400; i++) {
      const pool = g.__poolForTest(P.item);
      if (pool.includes(P.item)) carriedOnReel++;
      if (pool.length !== Object.keys(ITEMS).length - 1) poolWrongSize++;
      for (const k of pool) everRolled.add(k);
    }
    out.carriedNeverOnReel = carriedOnReel;
    out.poolAlwaysFull = poolWrongSize;
    out.poolSize = everRolled.size;
    out.poolTotal = Object.keys(ITEMS).length;
    out.poolMissesCarried = !everRolled.has(P.item);
    // An EMPTY slot excludes nothing - the whole catalogue is on the reel.
    out.emptySlotPool = g.__poolForTest(null).length;

    // --- REPLACING: the second item throws the first away ---
    hide();
    shop();
    risen();
    g.credits = 100000;
    g._buyBoxRoll();
    const secondId = spin();
    out.secondIsDifferent = secondId !== P.item;
    g._grabBox();
    out.replaced = P.item === secondId;
    out.oneSlotOnly = !!P.item && typeof P.item === 'string';
    out.replacementCharged = P.itemReady;

    // --- THE CHARGE IS PAID IN WAVE PROGRESS AND NOWHERE ELSE ---
    // TIME BUYS NOTHING NOW, in the shop OR in the fight. That second half is
    // the point of the whole system: an item that filled on the clock paid the
    // player for taking longer over a wave, so standing off the last enemy was
    // the cheapest refill in the game.
    const runFrames = (n, combat) => {
      for (let i = 0; i < n; i++) {
        g.time += 0.05;
        P.update(0.05, g.input, g.arena.obstacles, g.time, combat);
      }
    };
    // THE COST IS READ FROM THE POOL, never written down here. Charge costs
    // are tuned, and a copy in this file would only ever be a copy of what
    // they were the day it was written: the next tuning pass would fail three
    // assertions with nothing actually broken. Everything below is stated as a
    // distance from `cost` so it follows items.js wherever it goes.
    const cost = ITEMS.itemHeal.charge;
    P.giveItem('itemHeal');
    P.itemCharge = 0;
    runFrames(40, false);     // two seconds of SHOP
    out.shopChargesNothing = P.itemCharge === 0;
    runFrames(400, true);     // twenty seconds of WAVE
    out.timeChargesNothing = P.itemCharge === 0;
    // Points are the only thing that moves it.
    P.addItemCharge(2);
    out.pointsCharge = P.itemCharge === 2;
    // The ready flag is one-shot: set on the call it fills, and never again.
    // Half a point short of the cost, then a push that clears it outright.
    P.itemCharge = 0;
    P.itemReadyFx = false;
    P.addItemCharge(cost - 0.5);
    out.notReadyEarly = !P.itemReadyFx && !P.itemReady;
    P.addItemCharge(5);
    out.readyFired = P.itemReadyFx;
    // The overflow is dropped rather than banked - see addItemCharge.
    out.chargeCaps = P.itemCharge === cost;
    P.itemReadyFx = false;
    P.addItemCharge(5);
    out.readyFiresOnce = !P.itemReadyFx;
    // An empty slot swallows charge instead of saving it for the next item.
    P.item = null;
    P.itemCharge = 0;
    P.addItemCharge(10);
    out.noSlotNoCharge = P.itemCharge === 0;

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

    // --- THE SHOOT AND E PATHS ---
    // This is where the two rows could be confused: the box and a totem hang
    // the same kind of invisible claim volume, told apart only by which
    // userData tag it carries.
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
      hide();
      shop();
      // Long enough to cover the rise plus the arm delay (ARM_TIME_ITEM, which
      // every totem now gets), or nothing is claimable yet.
      for (let i = 0; i < 260; i++) {
        g.time += 0.016;
        g.totemArea.update(0.016, g.time, g.player.pos);
        g.mysteryBox.update(0.016, g.time, g.player.pos);
      }
    };
    const standAt = (x, z) => {
      g.player.pos.set(x, 0, z);
      g.player.vel.set(0, 0, 0);
      for (let i = 0; i < 4; i++) {
        g.time += 0.016;
        g.totemArea.update(0.016, g.time, g.player.pos);
        g.mysteryBox.update(0.016, g.time, g.player.pos);
      }
    };
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

    // SHOOTING THE BOX BUYS A ROLL, and one roll however many pellets land.
    // A shotgun puts eight in the same box in one frame, and the cooldown that
    // stops that is the whole reason _useBox has a shot path distinct from the
    // key path.
    stage();
    const box = g.mysteryBox;
    standAt(box.pos.x, box.pos.z - 4);
    P.item = null;
    g.credits = 100000;
    const cb = g.credits;
    const shotQuote = g._boxCost();
    aimAt(box.hit);
    fire();
    out.shotBoughtRoll = cb - g.credits === shotQuote;
    out.shotOpenedBox = box.state !== 'idle';
    // A second shot in the cooldown window buys nothing.
    const cb2 = g.credits;
    fire();
    out.shotDidNotDoubleBuy = g.credits === cb2;
    out.shotDidNotStartWave = g.totemArea.active && !g.totemArea.claimed;

    // ...and shooting it again once it is HOLDING something takes that thing,
    // rather than buying a second roll on top of the first.
    for (let i = 0; i < 500 && !box.offered; i++) {
      g.time += 0.016;
      box.update(0.016, g.time, g.player.pos);
    }
    const heldId = box.offered;
    box.shootCd = 0;
    const cb3 = g.credits;
    aimAt(box.hit);
    fire();
    out.shotTookItem = P.item === heldId;
    out.shotTakeWasFree = g.credits === cb3;

    // A free totem is still free, and still starts the wave.
    stage();
    const totem = g.totemArea.totems.find((t) => t.state === 'up');
    standAt(totem.pos.x, totem.pos.z + 4);
    // FREE MEANS NOTHING CHARGED. Some offers legitimately MOVE max health:
    // shoot a Bulwark totem and it goes up 50 because that is what Bulwark
    // does - so this reads the wallet, which a totem must never touch.
    const purse = g.credits;
    aimAt(totem.hit);
    fire();
    out.shotTookTotem = totem.claimed && g.credits === purse;
    // The totem claim starts the next wave, so the box packs up with it - a
    // roll left spinning is forfeited, the same rule an unclaimed set follows.
    out.totemClosedTheBox = !g.totemArea.claimed || !g.mysteryBox.canBuy;

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

    // E ON THE BOX. The same one funnel as the pellet, so the key and the shot
    // can never disagree about which of the box's two jobs just happened.
    stage();
    const keyBox = g.mysteryBox;
    standAt(keyBox.pos.x, keyBox.pos.z - 1.2);
    P.item = null;
    g.credits = 100000;
    const use = g._useTarget();
    out.promptNamesBox = !!use && use.kind === 'box';
    const kb = g.credits;
    const keyQuote = g._boxCost();
    g.tryUse();
    out.keyBoughtRoll = kb - g.credits === keyQuote && keyBox.state !== 'idle';
    for (let i = 0; i < 500 && !keyBox.offered; i++) {
      g.time += 0.016;
      keyBox.update(0.016, g.time, g.player.pos);
    }
    const keyHeld = keyBox.offered;
    // The prompt now names the ITEM rather than the price, because the press
    // now does a different thing.
    const use2 = g._useTarget();
    out.promptStillNamesBox = !!use2 && use2.kind === 'box';
    out.promptTextNamesItem =
      g._usePrompt(use2)[0].includes(ITEMS[keyHeld].name);
    g.tryUse();
    out.keyTookItem = P.item === keyHeld;

    // A BROKE PLAYER GETS A BLOCKED PROMPT, not a silent one - the price is the
    // reason and it has to be on screen.
    stage();
    standAt(g.mysteryBox.pos.x, g.mysteryBox.pos.z - 1.2);
    g.credits = 0;
    const useBroke = g._useTarget();
    const [brokeText, brokeBlocked] = g._usePrompt(useBroke);
    out.brokePromptBlocked = brokeBlocked && brokeText.includes(String(g._boxCost()));

    // E at a station buys ammo, even standing where a totem's range reaches.
    stage();
    P.reserveAmmo = 0;
    g.credits = 5000;
    standAt(g.totemArea.ammoStation.pos.x, g.totemArea.ammoStation.pos.z - 1);
    out.promptNamesStation = g._useTarget() && g._useTarget().kind === 'station';
    g.tryUse();
    out.keyBoughtAmmo = P.reserveAmmo === 90;

    // --- THE READOUT: one segment per point, and no number anywhere ---
    // The bar is the ONLY place the charge cost is stated, and it states it in
    // segments. Everything else - the pedestal's lines, its bottom note, the
    // prompt, the build sheet - must not print it: the number is meant to be
    // learned by carrying the item, and one stray template would give it away
    // in the one place a player is most likely to be reading.
    out.segments = {};
    out.partialFills = [];
    out.chargeCostLeaks = [];
    // The charge costs as the pool actually states them, so the segment check
    // below can test itemCells()'s RULE rather than a snapshot of the table.
    out.chargeCosts = Object.fromEntries(
      Object.entries(ITEMS).map(([k, d]) => [k, d.charge])
    );
    for (const [key, def] of Object.entries(ITEMS)) {
      P.giveItem(key);
      g._updateHud();
      const n = Number(
        getComputedStyle(document.getElementById('item-bar-bg'))
          .getPropertyValue('--cells').trim()
      );
      out.segments[key] = n;
      // Walk the whole charge and check the bar only ever stops on a cell
      // boundary. This is the rendered fill, not the rule behind it: a rounding
      // slip anywhere between the charge and the transform shows up here.
      for (let c = 0; c <= def.charge; c += 0.1) {
        P.itemCharge = c;
        g._updateHud();
        const v = parseFloat(
          document.getElementById('item-bar').style.transform.match(/[\d.]+/)[0]
        );
        // A generous epsilon on purpose: the browser rounds the transform it
        // gives back to six decimals, so 2/12 reads as 0.166667 and multiplies
        // out to 2.000004. A genuinely part-lit cell would miss a boundary by a
        // large fraction of one, never by four millionths.
        if (Math.abs(v * n - Math.round(v * n)) > 0.01) {
          out.partialFills.push(`${key} at ${c.toFixed(1)}s -> ${v}`);
          break;
        }
      }
      P.itemCharge = def.charge;
      // Every string this item can put on screen, against the number it must
      // never contain.
      //
      // THE SUFFIX IS THE POINT. The cost is a bare count now, and bare counts
      // legitimately appear in effect lines - DONATION costs 50 points and
      // says COSTS 50 HP. What must never come back is the number worn as a
      // DURATION, which is the shape every template printed it in while items
      // charged on the clock.
      const secs = String(def.charge) + 's';
      const strings = [
        ...def.effects.map((e) => e[0]),
        def.name,
        // The build sheet's own entry for it: name, effect lines, and the
        // READY state - none of which may print the cost either.
        ...(() => {
          const a = g._statActive();
          return a ? [a.name, ...a.effects.map((e) => e[0])] : [];
        })(),
      ];
      P.item = null;
      for (const line of strings) {
        if (line.includes(secs)) out.chargeCostLeaks.push(key + ': ' + line);
      }
    }

    // --- THE MERGED POOL: everything in it is rollable --- The eleven that
    // came in from the max-health row have to be REACHABLE on a free totem.
    // A pick that is in the map, has a drawing and can still never be offered
    // is the one failure nothing else here would see.
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

  // ---- THE FIVE ITEMS, AND THE ELEVEN PASSIVE ITEMS ------------------------
  // Each is exercised against a live enemy or a live hit, because a field that
  // is set correctly and read nowhere looks identical from the outside.
  const m = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const out = {};
    const take = (id) => {
      P.upgrades = {};
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
        // THE MUSIC HAS TO RUN. Fire and poison tick on Music.pulse now, and
        // this helper drives the enemy step directly rather than going through
        // the frame loop - so without this the pulse never advances and no
        // damage-over-time in the game ever lands. sample() falls back to a
        // free-running tempo when there is no audio, which is exactly the case
        // in a headless run.
        g.music.sample(dt);
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

    // ---- BLINK DRIVE: the dash moves you, with no passive item behind it ----
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
    out.dashNeedsNoPassive = !P.mods.dashCharges;
    P.pos.set(0, 0, z0);

    // ---- and the charge costs are what the pool says ----
    out.chargeCosts = Object.fromEntries(
      Object.entries(g.__itemsForTest).map(([k, d]) => [k, d.charge])
    );

    // ======================================================================
    // THE WHOLE POOL, FIRED AND EXPIRED
    // ======================================================================
    //
    // THE ONE CHECK THAT SCALES. Thirty-seven items cannot each have a
    // hand-written assertion for what they do without the file becoming longer
    // than the pool it is testing, and the failure that actually matters is
    // the same for all of them: an item that writes a multiplier onto the
    // player and never hands it back. That is a run-ruining bug, it is silent,
    // and it is exactly what a missing end() produces.
    //
    // So: grant every item in turn, fire it, run frames past the longest
    // duration in the pool, and demand the player is back to neutral and the
    // running list is empty. Anything that leaks shows up by name.
    const NEUTRAL = () => ({
      itemDamageMult: P.itemDamageMult,
      itemTakenMult: P.itemTakenMult,
      itemRateMult: P.itemRateMult,
      itemHoming: P.itemHoming,
      leechShots: P.leechShots,
      elementCycle: P.elementCycle,
      statusLockEnd: P.statusLockEnd > g.time ? 1 : 0,
    });
    const CLEAN = JSON.stringify(
      { itemDamageMult: 1, itemTakenMult: 1, itemRateMult: 1, itemHoming: 0,
        leechShots: 0, elementCycle: -1, statusLockEnd: 0 }
    );
    out.leaked = [];
    out.threw = [];
    out.neverRan = [];
    out.stillRunning = [];
    P.upgrades = {};
    P.rebuildMods();
    for (const key of Object.keys(g.__itemsForTest)) {
      clearField();
      // A crowd to act on, and a boss, so the paths that walk the enemy list
      // are exercised rather than skipped for an empty arena - and so LAST
      // RITES gets something it is forbidden to kill.
      for (let i = 0; i < 4; i++) spawn('chaser', -6 + i * 3, 4);
      const bossy = spawn('chaser', 8, 8);
      bossy.boss = true;
      bossy.hp = 1;
      P.health = 60;
      P.reserveAmmo = 200;
      P.mag = 30;
      P.pos.set(0, 0, 8);
      P.invulnEnd = 0;
      P.hpBanked = 0;
      P.freeRerolls = 0;
      try {
        useItem(key);
      } catch (e) {
        out.threw.push(key + ': ' + e.message);
        continue;
      }
      const def = g.__itemsForTest[key];
      if (def.duration > 0 && !g.running.list.some((r) => r.id === key)) {
        out.neverRan.push(key);
      }
      try {
        // Twenty-five seconds, which is past HAEMOPHAGE's twenty - the longest
        // window in the pool.
        for (let i = 0; i < 500; i++) {
          g.time += 0.05;
          g.running.update(g, 0.05);
          g._updateDeployed(0.05);
          P.update(0.05, g.input, g.arena.obstacles, g.time, true);
        }
      } catch (e) {
        out.threw.push(key + ' (running): ' + e.message);
        continue;
      }
      if (g.running.list.some((r) => r.id === key)) out.stillRunning.push(key);
      if (JSON.stringify(NEUTRAL()) !== CLEAN) {
        out.leaked.push(key + ': ' + JSON.stringify(NEUTRAL()));
      }
      // The item's own mark on the run, undone, so the next iteration starts
      // from the same place this one did.
      P.hpBanked = 0;
      g.running.clear(g);
      g._clearDeployed();
    }
    // MARTYR could not be allowed to matter here - it leaves the player at 10 -
    // so the health is reset above rather than after.
    P.health = P.maxHealth;
    clearField();

    // ---- ...AND THE LIST ITSELF ----
    //
    // Three rules, and each of them is a bug that would otherwise only show up
    // in a run: re-firing must refresh rather than stack (two BLOOD TAXes
    // would be nine times damage through a multiplier neither could hand
    // back), clear() must run every end(), and a duration must actually end.
    P.upgrades = {};
    P.rebuildMods();
    useItem('itemPact');
    const pactMult = P.itemDamageMult;
    useItem('itemPact');
    out.refreshDoesNotStack = P.itemDamageMult === pactMult
      && g.running.list.filter((r) => r.id === 'itemPact').length === 1;
    g.running.clear(g);
    out.clearRunsEnd = P.itemDamageMult === 1 && g.running.list.length === 0;

    // BODY COUNT counts kills, and only while it is running.
    useItem('itemTally');
    const tallyBase = P.itemDamageMult;
    g.running.onKill(g);
    g.running.onKill(g);
    out.tallyStacks = +(P.itemDamageMult - tallyBase).toFixed(2);
    g.running.clear(g);
    g.running.onKill(g);
    out.tallyStopsWhenDone = P.itemDamageMult === 1;

    // LANCE refuses itself when the rounds are not there, and does not spend
    // the charge doing it - which is the whole reason `ready` exists.
    P.giveItem('itemLance');
    P.mag = 0;
    P.reserveAmmo = 5;
    const chargeBefore = P.itemCharge;
    g.tryItem();
    out.lanceRefused = P.itemCharge === chargeBefore && P.reserveAmmo === 5;
    P.reserveAmmo = 300;
    P.mag = 30;
    g.tryItem();
    out.lanceSpends = P.mag + P.reserveAmmo === 300;

    // WHITE CELL clears what is on the player AND refuses the next one.
    P.applyStatus('fire', 5);
    P.applyStatus('poison', 5);
    useItem('itemPurify');
    P.now = g.time;
    out.purified = !P.hasStatus('fire') && !P.hasStatus('poison');
    out.purifyLocks = P.applyStatus('fire', 5) === false;
    g.running.clear(g);
    P.now = g.time;
    out.purifyLockLifts = P.applyStatus('fire', 5) === true;
    P.clearStatuses();

    // GRAFT is the only item that leaves a mark on the run.
    const hpWas2 = P.maxHealth;
    useItem('itemGraft');
    out.graftPermanent = P.maxHealth === hpWas2 + 3;
    P.hpBanked = 0;

    // SECOND OPINION IS THE REROLL. Pressed with a set standing it redraws the
    // three offers on the spot - no token, no walk to a console - and it takes
    // nothing from the wallet and nothing from the console's price ladder.
    g.totemArea.present(g._buildOffers(), true, 0);
    const rerollsWas = g.totemArea.rerolls;
    const creditsWas = g.credits;
    // Counted at the door rather than by comparing the three ids: a fresh roll
    // may legitimately hand back an offer the set already had, and a test that
    // failed on that would be testing the dice.
    const realPresent = g.totemArea.present.bind(g.totemArea);
    let presented = 0;
    let presentReset = null;
    g.totemArea.present = (offers, reset, arm) => {
      presented++; presentReset = reset;
      return realPresent(offers, reset, arm);
    };
    useItem('itemReroll');
    g.totemArea.present = realPresent;
    out.rerollRedrew = presented === 1 && presentReset === false;
    out.rerollFree = g.credits === creditsWas;
    out.rerollKeepsLadder = g.totemArea.rerolls === rerollsWas;
    // ...and with the totems down there is nothing to reroll, so the press is
    // refused before the charge is spent.
    g.totemArea.dismiss();
    for (const t of g.totemArea.totems) { t.state = 'hidden'; t.claimed = false; }
    P.giveItem('itemReroll');
    const chargeWas = P.itemCharge;
    g.tryItem();
    out.rerollRefusedOffShop = P.itemCharge === chargeWas;

    // ---- A CHIP NEVER OUTLIVES THE EFFECT IT IS DRAWN FOR ----
    //
    // Found in play: HAEMOPHAGE's chip sat in the strip for the rest of its
    // twenty-second backstop after the tenth hit had already been spent, so the
    // HUD was telling the player they were carrying something they were not.
    // The general rule is that the strip reports the EFFECT, not the clock the
    // effect happens to be filed under.
    P.upgrades = {};
    P.rebuildMods();
    g.running.clear(g);
    useItem('itemLeech');
    out.leechChipUp = g.running.chips([]).length === 1;
    P.leechShots = 0;
    g.running.update(g, 0.016);
    out.leechChipGoesWithTheShots = g.running.chips([]).length === 0;

    // ...and the two pickup-shared windows measure against the window that was
    // actually granted, not against the pickup's own length. OVERDRIVE opens
    // five seconds where the RAGE pickup opens ten; the chip must start FULL
    // for both.
    P.damageBoostEnd = 0;
    P.damageMult = 1;
    useItem('itemRage');
    out.rageChipStartsFull = +(
      (P.damageBoostEnd - g.time) / P.damageBoostFull
    ).toFixed(3);
    P.fireRateBoostEnd = 0;
    P.fireRateMult = 1;
    useItem('itemRate');
    out.rateChipStartsFull = +(
      (P.fireRateBoostEnd - g.time) / P.fireRateBoostFull
    ).toFixed(3);
    // A five-second item landing under a ten-second pickup must leave the chip
    // measuring the ten it is actually counting down.
    P.damageBoostEnd = g.time + 10;
    P.damageBoostFull = 10;
    useItem('itemRage');
    out.shorterWindowLeavesTheLonger = P.damageBoostFull === 10;
    P.damageBoostEnd = 0;
    P.damageMult = 1;
    P.fireRateBoostEnd = 0;
    P.fireRateMult = 1;
    g.running.clear(g);

    // A DEPLOYABLE IS AN ENTITY, and it goes when the fight does.
    clearField();
    g._clearDeployed();
    useItem('itemTurret');
    useItem('itemSwarm');
    out.deployed = g._deployed.length;
    g._clearDeployed();
    out.deployCleared = g._deployed.length === 0;
    // ...and the list is capped, so a slot fired at a wave break cannot grow
    // it without bound.
    for (let i = 0; i < 200; i++) useItem('itemMine');
    out.deployCapped = g._deployed.length <= 40;
    g._clearDeployed();
    g.running.clear(g);
    P.health = P.maxHealth;

      // ---- ...AND THE GAME LOOP ACTUALLY DRIVES THEM ----
    //
    // Everything above steps running.update() and _updateDeployed() by hand,
    // which proves the machinery and proves nothing about whether _loop calls
    // it. That is a real failure mode with no symptom in any other test - the
    // items would simply never end - so this hands both lists something with a
    // short clock and then gets out of the way.
    g.state = 'playing';
    g.waveState = 'active';
    clearField();
    g.running.clear(g);
    g._clearDeployed();
    P.giveItem('itemCharge');   // 0.4s window
    g.tryItem();
    P.giveItem('itemBomb');     // a 3s fuse, and then it is gone
    g.tryItem();
    out.loopStartRunning = g.running.list.length;
    out.loopStartDeployed = g._deployed.length;

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

    // EXECUTIONER: half a boss, and the ONE passive item that still costs
    // health. Charged as a mod, so it has to survive a rebuild - which is
    // exactly what the old payment could not have done.
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

  // FOUR SECONDS OF THE GAME'S OWN CLOCK, with nothing driven by hand. Long
  // enough for BONESAW's 0.4s window and SHORT FUSE's 3s fuse to both come and
  // go on their own - which is the only thing that proves _loop reaches the
  // running list and the deployable list at all.
  //
  // WAITED OUT IN GAME TIME, NOT WALL TIME. Game.time advances by the real
  // frame delta CLAMPED TO 50ms, so under this harness's software renderer -
  // where a frame with the shop standing costs well over that - four seconds at
  // the wall buys under two on the clock the fuse is measured against, and the
  // assertion below fails for a reason that has nothing to do with the loop.
  // The wall-clock cap is still there so a genuinely stalled loop fails fast
  // instead of hanging the suite.
  const t0 = await page.evaluate(() => window.__game.time);
  const waitUntil = Date.now() + 30000;
  while (Date.now() < waitUntil) {
    const t = await page.evaluate(() => window.__game.time);
    if (t - t0 >= 4) break;
    await sleep(250);
  }
  const loop = await page.evaluate(() => ({
    running: window.__game.running.list.map((r) => r.id),
    deployed: window.__game._deployed.length,
    itemDamageMult: window.__game.player.itemDamageMult,
  }));

  console.log(JSON.stringify({ ...r, mechanics: m, loop }, null, 2));

  // ---- the box ----
  ok('it stands in every shop',
    JSON.stringify(r.everyShop) === '[1,1,1,1,1,1,1,1,1]', JSON.stringify(r.everyShop));
  ok('a totem reroll leaves it alone', r.totemRerollLeftTheBox);
  ok('it comes up shut and buyable',
    r.boxUp && r.boxStartsShut && r.boxStartsBuyable && r.boxOffersNothingShut);
  ok('it has no consoles', r.noStationInRange);
  // ARM_TIME_ITEM, less whatever the sampling frame ate. The box stands in
  // every break now, so the LONGER arm is simply what a totem always gets.
  ok('totems armed for the long delay', r.totemArm >= 1, String(r.totemArm));
  ok('a roll is charged once, at the box price',
    r.rollCostIsBoxCost && r.rollCharged > 0, String(r.rollCharged));
  ok('paying opens it', r.opensOnPurchase);
  ok('it cannot be bought twice mid-spin', r.noDoubleBuy);
  ok('an empty wallet rolls nothing', r.brokeRefused && r.brokeStillBuyable);

  // ---- the reel ----
  ok('the reel actually cycles', r.reelTicks > 20, String(r.reelTicks) + ' ticks');
  ok('it shows many different items', r.reelShowedMany > 10, String(r.reelShowedMany));
  ok('everything it shows is a real item', r.reelIsAllRealItems);
  ok('it lands on one of them',
    r.landedIsReal && r.landedIsOnTheReel && r.stateIsRevealed, String(r.landed));

  // ---- taking it ----
  ok('taking it fills the slot', r.carried);
  ok('it arrives fully charged', r.arrivesCharged);
  ok('taking it does not start the wave', r.totemsStillUp);
  ok('the box stays standing', r.boxStandsAfterTake && r.boxShutsAfterTake);
  ok('it offers nothing once taken', r.nothingOfferedAfterTake);
  ok('and it can be paid again', r.buyableAgainAfterTake);
  ok('a second item replaces the first',
    r.secondIsDifferent && r.replaced && r.oneSlotOnly);
  ok('the replacement is charged too', r.replacementCharged);

  // ---- the price ----
  // IT IS PRICED LIKE THE REROLL AND IT ESCALATES LIKE ONE. Standing at the box
  // feeding it credits until it hands over the item you wanted is the shop
  // answering a question already asked, so the second asking costs double - and
  // the counter is the box's own, reset when a fresh set of totems rises.
  ok('rolls double within one visit, from $1,000',
    JSON.stringify(r.fiveRollsOneVisit) === '[1000,2000,4000,8000,16000]',
    JSON.stringify(r.fiveRollsOneVisit));
  ok('the price steps up per block of five waves',
    JSON.stringify(r.waveLadder) === '[1000,1000,1500,2000]', JSON.stringify(r.waveLadder));

  // ---- the ten seconds ----
  ok('an item nobody takes goes back in',
    r.strandedLanded && r.strandedGone && r.strandedNotGranted);
  ok('and the box sells another', r.buyableAfterStranding);
  ok('the window really is ten seconds', r.stillOfferedLate && r.lateGrabWorks);

  // ---- the pool ----
  ok('the carried item is never even on the reel',
    r.carriedNeverOnReel === 0, String(r.carriedNeverOnReel));
  ok('the reel is always the whole rest of the pool',
    r.poolAlwaysFull === 0, String(r.poolAlwaysFull));
  ok('every other item in the pool is reachable',
    r.poolSize === r.poolTotal - 1 && r.poolMissesCarried,
    r.poolSize + '/' + (r.poolTotal - 1));
  ok('an empty slot excludes nothing',
    r.emptySlotPool === r.poolTotal, String(r.emptySlotPool));

  // ---- the charge ----
  ok('the shop charges nothing', r.shopChargesNothing);
  ok('WAVE TIME CHARGES NOTHING EITHER - the stall is gone', r.timeChargesNothing);
  ok('points charge it', r.pointsCharge);
  ok('a part-filled bar is not ready', r.notReadyEarly);
  ok('the ready flag fires when it fills', r.readyFired);
  ok('the charge caps at the cost', r.chargeCaps);
  ok('an empty slot banks nothing', r.noSlotNoCharge);
  ok('the ready flag fires exactly once', r.readyFiresOnce);
  ok('it can still be fired in the shop', r.firesInShop);
  ok('an uncharged press spends nothing', r.uncharged);
  ok('an empty slot is harmless', r.emptySlotSafe);

  // ---- claiming ----
  ok('shooting the box buys a roll', r.shotBoughtRoll && r.shotOpenedBox);
  ok('a held trigger buys exactly one', r.shotDidNotDoubleBuy);
  ok('buying a roll leaves the totems up', r.shotDidNotStartWave);
  ok('shooting it again takes what it is holding',
    r.shotTookItem && r.shotTakeWasFree);
  ok('shooting a totem is still free', r.shotTookTotem);
  ok('a totem claim closes the box', r.totemClosedTheBox);
  ok('standing in a totem claims nothing', r.walkingClaimsNothing);
  ok('E takes the totem you are standing at', r.promptNamesTotem && r.keyClaimedTotem);
  ok('E at the box buys a roll', r.promptNamesBox && r.keyBoughtRoll);
  ok('E at an open box takes the item',
    r.promptStillNamesBox && r.promptTextNamesItem && r.keyTookItem);
  ok('a broke player is told the price', r.brokePromptBlocked);
  ok('E at a station buys ammo', r.promptNamesStation && r.keyBoughtAmmo);

  // ---- the readout ----
  // The RENDERED count, off the live element - the arithmetic behind it is
  // covered as pure data in test/icons.mjs. What this catches is the wiring:
  // .seg declares --cells on the element it is applied to, so a value written
  // to any ancestor is silently ignored and the bar quietly shows twenty cells
  // whatever the item is.
  // THE RULE, not a snapshot of it. A literal map was fine at five items and is
  // unmaintainable at thirty-seven - and it tested that the table had not
  // changed rather than that the meter obeys itemCells(), which is the thing
  // that could actually break.
  {
    const wrong = Object.entries(r.segments)
      .filter(([k, n]) => (
        n !== Math.max(1, Math.min(12, Math.ceil(r.chargeCosts[k])))
      ))
      .map(([k, n]) => k + '=' + n);
    ok('the meter renders the right number of segments',
      wrong.length === 0 && Object.keys(r.segments).length === r.poolTotal,
      wrong.join(', ') || Object.keys(r.segments).length + ' items');
  }
  ok('the meter never renders a part-lit segment',
    r.partialFills.length === 0, r.partialFills.join(' | '));
  ok('the charge cost is printed nowhere',
    r.chargeCostLeaks.length === 0, r.chargeCostLeaks.join(' | '));

  // ---- the merged pool ----
  ok('every converted passive item is rollable',
    r.convertedUnreachable.length === 0, r.convertedUnreachable.join(', '));
  ok('the dropped passive items are gone', r.droppedGone);

  // ---- the whole pool, fired and expired ----
  ok('every item fires without throwing', m.threw.length === 0, m.threw.join(' | '));
  ok('every item with a duration actually runs',
    m.neverRan.length === 0, m.neverRan.join(', '));
  ok('every window closes', m.stillRunning.length === 0, m.stillRunning.join(', '));
  ok('no item leaves a multiplier on the player',
    m.leaked.length === 0, m.leaked.join(' | '));
  ok('re-firing refreshes and does not stack', m.refreshDoesNotStack);
  ok('clearing the list runs every end()', m.clearRunsEnd);
  ok('body count stacks on kills', m.tallyStacks === 0.2, String(m.tallyStacks));
  ok('body count stops counting once it is over', m.tallyStopsWhenDone);
  ok('lance refuses itself when the ammo is short', m.lanceRefused);
  ok('lance spends exactly 30 rounds', m.lanceSpends);
  ok('white cell clears every affliction', m.purified);
  ok('white cell refuses the next one', m.purifyLocks);
  ok('...and the lock lifts with it', m.purifyLockLifts);
  ok('graft is permanent max health', m.graftPermanent);
  ok('second opinion rerolls the shop on use', m.rerollRedrew);
  ok('...for nothing, and without moving the console price', m.rerollFree && m.rerollKeepsLadder);
  ok('...and is refused when there is nothing to reroll', m.rerollRefusedOffShop);
  ok('a chip goes when its effect does, not when its clock does',
    m.leechChipUp && m.leechChipGoesWithTheShots);
  ok('the damage chip opens full', m.rageChipStartsFull === 1, String(m.rageChipStartsFull));
  ok('the fire rate chip opens full', m.rateChipStartsFull === 1, String(m.rateChipStartsFull));
  ok('a shorter window does not shrink a longer one', m.shorterWindowLeavesTheLonger);
  ok('deployables reach the arena', m.deployed === 6, String(m.deployed));
  ok('the game loop drives the running list',
    m.loopStartRunning > 0 && loop.running.length === 0, loop.running.join(', '));
  ok('the game loop drives the deployables',
    m.loopStartDeployed > 0 && loop.deployed === 0, String(loop.deployed));
  ok('deployables go with the fight', m.deployCleared);
  ok('the deployable list is capped', m.deployCapped);

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
  ok('the dash needs no passive item behind it', m.dashNeedsNoPassive);
  // THE RULE, not a snapshot of it. This used to name five costs as literals,
  // which tested that nobody had tuned the table rather than that the table is
  // usable - and it failed the moment anybody did. What has to hold is that
  // every item in the pool the BROWSER loaded states a real cost: a missing or
  // zero one is an item that arrives permanently ready, which nothing else
  // here would catch.
  {
    const badCost = Object.entries(m.chargeCosts)
      .filter(([, c]) => !Number.isFinite(c) || c <= 0)
      .map(([k, c]) => k + '=' + c);
    ok('every item states a real charge cost',
      badCost.length === 0 && Object.keys(m.chargeCosts).length > 0,
      badCost.join(', '));
  }

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
