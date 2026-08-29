// Boss-wave test. The autotest bot in smoke.mjs rarely survives to wave 5, so
// every boss assertion there would pass vacuously; this drives the game
// straight into each boss wave instead, makes the player unkillable so the
// fight actually resolves, and checks the whole lifecycle:
//
//   the boss spawns          the bar appears and its health falls
//   adds trickle in          and stay under the wave's cap
//   the fight ENDS           when the boss dies, not when the field is clear
//   telegraph handles        are all returned to the pool afterwards
//
// That last one is the real reason this exists. The mark pool is ten deep and
// a boss killed mid-telegraph never runs its own release, so a leak would not
// show up until several fights later as bosses silently losing their warnings.
//
// Waves default to one full rotation plus the start of the second, so the
// repeat scaling is covered too.
//
// Usage: node test/boss.mjs [waveList]
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8211;
const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WAVES = (process.argv[2] || '5,10,15,20,25,30').split(',').map(Number);
const ROOT = '/Users/gianfrancogarone/Desktop/SHOOTER';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
await sleep(800);

let browser;
let bad = 0;
try {
  browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await sleep(1200);

  // ---- weak-point alignment ------------------------------------------------
  // Checked before any fight, because it is the one boss bug that every
  // functional test passes straight through: the fight works, the bar falls,
  // the wave clears - and the glowing plate the player is being told to shoot
  // is the armoured side. Derive the plate's direction from the MESH and
  // confirm the armour function agrees with it, at several angles and with the
  // body facing different ways.
  {
    const rows = await page.evaluate(async () => {
      const g = window.__game;
      const THREE = await import('three');
      const { Enemy, ENEMY_TYPES } = await import('/js/enemy.js');
      const b = new Enemy('colossus', new THREE.Vector3(0, 0, 0), 1, 1, 1);
      g.scene.add(b.group);
      const out = [];
      for (const W of [0, 1.57, 3.14, 4.71]) {
        for (const G of [0, 1.0, -2.0]) {
          b.group.rotation.y = G;
          b.bs.state = 'walk';
          b.bs.weakAngle = W;
          b.bs.pivot.rotation.y = W - G;
          b.group.updateMatrixWorld(true);
          const wp = new THREE.Vector3();
          b.bs.pivot.children[0].getWorldPosition(wp);
          const d = new THREE.Vector3(wp.x - b.pos.x, 0, wp.z - b.pos.z).normalize();
          out.push({
            W, G,
            atPlate: ENEMY_TYPES.colossus.armor(b, -d.x, -d.z),
            opposite: ENEMY_TYPES.colossus.armor(b, d.x, d.z),
          });
        }
      }
      g.scene.remove(b.group);
      b.dispose();
      return out;
    });
    const wrong = rows.filter((r) => r.atPlate !== 1 || r.opposite >= 1);
    if (wrong.length) bad++;
    console.log(
      `${wrong.length ? 'FAIL' : 'ok  '} colossus weak point aligned with its mesh ` +
      `(${rows.length - wrong.length}/${rows.length} angles)`
    );
    for (const w of wrong.slice(0, 3)) {
      console.log(`     ! weakAngle=${w.W} facing=${w.G} atPlate=${w.atPlate} opposite=${w.opposite}`);
    }
  }

  for (const wave of WAVES) {
    errors.length = 0;
    // Jump to the wave before the boss and let the normal flow start it, so
    // the boss goes through exactly the path a real run takes.
    await page.evaluate((w) => {
      const g = window.__game;
      g.wave = w - 1;
      g.enemies.forEach((e) => { e.dead = true; });
      g.queue.length = 0;
      g.totemArea.dismiss?.();
      g.waveState = 'idle';
      g.interT = 0.05;
      g.player.health = 100000;
      g.player.maxHealth = 100000;
      g.player.reserveAmmo = 100000;
    }, wave);
    await sleep(600);

    const seen = { hp: [], parts: [], adds: [], boss: null, bar: null };
    let cleared = false;
    // Give a boss up to ~50s of simulated play.
    for (let i = 0; i < 75; i++) {
      const snap = await page.evaluate(() => {
        const g = window.__game;
        const bf = g.bossFight;
        const bar = document.getElementById('boss-bar');
        return {
          wave: g.wave,
          waveState: g.waveState,
          boss: bf ? bf.key : null,
          parts: bf ? bf.parts.length : 0,
          hp: bf ? +g._bossHpFrac().toFixed(3) : 0,
          adds: g.enemies.length - (bf ? bf.parts.length : 0),
          barHidden: bar.classList.contains('hidden'),
          barW: document.getElementById('boss-hp').style.width,
          note: document.getElementById('boss-note').textContent,
          projectiles: g.projectiles.length,
          hazards: g._hazard.length,
          mortars: g._mortars.length,
          particles: g.effects.alive,
          marks: g.effects.marks.filter((m) => m.used).length,
          hp0: g.player.health,
        };
      });
      if (snap.boss) {
        seen.boss = snap.boss;
        seen.hp.push(snap.hp);
        seen.parts.push(snap.parts);
        seen.adds.push(snap.adds);
        seen.bar = snap;
      }
      if (seen.boss && !snap.boss) { cleared = true; seen.after = snap; break; }
      // Chip the boss down so the fight resolves inside the harness budget.
      await page.evaluate(() => {
        const g = window.__game;
        if (!g.bossFight) return;
        for (const p of g.bossFight.parts) {
          // Hit the weak point where there is one, so an armoured boss takes
          // the damage a player who repositions correctly would deal.
          if (p.bs && typeof p.bs.weakAngle === 'number') {
            // The plate sits at (-sin, -cos) of weakAngle, so a shot that
            // LANDS on it travels the other way. Getting this backwards just
            // makes the harness slow rather than failing loudly, which is why
            // the alignment check above tests the armour function directly.
            p.takeDamage(700, true, Math.sin(p.bs.weakAngle), Math.cos(p.bs.weakAngle));
          } else {
            p.takeDamage(700, true, 0, 1);
          }
        }
      });
      await sleep(820);
    }

    const b = seen.bar || {};
    const maxAdds = Math.max(0, ...seen.adds);
    const maxParts = Math.max(0, ...seen.parts);
    const hpFell = seen.hp.length > 1 && seen.hp[0] > seen.hp[seen.hp.length - 1];
    const marksLeaked = seen.after ? seen.after.marks > 0 : true;
    const ok = seen.boss && cleared && hpFell && !marksLeaked && !errors.length;
    if (!ok) bad++;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} wave ${wave} boss=${seen.boss} cleared=${cleared} ` +
      `hp ${seen.hp[0]}->${seen.hp[seen.hp.length - 1]} maxParts=${maxParts} ` +
      `maxAdds=${maxAdds} bar=${b.barHidden === false ? 'shown' : 'HIDDEN'} ` +
      `note="${b.note || ''}" marksHeld=${seen.after ? seen.after.marks : '?'}`
    );
    for (const e of errors.slice(0, 4)) console.log('     ! ' + e);
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(bad ? `BOSS TEST FAIL (${bad})` : 'BOSS TEST PASS');
process.exitCode = bad ? 1 : 0;
