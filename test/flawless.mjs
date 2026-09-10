// The flawless streak - the run's only credit multiplier.
//
// The kill chain used to multiply every bounty by up to three, which made the
// most profitable way to play HOARDING a wave and then clearing it in one
// chain: a strategy of not shooting things, in a shooter. What replaces it is
// paid for not being hit, and four properties are what make that a fair trade.
// None of them are visible to the smoke test, and three of them fail SILENTLY
// - as money that is quietly wrong rather than as an error.
//
//   the curve is the curve      a quarter a wave, hard-capped at three, and
//                               the stored count never runs past the cap
//   a hit costs it immediately  not at the wave clear - the rest of the wave
//                               is paid at 1x, and EVERY damage path breaks
//                               it, a hazard tick as much as a body
//   it is paid on the drop      the orbs that land are already worth the
//                               multiplier, so money already on the floor is
//                               never revalued by what happens next
//   it belongs to the player    in versus a streak follows its owner onto the
//                               bench and comes back with them, and the other
//                               player's streak is untouched by it
//
// Plus the shower this all pays for: the flawless bonus is thrown at the
// player's OWN FEET, inside the magnet radius, and before the hold in
// MoneyOrbs.spawn it was collected on its first frame and never seen at all.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8223;
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

  // ---- the curve, and where it stops ----
  const curve = await page.evaluate(() => {
    const g = window.__game;
    const out = [];
    for (let n = 0; n <= 12; n++) {
      g.player.flawlessStreak = n;
      out.push(+g.flawlessMult().toFixed(4));
    }
    g.player.flawlessStreak = 0;
    return out;
  });
  check('a clean wave is worth a quarter', curve[1] === 1.25, `x${curve[1]}`);
  check('and they add up', curve[2] === 1.5 && curve[3] === 1.75 && curve[4] === 2,
    curve.slice(1, 5).map((m) => 'x' + m).join(' '));
  check('eight clean waves reach the cap', curve[8] === 3, `x${curve[8]}`);
  check('and nothing goes past it', curve.slice(8).every((m) => m === 3),
    curve.slice(8).map((m) => 'x' + m).join(' '));

  // ---- a drop is paid at the multiplier, once ----
  const paid = await page.evaluate(() => {
    const g = window.__game;
    const at = { x: 0, y: 0.5, z: 0 };
    const sum = () => {
      let s = 0;
      for (let i = 0; i < g.money.count; i++) s += g.money.value[i];
      return +s.toFixed(4);
    };
    const midas = g.player.mods.creditMult;
    g.player.mods.creditMult = 1;
    const out = [];
    for (const n of [0, 2, 8]) {
      g.player.flawlessStreak = n;
      g.money.clear();
      g._dropMoney(at, 100);
      out.push({ n, dropped: sum() });
    }
    // AND MIDAS RIDES ON TOP, rather than replacing it.
    g.player.mods.creditMult = 2;
    g.player.flawlessStreak = 2;
    g.money.clear();
    g._dropMoney(at, 100);
    const both = sum();
    g.player.mods.creditMult = midas;
    g.player.flawlessStreak = 0;
    g.money.clear();
    return { out, both };
  });
  check('a drop with no streak is the bare bounty', paid.out[0].dropped === 100,
    `$${paid.out[0].dropped}`);
  check('a streak is paid onto the floor, not at collection',
    paid.out[1].dropped === 150 && paid.out[2].dropped === 300,
    `x1.5 -> $${paid.out[1].dropped}, x3 -> $${paid.out[2].dropped}`);
  check('Midas multiplies the streak rather than replacing it', paid.both === 300,
    `$${paid.both}`);

  // ---- every damage path breaks it, and breaks it at once ----
  const hits = await page.evaluate(async () => {
    const g = window.__game;
    const p = g.player;
    const out = {};
    // A body or a shot.
    p.flawlessStreak = 5;
    p.health = 500;
    p.maxHealth = 500;
    g._hurtPlayer(10, p.pos, null);
    out.byDamage = p.flawlessStreak;
    // Read HERE, on the frame of the hit: the multiplier is gone with it and
    // not at the wave clear, which is the whole of what "immediately" means.
    out.multAfter = g.flawlessMult();
    // A hazard tick - standing in fire is being hit.
    p.flawlessStreak = 5;
    g._hurtPlayerDot(5);
    out.byHazard = p.flawlessStreak;
    // A hit that lands for nothing must not cost the streak: the FLAWLESS
    // banner is decided on the same number, and the two have to agree.
    p.flawlessStreak = 5;
    p.lastDamageTaken = 0;
    g._noteDamage();
    out.byNothing = p.flawlessStreak;
    p.flawlessStreak = 0;
    return out;
  });
  check('a body or a bullet takes the streak', hits.byDamage === 0, `streak=${hits.byDamage}`);
  check('so does standing in fire', hits.byHazard === 0, `streak=${hits.byHazard}`);
  check('a hit for zero does not', hits.byNothing === 5, `streak=${hits.byNothing}`);
  check('and the multiplier goes with it, immediately', hits.multAfter === 1,
    `x${hits.multAfter}`);

  // ---- the shower is SEEN. ----
  //
  // Thrown at the player's own feet and inside their magnet, so without the
  // hold every orb is claimed on frame one. The test is simply that a second
  // later they are still lying there.
  const shower = await page.evaluate(async () => {
    const g = window.__game;
    g.money.clear();
    // The wave-clear path exactly: dropped at the player, held, then swept.
    g._dropMoney(g.player.pos, 300, 8, 5.5, 0.5);
    const spawned = g.money.count;
    // A QUARTER-SECOND OF GAME, not of wall time - see __simWait in
    // js/main.js. Both halves of this trial are frame-driven: the hold is
    // counted down per frame and the magnet pulls per frame, so on a loaded
    // host a quarter of a real second is one or two frames. The held drop
    // passed for the wrong reason (nothing had moved yet) and the UNHELD one
    // failed outright, which is what made this the suite's flakiest check.
    //
    // The full quarter-second is waited out rather than short-circuited: what
    // is being asserted is where the orbs are AT that moment, so stopping
    // early would be measuring a different moment.
    await window.__simWait(0.25);
    const midArc = g.money.count;
    // Airborne, and none of it has been claimed - state 2 is HOME.
    let pulled = 0;
    for (let i = 0; i < g.money.count; i++) if (g.money.state[i] === 2) pulled++;
    g.money.clear();
    // AND THE SAME DROP WITHOUT THE HOLD, which is what this used to be.
    g._dropMoney(g.player.pos, 300, 8, 5.5);
    await window.__simWait(0.25);
    const unheld = g.money.count;
    g.money.clear();
    return { spawned, midArc, pulled, unheld };
  });
  check('the shower is eight orbs', shower.spawned === 8, `orbs=${shower.spawned}`);
  check('THE SHOWER IS STILL THERE A QUARTER-SECOND LATER',
    shower.midArc === shower.spawned,
    `${shower.spawned} -> ${shower.midArc}`);
  check('and the magnet has not touched it', shower.pulled === 0,
    `homing=${shower.pulled}`);
  check('without the hold it is gone, which is the bug', shower.unheld < shower.spawned,
    `${shower.spawned} -> ${shower.unheld}`);

  // ---- and it is a per-PLAYER streak ----
  //
  // The counter lives on Player precisely so the versus snapshot carries it
  // without anyone having to remember to name it. This is that guarantee.
  const vs = await page.evaluate(async () => {
    const g = window.__game;
    const mod = await import('./js/versus.js');
    g.player.flawlessStreak = 4;
    const snap = mod.captureRun(g);
    // Somebody else's turn, on a streak of their own.
    g.player.flawlessStreak = 1;
    const other = g.flawlessMult();
    mod.restoreRun(g, snap);
    const back = g.player.flawlessStreak;
    g.player.flawlessStreak = 0;
    return { carried: snap.player.flawlessStreak, cached: snap.flawlessMult, other, back };
  });
  check('a snapshot carries the streak', vs.carried === 4, `streak=${vs.carried}`);
  check('and caches the multiplier the bench cannot compute', vs.cached === 2,
    `x${vs.cached}`);
  check("the other player's streak is their own", vs.other === 1.25, `x${vs.other}`);
  check('and the first player gets theirs back', vs.back === 4, `streak=${vs.back}`);

  // ---- and the HUD says so ----
  //
  // Through _updateHud rather than by calling the Ui method, because the wiring
  // between them is the part that can rot: a readout nothing feeds is a readout
  // that is always right in a unit test and always blank on screen.
  const hud = await page.evaluate(() => {
    const g = window.__game;
    const el = document.getElementById('flawless');
    const read = () => ({ shown: !el.classList.contains('hidden'), text: el.textContent });
    const out = {};
    g.player.flawlessStreak = 0;
    g._updateHud();
    out.atOne = read();
    g.player.flawlessStreak = 6;
    g._updateHud();
    out.onStreak = read();
    // A hit takes it off the frame, on the frame.
    g.player.lastDamageTaken = 5;
    g._noteDamage();
    g._updateHud();
    out.afterHit = read();
    g.player.flawlessStreak = 0;
    return out;
  });
  check('x1 shows nothing at all', !hud.atOne.shown, `shown=${hud.atOne.shown}`);
  check('a streak is on the frame, beside the balance',
    hud.onStreak.shown && hud.onStreak.text === 'FLAWLESS x2.5',
    `"${hud.onStreak.text}"`);
  check('and a hit takes it off the frame', !hud.afterHit.shown,
    `shown=${hud.afterHit.shown}`);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(bad ? `FLAWLESS TEST FAIL (${bad})` : 'FLAWLESS TEST PASS');
process.exitCode = bad ? 1 : 0;
