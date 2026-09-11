// Money-orb test.
//
// Kills pay onto the FLOOR now, which moves the economy out of one line in
// main.js and into a system with a lifetime, a magnet and a cap. Four
// properties are what make that trade safe, and none of them are visible to
// the smoke test:
//
//   nothing is created         a kill's orbs add up to exactly what the kill
//                              was worth, and collecting them pays exactly
//                              that - no rounding drift over a run
//   nothing is destroyed       past MAX_ORBS a drop MERGES into an existing
//                              orb rather than being dropped on the floor, so
//                              the cap costs the player nothing
//   the sweep is total         a wave clear pulls in every orb still down
//                              there, however far away and however old
//   the radius is a stat       Lodestone widens it, in tiers, and the wider
//                              radius actually collects from further out
//
// The first two are the ones worth having a test for at all: an economy that
// quietly leaks a few credits per kill is invisible for twenty waves and then
// wrong by thousands.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8221;
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

  // ---- a drop is worth what it was paid ----
  const split = await page.evaluate(() => {
    const g = window.__game;
    g.money.clear();
    const at = { x: 0, y: 0.5, z: 0 };
    const amounts = [7, 15, 33, 108, 400, 1000];
    const out = [];
    for (const a of amounts) {
      g.money.clear();
      g.money.spawn(at, a, a > 500 ? 40 : 5);
      let sum = 0;
      for (let i = 0; i < g.money.count; i++) sum += g.money.value[i];
      out.push({ a, orbs: g.money.count, sum: +sum.toFixed(4) });
    }
    g.money.clear();
    return out;
  });
  for (const r of split) {
    check(`$${r.a} splits into orbs worth $${r.a}`, Math.abs(r.sum - r.a) < 0.01,
      `orbs=${r.orbs} sum=${r.sum}`);
  }
  check('a small kill is one orb', split[0].orbs === 1, `orbs=${split[0].orbs}`);
  check('a big kill scatters', split[3].orbs > 1 && split[3].orbs <= 5,
    `orbs=${split[3].orbs}`);
  check('the boss shower is a shower', split[5].orbs >= 20, `orbs=${split[5].orbs}`);

  // ---- the cap merges rather than drops ----
  const cap = await page.evaluate(async () => {
    const { MAX_ORBS } = await import('./js/money.js');
    const g = window.__game;
    g.money.clear();
    let paid = 0;
    // Well past the cap, spread over the arena so the merge has to search.
    for (let i = 0; i < 400; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 14;
      const amount = 20 + Math.random() * 120;
      paid += amount;
      g.money.spawn({ x: Math.cos(a) * r, y: 0.5, z: Math.sin(a) * r }, amount);
    }
    let held = 0;
    for (let i = 0; i < g.money.count; i++) held += g.money.value[i];
    const out = { max: MAX_ORBS, count: g.money.count, paid: +paid.toFixed(2), held: +held.toFixed(2) };
    g.money.clear();
    return out;
  });
  check('orbs never exceed the cap', cap.count <= cap.max, `count=${cap.count} max=${cap.max}`);
  check('the cap is actually reached', cap.count === cap.max, `count=${cap.count}`);
  check('merging loses no money', Math.abs(cap.held - cap.paid) < 0.5,
    `paid=${cap.paid} held=${cap.held}`);

  // ---- collecting pays exactly what was dropped ----
  const collect = await page.evaluate(async () => {
    const g = window.__game;
    // The bot is still playing, and its kills would salt the arena with orbs
    // this test did not drop. Silence the kill payout for the duration.
    const origDrop = g._dropMoney;
    g._dropMoney = () => {};
    g.money.clear();
    const before = g.credits;
    let paid = 0;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 12;
      const amount = 10 + Math.random() * 90;
      paid += amount;
      g.money.spawn(
        { x: g.player.pos.x + Math.cos(a) * r, y: 0.5, z: g.player.pos.z + Math.sin(a) * r },
        amount
      );
    }
    const dropped = g.money.count;
    g.money.vacuum();
    // The vacuum has to finish inside the orb lifetime, from anywhere in the
    // arena - that is the property, not just that it eventually empties.
    //
    // MEASURED ON THE GAME CLOCK, not on the wall. The orb lifetime is eight
    // seconds of SIMULATION, and the flight that has to fit inside it is
    // integrated per frame - so on a loaded machine, where the loop clamps dt
    // at 0.05 and renders a handful of frames a second, eight wall seconds is
    // a second or two of game and half the orbs are still in the air. That was
    // this check failing on a build with nothing wrong with it.
    await window.__simWait(8, () => g.money.count === 0);
    const out = { dropped, left: g.money.count, paid: +paid.toFixed(2), gained: +(g.credits - before).toFixed(2) };
    g._dropMoney = origDrop;
    return out;
  });
  check('the wave-clear sweep collects everything', collect.left === 0,
    `dropped=${collect.dropped} left=${collect.left}`);
  check('collecting pays what was dropped', Math.abs(collect.gained - collect.paid) < 0.5,
    `paid=${collect.paid} gained=${collect.gained}`);

  // ---- the magnet radius is a stat Lodestone moves ----
  const magnet = await page.evaluate(async () => {
    const { BASE_MAGNET_RADIUS } = await import('./js/money.js');
    const { UPGRADES } = await import('./js/upgrades.js');
    const g = window.__game;
    const origDrop = g._dropMoney;
    g._dropMoney = () => {};
    // The bot can walk over a MAGNET pickup mid-test, and that sweeps the
    // whole floor - including the one orb this is measuring the radius with.
    // Held off for the duration rather than hoping it does not happen.
    const origVac = g.money.vacuum;
    g.money.vacuum = () => {};
    // THE PLAYER HAS TO STAND STILL, and the bot will not. This block
    // measures one distance - orb to player - and drops the orb at a fixed
    // offset from wherever the player happens to be: a bot that wanders
    // toward it covers the 1.2m of slack inside a second of game time and
    // drags the orb into the radius it exists to prove the orb ignores. The
    // bot is switched off, its keys cleared, and the player pinned to the
    // spot for the duration - the same wrap void.mjs pins with, plus a god
    // ring because with the bot gone the wave's cast is free to swing at a
    // player who cannot dodge.
    //
    // XZ ONLY. The floor under the player is whatever the generated layout
    // left there, and forcing y to 0 would pin them inside a platform's
    // geometry for the resolver to fight; the magnet reads XZ distance, so
    // the height is none of this test's business.
    g.autoTest = false;
    const p = g.player;
    for (const k of ['forward', 'back', 'left', 'right', 'jump', 'shoot', 'shootFresh',
      'aim', 'crouch', 'sprint', 'melee']) g.input[k] = false;
    const pinX = p.pos.x;
    const pinZ = p.pos.z;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => {
      origUpdate(...args);
      p.pos.x = pinX;
      p.pos.z = pinZ;
      p.health = p.maxHealth;
    };
    // Radius per tier, run through the upgrade's own apply() rather than a
    // copy of its formula - the point is that the CATALOGUE moves the radius,
    // so a retune there has to show up here.
    const radii = [];
    for (let n = 0; n <= 3; n++) {
      g.player.mods.magnetMult = 1;
      if (n > 0) UPGRADES.lodestone.apply(g.player.mods, n);
      radii.push(+g._magnetRadius().toFixed(3));
    }
    g.player.mods.magnetMult = 1;

    // And the radius does what it says: an orb just outside the base radius is
    // ignored, and the same orb is taken once a tier of Lodestone is owned.
    const drop = (d) => {
      g.money.clear();
      g.money.spawn({ x: pinX + d, y: 0.45, z: pinZ }, 40, 1, 0);
      // Land it before the test: a still-falling orb is not what is being
      // measured here.
      for (let i = 0; i < g.money.count; i++) {
        g.money.state[i] = 1;
        g.money.pos[i * 3] = pinX + d;
        g.money.pos[i * 3 + 1] = 0.42;
        g.money.pos[i * 3 + 2] = pinZ;
      }
    };
    // Seconds of GAME, for the reason the sweep above gives: the magnet pulls
    // an orb a distance per frame, so a wall-clock wait measures the host and
    // not the radius.
    const settle = async (seconds) => {
      await window.__simWait(seconds);
      return g.money.count;
    };
    const just_outside = BASE_MAGNET_RADIUS + 1.2;
    drop(just_outside);
    const ignored = await settle(0.9);
    UPGRADES.lodestone.apply(g.player.mods, 1);
    drop(just_outside);
    const taken = await settle(1.5);
    g.player.mods.magnetMult = 1;
    g.money.clear();
    p.update = origUpdate;
    g.autoTest = true;
    g._dropMoney = origDrop;
    g.money.vacuum = origVac;
    return { base: BASE_MAGNET_RADIUS, radii, ignored, taken };
  });
  check('the base radius is the base radius', magnet.radii[0] === magnet.base,
    `r=${magnet.radii[0]}`);
  check('Lodestone widens it in three rising tiers',
    magnet.radii[1] > magnet.radii[0]
    && magnet.radii[2] > magnet.radii[1]
    && magnet.radii[3] > magnet.radii[2],
    magnet.radii.join(' -> '));
  check('an orb outside the radius is left alone', magnet.ignored === 1,
    `left=${magnet.ignored}`);
  check('one tier of Lodestone reaches it', magnet.taken === 0,
    `left=${magnet.taken}`);

  // ---- kills drop money instead of paying it ----
  const kills = await page.evaluate(async () => {
    const g = window.__game;
    g.money.clear();
    // Stand the player somewhere the drops cannot fall into the magnet.
    let dropped = 0;
    const orig = g._dropMoney.bind(g);
    g._dropMoney = (pos, amount) => { dropped += amount; return orig(pos, amount); };
    const before = g.credits;
    g.wave = 2;
    g.enemies.forEach((e) => { e.dead = true; });
    g.queue.length = 0;
    g.waveState = 'idle';
    g.interT = 0.05;
    const alive = setInterval(() => { g.player.health = g.player.maxHealth; }, 40);
    // The killing has to keep happening WHILE the wait runs - the wave only
    // ends once everything it spawned is dead - so it stays on its own real
    // interval and the finish line is the one on the game clock.
    const sweep = setInterval(() => {
      for (const e of g.enemies) e.takeDamage(1e6, true, 0, 1);
    }, 100);
    await window.__simWait(15, () => g.waveState !== 'active' && g.wave === 3);
    clearInterval(sweep);
    clearInterval(alive);
    g._dropMoney = orig;
    return { dropped: +dropped.toFixed(2), duringWave: +(g.credits - before).toFixed(2) };
  });
  check('kills drop money', kills.dropped > 0, `dropped=$${kills.dropped}`);
  check('the balance only moves by collection',
    kills.duringWave <= kills.dropped + 0.5,
    `dropped=$${kills.dropped} gained=$${kills.duringWave}`);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(bad ? `MONEY TEST FAIL (${bad})` : 'MONEY TEST PASS');
process.exitCode = bad ? 1 : 0;
