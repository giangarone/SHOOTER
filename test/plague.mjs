// PLAGUE, end to end - the ninth theme built out.
//
// WHY THIS EXISTS
//   PLAGUE is the theme where CLEARING THE ROOM IS THE MISTAKE. Every other
//   theme rewards killing the thing in front of you; this one charges for it,
//   and all three of the types added here are about what happens AFTER
//   something has already been dealt with:
//
//     lesion    its rounds rot the floor where they LAND - hit or miss - so
//               the shots the player dodged are still on the ground behind
//               them
//     carrion   raises one body that dies near it, once each. Killing the
//               crowd in front of a carrion is what feeds it
//     bloatfly  bursts into gas however it dies, so shooting it out of the air
//               over your own head is a decision rather than a free kill
//
//   The lesion is the one that degrades silently: a round that only left a
//   puddle when it CONNECTED would be an ordinary gunner with a rider on it,
//   and nothing about the enemy would look wrong. So the headline assertion
//   here is a deliberate MISS.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8228;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const PLAGUE_TYPES = ['splitter', 'lesion', 'husk', 'vitriol', 'carrion', 'bloatfly'];

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const out = await page.evaluate(async (PLAGUE_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
    // SECONDS OF GAME, not a count of frames. The loop clamps dt at 0.05, so a
    // frame is worth 1/60s of game on an idle machine and up to 0.05s on a
    // loaded one - the same steps(n) simulates THREE TIMES more game on a slow
    // host. Anything whose meaning is a duration has to be waited for in this
    // unit or it silently changes what it is testing.
    const simSteps = async (seconds) => {
      const until = g.time + seconds;
      while (g.time < until) await step();
    };
    const res = {};

    g.autoTest = false;
    g.input.shoot = false;
    g.input.shootFresh = false;
    let px = 0;
    let pz = 0;
    let pinned = true;
    let god = true;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => {
      origUpdate(...args);
      if (pinned) p.pos.set(px, 0, pz);
      if (god) p.health = p.maxHealth;
    };

    const clean = () => {
      g.waveState = 'active';
      g.queue.length = 0;
      g.queue.push('chaser');
      g.spawnTimer = 1e6;
      g._clearEntities();
      g._clearHazards();
      g._mortars.forEach((m) => g.effects.markRelease(m.mark));
      g._mortars.length = 0;
      p.clearStatuses();
      g.input.forward = false;
      g.input.back = false;
      g.input.left = false;
      g.input.right = false;
      g.input.jump = false;
      g.input.sprint = false;
      g.input.crouch = false;
      g.input.moveF = 0;
      g.input.moveS = 0;
      pinned = true;
      god = true;
      p.health = p.maxHealth;
      p.invulnEnd = -1;
      p.wardReady = false;
      p.mods.dodgeChance = 0;
      px = 0;
      pz = 0;
    };
    const put = (type, x, z) => {
      g.spawnEnemy(type);
      const e = g.enemies[g.enemies.length - 1];
      e.pos.set(x, e.pos.y, z);
      return e;
    };
    const measure = async (frames, fn) => {
      god = false;
      p.health = p.maxHealth;
      p.invulnEnd = -1;
      const h0 = p.health;
      for (let i = 0; i < frames; i++) {
        await step();
        if (fn) fn(i);
      }
      const lost = +(h0 - p.health).toFixed(2);
      god = true;
      p.health = p.maxHealth;
      return lost;
    };

    {
      clean();
      res.emptyCost = await measure(80);
      clean();
    }

    // ---- 1. all six survive being alive ---------------------------------
    {
      clean();
      const built = {};
      const subjects = [];
      for (const t of PLAGUE_TYPES) {
        const e = put(t, 14, 14);
        subjects.push(e);
        built[t] = !!(e.group && e.group.children.length > 2);
      }
      // Two seconds of GAME. As 120 frames this was two seconds here and six
      // on CI, and six is long enough for the bloatfly to finish its dive and
      // burst - so the suite reported a type dying of its own documented
      // behaviour as a type that did not survive its AI.
      await simSteps(2);
      res.allBuilt = Object.values(built).every(Boolean);
      res.builtDetail = built;
      res.subjectsAlive = subjects.filter((e) => !e.dead).length;
      res.subjectsMade = subjects.length;
      clean();
    }

    // ---- 2. a lesion's MISSES rot the floor ------------------------------
    // THE HEADLINE. The player is invulnerable and pinned inside their own
    // spawn bubble; what is measured is bile on the ground, and a round that
    // only left a puddle where it CONNECTED would leave none of it.
    {
      clean();
      const e = put('lesion', 15, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let fired = 0;
      let bile = 0;
      for (let i = 0; i < 900; i++) {
        await step();
        e.pos.set(15, e.pos.y, 0);
        fired = Math.max(fired, g.projectiles.filter((x) => x.type === 'lesion').length);
        bile = Math.max(bile, g._hazard.filter((h) => h.kind === 'bile').length);
        if (bile >= 2) break;
      }
      res.lesionBurst = fired;
      res.lesionBile = bile;
      // And it is a POISON patch rather than one more pool: standing in it has
      // to put the chip on the HUD, which is what makes it a plague enemy
      // rather than a green blight.
      const h = g._hazard.find((x) => x.kind === 'bile');
      if (h) {
        e.dead = true;
        px = h.x;
        pz = h.z;
        await steps(20);
        res.lesionPoison = p.status.poison > 0;
      } else {
        res.lesionPoison = false;
      }
      clean();
    }

    // ---- 3. a carrion raises the dead -----------------------------------
    {
      clean();
      const car = put('carrion', 6, 0);
      car.speed = 0;
      const body = put('chaser', 7, 0);
      body.speed = 0;
      px = 0;
      pz = 0;
      await steps(40);
      const before = g.enemies.filter((x) => x.type === 'chaser' && !x.dead).length;
      body.dead = true;
      let raised = null;
      for (let i = 0; i < 200; i++) {
        await step();
        car.pos.set(6, car.pos.y, 0);
        raised = g.enemies.find((x) => x.revenant && !x.dead);
        if (raised) break;
      }
      res.carrionBefore = before;
      res.carrionRaised = !!raised;
      if (raised) {
        res.carrionType = raised.type;
        // AT A FRACTION OF THE BAR, and worth a fraction of the money - a body
        // that came back whole would be a carrion doubling the wave, and one
        // that paid full value would be a payout to farm.
        const fresh = window.__game.enemies.find((x) => x.type === 'chaser' && !x.revenant);
        res.carrionFrac = +(raised.maxHp / (fresh ? fresh.maxHp : raised.maxHp / 0.4)).toFixed(2);
      }
      // ...AND THE SAME BODY IS NEVER RAISED TWICE. The corpse is marked, so a
      // second carrion - or the same one on its next cooldown - walks past it.
      res.carrionMarked = !!body.raised;
      if (raised) {
        raised.dead = true;
        car.carCd = 0;
        await simSteps(2);
        res.carrionSecond = g.enemies.filter((x) => x.revenant && !x.dead).length;
      }
      clean();
    }

    // ---- 4. a bloatfly bursts however it dies ----------------------------
    {
      // Shot down: the cloud is over where it was, which is the player's
      // problem if they shot it overhead.
      clean();
      const e = put('bloatfly', 2, 0);
      await steps(20);
      e.takeDamage(1e6);
      await steps(20);
      res.bloatShotGas = g._hazard.filter((h) => h.kind === 'gas').length;
      clean();
      // ...and left alone, it comes down on its own and bursts there.
      const e2 = put('bloatfly', 5, 0);
      let dived = false;
      for (let i = 0; i < 900; i++) {
        await step();
        if (e2.diving) dived = true;
        if (dived && e2.dead) break;
      }
      res.bloatDived = dived;
      await steps(20);
      res.bloatDiveGas = g._hazard.filter((h) => h.kind === 'gas').length;
      clean();
    }

    await steps(30);
    return res;
  }, PLAGUE_TYPES);

  ok('an empty arena costs nothing', out.emptyCost === 0, `lost=${out.emptyCost}`);
  ok('every PLAGUE type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('a lesion fires a burst', out.lesionBurst > 1, `in the air at once=${out.lesionBurst}`);
  ok('and its MISSES rot the floor anyway', out.lesionBile >= 2, `patches=${out.lesionBile}`);
  ok('and the rot is poison, so the HUD says why', out.lesionPoison);

  ok('a carrion raises a body that dies near it', out.carrionRaised, `as ${out.carrionType}`);
  ok('and it comes back at a fraction of its bar',
    out.carrionFrac > 0.2 && out.carrionFrac < 0.6, `frac=${out.carrionFrac}`);
  ok('and the corpse is marked so it is never raised twice',
    out.carrionMarked && out.carrionSecond === 0, `second=${out.carrionSecond}`);

  ok('a bloatfly shot out of the air leaves its gas there',
    out.bloatShotGas > 0, `clouds=${out.bloatShotGas}`);
  ok('and one left alone dives and bursts on the floor',
    out.bloatDived && out.bloatDiveGas > 0, `dived=${out.bloatDived} clouds=${out.bloatDiveGas}`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `PLAGUE TEST FAIL (${fails})` : 'PLAGUE TEST PASS');
process.exitCode = fails ? 1 : 0;
