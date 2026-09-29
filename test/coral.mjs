// CORAL's counterplay, run through real browser entities at fixed game ticks.
// Captured attacks, real escape routes, support counterplay and the Reef
// Empress' nine-attack rotation - the circling hunt, the chained pincer snap,
// the nautilus bloom, the beat-locked needle star and the rolling tide among
// them - are checked as differences, including exhausted and interrupted
// warnings.
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
        g.time += DT;
        // The Empress' needle star hangs off Music.pulse, and nothing in this
        // suite runs the frame loop that would advance it - so drive the
        // half-beat counter by hand, the same trick the candy suite uses for
        // its spinner. ~4.8 half-beats a second is the game's 144 BPM.
        g.music._pulse = Math.floor(g.time * 4.8);
        g.music._pulseWhole = g.music._pulse % 2 === 0;
        g._updateEnemies(DT); g._updateProjectiles(DT);
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
    run(46, () => { if (e.bs.attack) attacks.add(e.bs.attack); if (e.bs.weakOpen) windows.add(e.bs.attack); });
    ok('boss shuffles nine attacks and exposes its heart after every one',
      attacks.size === 9 && windows.size === 9, JSON.stringify({ attacks: [...attacks], windows: [...windows] }));
    ok('boss fires real projectile salvos', shots.filter((s) => s.type === e.type).length >= 15);
    e.bs.weakOpen = false; const closed = ENEMY_TYPES[e.type].armorDefault(e);
    e.bs.weakOpen = true; const open = ENEMY_TYPES[e.type].armorDefault(e);
    ok('heart window removes the closed armour', closed === 0.65 && open === 1);
    // One forced attack end to end. The boss is pinned at a chosen range and
    // its attack forced, so every assertion below is about the attack rather
    // than about which card a shuffled deck happened to deal. `window` is how
    // many seconds the exposed pearl stayed open, measured from the first
    // open frame - the price of a faster rotation is a shorter window, and
    // this is the assertion that keeps the window worth shooting in.
    const bossPattern = (name, rage = false, escape = false, bx = -10) => {
      clean(); shots.length = 0; const e = put('reefempress', bx, 0); e.speed = 0;
      if (rage) e.hp = e.maxHp * 0.4;
      e.state = 'stalk'; e.timer = 0; e.bs.force = name;
      run(0.3); const early = HEALTH - p.health, count = e.groundPattern?.length || 0;
      if (escape) p.pos.z = 12;
      let window = 0;
      until(() => e.bs.weakOpen, 6);
      // The window is already closing while it is measured, so the open
      // shutter state is read the moment the window arrives and the duration
      // after; reading either at the end would see the window shut. One extra
      // tick first: the shutters are positioned at the top of her next AI
      // frame, so they are still travelling on the frame the flag lands.
      run(DT);
      const open = e.bs.weakOpen, gap = Math.abs(e.shutters[0].position.x);
      run(1.4, () => { if (e.bs.weakOpen) window += DT; });
      return { early, count, damage: HEALTH - p.health, shots: shots.length,
        open, window: +window.toFixed(2), gap, marks: marks() };
    };
    const norm = (x) => Math.atan2(Math.sin(x), Math.cos(x));
    const pearlsCalm = bossPattern('pearls'), pearlsRage = bossPattern('pearls', true);
    ok('enrage widens pearl fans and keeps the window worth shooting in',
      pearlsCalm.shots === 15 && pearlsRage.shots === 21 &&
        pearlsCalm.window >= 1.25 && pearlsRage.window >= 0.9 && pearlsCalm.window < 1.55,
      JSON.stringify({ pearlsCalm, pearlsRage }));
    const scissors = bossPattern('scissors'), scissorsEscape = bossPattern('scissors', false, true);
    ok('pincer slam warns, hits the captured position, and can be escaped',
      scissors.early === 0 && scissors.damage > 0 && scissorsEscape.damage === 0 &&
        scissors.marks === 0 && scissors.open && scissors.gap > 1, JSON.stringify({ scissors, scissorsEscape }));
    const reefHit = bossPattern('reef'), reefDodge = bossPattern('reef', false, true);
    ok('advancing reef rows hit the old centre but leave the flanks open',
      reefHit.count === 6 && reefHit.damage > 0 && reefDodge.damage === 0 && reefHit.open, JSON.stringify({ reefHit, reefDodge }));
    const calmCrown = bossPattern('crown', false, true), rageCrown = bossPattern('crown', true, true);
    ok('enrage adds crown impacts while preserving the open exit',
      rageCrown.count > calmCrown.count && rageCrown.damage === 0 && calmCrown.damage === 0 && rageCrown.open, JSON.stringify({ calmCrown, rageCrown }));
    for (const enraged of [false, true]) {
      clean(); e = put('reefempress', -10, 0); e.speed = 0;
      if (enraged) e.hp = e.maxHp * 0.4;
      e.state = 'stalk'; e.timer = 0; e.bs.force = 'crown'; run(0.3);
      p.pos.set(4.5, 0, 0); run(2.5);
      ok(`crown has a real forward escape wedge, enrage=${enraged}`, p.health === HEALTH && e.bs.weakOpen);
    }
    // ---- the five new attacks ------------------------------------------------
    const snapHit = bossPattern('snap', false, false, -4), snapDodge = bossPattern('snap', false, true, -4),
      snapRage = bossPattern('snap', true, false, -4);
    ok('the pincer snap warns briefly and lands where you stood',
      snapHit.early === 0 && snapHit.damage > 0 && snapHit.marks === 0 && snapHit.open, JSON.stringify(snapHit));
    ok('sidestepping the spot escapes the snap', snapDodge.damage === 0, JSON.stringify(snapDodge));
    ok('below half health the snap chains a second fresh capture',
      snapRage.damage > snapHit.damage * 1.4 && snapRage.open, JSON.stringify({ snapHit, snapRage }));
    const bloomHit = bossPattern('bloom'), bloomDodge = bossPattern('bloom', false, true), bloomRage = bossPattern('bloom', true, true);
    ok('a nautilus arm of nine polyps blooms outward from the old spot',
      bloomHit.early === 0 && bloomHit.count === 9 && bloomHit.damage > 0 && bloomHit.marks === 0 && bloomHit.open, JSON.stringify(bloomHit));
    ok('stepping off the spiral disc escapes every polyp', bloomDodge.damage === 0, JSON.stringify(bloomDodge));
    ok('below half health a second arm blooms and the escape holds',
      bloomRage.count === 12 && bloomRage.damage === 0 && bloomRage.open, JSON.stringify(bloomRage));
    const tideRun = (mode, rage = false) => {
      clean(); const e = put('reefempress', -10, 0); e.speed = 0;
      if (rage) e.hp = e.maxHp * 0.4;
      e.state = 'stalk'; e.timer = 0; e.bs.force = 'tide';
      run(0.3); const early = HEALTH - p.health, count = e.groundPattern?.length || 0;
      // Calm files sit at z -5.4/0/+5.4 with edges at +-1.9, so z=2.7 is the
      // middle of a gap; the enraged fourth file moves the gap to the axis.
      if (mode === 'gap') p.pos.set(0, 0, rage ? 0 : 2.7);
      if (mode === 'away') p.pos.set(0, 0, 12);
      until(() => e.bs.weakOpen, 6); const open = e.bs.weakOpen; run(1.4);
      return { early, count, damage: HEALTH - p.health, open, marks: marks() };
    };
    const tideHit = tideRun(), tideGap = tideRun('gap'), tideAway = tideRun('away'), tideRage = tideRun('gap', true);
    ok('the tide rolls over the spot it captured, three ranks deep',
      tideHit.early === 0 && tideHit.count === 9 && tideHit.damage > 0 && tideHit.marks === 0 && tideHit.open, JSON.stringify(tideHit));
    ok('a file gap holds safe ground while the front washes past', tideGap.damage === 0, JSON.stringify(tideGap));
    ok('stepping clear of the front escapes the whole tide', tideAway.damage === 0, JSON.stringify(tideAway));
    ok('below half health the tide widens to a fourth file, gaps and all',
      tideRage.count === 12 && tideRage.damage === 0 && tideRage.open, JSON.stringify(tideRage));
    const pulseRun = (rage) => {
      clean(); shots.length = 0; const e = put('reefempress', -10, 0); e.speed = 0;
      if (rage) e.hp = e.maxHp * 0.4;
      e.state = 'stalk'; e.timer = 0; e.bs.force = 'pulse';
      run(0.4); const flare = shots.length;
      until(() => e.bs.weakOpen, 6);
      return { flare, shots: shots.map((s) => s.angle), open: e.bs.weakOpen, marks: marks() };
    };
    const pulseCalm = pulseRun(false), pulseRage = pulseRun(true);
    ok('the star fires nothing during its flare, then one pair per half-beat',
      pulseCalm.flare === 0 && pulseCalm.shots.length === 16 && pulseCalm.open && pulseCalm.marks === 0, JSON.stringify(pulseCalm.shots));
    ok('the star returns to its first bearing every five pulses, a spoke apart',
      Math.abs(norm(pulseCalm.shots[10] - pulseCalm.shots[0])) < 0.03 &&
        Math.abs(Math.abs(norm(pulseCalm.shots[1] - pulseCalm.shots[0])) - Math.PI) < 0.03);
    ok('below half health the star gains a third spoke and two more pulses',
      pulseRage.shots.length === 30 && Math.abs(norm(pulseRage.shots[18] - pulseRage.shots[0])) < 0.03 && pulseRage.open);
    // The hunt is the one attack that only exists while she is moving, so it
    // is the one driven at real speed: her placement, weaving and cut are the
    // mechanics under test, and a pinned boss would show none of them.
    const orbitRun = (escape) => {
      clean(); const e = put('reefempress', -10, 0);
      e.state = 'stalk'; e.timer = 0; e.bs.force = 'orbit';
      const sx = e.pos.x, sz = e.pos.z;
      run(0.25);
      if (escape) p.pos.z = 12;
      run(3);
      return { damage: HEALTH - p.health, moved: +Math.hypot(e.pos.x - sx, e.pos.z - sz).toFixed(1),
        open: e.bs.weakOpen, marks: marks() };
    };
    const orbitHit = orbitRun(false), orbitMiss = orbitRun(true);
    ok('the circling hunt crosses the arena and its cut reaches the middle',
      orbitHit.damage > 0 && orbitHit.moved > 6 && orbitHit.open && orbitHit.marks === 0, JSON.stringify(orbitHit));
    ok('leaving the ring before the cut escapes the hunt', orbitMiss.damage === 0 && orbitMiss.marks === 0, JSON.stringify(orbitMiss));
    // ---- touch, weave and tempo ----------------------------------------------
    clean(); e = put('reefempress', -3, 0); e.speed = 0;
    p.pos.set(-2, 0, 0); p.health = HEALTH; p.invulnEnd = -1;
    run(DT);
    ok('touching the Empress costs immediately', HEALTH - p.health > 0);
    p.health = HEALTH; p.invulnEnd = -1; run(0.4);
    ok('the touch holds a short cooldown rather than draining', HEALTH - p.health === 0);
    p.health = HEALTH; p.invulnEnd = -1; run(1.0);
    ok('lingering against her pays again after the cooldown', HEALTH - p.health > 0);
    clean(); e = put('reefempress', -14, 0);
    e.state = 'stalk'; e.timer = 99;
    const sx = e.pos.x, sz = e.pos.z;
    let path = 0, maxSide = 0, lx = sx, lz = sz;
    run(3, () => {
      path += Math.hypot(e.pos.x - lx, e.pos.z - lz);
      maxSide = Math.max(maxSide, Math.abs(e.pos.z - sz));
      lx = e.pos.x; lz = e.pos.z;
    });
    ok('the stalk closes in a weave, not a beeline',
      e.pos.x - sx > 4 && path > 6.5 && maxSide > 1,
      JSON.stringify({ closed: +(e.pos.x - sx).toFixed(1), path: +path.toFixed(1), maxSide: +maxSide.toFixed(1) }));
    clean(); e = put('reefempress', -10, 0); e.speed = 0;
    let opened = 0, wasOpen = false;
    run(13.5, () => { const o = !!e.bs.weakOpen; if (o && !wasOpen) opened++; wasOpen = o; });
    ok('three pearl windows open inside thirteen and a half seconds', opened >= 3, JSON.stringify({ opened }));
    for (const name of ['scissors', 'reef', 'pearls', 'crown', 'orbit', 'snap', 'bloom', 'pulse', 'tide']) {
      clean(); shots.length = 0; e = put('reefempress', -5, 0); e.speed = 0;
      e.state = 'stalk'; e.timer = 0; e.bs.force = name; run(0.3);
      e.takeDamage(1e9); run(DT); p.health = HEALTH; p.invulnEnd = -1; run(3);
      ok(`boss death cancels ${name} before impact and releases its warnings`, p.health === HEALTH && marks() === 0 && shots.length === 0);
    }
    for (const type of ['razorfin', 'clamguard', 'bloomcoral', 'reefray', 'reefempress']) {
      clean(); e = put(type, -3, 0); e.speed = 0;
      if (e.boss) { e.state = 'stalk'; e.timer = 0; e.bs.force = 'scissors'; }
      const held = [];
      while (true) { const h = g.effects.markAcquire(); if (h < 0) break; held.push(h); }
      run(0.3); held.forEach((h) => g.effects.markRelease(h));
      run(2.5);
      ok(`${type} cannot hit after failing to acquire its warning`, p.health === HEALTH, `damage=${HEALTH - p.health}`);
    }
    for (const type of ['razorfin', 'clamguard', 'bloomcoral', 'reefray', 'reefempress']) {
      clean(); e = put(type, -3, 0); e.speed = 0;
      if (e.boss) { e.state = 'stalk'; e.timer = 0; e.bs.force = 'scissors'; }
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
