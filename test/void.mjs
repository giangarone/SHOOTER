// VOID, end to end - the fifth theme built out.
//
// WHY THIS EXISTS
//   Every other theme is answered by POSITIONING. EMBER is answered by moving
//   off the fire, RIME by leaving the field, STRATA by getting out of the
//   corner, VERDANT by not being where you were two seconds ago. VOID is the
//   theme that takes the position itself: the cover you were behind, the
//   ground you meant to stand on, the distance you were keeping.
//
//   Which makes its three mechanics the most invasive in the game - one of
//   them writes to the player's own movement, one opts out of the collision
//   resolver, and one fires from somewhere its owner is not. All three degrade
//   silently: a warp that fires from itself is a shooter, a monolith that
//   respects cover is a slow tank, and a well that does not pull is a patch of
//   coloured floor.
//
//     warp        fires out of a rift rather than out of itself, so there is
//                 never a line for cover to interrupt
//     monolith    the only type that ignores the obstacle resolver - it walks
//                 THROUGH pillars in a dead straight line
//     singularity a hazard kind that deals no damage and no status at all, and
//                 instead MOVES the player - the only one of its sort
//
// WHAT IS ASSERTED
//   1. All six build and survive their AI.
//   2. A warp opens a rift away from itself, and the round comes out of THERE.
//   3. A monolith walks through a solid obstacle instead of round it.
//   4. ...and nothing else does, which is what makes it the mechanic.
//   5. A well drags the player toward it and costs no health at all.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8225;
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

