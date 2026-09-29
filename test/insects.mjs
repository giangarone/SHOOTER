// INSECTS: real entities on fixed ticks. Compare committed attacks against
// dodges, interrupted support channels, enrage patterns and exhausted warnings.
// The queen gets her own block: five attacks, a vent after each, touch damage
// at all times, and the hunt/prowl movement that replaced the corner sentry.
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
      shots.push({ type: args[3], x: args[0], z: args[2], angle: Math.atan2(shot.vel.z, shot.vel.x), time: g.time });
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
    for (const type of ['sicklemantis', 'stagguard']) {
      const stay = charge(type, false, true), dodge = charge(type, true, true), slow = charge(type, true, true, true), cover = charge(type, false, false, false, true);
      const length = type === 'sicklemantis' ? 8 : 9;
      const radius = type === 'sicklemantis' ? 1.5 : 2;
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
    // ---- THE VESPER QUEEN -------------------------------------------------
    // Five attacks on a rotation, a vent after each, touch that always costs,
    // and a queen that is never still. Driven on fixed ticks like the rest.
    clean(); shots.length = 0; e = put('vesperqueen', -12, 0);
    const seen = new Set(), vented = new Set();
    let rests = 0, resting = false, maxGap = 0;
    run(40, () => {
      if (e.state === 'tell' && e.bs.attack) seen.add(e.bs.attack);
      if (e.state === 'rest' && e.bs.weakOpen) {
        vented.add(e.bs.attack);
        maxGap = Math.max(maxGap, Math.abs(e.plates[0].position.x - e.plates[1].position.x));
      }
      if (e.state === 'rest' && !resting) rests++;
      resting = e.state === 'rest';
    });
    ok('queen cycles all five attacks, venting her thorax after each', seen.size === 5 && vented.size === 5, JSON.stringify([...seen]));
    ok('queen attacks far more often than the old sentry did', rests >= 6, `rests=${rests} over 40s`);
    ok('queen visibly parts thorax armour through recovery', maxGap > 2, `gap=${maxGap.toFixed(2)}`);
    clean(); e = put('vesperqueen', -2, 0); e.speed = 0;
    run(0.5);
    ok('touching the queen costs health at any time', p.health < HEALTH, `lost=${HEALTH - p.health}`);
    clean(); e = put('vesperqueen', -12, -6); p.pos.set(2, 10);
    let path = 0, px = e.pos.x, pz = e.pos.z, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    run(12, () => {
      path += Math.hypot(e.pos.x - px, e.pos.z - pz); px = e.pos.x; pz = e.pos.z;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz);
    });
    ok('the queen prowls the arena rather than holding a corner',
      path > 20 && x1 - x0 > 8 && z1 - z0 > 6,
      JSON.stringify({ path: +path.toFixed(1), x: +(x1 - x0).toFixed(1), z: +(z1 - z0).toFixed(1) }));
    // blitz: the two-stride mantis strike.
    const blitz = (escape, rage = false) => {
      clean(); shots.length = 0; const q = put('vesperqueen', -10, 0);
      q.state = 'stalk'; q.timer = 0; q.bs.turn = 0;
      if (rage) q.hp = q.maxHp * 0.4;
      let laneH = null, dashes = 0, prevDash = false, moved = 0, seg = null;
      const dashH = [], travel = [];
      run(7, () => {
        if (laneH === null && q.state === 'tell' && q.mark >= 0) laneH = Math.atan2(q.nz, q.nx);
        const dashing = q.state === 'combo' && q.bs.sub === 'dash';
        if (dashing && !prevDash) { dashes++; dashH.push(Math.atan2(q.nz, q.nx)); seg = [q.pos.x, q.pos.z]; }
        if (!dashing && prevDash) travel.push(Math.hypot(q.pos.x - seg[0], q.pos.z - seg[1]));
        prevDash = dashing;
        if (escape) {
          if (q.state === 'tell' && moved === 0) { p.pos.set(0, 8); moved = 1; }
          else if (q.state === 'combo' && q.bs.sub === 'aim' && dashes >= 1 && moved === 1) { p.pos.set(6, -10); moved = 2; }
          else if (q.state === 'rest' && moved === 2) { p.pos.set(0, 18); moved = 3; }
        }
      });
      return { damage: HEALTH - p.health, laneH, dashH, dashes, travel };
    };
    const bStay = blitz(false), bEsc = blitz(true), bRage = blitz(false, true);
    ok('blitz runs two committed strides, the first down the lane it painted',
      bStay.dashes === 2 && Math.abs(bStay.laneH - bStay.dashH[0]) < 0.02 && bStay.dashH[1] !== undefined,
      JSON.stringify({ lane: bStay.laneH, dashes: bStay.dashH }));
    ok('blitz connects on a player standing in the lane', bStay.damage > 0, `damage=${bStay.damage}`);
    ok('sidestepping each stride beats the blitz', bEsc.dashes >= 2 && bEsc.damage === 0, JSON.stringify({ damage: bEsc.damage, dashes: bEsc.dashes }));
    ok('a painted lane is never outrun', bStay.travel.length === 2 && bStay.travel.every((t, i) => t <= [15, 11][i] + 0.05), JSON.stringify(bStay.travel));
    ok('enraged blitz adds a third stride', bRage.dashes === 3, `dashes=${bRage.dashes}`);
    // bloom: planted rotating needle fans.
    const bloom = (rage) => {
      clean(); shots.length = 0; const q = put('vesperqueen', -10, 0); q.speed = 0;
      q.state = 'stalk'; q.timer = 0; q.bs.turn = 2;
      if (rage) q.hp = q.maxHp * 0.4;
      run(0.5); const early = shots.length;
      run(3.8);
      const salvos = []; let last = -1;
      for (const s of shots.filter((o) => o.type === 'vesperqueen')) {
        if (s.time - last > 0.2) salvos.push([]);
        salvos[salvos.length - 1].push(s.angle); last = s.time;
      }
      return { early, sizes: salvos.map((v) => v.length),
        mids: salvos.map((v) => v.reduce((x, y) => x + y, 0) / v.length) };
    };
    const b5 = bloom(false), b7 = bloom(true);
    ok('needle bloom warns with its body before it fires', b5.early === 0);
    ok('bloom is five fans of five needles, seven fans enraged',
      b5.sizes.length === 5 && b5.sizes.every((n) => n === 5) && b7.sizes.length === 7,
      JSON.stringify({ plain: b5.sizes, enraged: b7.sizes.length }));
    ok('each fan sweeps a fixed step past the last', b5.mids.every((m, i) => {
      if (!i) return true;
      const d = Math.atan2(Math.sin(m - b5.mids[i - 1]), Math.cos(m - b5.mids[i - 1]));
      return Math.abs(Math.abs(d) - 0.55) < 0.06;
    }), JSON.stringify(b5.mids.map((m) => +m.toFixed(2))));
    // pits: the antlion cage.
    const cageTrap = (rage, escape) => {
      clean(); const q = put('vesperqueen', -10, 0); q.speed = 0;
      q.state = 'stalk'; q.timer = 0; q.bs.turn = 1;
      if (rage) q.hp = q.maxHp * 0.4;
      let layout = null;
      run(2.6, () => {
        if (!layout && g._mortars.length) {
          layout = g._mortars.map((m) => ({ x: +m.x.toFixed(2), z: +m.z.toFixed(2), delay: +m.delay.toFixed(2) }));
          if (escape) p.pos.set(7, 0);
        }
      });
      return { layout, damage: HEALTH - p.health };
    };
    const cStay = cageTrap(false), cEsc = cageTrap(false, true), cRage = cageTrap(true);
    const ringHoles = cStay.layout.filter((m) => Math.hypot(m.x, m.z) > 2);
    const centre = cStay.layout.filter((m) => Math.hypot(m.x, m.z) <= 2);
    ok('pits cage the old position with one gap left away from the queen',
      cStay.layout.length === 7 && ringHoles.length === 6 && centre.length === 1 &&
      ringHoles.every((m) => Math.abs(Math.hypot(m.x, m.z) - 3.2) < 0.3) &&
      ringHoles.every((m) => Math.abs(Math.atan2(m.z, m.x)) > 0.4),
      JSON.stringify(cStay.layout));
    ok('the cage erupts ring first, centre last', Math.max(...ringHoles.map((m) => m.delay)) < centre[0].delay, JSON.stringify({ centre: centre[0].delay }));
    ok('pits hit whoever stood still, and the gap escapes', cStay.damage > 0 && cEsc.damage === 0, JSON.stringify({ cage: cStay.damage, gap: cEsc.damage }));
    ok('enraged pits tighten to eight', cRage.layout.length === 9, `mortars=${cRage.layout.length}`);
    // clutch: the queen's brood tax.
    const clutch = (rage) => {
      clean(); shots.length = 0; const q = put('vesperqueen', -10, 0); q.speed = 0;
      q.state = 'stalk'; q.timer = 0; q.bs.turn = 4;
      if (rage) q.hp = q.maxHp * 0.4;
      let laid = 0;
      run(1.2, () => { laid = Math.max(laid, g._mortars.length); });
      run(1.8);
      const fromEggs = shots.filter((s) => s.type === 'vesperqueen' && Math.hypot(s.x - q.pos.x, s.z - q.pos.z) > 2).length;
      return { laid, fromEggs, hazards: g._hazard.length };
    };
    const c3 = clutch(false), c4 = clutch(true);
    ok('clutch lays three warned eggs, four when enraged', c3.laid === 3 && c4.laid === 4, JSON.stringify({ eggs: c3.laid, enraged: c4.laid }));
    ok('eggs rupture into ichor pools, each spitting a three-needle fan',
      c3.hazards === 3 && c3.fromEggs === 9, JSON.stringify(c3));
    // hunt: the pheromone scent and the dart chain.
    const hunt = (escape, rage = false) => {
      clean(); const q = put('vesperqueen', -10, 0);
      q.state = 'stalk'; q.timer = 0; q.bs.turn = 3;
      if (rage) q.hp = q.maxHp * 0.4;
      let scent = false, lanes = 0, prevLane = false, darts = 0, prevDash = false, moved = 0;
      run(6, () => {
        if (q.state === 'tell' && q.mark >= 0) scent = true;
        const laneUp = q.state === 'combo' && q.bs.sub === 'aim' && q.mark >= 0;
        if (laneUp && !prevLane) lanes++;
        prevLane = laneUp;
        const dashing = q.state === 'combo' && q.bs.sub === 'dash';
        if (dashing && !prevDash) {
          darts++;
          if (escape && moved < 6) { p.pos.x += 6 * Math.cos(q.aim + Math.PI / 2); p.pos.z += 6 * Math.sin(q.aim + Math.PI / 2); moved++; }
        }
        prevDash = dashing;
        if (escape && q.state === 'rest' && moved && moved < 90) { p.pos.set(0, 18); moved = 90; }
      });
      return { scent, lanes, darts, damage: HEALTH - p.health };
    };
    const hStay = hunt(false), hEsc = hunt(true), hRage = hunt(false, true);
    ok('hunt opens with a scent mark, then each dart gets its own snap lane',
      hStay.scent && hStay.lanes === 3 && hStay.darts === 3, JSON.stringify({ lanes: hStay.lanes, darts: hStay.darts }));
    ok('the hunt runs down a player who stands in it', hStay.damage > 0, `damage=${hStay.damage}`);
    ok('dodging across each dart escapes the hunt', hEsc.damage === 0, JSON.stringify({ damage: hEsc.damage, darts: hEsc.darts }));
    ok('the enraged hunt chains four darts', hRage.darts === 4 && hRage.lanes === 4, JSON.stringify({ lanes: hRage.lanes, darts: hRage.darts }));
    for (const type of ['sicklemantis', 'stagguard', 'vesperqueen']) {
      clean(); e = put(type, -5, 0); until(() => e.mark >= 0);
      const before = marks(); e.takeDamage(1e9); run(DT);
      ok(`${type} killed during a tell returns its warning`, before > 0 && marks() === 0);
    }
    for (const type of [...Object.values(theme.roles), theme.boss]) {
      clean(); const e = put(type, type === 'vesperqueen' ? -8 : -2, 0); e.speed = 0;
      if (e.boss) { e.state = 'stalk'; e.timer = 0; e.bs.turn = 0; }
      const held = [];
      while (true) { const h = g.effects.markAcquire(); if (h < 0) break; held.push(h); }
      // Projectile attacks have a body tell; only floor/contact attacks need marks.
      if (type === 'vesperqueen') {
        // Her touch and needle fans are body-told (projectile class); what the
        // pool must still gate is her FLOOR work - pits, eggs and the dash lanes.
        run(2.7); ok(`${type} cannot deal an unmarked floor hit`, g._mortars.length === 0 && e.state !== 'dash');
      } else if (!['gillspitter', 'needletail', 'lancewasp', 'mycelarch', 'lanternmoth'].includes(type)) {
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
