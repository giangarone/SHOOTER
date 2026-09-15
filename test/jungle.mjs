// JUNGLE's counterplay, run through real browser entities at fixed game ticks.
// Captured attacks, real escape routes, support counterplay and boss recovery
// are checked as differences, including exhausted and interrupted warnings.
import { launchBrowser, startServer } from './harness.mjs';
const PORT = 8258;
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
      g.waveState = 'active'; g.queue.length = 0; g.queue.push('vinecat'); g.spawnTimer = 1e6;
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
    const types = [...Object.values(THEMES.jungle.roles), THEMES.jungle.boss];
    for (const [i, t] of types.entries()) put(t, -18 + i * 5, 14);
    run(2);
    ok('all seven JUNGLE models build and survive', g.enemies.length === 7 && g.enemies.every((e) => !e.dead && e.group.children.length > 10));
    const pounce = (escape, scale = 1, slow = false, cover = false) => {
      clean(); const e = put('vinecat', -5, 0); e.speed *= scale;
      if (slow) e.applyStatus('slow', 5);
      until(() => e.state === 'tell'); run(0.3);
      const early = HEALTH - p.health, x = e.pos.x;
      if (escape) p.pos.z = 8;
      if (cover) ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(-2, 6, 3))];
      until(() => e.state === 'rest');
      return { early, damage: HEALTH - p.health, travel: e.pos.x - x, z: e.pos.z };
    };
    const hit = pounce(false), dodge = pounce(true), fast = pounce(true, 8), slow = pounce(true, 8, true), covered = pounce(false, 1, false, true);
    ok('vinecat warns then pounces onto a stationary target', hit.early === 0 && hit.damage > 0, JSON.stringify(hit));
    ok('sidestepping defeats the fixed pounce bearing', dodge.damage === 0 && Math.abs(dodge.z) < 0.1, JSON.stringify(dodge));
    ok('late-wave pounces fit the warning and respect slow', fast.travel + 1.5 <= 7.01 && slow.travel < fast.travel * 0.8, JSON.stringify({ fast, slow }));
    ok('cover stops a pounce without contact damage', covered.damage === 0 && covered.travel < 3, JSON.stringify(covered));
    const shots = [], spawn = g._spawnProjectile.bind(g);
    g._spawnProjectile = (...args) => {
      const result = spawn(...args), shot = g.projectiles.at(-1);
      shots.push({ type: args[3], angle: Math.atan2(shot.vel.z, shot.vel.x), time: g.time }); return result;
    };
    clean(); let e = put('quillmonkey', -10, 0); e.speed = 0;
    run(0.3); ok('quillmonkey plants before shooting', shots.length === 0);
    p.pos.z = 8; run(0.5); const z = e.pos.z; e.speed = 2.3; run(0.5);
    ok('monkey fires three quills on captured aim then bounds sideways', shots.length === 3 && Math.abs(shots[1].angle) < 0.02 && Math.abs(e.pos.z - z) > 0.5, JSON.stringify(shots));
    const roots = (escape) => {
      clean(); const e = put('rootgorilla', -4, 0); e.speed = 0;
      run(0.3); const armor = ENEMY_TYPES.rootgorilla.armorDefault(e), early = HEALTH - p.health;
      if (escape) p.pos.z = 8;
      run(1.5); return { early, armor, damage: HEALTH - p.health, open: ENEMY_TYPES.rootgorilla.armorDefault(e), marks: marks() };
    };
    const rootHit = roots(false), rootDodge = roots(true);
    ok('gorilla braces and drives three roots down a captured line', rootHit.early === 0 && rootHit.damage > 0 && rootHit.armor === 0.55 && rootHit.open === 1 && rootHit.marks === 0, JSON.stringify(rootHit));
    ok('a side step escapes all root pulses', rootDodge.damage === 0);
    const seed = (escape) => {
      clean(); const e = put('seedpod', -10, 0); e.speed = 0;
      run(0.3); const count = e.groundPattern.length, early = HEALTH - p.health;
      if (escape) p.pos.z = 9;
      run(1.8); return { count, early, damage: HEALTH - p.health, marks: marks() };
    };
    const seedHit = seed(false), seedDodge = seed(true);
    ok('seedpod marks a centre seed and its two split impacts', seedHit.count === 3 && seedHit.early === 0 && seedHit.damage > 0 && seedHit.marks === 0, JSON.stringify(seedHit));
    ok('leaving the captured seed fork avoids damage', seedDodge.damage === 0);
    const pollen = (mode) => {
      clean(); const orchid = put('orchidkeeper', -6, 0), ally = put('quillmonkey', -7, 0), far = put('quillmonkey', 15, 0), boss = put('canopytitan', -9, 0);
      for (const o of [orchid, ally, far, boss]) { o.speed = 0; o.attackCd = 10; }
      orchid.attackCd = mode === 'none' ? 99 : 0; run(0.3); const early = ally.attackCd;
      if (mode === 'move') ally.pos.x = 15;
      if (mode === 'kill') orchid.takeDamage(1e9);
      if (mode === 'cover') ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-6.7, 0, -3), new THREE.Vector3(-6.6, 6, 3))];
      run(0.9); return { early, cd: ally.attackCd, far: far.attackCd, boss: boss.attackCd };
    };
    const base = pollen('none'), aided = pollen('stay');
    ok('orchid channels before advancing one ally cooldown, excluding bosses and range', Math.abs(base.cd - aided.cd - 1.5) < 0.01 && aided.early === base.early && aided.far === base.far && aided.boss === base.boss, JSON.stringify({ base, aided }));
    for (const mode of ['move', 'kill', 'cover']) { const r = pollen(mode); ok(`${mode} interrupts pollen`, Math.abs(r.cd - base.cd) < 0.01, JSON.stringify(r)); }
    const firstQuill = (aided) => {
      clean(); shots.length = 0;
      const orchid = put('orchidkeeper', -6, 0), ally = put('quillmonkey', -7, 0);
      orchid.speed = ally.speed = 0; orchid.attackCd = aided ? 0 : 99; ally.attackCd = 2.5;
      const start = g.time; run(3.8);
      return shots.find((s) => s.type === 'quillmonkey')?.time - start;
    };
    const unaidedShot = firstQuill(false), aidedShot = firstQuill(true);
    ok('pollen makes a real ally volley arrive earlier while retaining its warning',
      unaidedShot - aidedShot > 1.3 && aidedShot >= 1.6, JSON.stringify({ unaidedShot, aidedShot }));
    clean(); shots.length = 0; e = put('sunfeather', -10, 0); e.speed = 0;
    run(0.5); const high = e.pos.y;
    ok('sunfeather climbs before its high fan', high > 3.5 && shots.length === 0, `height=${high}`);
    run(0.7); const first = shots.length; p.pos.z = 8; run(0.8); const low = e.pos.y;
    ok('three high feathers precede a separately warned low dart', first === 3 && shots.length === 4 && low < high && Math.abs(shots[3].angle) < 0.02, JSON.stringify({ shots, low, high }));

    clean(); shots.length = 0; e = put('canopytitan', -10, 0); e.speed = 0;
    const attacks = new Set(), windows = new Set();
    run(34, () => { if (e.bs.attack) attacks.add(e.bs.attack); if (e.bs.weakOpen) windows.add(e.bs.attack); });
    ok('boss cycles four attacks and exposes its heart after every one', attacks.size === 4 && windows.size === 4, JSON.stringify({ attacks: [...attacks], windows: [...windows] }));
    ok('boss fires real projectile salvos', shots.filter((s) => s.type === e.type).length >= 15);
    e.bs.weakOpen = false; const closed = ENEMY_TYPES[e.type].armorDefault(e);
    e.bs.weakOpen = true; const open = ENEMY_TYPES[e.type].armorDefault(e);
    ok('heart window removes the closed armour', closed === 0.65 && open === 1);
    const bossPattern = (attack, rage, escape = false) => {
      clean(); shots.length = 0; const e = put('canopytitan', -10, 0); e.speed = 0;
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
    const impact = bossPattern(3, false), escape = bossPattern(3, false, true);
    ok('boss ground attack warns, hits captured position, and can be escaped', impact.early === 0 && impact.damage > 0 && escape.damage === 0 && impact.marks === 0 && impact.open && impact.gap > 1, JSON.stringify({ impact, escape }));

    const rush = (escape, cover = false, slow = false) => {
      clean(); const e = put('canopytitan', -7, 0); e.speed *= 8; e.damage *= 20;
      if (slow) e.applyStatus('slow', 8);
      e.state = 'stalk'; e.timer = 0; e.bs.turn = 1;
      until(() => e.laneMark >= 0); run(0.3); const x = e.pos.x, early = HEALTH - p.health;
      if (escape) p.pos.z = 10;
      if (cover) ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-4, 0, -3), new THREE.Vector3(-3, 6, 3))];
      until(() => e.bs.weakOpen);
      return { early, damage: HEALTH - p.health, travel: e.pos.x - x, z: e.pos.z, open: e.bs.weakOpen };
    };
    const rushHit = rush(false), rushDodge = rush(true), rushCover = rush(false, true), rushSlow = rush(true, false, true);
    ok('stampede warns and caps late-wave travel and damage', rushHit.early === 0 && rushHit.damage > 0 && rushHit.damage <= 30 && rushHit.travel + 2.8 <= 12.01 && rushHit.open, JSON.stringify(rushHit));
    ok('stampede never turns onto a side step', rushDodge.damage === 0 && Math.abs(rushDodge.z) < 0.1, JSON.stringify(rushDodge));
    ok('cover stops stampede and opens the heart', rushCover.damage === 0 && rushCover.travel < 4 && rushCover.open, JSON.stringify(rushCover));
    ok('stampede still respects player slows', rushSlow.travel < rushDodge.travel * 0.8, JSON.stringify(rushSlow));


    const rootBranch = (side) => {
      clean(); const e = put('canopytitan', -10, 0); e.speed = 0;
      e.state = 'stalk'; e.timer = 0; e.bs.turn = 0; run(0.3);
      p.pos.z = side ? 1.8 : 0; run(2.2);
      return HEALTH - p.health;
    };
    const branchHit = rootBranch(true), corridor = rootBranch(false);
    ok('Titan roots hit the branching lanes and preserve the central corridor', branchHit > 0 && corridor === 0, JSON.stringify({ branchHit, corridor }));

    for (let attack = 0; attack < 4; attack++) {
      clean(); shots.length = 0; e = put('canopytitan', -5, 0); e.speed = 0;
      e.state = 'stalk'; e.timer = 0; e.bs.turn = attack; run(0.3);
      const name = e.bs.attack;
      e.takeDamage(1e9); run(DT); p.health = HEALTH; p.invulnEnd = -1; run(3);
      ok(`boss death cancels ${name} before impact and releases its warnings`, p.health === HEALTH && marks() === 0 && shots.length === 0);
    }
    for (const type of ['vinecat', 'rootgorilla', 'seedpod', 'canopytitan']) {
      clean(); e = put(type, -3, 0); e.speed = 0;
      if (e.boss) { e.state = 'stalk'; e.timer = 0; e.bs.turn = 0; }
      const held = [];
      while (true) { const h = g.effects.markAcquire(); if (h < 0) break; held.push(h); }
      run(0.3); held.forEach((h) => g.effects.markRelease(h));
      run(2.5);
      ok(`${type} cannot hit after failing to acquire its warning`, p.health === HEALTH, `damage=${HEALTH - p.health}`);
    }
    for (const type of ['vinecat', 'rootgorilla', 'seedpod', 'canopytitan']) {
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
console.log(fails ? `JUNGLE TEST FAIL (${fails})` : 'JUNGLE TEST PASS');
process.exitCode = fails ? 1 : 0;