const VOID_TYPES = ['wraith', 'warp', 'monolith', 'singularity', 'hexer', 'shade'];

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

  const out = await page.evaluate(async (VOID_TYPES) => {
    const g = window.__game;
    const p = g.player;
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
      // UNPINNABLE, unlike the other theme suites. VOID's whole point is that
      // it moves the player, so the block that measures the well has to let
      // them actually be moved - pinning would hold them still and the pull
      // would be perfectly invisible.
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
      // AND THE BOXES, which every later theme suite clears and this one did
      // not. The monolith block pushes a solid box across the middle of the
      // arena and nothing took it back out, so the well block below was
      // dropping its well INSIDE that box and measuring a player being pulled
      // into a wall and ejected out of it - which came out as +3.6m most runs
      // and as a flight to the far wall on the ones where the resolver threw
      // them the other way. Intermittent, and nothing to do with the well.
      g.arena.obstacles.length = 0;
      g.arena.ground.length = 0;
      p.clearStatuses();
      // AND THE MOVEMENT KEYS. `autoTest = false` stops the bot from WRITING
      // the input every frame, it does not clear what the bot was already
      // holding - so the player kept walking in whatever direction it happened
      // to be going when the suite took over. Harmless in every block that
      // pins the player, and the entire explanation for the well block:
      // measuring a two-and-a-half metres-per-second pull against a walk
      // that never stopped gave +3.6m, +21.6m, -21.6m and 0.06m on four runs
      // of identical code.
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

    // ---- 1. all six survive being alive ---------------------------------
    {
      clean();
      const built = {};
      const subjects = [];
      for (const t of VOID_TYPES) {
        const e = put(t, 10, 10);
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

    // ---- 2. the warp fires out of its rift ------------------------------
    {
      clean();
      const e = put('warp', 14, 0);
      e.speed = 0;
      e.attackCd = 0;
      let riftX = null;
      let riftZ = null;
      for (let i = 0; i < 1200; i++) {
        await step();
        if (e.riftT > 0 && riftX === null) {
          riftX = e.riftX;
          riftZ = e.riftZ;
        }
        if (riftX !== null && g.projectiles.length > 0) break;
      }
      res.warpOpened = riftX !== null;
      if (riftX !== null) {
        // THE RIFT IS NOT ON THE WARP. If it opened at its own feet the whole
        // mechanic collapses into an ordinary shooter.
        res.warpRiftFromSelf = +Math.hypot(riftX - e.pos.x, riftZ - e.pos.z).toFixed(1);
        // ...and it is near the PLAYER, which is what makes cover useless.
        res.warpRiftFromPlayer = +Math.hypot(riftX - px, riftZ - pz).toFixed(1);
      }
      const shot = g.projectiles[0];
      if (shot) {
        // The round starts AT the rift, not at the enemy.
        res.warpShotFromRift = +Math.hypot(shot.pos.x - riftX, shot.pos.z - riftZ).toFixed(1);
        res.warpShotFromSelf = +Math.hypot(shot.pos.x - e.pos.x, shot.pos.z - e.pos.z).toFixed(1);
      }
      clean();
    }

    // ---- 3/4. the monolith walks through cover, and nothing else does ----
    // Driven with a real obstacle put directly between the two of them, so
    // what is measured is the resolver rather than the pathfinder.
    {
      const runThrough = async (type) => {
        clean();
        // One box on the line between them. `ground` is what the collision
        // resolver reads; `obstacles` is what steering reads - a type that
        // ignores one and not the other would slide along it forever, so both
        // are set and both have to be ignored for a crossing to happen.
        const box = new THREE.Box3(
          new THREE.Vector3(4, 0, -3),
          new THREE.Vector3(7, 3, 3)
        );
        g.arena.obstacles.length = 0;
        g.arena.ground.length = 0;
        g.arena.obstacles.push(box);
        g.arena.ground.push(box);
        const e = put(type, 14, 0);
        px = 0;
        pz = 0;
        let crossed = false;
        let minX = 99;
        for (let i = 0; i < 1400; i++) {
          await step();
          minX = Math.min(minX, e.pos.x);
          // Through means out the far side of the box.
          if (e.pos.x < 3.5) { crossed = true; break; }
        }
        return { crossed, minX: +minX.toFixed(1) };
      };
      const mono = await runThrough('monolith');
      res.monoCrossed = mono.crossed;
      res.monoMinX = mono.minX;
      // The control. A tank is the monolith's role-mate and steers by the same
      // grid; if IT gets through, the box is not a wall and the test above
      // proves nothing at all.
      const tank = await runThrough('tank');
      res.tankBlocked = !tank.crossed;
      res.tankMinX = tank.minX;
      clean();
    }

    // ---- 5. the well drags, and costs nothing ---------------------------
    {
      clean();
      // INSIDE its radius, which the first version of this was not: the well
      // is seven metres across and it was dropped eight metres away, so the
      // player was standing outside the only thing being measured and it
      // correctly did nothing. Far enough to have somewhere to be dragged,
      // near enough to be in it.
      g._addHazard(5, 0, 7.0, 2.2, 0, 'well');
      res.wellPlaced = g._hazard.length;
      pinned = false;
      god = false;
      p.pos.set(0, 0, 0);
      p.health = p.maxHealth;
      const hp0 = p.health;
      const d0 = Math.hypot(p.pos.x - 5, p.pos.z);
      // MEASURED AS A DIRECTION AND STOPPED THE MOMENT IT IS PROVEN, not as a
      // displacement over a fixed number of frames.
      //
      // The pull is per-frame and the well is seven metres across, so a fixed
      // frame count measures TIME on a machine whose frames are not all the
      // same length: on a loaded one the player crosses the centre inside the
      // window, the pull reverses behind them, and they leave the well
      // entirely - which came out as +3.6m, +21.6m and -21.6m on three runs of
      // the same code. None of that is the well being wrong; all of it is the
      // question being asked over the wrong interval.
      // AND THE WELL IS RE-LAID WHEN IT LAPSES. It lives 2.2 seconds, which is
      // fewer frames than this loop has whenever the machine is loaded - so
      // the other half of the flake was the opposite of the first: a window
      // that ran out before the player had been moved at all, reported as
      // 0.06m. Between the re-lay and the early break the measurement now
      // depends on neither the frame rate nor the clock. The bar is 0.4m and
      // not a metre for the same reason: what is under test is the DIRECTION
      // the well moves somebody, and how far it gets to move them inside one
      // window is a fact about the machine.
      let closest = d0;
      let pulled = false;
      for (let i = 0; i < 400; i++) {
        await step();
        if (!g._hazard.some((h) => h.kind === 'well')) {
          g._addHazard(5, 0, 7.0, 2.2, 0, 'well');
        }
        const d = Math.hypot(p.pos.x - 5, p.pos.z);
        closest = Math.min(closest, d);
        if (d < d0 - 0.4) {
          pulled = true;
          break;
        }
      }
      res.wellMoved = +(d0 - closest).toFixed(2);
      res.wellCost = +(hp0 - p.health).toFixed(2);
      pinned = true;
      god = true;
      // It pulls TOWARD itself, so the player ends up nearer than they began.
      res.wellPulledIn = pulled;
      clean();
    }

    await steps(30);
    return res;
  }, VOID_TYPES);

  ok('every VOID type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('a warp opens a rift', out.warpOpened);
  ok('and it opens away from the warp itself',
    out.warpRiftFromSelf > 4, `${out.warpRiftFromSelf}m from itself`);
  ok('and beside the player, where cover cannot help',
    out.warpRiftFromPlayer > 1 && out.warpRiftFromPlayer < 9,
    `${out.warpRiftFromPlayer}m from the player`);
  ok('the round comes out of the rift, not out of the warp',
    out.warpShotFromRift < 1.5 && out.warpShotFromSelf > 4,
    `rift+${out.warpShotFromRift}m self+${out.warpShotFromSelf}m`);

  ok('a monolith walks through solid cover', out.monoCrossed, `reached x=${out.monoMinX}`);
  ok('and its role-mate is stopped by the same box',
    out.tankBlocked, `tank reached x=${out.tankMinX}`);

  ok('a well is laid on the floor', out.wellPlaced > 0);
  ok('it drags the player toward it', out.wellPulledIn, `closed ${out.wellMoved}m`);
  ok('and costs no health at all', out.wellCost === 0, `lost=${out.wellCost}`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `VOID TEST FAIL (${fails})` : 'VOID TEST PASS');
process.exitCode = fails ? 1 : 0;
