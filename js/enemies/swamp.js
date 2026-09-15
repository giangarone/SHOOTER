// SWAMP: wet peat, reed crowns and amber marsh lights.
import * as THREE from 'three';
import { ENEMY_TYPES, SHARED_MATS, partsFor, lump, slab, prism, spike, eyes,
  aiMelee, orbit, landHit, segBlocked } from './shared.js';

const ORBIT = { dist: 11, band: 2, out: 0.8, in: -0.7, strafe: 0.45, flip: 2, flipVar: 1 };
const shot = (speed, damage) => ({ core: 0xffe6a0, glow: 0xc6a444, scale: 0.55,
  speed: [speed, 0.2, speed + 6], dmg: [damage, 0.25, damage + 6] });
const body = { color: 0x526340, eye: 0xffdc83, scale: 1, radius: 0.5, mass: 1 };
const TYPES = {
  mudskipper: { ...body, hp: 38, speed: 3.2, damage: 8, value: 130,
    head: { r: 0.3, y: 0.8 }, hitStatus: { kind: 'slowness', dur: 0.65 },
    melee: { windup: 0.5, start: 1.4, hit: 1.9, cd: 1.6 },
    build: buildMudskipper, ai: aiMudskipper, cleanup: swampCleanup },
  reedstalker: { ...body, hp: 25, speed: 2.4, damage: 9, value: 260,
    head: { r: 0.28, y: 1.5 }, proj: shot(19, 7),
    build: buildReedstalker, ai: aiReedstalker },
  peatback: { ...body, hp: 145, speed: 1.6, damage: 17, value: 320,
    scale: 1.4, radius: 0.7, mass: 2, head: { r: 0.3, y: 0.85 },
    armor: (e) => e.swampState === 'tell' ? 0.55 : 1,
    armorDefault: (e) => e.swampState === 'tell' ? 0.55 : 1,
    build: buildPeatback, ai: aiPeatback, cleanup: swampCleanup },
  bubbletoad: { ...body, hp: 44, speed: 1.9, damage: 10, value: 270,
    head: { r: 0.3, y: 0.65 }, build: buildBubbletoad, ai: aiBubbletoad },
  fenlantern: { ...body, hp: 62, speed: 2.1, damage: 0, value: 350,
    scale: 1.15, head: { r: 0.3, y: 1.45 }, build: buildFenlantern, ai: aiFenlantern },
  marshwing: { ...body, hp: 50, speed: 3.8, damage: 8, value: 300,
    fly: { height: 3.5 }, hitbox: { r: 0.55, y: 0.4 }, head: { r: 0.28, y: 0.55 },
    proj: shot(15, 6), build: buildMarshwing, ai: aiMarshwing },
  miresovereign: { ...body, name: 'MIRE SOVEREIGN', hp: 3200, speed: 1.8,
    damage: 24, value: 6500, scale: 2.7, radius: 1.8, mass: 9, boss: true,
    head: { r: 0.42, y: 1.0 }, hitbox: { r: 0.9, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1,
    entropyExempt: true, fearMode: 'stagger', proj: shot(13, 7),
    armor: (e) => e.bs.weakOpen ? 1 : 0.65,
    armorDefault: (e) => e.bs.weakOpen ? 1 : 0.65,
    build: buildMireSovereign, ai: aiMireSovereign, cleanup: swampCleanup },
};
Object.assign(ENEMY_TYPES, TYPES);

const AMBER = 0xffdc83;
const at = new THREE.Vector3();
function reeds(P, y, count = 5, radius = 0.4) {
  for (let i = 0; i < count; i++) {
    const a = i * Math.PI * 2 / count;
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    P('swReed', spike(0.035, 0.65, 4), { x, y, z, rz: -x * 0.4, mat: SHARED_MATS.swampPeat });
    P('swSeed', lump(0.07), { x, y: y + 0.25, z, sy: 1.8, mat: SHARED_MATS.swampAmber });
  }
}
function feet(P, width, y = 0.22) {
  for (const x of [-width, width]) for (const z of [-0.3, 0.3]) {
    P('swLeg', slab(0.16, 0.3, 0.2), { x, y, z, rz: -x * 0.4 });
    P('swWeb', slab(0.3, 0.08, 0.35), { x, y: 0.07, z: z - 0.06, mat: SHARED_MATS.swampPeat });
  }
}
function buildMudskipper(e, g, s) {
  const P = partsFor(e, g, s);
  P('swFrog', lump(0.4), { y: 0.5, sz: 1.3 });
  for (const x of [-0.36, 0.36]) P('swHaunch', lump(0.25), { x, y: 0.3, z: 0.3, sz: 1.5 });
  e.swThroat = P('swFrogThroat', lump(0.23), { y: 0.4, z: -0.4, mat: SHARED_MATS.swampAmber });
  feet(P, 0.4); reeds(P, 0.95, 3, 0.23);
  eyes(P, { x: 0.22, y: 0.8, z: -0.3, r: 1.4, mat: e.eyeMat });
}
function buildReedstalker(e, g, s) {
  const P = partsFor(e, g, s);
  P('swStalkBody', prism(0.15, 0.25, 0.8, 5), { y: 0.95 });
  for (const x of [-0.18, 0.18]) P('swStilt', slab(0.07, 0.7, 0.07), { x, y: 0.35 });
  for (const x of [-0.25, 0.25]) P('swBlowpipe', prism(0.065, 0.1, 0.95, 5),
    { x, y: 1.15, z: -0.35, rx: Math.PI / 2, mat: SHARED_MATS.swampPeat });
  P('swMask', lump(0.2), { y: 1.5, sz: 0.6 });
  reeds(P, 1.65, 7, 0.32);
  eyes(P, { y: 1.5, z: -0.17, mat: e.eyeMat });
}
function buildPeatback(e, g, s) {
  const P = partsFor(e, g, s);
  e.swShell = P('swTurtleShell', lump(0.65), { y: 0.65, sy: 0.65, sz: 1.2, mat: SHARED_MATS.swampPeat });
  P('swTurtleBelly', lump(0.5), { y: 0.4, sy: 0.6 });
  e.swJaw = P('swTurtleJaw', slab(0.45, 0.18, 0.45), { y: 0.6, z: -0.65 });
  feet(P, 0.53); reeds(P, 1.0, 8, 0.5);
  eyes(P, { y: 0.85, z: -0.69, x: 0.19, r: 1.1, mat: e.eyeMat });
}
function buildBubbletoad(e, g, s) {
  const P = partsFor(e, g, s);
  P('swToad', lump(0.45), { y: 0.4, sx: 1.3, sy: 0.8 });
  e.swThroat = P('swBubble', lump(0.35), { y: 1.05, z: 0.12, sy: 1.3, mat: SHARED_MATS.swampAmber });
  for (const x of [-0.34, 0.34]) P('swBubbleSmall', lump(0.19), { x, y: 0.7, z: 0.15, mat: SHARED_MATS.swampPeat });
  feet(P, 0.45); reeds(P, 0.85, 3, 0.5);
  eyes(P, { y: 0.65, z: -0.4, x: 0.22, r: 1.2, mat: e.eyeMat });
}
function buildFenlantern(e, g, s) {
  const P = partsFor(e, g, s);
  P('swLanternStem', prism(0.1, 0.32, 1.2, 5), { y: 0.65 });
  e.swThroat = P('swLantern', lump(0.25), { y: 1.4, mat: SHARED_MATS.swampAmber });
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    P('swLanternRib', slab(0.055, 0.8, 0.055), { x: Math.cos(a) * 0.32, y: 1.4,
      z: Math.sin(a) * 0.32, mat: SHARED_MATS.swampPeat });
  }
  P('swLanternLid', prism(0.08, 0.46, 0.25, 6), { y: 1.85 });
  feet(P, 0.3); reeds(P, 2.0, 4, 0.25);
  eyes(P, { y: 1.45, z: -0.3, mat: e.eyeMat });
}
function buildMarshwing(e, g, s) {
  const P = partsFor(e, g, s);
  P('swDragonBody', lump(0.25), { y: 0.4, sz: 1.8 });
  P('swDragonTail', spike(0.16, 1.1, 5), { y: 0.4, z: 0.7, rx: Math.PI / 2, mat: SHARED_MATS.swampPeat });
  e.swWings = [];
  for (const x of [-1, 1]) for (const z of [-0.15, 0.3]) {
    e.swWings.push(P('swDragonWing', slab(0.8, 0.035, 0.2), { x: x * 0.48, y: 0.6, z,
      ry: x * 0.25, mat: SHARED_MATS.swampAmber, shadow: false }));
  }
  reeds(P, 0.65, 3, 0.16);
  eyes(P, { y: 0.55, z: -0.4, x: 0.18, r: 1.3, mat: e.eyeMat });
}
function buildMireSovereign(e, g, s) {
  const P = partsFor(e, g, s);
  P('swKingBody', lump(0.85), { y: 0.7, sx: 1.05, sy: 0.75, sz: 1.35 });
  P('swKingBack', lump(0.8), { y: 1.0, z: 0.35, sy: 0.6, mat: SHARED_MATS.swampPeat });
  P('swKingSnout', slab(0.75, 0.25, 1.0), { y: 1.0, z: -0.8 });
  e.swJaw = P('swKingJaw', slab(0.8, 0.18, 0.95), { y: 0.68, z: -0.85 });
  e.swThroat = P('swKingThroat', lump(0.3), { y: 0.86, z: -0.63, mat: SHARED_MATS.swampAmber });
  for (const x of [-0.32, 0.32]) for (let i = 0; i < 5; i++) {
    P('swKingTooth', spike(0.06, 0.22, 4), { x, y: 0.8, z: -0.5 - i * 0.16, mat: SHARED_MATS.swampAmber });
  }
  P('swKingTail', spike(0.38, 1.8, 5), { y: 0.45, z: 1.35, rx: Math.PI / 2 });
  feet(P, 0.78, 0.32);
  // A drowned grove breaks the skyline; the jaws remain clear below it.
  for (const x of [-0.48, 0, 0.48]) {
    const y = x === 0 ? 1.9 : 1.6;
    P('swCypress', prism(0.08, 0.18, 1.4, 5), { x, y, z: 0.35, rz: -x * 0.35, mat: SHARED_MATS.swampPeat });
    for (const side of [-1, 1]) P('swCypressBough', spike(0.09, 0.7, 4),
      { x: x + side * 0.16, y: y + 0.3, z: 0.35, rz: side * 0.9 });
  }
  reeds(P, 1.4, 10, 0.75);
  eyes(P, { y: 1.0, z: -1.1, x: 0.3, r: 1.7, mat: e.eyeMat });
}

