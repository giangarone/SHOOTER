// Focused check of melee attacks, driven through window.__game.
//
// THE BUG THIS EXISTS FOR
//   A melee hit used to be reachable only by completing an animation: close to
//   `start`, wind up for `windup` seconds, and test `hit` on the single frame
//   the windup expired. Against a player moving at BASE_SPEED that is
//   unlandable arithmetic - a chaser winds up for 0.45s and reaches 2.2m, while
//   the player covers 4.5m in the same time - so running through a pack cost
//   nothing at all. Every one of the seven melee types was broken the same way.
//
// WHAT IS ASSERTED
//   1. Running straight through a melee enemy at full speed costs a hit.
//   2. It costs exactly ONE hit - contact is not a damage-per-frame aura.
//   3. Standing next to one still cannot beat that type's own cooldown, so the
//      fix cannot have raised any enemy's damage per second.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8207;
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

// Every type whose ai routes through _meleeCycle, with its own cooldown - the
// ceiling on how often it may ever land a blow.
const MELEE = {
  chaser: 1.1, splitter: 1.0, tank: 3.0, wraith: 0.9,
  bulwark: 2.2, magma: 1.3, schism: 1.6,
};
const STAND_SECONDS = 6;

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
  await page.waitForFunction('window.__game && window.__game.enemies', { timeout: 30000 });

  const out = await page.evaluate(async (MELEE, STAND_SECONDS) => {
    const g = window.__game;
    const step = () => new Promise((r) => requestAnimationFrame(r));

    // MELEE BLOWS ONLY. _meleeCycle passes the enemy as `source`; projectiles
    // come through the projectile ctx with no source, and counting a schism's
    // burst volley would make it look like it was beating its melee cooldown
    // when it was simply also shooting.
    let hits = 0;
    g._hurtPlayer = (d, pos, source) => { if (source) hits++; };

    // The autotest bot drives the player AND shoots, so it has to be switched
    // off or it kills the subject and fights every position write. The player
    // is then moved from inside player.update(), the one place guaranteed to
    // run before the enemies read the position in the same frame.
    g.autoTest = false;
    g.input.shoot = false;
    g.input.shootFresh = false;
    let px = 0;
    let pz = 0;
    const origUpdate = g.player.update.bind(g.player);
    g.player.update = (...args) => { origUpdate(...args); g.player.pos.set(px, 0, pz); };

    // ONE enemy, at a spot it has already settled into, with the player driven
    // through it in a straight line. A corridor of them down x=0 would measure
    // the arena as much as the melee: that line runs the length of the totem
    // and Devil rows, whose furniture shoves wide bodies off the path before
    // the player ever arrives.
    const trial = async (type, mode) => {
      g._clearEntities();
      g.player.health = 1e6;
      g.player.invulnEnd = -1;
      g.player.wardReady = false;
      g.player.mods.dodgeChance = 0;
      g.spawnEnemy(type);
      const e = g.enemies[g.enemies.length - 1];
      e.status.freeze = 0;
      e.status.fear = 0;

      // Hold the player off while the enemy settles out of anything it spawned
      // inside, then approach along the line from the arena centre to it.
      px = 0; pz = 0;
      for (let f = 0; f < 20; f++) await step();
      const cx = e.pos.x;
      const cz = e.pos.z;
      const len = Math.hypot(cx, cz) || 1;
      const ux = cx / len;
      const uz = cz / len;

      e.attackCd = 0;
      hits = 0;
      const t0 = performance.now();
      for (let f = 0; f < 600; f++) {
        if (mode === 'run') {
          // Straight through at BASE_SPEED, from 8m short to 8m past, never
          // slowing and never stopping.
          const t = -8 + f * (10 / 60);
          if (t > 8) break;
          px = cx + ux * t;
          pz = cz + uz * t;
        } else {
          px = cx + ux * 0.9;
          pz = cz + uz * 0.9;
          if (performance.now() - t0 > STAND_SECONDS * 1000) break;
        }
        await step();
      }
      return { hits, secs: (performance.now() - t0) / 1000 };
    };

    const res = {};
    for (const type of Object.keys(MELEE)) {
      const run = await trial(type, 'run');
      const stand = await trial(type, 'stand');
      res[type] = {
        run: run.hits,
        stand: stand.hits,
        // One blow, then a full cooldown, for the whole window.
        cap: Math.floor(stand.secs / MELEE[type]) + 1,
      };
    }
    return res;
  }, MELEE, STAND_SECONDS);

  for (const type of Object.keys(MELEE)) {
    const r = out[type];
    ok(`running through a ${type} costs a hit`, r.run >= 1, `hits ${r.run}`);
    ok(`running through a ${type} costs only one`, r.run <= 1, `hits ${r.run}`);
    ok(`a ${type} cannot beat its own cooldown`, r.stand <= r.cap, `${r.stand} of ${r.cap} in ${STAND_SECONDS}s`);
  }
  ok('no console errors', errors.length === 0, errors.join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? 'MELEE TEST FAIL' : 'MELEE TEST PASS');
process.exit(fails ? 1 : 0);
