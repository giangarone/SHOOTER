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
    const until = (predicate, cap = 8, visit) => {
      for (let i = 0; i < cap / DT && !predicate(); i++) run(DT, visit);
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
    // THE SPORE REGENT. Six attacks dealt off a shuffled queue, contact that
    // always costs, and constant movement. `force` pins the deck to one attack
    // so each pattern is measured on its own; the fight's own numbers (tell
    // lengths, gaps, radii) are asserted as law here, the way themes.mjs holds
    // the role envelopes.
    const ad = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
    const force = (attack, rage = false) => {
      clean(); shots.length = 0;
      const b = put('sporeregent', -10, 0);
      b.bs.queue = [attack]; b.bs.turn = 1; b.bs.subCd = 0;
      if (rage) b.hp = b.maxHp * 0.4;
      return b;
    };

    // TOUCH. The body is dangerous at all times, so this comes first and its
    // own clock: immediate, then throttled, never per-frame.
    clean(); e = put('sporeregent', -2, 0); e.speed = 0; e.bs.subCd = 999;
    let touches = 0, hpWas = p.health;
    run(3, () => { if (p.health < hpWas) { touches++; hpWas = p.health; } });
    ok('touching the regent hurts at once, then on its touch clock - not per frame',
      touches >= 2 && touches <= 3, `touches=${touches} in 3s`);

    // THE PACE. A free thirty-six seconds must deal the whole deck, keep the
    // body moving, and open the heart exactly once per attack.
    clean(); shots.length = 0; e = put('sporeregent', -10, 0);
    const TELLS = new Set(['ring', 'ring2', 'scourge', 'sporeburst', 'novatell', 'squaring', 'siphon']);
    const seen = new Set(); let entries = 0, openings = 0, travel = 0, wasOpen = false;
    let prevState = '', lx = e.pos.x, lz = e.pos.z;
    run(36, () => {
      const s = e.state === 'ring2' ? 'ring' : e.state;
      if (TELLS.has(s)) {
        seen.add(s);
        if (!TELLS.has(prevState === 'ring2' ? 'ring' : prevState)) entries++;
      }
      if (e.bs.weakOpen && !wasOpen) openings++;
      wasOpen = !!e.bs.weakOpen;
      travel += Math.hypot(e.pos.x - lx, e.pos.z - lz); lx = e.pos.x; lz = e.pos.z;
      prevState = e.state;
    });
    ok('the deck deals all six attacks', seen.size === 6, JSON.stringify([...seen]));
    ok('attacks come every few seconds and the boss never parks',
      entries >= 7 && travel > 30, `entries=${entries} travel=${travel.toFixed(1)}`);
    // Let an attack still in flight reach its vent before the books are
    // balanced - a sampled cutoff can land mid-pattern. The visit callback
    // must be forwarded, or an opening that lands inside the settle window is
    // never counted.
    until(() => e.state === 'rest' || e.state === 'stalk', 6, () => {
      if (e.bs.weakOpen && !wasOpen) openings++;
      wasOpen = !!e.bs.weakOpen;
    });
    ok('every attack pays exactly one heart opening', openings === entries && entries > 0,
      `openings=${openings} entries=${entries}`);

    // FAIRY RING: petals all round the stance bar the gap toward the boss,
    // and the centre is filled - standing still is the one lethal answer.
    e = force('ring'); e.speed = 0;
    run(0.5);
    ok('fairy ring warns before it grows', g._mortars.length === 0 && p.health === HEALTH);
    run(0.5);
    const ring = g._mortars.map((m) => ({ d: Math.hypot(m.x, m.z), a: Math.atan2(m.z, m.x), delay: m.delay }));
    ok('the ring surrounds the stance with one gap facing the boss, and no safe centre',
      ring.length === 7 && ring.some((m) => m.d < 0.01) &&
      ring.filter((m) => m.d > 1).every((m) => Math.abs(m.d - 4.6) < 0.01 && ad(m.a, Math.PI) > 0.9),
      JSON.stringify(ring));
    const standInRing = (escape) => {
      e = force('ring'); e.speed = 0; run(1.0);
      if (escape) p.pos.set(0, 0, 12);
      const h0 = p.health; run(2.5); return h0 - p.health;
    };
    ok('the ring answers standing still and is beaten by the gap',
      standInRing(false) > 0 && standInRing(true) === 0);
    e = force('ring', true); e.speed = 0;
    let sawRing2 = false, ringPeak = 0;
    run(4, () => { sawRing2 ||= e.state === 'ring2'; ringPeak = Math.max(ringPeak, g._mortars.length); });
    ok('enrage answers the gap with a second, wider ring of its own',
      sawRing2 && ringPeak >= 8, `peak=${ringPeak}`);

    // SCOURGE: a traced fork that crawls outward in order while the boss moves.
    e = force('scourge'); e.speed = 0;
    let traced = false;
    run(1.0, () => { traced ||= e.state === 'scourge' && e.mark >= 0; });
    ok('the scourge traces its corridor before it grows', traced);
    run(0.3);
    const fork = g._mortars.map((m) => ({ x: m.x, z: m.z, delay: m.delay }));
    ok('blooms advance in a staggered line along the captured bearing',
      fork.length === 4 && fork.every((m, i, f) => i === 0 || (m.x > f[i - 1].x && m.delay > f[i - 1].delay)),
      JSON.stringify(fork));
    const onTheLine = (sidestep) => {
      e = force('scourge'); e.speed = 0; run(1.0);
      if (sidestep) p.pos.set(0, 0, 9);
      const h0 = p.health; run(3); return h0 - p.health;
    };
    ok('the crawling fork punishes the line and spares the flank',
      onTheLine(false) > 0 && onTheLine(true) === 0);
    e = force('scourge', true); e.speed = 0; run(1.2);
    ok('enraged, the fork grows a bent second arm', g._mortars.length === 8, `mortars=${g._mortars.length}`);

    // SPOREBURST: shells on the stance that burst into lasting spore clouds.
    const burst = (escape, rage = false) => {
      e = force('sporeburst', rage); e.speed = 0;
      run(0.6); const early = g._mortars.length;
      run(0.5); const landed = g._mortars.slice();
      if (escape) p.pos.set(0, 0, 12);
      run(3);
      return { early, landed, clouds: g._hazard.filter((h) => h.kind === 'spore'), damage: HEALTH - p.health };
    };
    const b0 = burst(true), bRage = burst(true, true), bStay = burst(false);
    ok('sporeburst holds its shells through the tell, then seeds the stance',
      b0.early === 0 && b0.landed.length === 3 && bStay.damage > 0, JSON.stringify(b0.landed.map((m) => m.delay)));
    ok('landed shells leave hanging spore clouds exactly where the rings were drawn',
      b0.clouds.length >= 2 && b0.clouds.every((h) => h.cloud >= 0 && h.radius === 2.3),
      JSON.stringify(b0.clouds.map((h) => ({ r: h.radius, cloud: h.cloud }))));
    ok('escaping the volley escapes it entirely; enrage throws two more shells',
      b0.damage === 0 && bRage.landed.length === 5);

    // CAP NOVA: rotating fans, each with a gap that turns between fans. The
    // player is parked directly BEHIND the boss: no fan's arc reaches there.
    e = force('nova'); e.speed = 0;
    let behind = false;
    run(5, () => { if (!behind && e.state === 'novatell') { p.pos.set(-20, 0, 0); behind = true; } });
    const fan = (k) => shots.slice(k * 6, k * 6 + 6).map((s) => s.angle);
    ok('the nova fires three six-shot fans half a second apart',
      shots.length === 18 && Math.abs(shots[6].time - shots[5].time - 0.5) < 0.06,
      `shots=${shots.length}`);
    ok('every fan keeps its gap, and the gap turns between fans',
      [0, 1.35, -1.15].every((c, k) => fan(k).every((a) => ad(a, c) > 0.5 && ad(a, c) < 1.35)),
      JSON.stringify([fan(0), fan(1), fan(2)]));
    ok('the whole nova spares the corridor behind the boss', p.health === HEALTH);

    // RAMPAGE: a marked lane, then the run, pockets sown in the wake.
    e = force('rampage');
    let laneDrawn = false, dodged = false;
    const rx = e.pos.x, rz = e.pos.z;
    run(4, () => {
      laneDrawn ||= e.state === 'squaring' && e.mark >= 0;
      if (!dodged && e.state === 'charge') { p.pos.set(0, 0, 9); dodged = true; }
    });
    ok('rampage draws its lane, then covers it - and the wake keeps spores',
      laneDrawn && Math.hypot(e.pos.x - rx, e.pos.z - rz) > 8 &&
      g._hazard.some((h) => h.kind === 'spore'), `travelled=${Math.hypot(e.pos.x - rx, e.pos.z - rz).toFixed(1)}`);
    ok('stepping off the lane as it releases escapes the run', dodged && p.health === HEALTH);
    e = force('rampage'); run(4);
    ok('standing in the lane is not an answer', p.health < HEALTH);
    e = force('rampage', true);
    let sprints = 0, lastS = '';
    run(6, () => { if (e.state === 'squaring' && lastS !== 'squaring') sprints++; lastS = e.state; });
    ok('enraged, the rampage turns and runs a second leg', sprints === 2, `squares=${sprints}`);

    // SIPHON: the inhale drags, the drawn ring detonates.
    e = force('siphon'); e.speed = 0; p.extX = 0; p.extZ = 0;
    let pullSeen = 0, ringDrawn = false, shells = 0;
    run(1.6, () => {
      // The boss stands at -x of the player: a drag toward it is extX going
      // negative, and the suite's fixed-tick loop never runs the player update
      // that would spend it.
      pullSeen = Math.min(pullSeen, p.extX);
      ringDrawn ||= e.state === 'siphon' && e.mark >= 0;
      shells = Math.max(shells, g._mortars.length);
    });
    ok('the inhale draws the player toward the ring it is drawing',
      ringDrawn && pullSeen < 0 && shells >= 2, `extX=${pullSeen.toFixed(2)} shells=${shells}`);
    ok('standing off the drawn ring is a complete answer to the exhale', p.health === HEALTH);
    e = force('siphon'); e.speed = 0;
    let steppedIn = false;
    run(2.2, () => {
      if (!steppedIn && e.state === 'siphon' && e.timer < 0.35) { p.pos.set(-7, 0, 0); steppedIn = true; }
    });
    ok('caught inside the exhale pays for it', steppedIn && p.health < HEALTH);

    // THE OPENING, still the fight's own defence: after an attack the heart
    // opens, armour comes off, the shutters visibly part - then it closes.
    e = force('sporeburst'); e.speed = 0;
    run(1.2);
    const openState = { open: e.bs.weakOpen, armor: ENEMY_TYPES[e.type].armorDefault(e),
      gap: Math.abs(e.shutters[0].position.x - e.shutters[1].position.x) };
    run(1.4);
    ok('the heart opening agrees on armour, shutters and clock',
      openState.open && openState.armor === 1 && openState.gap > 2 &&
      !e.bs.weakOpen && ENEMY_TYPES[e.type].armorDefault(e) === 0.65, JSON.stringify(openState));
    for (const type of ['buttonling', 'bracketback']) {
      clean(); e = put(type, -2, 0); e.speed = 0; until(() => e.mark >= 0);
      const before = marks(); e.takeDamage(1e9); run(DT);
      ok(`${type} returns its warning on death`, before > 0 && marks() === 0);
    }
    for (const type of [...Object.values(theme.roles), theme.boss]) {
      clean(); const e = put(type, -2, 0); e.speed = 0;
      // The regent's body hurts to touch on purpose, from any state - that is
      // its own assertion above. This loop measures UNMARKED floor hits, so
      // the player stands out of contact range for the boss's pass.
      if (e.boss) { e.state = 'stalk'; e.timer = 0; p.pos.set(0, 0, 12); }
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
