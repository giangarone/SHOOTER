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
//
// ONE CLOCK. Every measurement below runs on `game.time` - never on a frame
// count and never on wall time. The trials are a race between a player crossing
// a distance and an enemy completing a windup, and a race is only meaningful if
// both are timed by the same watch. See the note in trial().
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
// The player's BASE_SPEED (player.js), in metres a SECOND. The body is driven
// straight here rather than through the movement code, so this is the speed the
// run is measured at and it has to be stated per second - see trial().
const RUN_SPEED = 10;

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

  const out = await page.evaluate(async (MELEE, STAND_SECONDS, RUN_SPEED) => {
    const g = window.__game;
    const step = () => new Promise((r) => requestAnimationFrame(r));

    // MELEE BLOWS ONLY. _meleeCycle passes the enemy as `source`; projectiles
    // come through the projectile ctx with no source, and counting a schism's
    // burst volley would make it look like it was beating its melee cooldown
    // when it was simply also shooting.
    // ONLY THE SUBJECT'S BLOWS. `source` alone was not specific enough: the
    // wave spawner keeps running underneath these trials, so anything it put
    // on the floor was landing its own hits and being counted against the one
    // enemy under test - which read as that enemy beating its cooldown. The
    // field is also kept clear below; this is the half that makes the count
    // exact rather than merely likely.
    let hits = 0;
    let subject = null;
    g._hurtPlayer = (d, pos, source) => { if (source && source === subject) hits++; };

    // The autotest bot drives the player AND shoots, so it has to be switched
    // off or it kills the subject and fights every position write. The player
    // is then moved from inside player.update(), the one place guaranteed to
    // run before the enemies read the position in the same frame.
    g.autoTest = false;
    g.input.shoot = false;
    g.input.shootFresh = false;
    let px = 0;
    let pz = 0;
    // Set per trial, and called from INSIDE player.update() so the position it
    // writes belongs to this frame rather than to the one before it. Left null
    // between trials, which parks the player at whatever px/pz already hold.
    let drive = null;
    const origUpdate = g.player.update.bind(g.player);
    g.player.update = (...args) => {
      origUpdate(...args);
      if (drive) drive();
      g.player.pos.set(px, 0, pz);
    };

    // ONE enemy, at a spot it has already settled into, with the player driven
    // through it in a straight line. A corridor of them down x=0 would measure
    // the arena as much as the melee: that line runs the length of the totem
    // and item rows, whose furniture shoves wide bodies off the path before
    // the player ever arrives.
    const trial = async (type, mode) => {
      g._clearEntities();
      g.player.health = 1e6;
      g.player.invulnEnd = -1;
      g.player.wardReady = false;
      g.player.mods.dodgeChance = 0;
      g.spawnEnemy(type);
      const e = g.enemies[g.enemies.length - 1];
      subject = e;
      // Anything the spawner adds during the trial is removed on sight. Two
      // enemies crowd each other, which moves the subject off the player and
      // changes the very contact distance the trial is measuring.
      const keepAlone = () => {
        g.queue.length = 0;
        for (let i = g.enemies.length - 1; i >= 0; i--) {
          const o = g.enemies[i];
          if (o === e) continue;
          g.scene.remove(o.group);
          if (o.dispose) o.dispose();
          g.enemies.splice(i, 1);
        }
      };
      keepAlone();
      e.status.freeze = 0;
      e.status.fear = 0;

      // Hold the player off while the enemy settles out of anything it spawned
      // inside, then approach along the line from the arena centre to it.
      px = 0; pz = 0;
      for (let f = 0; f < 20; f++) { keepAlone(); await step(); }
      const cx = e.pos.x;
      const cz = e.pos.z;
      const len = Math.hypot(cx, cz) || 1;
      const ux = cx / len;
      const uz = cz / len;

      e.attackCd = 0;
      hits = 0;
      // GAME TIME, NOT FRAMES AND NOT WALL TIME.
      //
      // The run used to advance the player a fixed distance PER FRAME - ten
      // metres a second divided by sixty - which silently assumed the browser
      // was holding sixty frames. The enemy is not: its windup, its swing and
      // its cooldown all tick on the game's dt, and that dt is CLAMPED to 0.05s
      // (see the loop in main.js). So on a slow frame the enemy could be handed
      // three times the simulated time the player's step had accounted for,
      // while the player still moved one sixtieth of a second's worth. Under
      // load - a headless browser on software rendering, straight after the
      // sixty-second smoke soak - that was enough to fit in an extra swing, or
      // to shift the approach far enough that the pass was missed entirely.
      // The trial was measuring the frame rate as much as the melee, and it
      // failed perhaps a third of the time, on a different assertion each run.
      //
      // Wall time would not have fixed it either, because of that same clamp: a
      // hitch makes the game experience LESS time than the wall does. It is the
      // clock the enemy is on or it is nothing.
      const t0 = g.time;
      const travelled = () => -8 + (g.time - t0) * RUN_SPEED;
      drive = mode === 'run'
        ? () => {
          // Straight through, from 8m short to 8m past, never slowing and
          // never stopping.
          const t = travelled();
          px = cx + ux * t;
          pz = cz + uz * t;
        }
        : () => {
          px = cx + ux * 0.9;
          pz = cz + uz * 0.9;
        };
      // The frame ceiling is a backstop against a stalled clock, nothing more -
      // both modes end on the clock above.
      for (let f = 0; f < 4000; f++) {
        if (mode === 'run' ? travelled() > 8 : g.time - t0 > STAND_SECONDS) break;
        keepAlone();
        await step();
      }
      drive = null;
      // In GAME seconds, so the cooldown ceiling the caller derives from this
      // is counted in the same units the enemy's cooldown is spent in.
      return { hits, secs: g.time - t0 };
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
  }, MELEE, STAND_SECONDS, RUN_SPEED);

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
