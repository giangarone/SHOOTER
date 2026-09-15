// CANDY: two-stage pops, shootable sweets, permanent shell loss, musical
// recovery boosts and the Confectioner's gaps. Fixed ticks in a real browser.
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

    clean(); e = put('confectioner', -10, 0);
    const attacks=new Set(), windows=new Set();
    run(25,()=>{if(e.bs.attack)attacks.add(e.bs.attack);if(e.bs.weakOpen)windows.add(e.bs.attack);});
    ok('Confectioner uses all three attacks and exposes its heart after each', attacks.size===3 && windows.size===3, JSON.stringify([...attacks]));
    const layers=[];
    for(const frac of [1,0.6,0.3]) { e.bs.weakOpen=false; e.hp=e.maxHp*frac; run(DT); e.bs.weakOpen=false;layers.push(ENEMY_TYPES.confectioner.armorDefault(e)); }
    e.bs.weakOpen=true;
    ok('boss layers weaken permanently and an open heart always takes full damage', layers.join()==='0.6,0.75,0.9' && ENEMY_TYPES.confectioner.armorDefault(e)===1, JSON.stringify(layers));
    const ribbons=(escape)=>{
      clean();const e=put('confectioner',-10,0);e.speed=0;e.candyState='walk';e.candyT=0;e.bs.turn=0;
      run(1.1); const warnings=marks(); if(escape)p.pos.set(4,0,4);
      run(2);return {damage:HEALTH-p.health,warnings,open:e.bs.weakOpen,doors:e.candyDoors.map(m=>m.position.x/e.scale)};
    };
    const pressed=ribbons(false),escaped=ribbons(true);
    ok('crossing taffy strips both warn; diagonal escape avoids them', pressed.warnings===2 && pressed.damage>0 && escaped.damage===0 && escaped.open, JSON.stringify({pressed,escaped}));
    ok('heart window and visible shutters agree on the transition frame', escaped.doors[0]===-0.5 && escaped.doors[1]===0.5);
    const carousel=(tier)=>{
      clean();const e=put('confectioner',-10,0);e.speed=0;e.candyState='walk';e.candyT=0;e.bs.turn=1;
      if(tier)e.hp=e.maxHp*0.3;
      const fired=new Set();run(1.1,()=>g.projectiles.forEach(p=>fired.add(p)));
      const angles=[...fired].map(p=>Math.atan2(p.vel.z,p.vel.x));run(1);
      return {n:fired.size,safe:angles.every(a=>Math.abs(a)>=Math.PI/4-0.01),damage:HEALTH-p.health};
    };
    const carousel1=carousel(0),carousel3=carousel(2);
    ok('carousel grows as layers crack but preserves its safe wedge',carousel3.n>carousel1.n && carousel1.n>0 && carousel1.safe && carousel3.safe && carousel1.damage===0,JSON.stringify({carousel1,carousel3}));

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
