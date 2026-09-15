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

    clean(); shots.length = 0; e = put('miresovereign', -10, 0);
    const attacks = new Set(), windows = new Set();
    run(22, () => { if (e.bs.attack) attacks.add(e.bs.attack); if (e.bs.weakOpen) windows.add(e.bs.attack); });
    ok('sovereign cycles through all three attacks and opens after each', attacks.size === 3 && windows.size === 3, JSON.stringify([...attacks]));
    ok('sovereign actually fires its fan', shots.filter((s) => s.type === e.type).length >= 5);
    e.bs.weakOpen = false; const closed = ENEMY_TYPES[e.type].armorDefault(e);
    e.bs.weakOpen = true; const open = ENEMY_TYPES[e.type].armorDefault(e);
    ok('closed crown resists damage; exposed throat takes full damage', closed === 0.65 && open === 1);
    const volley = (enrage, attack) => {
      clean(); shots.length = 0; const e = put('miresovereign', -10, 0); e.speed = 0;
      if (enrage) e.hp = e.maxHp * 0.4;
      e.swampState = 'stalk'; e.swT = 0; e.bs.turn = attack;
      run(1.3); return { shots: shots.length, mortars: g._mortars.length, open: e.bs.weakOpen };
    };
    const calmFan = volley(false, 2), rageFan = volley(true, 2), calmBog = volley(false, 1), rageBog = volley(true, 1);
    ok('half health widens both ranged attacks while preserving recovery', calmFan.shots === 5 && rageFan.shots === 7 && calmBog.mortars === 6 && rageBog.mortars === 8 && rageBog.open, JSON.stringify({ calmFan, rageFan, calmBog, rageBog }));
    const rush = (escape, fast = false, cover = false) => {
      clean(); const e = put('miresovereign', -7, 0);
      if (fast) { e.speed *= 8; e.damage *= 20; }
      e.swampState = 'stalk'; e.swT = 0; e.bs.turn = 0;
      until(() => e.swMark >= 0); run(0.2);
      const early = HEALTH - p.health, x = e.pos.x;
      if (escape) p.pos.z = 10;
      if (cover) ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-4, 0, -3), new THREE.Vector3(-3, 6, 3))];
      until(() => e.swampState === 'rest');
      return { early, damage: HEALTH - p.health, travel: e.pos.x - x, z: e.pos.z, open: e.bs.weakOpen };
    };
    const rushHit = rush(false, true), rushDodge = rush(true, true), rushCover = rush(false, false, true);
    ok('late-wave jaw rush warns, hits once with capped damage and stays inside its lane',
      rushHit.early === 0 && rushHit.damage > 0 && rushHit.damage <= 30 && rushHit.travel + 3 <= 12.01 && rushHit.open, JSON.stringify(rushHit));
    ok('side step defeats the jaw rush without it steering', rushDodge.damage === 0 && Math.abs(rushDodge.z) < 0.1, JSON.stringify(rushDodge));
    ok('solid cover stops the rush and opens the throat', rushCover.damage === 0 && rushCover.travel < 4 && rushCover.open, JSON.stringify(rushCover));

    const bogDamage = (escape) => {
      clean(); const e = put('miresovereign', -10, 0); e.speed = 0;
      e.swampState = 'stalk'; e.swT = 0; e.bs.turn = 1;
      run(1.3); const early = HEALTH - p.health;
      if (escape) p.pos.x = 8;
      run(2); return { early, damage: HEALTH - p.health };
    };
    const bogStay = bogDamage(false), bogEscape = bogDamage(true);
    ok('bog eruptions damage the captured centre only after warning; open side escapes', bogStay.early === 0 && bogStay.damage > 0 && bogEscape.damage === 0, JSON.stringify({ bogStay, bogEscape }));

    for (const type of ['mudskipper', 'peatback', 'miresovereign']) {
      clean(); e = put(type, type === 'peatback' ? -3 : -5, 0);
      if (e.boss) { e.swampState = 'stalk'; e.swT = 0; e.bs.turn = 0; }
      const held = [];
      while (true) { const h = g.effects.markAcquire(); if (h < 0) break; held.push(h); }
      run(0.2); held.forEach((h) => g.effects.markRelease(h));
      // A slot freed just before impact cannot buy a missing warning.
      run(1.2);
      ok(`${type} skips attacks when its warning pool was exhausted`, p.health === HEALTH && e.swampState !== 'rush' && e.swampState !== 'hop');
    }
    for (const type of ['mudskipper', 'peatback', 'miresovereign']) {
      clean(); e = put(type, type === 'peatback' ? -3 : -5, 0);
      until(() => e.swMark >= 0);
      const before = marks(); e.takeDamage(1e9); run(DT);
      ok(`${type} killed mid-tell returns its warning handle`, before > 0 && marks() === 0, `before=${before} after=${marks()}`);
    }
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
