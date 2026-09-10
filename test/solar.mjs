// SOLAR, end to end - the tenth and last theme built out.
//
// WHY THIS EXISTS
//   SOLAR is the theme that attacks the INTERFACE. Everything else in the game
//   takes health, ground or position; three of these four take the two things
//   the player aims with - their sight and their shots - and one of them gives
//   the shots back pointed the wrong way:
//
//     zealot  detonates in a blinding flash when it dies, and only when the
//             player is close. The whole enemy is the decision about range
//     aegis   a mirror that reflects what is fired into it until the plate
//             breaks, worn down by the COUNT of rounds rather than by damage
//     lens    a burning line walked toward the player. Outrun, never dodged
//     halo    takes the crosshair and the hit markers away inside its field
//
//   Two of those reach into the presentation layer, which is why every one of
//   them is asserted as a PAIR: the flash fired close AND did not fire far,
//   the HUD went inside the field AND came back outside it, the plate turned
//   the shot AND stopped turning it once it was spent. A blind that could not
//   be got out of, or a crosshair that never came back, would not look like a
//   bug in an enemy - it would look like a bug in the game.
import puppeteer from 'puppeteer-core';
import { CHROME, startServer } from './harness.mjs';

const PORT = 8229;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const SOLAR_TYPES = ['zealot', 'sniper', 'aegis', 'lens', 'halo', 'shrike'];

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
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const out = await page.evaluate(async (SOLAR_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const { ENEMY_TYPES } = await import('./js/enemy.js');
    const THREE = await import('three');
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
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
      g.rig._blindT = 0;
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
      for (const t of SOLAR_TYPES) {
        const e = put(t, 15, 15);
        subjects.push(e);
        built[t] = !!(e.group && e.group.children.length > 2);
      }
      await steps(120);
      res.allBuilt = Object.values(built).every(Boolean);
      res.builtDetail = built;
      res.subjectsAlive = subjects.filter((e) => !e.dead).length;
      res.subjectsMade = subjects.length;
      clean();
    }

    // ---- 2. the zealot's flash is a decision about RANGE -----------------
    {
      const blindAt = async (dist) => {
        clean();
        const e = put('zealot', dist, 0);
        e.speed = 0;
        await steps(6);
        e.pos.set(dist, e.pos.y, 0);
        e.takeDamage(1e6);
        await steps(3);
        return +g.rig._blindT.toFixed(2);
      };
      res.blindClose = await blindAt(1.2);
      res.blindFar = await blindAt(19);
      clean();
      // ...and it GOES. A blind that did not run out would not read as an
      // enemy at all, it would read as the game having broken.
      const e = put('zealot', 1.2, 0);
      e.speed = 0;
      await steps(6);
      e.pos.set(1.2, e.pos.y, 0);
      e.takeDamage(1e6);
      // THE PEAK ACROSS THE WHOLE BLIND, not a sample a fixed number of frames
      // in. The white holds for the first third of the duration and then
      // fades, and on a loaded machine three frames can be most of that hold -
      // so a single reading is a race with the frame rate, which is exactly
      // how this suite failed once inside a long chain and never on its own.
      let peak = 0;
      for (let i = 0; i < 300; i++) {
        await step();
        peak = Math.max(peak, g.rig.flash);
        if (g.rig._blindT <= 0) break;
      }
      res.blindPeak = +peak.toFixed(2);
      res.blindCleared = g.rig._blindT <= 0;
      clean();
    }

    // ---- 3. the aegis turns the shot until the plate is spent -------------
    // Driven through the REAL trigger - g.shoot() - rather than by calling the
    // reflect test directly, because what is being asserted is the wiring
    // through _firePellet as much as the arc itself.
    {
      clean();
      p.yaw = 0;
      p.pitch = 0;
      const e = put('aegis', 0, -6);
      e.speed = 0;
      await steps(10);
      e.pos.set(0, e.pos.y, -6);
      const hp0 = e.hp;
      const plate0 = e.plateHp;
      // COUNTED BY IDENTITY, not by the length of the list. A reflected round
      // is spawned six metres from the player and reaches them in about three
      // tenths of a second, so a before/after count over a ten-frame window
      // can see one spawn and the previous one expire and conclude that
      // nothing happened - which is exactly what the first version did.
      const seen = new Set();
      let shots = 0;
      // Enough shots to break an eight-hit plate twice over.
      // WAITS FOR THE SHOT TO ACTUALLY FIRE, rather than counting frames.
      // shoot() respects the weapon's rate of fire and silently refuses a pull
      // that is too soon - the first version called it every other frame,
      // landed five of twenty-four, and concluded the plate did not wear down.
      // A fixed ten frames fixed that on an idle machine and was still a race
      // with the frame rate on a busy one, so the loop now retries until the
      // magazine actually moves.
      for (let i = 0; i < 24; i++) {
        p.reserveAmmo = 300;
        let fired = false;
        for (let f = 0; f < 40 && !fired; f++) {
          p.mag = 30;
          e.pos.set(0, e.pos.y, -6);
          g.shoot();
          if (p.mag < 30) fired = true;
          await step();
          for (const pr of g.projectiles) {
            if (pr.type === 'aegis') seen.add(pr);
          }
        }
        if (!fired) break;
        shots++;
        // A few frames after the shot so the reflected round exists to be seen.
        for (let f = 0; f < 6; f++) {
          await step();
          for (const pr of g.projectiles) {
            if (pr.type === 'aegis') seen.add(pr);
          }
        }
        if (e.plateHp <= 0) break;
      }
      res.aegisPlateNow = e.plateHp;
      res.aegisDead = e.dead;
      res.aegisHp = Math.round(e.hp);
      res.aegisHp0 = Math.round(hp0);
      res.aegisProj = g.projectiles.map((x) => x.type).join(',');
      res.aegisPlate0 = plate0;
      res.aegisReflected = seen.size;
      res.aegisShots = shots;
      // WHILE THE PLATE HELD, NOTHING GOT THROUGH.
      // WHAT THE PLATE WAS WORTH, measured as a PAIR against the same number of
      // shots once it is gone - not as "nothing got through at all", which was
      // the first version and was simply wrong. The plate is a FACING and the
      // gun has a cone: some pellets land on the body beside the mirror, and
      // they are supposed to. What the enemy promises is that shooting AT the
      // plate is a bad trade, and that is a comparison rather than an absolute.
      res.aegisPlatedLoss = +(hp0 - e.hp).toFixed(1);
      res.aegisPlateSpent = e.plateHp <= 0;
      // ...and now the same shot lands.
      // TEN FRAMES AGAIN, for the fire rate - a follow-up shot fired three
      // frames after the last one is a trigger pull the weapon refuses.
      // The same shots again with the mirror gone, so the two runs are
      // comparable: the same weapon, the same range, the same count.
      const hp1 = e.hp;
      for (let i = 0; i < shots; i++) {
        let fired = false;
        for (let f = 0; f < 40 && !fired; f++) {
          p.mag = 30;
          p.reserveAmmo = 300;
          e.pos.set(0, e.pos.y, -6);
          g.shoot();
          if (p.mag < 30) fired = true;
          await step();
        }
        if (!fired || e.dead) break;
      }
      res.aegisBareLoss = +(hp1 - e.hp).toFixed(1);
      res.aegisThroughAfter = e.hp < hp1;
      // The arc, checked directly: a hit that arrived from BEHIND is not on
      // the mirror, and there is no way to ask that through a live shot -
      // the enemy turns to face the player, so its back is never presented.
      // A FRESH ONE, and the bearing derived from where it actually stands.
      //
      // Both halves of that were bugs. The probe used to reuse the enemy the
      // two shooting loops had just been firing at - which, on a machine slow
      // enough to let every one of those shots land, was a CORPSE by the time
      // the probe ran: the body had been handed to the corpse pool and thrown
      // apart, so the plate mesh was four metres away in the wrong direction
      // and the arc read backwards. And the bearing was hardcoded as "the
      // player is at +z from it", which was true when the block started and
      // false after a brute had been walking through two loops.
      const probe = put('aegis', 0, -6);
      probe.speed = 0;
      await steps(8);
      probe.pos.set(0, probe.pos.y, -6);
      await steps(2);
      const ax = px - probe.pos.x;
      const az = pz - probe.pos.z;
      const am = Math.hypot(ax, az) || 1;
      probe.plateHp = 8;
      res.aegisProbeAlive = !probe.dead && g.enemies.includes(probe);
      // A round from the player travels the OTHER way down that line.
      res.aegisArcFront = ENEMY_TYPES.aegis.reflect(probe, -ax / am, -az / am, null);
      res.aegisArcBack = ENEMY_TYPES.aegis.reflect(probe, ax / am, az / am, null);
      clean();
    }

    // ---- 4. the lens walks a line, it does not drop one -------------------
    {
      clean();
      const e = put('lens', 16, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let first = null;
      let last = null;
      let glare = 0;
      for (let i = 0; i < 700; i++) {
        await step();
        e.pos.set(16, e.pos.y, 0);
        if (e.lensX !== undefined) {
          if (first === null) first = Math.hypot(e.lensX - px, e.lensZ - pz);
          last = Math.hypot(e.lensX - px, e.lensZ - pz);
        }
        glare = Math.max(glare, g._hazard.filter((h) => h.kind === 'glare').length);
        if (glare > 4 && last !== null && last < 2) break;
      }
      res.lensGlare = glare;
      res.lensClosedIn = first !== null && last !== null && last < first - 4;
      res.lensFirst = first === null ? -1 : +first.toFixed(1);
      res.lensLast = last === null ? -1 : +last.toFixed(1);
      clean();
    }

    // ---- 5. the halo takes the crosshair, and gives it back ---------------
    {
      clean();
      const e = put('halo', 4, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let inside = false;
      for (let i = 0; i < 300; i++) {
        await step();
        e.pos.set(4, e.pos.y, 0);
        if (document.body.classList.contains('hudblind')) { inside = true; break; }
      }
      res.haloBlinds = inside;
      // OUT OF THE FIELD AND IT COMES BACK. Same refresh-and-lapse contract the
      // conduit's buff keeps - there is no state to get stuck on, and this is
      // the assertion that proves it.
      px = 19;
      pz = 0;
      let back = false;
      for (let i = 0; i < 200; i++) {
        await step();
        e.pos.set(4, e.pos.y, 0);
        if (!document.body.classList.contains('hudblind')) { back = true; break; }
      }
      res.haloReleases = back;
      // ...and killing it releases it too, which is the same lapse from the
      // other end.
      px = 4.5;
      pz = 0;
      for (let i = 0; i < 200; i++) {
        await step();
        e.pos.set(4, e.pos.y, 0);
        if (document.body.classList.contains('hudblind')) break;
      }
      e.dead = true;
      let freed = false;
      for (let i = 0; i < 200; i++) {
        await step();
        if (!document.body.classList.contains('hudblind')) { freed = true; break; }
      }
      res.haloDeathReleases = freed;
      // And it costs no health at all - the whole enemy is the readout.
      const e2 = put('halo', 4, 0);
      e2.speed = 0;
      px = 0;
      pz = 0;
      res.haloCost = await measure(60, () => { e2.pos.set(4, e2.pos.y, 0); });
      clean();
    }

    document.body.classList.remove('hudblind');
    await steps(30);
    return res;
  }, SOLAR_TYPES);

  ok('an empty arena costs nothing', out.emptyCost === 0, `lost=${out.emptyCost}`);
  ok('every SOLAR type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('a zealot killed close blinds the player', out.blindClose > 0.3, `t=${out.blindClose}s`);
  ok('and one killed across the room does not', out.blindFar === 0, `t=${out.blindFar}s`);
  ok('and the blind is a real white-out', out.blindPeak > 0.85, `flash=${out.blindPeak}`);
  ok('and it runs out on its own', out.blindCleared);

  ok('an aegis turns the shots fired into its plate',
    out.aegisReflected > 0,
    `${out.aegisReflected} of ${out.aegisShots} shots came back; plate ${out.aegisPlate0}->${out.aegisPlateNow} hp ${out.aegisHp0}->${out.aegisHp} dead=${out.aegisDead} air=[${out.aegisProj}]`);
  ok('and the plate is worth most of what is fired at it',
    out.aegisBareLoss > out.aegisPlatedLoss * 2,
    `plated lost ${out.aegisPlatedLoss}hp, bare lost ${out.aegisBareLoss}hp over the same shots`);
  ok('the plate is spent by the rounds that land on it',
    out.aegisPlateSpent, `started at ${out.aegisPlate0}`);
  ok('and then the same shot lands', out.aegisThroughAfter);
  ok('the mirror is a FACING: front reflects, back does not',
    out.aegisArcFront === true && out.aegisArcBack === false,
    `front=${out.aegisArcFront} back=${out.aegisArcBack} alive=${out.aegisProbeAlive}`);

  ok('a lens burns a line across the floor', out.lensGlare > 4, `patches=${out.lensGlare}`);
  ok('and the line WALKS toward the player rather than landing on them',
    out.lensClosedIn, `${out.lensFirst}m -> ${out.lensLast}m`);

  ok('a halo takes the crosshair inside its field', out.haloBlinds);
  ok('and walking out of the field gives it back', out.haloReleases);
  ok('and so does killing it', out.haloDeathReleases);
  ok('and it costs no health at all', out.haloCost === 0, `lost=${out.haloCost}`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `SOLAR TEST FAIL (${fails})` : 'SOLAR TEST PASS');
process.exitCode = fails ? 1 : 0;
