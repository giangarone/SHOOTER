// BONE, end to end. Each attack is measured against its counterplay, not just
// counted as alive. Fixed game ticks drive the real enemy/projectile systems
// inside the browser, so a slow renderer cannot change a telegraph's duration.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8248;
const server = startServer(PORT);
await new Promise((r) => setTimeout(r, 800));
let browser;
let fails = 0;
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
    const { THEMES, resolveRole, resolveBoss } = await import('./js/themes.js');
    const THREE = await import('three');
    const g = window.__game, p = g.player;
    const rows = [];
    const ok = (name, pass, detail = '') => rows.push({ name, pass: !!pass, detail });
    g.autoTest = false;
    g.input.shoot = false;
    g.input.shootFresh = false;
    g.nav.steer = g.navBig.steer = () => false;
    const ctx = g._enemyCtx;
    const boxes = ctx.obstacles;
    const projBoxes = g._projCtx.obstacles;
    const DT = 1 / 60;
    const HEALTH = 100000;
    const clean = () => {
      g._clearEntities();
      g._clearHazards();
      g.waveState = 'active';
      g.queue.length = 0;
      g.queue.push('knuckler');
      g.spawnTimer = 1e6;
      ctx.obstacles = [];
      g._projCtx.obstacles = [];
      p.pos.set(0, 0, 0);
      p.health = HEALTH;
      p.invulnEnd = -1;
      p.wardReady = false;
      p.mods.dodgeChance = 0;
      p.clearStatuses();
    };
    const put = (type, x, z) => {
      const e = new Enemy(type, new THREE.Vector3(x, 0, z), 1, 1, 1);
      e.attackCd = 0;
      g.enemies.push(e);
      g.scene.add(e.group);
      return e;
    };
    const run = (seconds, visit) => {
      for (let i = 0; i < Math.ceil(seconds / DT); i++) {
        g.time += DT;
        g._updateEnemies(DT);
        g._updateProjectiles(DT);
        g.effects.update(DT, g.camera);
        visit?.();
      }
    };
    const until = (predicate, cap = 6) => {
      for (let i = 0; i < cap / DT && !predicate(); i++) run(DT);
      return predicate();
    };
    const marks = () => g.effects.marks.filter((m) => m.used).length;
    clean();
    const types = [...Object.values(THEMES.bone.roles), THEMES.bone.boss];
    ok('six unique roles plus a boss resolve to BONE without fallback', new Set(types).size === 7 &&
      Object.keys(THEMES.bone.roles).every((r) => resolveRole('bone', r, (k) => !!ENEMY_TYPES[k]) === THEMES.bone.roles[r]) &&
      resolveBoss('bone', (k) => !!ENEMY_TYPES[k]) === 'ossarch');
    for (const [i, type] of types.entries()) put(type, -18 + i * 5, 12);
    run(2);
    ok('all seven build distinct skeletons and survive their AI', g.enemies.length === 7 &&
      g.enemies.every((e) => !e.dead && e.group.children.length > 15 && e.boneRibs.length === 6));
    clean();
    const h0 = p.health;
    run(1);
    ok('empty arena costs no health', p.health === h0);

    // A side step defeats a lunge whose heading was captured at the tell.
    const lunge = (dodge) => {
      clean();
      const e = put('knuckler', -4, 0);
      run(0.3);
      const early = HEALTH - p.health;
      if (dodge) p.pos.z = 4;
      run(1.5);
      return { early, damage: HEALTH - p.health, z: e.pos.z, state: e.boneState };
    };
    const stay = lunge(false), dodge = lunge(true);
    ok('knuckler warns before biting, then hits a stationary target', stay.early === 0 && stay.damage > 0, JSON.stringify(stay));
    ok('knuckler cannot steer its lunge after a side step', dodge.damage === 0 && Math.abs(dodge.z) < 0.2, JSON.stringify(dodge));
    clean();
    let runner = put('knuckler', -4, 0);
    run(0.15);
    runner.speed *= 6;
    const startX = runner.pos.x;
    p.pos.z = 8;
    run(1.3);
    ok('late-wave lunge travel and bite fit the warning lane', runner.pos.x - startX + 1.6 <= 6.01, `reach=${runner.pos.x - startX + 1.6}`);
    clean();
    runner = put('knuckler', -4, 0);
    run(0.15);
    runner.speed *= 6;
    runner.applyStatus('slow', 5);
    const slowStart = runner.pos.x;
    p.pos.z = 8;
    run(1.3);
    ok('slows still shorten a speed-capped late-wave lunge', runner.pos.x - slowStart < 2.3, `travel=${runner.pos.x - slowStart}`);

    clean();
    let e = put('ribshot', -10, 0);
    e.speed = 0;
    let shots = [];
    const spawn = g._spawnProjectile.bind(g);
    g._spawnProjectile = (...args) => {
      shots.push({ type: args[3], angle: args[5], time: g.time });
      return spawn(...args);
    };
    run(0.5);
    ok('ribshot holds fire through its visible windup', shots.length === 0 && e.ribTell > 0);
    run(0.5);
    ok('ribshot sheds five ribs into a spread', shots.length === 5 && new Set(shots.map((s) => s.angle)).size === 5, `shots=${shots.length}`);
    ok('spent ribs expose marrow to bullets and directionless damage', e.boneRibs.every((r) => !r.visible) &&
      ENEMY_TYPES.ribshot.armor(e) === 1.4 && ENEMY_TYPES.ribshot.armorDefault(e) === 1.4);
    e.attackCd = 99;
    run(1.3);
    ok('ribshot regrows its ribs and loses the vulnerability', e.boneRibs.every((r) => r.visible) && ENEMY_TYPES.ribshot.armor(e) === 1);

    clean();
    e = put('ribguard', 0, 8);
    e.speed = 0;
    run(DT);
    e.group.rotation.y = 0;
    const armour = ENEMY_TYPES.ribguard.armor;
    const full = armour(e, 0, 1), rear = armour(e, 0, -1);
    e.hp = e.maxHp * 0.6;
    run(DT);
    const mid = armour(e, 0, 1);
    e.hp = e.maxHp * 0.3;
    run(DT);
    const low = armour(e, 0, 1);
    e.hp = e.maxHp;
    run(DT);
    ok('ribguard plates protect its front, never its rear or poison', full < rear && rear === 1 && ENEMY_TYPES.ribguard.armorDefault === 1);
    ok('ribguard loses two visible plates as health falls', full < mid && mid < low && low === 1 && e.bonePlates.every((p) => !p.visible), `${full}/${mid}/${low}`);
    ok('healing does not restore broken plates', armour(e, 0, 1) === 1);

    // Actual teeth, not array high-water marks: all three locked positions
    // must detonate in order, then return both scene objects and mark handles.
    const eruption = (dodge, height = 0) => {
      clean();
      p.pos.y = height;
      const caster = put('ossuary', -10, 0);
      caster.speed = 0;
      run(DT);
      const teeth = [...caster.boneTeeth];
      const positions = teeth.map((t) => [t.x, t.z]);
      run(0.4);
      const early = HEALTH - p.health;
      if (dodge) p.pos.z = 5;
      const order = [];
      const seen = new Set();
      run(1.5, () => {
        for (const t of teeth) if (t.spent && !seen.has(t)) { seen.add(t); order.push(t.x); }
      });
      return { early, damage: HEALTH - p.health, positions, order, marks: marks(), meshes: teeth.some((t) => t.mesh.parent) };
    };
    const hit = eruption(false), missed = eruption(true), high = eruption(false, 4);
    ok('ossuary telegraphs three sequential spine eruptions', hit.early === 0 && hit.order.length === 3 && hit.order[0] < hit.order[1] && hit.order[1] < hit.order[2], JSON.stringify(hit));
    ok('leaving the locked spine lane avoids damage', hit.damage > 0 && missed.damage === 0, `stay=${hit.damage} leave=${missed.damage}`);
    ok('ground teeth cannot hit a player on a walkway', high.damage === 0);
    ok('spent eruptions return warnings and remove their teeth', hit.marks === 0 && !hit.meshes);

    const healing = (interrupt = '') => {
      clean();
      const healer = put('marrow', 5, 0);
      const target = put('ribguard', 7, 0);
      healer.speed = target.speed = 0;
      target.hp = target.maxHp * 0.5;
      const before = target.hp;
      run(0.4);
      const early = target.hp - before;
      if (interrupt === 'hit') healer.takeDamage(1);
      if (interrupt === 'range') target.pos.x = 19;
      if (interrupt === 'cover') ctx.obstacles = [new THREE.Box3(new THREE.Vector3(5.8, 0, -2), new THREE.Vector3(6.2, 4, 2))];
      if (interrupt === 'death') healer.takeDamage(1e6);
      run(1.3);
      return { early, healed: target.hp - before, max: target.maxHp };
    };
    const heal = healing();
    ok('marrow heals one ally only after a channel', heal.early === 0 && Math.abs(heal.healed / heal.max - 0.14) < 0.001, JSON.stringify(heal));
    for (const reason of ['hit', 'range', 'cover', 'death']) {
      const r = healing(reason);
      ok(`marrow healing is interrupted by ${reason}`, r.healed === 0, `healed=${r.healed}`);
    }
    clean();
    const healer = put('marrow', 5, 0);
    healer.speed = 0;
    const boss = put('ossarch', 7, 0);
    boss.speed = 0; boss.hp *= 0.5;
    const other = put('marrow', 6, 3);
    other.speed = 0; other.hp *= 0.5;
    const before = boss.hp + other.hp;
    run(2);
    ok('marrow cannot heal bosses, itself, or another healer', boss.hp + other.hp === before && !healer.marrowTarget);

    clean();
    e = put('skullwing', -7, 0);
    run(0.5);
    ok('skullwing descends and warns before shedding teeth', !e.boneTeeth?.length && e.hoverY === 2.4);
    const teethSeen = new Set();
    const toothPositions = [];
    run(2.7, () => {
      for (const t of e.boneTeeth || []) if (!teethSeen.has(t)) { teethSeen.add(t); toothPositions.push([t.x, t.z]); }
    });
    ok('skullwing lays three separated teeth along its committed flight', toothPositions.length === 3 && toothPositions[2][0] - toothPositions[0][0] > 3, JSON.stringify(toothPositions));
    run(2);
    ok('skullwing climbs to recover and its trail expires', e.hoverY === 3.2 && !e.boneTeeth.length && marks() === 0);

    clean();
    e = put('ossarch', -10, 0);
    e.speed = 0;
    shots = [];
    run(2.5);
    ok('Ossarch winds up its first volley before firing', shots.length === 0 && e.bs.state === 'ribs');
    run(0.5);
    ok('Ossarch launches a gapped radial rib volley', shots.length === 10 && Math.max(...shots.map((s) => s.angle)) < Math.PI * 2 - 0.8, `shots=${shots.length}`);
    ok('Ossarch opens its marrow after attacking', e.bs.weakOpen && ENEMY_TYPES.ossarch.armor(e) === 1 && ENEMY_TYPES.ossarch.armorDefault(e) === 1);
    const states = new Set();
    let peakTeeth = 0;
    run(15, () => { states.add(e.bs.state); peakTeeth = Math.max(peakTeeth, e.boneTeeth?.length || 0); });
    ok('Ossarch naturally cycles through spine, jaw tell, charge and recovery', ['spine', 'jawTell', 'charge', 'recover'].every((s) => states.has(s)), [...states].join(','));
    ok('full-health Ossarch uses the unbranched spine', peakTeeth === 3, `teeth=${peakTeeth}`);
    const ladder = [];
    for (const frac of [1, 0.6, 0.3]) {
      e.hp = e.maxHp * frac;
      e.bs.state = 'walk'; e.bs.t = 99; e.bs.weakOpen = false;
      run(DT);
      ladder.push(ENEMY_TYPES.ossarch.armor(e));
    }
    ok('Ossarch armor sheds permanently in two visible stages', ladder[0] < ladder[1] && ladder[1] < ladder[2] && ladder[2] === 1 && e.bonePlates.every((p) => !p.visible), ladder.join('/'));
    e.bs.t = 0; e.bs.attack = 1;
    run(DT);
    ok('damaged Ossarch branches the spine with two extra teeth', e.boneTeeth.length === 5, `teeth=${e.boneTeeth.length}`);
    run(2.5);
    e.bs.state = 'walk'; e.bs.t = 0; e.bs.attack = 0;
    shots = [];
    run(1);
    ok('last shell tightens the volley but retains its escape sector', shots.length === 12, `shots=${shots.length}`);

    // Pin the charge state by its normal tell, then put a wall on the lane.
    clean();
    e = put('ossarch', -8, 0);
    run(DT);
    e.bs.state = 'walk'; e.bs.t = 0; e.bs.attack = 2;
    run(0.5);
    const locked = [e.boneDX, e.boneDZ];
    p.pos.z = 5;
    ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-4, 0, -2), new THREE.Vector3(-3, 6, 2))];
    run(1.5);
    ok('jaw charge keeps its tell bearing and stops against cover', e.pos.x < -4 && Math.abs(e.pos.z) < 0.2 && e.bs.state === 'recover' && e.bs.weakOpen && locked[0] > 0.99, `${e.pos.x},${e.pos.z} ${e.bs.state}`);
    ok('side-stepping the jaw charge avoids its bite', p.health === HEALTH);

    clean();
    e = put('ossarch', -8, 0);
    run(DT);
    e.bs.t = 0; e.bs.attack = 2;
    run(0.95);
    ok('Ossarch jaw charge gives its full warning before damage', p.health === HEALTH);
    run(1);
    ok('Ossarch jaw catches a player who stays in its lane once', HEALTH - p.health === 26, `damage=${HEALTH - p.health}`);

    for (const type of ['knuckler', 'ossuary', 'skullwing', 'ossarch']) {
      clean();
      e = put(type, -5, 0);
      if (type === 'ossarch') { run(DT); e.bs.t = 0; e.bs.attack = 2; }
      const armed = until(() => marks() > 0);
      e.takeDamage(1e6);
      run(0.1);
      ok(`${type} death cancels its warnings and unspent teeth`, armed && marks() === 0 && !(e.boneTeeth || []).length);
      e.release();
      ok(`${type} cleanup is idempotent`, marks() === 0);
    }
    clean();
    const held = g.effects.marks.map(() => g.effects.markAcquire());
    e = put('ossuary', -5, 0);
    run(2);
    ok('exhausted warning pool cannot create invisible eruptions', !e.boneTeeth?.length && p.health === HEALTH);
    held.forEach((h) => g.effects.markRelease(h));
    clean();
    const heldLane = g.effects.marks.map(() => g.effects.markAcquire());
    e = put('knuckler', -4, 0);
    run(0.3);
    heldLane.forEach((h) => g.effects.markRelease(h));
    run(0.6);
    ok('a warning slot freed late cannot trigger a barely telegraphed lunge', e.boneState === 'recover' && p.health === HEALTH);
    clean();
    e = put('ossuary', -5, 0);
    run(0.2);
    const armed = marks() > 0;
    e.applyStatus('freeze', 2);
    run(0.8);
    ok('freezing a caster pauses its still-visible telegraphs', armed && marks() > 0 && p.health === HEALTH);
    clean();
    ok('run reset returns every BONE telegraph', marks() === 0);
    g.setTheme('bone');
    g.wave = 5;
    g._spawnBoss('ossarch');
    ok('boss spawning uses the theme-owned display name', g.bossFight.name === 'OSSARCH');
    clean();
    g._spawnProjectile = spawn;
    ctx.obstacles = boxes;
    g._projCtx.obstacles = projBoxes;
    return rows;
  });
  for (const r of rows) {
    console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? '  ' + r.detail : ''}`);
    if (!r.pass) fails++;
  }
  if (errors.length) { fails++; console.log('  FAIL console errors: ' + errors.join(' | ')); }
  else console.log('  ok   no console errors');
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `BONE TEST FAIL (${fails})` : 'BONE TEST PASS');
process.exitCode = fails ? 1 : 0;
