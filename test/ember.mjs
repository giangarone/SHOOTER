// EMBER, end to end - the first of the ten themes to be built out.
//
// WHY THIS EXISTS
//   Every one of these four is a stat block plus a hook somewhere else, and
//   each hook is a place the wiring can be cut with nothing thrown: the enemy
//   still walks, it still looks right, and its whole reason for existing
//   silently never happens.
//
//     flare     a Spit of a THIRD kind, whose _land opens a fan of three
//               rather than one patch - a new branch in a class that had one
//               shape for its whole life
//     kiln      steps its bearing on Music.pulse and writes its OWN yaw, which
//               means it depends on the faceLocked escape hatch added to
//               Enemy.update for it
//     bellows   sets a flag on OTHER enemies that landHit reads - the only
//               mechanic in the game where one enemy changes what a different
//               enemy's contact does
//     ashwing   a flier with no attack at all, whose entire threat is a
//               HAZARD_KINDS row and a heading it freezes at the end of a tell
//
//   Three of the four also lay into the new `ember` hazard kind, which exists
//   precisely so a kiln's bar and an ashwing's line are not evicted by the
//   magma trail sharing the wave with them. A cap that silently reverted to
//   `lava` would look completely normal and quietly break both.
//
// WHAT IS ASSERTED
//   1. All four build a model and survive frames of AI without throwing.
//   2. The flare's shell bursts into a FAN - more than one patch, spread.
//   3. The kiln plants, sweeps, and lays ember patches around itself.
//   4. A bellows lights its neighbours, and the light goes out when it dies.
//   5. An enemy lit by a bellows burns the player on contact.
//   6. The ashwing runs, lays a LINE, and cannot steer once committed.
//   7. Ember patches never evict the magma's lava, which is the whole reason
//      the kind was separated.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8217;
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

