// CORAL's counterplay, run through real browser entities at fixed game ticks.
// Captured attacks, real escape routes, support counterplay and boss recovery
// are checked as differences, including exhausted and interrupted warnings.
import { launchBrowser, startServer } from './harness.mjs';
const PORT = 8257;
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
      g.waveState = 'active'; g.queue.length = 0; g.queue.push('razorfin'); g.spawnTimer = 1e6;
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
    const types = [...Object.values(THEMES.coral.roles), THEMES.coral.boss];
    for (const [i, t] of types.entries()) put(t, -18 + i * 5, 14);
    run(2);
    ok('all seven CORAL models build and survive', g.enemies.length === 7 && g.enemies.every((e) => !e.dead && e.group.children.length > 10));
    const cuts = (escape) => {
      clean(); const e = put('razorfin', -3, 0); e.speed = 0;
      run(0.3); const early = HEALTH - p.health;
      if (escape) p.pos.z = 6;
      run(1.1); return { early, damage: HEALTH - p.health, state: e.state, marks: marks() };
    };
    const hit = cuts(false), dodge = cuts(true);
    ok('razorfin warns, cuts twice, then gives a harmless recovery', hit.early === 0 && hit.damage > 0 && hit.state === 'rest' && hit.marks === 0, JSON.stringify(hit));
    ok('crossing the blade line avoids both captured cuts', dodge.damage === 0, JSON.stringify(dodge));
    const shots = [], spawn = g._spawnProjectile.bind(g);
    g._spawnProjectile = (...args) => {
      const result = spawn(...args), shot = g.projectiles.at(-1);
      shots.push({ type: args[3], angle: Math.atan2(shot.vel.z, shot.vel.x), time: g.time }); return result;
    };
    clean(); let e = put('needlepolyp', -10, 0); e.speed = 0;
    run(0.4); ok('needlepolyp warns before its first fan', shots.length === 0);
    p.pos.z = 8; run(1.2);
    ok('five needles close onto the old bearing in three volleys', shots.length === 5 &&
      Math.abs(shots[0].angle + 0.3) < 0.02 && Math.abs(shots[2].angle + 0.15) < 0.02 &&
      Math.abs(shots[4].angle) < 0.02 && shots[4].time - shots[0].time > 0.6, JSON.stringify(shots));
    const clam = (escape) => {
      clean(); const e = put('clamguard', -2, 0); e.speed = 0;
      run(0.3); const armor = ENEMY_TYPES.clamguard.armorDefault(e), early = HEALTH - p.health;
      if (escape) p.pos.z = 9;
      run(1.5); return { armor, early, damage: HEALTH - p.health, open: ENEMY_TYPES.clamguard.armorDefault(e), marks: marks() };
    };
    const snap = clam(false), away = clam(true);
    ok('clam closes its shell for a snap and outer crown, then exposes the pearl', snap.armor === 0.55 && snap.open === 1 && snap.early === 0 && snap.damage > 0 && snap.marks === 0, JSON.stringify(snap));
    ok('escaping the shell and crown prevents their damage', away.damage === 0);
    clean(); e = put('clamguard', -2, 0); e.speed = 0; run(0.95);
    p.pos.copy(e.pos); p.health = HEALTH; p.invulnEnd = -1; run(0.8);
    ok('the centre is safe after the snap while the outer crown erupts', p.health === HEALTH);
    const bloom = (escape, type = 'bloomcoral') => {
      clean(); const e = put(type, -10, 0); e.speed = 0;
      run(0.3); const points = e.groundPattern.map((q) => ({ x: q.x, z: q.z })), early = HEALTH - p.health;
      if (escape) p.pos.z = 10;
      run(2.5); return { points, early, damage: HEALTH - p.health, marks: marks() };
    };
    const still = bloom(false), escaped = bloom(true);
    ok('bloomcoral erupts at the captured centre and three staggered petals', still.points.length === 4 && still.early === 0 && still.damage > 0 && still.marks === 0, JSON.stringify(still));
    ok('leaving the bloom escapes all four impacts', escaped.damage === 0);
    const trail = bloom(false, 'reefray'), trailDodge = bloom(true, 'reefray');
    ok('the flying ray hits the ground in three warned steps', trail.points.length === 3 && trail.early === 0 && trail.damage > 0 && trail.marks === 0, JSON.stringify(trail));
    ok('moving across the captured ray trail avoids its hits', trailDodge.damage === 0);
    const heal = (mode) => {
      clean(); const nurse = put('pearlnurse', -6, 0), ally = put('clamguard', -7, 0), far = put('clamguard', 15, 0), boss = put('reefempress', -9, 0);
      for (const o of [nurse, ally, far, boss]) { o.speed = 0; o.attackCd = 99; }
      for (const o of [ally, far, boss]) o.hp = o.maxHp * 0.5;
      nurse.attackCd = 0; run(0.3); const early = ally.hp;
      if (mode === 'move') ally.pos.x = 15;
      if (mode === 'kill') nurse.takeDamage(1e9);
      if (mode === 'cover') ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-6.7, 0, -3), new THREE.Vector3(-6.6, 6, 3))];
      run(1); return { early, hp: ally.hp, far: far.hp, boss: boss.hp, max: ally.maxHp };
    };
    const healed = heal('stay');
    ok('pearl channel heals one nearby injured ally, excludes bosses and range', healed.early === 75 && healed.hp === 93 && healed.far === 75 && healed.boss === 1650, JSON.stringify(healed));
    for (const mode of ['move', 'kill', 'cover']) {
      const r = heal(mode); ok(`${mode} interrupts pearl healing`, r.hp === r.early, JSON.stringify(r));
    }

    clean(); shots.length = 0; e = put('reefempress', -10, 0); e.speed = 0;
    const attacks = new Set(), windows = new Set();
    run(34, () => { if (e.bs.attack) attacks.add(e.bs.attack); if (e.bs.weakOpen) windows.add(e.bs.attack); });
    ok('boss cycles four attacks and exposes its heart after every one', attacks.size === 4 && windows.size === 4, JSON.stringify({ attacks: [...attacks], windows: [...windows] }));
    ok('boss fires real projectile salvos', shots.filter((s) => s.type === e.type).length >= 15);
    e.bs.weakOpen = false; const closed = ENEMY_TYPES[e.type].armorDefault(e);
    e.bs.weakOpen = true; const open = ENEMY_TYPES[e.type].armorDefault(e);
    ok('heart window removes the closed armour', closed === 0.65 && open === 1);
    const bossPattern = (attack, rage, escape = false) => {
      clean(); shots.length = 0; const e = put('reefempress', -10, 0); e.speed = 0;
      if (rage) e.hp = e.maxHp * 0.4;
      e.state = 'stalk'; e.timer = 0; e.bs.turn = attack;
      run(0.3); const early = HEALTH - p.health, count = e.groundPattern?.length || 0;
      if (escape) p.pos.z = 12;
      until(() => e.bs.weakOpen, 6); run(DT);
      const result = { early, count, damage: HEALTH - p.health, shots: shots.length,
        open: e.bs.weakOpen, gap: Math.abs(e.shutters[0].position.x), marks: marks() };
      p.pos.set(18, 0, 18); p.health = HEALTH; p.invulnEnd = -1;
      run(1.5); result.recovery = e.bs.weakOpen;
      return result;
    };
    const calm = bossPattern(2, false), rage = bossPattern(2, true);
    ok('enrage widens salvos without shortening recovery', calm.shots === 15 && rage.shots === 21 && calm.recovery && rage.recovery, JSON.stringify({ calm, rage }));
    const calmCrown = bossPattern(3, false, true), rageCrown = bossPattern(3, true, true);
    ok('enrage adds crown impacts while preserving an escape and recovery', rageCrown.count > calmCrown.count && rageCrown.damage === 0 && calmCrown.damage === 0 && rageCrown.recovery, JSON.stringify({ calmCrown, rageCrown }));
    const impact = bossPattern(0, false), escape = bossPattern(0, false, true);
    ok('boss ground attack warns, hits captured position, and can be escaped', impact.early === 0 && impact.damage > 0 && escape.damage === 0 && impact.marks === 0 && impact.open && impact.gap > 1, JSON.stringify({ impact, escape }));


    const reefHit = bossPattern(1, false), reefDodge = bossPattern(1, false, true);
    ok('advancing reef rows hit the old centre but leave the flanks open',
      reefHit.count === 6 && reefHit.damage > 0 && reefDodge.damage === 0 && reefHit.recovery, JSON.stringify({ reefHit, reefDodge }));
    for (const enraged of [false, true]) {
      clean(); e = put('reefempress', -10, 0); e.speed = 0;
      if (enraged) e.hp = e.maxHp * 0.4;
      e.state = 'stalk'; e.timer = 0; e.bs.turn = 3; run(0.3);
      p.pos.set(4.5, 0, 0); run(2.5);
      ok(`crown has a real forward escape wedge, enrage=${enraged}`, p.health === HEALTH && e.bs.weakOpen);
    }

    for (let attack = 0; attack < 4; attack++) {
      clean(); shots.length = 0; e = put('reefempress', -5, 0); e.speed = 0;
      e.state = 'stalk'; e.timer = 0; e.bs.turn = attack; run(0.3);
      const name = e.bs.attack;
      e.takeDamage(1e9); run(DT); p.health = HEALTH; p.invulnEnd = -1; run(3);
      ok(`boss death cancels ${name} before impact and releases its warnings`, p.health === HEALTH && marks() === 0 && shots.length === 0);
    }
    for (const type of ['razorfin', 'clamguard', 'bloomcoral', 'reefray', 'reefempress']) {
      clean(); e = put(type, -3, 0); e.speed = 0;
      if (e.boss) { e.state = 'stalk'; e.timer = 0; e.bs.turn = 0; }
      const held = [];
      while (true) { const h = g.effects.markAcquire(); if (h < 0) break; held.push(h); }
      run(0.3); held.forEach((h) => g.effects.markRelease(h));
      run(2.5);
      ok(`${type} cannot hit after failing to acquire its warning`, p.health === HEALTH, `damage=${HEALTH - p.health}`);
    }
    for (const type of ['razorfin', 'clamguard', 'bloomcoral', 'reefray', 'reefempress']) {
      clean(); e = put(type, -3, 0); e.speed = 0;
      if (e.boss) { e.state = 'stalk'; e.timer = 0; e.bs.turn = 0; }
      until(() => marks() > 0); const before = marks(); e.takeDamage(1e9); run(DT);
      ok(`${type} death returns every owned warning`, before > 0 && marks() === 0, `before=${before} after=${marks()}`);
      p.health = HEALTH; p.invulnEnd = -1; run(3);
      ok(`${type} leaves no delayed hit after death`, p.health === HEALTH);
    }
    clean(); run(2); ok('reset drains all warning handles', marks() === 0);
    g._spawnProjectile = spawn;
    return rows;
  });
  for (const row of rows) {
    console.log(`${row.pass ? '  ok  ' : '  FAIL'} ${row.name} ${row.detail}`);
    if (!row.pass) fails++;
  }
  if (errors.length) { console.log(errors.join('\n')); fails++; }
} finally { await browser?.close(); server.kill(); }
console.log(fails ? `CORAL TEST FAIL (${fails})` : 'CORAL TEST PASS');
process.exitCode = fails ? 1 : 0;
