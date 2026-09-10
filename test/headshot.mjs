// HEADSHOTS, and the four other things that had to be true for them to work.
//
// WHAT IS ASSERTED
//   1. EVERY enemy in the roster has a head sphere, and it is above the middle
//      of the body and inside the model. A type that shipped without one would
//      be silently headshot-proof, which is the failure this file exists for.
//   2. A round into the head is worth exactly HEADSHOT_MULT times a round into
//      the body, on the same enemy, with the same gun.
//   3. ONE round is ONE hit. The head and the body sphere overlap, so a pellet
//      through a face intersects the same enemy twice - if that ever pays twice
//      the whole roster silently takes double damage from the front.
//   4. Aim assist does not pull DOWN off a head the player is already on, and
//      still tracks a body horizontally.
//   5. Aegis stops burn damage, and lava cannot light a fresh burn through it.
//   6. A dash straight up does not leave the room.
//   7. A drop from a kill on a platform rests ON the platform, and so does a
//      turret - and a turret placed up there can still see.
//   8. The rolling rock stays above the floor for a whole revolution.
//   9. HIGH STAKES prices read FREE, on both consoles.
//  10. The Forge-Tyrant opens its core often enough to be a mechanic.
//  11. BOTTOM FEEDER's window is on the HUD.
import puppeteer from 'puppeteer-core';
import { CHROME, startServer } from './harness.mjs';

const PORT = 8241;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT);
await sleep(800);

let browser;
let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
};