// One owned warning per attacker. Releasing also on death/reset makes an
// interrupted wind-up harmless to the next wave's finite telegraph pool.
function swampCleanup(e) {
  if (e.swMark >= 0) e.swFx.markRelease(e.swMark);
  e.swMark = undefined;
}
function warn(e, a, x, z, radius, progress) {
  if (e.swMark === undefined) { e.swFx = a.ctx.effects; e.swMark = e.swFx.markAcquire(); }
  e.swFx.markSet(e.swMark, x, z, radius, AMBER, progress);
}
function lane(e, a, length, width, progress) {
  warn(e, a, e.pos.x, e.pos.z, width, progress);
  e.swFx.markSet(e.swMark, e.pos.x + e.swNX * length / 2,
    e.pos.z + e.swNZ * length / 2, width, AMBER, progress,
    length / (2 * width), Math.atan2(-e.swNX, -e.swNZ));
}
function canTouch(e, a, reach) {
  return a.dist < reach && Math.abs(a.ctx.player.pos.y - e.pos.y) < (e.boss ? 3.6 : 1.4) &&
    !segBlocked(e.pos.x, e.pos.y + 0.5, e.pos.z,
      a.ctx.player.pos.x, a.ctx.player.pos.y + 0.8, a.ctx.player.pos.z, a.ctx.obstacles);
}
function flash(e, a, radius) {
  at.set(e.pos.x, e.pos.y + 0.3, e.pos.z);
  a.ctx.effects.shockwave(at, AMBER, radius, 0.35);
}
function aimed(e, a, spread = 0, heading = null) {
  const live = Math.atan2(a.ctx.player.pos.z - e.pos.z, a.ctx.player.pos.x - e.pos.x);
  const muzzleY = e.boss ? 0.9 * e.scale : e.type === 'reedstalker' ? 1.15 : 0.55;
  a.ctx.addProjectile(e.pos.x, e.pos.y + muzzleY, e.pos.z, e.type, e._projScale(),
    spread + (heading === null ? 0 : heading - live));
}
function faceHeading(e, x, z) {
  e.faceLocked = true;
  e.group.rotation.y = Math.atan2(-x, -z);
}
function aiMudskipper(e, a) {
  e.swT = (e.swT || 0) - a.dt;
  if (e.swampState === 'tell') {
    faceHeading(e, e.swNX, e.swNZ);
    lane(e, a, 7, 1.7, 1 - e.swT / 0.6);
    e.swThroat.scale.setScalar(e.scale * (1 + 0.3 * Math.sin((1 - e.swT / 0.6) * Math.PI)));
    if (e.swT <= 0) { e.swampState = e.swMark >= 0 ? 'hop' : 'rest'; swampCleanup(e); e.swT = 0.65; e.swHit = false; }
    return;
  }
  if (e.swampState === 'hop') {
    faceHeading(e, e.swNX, e.swNZ);
    e.stepMul = 3; const speed = Math.min(e.speed * 3, 8) * Math.min(1, a.sp / Math.max(0.001, e.speed)) * Math.min(1, Math.max(0, e.swT + a.dt) / a.dt);
    a.vx = e.swNX * speed; a.vz = e.swNZ * speed;
    if (!e.swHit && canTouch(e, a, 1.7)) {
      landHit(e, a.ctx); e.swHit = true;
    }
    if (e.swT <= 0 || e.blockedBy > 0.05) {
      e.swampState = 'rest'; e.swT = 1.5; e.stepMul = 1.4; e._setEyeAlert(false);
    }
    return;
  }
  if (e.swampState === 'rest' && e.swT > 0) return;
  aiMelee(e, a);
  if (e.swT <= 0 && a.dist > 3 && a.dist < 10) {
    e.swampState = 'tell'; e.swT = 0.6; e.swNX = a.nx; e.swNZ = a.nz;
    e._setEyeAlert(true);
  }
}
function aiReedstalker(e, a) {
  if (e.swT > 0) {
    faceHeading(e, Math.cos(e.swAim), Math.sin(e.swAim));
    e.swT -= a.dt;
    if (e.swT <= 0) {
      // The first pair brackets the captured bearing; the last dart punishes
      // standing in that gap. All three keep the original aim.
      if (e.swampState === 'tell') {
        aimed(e, a, -0.16, e.swAim); aimed(e, a, 0.16, e.swAim);
        e.swampState = 'dart'; e.swT = 0.35;
      } else { aimed(e, a, 0, e.swAim); e._setEyeAlert(false); }
    }
    return;
  }
  orbit(e, a, ORBIT);
  if (e.attackCd <= 0 && a.dist < 22) {
    e.attackCd = 3.2; e.swT = 0.6; e.swampState = 'tell';
    e.swAim = Math.atan2(a.nz, a.nx); e._setEyeAlert(true);
  }
}
function aiPeatback(e, a) {
  e.swT = (e.swT || 0) - a.dt;
  e.swJaw.position.z = (e.swampState === 'tell' ? -0.45 : -0.65) * e.scale;
  if (e.swampState === 'tell') {
    warn(e, a, e.pos.x, e.pos.z, 3.6, 1 - e.swT / 0.9);
    if (e.swT <= 0) {
      const warned = e.swMark >= 0; swampCleanup(e); flash(e, a, 3.6);
      if (warned && canTouch(e, a, 3.6)) landHit(e, a.ctx);
      e.swampState = 'rest'; e.swT = 1.8; e._setEyeAlert(false);
    }
    return;
  }
  if (e.swT > 0) return;
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (a.dist < 4.5) { e.swampState = 'tell'; e.swT = 0.9; e._setEyeAlert(true); }
}
function aiBubbletoad(e, a) {
  orbit(e, a, ORBIT);
  if (e.swT > 0) {
    a.vx = a.vz = 0; e.swT -= a.dt;
    e.swThroat.scale.setScalar(e.scale * (1 + 0.4 * (1 - e.swT / 0.7)));
    if (e.swT <= 0) {
      for (let i = -1; i <= 1; i++) a.ctx.addMortar(e.swX - e.swNZ * i * 2.8,
        e.swZ + e.swNX * i * 2.8, 1.8, 1.1 + (i + 1) * 0.22, e.damage);
      e.swThroat.scale.setScalar(e.scale); e._setEyeAlert(false);
    }
    return;
  }
  if (e.attackCd <= 0 && a.dist < 24) {
    e.attackCd = 4.5; e.swT = 0.7; e.swX = a.ctx.player.pos.x; e.swZ = a.ctx.player.pos.z;
    e.swNX = a.nx; e.swNZ = a.nz; e._setEyeAlert(true);
  }
}
function aiFenlantern(e, a) {
  orbit(e, a, ORBIT);
  if (e.attackCd > 0) return;
  // Cleansing spends a cooldown only when there is something to wash off.
  // No healing or permanent immunity: freshly applied statuses still work.
  const target = a.ctx.enemies.find((o) => o !== e && !o.dead && !o.boss && o.type !== e.type &&
    o.pos.distanceToSquared(e.pos) < 64 && ['burn', 'poison', 'slow'].some((s) => o.status[s] > 0));
  if (!target) return;
  for (const s of ['burn', 'poison', 'slow']) {
    target.status[s] = 0;
    if (s in target._dot) target._dot[s] = 0;
  }
  target.poisonStacks = 1;
  e.attackCd = 4.5;
  a.ctx.effects.beam(e.pos, target.pos, AMBER); flash(e, a, 2);
}
function aiMarshwing(e, a) {
  for (let i = 0; i < e.swWings.length; i++) e.swWings[i].rotation.z =
    (i < 2 ? -1 : 1) * (0.15 + Math.sin(a.ctx.time * 24) * 0.2);
  if (e.swT > 0) {
    e.swT -= a.dt; e.hoverY = 1.4; e.flyRate = 4;
    if (e.swT <= 0) {
      aimed(e, a, -0.1); aimed(e, a, 0.1);
      e.hoverY = 3.5; e._setEyeAlert(false); e.swEscape = 1.2;
    }
    return;
  }
  if (e.swEscape > 0) {
    e.swEscape -= a.dt; a.vx = -a.nx * a.sp; a.vz = -a.nz * a.sp; return;
  }
  orbit(e, a, ORBIT);
  if (e.attackCd <= 0 && a.dist < 18) { e.attackCd = 3.8; e.swT = 1; e._setEyeAlert(true); }
}
function sovereignRest(e, a) {
  swampCleanup(e); e.swampState = 'rest'; e.swT = 1.8; e.stepMul = 1.4;
  e.bs.weakOpen = true; e.bs.ventNote = 'THROAT EXPOSED';
  e._setEyeAlert(false); a.ctx.bossEvent('vent', e);
}
function aiMireSovereign(e, a) {
  const bs = e.bs;
  if (!e.swampState) { e.swampState = 'stalk'; e.swT = 1.2; bs.turn = 0; }
  bs.enraged = e.hp < e.maxHp * 0.5;
  e.swJaw.position.y = (bs.weakOpen ? 0.46 : 0.68) * e.scale;
  e.swThroat.scale.setScalar(e.scale * (bs.weakOpen ? 1.5 : 1));
  e.swT -= a.dt;
  if (e.swampState === 'rush') {
    faceHeading(e, e.swNX, e.swNZ);
    e.stepMul = 4; const speed = Math.min(e.speed * 4, 7.2) * Math.min(1, a.sp / Math.max(0.001, e.speed)) * Math.min(1, Math.max(0, e.swT + a.dt) / a.dt);
    a.vx = e.swNX * speed; a.vz = e.swNZ * speed;
    if (!e.swHit && canTouch(e, a, 3)) {
      landHit(e, a.ctx, Math.min(30, e.damage)); e.swHit = true;
    }
    if (e.swT <= 0 || e.blockedBy > 0.05 || Math.abs(e.pos.x) > 20 || Math.abs(e.pos.z) > 20) sovereignRest(e, a);
    return;
  }
  if (e.swampState === 'tell') {
    faceHeading(e, e.swNX, e.swNZ);
    if (bs.attack === 'rush') lane(e, a, 12, 3, 1 - e.swT / 1.1);
    e.swJaw.rotation.x = -0.15 * Math.sin(Math.max(0, e.swT) * 8);
    if (e.swT > 0) return;
    const warned = e.swMark >= 0; swampCleanup(e); e.swJaw.rotation.x = 0;
    if (bs.attack === 'rush') {
      if (!warned) { sovereignRest(e, a); return; }
      e.swampState = 'rush'; e.swT = 1.25; e.swHit = false;
    } else if (bs.attack === 'bog') {
      // Open horseshoe, never a sealed ring. Its centre was captured when
      // the crown lit; moving through the open side defeats every eruption.
      const n = bs.enraged ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const angle = e.swAim + Math.PI / 2 + i * Math.PI / (n - 1);
        a.ctx.addMortar(e.swX + Math.cos(angle) * 4, e.swZ + Math.sin(angle) * 4,
          2, 1.2 + i * 0.15, Math.min(22, e.damage * 0.65));
      }
      a.ctx.addMortar(e.swX, e.swZ, 2.1, 1.8, Math.min(22, e.damage * 0.65));
      sovereignRest(e, a);
    } else {
      const n = bs.enraged ? 7 : 5;
      for (let i = 0; i < n; i++) aimed(e, a, (i - (n - 1) / 2) * 0.22, e.swAim);
      flash(e, a, 3); sovereignRest(e, a);
    }
    return;
  }
  if (e.swampState === 'rest') {
    if (e.swT > 0) return;
    bs.weakOpen = false; a.ctx.bossEvent('vent', e);
    e.swampState = 'stalk'; e.swT = (bs.enraged ? 0.9 : 1.5) * e.rate;
  }
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (e.swT > 0 || a.dist > 28) return;
  bs.attack = ['rush', 'bog', 'fan'][bs.turn++ % 3];
  e.swampState = 'tell'; e.swT = 1.1;
  e.swNX = a.nx; e.swNZ = a.nz; e.swAim = Math.atan2(a.nz, a.nx);
  e.swX = a.ctx.player.pos.x; e.swZ = a.ctx.player.pos.z;
  e._setEyeAlert(true); flash(e, a, bs.attack === 'bog' ? 5 : 2);
}
