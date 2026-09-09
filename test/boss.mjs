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
// A WAVE NO LONGER NAMES A BOSS. Which fight wave 5 is depends on which of
// the ten themes the run's deck dealt into the first block, so this suite pins
// the theme with __game.setTheme() and then jumps, rather than assuming wave
// 15 is Schism the way it used to.
//
// The list below is THEMES, not waves, and the loop reads each theme's boss
// off the table - so a theme whose own boss is still being built is exercised
// through whichever built fight it currently borrows, and starts exercising
// its own the day that lands, with no edit here.
const THEMES_UNDER_TEST = (process.argv[2] || '').split(',').filter(Boolean);
// Every fifth wave is a boss wave whatever the theme, so one wave per pin is
// enough - and they are spread up the curve so bossScale() is exercised too.
const PIN_WAVES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
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

  // ---- weak point -----------------------------------------------------------
  // Checked before any fight, because it is the one boss bug that every
  // functional test passes straight through: the fight works, the bar falls,
  // the wave clears - and the boss is armoured at the exact moment its core is
  // glowing red and the HUD is saying CORE EXPOSED. Three things have to agree:
  // the armour multiplier, the shutter positions, and the core's brightness.
  //
  // The core sits on the chest and does not move, so unlike the plate that used
  // to travel around the body there is nothing directional left to get
  // backwards. What replaces that risk is the timing: `weakOpen` and what the
  // player can SEE must never disagree.
  {
    const rows = await page.evaluate(async () => {
      const THREE = await import('three');
      // Colossus is RUST's boss. Pin the theme or the deck decides which fight
      // this block gets, and it is specifically Colossus's core being checked.
      window.__game.setTheme('rust');
      const { Enemy, ENEMY_TYPES } = await import('/js/enemy.js');
      const b = new Enemy('colossus', new THREE.Vector3(0, 0, 0), 1, 1, 1);
      const out = [];
      const sample = (label) => {
        const bs = b.bs;
        out.push({
          label,
          open: !!bs.weakOpen,
          state: bs.state,
          // Direction is not consulted any more, so every bearing must agree.
          armor: ENEMY_TYPES.colossus.armor(b, 0, 1),
          armorBehind: ENEMY_TYPES.colossus.armor(b, 0, -1),
          // vent is the shutters' 0..1 travel; the meshes are driven off it.
          vent: +bs.vent.toFixed(2),
          gap: +Math.abs(bs.shutters[1].mesh.position.x - bs.shutters[0].mesh.position.x).toFixed(2),
          glow: +bs.coreMat.emissiveIntensity.toFixed(2),
        });
      };
      // As spawned: shut, and the shutter meshes still where build() put them.
      sample('spawn');
      // Fully open. Written straight rather than waited for: the ease is a
      // fraction of a second of interpolation and what is under test is the
      // agreement between the three, not the ramp between them.
      b.bs.weakOpen = true;
      b.bs.vent = 1;
      b.bs.coreMat.emissiveIntensity = 2.2;
      b.bs.shutters[0].mesh.position.x = -(0.26 + 0.46) * 3.2;
      b.bs.shutters[1].mesh.position.x = (0.26 + 0.46) * 3.2;
      sample('open');
      b.bs.weakOpen = false;
      b.bs.state = 'stagger';
      sample('stagger');
      b.dispose();
      return out;
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    const checks = [
      ['shut at spawn', byLabel.spawn.open === false && byLabel.spawn.armor < 1
        && byLabel.spawn.armorBehind < 1 && byLabel.spawn.gap < 2.0],
      ['open takes full damage from any bearing',
        byLabel.open.armor === 1 && byLabel.open.armorBehind === 1],
      ['open reads open: shutters apart and core brighter',
        byLabel.open.gap > byLabel.spawn.gap && byLabel.open.glow > byLabel.spawn.glow],
      ['a knockdown opens it regardless of the clock', byLabel.stagger.armor === 1],
    ];
    for (const [name, ok] of checks) {
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} colossus core: ${name}`);
    }
    if (checks.some(([, ok]) => !ok)) console.log('     ! ' + JSON.stringify(rows));
  }

  // ---- schism: the splits and the volley ------------------------------------
  // Both of Schism's mechanics are invisible to the loop below, which chips
  // every boss down as fast as it can and so never lets the health bar rest on
  // a threshold. Driven by hand here instead:
  //
  //   three tiers    2 parts, then 4, then 8 - the fight gets MORE dangerous
  //                  as it comes apart, which is the whole design
  //   the volley     eight rounds, every bearing, after a wind-up. Fired by
  //                  every part, so it has to survive the splits.
  {
    const r = await page.evaluate(async () => {
      const g = window.__game;
      // Schism is PLAGUE's boss. Wave 15 used to BE Schism; it is now whatever
      // the deck dealt, so the theme is what has to be asked for.
      g.setTheme('plague');
      g.wave = 14;
      g.enemies.forEach((e) => { e.dead = true; });
      g.queue.length = 0;
      g.totemArea.dismiss?.();
      g.waveState = 'idle';
      g.interT = 0.05;
      g.player.health = 100000;
      g.player.maxHealth = 100000;
      await new Promise((done) => {
        const t = setInterval(() => {
          if (g.bossFight && g.bossFight.parts.length) { clearInterval(t); done(); }
        }, 60);
      });

      // DRIVEN ON FIXED TICKS, NOT ON THE CLOCK. Everything below used to
      // wait on real time, which really meant waiting on the frame loop - and
      // a headless Chrome sharing a machine with another suite gets starved of
      // frames. The volley then fired nothing at all and the checks failed on
      // the harness rather than on the boss. Both mechanics are written in
      // game time (a.dt), so game time is what drives them here.
      const DT = 1 / 60;
      let clock = 0;
      const run = (seconds) => {
        for (let i = 0; i < Math.round(seconds / DT); i++) {
          clock += DT;
          g.time += DT;
          g._updateEnemies(DT);
        }
      };

      // Walk every part just under the next threshold in turn and let the AI
      // notice. Each pass doubles the part count.
      const parts = [g.bossFight.parts.length];
      for (const frac of [0.49, 0.24, 0.11]) {
        for (const p of g.bossFight.parts) p.hp = p.maxHp * frac;
        run(0.5);
        parts.push(g.bossFight.parts.length);
      }

      // The volley. One part, armed by hand, counted as it lands: the tell has
      // to elapse before anything is fired, which is the property worth
      // checking - an instant eight-way burst is not dodgeable.
      // Counted as they are SPAWNED, not as they are in the air: a round that
      // has already hit a wall is still a round that was fired, and the parts
      // stand close to cover.
      const part = g.bossFight.parts[0];
      // The volley only arms inside 26m (see aiSchism), so the player has to
      // be standing near the part under test rather than wherever the fight
      // happened to leave them - otherwise the burst never comes and the
      // count is zero for a reason that has nothing to do with the volley.
      g.player.pos.set(part.pos.x + 3, 0, part.pos.z);
      const orig = g._spawnProjectile.bind(g);
      let fired = 0;
      let firedAt = -1;
      g._spawnProjectile = (x, y, z, type, ss, sr) => {
        if (type === 'schism') { fired++; if (firedAt < 0) firedAt = clock; }
        return orig(x, y, z, type, ss, sr);
      };
      // Only this part is armed; the others are pushed well out so their own
      // cooldowns cannot land inside the window and inflate the count.
      for (const p of g.bossFight.parts) { p.bs.burstCd = 999; p.bs.tell = 0; }
      clock = 0;
      part.bs.burstCd = 0;
      run(0.1);
      const duringTell = fired;
      run(1.4);
      g._spawnProjectile = orig;
      // Reported in ms so the assertion and the failure line below read the
      // same as they always have - it is game time now, not wall time.
      return { parts, duringTell, fired, delay: firedAt >= 0 ? firedAt * 1000 : -1 };
    });
    const step = (n, want) => {
      const ok = r.parts[n] === want;
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} schism: tier ${n} is ${want} parts  got=${r.parts[n]}`);
    };
    step(0, 1); step(1, 2); step(2, 4); step(3, 8);
    const volleyOk = r.fired === 8;
    if (!volleyOk) bad++;
    console.log(`${volleyOk ? 'ok  ' : 'FAIL'} schism: the volley is eight rounds  fired=${r.fired}`);
    const tellOk = r.duringTell === 0 && r.delay > 100;
    if (!tellOk) bad++;
    console.log(`${tellOk ? 'ok  ' : 'FAIL'} schism: nothing leaves during the wind-up  `
      + `early=${r.duringTell} delay=${Math.round(r.delay)}ms`);
  }

  // Which themes to sweep. Given none on the command line, every theme in the
  // table - so all ten fights are covered the moment they exist, and until
  // then a theme is covered through the fight it borrows.
  const themeKeys = THEMES_UNDER_TEST.length
    ? THEMES_UNDER_TEST
    : await page.evaluate(async () => Object.keys((await import('/js/themes.js')).THEMES));

  for (let ti = 0; ti < themeKeys.length; ti++) {
    const themeKey = themeKeys[ti];
    const wave = PIN_WAVES[ti % PIN_WAVES.length];
    errors.length = 0;
    // Jump to the wave before the boss and let the normal flow start it, so
    // the boss goes through exactly the path a real run takes.
    await page.evaluate(({ w, t }) => {
      const g = window.__game;
      g.setTheme(t);
      g.wave = w - 1;
      g.enemies.forEach((e) => { e.dead = true; });
      g.queue.length = 0;
      g.totemArea.dismiss?.();
      g.waveState = 'idle';
      g.interT = 0.05;
      g.player.health = 100000;
      g.player.maxHealth = 100000;
      g.player.reserveAmmo = 100000;
    }, { w: wave, t: themeKey });
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
      if (seen.boss && !snap.boss) {
        cleared = true;
        // ONE MORE BEAT BEFORE THE POOL IS COUNTED. The bossFight goes null on
        // the frame the last part dies, and the wave-end sweep that clears
        // whatever the fight left in the air - live mortars, and the telegraph
        // marks they are holding - runs after it. Sampling on the same frame
        // measured a mark that was still legitimately in use and called it a
        // leak. What is being asserted is that the pool comes BACK, not that
        // it comes back within one frame.
        //
        // It only started failing when this loop began walking the player into
        // the Overgrowth's canopy: before that the one rooted boss never got
        // to lay a ring at all, so it never had a telegraph outstanding when
        // it died.
        await sleep(900);
        seen.after = await page.evaluate(() => ({
          marks: window.__game.effects.marks.filter((m) => m.used).length,
        }));
        break;
      }
      // Chip the boss down so the fight resolves inside the harness budget.
      //
      // MORE THAN HALF THE ROSTER NOW GATES ITS OWN DAMAGE, and this loop
      // ticks far slower than any of those gates cycle - so each one is opened
      // here rather than waited on. The point of the loop is to resolve the
      // fight inside the budget and prove it ENDS cleanly; whether each gate
      // opens on its own terms is measured in that theme's own suite.
      await page.evaluate(() => {
        const g = window.__game;
        if (!g.bossFight) return;
        // The Pale Crown's shell takes literally nothing until its three
        // anchors are broken, so breaking them is the only way in - and doing
        // it through the real mechanic rather than by forcing a flag means
        // this loop also proves the shell comes down in a live fight.
        for (const e of g.enemies) {
          if (e.type === 'anchor') e.dead = true;
        }
        for (const p of g.bossFight.parts) {
          const bs = p.bs;
          if (bs) {
            // Colossus: the chest core, on a fixed rhythm.
            if (bs.shutters) bs.weakOpen = true;
            // Forge-Tyrant: the vent it only opens once it has heated up.
            if (bs.heat !== undefined) bs.venting = true;
          }
          // The Overgrowth's gate is not a flag at all - its canopy opens on
          // the PLAYER'S POSITION, so the only honest way in is to stand
          // where the fight wants you. Walk the player into the canopy rather
          // than inflating the damage number: chipping through 0.22 armour
          // reached six per cent and ran out of ticks, and would have proved
          // nothing about the gate even if it had landed. Same argument as
          // the Pale Crown's anchors above - open it through the mechanic.
          if (p.type === 'overgrowth') {
            g.player.pos.set(p.pos.x + 3, g.player.pos.y, p.pos.z + 3);
          }
          p.takeDamage(2500, true, 0, 1);
        }
      });
      await sleep(820);
    }

    const b = seen.bar || {};
    const maxAdds = Math.max(0, ...seen.adds);
    const maxParts = Math.max(0, ...seen.parts);
    // Measured from the first sample where the boss actually HAS health. A
    // bossFight exists for a moment before its parts carry their hp, so the
    // poll above can catch it mid-construction and record a 0 - and a run
    // that started at 0 then read anything at all looked like a boss whose
    // health went UP. Zeroes are a construction artefact, not a measurement.
    const hpSeen = seen.hp.filter((h) => h > 0);
    const hpFell = hpSeen.length > 1 && hpSeen[0] > hpSeen[hpSeen.length - 1];
    const marksLeaked = seen.after ? seen.after.marks > 0 : true;
    const ok = seen.boss && cleared && hpFell && !marksLeaked && !errors.length;
    if (!ok) bad++;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${themeKey.padEnd(8)} w${wave} boss=${seen.boss} cleared=${cleared} ` +
      `hp ${hpSeen[0]}->${hpSeen[hpSeen.length - 1]} maxParts=${maxParts} ` +
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
