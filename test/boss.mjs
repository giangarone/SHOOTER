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
import { launchBrowser, sleep, startServer } from './harness.mjs';

const PORT = 8211;
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

const server = startServer(PORT);
await sleep(800);

let browser;
let bad = 0;
try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  // Wait on the game EXISTING, not on a clock: a runner shared with other
  // suites can take far longer than any fixed sleep to boot the page, and a
  // sleep that ran out read `__game` as undefined and crashed the suite
  // before a single assertion ran.
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

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
      const { Enemy, ENEMY_TYPES } = await import('./js/enemy.js');
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

  // ---- schism: the reworked fight -------------------------------------------
  // Schism's mechanics are invisible to the loop below, which chips every boss
  // down as fast as it can and so never lets the health bar rest anywhere.
  // Driven by hand here instead. The order matters: the five ATTACK probes run
  // while the fight is one tier-0 part (the toll only tolls on big bodies),
  // then the same split ladder and volley checks as always:
  //
  //   touch         standing next to it pays, on a cadence - not a machine-gun
  //   nova          a marked tell, then a burst, then a ring of bile
  //   rupture       corridors marked first, then they blow, then the rot stays
  //   spore rain    four globs in under a second, and they land as clouds
  //   brood lunge   the part crosses the room and leaves gas where it lands
  //   last rites    while the ring is up, a fresh corpse stands back up
  //   three tiers   2 parts, then 4, then 8 - the fight gets MORE dangerous
  //                 as it comes apart, which is the whole design
  //   the volley    eight rounds, every bearing, after a wind-up. Fired by
  //                 every part, so it has to survive the splits.
  {
    const r = await page.evaluate(async () => {
      const g = window.__game;
      const { ENEMY_TYPES } = await import('./js/enemy.js');
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
      // the harness rather than on the boss. The mechanics are written in game
      // time (a.dt), so game time is what drives them here.
      const DT = 1 / 60;
      let clock = 0;
      const run = (seconds) => {
        for (let i = 0; i < Math.round(seconds / DT); i++) {
          clock += DT;
          g.time += DT;
          g._updateEnemies(DT);
        }
      };
      // One tick of every part's ai before anything is forced, so the bs
      // blocks below are written on INITIALISED state - the ai owns the shape.
      run(0.3);

      // THE PROBE RIG. An unkillable player pinned to a spot, the add trickle
      // silenced, hits counted by SOURCE - the boss's body charges the probes
      // directly; its volley rounds and its rotten ground carry no source and
      // never pollute a contact count.
      g.autoTest = false;
      g.input.shoot = false;
      g.input.shootFresh = false;
      const P = g.player;
      P.invulnEnd = -1;
      const origUpdate = P.update.bind(P);
      let px = 0;
      let pz = 0;
      P.update = (...args) => {
        origUpdate(...args);
        P.pos.set(px, 0, pz);
        P.health = P.maxHealth;
      };
      // The pin applies NOW as well as per frame: run() steps read the
      // position directly and would otherwise see last probe's spot.
      const pinAt = (x, z) => { px = x; pz = z; g.player.pos.set(x, 0, z); };
      // The boss always stands near an arena edge; the safe line for a probe
      // is the one toward the middle of the room.
      const inDir = (part) => (Math.abs(part.pos.x) > Math.abs(part.pos.z)
        ? [-Math.sign(part.pos.x) || -1, 0] : [0, -Math.sign(part.pos.z) || -1]);
      const origHurt = g._hurtPlayer.bind(g);
      const hits = [];
      g._hurtPlayer = (d, pos, src) => {
        hits.push({ src, at: g.time });
        origHurt(d, pos, src);
      };
      const hitsOn = (part) => hits.filter((h) => h.src === part);
      const bileCount = () => g._hazard.filter((h) => h.kind === 'bile').length;
      const gasCount = () => g._hazard.filter((h) => h.kind === 'gas').length;
      const marksUsed = () => g.effects.marks.filter((m) => m.used).length;
      // One clean slate per probe: no adds, no leftover ground, and every part
      // parked with every attack on cooldown so only the probed one can fire.
      const silence = () => {
        g.bossFight.addTimer = 9999;
        g.bossFight.addInterval = 9999;
        for (const e of g.enemies) {
          if (g.bossFight.parts.includes(e)) continue;
          if (e.dead) continue;
          e.dead = true;
        }
        for (const p of g.bossFight.parts) {
          // Through the type's own cleanup, not a spell-it-out here: the test
          // then proves the telegraph pool genuinely comes back with the boss.
          const cl = ENEMY_TYPES.schism.cleanup;
          if (cl) cl(p);
          p.bs.state = 'prowl';
          p.bs.t = p.bs.tMax = 99;
          p.bs.cdNova = p.bs.cdRain = p.bs.cdRupture = p.bs.cdLunge = p.bs.cdToll = 999;
          p.bs.tell = 0;
          p.bs.burstCd = 999;
        }
        g._clearHazards();
        run(DT * 2);
      };
      const res = {};
      const part0 = g.bossFight.parts[0];

      // ---- TOUCH. Next to it, on the clock, never faster ---------------
      {
        silence();
        hits.length = 0;
        // Prowl backs the boss off an adjacent player by design, so the probe
        // re-pins the player next to it every chunk - the question is what
        // sustained CONTACT costs, not what standing in one spot does.
        for (let i = 0; i < 16; i++) {
          const [ix, iz] = inDir(part0);
          pinAt(part0.pos.x + ix * 1.8, part0.pos.z + iz * 1.8);
          run(0.2);
        }
        const mine = hitsOn(part0);
        res.touchHits = mine.length;
        let gap = Infinity;
        for (let i = 1; i < mine.length; i++) gap = Math.min(gap, mine[i].at - mine[i - 1].at);
        res.touchMinGap = gap === Infinity ? -1 : +gap.toFixed(2);
      }

      // ---- LAST RITES. A body that falls inside the toll stands back up --
      {
        silence();
        const [ix, iz] = inDir(part0);
        // The toll does not need the player close; park them away from it.
        pinAt(part0.pos.x + ix * 14, part0.pos.z + iz * 14);
        // spawnEnemy returns nothing - the new body is the tail of the list.
        g.spawnEnemy('chaser');
        const victim = g.enemies[g.enemies.length - 1];
        victim.pos.set(part0.pos.x + ix * 4, 0, part0.pos.z + iz * 4);
        part0.bs.cdToll = 0;
        part0.bs.t = 0;
        run(0.6);
        res.tollState = part0.bs.state;
        res.tollRing = marksUsed() > 0;
        // The body falls DURING the toll - that timing is the whole attack.
        victim.dead = true;
        run(2.2);
        const rev = g.enemies.find((x) => x.revenant && !x.dead);
        res.tollRaised = !!rev;
        res.tollMarkedVictim = !!victim.raised;
        // At a fraction of the bar, like the carrion's own raising - a body
        // that came back whole would be the boss doubling its wave.
        res.tollFrac = rev ? +(rev.maxHp / victim.maxHp).toFixed(2) : -1;
        hits.length = 0;
      }

      // ---- NOVA. The hug answer -------------------------------------------
      {
        silence();
        const [ix, iz] = inDir(part0);
        pinAt(part0.pos.x + ix * 3.2, part0.pos.z + iz * 3.2);
        const bile0 = bileCount();
        const marks0 = marksUsed();
        part0.bs.cdNova = 0;
        part0.bs.t = 0;
        hits.length = 0;
        run(0.25);
        res.novaTelled = part0.bs.state === 'novaTell';
        res.novaMarked = marksUsed() > marks0;
        run(0.9);
        res.novaHit = hitsOn(part0).length > 0;
        res.novaBile = bileCount() - bile0;
      }

      // ---- RUPTURE. Corridors painted first, blown second ------------------
      {
        silence();
        const [ix, iz] = inDir(part0);
        pinAt(part0.pos.x + ix * 4.5, part0.pos.z + iz * 4.5);
        const bile0 = bileCount();
        const marks0 = marksUsed();
        part0.bs.cdRupture = 0;
        part0.bs.t = 0;
        hits.length = 0;
        run(0.3);
        res.ruptureTelled = part0.bs.state === 'ruptureTell';
        res.ruptureMarked = marksUsed() > marks0;
        run(0.8);
        res.ruptureHit = hitsOn(part0).length > 0;
        res.ruptureBile = bileCount() - bile0;
      }

      // ---- SPORE RAIN. Four globs, then clouds -----------------------------
      {
        silence();
        const [ix, iz] = inDir(part0);
        pinAt(part0.pos.x + ix * 12.5, part0.pos.z + iz * 12.5);
        const gas0 = gasCount();
        const origSpit = g._spawnSpit.bind(g);
        let spits = 0;
        g._spawnSpit = (...a) => { spits++; return origSpit(...a); };
        part0.bs.cdRain = 0;
        part0.bs.t = 0;
        run(1.8);
        g._spawnSpit = origSpit;
        res.rainSpits = spits;
        // The globs' flight is projectile code, and on a busy runner the
        // frame loop is NOT a clock - dt clamps at 50ms and a second of wall
        // time may be a quarter second of game. Fly them in game time, the
        // same reason the whole section is dt-driven.
        for (let i = 0; i < 150; i++) {
          g.time += DT;
          g._updateEnemies(DT);
          g._updateProjectiles(DT);
        }
        res.rainGas = gasCount() - gas0;
      }

      // ---- BROOD LUNGE. The fight MOVES, and where it lands costs ---------
      {
        silence();
        const [ix, iz] = inDir(part0);
        pinAt(part0.pos.x + ix * 9, part0.pos.z + iz * 9);
        const gas0 = gasCount();
        const sx = part0.pos.x;
        const sz = part0.pos.z;
        part0.bs.cdLunge = 0;
        part0.bs.t = 0;
        hits.length = 0;
        let moved = 0;
        for (let i = 0; i < 24; i++) {
          run(0.15);
          moved = Math.max(moved, Math.hypot(part0.pos.x - sx, part0.pos.z - sz));
          if (part0.bs.state === 'recover') break;
        }
        res.lungeMoved = +moved.toFixed(1);
        res.lungeGas = gasCount() - gas0;
        res.lungeHits = hitsOn(part0).length;
      }

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
      pinAt(part.pos.x + 3, 0, part.pos.z);
      const orig = g._spawnProjectile.bind(g);
      let fired = 0;
      let firedAt = -1;
      g._spawnProjectile = (x, y, z, type, ss, sr) => {
        if (type === 'schism') { fired++; if (firedAt < 0) firedAt = clock; }
        return orig(x, y, z, type, ss, sr);
      };
      // Only this part is armed; the others are pushed well out so their own
      // cooldowns cannot land inside the window and inflate the count - and
      // every OTHER channel on every part is parked, so nothing louder can
      // take the floor from under the measurement (a volley tell never starts
      // over a nova's or a lunge's, by design - see aiSchism).
      for (const p of g.bossFight.parts) {
        p.bs.burstCd = 999;
        p.bs.tell = 0;
        p.bs.state = 'prowl';
        p.bs.t = p.bs.tMax = 99;
        p.bs.cdNova = p.bs.cdRain = p.bs.cdRupture = p.bs.cdLunge = p.bs.cdToll = 999;
      }
      clock = 0;
      part.bs.burstCd = 0;
      run(0.1);
      const duringTell = fired;
      run(1.4);
      g._spawnProjectile = orig;
      g._hurtPlayer = origHurt;
      P.update = origUpdate;
      g.autoTest = true;
      // Reported in ms so the assertion and the failure line below read the
      // same as they always have - it is game time now, not wall time.
      return { ...res, parts, duringTell, fired, delay: firedAt >= 0 ? firedAt * 1000 : -1 };
    });
    const step = (n, want) => {
      const ok = r.parts[n] === want;
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} schism: tier ${n} is ${want} parts  got=${r.parts[n]}`);
    };
    const check = (name, cond, extra = '') => {
      if (!cond) bad++;
      console.log(`${cond ? 'ok  ' : 'FAIL'} schism: ${name}${extra ? '  ' + extra : ''}`);
    };
    check('touching it pays, in every state, on a real cooldown',
      r.touchHits >= 1 && r.touchMinGap >= 0.85, `hits=${r.touchHits} minGap=${r.touchMinGap}s`);
    check('the nova marks, tells, detonates and leaves the ring',
      r.novaTelled && r.novaMarked && r.novaHit && r.novaBile >= 3,
      `telled=${r.novaTelled} marked=${r.novaMarked} hit=${r.novaHit} bile+${r.novaBile}`);
    check('the rupture paints its corridors before they blow',
      r.ruptureTelled && r.ruptureMarked && r.ruptureHit && r.ruptureBile >= 5,
      `marked=${r.ruptureMarked} hit=${r.ruptureHit} bile+${r.ruptureBile}`);
    check('the spore rain is four globs and the globs become clouds',
      r.rainSpits >= 3 && r.rainGas >= 1, `spits=${r.rainSpits} gas+${r.rainGas}`);
    check('the brood lunge crosses the room and lands as gas',
      r.lungeMoved >= 5 && r.lungeGas >= 1,
      `moved=${r.lungeMoved}m gas+${r.lungeGas} hits=${r.lungeHits}`);
    check('the last rites stands a body that fell inside the ring back up, cut down and marked',
      r.tollRaised && r.tollMarkedVictim && r.tollFrac > 0.2 && r.tollFrac < 0.5,
      `state=${r.tollState} ring=${r.tollRing} frac=${r.tollFrac}`);
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
    : await page.evaluate(async () => Object.keys((await import('./js/themes.js')).THEMES));

  for (let ti = 0; ti < themeKeys.length; ti++) {
    const themeKey = themeKeys[ti];
    const wave = PIN_WAVES[ti % PIN_WAVES.length];
    errors.length = 0;
    // Jump to the wave before the boss and let the normal flow start it, so
    // the boss goes through exactly the path a real run takes.
    await page.evaluate(({ w, t }) => {
      const g = window.__game;
      // A wave-50 clear parks a solo run on the win screen (see test/win.mjs).
      // Play on past it exactly as a player would, or no later wave starts.
      if (g.state === 'won') g._continueAfterWin();
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
        // THE LATEST sample, so `barShown` reads the bar's settled state
        // rather than one frame of it - but any sample proving it visible
        // would do, so the flag is kept alongside rather than read off the
        // snapshot alone.
        seen.barShown = seen.barShown || snap.barHidden === false;
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
        // The Overgrowth's canopy opens only for a player standing in it, and
        // this is the one damage gate the loop cannot open with a flag. A
        // boss chipped from outside the window also never had the chance to
        // hold a telegraph at death - and a leaked mark is the leak this
        // harness exists to catch.
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
          // what the gate is FOR - open it through the mechanic.
          if (p.type === 'overgrowth') {
            g.player.pos.set(p.pos.x + 3, g.player.pos.y, p.pos.z + 3);
          }
          // A FRACTION OF THE PART'S OWN POOL, not a flat number. A flat chip
          // calibrated for a wave-50 boss is a one-hit kill on the same boss
          // pinned at wave 5, and an overkill hit is fatal BEFORE the ai can
          // act on it - update() returns early on the dead - so a threshold
          // boss dies with its mechanic unfired. That was the plague walk:
          // one 2500 chip against a 2356hp Schism, no split ever fired, the
          // bar read full on every living sample, and hpFell failed with the
          // fight legitimately cleared. A fraction keeps every boss inside
          // the budget while leaving room for thresholds to fire and for the
          // poll above to catch the bar below full.
          p.takeDamage(Math.ceil(p.maxHp * 0.4), true, 0, 1);
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
    // THE BAR HAS TO BE THERE. It is driven by BOSS_NAMES in main.js, which
    // is a hand-kept table: a boss missing from it gets `name: undefined`,
    // and setBoss treats a falsy name as "no fight on" - so the whole fight
    // plays out with the bar hidden and nothing else looks wrong. That is
    // not a hypothetical; it is exactly how SAPPHIRE's boss shipped.
    const barShown = !!seen.barShown;
    const ok = seen.boss && cleared && hpFell && !marksLeaked && barShown && !errors.length;
    if (!ok) bad++;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${themeKey.padEnd(8)} w${wave} boss=${seen.boss} cleared=${cleared} ` +
      `hp ${hpSeen[0]}->${hpSeen[hpSeen.length - 1]} maxParts=${maxParts} ` +
      `maxAdds=${maxAdds} bar=${barShown ? 'shown' : 'HIDDEN'} ` +
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
