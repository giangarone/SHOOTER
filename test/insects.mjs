// INSECTS: real entities on fixed ticks. Compare committed attacks against
// dodges, interrupted support channels, enrage patterns and exhausted warnings.
import { launchBrowser, startServer } from './harness.mjs';
const PORT = 8260;
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
      g.waveState = 'active'; g.queue.length = 0; g.queue.push('sicklemantis'); g.spawnTimer = 1e6;
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
    const theme = THEMES.insects;
    for (const [i, type] of [...Object.values(theme.roles), theme.boss].entries()) put(type, -18 + i * 5, 14);
    run(2);
    ok('all seven models build and survive browser updates', g.enemies.length === 7 && g.enemies.every((e) => !e.dead && e.group.children.length > 10));
    const charge = (type, escape, fast = false, slow = false, cover = false) => {
      clean(); const e = put(type, -5, 0);
      if (fast) e.speed *= 8;
      if (slow) e.applyStatus('slow', 20);
      if (e.boss) { e.state = 'stalk'; e.timer = 0; e.bs.turn = 0; }
      until(() => e.mark >= 0); run(0.2);
      const early = HEALTH - p.health, x = e.pos.x, z = e.pos.z;
      if (escape) p.pos.z = 10;
      if (cover) ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-3, 0, -4), new THREE.Vector3(-2, 6, 4))];
      until(() => e.state === 'rest');
      return { early, damage: HEALTH - p.health, travel: e.pos.x - x, sideways: e.pos.z - z, mortars: g._mortars.length };
    };
    for (const type of ['sicklemantis', 'stagguard', 'vesperqueen']) {
      const stay = charge(type, false, true), dodge = charge(type, true, true), slow = charge(type, true, true, true), cover = charge(type, false, false, false, true);
      const length = type === 'sicklemantis' ? 8 : type === 'stagguard' ? 9 : 12;
      const radius = type === 'sicklemantis' ? 1.5 : type === 'stagguard' ? 2 : 2.6;
      ok(`${type} warns, commits its heading, and stops at cover`, stay.early === 0 && stay.damage > 0 && dodge.damage === 0 && Math.abs(dodge.sideways) < 0.1 && cover.damage === 0, JSON.stringify({ stay, dodge, cover }));
      ok(`${type} stays inside its lane at late-wave speed and respects slows`, dodge.travel + radius <= length + 0.05 && slow.travel < dodge.travel * 0.8, JSON.stringify({ dodge, slow }));
      if (type === 'stagguard') ok('stagguard ploughs two delayed clods to its flanks', stay.mortars === 2);
    }
    clean(); let e = put('stagguard', -5, 0); run(0.2);
    const closed = ENEMY_TYPES.stagguard.armorDefault(e); until(() => e.state === 'rest'); run(DT);
    ok('stagguard raises its wing cases and loses armour after charging', closed === 0.6 && ENEMY_TYPES.stagguard.armorDefault(e) === 1 && e.plates[0].rotation.z !== 0);
    clean(); shots.length = 0; e = put('needletail', -10, 0); e.speed = 0;
    run(0.3); ok('needletail does not shoot before its raised-tail warning', shots.length === 0);
    p.pos.z = 7; run(DT);
    ok('needletail keeps its visible aim on the captured bearing', Math.abs(e.group.rotation.y + Math.PI / 2) < 0.02); run(0.9);
    ok('needletail sweeps three needles across the original bearing', shots.length === 3 && shots[0].angle < -0.09 && Math.abs(shots[1].angle) < 0.02 && shots[2].angle > 0.09 && shots[2].time - shots[0].time > 0.3, JSON.stringify(shots));
    clean(); e = put('antlion', -10, 0); e.speed = 0;
    run(0.9); const pits = g._mortars.map((m) => ({ x: m.x, z: m.z, delay: m.delay }));
    ok('antlion closes from two flanks onto the captured centre', pits.length === 3 && pits[0].z * pits[1].z < 0 && pits[2].z === 0 && pits[2].delay > pits[0].delay, JSON.stringify(pits));
    p.pos.x = 8; run(2); ok('leaving the antlion pincer avoids every hit', p.health === HEALTH);
    const signal = (interrupt) => {
      clean(); const moth = put('lanternmoth', -8, 0), ally = put('needletail', -6, 0);
      moth.speed = ally.speed = 0; ally.attackCd = 10;
      run(0.3); const early = ally.attackCd;
      if (interrupt === 'range') ally.pos.z = 15;
      if (interrupt === 'death') moth.takeDamage(1e9);
      if (interrupt === 'cover') ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-7.5, 0, -3), new THREE.Vector3(-7, 4, 3))];
      run(0.6); return { early, cd: ally.attackCd, refractory: ally.pheromoneUntil || 0 };
    };
    const boosted = signal(''), plain = ['range', 'death', 'cover'].map(signal);
    ok('moth channels before advancing an ally cooldown; breaking the link prevents it', boosted.early > 9.6 && boosted.refractory > 0 && plain.every((o) => o.cd > boosted.cd + 1 && o.refractory === 0), JSON.stringify({ boosted, plain }));
    clean(); const moths = [put('lanternmoth', -8, 1), put('lanternmoth', -8, -1)], ally = put('needletail', -6, 0), boss = put('vesperqueen', -10, 0);
    for (const o of [...moths, ally, boss]) { o.speed = 0; o.attackCd = 10; }
    moths.forEach((o) => { o.attackCd = 0; }); run(1);
    ok('two moths cannot stack their signal or boost a boss', ally.attackCd > 7.7 && ally.attackCd < 8 && !boss.pheromoneUntil, `cd=${ally.attackCd}`);
    clean(); shots.length = 0; e = put('lancewasp', -9, 0); e.speed = 0;
    run(0.4); const low = e.pos.y; p.pos.z = 7;
    ok('lancewasp lowers its stinger before firing', low < 3.5 && shots.length === 0);
    run(0.6); ok('lancewasp fires on its old bearing and escapes', shots.length === 1 && Math.abs(shots[0].angle) < 0.02 && e.escape > 0);
    run(1.3); ok('lancewasp climbs during its recovery', e.pos.y > low);
    clean(); shots.length = 0; e = put('vesperqueen', -10, 0); e.speed = 0;
    const attacks = new Set(), windows = new Set();
    run(24, () => { if (e.bs.attack) attacks.add(e.bs.attack); if (e.bs.weakOpen) windows.add(e.bs.attack); });
    ok('queen cycles lance, scissors and volley with a thorax opening after each', attacks.size === 3 && windows.size === 3 && shots.length >= 15, JSON.stringify([...attacks]));
    const pattern = (turn, rage, escape = false) => {
      clean(); shots.length = 0; const e = put('vesperqueen', -10, 0); e.speed = 0;
      if (rage) e.hp = e.maxHp * 0.4;
      e.state = 'stalk'; e.timer = 0; e.bs.turn = turn;
      run(0.4); const early = shots.length + g._mortars.length;
      if (escape) p.pos.z = 10;
      run(0.85); const count = g._mortars.length;
      run(2); return { early, count, shots: shots.length, damage: HEALTH - p.health,
        open: e.bs.weakOpen, gap: Math.abs(e.plates[0].position.x - e.plates[1].position.x) };
    };
    const scissors = pattern(1, false), angryScissors = pattern(1, true), escaped = pattern(1, false, true), volley = pattern(2, false), angryVolley = pattern(2, true);
    ok('queen enrage lengthens scissors and interleaved volleys', scissors.count === 5 && angryScissors.count === 7 && volley.shots === 15 && angryVolley.shots === 20, JSON.stringify({ scissors, angryScissors, volley, angryVolley }));
    ok('scissors warn and strike the old position; leaving escapes', scissors.early === 0 && scissors.damage > 0 && escaped.damage === 0);
    ok('queen visibly parts thorax armour through recovery', volley.open && volley.gap > 2 && angryVolley.open);
    for (const type of ['sicklemantis', 'stagguard', 'vesperqueen']) {
      clean(); e = put(type, -5, 0); until(() => e.mark >= 0);
      const before = marks(); e.takeDamage(1e9); run(DT);
      ok(`${type} killed during a tell returns its warning`, before > 0 && marks() === 0);
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
console.log(fails ? `INSECTS TEST FAIL (${fails})` : 'INSECTS TEST PASS');
process.exitCode = fails ? 1 : 0;
