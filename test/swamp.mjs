// SWAMP's counterplay, run through real browser entities at fixed game ticks.
// The comparisons catch homing lunges, late-wave warning overruns, ineffective
// cleansing and attacks whose telegraphs leak when their owner dies.
import { launchBrowser, startServer } from './harness.mjs';
const PORT = 8254;
const server = startServer(PORT);
await new Promise((r) => setTimeout(r, 800));
let browser, fails = 0;
try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load' });
  await page.waitForFunction('window.__game?.player');
  const rows = await page.evaluate(async () => {
    const { Enemy, ENEMY_TYPES } = await import('./js/enemy.js');
    const { THEMES } = await import('./js/themes.js');
    const THREE = await import('three');
    const g = window.__game, p = g.player, ctx = g._enemyCtx;
    const rows = [], DT = 1 / 60, HEALTH = 100000;
    const ok = (name, pass, detail = '') => rows.push({ name, pass: !!pass, detail });
    g.autoTest = false; g.input.shoot = g.input.shootFresh = false;
    g.nav.steer = g.navBig.steer = () => false;
    const clean = () => {
      g._clearEntities(); g._clearHazards();
      g.waveState = 'active'; g.queue.length = 0; g.queue.push('mudskipper'); g.spawnTimer = 1e6;
      ctx.obstacles = []; g._projCtx.obstacles = [];
      p.pos.set(0, 0, 0); p.health = HEALTH; p.invulnEnd = -1; p.wardReady = false;
      p.mods.dodgeChance = 0; p.clearStatuses();
    };
    const put = (type, x, z) => {
      const e = new Enemy(type, new THREE.Vector3(x, 0, z), 1, 1, 1);
      e.attackCd = 0; g.enemies.push(e); g.scene.add(e.group); return e;
    };
    const run = (seconds, visit) => {
      for (let i = 0; i < Math.ceil(seconds / DT); i++) {
        g.time += DT; g._updateEnemies(DT); g._updateProjectiles(DT);
        g._updateMortars(DT); g.effects.update(DT, g.camera); visit?.();
      }
    };
    const until = (predicate, cap = 8) => {
      for (let i = 0; i < cap / DT && !predicate(); i++) run(DT);
      return predicate();
    };
    const marks = () => g.effects.marks.filter((m) => m.used).length;
    clean(); run(1); ok('empty arena costs no health', p.health === HEALTH);
    const types = [...Object.values(THEMES.swamp.roles), THEMES.swamp.boss];
    for (const [i, t] of types.entries()) put(t, -18 + i * 5, 14);
    run(2);
    ok('all seven SWAMP models build and survive', g.enemies.length === 7 && g.enemies.every((e) => !e.dead && e.group.children.length > 10));
    const hop = (dodge, scale = 1, slow = false) => {
      clean(); const e = put('mudskipper', -5, 0); e.speed *= scale;
      if (slow) e.applyStatus('slow', 5);
      until(() => e.swampState === 'tell'); run(0.2);
      const early = HEALTH - p.health, x = e.pos.x;
      if (dodge) p.pos.z = 8;
      until(() => e.swampState === 'rest');
      return { early, damage: HEALTH - p.health, z: e.pos.z, travel: e.pos.x - x, slow: p.status.slowness };
    };
    const stay = hop(false), dodge = hop(true), fast = hop(true, 8), slowed = hop(true, 8, true);
    ok('mudskipper warns, then bites and slows a stationary target', stay.early === 0 && stay.damage > 0 && stay.slow > 0, JSON.stringify(stay));
    ok('side step defeats its committed hop', dodge.damage === 0 && Math.abs(dodge.z) < 0.1, JSON.stringify(dodge));
    ok('late-wave hop fits the lane and still respects slows', fast.travel + 1.7 <= 7.01 && slowed.travel < fast.travel * 0.8, JSON.stringify({ fast, slowed }));

    clean(); const recovering = put('mudskipper', -5, 0);
    until(() => recovering.swampState === 'rest');
    p.pos.copy(recovering.pos); p.health = HEALTH; p.invulnEnd = -1;
    run(0.7);
    ok('mudskipper recovery gives a real opening without a follow-up bite', p.health === HEALTH && recovering.swampState === 'rest');

    clean(); let e = put('reedstalker', -10, 0); e.speed = 0;
    const shots = [], spawn = g._spawnProjectile.bind(g);
    g._spawnProjectile = (...args) => {
      const result = spawn(...args), shot = g.projectiles.at(-1);
      shots.push({ type: args[3], angle: Math.atan2(shot.vel.z, shot.vel.x), time: g.time });
      return result;
    };
    run(0.3); ok('reedstalker holds fire during its tell', shots.length === 0);
    p.pos.z = 6; run(0.9);
    ok('bracketing pair precedes a centre dart on the captured bearing', shots.length === 3 &&
      Math.abs(shots[2].angle) < 0.02 && shots[0].angle < -0.1 && shots[1].angle > 0.1 &&
      shots[2].time - shots[0].time > 0.3, JSON.stringify(shots));

    const snap = (escape) => {
      clean(); const e = put('peatback', -3, 0); e.speed = 0;
      run(0.2); const closed = ENEMY_TYPES.peatback.armorDefault(e), early = HEALTH - p.health;
      if (escape) p.pos.z = 6;
      run(1); return { early, damage: HEALTH - p.health, closed, open: ENEMY_TYPES.peatback.armorDefault(e), marks: marks() };
    };
    const bite = snap(false), escaped = snap(true);
    ok('peatback shells during warning and exposes itself after the snap', bite.closed === 0.55 && bite.open === 1 && bite.early === 0 && bite.damage > 0 && bite.marks === 0, JSON.stringify(bite));
    ok('leaving the snap circle prevents damage', escaped.damage === 0, JSON.stringify(escaped));

    clean(); e = put('bubbletoad', -10, 0); e.speed = 0;
    run(0.85);
    const bubbles = g._mortars.map((m) => ({ x: m.x, z: m.z, delay: m.delay }));
    ok('bubbletoad marks a staggered transverse bank before damage', bubbles.length === 3 && new Set(bubbles.map((m) => m.z)).size === 3 && p.health === HEALTH, JSON.stringify(bubbles));
    p.pos.z = 8; run(2);
    ok('moving beyond the captured bubble bank avoids every eruption', p.health === HEALTH && g._mortars.length === 0);

    clean(); const lantern = put('fenlantern', -5, 0), ally = put('peatback', -6, 0), far = put('peatback', 15, 0), boss = put('miresovereign', -8, 0);
    for (const o of [lantern, ally, far, boss]) { o.speed = 0; o.attackCd = 99; }
    for (const o of [ally, far, boss]) o.applyStatus('poison', 8, 19);
    lantern.attackCd = 0; run(DT);
    ok('fenlantern cleanses a nearby ally but excludes distant enemies and bosses', ally.status.poison === 0 && ally._dot.poison === 0 && ally.poisonStacks === 1 && far.status.poison > 0 && boss.status.poison > 0);
    ally.applyStatus('slow', 8); run(1);
    ok('fresh statuses work during the lantern cooldown', ally.status.slow > 0);
    ally.applyStatus('freeze', 8); lantern.attackCd = 0; run(DT);
    ok('lantern cannot erase freeze', ally.status.freeze > 0);

    clean(); shots.length = 0; e = put('marshwing', -9, 0); e.speed = 0;
    run(0.6); const low = e.pos.y;
    ok('marshwing descends and warns before shooting', low < 3 && shots.length === 0, `height=${low}`);
    run(0.6); const fired = shots.length; run(1.4);
    ok('it fires two darts then climbs through a recovery window', fired === 2 && shots.length === 2 && e.pos.y > low, `shots=${shots.length} height=${e.pos.y}`);

    // ---- the MIRE SOVEREIGN rework --------------------------------------
    // One helper: run a frame so bs initialises, then pin every cast cooldown
    // shut except the one under test, so each cast is exercised alone.
    const arm = (e, cast, x) => {
      run(DT);
      const bs = e.bs;
      bs.t = 0; bs.state = 'prowl';
      bs.cdGulp = bs.cdCrush = bs.cdReeds = bs.cdTide = bs.cdDive = 99;
      if (cast) bs['cd' + cast[0].toUpperCase() + cast.slice(1)] = 0;
      return bs;
    };

    clean(); shots.length = 0; e = put('miresovereign', -15, 0);
    const casts = new Set(), vents = new Set();
    run(45, () => {
      if (e.bs.castNow) casts.add(e.bs.castNow);
      if (e.bs.weakOpen && e.bs.lastCast) vents.add(e.bs.lastCast);
    });
    ok('sovereign runs all five casts and vents after every one',
      casts.size === 5 && vents.size === 5, JSON.stringify({ casts: [...casts], vents: [...vents] }));
    e.bs.weakOpen = false; const closed = ENEMY_TYPES[e.type].armorDefault(e);
    e.bs.weakOpen = true; const open = ENEMY_TYPES[e.type].armorDefault(e);
    ok('closed crown resists damage; exposed throat takes full damage', closed === 0.65 && open === 1);

    clean(); e = put('miresovereign', -2.4, 0); e.speed = 0;
    arm(e, null);
    run(0.1);
    const nipped = HEALTH - p.health;
    run(1.0);
    ok('touching the sovereign bites immediately, then respects a cooldown',
      nipped > 0 && nipped <= 30 && HEALTH - p.health === nipped, JSON.stringify({ nipped, after: HEALTH - p.health }));

    const tide = (x, hold) => {
      clean(); const e = put('miresovereign', x, 0); e.speed = 0;
      const bs = arm(e, 'tide');
      until(() => bs.state === 'tide');
      p.extX = p.extZ = 0;
      run(0.7);
      const towed = p.extX, during = HEALTH - p.health;
      if (hold) p.pos.set(e.pos.x + 3.5, 0, 0);
      else p.pos.set(x + 30, 0, 0);
      until(() => bs.state === 'recover');
      return { towed, during, damage: HEALTH - p.health, open: bs.weakOpen };
    };
    const towed = tide(-9), bitten = tide(-9, true);
    ok('undertow drags you toward the jaw and costs nothing but position',
      towed.towed < -1 && towed.during === 0 && towed.damage === 0 && towed.open, JSON.stringify(towed));
    ok('whatever the inner ring still holds meets the jaw',
      bitten.damage > 0 && bitten.damage <= 26 && bitten.open, JSON.stringify(bitten));

    const reeds = (enraged, stay) => {
      clean(); const e = put('miresovereign', -8, 0); e.speed = 0;
      const bs = arm(e, 'reeds');
      if (enraged) e.hp = e.maxHp * 0.4;
      until(() => g._mortars.length > 0, 6);
      const nails = g._mortars.map((m) => ({ x: m.x, z: m.z }));
      const angles = nails.filter((n) => Math.hypot(n.x, n.z) > 3)
        .map((n) => Math.atan2(n.z, n.x)).sort((q, r) => q - r);
      let widest = 0;
      for (let i = 0; i < angles.length; i++) {
        const next = angles[(i + 1) % angles.length] + (i === angles.length - 1 ? Math.PI * 2 : 0);
        widest = Math.max(widest, next - angles[i]);
      }
      if (!stay) p.pos.set(30, 0, 0);
      run(4);
      return { n: nails.length, widest, damage: HEALTH - p.health };
    };
    const reedsStay = reeds(false, true), reedsRage = reeds(true, true), reedsGone = reeds(false, false);
    ok('reed burst rings where you WERE, gapped when calm, and the centre is never free',
      reedsStay.n === 9 && reedsStay.widest > 1.2 && reedsStay.damage > 0, JSON.stringify(reedsStay));
    ok('enraged closes the gap instead of widening the pool',
      reedsRage.n === 10 && reedsRage.widest < 1.0 && reedsRage.damage > 0, JSON.stringify(reedsRage));
    ok('leaving the captured ring beats every nail', reedsGone.damage === 0, JSON.stringify(reedsGone));

    const crush = (mode) => {
      // The cover case needs the box BETWEEN the two without touching the
      // boss's own 1.8m circle - resolveCircle would shove it out and into
      // touch range, which is a different test than the one being asked.
      const far = mode === 'cover';
      clean(); shots.length = 0; const e = put('miresovereign', far ? -3.9 : -3, 0); e.speed = 0;
      const bs = arm(e, 'crush');
      if (mode === 'rage') e.hp = e.maxHp * 0.4;
      until(() => bs.state === 'crushTell');
      const warned = marks() > 0;
      run(0.7);
      const beforeSlam = HEALTH - p.health;
      if (mode === 'jump') p.pos.y = 2.4;
      if (mode === 'cover') ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-2, 0, -3), new THREE.Vector3(-1, 6, 3))];
      until(() => bs.state === 'recover', 4);
      const ring = HEALTH - p.health;
      p.pos.set(30, 6, 0); p.invulnEnd = 1e9;
      run(1);
      return { warned, beforeSlam, ring, shots: shots.length, darts: shots.filter((s) => s.type === e.type).length };
    };
    const slam = crush(), jumped = crush('jump'), covered = crush('cover'), rage = crush('rage');
    ok('mud crush warns, waits out its tell, then slams a capped ring around itself',
      slam.warned && slam.beforeSlam === 0 && slam.ring > 0 && slam.ring <= 26, JSON.stringify(slam));
    ok('the hop and solid cover both answer the ring',
      jumped.ring === 0 && covered.ring === 0, JSON.stringify({ jumped, covered }));
    ok('the portal it spits down your old bearing widens with the enrage',
      slam.darts === 7 && rage.darts === 9, JSON.stringify({ slam: slam.darts, rage: rage.darts }));

    const dive = (flee) => {
      clean(); const e = put('miresovereign', -16, 0);
      const bs = arm(e, 'dive');
      until(() => bs.state === 'dive', 6);
      const wake = marks() > 0, x0 = e.pos.x;
      run(0.9);
      const speed = Math.abs(e.pos.x - x0) / 0.9;
      if (flee) p.pos.set(20, 18, 0);
      until(() => bs.weakOpen, 8);
      return { wake, speed, damage: HEALTH - p.health, open: bs.weakOpen, leaked: marks() };
    };
    const dived = dive(false), divedPast = dive(true);
    ok('the dive slides a lit wake across the arena and erupts on the still',
      dived.wake && dived.speed > 4 && dived.speed <= 9.5 && dived.damage > 0 && dived.damage <= 30 && dived.open && dived.leaked === 0,
      JSON.stringify(dived));
    ok('the eruption is a promise about ground, not a homing shot',
      divedPast.damage === 0 && divedPast.open && divedPast.leaked === 0, JSON.stringify(divedPast));

    clean(); e = put('miresovereign', -14, 0);
    const bs = arm(e, null); bs.t = 99;
    run(1.8);
    const bogs = g._hazard.filter((h) => h.kind === 'mire');
    ok('the sovereign wades, and the floor it crossed stays bog',
      bogs.length >= 3 && g._hazard.every((h) => h.kind === 'mire'), `n=${bogs.length}`);
    p.pos.set(bogs[0].x, 0, bogs[0].z);
    g._updateHazard(DT);
    ok('bog water grips your stride, not your blood',
      p.status.slowness > 0 && p.health === HEALTH, `slow=${p.status.slowness}`);

    for (const type of ['mudskipper', 'peatback']) {
      clean(); e = put(type, type === 'peatback' ? -3 : -5, 0);
      const held = [];
      while (true) { const h = g.effects.markAcquire(); if (h < 0) break; held.push(h); }
      run(0.2); held.forEach((h) => g.effects.markRelease(h));
      // A slot freed just before impact cannot buy a missing warning.
      run(1.2);
      ok(`${type} skips attacks when its warning pool was exhausted`, p.health === HEALTH && e.swampState !== 'rush' && e.swampState !== 'hop');
    }
    for (const cast of ['crush', 'reeds', 'dive', 'tide']) {
      clean(); e = put('miresovereign', cast === 'dive' ? -13 : cast === 'reeds' ? -6 : -5, 0); e.speed = 0;
      arm(e, cast);
      const held = [];
      while (true) { const h = g.effects.markAcquire(); if (h < 0) break; held.push(h); }
      run(2.5); held.forEach((h) => g.effects.markRelease(h));
      run(1.5);
      ok(`${cast} with no warning pool left never lands a hit`, p.health === HEALTH && marks() === 0,
        `health=${HEALTH - p.health} marks=${marks()} state=${e.bs.state}`);
    }
    for (const type of ['mudskipper', 'peatback']) {
      clean(); e = put(type, type === 'peatback' ? -3 : -5, 0);
      until(() => e.swMark >= 0);
      const before = marks(); e.takeDamage(1e9); run(DT);
      ok(`${type} killed mid-tell returns its warning handle`, before > 0 && marks() === 0, `before=${before} after=${marks()}`);
    }
    clean(); e = put('miresovereign', -7, 0); e.speed = 0;
    arm(e, 'crush');
    until(() => e.bs.mark >= 0);
    const heldNow = marks(); e.takeDamage(1e9); run(DT);
    ok('sovereign killed mid-tell returns its warning handle', heldNow > 0 && marks() === 0, `before=${heldNow} after=${marks()}`);
    clean(); run(2); ok('reset drains all remaining telegraphs', marks() === 0);
    g._spawnProjectile = spawn;
    return rows;
  });
  for (const row of rows) {
    console.log(`${row.pass ? '  ok  ' : '  FAIL'} ${row.name} ${row.detail}`);
    if (!row.pass) fails++;
  }
  if (errors.length) { console.log(errors.join('\n')); fails++; }
} finally { await browser?.close(); server.kill(); }
console.log(fails ? `SWAMP TEST FAIL (${fails})` : 'SWAMP TEST PASS');
process.exitCode = fails ? 1 : 0;
