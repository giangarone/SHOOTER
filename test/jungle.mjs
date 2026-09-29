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
      p.pos.set(0, 0, 0); p.vel.set(0, 0, 0); p.health = HEALTH; p.invulnEnd = -1; p.wardReady = false;
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

    // ---- the reworked CANOPY TITAN ---------------------------------------
    // Contact in any state, on the shared cadence - hugging was the old
    // fight's answer, so it is the first thing the new one prices.
    {
      clean(); const t = put('canopytitan', -2.5, 0); t.speed = 0; t.state = 'stalk'; t.timer = 99;
      run(0.1); const first = HEALTH - p.health;
      p.health = HEALTH; p.invulnEnd = -1; run(1.0); const duringCd = HEALTH - p.health;
      p.invulnEnd = -1; run(0.5); const afterCd = HEALTH - p.health;
      ok('touching the titan always costs, never faster than its cadence',
        first > 0 && duringCd === 0 && afterCd > 0, JSON.stringify({ first, duringCd, afterCd }));
    }
    // The whole kit, one appointment at a time: every one fires from stalk,
    // opens the heart afterwards and hands every warning back.
    let kitShots = 0;
    for (const name of ['roots', 'fruitfall', 'liana', 'leap', 'salvo', 'snare', 'spores', 'stampede']) {
      clean(); shots.length = 0; const t = put('canopytitan', -10, 0); t.speed = 0;
      t.state = 'stalk'; t.timer = 0; t.bs.next = name;
      const opened = until(() => t.bs.weakOpen, 12); run(DT);
      kitShots += shots.length;
      ok(`titan ${name}: fires, opens the heart, drains every warning`,
        opened && t.bs.attack === name && marks() === 0, JSON.stringify({ attack: t.bs.attack, open: opened, marks: marks() }));
    }
    ok('titan throws real projectiles across the kit', kitShots >= 20, `shots=${kitShots}`);
    // Cadence and motion over a free 40-second fight: the two things the
    // rework exists for. The old titan managed an appointment every six
    // seconds and never left its corner; the new one closes, orbits and
    // strides through its own casts.
    {
      clean(); const t = put('canopytitan', -14, 6); p.pos.set(10, 0, -8);
      let appointments = 0, path = 0, minDist = 99, last = t.state, lx = t.pos.x, lz = t.pos.z;
      run(40, () => {
        if (t.state === 'windup' && last !== 'windup') appointments++;
        last = t.state;
        path += Math.hypot(t.pos.x - lx, t.pos.z - lz); lx = t.pos.x; lz = t.pos.z;
        minDist = Math.min(minDist, Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z));
      });
      ok('titan attacks far more often than the old four-move loop', appointments >= 6, `appointments=${appointments}`);
      ok('titan closes and keeps moving around the arena', path > 22 && minDist < 8, `path=${path.toFixed(1)} minDist=${minDist.toFixed(1)}`);
    }
    const bossAttack = (name, setup, x = -10) => {
      clean(); shots.length = 0; const t = put('canopytitan', x, 0); t.speed = 0;
      t.state = 'stalk'; t.timer = 0; t.bs.next = name;
      if (setup) setup(t);
      return t;
    };
    {
      let t = bossAttack('salvo'); until(() => t.bs.weakOpen, 8);
      const calm = shots.length;
      t = bossAttack('salvo', (x) => { x.hp = x.maxHp * 0.4; }); until(() => t.bs.weakOpen, 8);
      const rage = shots.length;
      ok('enrage widens seed fans from five lines to seven, recovery intact', calm === 15 && rage === 21 && t.bs.weakOpen, JSON.stringify({ calm, rage }));
    }
    {
      const t = bossAttack('salvo');
      t.bs.weakOpen = false; const closed = ENEMY_TYPES.canopytitan.armorDefault(t);
      t.bs.weakOpen = true; const open = ENEMY_TYPES.canopytitan.armorDefault(t);
      ok('heart window removes the closed armour', closed === 0.65 && open === 1);
    }
    const fruit = (rage, escape) => {
      const t = bossAttack('fruitfall', rage ? (x) => { x.hp = x.maxHp * 0.4; } : null);
      until(() => t.groundPattern && t.groundPattern.length > 0);
      const count = t.groundPattern.length, early = HEALTH - p.health;
      if (escape) p.pos.z = 12;
      until(() => t.bs.weakOpen, 8); run(DT); p.pos.z = 0;
      return { count, early, damage: HEALTH - p.health, open: t.bs.weakOpen,
        gap: Math.abs(t.shutters[0].position.x), marks: marks() };
    };
    const fruitHit = fruit(false), fruitDodge = fruit(false, true), fruitRage = fruit(true, true);
    ok('fruitfall warns the captured spot and a ring around it, then hits', fruitHit.count === 5 && fruitHit.early === 0 && fruitHit.damage > 0 && fruitHit.marks === 0 && fruitHit.open && fruitHit.gap > 1, JSON.stringify(fruitHit));
    ok('fruitfall: leaving the marked crown dodges it', fruitDodge.damage === 0 && fruitDodge.open, JSON.stringify(fruitDodge));
    ok('enrage shakes six fruit loose around the same safe exit', fruitRage.count === 7 && fruitRage.damage === 0, JSON.stringify(fruitRage));
    const liana = (escape) => {
      const t = bossAttack('liana');
      until(() => t.laneMark >= 0); run(0.4);
      const early = HEALTH - p.health;
      if (escape) p.pos.set(0, 0, 6);
      until(() => t.bs.weakOpen, 8); run(DT); p.pos.z = 0;
      return { early, damage: HEALTH - p.health, open: t.bs.weakOpen, marks: marks() };
    };
    const lianaHit = liana(false), lianaDodge = liana(true);
    ok('liana wave runs the marked lane into a stationary target', lianaHit.early === 0 && lianaHit.damage > 0 && lianaHit.marks === 0 && lianaHit.open, JSON.stringify(lianaHit));
    ok('a perpendicular step leaves the whole wave', lianaDodge.damage === 0 && lianaDodge.open, JSON.stringify(lianaDodge));
    const leap = (escape) => {
      const t = bossAttack('leap');
      let marked = false, moved = false, open = false;
      for (let i = 0; i < 10 / DT && !open; i++) {
        run(DT);
        if (t.mark >= 0) marked = true;
        if (escape && marked && !moved) { p.pos.set(0, 0, 12); moved = true; }
        open = t.bs.weakOpen;
      }
      const travel = Math.hypot(t.pos.x + 10, t.pos.z);
      const r = { marked, travel, damage: HEALTH - p.health, open: t.bs.weakOpen, marks: marks() };
      p.pos.set(0, 0, 0);
      return r;
    };
    const leapHit = leap(false), leapMiss = leap(true);
    ok('leap marks its landing from the crouch, crosses the arena, and lands on it',
      leapHit.marked && leapHit.travel > 5 && leapHit.damage > 0 && leapHit.marks === 0, JSON.stringify(leapHit));
    ok('leap: leaving the circle dodges the whole landing', leapMiss.damage === 0 && leapMiss.open, JSON.stringify(leapMiss));
    const snare = (move) => {
      const t = bossAttack('snare', null, -9);
      let steps = 0, z = 0, open = false;
      for (let i = 0; i < 8 / DT && !open; i++) {
        run(DT);
        if (move && ++steps >= 33) { steps = 0; z = z === 0 ? 8 : -z; p.pos.z = z; }
        open = t.bs.weakOpen;
      }
      const damage = HEALTH - p.health; p.pos.z = 0;
      return { damage, open, marks: marks() };
    };
    const snareHit = snare(false), snareDodge = snare(true);
    ok('snare pulses re-aim at a stationary target and keep costing it', snareHit.damage > 30 && snareHit.open && snareHit.marks === 0, JSON.stringify(snareHit));
    ok('keeping moving beats the snare outright', snareDodge.damage === 0 && snareDodge.open, JSON.stringify(snareDodge));
    {
      bossAttack('spores');
      until(() => shots.length > 0, 4);
      const angs = shots.map((s) => (s.angle + Math.PI * 2) % (Math.PI * 2)).sort((x, y) => x - y);
      const gaps = angs.map((v, i) => (i + 1 < angs.length ? angs[i + 1] : angs[0] + Math.PI * 2) - v);
      const seams = gaps.filter((g) => g > 0.8).length;
      ok('spore vent surrounds the titan with exactly two seams to slip',
        shots.length >= 9 && shots.length <= 14 && seams === 2, JSON.stringify({ n: shots.length, seams, max: Math.max(...gaps).toFixed(2) }));
    }

    const rush = (escape, cover = false, slow = false) => {
      clean(); const e = put('canopytitan', -7, 0); e.speed *= 8; e.damage *= 20;
      if (slow) e.applyStatus('slow', 8);
      e.state = 'stalk'; e.timer = 0; e.bs.next = 'stampede';
      until(() => e.laneMark >= 0); run(0.3); const x = e.pos.x, early = HEALTH - p.health;
      if (escape) { p.pos.z = 10; p.vel.set(0, 0, 0); }
      if (cover) ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-4, 0, -3), new THREE.Vector3(-3, 6, 3))];
      // Travel and bearing are read at the moment the CHARGE ends - the
      // arrival plant afterwards is its own attack with its own drift.
      let ended = false, travel = 0, z = 0, open = false;
      for (let i = 0; i < 8 / DT && !open; i++) {
        run(DT);
        if (!ended && (e.state === 'pattern' || e.state === 'rest')) { ended = true; travel = e.pos.x - x; z = e.pos.z; }
        open = e.bs.weakOpen;
      }
      const r = { early, damage: HEALTH - p.health, travel, z, open };
      p.pos.z = 0;
      return r;
    };
    const rushHit = rush(false), rushDodge = rush(true), rushCover = rush(false, true), rushSlow = rush(true, false, true);
    ok('stampede warns and caps late-wave travel and damage', rushHit.early === 0 && rushHit.damage > 0 && rushHit.damage <= 30 && rushHit.travel + 2.8 <= 11.31 && rushHit.open, JSON.stringify(rushHit));
    ok('stampede never turns onto a side step', rushDodge.damage === 0 && Math.abs(rushDodge.z) < 0.1, JSON.stringify(rushDodge));
    ok('cover stops stampede and opens the heart', rushCover.damage === 0 && rushCover.travel < 4 && rushCover.open, JSON.stringify(rushCover));
    ok('stampede still respects player slows', rushSlow.travel < rushDodge.travel * 0.8, JSON.stringify(rushSlow));


    const rootBranch = (side) => {
      clean(); const e = put('canopytitan', -10, 0); e.speed = 0;
      e.state = 'stalk'; e.timer = 0; e.bs.next = 'roots'; run(0.3);
      p.pos.z = side ? 1.8 : 0; run(2.2); const damage = HEALTH - p.health; p.pos.z = 0;
      return damage;
    };
    const branchHit = rootBranch(true), corridor = rootBranch(false);
    ok('Titan roots hit the branching lanes and preserve the central corridor', branchHit > 0 && corridor === 0, JSON.stringify({ branchHit, corridor }));

    // Death mid-telegraph, once per shape of warning: ground pattern, lane,
    // landing circle, vent ring. `hold` runs each attack until its marks are
    // genuinely down before the kill.
    for (const [name, hold] of [['roots', 0.8], ['fruitfall', 0.8], ['liana', 0.9], ['stampede', 0.3], ['leap', 0.3], ['spores', 0.3]]) {
      // Ten metres out: inside every attack's own range gate, so the forced
      // pick survives the same vetoes the bag applies.
      clean(); shots.length = 0; e = put('canopytitan', -10, 0); e.speed = 0;
      e.state = 'stalk'; e.timer = 0; e.bs.next = name; run(hold);
      const held = marks();
      e.takeDamage(1e9); run(DT); p.health = HEALTH; p.invulnEnd = -1; run(3);
      ok(`boss death cancels ${name} before impact and releases its warnings`, held > 0 && p.health === HEALTH && marks() === 0 && shots.length === 0, `held=${held}`);
    }
    for (const type of ['vinecat', 'rootgorilla', 'seedpod', 'canopytitan']) {
      clean(); e = put(type, -3, 0); e.speed = 0;
      if (e.boss) { e.state = 'stalk'; e.timer = 0; e.bs.next = 'roots'; }
      const held = [];
      while (true) { const h = g.effects.markAcquire(); if (h < 0) break; held.push(h); }
      // 0.8 covers the titan's roots wind-up: the pattern must try to acquire
      // while the pool is genuinely empty, not before it has asked.
      run(0.8); held.forEach((h) => g.effects.markRelease(h));
      run(2.5);
      ok(`${type} cannot hit after failing to acquire its warning`, p.health === HEALTH, `damage=${HEALTH - p.health}`);
    }
    for (const type of ['vinecat', 'rootgorilla', 'seedpod', 'canopytitan']) {
      clean(); e = put(type, -3, 0); e.speed = 0;
      if (e.boss) { e.state = 'stalk'; e.timer = 0; e.bs.next = 'roots'; }
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
