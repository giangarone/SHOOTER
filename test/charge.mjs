// Item-charge test.
//
// Active items used to fill on the clock - one point per second of wave time -
// and that paid the player for taking longer. Kiting the last enemy of a wave
// was the cheapest way to refill the dearest item in the pool, which is the
// same defect the bounty had when the kill chain multiplied it.
//
// Charge is bought with DEAD ENEMIES now, at a flat rate on each enemy's own
// value, and handed over as that kill's orbs are picked up. Five properties are
// what make that trade safe:
//
//   the price is the price      a chaser costs the same on wave 1 and wave 50,
//                               so the same work is never worth less later
//   the economy cannot leak in  Midas and the flawless streak multiply MONEY,
//                               and money is not what charges an item
//   value carries it, not count a kill's charge arrives at the same rate
//                               however its money happened to split into orbs
//   free kills are worth zero   a splitter's children are fragments of a kill
//                               already paid for
//   the trickle cannot be farmed a boss wave's adds never stop arriving, so
//                               they are the one thing with a ceiling on them
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8231;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT);
await sleep(800);

let browser;
let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
};

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load' });
  await sleep(1500);

  // The bar caps at the item's own cost, so a wave worth more than that cannot
  // be read off it. What is measured below is what was HANDED OVER - the points
  // that went into addItemCharge - which is the figure the rate is about.
  await page.evaluate(() => {
    const P = Object.getPrototypeOf(window.__game.player);
    if (P.__chargeTapped) return;
    P.__chargeTapped = true;
    const real = P.addItemCharge;
    P.addItemCharge = function (points) {
      if (points > 0) window.__delivered = (window.__delivered || 0) + points;
      return real.call(this, points);
    };
  });

  // A wave, played through the real kill and pickup path.
  const playWave = `async (wave) => {
    const { waveConfig } = await import('./js/waves.js');
    const { ENEMY_TYPES } = await import('./js/enemy.js');
    const g = window.__game;
    g.wave = wave;
    g._cfg = waveConfig(wave);
    g.bossFight = null;
    g._startWaveCharge();
    g.money.clear();
    g.player.giveItem('itemHeal');
    g.player.itemCharge = 0;
    window.__delivered = 0;
    let value = 0;
    let orbs = 0;
    for (const key of g._cfg.queue) {
      const v = ENEMY_TYPES[key].value;
      value += v;
      const paid = g._dropMoney({ x: 0, y: 0.5, z: 0 }, v * 0.25);
      g._bankKillCharge(v, paid);
    }
    orbs = g.money.count;
    g.money.vacuum();
    for (let i = 0; i < 600 && g.money.count; i++) {
      g.money.update(0.05, g.player.pos, 1e6, g._onOrb);
    }
    const onPickup = window.__delivered;
    g._flushItemCharge();
    const got = +window.__delivered.toFixed(6);
    g.money.clear();
    return { wave, enemies: g._cfg.queue.length, value, orbs, got,
             onPickup: +onPickup.toFixed(6) };
  }`;

  // ---- the price of an enemy does not depend on the wave ----
  const waves = [];
  for (const w of [1, 3, 6, 8, 12, 16, 24, 26, 34]) {
    waves.push(await page.evaluate(`(${playWave})(${w})`));
  }
  const rates = waves.map((r) => +(r.got / r.value).toFixed(8));
  check('a point of charge always costs the same in enemy value',
    new Set(rates).size === 1, `rate=${rates[0]} per value across ${waves.length} waves`);
  check('...which is one point per basic enemy (100 value)',
    Math.abs(rates[0] * 100 - 1) < 1e-9, `chaser = ${(rates[0] * 100).toFixed(4)} points`);
  check('every wave pays its own cast, in full',
    waves.every((r) => Math.abs(r.got - r.value * 0.01) < 0.001),
    waves.map((r) => `w${r.wave}=${r.got.toFixed(1)}`).join(' '));
  check('and it is the ORBS that carry it, not the kill',
    waves.every((r) => r.onPickup > r.got * 0.99),
    waves.map((r) => `w${r.wave}=${r.onPickup.toFixed(1)}/${r.got.toFixed(1)}`).join(' '));

  // ---- bigger waves grant more, and it plateaus rather than running away ----
  const first = waves[0];
  const last = waves[waves.length - 1];
  check('a late wave grants more charge than an early one',
    last.got > first.got * 5,
    `w${first.wave}=${first.got.toFixed(1)} -> w${last.wave}=${last.got.toFixed(1)}`);
  const late = waves.filter((r) => r.wave >= 24);
  check('and the growth flattens off once the enemy count caps',
    Math.max(...late.map((r) => r.got)) / Math.min(...late.map((r) => r.got)) < 1.25,
    late.map((r) => `w${r.wave}=${r.got.toFixed(1)}`).join(' '));

  // ---- the money multipliers do not reach it ----
  const rich = await page.evaluate(async () => {
    const { waveConfig } = await import('./js/waves.js');
    const { ENEMY_TYPES } = await import('./js/enemy.js');
    const g = window.__game;
    // ONE cast, run twice. waveConfig picks its members at random inside each
    // role, so calling it per run would compare two different waves.
    const queue = waveConfig(12).queue;
    const run = (creditMult, streak) => {
      g.wave = 12;
      g.bossFight = null;
      g._startWaveCharge();
      g.money.clear();
      g.player.giveItem('itemHeal');
      g.player.itemCharge = 0;
      g.player.mods.creditMult = creditMult;
      g.player.flawlessStreak = streak;
      let credits = 0;
      for (const key of queue) {
        const v = ENEMY_TYPES[key].value;
        const paid = g._dropMoney({ x: 0, y: 0.5, z: 0 }, v * 0.25);
        credits += paid;
        g._bankKillCharge(v, paid);
      }
      window.__delivered = 0;
      g.money.vacuum();
      for (let i = 0; i < 600 && g.money.count; i++) {
        g.money.update(0.05, g.player.pos, 1e6, g._onOrb);
      }
      g._flushItemCharge();
      const got = +window.__delivered.toFixed(6);
      g.money.clear();
      return { got, credits: Math.round(credits) };
    };
    const poor = run(1, 0);
    const midas = run(3, 8);
    g.player.mods.creditMult = 1;
    g.player.flawlessStreak = 0;
    return { poor, midas };
  });
  check('a Midas + max-streak run collects far more money',
    rich.midas.credits > rich.poor.credits * 5,
    `poor=$${rich.poor.credits} rich=$${rich.midas.credits}`);
  check('...and charges at exactly the same rate',
    Math.abs(rich.midas.got - rich.poor.got) < 0.001,
    `poor=${rich.poor.got} rich=${rich.midas.got}`);

  // ---- the charge rides on orb VALUE, not on orb count ----
  //
  // Half the money collected must be half the charge, however many orbs that
  // half happened to be. _collectOrb is called directly so the split is exact.
  const weighted = await page.evaluate(() => {
    const g = window.__game;
    g.bossFight = null;
    g._startWaveCharge();
    g.money.clear();
    g.player.giveItem('itemHeal');
    g.player.itemCharge = 0;
    // A tank: 300 value, so 3 points, paid as $75.
    g._bankKillCharge(300, 75);
    window.__delivered = 0;
    g._collectOrb(15);            // one fifth of the money
    const fifth = +window.__delivered.toFixed(6);
    window.__delivered = 0;
    g._collectOrb(60);            // the remaining four fifths, in ONE orb
    const rest = +window.__delivered.toFixed(6);
    return { fifth, rest, owed: 3 };
  });
  check('one fifth of a kill\'s money pays one fifth of its charge',
    Math.abs(weighted.fifth - 0.6) < 1e-6, `got=${weighted.fifth} want=0.6`);
  check('and a single fat orb pays the whole rest, not one orb\'s worth',
    Math.abs(weighted.rest - 2.4) < 1e-6, `got=${weighted.rest} want=2.4`);

  // ---- a split child is a free kill and pays nothing ----
  const split = await page.evaluate(() => {
    const g = window.__game;
    g.bossFight = null;
    g._startWaveCharge();
    g.money.clear();
    g.player.giveItem('itemHeal');
    g.player.itemCharge = 0;
    // A child as main.js builds one: value zeroed, a flat $1.50 bounty instead.
    const paid = g._dropMoney({ x: 0, y: 0.5, z: 0 }, 1.5);
    g._bankKillCharge(0, paid);
    const orbs = g.money.count;
    window.__delivered = 0;
    g.money.vacuum();
    for (let i = 0; i < 400 && g.money.count; i++) {
      g.money.update(0.05, g.player.pos, 1e6, g._onOrb);
    }
    g._flushItemCharge();
    const got = window.__delivered;
    g.money.clear();
    return { got, orbs };
  });
  check('a split child drops an orb', split.orbs === 1, `orbs=${split.orbs}`);
  check('and charges nothing at all - the farm is closed',
    split.got === 0, `got=${split.got}`);

  // ---- a boss wave's trickle is capped, not just paced ----
  const boss = await page.evaluate(async () => {
    const { BOSS_ADD_CHARGE_CAP } = await import('./js/items.js');
    const g = window.__game;
    g.wave = 10;
    g._cfg = (await import('./js/waves.js')).waveConfig(10);
    g._startWaveCharge();
    g.money.clear();
    g.player.giveItem('itemHeal');
    g.player.itemCharge = 0;
    // Stand in for a live boss so the add branch is the one taken.
    g.bossFight = { key: 'siege', parts: [], totalMaxHp: 1000 };
    window.__delivered = 0;
    // Two hundred adds - far past what a boss wave is reckoned to be worth.
    for (let i = 0; i < 200; i++) {
      const paid = g._dropMoney({ x: 0, y: 0.5, z: 0 }, 30);
      g._bankKillCharge(120, paid);
    }
    g.money.vacuum();
    for (let i = 0; i < 900 && g.money.count; i++) {
      g.money.update(0.05, g.player.pos, 1e6, g._onOrb);
    }
    g._flushItemCharge();
    const farmed = +window.__delivered.toFixed(4);
    g.bossFight = null;
    g.money.clear();
    return { farmed, cap: BOSS_ADD_CHARGE_CAP };
  });
  check('two hundred farmed adds cannot beat the add ceiling',
    boss.farmed <= boss.cap + 0.001,
    `farmed=${boss.farmed} ceiling=${boss.cap}`);

  // ---- the boss itself pays as its health falls ----
  const drain = await page.evaluate(async () => {
    const { ENEMY_TYPES } = await import('./js/enemy.js');
    const g = window.__game;
    g._startWaveCharge();
    g.player.giveItem('itemHeal');
    g.player.itemCharge = 0;
    const part = { hp: 1000 };
    g.bossFight = { key: 'siege', parts: [part], totalMaxHp: 1000 };
    window.__delivered = 0;
    const steps = [];
    for (const hp of [750, 500, 250, 0]) {
      part.hp = hp;
      g._bossChargeDrain();
      steps.push(+window.__delivered.toFixed(3));
    }
    // A heal must not pay again.
    part.hp = 1000;
    g._bossChargeDrain();
    const afterHeal = +window.__delivered.toFixed(3);
    g.bossFight = null;
    return { steps, afterHeal, want: ENEMY_TYPES.siege.value * 0.01 };
  });
  check('a boss pays out as its health bar falls, not in one lump',
    drain.steps.length === 4 && drain.steps[0] > 0
      && drain.steps.every((v, i) => i === 0 || v > drain.steps[i - 1]),
    drain.steps.join(' -> '));
  check('a killed boss has paid exactly its own value',
    Math.abs(drain.steps[3] - drain.want) < 0.01,
    `paid=${drain.steps[3]} want=${drain.want}`);
  check('and healing it back up pays nothing a second time',
    drain.afterHeal === drain.steps[3], `after=${drain.afterHeal}`);

  // ---- and time itself buys nothing ----
  const idle = await page.evaluate(() => {
    const g = window.__game;
    g.player.giveItem('itemHeal');
    g.player.itemCharge = 0;
    for (let i = 0; i < 1200; i++) {   // a full minute of COMBAT, standing still
      g.time += 0.05;
      g.player.update(0.05, g.input, g.arena.obstacles, g.time, true);
    }
    return g.player.itemCharge;
  });
  check('a minute of combat standing still charges nothing', idle === 0,
    `charge=${idle}`);

  console.log('\n  what a cleared wave is worth, in charge points:');
  for (const r of waves) {
    console.log(`    wave ${String(r.wave).padStart(2)}  ${String(r.enemies).padStart(2)} enemies`
      + `  ${String(r.value).padStart(5)} value  ->  ${r.got.toFixed(1)} points`);
  }

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('test ran', false, e.message);
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(bad ? 'CHARGE TEST FAIL' : 'CHARGE TEST PASS');
process.exit(bad ? 1 : 0);