const EMBER_TYPES = ['cinder', 'magma', 'flare', 'kiln', 'bellows', 'ashwing'];

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

  const out = await page.evaluate(async (EMBER_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
    const res = {};

    // The bot fights, which would kill every subject before it acted. Pinned
    // from inside player.update - the one place guaranteed to run before the
    // enemies read the position in the same frame - as test/afflict.mjs does.
    g.autoTest = false;
    g.input.shoot = false;
    g.input.shootFresh = false;
    let px = 0;
    let pz = 0;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => { origUpdate(...args); p.pos.set(px, 0, pz); };

    const clean = () => {
      // The wave is parked. Clearing one wipes every lingering zone, which is
      // correct in the game and fatal here - every subject is spawned by hand.
      // THE WAVE IS PARKED, AND PARKING IT TAKES BOTH HALVES.
      //
      // 'idle' stops the current wave, and then the machinery starts the NEXT
      // one a moment later - which in a themed game means six fresh
      // specialists of whatever theme was dealt, spawning into the middle of a
      // measurement. That is not hypothetical: it is what made a bramblehide
      // sixteen metres away appear to deal damage, when what had actually
      // happened was a sporegun wandering in and sprouting a seed underfoot.
      //
      // 'active' with one enemy in the queue that never arrives is what
      // actually holds it: the wave cannot complete (an empty queue and no
      // enemies would complete it, and completing clears every zone in the
      // arena), and it cannot spawn either.
      g.waveState = 'active';
      g.queue.length = 0;
      g.queue.push('chaser');
      g.spawnTimer = 1e6;
      g._clearEntities();
      p.clearStatuses();
      p.health = 1e6;
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
    const kinds = (k) => g._hazard.filter((h) => h.kind === k);

    // ---- 1. all four survive being alive --------------------------------
    // The cheapest and most valuable check in the file: a typo in a build() or
    // an ai() is a wave-30 crash, and this is where it should be found.
    {
      clean();
      const built = {};
      // Held by reference. Counting g.enemies would measure the arena rather
      // than the subjects - the wave machinery is parked but not gagged, and
      // anything else that wanders in is not what this check is about.
      const subjects = [];
      for (const t of EMBER_TYPES) {
        const e = put(t, 6, 6);
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

    // ---- 2. the flare's shell bursts into a fan -------------------------
    {
      clean();
      const e = put('flare', 9, 0);
      e.attackCd = 0;
      // Given a long enough leash for the orbit to settle, throw, and land.
      for (let i = 0; i < 900 && kinds('ember').length === 0; i++) await step();
      const pat = kinds('ember');
      res.flarePatches = pat.length;
      // Spread, not stacked: the fan's arms have to be in different places or
      // it is one patch drawn three times.
      let maxSep = 0;
      for (const a of pat) {
        for (const b of pat) {
          maxSep = Math.max(maxSep, Math.hypot(a.x - b.x, a.z - b.z));
        }
      }
      res.flareSpread = +maxSep.toFixed(2);
      clean();
    }

    // ---- 3. the kiln plants and sweeps ----------------------------------
    {
      clean();
      const e = put('kiln', 8, 0);
      const seen = [];
      for (let i = 0; i < 900; i++) {
        await step();
        if (e.kilnAngle !== undefined) seen.push(e.kilnAngle);
        if (kinds('ember').length >= 3) break;
      }
      res.kilnPlanted = e.kilnAngle !== undefined;
      // The bearing has to actually MOVE, or the bar is painting one stripe.
      res.kilnTurned = seen.length > 1 && Math.abs(seen[seen.length - 1] - seen[0]) > 0.01;
      const pat = kinds('ember');
      res.kilnPatches = pat.length;
      // Every patch it lays sits out at its reach, not under its feet.
      res.kilnReach = pat.length
        ? +Math.min(...pat.map((h) => Math.hypot(h.x - e.pos.x, h.z - e.pos.z))).toFixed(1)
        : -1;
      clean();
    }

    // ---- 4/5. a bellows lights the crowd, and a lit enemy burns you ------
    {
      clean();
      // PINNED. A bellows ORBITS - it holds nine metres off the player - and
      // its subject chases to zero, so left to themselves the two drift to
      // nine metres apart and out of the eight-metre range. That is correct
      // behaviour in a wave, where a bellows sits behind a crowd that is
      // coming at you from every bearing, and useless in a two-body test: it
      // made this check pass or fail on where the orbit happened to be. Speed
      // zero parks it on the line the chaser walks in on.
      const bell = put('bellows', 1.5, 0);
      bell.speed = 0;
      const chas = put('chaser', 5, 0);
      await steps(60);
      res.litWhileAlive = chas.igniteT > 0;
      res.litRange = +Math.hypot(chas.pos.x - bell.pos.x, chas.pos.z - bell.pos.z).toFixed(1);

      // A contact hit from the LIT enemy has to arrive burning. Walked onto it
      // rather than faked, so landHit is what is actually being measured.
      px = chas.pos.x;
      pz = chas.pos.z;
      for (let i = 0; i < 400 && !p.hasStatus('fire'); i++) await step();
      res.litBurns = p.hasStatus('fire');

      // ...and the light goes out with the bellows. This is the reason to
      // shoot it, so it is the half worth asserting hardest.
      p.clearStatuses();
      px = 0;
      pz = 0;
      bell.dead = true;
      await steps(60);
      // Only meaningful if it was lit in the first place - otherwise this
      // passes for free on a bellows that never worked at all.
      res.unlitAfterDeath = res.litWhileAlive && !(chas.igniteT > 0);
      clean();
    }

    // ---- 6. the ashwing commits to a run and lays a line -----------------
    {
      clean();
      const e = put('ashwing', 14, 0);
      let ranAt = -1;
      let heading = null;
      let steered = 0;
      const trail = [];
      let wasRunning = false;
      // MEASURED OVER THE WHOLE RUN, not up to the first few patches. The
      // first pass broke as soon as four had landed, which sampled the first
      // half-second of a two-second pass and then asked whether it looked like
      // a line - it is four patches a metre apart at that point, which is a
      // cluster by any measure and a line by none.
      for (let i = 0; i < 2000; i++) {
        await step();
        const running = !!(e.aw && e.aw.state === 'run');
        if (running) {
          if (ranAt < 0) {
            ranAt = i;
            heading = { x: e.aw.hx, z: e.aw.hz };
          } else {
            // IT CANNOT STEER. The frozen heading must not drift by so much as
            // a rounding error while the run is live - that is the entire
            // counterplay.
            steered = Math.max(steered, Math.abs(e.aw.hx - heading.x) + Math.abs(e.aw.hz - heading.z));
          }
          trail.push({ x: e.pos.x, z: e.pos.z });
          wasRunning = true;
        } else if (wasRunning) {
          break;   // the run is over; measure what it drew
        }
      }
      res.ashwingRan = ranAt >= 0;
      res.ashwingSteered = +steered.toFixed(4);
      const pat = kinds('ember');
      res.ashwingPatches = pat.length;

      // A LINE has two properties and length is only the first of them.
      let span = 0;
      let ends = null;
      for (const a of pat) {
        for (const b of pat) {
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          if (d > span) { span = d; ends = [a, b]; }
        }
      }
      res.ashwingSpan = +span.toFixed(1);
      // The second, and the one that actually says "line": every patch sits on
      // the segment between the two furthest apart. A cluster fails this and a
      // long lazy curve fails it too, which is right - if the ashwing could
      // steer, this is the check that would catch it even with the heading
      // test above passing.
      let bow = 0;
      if (ends && span > 0.01) {
        const [p0, p1] = ends;
        const ux = (p1.x - p0.x) / span;
        const uz = (p1.z - p0.z) / span;
        for (const h of pat) {
          bow = Math.max(bow, Math.abs((h.x - p0.x) * uz - (h.z - p0.z) * ux));
        }
      }
      res.ashwingBow = +bow.toFixed(2);
      clean();
    }

    // ---- 7. ember never evicts lava -------------------------------------
    // The whole reason `ember` is its own HAZARD_KINDS row. If the kind were
    // dropped back to 'lava', a magma sharing the wave would be evicting the
    // kiln's bar and the ashwing's line continuously and every one of these
    // mechanics would read as broken.
    {
      clean();
      put('magma', 4, 0);
      put('kiln', 8, 2);
      put('ashwing', 12, -3);
      let peakLava = 0;
      let peakEmber = 0;
      for (let i = 0; i < 1200; i++) {
        await step();
        peakLava = Math.max(peakLava, kinds('lava').length);
        peakEmber = Math.max(peakEmber, kinds('ember').length);
        if (peakLava >= 3 && peakEmber >= 3) break;
      }
      res.bothKindsCoexist = peakLava >= 2 && peakEmber >= 2;
      res.peakLava = peakLava;
      res.peakEmber = peakEmber;
      clean();
    }

    // ---- 8. the Forge-Tyrant --------------------------------------------
    // The fight is an inversion of the Colossus: the window is not on a clock,
    // the boss earns its way to one by heating up and then has to STOP. Three
    // things have to hold or it is just a damage sponge - the heat has to
    // climb, the vent has to happen on its own, and the armour has to actually
    // come off while it does.
    {
      clean();
      g.setTheme('ember');
      const f = put('forge', 10, 0);
      await steps(20);
      const bs = f.bs;
      res.forgeHeats = false;
      res.forgeVented = false;
      res.forgeSwept = false;
      res.forgeArmorShut = -1;
      res.forgeArmorOpen = -1;
      // Read through the TYPE's own armor(), which is what takeDamage calls -
      // asserting on bs.venting instead would still pass if those two had come
      // apart, and that gap is exactly the bug worth catching here. An Enemy
      // holds no reference to its own type block, so it comes off the module.
      const TYPES = (await import('./js/enemy.js')).ENEMY_TYPES;
      const armorNow = () => {
        const A = TYPES.forge.armor;
        return A ? A(f) : -1;
      };
      res.forgeArmorShut = armorNow();
      res.doorShutX = +f.doorL.position.x.toFixed(3);
      const h0 = bs.heat;
      // Cheat the clock rather than waiting a quarter-hour of game time: the
      // thing under test is what happens AT the thresholds, not how long the
      // bar takes, and the rate is one named constant read once.
      for (let i = 0; i < 2400; i++) {
        await step();
        if (bs.heat > h0) res.forgeHeats = true;
        if (bs.state === 'sweep') res.forgeSwept = true;
        if (bs.state === 'vent') {
          res.forgeVented = true;
          res.forgeArmorOpen = armorNow();
          // THE DOORS EASE, they do not snap - deliberately, so the player can
          // see the window starting rather than discovering it already open.
          // So they are read a beat INTO the vent and not on the frame it
          // begins, where doorT is still nearly zero and the first pass of
          // this check failed on its own timing rather than on the boss.
          for (let k = 0; k < 20; k++) await step();
          res.forgeDoorsOpen = bs.doorT > 0.5;
          res.forgeDoorGap = +bs.doorT.toFixed(2);
          // THE MESH, not the state variable. bs.doorT reaching 1 says the
          // animation ran; it says nothing about whether the doors moved,
          // and the first version of this check passed for a whole build
          // while both were being written to NaN - a build() authors in unit
          // space and the ai() was multiplying by a scale the Enemy did not
          // have. Reading the part is the only version of this assertion that
          // could have caught that.
          res.doorOpenX = +f.doorL.position.x.toFixed(3);
          res.forgeVentPatches = kinds('ember').length;
          break;
        }
        // Nudge the bar rather than the state, so every transition the fight
        // actually makes is the one being watched.
        bs.heat = Math.min(1, bs.heat + 0.0025);
      }
      // ...and the vent has to END, resetting the fight to the top.
      for (let i = 0; i < 900 && bs.state === 'vent'; i++) await step();
      res.forgeVentEnded = bs.state !== 'vent';
      res.forgeHeatReset = bs.heat < 0.2;
      res.forgeArmorBack = armorNow();
      clean();
      g.setTheme(null);
    }

    await steps(30);
    res.hazardsDrained = g._hazard.length;
    return res;
  }, EMBER_TYPES);

  ok('every EMBER type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));
  ok('the flare bursts into a fan, not one patch', out.flarePatches >= 3, `patches=${out.flarePatches}`);
  ok('the fan is spread across the ground', out.flareSpread > 1.5, `span=${out.flareSpread}m`);
  ok('the kiln plants', out.kilnPlanted);
  ok('the kiln sweeps its bearing', out.kilnTurned);
  ok('the kiln lays fire at its reach, not underfoot',
    out.kilnPatches > 0 && out.kilnReach > 3, `patches=${out.kilnPatches} nearest=${out.kilnReach}m`);
  ok('a bellows lights the enemies around it', out.litWhileAlive, `gap=${out.litRange}m`);
  ok('an enemy it lit burns the player on contact', out.litBurns);
  ok('the light goes out when the bellows dies', out.unlitAfterDeath);
  ok('the ashwing commits to a run', out.ashwingRan);
  ok('and cannot steer once it has', out.ashwingSteered === 0, `drift=${out.ashwingSteered}`);
  ok('the run lays a long line, not a cluster',
    out.ashwingPatches >= 6 && out.ashwingSpan > 8,
    `n=${out.ashwingPatches} span=${out.ashwingSpan}m`);
  ok('and the line is straight', out.ashwingBow < 1.0, `bow=${out.ashwingBow}m`);
  ok('ember and lava coexist rather than evicting each other',
    out.bothKindsCoexist, `lava=${out.peakLava} ember=${out.peakEmber}`);
  ok('the Forge-Tyrant heats up as it fights', out.forgeHeats);
  ok('it sweeps once it is hot enough', out.forgeSwept);
  ok('it vents on its own at full heat', out.forgeVented);
  ok('venting is what takes the armour off',
    out.forgeArmorShut > 0 && out.forgeArmorShut < 1 && out.forgeArmorOpen === 1,
    `shut=${out.forgeArmorShut} open=${out.forgeArmorOpen}`);
  ok('and the chest visibly opens with it', out.forgeDoorsOpen, `doorT=${out.forgeDoorGap}`);
  ok('the shutters themselves actually move',
    Number.isFinite(out.doorShutX) && Number.isFinite(out.doorOpenX)
      && out.doorOpenX < out.doorShutX - 0.5,
    `x ${out.doorShutX} -> ${out.doorOpenX}`);
  ok('the vent radiates fire while it is open', out.forgeVentPatches > 0,
    `patches=${out.forgeVentPatches}`);
  ok('the vent ends and the fight resets',
    out.forgeVentEnded && out.forgeHeatReset && out.forgeArmorBack < 1,
    `heat=${out.forgeHeatReset} armor=${out.forgeArmorBack}`);
  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `EMBER TEST FAIL (${fails})` : 'EMBER TEST PASS');
process.exitCode = fails ? 1 : 0;
