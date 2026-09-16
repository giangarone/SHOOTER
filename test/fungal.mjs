// FUNGAL: real entities on fixed ticks. Compare committed attacks against
// dodges, interrupted support channels, enrage patterns and exhausted warnings.
import { launchBrowser, startServer } from './harness.mjs';
const PORT = 8259;
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
      g.waveState = 'active'; g.queue.length = 0; g.queue.push('buttonling'); g.spawnTimer = 1e6;
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
    const shots = [], spawn = g._spawnProjectile.bind(g);
    g._spawnProjectile = (...args) => {
      const result = spawn(...args), shot = g.projectiles.at(-1);
      shots.push({ type: args[3], angle: Math.atan2(shot.vel.z, shot.vel.x), time: g.time });
      return result;
    };
    clean(); run(1); ok('empty arena costs no health', p.health === HEALTH);
    const theme = THEMES.fungal;
    for (const [i, type] of [...Object.values(theme.roles), theme.boss].entries()) put(type, -18 + i * 5, 14);
    run(2);
    ok('all seven models build and survive browser updates', g.enemies.length === 7 && g.enemies.every((e) => !e.dead && e.group.children.length > 10));
    const stomp = (type, escape, cover = false) => {
      clean(); const e = put(type, -2, 0); e.speed = 0;
      run(0.2); const early = HEALTH - p.health, armor = ENEMY_TYPES[type].armorDefault?.(e);
      if (escape) p.pos.z = 8;
      if (cover) ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-1.5, 0, -3), new THREE.Vector3(-1, 5, 3))];
      run(0.8);
      return { early, damage: HEALTH - p.health, armor, after: ENEMY_TYPES[type].armorDefault?.(e), mortars: g._mortars.length };
    };
    for (const type of ['buttonling', 'bracketback']) {
      const stay = stomp(type, false), dodge = stomp(type, true), cover = stomp(type, false, true);
      ok(`${type} warns before impact; escaping or solid cover prevents contact`, stay.early === 0 && stay.damage > 0 && dodge.damage === 0 && cover.damage === 0, JSON.stringify({ stay, dodge, cover }));
      if (type === 'bracketback') ok('bracketback sheds armour and fruits twice after its stomp', stay.armor === 0.6 && stay.after === 1 && stay.mortars === 2);
    }
    clean(); shots.length = 0; let e = put('gillspitter', -10, 0); e.speed = 0;
    run(0.3); ok('gillspitter holds its volley through the tell', shots.length === 0);
    p.pos.z = 7; run(DT);
    ok('gunner keeps its visible aim on the captured bearing', Math.abs(e.group.rotation.y + Math.PI / 2) < 0.02); run(0.5);
    ok('first fan brackets the old bearing', shots.length === 2 && Math.abs(shots[0].angle + 0.11) < 0.02 && Math.abs(shots[1].angle - 0.11) < 0.02, JSON.stringify(shots));
    shots.length = 0; e.attackCd = 0; run(0.8);
    ok('second fan fills the central gap with a third shot', shots.length === 3);
    clean(); e = put('puffmortar', -10, 0); e.speed = 0;
    run(0.4); ok('puffmortar inflates before releasing growth', g._mortars.length === 0 && e.sack.scale.x > e.scale);
    p.pos.z = 7; run(DT);
    ok('gunner keeps its visible aim on the captured bearing', Math.abs(e.group.rotation.y + Math.PI / 2) < 0.02); run(0.5);
    const blooms = g._mortars.map((m) => ({ x: m.x, z: m.z, delay: m.delay }));
    ok('puffmortar captures a centre then branches away from it', blooms.length === 3 && blooms[0].x === 0 && blooms[0].z === 0 && blooms[1].delay > blooms[0].delay, JSON.stringify(blooms));
    run(2); ok('moving off the old growth defeats all three eruptions', p.health === HEALTH);
    const heal = (interrupt) => {
      clean(); const nurse = put('mycelarch', -8, 0), ally = put('bracketback', -6, 0);
      nurse.speed = ally.speed = 0; ally.hp = ally.maxHp * 0.5;
      const hp = ally.hp; run(0.4); const early = ally.hp - hp;
      if (interrupt === 'range') ally.pos.z = 15;
      if (interrupt === 'death') nurse.takeDamage(1e9);
      if (interrupt === 'cover') ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-7.5, 0, -2), new THREE.Vector3(-7, 4, 2))];
      run(1); return { early, restored: ally.hp - hp };
    };
    const healed = heal(''), broken = ['range', 'death', 'cover'].map(heal);
    ok('mycelarch channels a heal; range, cover or death breaks the link', healed.early === 0 && healed.restored > 0 && broken.every((x) => x.restored === 0), JSON.stringify({ healed, broken }));
    clean(); const nurse = put('mycelarch', -8, 0), ally = put('bracketback', -6, 0), boss = put('sporeregent', -10, 0);
    for (const o of [nurse, ally, boss]) { o.speed = 0; o.hp = o.maxHp * 0.5; }
    boss.applyStatus('freeze', 100); run(35);
    ok('mycelium healing has a lifetime budget and never repairs bosses', ally.fungalMended <= ally.maxHp * 0.24 + 0.001 && ally.fungalMended > 0 && boss.hp === boss.maxHp * 0.5, `healed=${ally.fungalMended}`);
    clean(); e = put('veilray', -8, 0); e.speed = 0;
    run(0.4); p.pos.z = 8; run(0.6);
    const trail = g._mortars.map((m) => ({ x: m.x, z: m.z, delay: m.delay }));
    ok('veilray seeds three separated spots on a captured line and retreats', trail.length === 3 && trail.every((m) => Math.abs(m.z) < 0.01) && trail[2].x > trail[0].x + 4 && e.escape > 0, JSON.stringify(trail));
    run(2); ok('sidestepping the veilray seed trail avoids damage', p.health === HEALTH);
    clean(); shots.length = 0; e = put('sporeregent', -10, 0); e.speed = 0;
    const attacks = new Set(), windows = new Set();
    run(24, () => { if (e.bs.attack) attacks.add(e.bs.attack); if (e.bs.weakOpen) windows.add(e.bs.attack); });
    ok('regent performs all three attacks, each with an exposed-heart recovery', attacks.size === 3 && windows.size === 3 && shots.length >= 15, JSON.stringify([...attacks]));
    const pattern = (turn, rage = false, escape = false) => {
      clean(); shots.length = 0; const e = put('sporeregent', -10, 0); e.speed = 0;
      if (rage) e.hp = e.maxHp * 0.4;
      e.state = 'stalk'; e.timer = 0; e.bs.turn = turn;
      run(0.4); const early = shots.length + g._mortars.length;
      if (escape) p.pos.z = 10;
      run(0.85); const count = g._mortars.length;
      run(2); return { early, count, shots: shots.length, damage: HEALTH - p.health, open: e.bs.weakOpen,
        gap: Math.abs(e.shutters[0].position.x - e.shutters[1].position.x), armor: ENEMY_TYPES[e.type].armorDefault(e) };
    };
    const roots = pattern(0), angryRoots = pattern(0, true), spiral = pattern(1), angrySpiral = pattern(1, true);
    const bloom = pattern(2), angryBloom = pattern(2, true), escaped = pattern(2, false, true);
    ok('enrage extends forks, spiral and ring without shortening the opening', roots.count === 6 && angryRoots.count === 8 && spiral.shots === 15 && angrySpiral.shots === 20 && bloom.count === 6 && angryBloom.count === 8, JSON.stringify({ roots, angryRoots, spiral, angrySpiral, bloom, angryBloom }));
    ok('fairy ring warns before damage and movement defeats its captured target', bloom.early === 0 && bloom.damage > 0 && escaped.damage === 0, JSON.stringify({ bloom, escaped }));
    ok('exposed-heart armour and visible shutters agree', spiral.open && spiral.armor === 1 && spiral.gap > 2);
    for (const type of ['buttonling', 'bracketback']) {
      clean(); e = put(type, -2, 0); e.speed = 0; until(() => e.mark >= 0);
      const before = marks(); e.takeDamage(1e9); run(DT);
      ok(`${type} returns its warning on death`, before > 0 && marks() === 0);
    }
    for (const type of [...Object.values(theme.roles), theme.boss]) {
      clean(); const e = put(type, -2, 0); e.speed = 0;
      if (e.boss) { e.state = 'stalk'; e.timer = 0; e.bs.turn = 0; }
      const held = [];
      while (true) { const h = g.effects.markAcquire(); if (h < 0) break; held.push(h); }
      // Projectile attacks have a body tell; only floor/contact attacks need marks.
      if (!['gillspitter', 'needletail', 'lancewasp', 'mycelarch', 'lanternmoth'].includes(type)) {
        run(2.7); ok(`${type} cannot deal an unmarked floor hit`, p.health === HEALTH && g._mortars.length === 0);
      }
      held.forEach((h) => g.effects.markRelease(h));
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
console.log(fails ? `FUNGAL TEST FAIL (${fails})` : 'FUNGAL TEST PASS');
process.exitCode = fails ? 1 : 0;
