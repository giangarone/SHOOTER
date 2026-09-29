// CANDY: two-stage pops, shootable sweets, permanent shell loss, musical
// recovery boosts and the Confectioner's five-pattern fight. Fixed ticks in
// a real browser.
import { launchBrowser, startServer } from './harness.mjs';
const PORT = 8256;
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
      g.waveState = 'active'; g.queue.length = 0; g.queue.push('taffy'); g.spawnTimer = 1e6;
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
        g.time += DT; g.music._pulse = Math.floor(g.time * 4); g.music._pulseWhole = g.music._pulse % 2 === 0; g._updateEnemies(DT); g._updateProjectiles(DT);
        g._updateMortars(DT); g.effects.update(DT, g.camera); visit?.();
      }
    };
    const until = (predicate, cap = 8) => {
      for (let i = 0; i < cap / DT && !predicate(); i++) run(DT);
      return predicate();
    };
    const marks = () => g.effects.marks.filter((m) => m.used).length;
    clean(); run(1); ok('empty arena costs no health', p.health === HEALTH);
    const types = [...Object.values(THEMES.candy.roles), THEMES.candy.boss];
    ok('CANDY resolves to seven unique built types', new Set(types).size === 7 && types.every(t => ENEMY_TYPES[t]));
    for (const [i, t] of types.entries()) put(t, -18 + i * 5, 14);
    run(2);
    ok('all seven models and AI survive', g.enemies.length === 7 && g.enemies.every(e => !e.dead && e.group.children.length > 5));

    const stretch = (escape, cover = false, fast = false) => {
      clean(); const e = put('taffy', -4, 0); if (fast) e.speed *= 10;
      run(0.2); const early = HEALTH - p.health, x = e.pos.x;
      if (escape) p.pos.z = 3;
      if (cover) ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-3, 0, -2), new THREE.Vector3(-2.8, 5, 2))];
      run(0.65); const damage = HEALTH - p.health;
      const reach = e.pos.x - x;
      p.pos.copy(e.pos); p.invulnEnd = -1; p.health = HEALTH;
      run(0.5); return { early, damage, reach, recovery: HEALTH - p.health };
    };
    const hit = stretch(false), dodge = stretch(true, false, true), blocked = stretch(false, true);
    ok('taffy warns before stretching into its captured lane', hit.early === 0 && hit.damage === 8 && hit.recovery === 0, JSON.stringify(hit));
    ok('side step and cover defeat taffy, even at late-wave speed', dodge.damage === 0 && dodge.reach === 0 && blocked.damage === 0, JSON.stringify({dodge, blocked}));

    clean(); let e = put('bonbon', -10, 0); e.speed = 0;
    run(0.4); ok('bonbon holds fire while its wrapper winds up', g.projectiles.length === 0);
    until(() => g.projectiles.some(p => p.type === 'bonbon'));
    let pr = g.projectiles.find(p => p.type === 'bonbon');
    ok('bonbon round is a shootable sweet with one bounce', pr?.shootable && pr.bounces === 1 && pr.mesh.userData.bubble === pr);
    const index = g.projectiles.indexOf(pr);
    g.camera.position.copy(p.eyeInto(new THREE.Vector3()));
    g.camera.lookAt(pr.pos); g.camera.updateMatrixWorld();
    pr.mesh.updateMatrixWorld(true);
    g._firePellet(g.camera.position.clone(), [pr.mesh], 0, p.weapon, 1, false);
    run(1.5);
    ok('shooting a bonbon removes its threat', !g.projectiles.includes(pr) && p.health === HEALTH, `index=${index}`);
    clean(); e = put('bonbon', -10, 0); e.speed = 0;
    until(() => g.projectiles.length > 0); pr = g.projectiles[0];
    pr.pos.set(21.3, 1.5, 0); pr.vel.set(12, 0, 0);
    run(0.2);
    ok('a missed bonbon really reflects off the arena wall', pr.bounces === 0 && pr.vel.x < 0);
    run(4.5); ok('reflected sweet expires instead of circulating forever', !g.projectiles.includes(pr));

    clean(); e = put('jawbreaker', -10, 0); e.speed = 0;
    const armor = [ENEMY_TYPES.jawbreaker.armorDefault(e)];
    e.hp = e.maxHp * 0.6; run(DT); armor.push(ENEMY_TYPES.jawbreaker.armorDefault(e));
    e.hp = e.maxHp * 0.3; run(DT); armor.push(ENEMY_TYPES.jawbreaker.armorDefault(e));
    e.hp = e.maxHp; run(DT); armor.push(ENEMY_TYPES.jawbreaker.armorDefault(e));
    ok('jawbreaker sheds two shell layers permanently, including after healing', armor.join() === '0.65,0.82,1,1' && e.candyShell.filter(m => m.visible).length === 2, JSON.stringify(armor));
    const bites = (tier) => {
      clean(); const e = put('jawbreaker', -2, 0); e.speed = 0; if(tier) e.hp = e.maxHp * 0.3;
      let n = 0, old = p.health;
      run(9, () => { if (p.health < old) n++; old = p.health; }); return n;
    };
    const intact = bites(0), cracked = bites(2);
    ok('cracked jawbreaker trades its shell for faster recovery', cracked > intact && intact > 0, `intact=${intact} cracked=${cracked}`);

    const pops = (escape) => {
      clean(); const e = put('poprock', -10, 0); e.speed = 0;
      p.pos.x = 2; run(DT); p.pos.x = 4;
      run(1.35); const first = HEALTH - p.health;
      if (escape) p.pos.x = 8;
      run(0.95); return { first, second: HEALTH - p.health, marks: marks() };
    };
    const second = pops(false), left = pops(true);
    ok('outer ring is safe for first pop but dangerous for the larger second pop', second.first === 0 && second.second > 0 && second.marks === 0, JSON.stringify(second));
    ok('leaving between pops defeats the second blast', left.second === 0, JSON.stringify(left));
    clean(); e = put('poprock', -10, 0); e.speed = 0; p.pos.y = 4;
    run(2.5); ok('popping floor candy does not hit an overhead walkway', p.health === HEALTH);

    const haste = (count, obstruct = false) => {
      clean(); const ally = put('bonbon', -6, 0), far = put('bonbon', 15, 0), boss = put('confectioner', -8, 0);
      const spinners = Array.from({length:count},(_,i)=>put('sugarspinner', -5, i));
      for (const e of [ally, far, boss, ...spinners]) { e.speed = 0; e.attackCd = 10; }
      if (obstruct) ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-5.7, 0, -3),new THREE.Vector3(-5.3, 5, 3))];
      run(1); return { ally: ally.attackCd, far: far.attackCd, boss: boss.attackCd };
    };
    const alone = haste(0), sweetened = haste(1), overlap = haste(2), screened = haste(1,true);
    ok('sugarspinner advances nearby recovery on music pulses only', sweetened.ally < alone.ally - 0.5 && Math.abs(sweetened.far-alone.far) < 0.01 && Math.abs(sweetened.boss-alone.boss) < 0.01, JSON.stringify({alone,sweetened}));
    ok('overlapping spinners cannot stack and cover breaks their links', Math.abs(overlap.ally-sweetened.ally)<0.01 && Math.abs(screened.ally-alone.ally)<0.01, JSON.stringify({overlap,screened}));
    clean(); e = put('bonbon', -8, 0); e.speed=0; const spinner=put('sugarspinner',-7,1);spinner.speed=0;
    run(0.4); ok('sugar rush never shortens an active projectile wind-up', g.projectiles.length===0 && e.candyT>0.2);

    clean(); e = put('cottonkite', -5, 0);
    run(0.2); p.pos.z = 8; run(0.95);
    const dropped=e.candyPops?.[0];
    ok('cottonkite drops a warned sweet on its committed flight path', !!dropped && Math.abs(dropped.z)<0.1 && e.candyState==='recover' && p.health===HEALTH, dropped ? `x=${dropped.x} z=${dropped.z}` : 'no sweet');
    p.pos.set(dropped?.x || 0,0,dropped?.z || 0); run(1.3);
    ok('its dropped sweet lands as real damage', p.health<HEALTH && !e.candyPops.length);

    // ---- the Confectioner --------------------------------------------------
    // DECK mirrors ATTACK_DECK in js/enemies/candy.js: the deal's order is
    // part of the fight's design, and this is where it is pinned from. A
    // reorder there breaks a pin here, loudly - which is the point.
    const DECK = ['carousel','bloom','rush','fan','twirl','bloom','carousel','fan','twirl','rush'];
    const pin = (name, x = -12) => {
      clean();
      const e = put('confectioner', x, 0);
      p.vel.set(0, 0, 0);
      run(0.1);                        // the AI's first-frame init lands here
      e.bs.turn = DECK.indexOf(name); // then the pattern is pinned by slot
      e.candyT = 0;
      // The boss keeps its real speed: the dash is clamped by the engine to
      // speed x stepMul like every enemy velocity, and a parked boss cannot
      // stampede. The one stalk tick before the pick drifts it a few
      // centimetres, which nothing below measures across.
      return e;
    };

    clean(); e = put('confectioner', -10, 0);
    const played = new Set(), paid = new Set();
    let tells = 0, last = '';
    run(50, () => {
      if (e.bs.attack) { played.add(e.bs.attack); if (e.bs.weakOpen) paid.add(e.bs.attack); }
      if (e.candyState === 'tell' && last === 'stalk') tells++;
      last = e.candyState;
    });
    ok('Confectioner plays all five patterns, each paying a heart window',
      played.size === 5 && paid.size === 5, JSON.stringify([...played]));
    ok('and they come fast: a fresh wind-up every few seconds', tells >= 8, `tells=${tells}`);

    clean(); e = put('confectioner', -10, 0); e.speed = 0; e.status.fear = 99;
    run(0.1); p.pos.copy(e.pos); p.invulnEnd = -1;
    run(0.35);
    ok('touching the cake hurts immediately, in any state', HEALTH - p.health > 20, `dmg=${HEALTH - p.health}`);
    p.pos.set(-4, 0, 0); p.health = HEALTH; p.invulnEnd = -1;
    run(2);
    ok('standing clear of it costs nothing', p.health === HEALTH, `dmg=${HEALTH - p.health}`);

    // SUGAR RUSH. The lane is the whole warning, so the assertions hold it
    // to exactly that: drawn before a step, honest about the trample, and
    // beatable by leaving it.
    e = pin('rush', -14); p.invulnEnd = -1;
    run(0.35);                         // the tell is up, the lane on the floor
    const laneAt = marks(), rushFrom = e.pos.x;
    const lane = g.effects.marks.find(m => m.used);
    run(0.05);
    ok('the stampede warns with a floor lane before it moves a step',
      laneAt === 1 && Math.abs(e.pos.x - rushFrom) < 0.01 && g.projectiles.length === 0,
      `marks=${laneAt}`);
    ok('the lane is drawn down the charge and over the ground it threatens',
      Math.abs(-(e.candyX - e.bs.dashOX) * e.bs.dashZ + (e.candyZ - e.bs.dashOZ) * e.bs.dashX) < 0.01
      && (e.candyX - e.bs.dashOX) * e.bs.dashX + (e.candyZ - e.bs.dashOZ) * e.bs.dashZ > 10
      && Math.abs(lane.group.rotation.z - Math.atan2(-e.bs.dashX, -e.bs.dashZ)) < 0.01,
      `cx=${lane.group.position.x.toFixed(1)} rot=${lane.group.rotation.z.toFixed(2)}`);
    p.pos.set(0, 0, 4); p.health = HEALTH;
    run(1.3);
    ok('sidestepping the lane defeats the stampede, and it crosses the arena anyway',
      p.health === HEALTH && !e.bs.dashHit && e.pos.x - rushFrom > 12,
      `dmg=${HEALTH - p.health} crossed=${(e.pos.x - rushFrom).toFixed(1)}`);
    e = pin('rush', -14); p.invulnEnd = -1; p.health = HEALTH;
    run(0.35); p.pos.set(3, 0, 0);
    run(1.3);
    ok('standing in the lane is trampled for the full hit', HEALTH - p.health >= 25,
      `trampled=${HEALTH - p.health}`);

    // TAFFY TWIRL. A turning lane anchored to the cake: bitten in its arc,
    // broken by cover, and unable to reach the far side of the room.
    e = pin('twirl', -6); p.invulnEnd = -1;
    run(0.85);
    const armA = g.effects.marks.find(m => m.used)?.group.rotation.z;
    run(0.25);
    const armB = g.effects.marks.find(m => m.used)?.group.rotation.z;
    ok('the twirl sweeps a lane that turns around the cake',
      marks() === 1 && e.candyState === 'twirl' && armA !== armB, `a=${armA} b=${armB}`);
    e = pin('twirl', -6); p.invulnEnd = -1; p.health = HEALTH;
    run(2.4);
    ok('the lash bites anyone standing in its arc', HEALTH - p.health >= 15,
      `lashed=${HEALTH - p.health}`);
    e = pin('twirl', -6); p.pos.set(-1, 0, 0); p.invulnEnd = -1; p.health = HEALTH;
    ctx.obstacles = [new THREE.Box3(new THREE.Vector3(-3, 0, -0.3), new THREE.Vector3(-2.8, 5, 0.3))];
    run(3.3);
    ok('a pillar between the cake and the player breaks the lash',
      p.health === HEALTH, `dmg=${HEALTH - p.health}`);
    e = pin('twirl', -6); p.pos.set(-6, 0, 11); p.invulnEnd = -1; p.health = HEALTH;
    run(3.3);
    ok('beyond the lash\'s reach the sweep cannot touch you', p.health === HEALTH,
      `dmg=${HEALTH - p.health}`);

    // PEPPERMINT CAROUSEL. Nothing leaves during the wind-up; the volleys
    // ride the half-beat, keep a wedge, and walk around as they fire.
    e = pin('carousel', -12);
    run(0.5);
    ok('nothing leaves during the crown\'s wind-up', g.projectiles.length === 0);
    const seen = [];
    run(2.0, () => { for (const q of g.projectiles) if (q.type === 'confectioner' && !seen.includes(q)) seen.push(q); });
    const ang = (q) => Math.atan2(q.vel.z, q.vel.x);
    ok('the carousel deals five three-arm volleys', seen.length === 15, `fired=${seen.length}`);
    const wedge = [ang(seen[12]), ang(seen[13]), ang(seen[14])].sort((x, y) => x - y);
    const gaps = [wedge[1] - wedge[0], wedge[2] - wedge[1], wedge[0] + Math.PI * 2 - wedge[2]];
    ok('every volley keeps a safe wedge between its arms',
      Math.max(...gaps) > 2 && Math.min(...gaps) > 1.8, `gaps=${gaps.map((n) => n.toFixed(2))}`);
    ok('and the arms walk around as they fire',
      Math.abs(ang(seen[12]) - ang(seen[0])) > 0.5,
      `walk=${Math.abs(ang(seen[12]) - ang(seen[0])).toFixed(2)}`);
    e = pin('carousel', -12); e.hp = e.maxHp * 0.3;
    const shelled = [];
    run(3.0, () => { for (const q of g.projectiles) if (q.type === 'confectioner' && !shelled.includes(q)) shelled.push(q); });
    ok('a cracked cake spins more arms and more volleys', shelled.length === 35,
      `fired=${shelled.length}`);

    // GUMDROP BLOOM. The centre is the question, the ring is drawn with its
    // own way out, and the drawn gap really is the safe line.
    e = pin('bloom', -12); p.invulnEnd = -1;
    run(0.75);
    const bloomPops = (e.candyPops || []).slice();
    ok('the bloom plants a centre sweet and a warned ring',
      bloomPops.length === 4 && bloomPops.every(q => q.double) && marks() === 4, `n=${bloomPops.length}`);
    const c = bloomPops[0];
    const angs = bloomPops.slice(1).map(q => Math.atan2(q.z - c.z, q.x - c.x)).sort((x, y) => x - y);
    let best = 0, gi = 0;
    for (let i = 0; i < angs.length; i++) {
      const gap = (i === angs.length - 1 ? angs[0] + Math.PI * 2 : angs[i + 1]) - angs[i];
      if (gap > best) { best = gap; gi = i; }
    }
    ok('the ring always leaves a readable way out', best > 1.75, `gap=${best.toFixed(2)}`);
    const bis = angs[gi] + best / 2;
    p.pos.set(c.x + Math.cos(bis) * 7, 0, c.z + Math.sin(bis) * 7); p.health = HEALTH;
    run(2.6);
    ok('escaping through the drawn gap beats the bloom',
      p.health === HEALTH && !e.candyPops.length, `dmg=${HEALTH - p.health}`);
    e = pin('bloom', -12); p.invulnEnd = -1; p.health = HEALTH;
    run(0.75); run(1.3);
    ok('the centre sweet punishes standing still', HEALTH - p.health >= 11,
      `dmg=${HEALTH - p.health}`);

    // BONBON FAN. The gunner's own sweet, thrown in a spread: bouncing,
    // shootable, and more of them as the shells come off.
    e = pin('fan', -12);
    run(0.65);
    const sweets = g.projectiles.filter(q => q.type === 'bonbon');
    ok('the fan throws bouncing, shootable wrapped sweets',
      sweets.length === 3 && sweets.every(q => q.bounces === 1 && q.shootable),
      `n=${sweets.length}`);
    const thrown = sweets[0];
    g.camera.position.copy(p.eyeInto(new THREE.Vector3()));
    g.camera.lookAt(thrown.pos); g.camera.updateMatrixWorld();
    thrown.mesh.updateMatrixWorld(true);
    g._firePellet(g.camera.position.clone(), [thrown.mesh], 0, p.weapon, 1, false);
    run(0.3);
    ok('shooting a thrown sweet takes it out of the air', !g.projectiles.includes(thrown));
    e = pin('fan', -12); e.hp = e.maxHp * 0.3;
    run(0.65);
    ok('a cracked cake throws a wider fan',
      g.projectiles.filter(q => q.type === 'bonbon').length === 5);

    // Killed mid-pattern, the lanes come home with the sweets.
    for (const [name, t] of [['rush', 1.1], ['twirl', 0.9]]) {
      const q = pin(name, -12);
      run(t);
      const held = marks();
      q.takeDamage(1e9); run(DT);
      ok(`${name} death mid-pattern returns its lane handle`,
        held === 1 && marks() === 0, `held=${held}`);
    }

    // The shutters are the window's face; what the armour says and what the
    // player sees must never disagree on the frame it opens.
    e = pin('fan', -12);
    run(0.7);
    ok('heart window and visible shutters agree on the transition frame',
      e.bs.weakOpen && e.candyDoors[0].position.x === -0.5 * e.scale
      && e.candyDoors[1].position.x === 0.5 * e.scale);
    const layers=[];
    for(const frac of [1,0.6,0.3]) { e.bs.weakOpen=false; e.hp=e.maxHp*frac; run(DT); e.bs.weakOpen=false;layers.push(ENEMY_TYPES.confectioner.armorDefault(e)); }
    e.bs.weakOpen=true;
    ok('boss layers weaken permanently and an open heart always takes full damage', layers.join()==='0.6,0.75,0.9' && ENEMY_TYPES.confectioner.armorDefault(e)===1, JSON.stringify(layers));

    for(const type of ['taffy','poprock','cottonkite','confectioner']) {
      clean();e=put(type,type==='taffy'?-4:-8,0);
      until(()=>e.candyPops?.length>0);
      const before=marks(),meshes=(e.candyPops||[]).map(p=>p.mesh);
      e.takeDamage(1e9);run(DT);
      ok(`${type} death cancels pending sweets and returns every mark`,before>0 && marks()===0 && meshes.every(m=>!m.parent),`before=${before} after=${marks()}`);
    }
    clean();const held=[];while(true){const h=g.effects.markAcquire();if(h<0)break;held.push(h);}
    e=put('poprock',-10,0);e.speed=0;run(DT);held.forEach(h=>g.effects.markRelease(h));run(2.5);
    ok('exhausted telegraph pool skips the attack instead of hiding it',p.health===HEALTH && !e.candyPops?.length && marks()===0);
    clean();run(1);ok('reset leaves no candy meshes or warning handles',marks()===0);
    return rows;
  });
  for(const row of rows){console.log(`${row.pass?'  ok  ':'  FAIL'} ${row.name} ${row.detail}`);if(!row.pass)fails++;}
  if(errors.length){console.log(errors.join('\n'));fails++;}
} finally {await browser?.close();server.kill();}
console.log(fails?`CANDY TEST FAIL (${fails})`:'CANDY TEST PASS');
process.exitCode=fails?1:0;
