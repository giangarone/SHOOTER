// THE WIN - clearing wave 30 in solo banks the streak, and nothing else does.
//
// Clearing wave 30 in solo parks the run on the win screen and banks +1, once
// per run. Dying or EXITing before the win zeroes the streak; dying or EXITing
// after it keeps what was banked. Versus never opens the screen and never
// touches the store, so a match can neither build a streak nor break one.
// The menu shows the stored streak, refreshed on every show.
//
// Trophies measure the best streak ever, permanently: Bronze at 1, Silver at
// 3, Gold at 5, Diamond at 10. The shelf is always visible - silhouettes until
// earned, and a win that crosses a tier says so on the win screen.
//
// Asserted as STATES through the real wave-clear path, not as unit calls:
// the trigger lives in _updateWave's clear branch, and a direct _claimWin()
// would pass with the wiring cut.
import { launchBrowser, sleep, startServer, bootPage } from './harness.mjs';

const PORT = 8235;
const server = startServer(PORT);
await sleep(800);

let browser;
let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
};

try {
  browser = await launchBrowser();
  const { page, errors } = await bootPage(browser, PORT);

  // The real clear path: an empty wave-30 arena clears on the frames it runs.
  // The poll lives INSIDE the page - requestAnimationFrame does not exist in
  // node, and a node-side sleep would be measuring the wall clock rather than
  // the loop (see __simWait in js/main.js).
  const clearWinWave = () => page.evaluate(() => new Promise((done) => {
    const g = window.__game;
    // 900 frames of budget, counted in the loop rather than on a clock.
    let n = 0;
    const budgeted = () => {
      g.queue.length = 0;
      g._clearEntities();
      g.bossFight = null;
      if (g.state === 'won' || ++n >= 900) { done(g.state === 'won'); return; }
      requestAnimationFrame(budgeted);
    };
    budgeted();
  }));

  // ---- 1. solo: clearing 30 wins, banks +1, parks on the screen ----
  const won = await page.evaluate(async () => {
    const g = window.__game;
    g.autoTest = false;
    localStorage.setItem('va-win-streak', '0');
    g.beginGame('solo');
    g.player.maxHealth = 99999;
    g.player.health = 99999;
    g.wave = 30;
    g.waveState = 'active';
    g.spawnTimer = 999;
    return true;
  });
  check('a solo run reaches the trigger', won);
  check('clearing wave 30 opens the win screen', await clearWinWave());
  const banked = await page.evaluate(() => ({
    state: window.__game.state,
    wave: window.__game.wave,
    streak: localStorage.getItem('va-win-streak'),
    shown: !document.getElementById('overlay-win').classList.contains('hidden'),
    run: document.getElementById('win-streak-run').textContent,
  }));
  check('the run parks in won', banked.state === 'won', banked.state);
  check('the streak banks exactly once', banked.streak === '1', `streak=${banked.streak}`);
  check('the screen says so', banked.shown && banked.run === '1', `run=${banked.run}`);

  // ---- 2. CONTINUE resumes the same break ----
  await page.evaluate(() => { document.getElementById('btn-win-continue').click(); });
  await sleep(300);
  const cont = await page.evaluate(() => ({
    state: window.__game.state,
    wave: window.__game.wave,
    waveState: window.__game.waveState,
    shown: !document.getElementById('overlay-win').classList.contains('hidden'),
    streak: localStorage.getItem('va-win-streak'),
  }));
  check('CONTINUE resumes playing', cont.state === 'playing', cont.state);
  check('on the same wave break', cont.wave === 30 && cont.waveState === 'intermission',
    `wave=${cont.wave} ${cont.waveState}`);
  check('the screen comes down', !cont.shown);
  check('the banked streak survives the resume', cont.streak === '1', `streak=${cont.streak}`);

  // ---- 3. dying AFTER the win keeps the streak ----
  await page.evaluate(() => { window.__game.player.health = 0; });
  await page.waitForFunction('window.__game.state === "gameover"', { timeout: 15000 });
  const kept = await page.evaluate(() => localStorage.getItem('va-win-streak'));
  check('a death after the win keeps the streak', kept === '1', `streak=${kept}`);

  // ---- 4. dying BEFORE the win zeroes it ----
  const dead = await page.evaluate(() => {
    localStorage.setItem('va-win-streak', '3');
    window.__game.beginGame('solo');
    window.__game.gameOver();
    return localStorage.getItem('va-win-streak');
  });
  check('a death before the win zeroes the streak', dead === '0', `streak=${dead}`);

  // ---- 5. EXITing BEFORE the win zeroes it ----
  const exited = await page.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('va-win-streak', '4');
    g.beginGame('solo');
    g.pause();
    g._exitToMenu();
    return {
      streak: localStorage.getItem('va-win-streak'),
      state: g.state,
      menu: document.getElementById('win-streak').textContent,
    };
  });
  check('EXITing before the win zeroes the streak', exited.streak === '0', `streak=${exited.streak}`);
  check('and the menu shows it', exited.menu === '0', `menu=${exited.menu}`);

  // ---- 6. BACK TO MENU keeps the win ----
  await page.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('va-win-streak', '0');
    g.beginGame('solo');
    g._claimWin();
  });
  await sleep(200);
  await page.evaluate(() => { document.getElementById('btn-win-menu').click(); });
  await sleep(300);
  const keptMenu = await page.evaluate(() => ({
    state: window.__game.state,
    streak: localStorage.getItem('va-win-streak'),
    menu: document.getElementById('win-streak').textContent,
  }));
  check('BACK TO MENU lands on the menu', keptMenu.state === 'menu', keptMenu.state);
  check('and keeps the banked win', keptMenu.streak === '1', `streak=${keptMenu.streak}`);
  check('which the menu shows', keptMenu.menu === '1', `menu=${keptMenu.menu}`);

  // ---- 7. versus: no screen, no touch ----
  const vs = await page.evaluate(async () => {
    const g = window.__game;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    localStorage.setItem('va-win-streak', '5');
    g.beginGame('versus', 2);
    g.player.maxHealth = 99999;
    g.player.health = 99999;
    g.match.slots.forEach((s) => {
      if (s && s.player) { s.player.maxHealth = 99999; s.player.health = 99999; }
    });
    g.wave = 30;
    g.match.wave = 30;
    g.waveState = 'active';
    g.spawnTimer = 999;
    let wonScreen = false;
    for (let i = 0; i < 900; i++) {
      g.queue.length = 0;
      g._clearEntities();
      g.bossFight = null;
      if (g.state === 'won') { wonScreen = true; break; }
      if (g._pass || g.waveState === 'idle') break;
      await step();
    }
    const streakAfterClear = localStorage.getItem('va-win-streak');
    // A versus death is a lost wave, never a streak reset.
    g.gameOver();
    return {
      wonScreen,
      streakAfterClear,
      afterDeath: localStorage.getItem('va-win-streak'),
      state: g.state,
    };
  });
  check('versus never opens the win screen', !vs.wonScreen, vs.state);
  check('a versus clear banks nothing', vs.streakAfterClear === '5', `streak=${vs.streakAfterClear}`);
  check('a versus death resets nothing', vs.afterDeath === '5', `streak=${vs.afterDeath}`);

  // ---- 8. trophies: silhouettes until earned, then lit forever ----
  // Both helpers live INSIDE the page - evaluate serializes the function
  // source, so a Node-side closure would arrive as an undefined name.
  const toMenu = () => {
    const g = window.__game;
    // A fresh menu read: the shelf refreshes on every show, so no path can
    // serve a stale one.
    if (g.state === 'dying') g._updateDeath(g._deathStart + 800);
    if (g.state === 'won') g._winToMenu();
    else if (g.state === 'gameover') { g._restartFromOver(); g.pause(); g._exitToMenu(); }
    else { if (g.state !== 'paused') g.pause(); g._exitToMenu(); }
    return {
      slots: [...document.querySelectorAll('#trophy-shelf .trophy')].map((el) => ([
        el.querySelector('.tname').textContent,
        el.querySelector('.treq').textContent,
        el.classList.contains('locked'),
      ])),
    };
  };
  // Fresh shelves are all silhouette.
  await page.evaluate(() => {
    localStorage.setItem('va-win-streak', '0');
    localStorage.setItem('va-best-streak', '0');
    window.__game.beginGame('solo');
  });
  const fresh = await page.evaluate(toMenu);
  check('the shelf holds all four tiers',
    fresh.slots.map((s) => s[0]).join(',') === 'BRONZE,SILVER,GOLD,DIAMOND',
    fresh.slots.map((s) => s[0]).join(','));
  check('unearned tiers are silhouettes', fresh.slots.every((s) => s[2]));

  // A win lights exactly the tiers it crossed, and names the unlock.
  const bronze = await page.evaluate(() => {
    const g = window.__game;
    g.beginGame('solo');
    g._claimWin();
    return {
      best: localStorage.getItem('va-best-streak'),
      line: document.getElementById('win-trophy').textContent,
      lineShown: !document.getElementById('win-trophy').classList.contains('hidden'),
    };
  });
  check('the first win banks a best of 1', bronze.best === '1', `best=${bronze.best}`);
  check('and calls out the unlock', bronze.lineShown && bronze.line === 'NEW TROPHY: BRONZE',
    `"${bronze.line}"`);
  const afterBronze = await page.evaluate(toMenu);
  check('bronze lights, the rest stay dark',
    afterBronze.slots.map((s) => s[2]).join(',') === 'false,true,true,true');

  // A win that crosses nothing says nothing.
  const quiet = await page.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('va-win-streak', '1');
    g.beginGame('solo');
    g._claimWin();
    return {
      best: localStorage.getItem('va-best-streak'),
      lineShown: !document.getElementById('win-trophy').classList.contains('hidden'),
    };
  });
  check('a win below the next tier banks best 2', quiet.best === '2', `best=${quiet.best}`);
  check('and stays quiet about it', !quiet.lineShown);

  // Silver, gold and diamond unlock at exactly 3, 5 and 10.
  const silv = await page.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('va-win-streak', '2');
    g.beginGame('solo');
    g._claimWin();
    return document.getElementById('win-trophy').textContent;
  });
  check('streak 3 unlocks silver', silv === 'NEW TROPHY: SILVER', `"${silv}"`);
  await page.evaluate(() => { window.__game._winToMenu(); });
  const gold = await page.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('va-win-streak', '4');
    g.beginGame('solo');
    g._claimWin();
    return document.getElementById('win-trophy').textContent;
  });
  check('streak 5 unlocks gold', gold === 'NEW TROPHY: GOLD', `"${gold}"`);
  await page.evaluate(() => { window.__game._winToMenu(); });
  const dia = await page.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('va-win-streak', '9');
    g.beginGame('solo');
    g._claimWin();
    return document.getElementById('win-trophy').textContent;
  });
  check('streak 10 unlocks diamond', dia === 'NEW TROPHY: DIAMOND', `"${dia}"`);
  const full = await page.evaluate(toMenu);
  check('a full shelf never goes dark', full.slots.every((s) => !s[2]));

  // ---- 9. best is permanent, and versus cannot touch it ----
  const perm = await page.evaluate(() => {
    const g = window.__game;
    g.beginGame('solo');
    g.gameOver();
    return {
      streak: localStorage.getItem('va-win-streak'),
      best: localStorage.getItem('va-best-streak'),
    };
  });
  check('a death zeroes the streak but keeps the best',
    perm.streak === '0' && perm.best === '10', `streak=${perm.streak} best=${perm.best}`);
  const lit = await page.evaluate(toMenu);
  check('earned trophies survive the reset', lit.slots.every((s) => !s[2]));
  const vbest = await page.evaluate(() => {
    const g = window.__game;
    localStorage.setItem('va-best-streak', '7');
    g.beginGame('versus', 2);
    g.gameOver();
    return localStorage.getItem('va-best-streak');
  });
  check('versus never touches the best', vbest === '7', `best=${vbest}`);

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  const death = await page.evaluate(async () => {
    const g = window.__game;
    g.renderer.setAnimationLoop(null);
    const { Enemy, Projectile } = await import('./js/enemy.js');
    const THREE = await import('three');
    g.autoTest = true;
    g.beginGame();
    g.autoTest = false;
    g._clearEntities();
    g.player.pos.set(0, 0, 0);
    g.player.pitch = g.player.yaw = 0;
    g.waveState = 'active';
    g.spawnTimer = 999;
    const enemy = new Enemy('chaser', new THREE.Vector3(0, 0, -7), 1, 1, 1);
    const shooter = new Enemy('shooter', new THREE.Vector3(7, 0, -7), 1, 1, 1);
    for (const e of [enemy, shooter]) { g.scene.add(e.group); g.enemies.push(e); }
    const shot = new Projectile(g.scene, g.effects.glowTex, -8, 1.7, 8,
      new THREE.Vector3(10, 1.7, 8), 12, 5, 'herald');
    g.projectiles.push(shot);
    g._loop(g.last + 20);
    g.autoTest = true;
    g.kills = 7; g.credits = 123; g.player.health = 42;
    g.player.mods.strayMercy = 1;
    g.player.mods.donationTithe = 1;
    g.queue.push('chaser');
    const time = g.time;
    const cameraY = g.camera.position.y;
    const enemyPos = enemy.pos.clone();
    const shotLife = shot.life;
    const hp = g.player.health;
    const playerPos = g.player.pos.clone();
    const playerVel = g.player.vel.clone();
    const stats = JSON.stringify(g.stats);
    g.gameOver();
    const start = g._deathStart;
    let attempts = 0;
    g._deathScene.enemyContext.onHitPlayer = () => { attempts++; };
    const entered = g.state === 'dying' && g.ui.overOv.classList.contains('hidden') && !g.player.gun.visible;
    const rigTime = g.rig.t;
    const spark = g.effects.sparks.life.findIndex(l => l > 0);
    const sparkLife = g.effects.sparks.life[spark];
    const travel = [];
    let lastX = shot.pos.x;
    for (let ms = 50; ms <= 450; ms += 50) {
      g._loop(start + ms);
      travel.push(shot.pos.x - lastX);
      lastX = shot.pos.x;
    }
    g._loop(start + 499);
    const held = g.state === 'dying';
    g._loop(start + 500);
    travel.push(shot.pos.x - lastX);
    const finished = g.state === 'gameover' && !g.ui.overOv.classList.contains('hidden');
    const summary = g.ui.overStats.textContent;
    const fallen = Math.abs(g.camera.position.y - 0.24) < 1e-6 && g.camera.position.y < cameraY
      && g.camera.getWorldDirection(new THREE.Vector3()).y > 0.8 && !g.player.gun.visible;
    const cameraPos = g.camera.position.clone();
    const cameraRot = g.camera.quaternion.clone();
    const colour = g.crt._composite.uniforms.uMono.value === 0;
    const actualMovement = enemy.pos.distanceTo(enemyPos) > 0.5;
    const sharedClock = Math.abs(g.rig.t - rigTime - 0.325) < 1e-6
      && Math.abs(sparkLife - g.effects.sparks.life[spark] - 0.325) < 1e-5
      && Math.abs(shotLife - shot.life - 0.325) < 1e-6;
    const endX = shot.pos.x;
    const endRig = g.rig.t;
    for (let ms = 550; ms <= 1000; ms += 50) g._loop(start + ms);
    const continuing = Math.abs(shot.pos.x - endX - 1.8) < 1e-6
      && Math.abs(g.rig.t - endRig - 0.15) < 1e-6;
    // Drive the same background update without paying for hundreds of renders.
    for (let i = 0; i < 300; i++) {
      const step = g._updateDeath(g.last + 50, 0.05);
      g.last += 50;
      g.effects.update(step, g.camera);
    }
    const bodySpace = Math.hypot(enemy.pos.x, enemy.pos.z) >= enemy.radius + 0.39;
    enemy.takeDamage(enemy.hp + 1, true);
    g._deathScene.step(0.015);
    const finalFrozen = g.time === time && g.kills === 7 && g.credits === 123
      && g.player.health === hp && g.player.pos.equals(playerPos) && g.player.vel.equals(playerVel)
      && JSON.stringify(g.stats) === stats && g.queue.length === 1 && g.wave === 0
      && g.ui.overStats.textContent === summary;
    const cameraResting = g.camera.position.equals(cameraPos) && g.camera.quaternion.equals(cameraRot);
    g.beginGame();
    const reset = g._deathStart === null && g._deathScene === null
      && g.player.gun.visible && g.camera.position.y > 1
      && Math.abs(g.camera.getWorldDirection(new THREE.Vector3()).y) < 0.01
      && g.effects.sparks.alive === 0 && g.effects.impacts.alive === 0
      && g.effects.tracers.every(t => t.life === 0 && t.anchor === null)
      && g.effects.shakeAmp === 0;
    const totals = [];
    for (const step of [16, 33, 50]) {
      g.beginGame();
      g.gameOver();
      const t = g.rig.t;
      const begin = g._deathStart;
      for (let ms = step; ms < 1500; ms += step) g._loop(begin + ms);
      g._loop(begin + 1500);
      totals.push(g.rig.t - t);
    }
    g.beginGame();
    const platform = new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 3, 2));
    g.arena.obstacles.push(platform);
    g.player.pos.set(0, 3, 0);
    g.player.applyCamera();
    g.gameOver();
    g._updateDeath(g._deathStart + 500);
    const supported = Math.abs(g.camera.position.y - 3.24) < 1e-6;
    g.arena.obstacles.splice(g.arena.obstacles.indexOf(platform), 1);
    g.beginGame();
    g.crt.setMono(true);
    g.gameOver();
    g._loop(g._deathStart + 500);
    const grayMatter = g.crt._composite.uniforms.uMono.value === 1;
    g.crt.setMono(false);
    g.beginGame();
    return { entered, held, finished, fallen, cameraResting, colour, actualMovement,
      sharedClock, continuing, travel, summary, reset, totals, grayMatter, finalFrozen,
      attempts, supported, bodySpace };
  });
  check('solo death falls for half a second and immediately hides the gun', death.entered && death.held && death.finished && death.fallen, JSON.stringify(death));
  check('monsters keep attacking while leaving the fallen camera clear', death.actualMovement && death.attempts > 0 && death.bodySpace, `attempts=${death.attempts}`);
  check('the arena slows progressively and stays live at 30%', death.travel[0] > 0.58
    && death.travel.every((d, i) => d > 0 && (!i || d < death.travel[i - 1])) && death.continuing, JSON.stringify(death));
  check('shots, effects and lighting share the clock at every frame rate', death.sharedClock
    && death.totals.every(t => Math.abs(t - 0.625) < 1e-6), JSON.stringify(death));
  check('the resting camera looks upward and lands on the supporting surface', death.cameraResting && death.supported);
  check('the scene keeps its colour and Gray Matter still works', death.colour && death.grayMatter);
  check('damage, rewards, waves and results stay frozen during background attacks', death.finalFrozen && death.summary.includes('$123'), JSON.stringify(death));
  check('restart restores the camera and gun and clears death effects', death.reset);

  const themes = await page.evaluate(async () => {
    const g = window.__game;
    const { THEMES } = await import('./js/themes.js');
    const { Enemy } = await import('./js/enemy.js');
    const THREE = await import('three');
    const results = [];
    const allThemes = Object.values(THEMES);
    // Every theme runs its real AI against the fallen target, including bosses
    // that summon allies or write directly to a player's velocity.
    for (const theme of allThemes) {
      g.beginGame();
      g.waveState = 'active';
      g.player.pos.set(0, 0, 0);
      const types = [...Object.values(theme.roles), theme.boss];
      for (let i = 0; i < types.length; i++) {
        const at = new THREE.Vector3(Math.sin(i) * 8, 0, -5 - Math.cos(i) * 4);
        const e = new Enemy(types[i], at, 1, 1, 1);
        if (i === types.length - 1) e.hp = e.maxHp * 0.2;
        g.scene.add(e.group);
        g.enemies.push(e);
      }
      const hp = g.player.health;
      const vel = g.player.vel.clone();
      const time = g.time;
      g.gameOver();
      let ok = true;
      try {
        for (let frame = 0; frame < 400; frame++) {
          g._deathScene.step(0.05);
          g.effects.update(0.05, g.camera);
          ok &&= g.enemies.length <= types.length && g.projectiles.length <= 64;
        }
        ok &&= g.player.health === hp && g.player.vel.equals(vel)
          && g.time === time && g.kills === 0 && g.credits === 0;
      } catch (error) { results.push({ theme: theme.name, error: error.message }); ok = false; }
      g.beginGame();
      ok &&= g.effects.marks.every(m => !m.used) && g.effects.creep.every(c => !c.used)
        && g.effects.clouds.every(c => !c.used);
      if (!ok && !results.some(r => r.theme === theme.name)) results.push({ theme: theme.name });
    }
    return { count: allThemes.length, failures: results };
  });
  check('every theme survives a long death background without growth, rewards or pool leaks', themes.failures.length === 0, JSON.stringify(themes));

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const reduced = await page.evaluate(() => {
    const g = window.__game;
    g.beginGame();
    const pos = g.camera.position.clone();
    const rot = g.camera.quaternion.clone();
    const t = g.rig.t;
    g.gameOver();
    g._loop(g.last + 50);
    const ok = g.state === 'gameover' && g._deathStart === null && g.camera.position.equals(pos)
      && g.camera.quaternion.equals(rot) && g.rig.t === t && !g.player.gun.visible;
    g.renderer.setAnimationLoop((now) => g._loop(now));
    return ok;
  });
  check('reduced motion shows static results immediately without moving the camera', reduced);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(bad ? `WIN TEST FAIL (${bad})` : 'WIN TEST PASS');
process.exitCode = bad ? 1 : 0;