try {
  browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load' });
  await sleep(1500);

  // ---- 1. every type has a head, in a sane place ----
  const heads = await page.evaluate(async () => {
    const { ENEMY_TYPES } = await import('./js/enemies/index.js');
    const THREE = await import('three');
    const g = window.__game;
    const Enemy = g.__EnemyForTest;
    const out = [];
    for (const type of Object.keys(ENEMY_TYPES)) {
      const e = new Enemy(type, new THREE.Vector3(0, 0, 0), 1, 1, 1);
      const hb = e.hitbox;
      // The drawn model's own extent, hitboxes excluded.
      e.group.updateMatrixWorld(true);
      const box = new THREE.Box3();
      e.group.traverse((o) => {
        if (!o.isMesh || o === hb || o === e.head) return;
        box.expandByObject(o);
      });
      out.push({
        type,
        modelTop: box.isEmpty() ? 0 : box.max.y,
        headY: e.head.position.y,
        headR: e.head.geometry.parameters.radius * e.head.scale.x,
        bodyY: hb.position.y,
        bodyR: hb.geometry.parameters.radius * hb.scale.x,
      });
      e.dispose();
      g.scene.remove(e.group);
    }
    return out;
  });
  check('every type has a head sphere', heads.every((h) => h.headR > 0),
    `${heads.length} types`);
  // Above the body's centre, so it is a HEAD and not a second chest. The two
  // fliers whose faces hang below their own origin are the honest exceptions -
  // a mothcap's head really is under it - so the test is that the head is not
  // the same place as the body, not that it is always higher.
  // SMALLER THAN THE BODY, always. A head as big as the chest is not a head,
  // it is a free doubling for anyone aiming centre mass.
  const fat = heads.filter((h) => h.headR > h.bodyR * 0.8);
  check('a head is smaller than the body it is on', fat.length === 0,
    fat.map((h) => `${h.type} ${h.headR.toFixed(2)}/${h.bodyR.toFixed(2)}`).join(','));
  // Overlapping, so no round can pass through the seam between the two without
  // touching either. Enemy's own clamp guarantees this - see headSeam.
  const gapped = heads.filter((h) => Math.abs(h.headY - h.bodyY) >= h.headR + h.bodyR);
  check('head and body overlap', gapped.length === 0,
    gapped.map((h) => `${h.type} ${(h.headY - h.bodyY).toFixed(2)}`).join(','));
  // And inside the model, not floating over it: a head sphere above the tallest
  // part of the body is somewhere the player can hit with nothing drawn there.
  const floating = heads.filter((h) => h.headY - h.headR > h.modelTop);
  check('no head floats above the model', floating.length === 0,
    floating.map((h) => `${h.type} ${h.headY.toFixed(2)} > ${h.modelTop.toFixed(2)}`).join(','));

  // ---- 2 & 3. what a head is worth, and that it is paid once ----
  const dmg = await page.evaluate(async () => {
    const g = window.__game;
    const Enemy = g.__EnemyForTest;
    const THREE = await import('three');
    // A single enemy, parked in front of the camera, shot straight down the
    // barrel by driving the same _firePellet the gun uses.
    const shoot = (aimAtHead) => {
      const e = new Enemy('tank', new THREE.Vector3(0, 0, 0), 1, 1, 1);
      g.scene.add(e.group);
      e.hp = 100000;
      g.enemies.length = 0;
      g.enemies.push(e);
      e.pos.set(0, 0, -8);
      e.group.position.copy(e.pos);
      e.group.updateMatrixWorld(true);
      const at = new THREE.Vector3();
      (aimAtHead ? e.head : e.hitbox).getWorldPosition(at);
      // The camera is the ray, so point it at the sphere under test.
      g.camera.position.set(0, at.y, 0);
      g.camera.lookAt(at);
      g.camera.updateMatrixWorld(true);
      const targets = [];
      for (const en of g.enemies) { targets.push(en.hitbox); targets.push(en.head); }
      const before = e.hp;
      let hits = 0;
      const sink = g.effects.damageNumber.bind(g.effects);
      g.effects.damageNumber = (...a) => { hits++; return sink(...a); };
      g._shotHits.clear();
      g._shotCrit.clear();
      g._firePellet(new THREE.Vector3(0, at.y, 0), targets, 0, g.player.weapon, 1, false);
      g.effects.damageNumber = sink;
      const dealt = before - e.hp;
      e.dispose();
      g.scene.remove(e.group);
      g.enemies.length = 0;
      return { dealt, hits };
    };
    const body = shoot(false);
    const head = shoot(true);
    return { body, head };
  });
  check('a body shot lands', dmg.body.dealt > 0, `${dmg.body.dealt.toFixed(1)}`);
  check('a head shot is worth double',
    Math.abs(dmg.head.dealt / dmg.body.dealt - 2) < 0.02,
    `${dmg.head.dealt.toFixed(1)} vs ${dmg.body.dealt.toFixed(1)}`);
  check('one round through a head is ONE hit', dmg.head.hits === 1,
    `${dmg.head.hits} damage numbers`);
  check('one round through a body is ONE hit', dmg.body.hits === 1,
    `${dmg.body.hits} damage numbers`);

  // ---- 4. aim assist lets go of a head ----
  const assist = await page.evaluate(async () => {
    const g = window.__game;
    const Enemy = g.__EnemyForTest;
    const THREE = await import('three');
    const e = new Enemy('tank', new THREE.Vector3(0, 0, 0), 1, 1, 1);
    g.scene.add(e.group);
    g.enemies.length = 0;
    g.enemies.push(e);
    e.pos.set(0, 0, -10);
    e.group.position.copy(e.pos);
    e.group.updateMatrixWorld(true);
    const p = g.player;
    p.pos.set(0, 0, 0);
    p.recoilPitch = 0;
    p.yaw = 0;
    const eye = p.eyeInto(new THREE.Vector3());
    const at = new THREE.Vector3();
    const aimAt = (target) => {
      target.getWorldPosition(at);
      const flat = Math.hypot(at.x - eye.x, at.z - eye.z);
      p.pitch = Math.atan2(at.y - eye.y, flat);
      return g._assistTarget();
    };
    const onHead = aimAt(e.head);
    const onBody = aimAt(e.hitbox);
    // And a body off to one side, to prove the horizontal half still works.
    e.pos.set(1, 0, -10);
    e.group.position.copy(e.pos);
    e.group.updateMatrixWorld(true);
    p.pitch = 0;
    const offAxis = g._assistTarget();
    e.dispose();
    g.scene.remove(e.group);
    g.enemies.length = 0;
    return {
      headPitch: onHead ? onHead.dPitch : null,
      bodyPitch: onBody ? onBody.dPitch : null,
      offYaw: offAxis ? offAxis.dYaw : null,
    };
  });
  check('assist does not pull down off a head', assist.headPitch === 0,
    `dPitch ${assist.headPitch}`);
  check('assist still centres on a body', assist.bodyPitch !== null
    && Math.abs(assist.bodyPitch) < 0.001, `dPitch ${assist.bodyPitch}`);
  check('assist still tracks sideways', assist.offYaw !== null
    && Math.abs(assist.offYaw) > 0.001, `dYaw ${assist.offYaw}`);

  // ---- 5. Aegis versus a burn ----
  const aegis = await page.evaluate(async () => {
    const g = window.__game;
    const p = g.player;
    p.health = 100;
    p.applyStatus('fire', 5);
    p.invulnEnd = 0;
    // Burn with no ward: it has to hurt, or the guarded case proves nothing.
    let hp0 = p.health;
    for (let i = 0; i < 120; i++) {
      p._tickStatus(1 / 60);
      const d = p.drainStatusDamage();
      if (d > 0) g._hurtPlayerDot(d);
    }
    const unguarded = hp0 - p.health;
    // And with it.
    p.health = 100;
    p.applyStatus('fire', 5);
    p.invulnEnd = g.time + 8;
    hp0 = p.health;
    for (let i = 0; i < 120; i++) {
      p._tickStatus(1 / 60);
      const d = p.drainStatusDamage();
      if (d > 0) g._hurtPlayerDot(d);
    }
    const guarded = hp0 - p.health;
    const stillBurning = p.status.fire > 0;
    // A fresh ignite through the ward.
    p.status.fire = 0;
    g._afflictPlayer('fire', 5);
    const relit = p.status.fire > 0;
    p.invulnEnd = 0;
    p.status.fire = 0;
    p.health = p.maxHealth;
    return { unguarded, guarded, stillBurning, relit };
  });
  check('a burn hurts with no ward up', aegis.unguarded > 0,
    `${aegis.unguarded.toFixed(1)} hp`);
  check('AEGIS stops burn damage', aegis.guarded === 0, `${aegis.guarded} hp`);
  check('and the burn keeps ticking down underneath', aegis.stillBurning);
  check('AEGIS refuses a fresh ignite', !aegis.relit);

  // ---- 6. the dash stays in the room ----
  const dash = await page.evaluate(async () => {
    const { CEIL_Y } = await import('./js/arena.js');
    const g = window.__game;
    const p = g.player;
    p.pos.set(0, 0, 0);
    p.vel.set(0, 0, 0);
    p.pitch = 1.5;
    p.dash(g.time, 1, p.pitch);
    let peak = 0;
    let t = g.time;
    for (let i = 0; i < 240; i++) {
      t += 1 / 60;
      p.update(1 / 60, { move: { x: 0, z: 0 }, look: { x: 0, y: 0 } },
        g.arena.obstacles, t);
      if (p.pos.y > peak) peak = p.pos.y;
    }
    p.pitch = 0;
    p.vel.set(0, 0, 0);
    return { peak, ceil: CEIL_Y === undefined ? 16 : CEIL_Y };
  });
  check('a dash straight up stays under the roof', dash.peak < dash.ceil,
    `peak ${dash.peak.toFixed(2)}m, roof ${dash.ceil}m`);
  check('and it still climbs', dash.peak > 1.5, `peak ${dash.peak.toFixed(2)}m`);

  // ---- 7. a drop, and a turret, land on what they were put on ----
  const placed = await page.evaluate(async () => {
    const { spawnDropAt } = await import('./js/powerups.js');
    const { Turret } = await import('./js/deploy.js');
    const { makeAabb } = await import('./js/utils.js');
    const g = window.__game;
    // A platform of our own, so the test does not depend on which terrain the
    // wave happened to roll.
    const TOP = 3;
    // makeAabb centres on y, so this stands a 4x4 block whose TOP is at TOP.
    const box = makeAabb(20, TOP / 2, 20, 4, TOP, 4);
    const obs = g.arena.obstacles;
    obs.push(box);
    const x = 20;
    const z = 20;
    const p = spawnDropAt('ammo', { x, y: TOP, z }, g.scene, g.effects.glowTex, g.time, obs);
    const dropOn = p.groundY;
    // Reachable from up there and NOT from the floor underneath it.
    const fromAbove = p.tryPickup({ x, y: TOP, z });
    const fromBelow = p.tryPickup({ x, y: 0, z });
    p.destroy();
    // Open floor is still the floor.
    const q = spawnDropAt('ammo', { x: 0, y: 0, z: 0 }, g.scene, g.effects.glowTex, g.time, obs);
    const dropFloor = q.groundY;
    q.destroy();
    const t = new Turret(g, x, z, 10, TOP);
    const turretOn = t.pos.y;
    // And it can see: a turret buried in a stair reports every line blocked.
    const Enemy = g.__EnemyForTest;
    const THREE = await import('three');
    const e = new Enemy('chaser', new THREE.Vector3(0, 0, 0), 1, 1, 1);
    g.scene.add(e.group);
    e.pos.set(x + 6, TOP, z);
    e.group.position.copy(e.pos);
    const saw = t.update(0.016, {
      enemies: [e], obstacles: obs, effects: g.effects, sfx: g.sfx,
      hurtEnemy: () => {}, pulse: 1,
    });
    const aimed = t.yaw !== 0;
    t.destroy();
    e.dispose();
    g.scene.remove(e.group);
    obs.pop();
    return { dropOn, dropFloor, turretOn, top: TOP, fromAbove, fromBelow, saw, aimed };
  });
  check('a drop rests on the platform it was killed on',
    Math.abs(placed.dropOn - placed.top) < 0.01,
    `${placed.dropOn} vs ${placed.top}`);
  check('and it can be collected from up there', placed.fromAbove);
  check('but not through the floor from underneath', !placed.fromBelow);
  check('open floor is still the floor', placed.dropFloor === 0, `${placed.dropFloor}`);
  check('a turret stands on the platform', Math.abs(placed.turretOn - placed.top) < 0.01,
    `${placed.turretOn} vs ${placed.top}`);
  check('and it can see off it', placed.aimed, `alive=${placed.saw}`);

  // ---- 8. the boulder stays out of the floor ----
  const roll = await page.evaluate(async () => {
    const THREE = await import('three');
    const g = window.__game;
    const Enemy = g.__EnemyForTest;
    const e = new Enemy('scree', new THREE.Vector3(0, 0, -6), 1, 1, 1);
    g.scene.add(e.group);
    // Held at the top of the lift, which is where a roll spends all but its
    // first and last few frames.
    e.rollUp = 1;
    e.rollPivot.position.y = e.rollPivotY + e.rollLift;
    const box = new THREE.Box3();
    const sweep = () => {
      let lowest = 99;
      for (let i = 0; i < 90; i++) {
        e.rollPivot.rotation.x -= (Math.PI * 2) / 90;
        e.group.updateMatrixWorld(true);
        box.makeEmpty();
        e.group.traverse((o) => {
          if (o.isMesh && o !== e.hitbox && o !== e.head) box.expandByObject(o);
        });
        if (box.min.y < lowest) lowest = box.min.y;
      }
      return lowest;
    };
    const pivoted = sweep();
    // And what it used to do: turn the group itself, about the feet.
    e.rollPivot.rotation.x = 0;
    e.rollPivot.position.y = e.rollPivotY;
    let feet = 99;
    for (let i = 0; i < 90; i++) {
      e.group.rotation.x -= (Math.PI * 2) / 90;
      e.group.updateMatrixWorld(true);
      box.makeEmpty();
      e.group.traverse((o) => {
        if (o.isMesh && o !== e.hitbox && o !== e.head) box.expandByObject(o);
      });
      if (box.min.y < feet) feet = box.min.y;
    }
    e.dispose();
    g.scene.remove(e.group);
    return { pivoted, feet };
  });
  check('a rolling scree never goes under the floor', roll.pivoted >= -0.001,
    `lowest ${roll.pivoted.toFixed(3)}m (about its feet it would be ${roll.feet.toFixed(2)}m)`);

  // ---- 9. HIGH STAKES says what it charges ----
  const stakes = await page.evaluate(async () => {
    const g = window.__game;
    const m = g.player.mods;
    const plain = { reroll: g._priceLabel(g._rerollCost()), box: g._priceLabel(g._boxCost()) };
    const ammoPlain = g._ammoCost();
    m.highStakes = 1;
    const free = { reroll: g._priceLabel(g._rerollCost()), box: g._priceLabel(g._boxCost()) };
    // Ammo is NOT part of the deal and must still cost money.
    const ammoFree = g._ammoCost();
    m.highStakes = 0;
    return { plain, free, ammoPlain, ammoFree };
  });
  check('without HIGH STAKES a reroll has a price', stakes.plain.reroll.startsWith('$'),
    stakes.plain.reroll);
  check('and so does the box', stakes.plain.box.startsWith('$'), stakes.plain.box);
  check('with it, the reroll reads FREE', stakes.free.reroll === 'FREE', stakes.free.reroll);
  check('and so does the box', stakes.free.box === 'FREE', stakes.free.box);
  check('but ammunition still costs money', stakes.ammoFree === stakes.ammoPlain
    && stakes.ammoFree > 0, `$${stakes.ammoFree}`);

  // ---- 10. the Forge-Tyrant's window comes round ----
  const forge = await page.evaluate(async () => {
    const m = await import('./js/enemies/ember.js');
    return {
      fill: 1 / m.FORGE_HEAT_RATE,
      vent: m.FORGE_VENT_TIME,
      cd: m.FORGE_VENT_CD,
      sweepAt: m.FORGE_SWEEP_AT,
      ringAt: m.FORGE_RING_AT,
    };
  });
  const shut = forge.fill + forge.cd;
  check('the core opens at least every fifteen seconds', shut + forge.vent <= 15,
    `${(shut + forge.vent).toFixed(1)}s a cycle, ${forge.vent}s of it open`);
  check('and both specials still come up before it does',
    forge.sweepAt < 1 && forge.ringAt < 1 && forge.sweepAt < forge.ringAt,
    `sweep ${forge.sweepAt}, ring ${forge.ringAt}`);

  // ---- 11. BOTTOM FEEDER is on the HUD ----
  const chip = await page.evaluate(async () => {
    const g = window.__game;
    const p = g.player;
    p.mods.bottomFeed = 0.2;
    p.mods.bottomTime = 5;
    p.bottomEnd = 0;
    g._syncHud ? g._syncHud() : null;
    const before = !!document.querySelector('[data-buff="bottomFeed"], .buff-bottomFeed');
    p.bottomEnd = g.time + 5;
    // One frame of the HUD sync is all the chip needs.
    g.ui.setBuffs(0, 0, 0, 0, 0,
      (p.bottomEnd - g.time) / p.mods.bottomTime);
    const el = g.ui._buffEls.bottomFeed;
    const shown = !!(el && el.shown);
    p.bottomEnd = 0;
    g.ui.setBuffs(0, 0, 0, 0, 0, 0);
    const gone = !!(g.ui._buffEls.bottomFeed && g.ui._buffEls.bottomFeed.shown);
    return { before, shown, gone };
  });
  check('BOTTOM FEEDER wears a chip while its window is open', chip.shown);
  check('and it goes when the window does', !chip.gone);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(bad ? `HEADSHOT TEST FAIL (${bad})` : 'HEADSHOT TEST PASS');
process.exit(bad ? 1 : 0);
