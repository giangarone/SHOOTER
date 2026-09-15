// JUNGLE: buttress roots, jade leaves and golden pollen.
import * as THREE from 'three';
import { ENEMY_TYPES, SHARED_MATS, partsFor, lump, slab, prism, spike, eyes,
  orbit, landHit, segBlocked, releasePattern, beginPattern, tickPattern, capturedShot, contactReach } from './shared.js';

const COLOR = 0xffc45c;
const ORBIT = { dist: 11, band: 2, out: 0.8, in: -0.7, strafe: 0.5, flip: 2, flipVar: 1 };
const shot = (speed, damage) => ({ core: 0xffc45c, glow: 0x427c39, scale: 0.55,
  speed: [speed, 0.2, speed + 5], dmg: [damage, 0.2, damage + 5] });
const body = { color: 0x427c39, eye: 0xffc45c, scale: 1, radius: 0.5, mass: 1 };
const TYPES = {
  vinecat: { ...body, hp: 36, speed: 3.5, damage: 10, value: 130, head: { r: 0.28, y: 0.7 },
    build: buildVinecat, ai: aiVinecat, cleanup: jungleCleanup },
  quillmonkey: { ...body, hp: 26, speed: 2.3, damage: 10, value: 260, head: { r: 0.28, y: 1.25 }, proj: shot(18, 7),
    build: buildQuillmonkey, ai: aiQuillmonkey, cleanup: jungleCleanup },
  rootgorilla: { ...body, hp: 150, speed: 1.6, damage: 19, value: 320, scale: 1.4, radius: 0.75, mass: 2,
    head: { r: 0.32, y: 1.0 }, armor: (e) => e.state === 'tell' ? 0.55 : 1,
    armorDefault: (e) => e.state === 'tell' ? 0.55 : 1,
    build: buildRootgorilla, ai: aiRootgorilla, cleanup: jungleCleanup },
  seedpod: { ...body, hp: 44, speed: 1.9, damage: 12, value: 270, head: { r: 0.3, y: 1.1 },
    build: buildSeedpod, ai: aiSeedpod, cleanup: jungleCleanup },
  orchidkeeper: { ...body, hp: 62, speed: 2.1, damage: 0, value: 350, head: { r: 0.3, y: 1.45 },
    build: buildOrchidkeeper, ai: aiOrchidkeeper, cleanup: jungleCleanup },
  sunfeather: { ...body, hp: 50, speed: 3.8, damage: 9, value: 300, fly: { height: 3.5 },
    hitbox: { r: 0.55, y: 0.4 }, head: { r: 0.28, y: 0.5 }, proj: shot(16, 6),
    build: buildSunfeather, ai: aiSunfeather, cleanup: jungleCleanup },
  canopytitan: { ...body, name: 'CANOPY TITAN', hp: 3300, speed: 1.8, damage: 24, value: 6500,
    scale: 2.7, radius: 1.8, mass: 9, boss: true, head: { r: 0.4, y: 1.85 },
    hitbox: { r: 0.9, y: 1.0 }, statusMul: 0.3, freezeSlow: true, slowFactor: 0.75,
    freezeVuln: 1, entropyExempt: true, fearMode: 'stagger', proj: shot(13, 7),
    armor: (e) => e.bs.weakOpen ? 1 : 0.65,
    armorDefault: (e) => e.bs.weakOpen ? 1 : 0.65,
    build: buildCanopyTitan, ai: aiCanopyTitan, cleanup: jungleCleanup },
};
Object.assign(ENEMY_TYPES, TYPES);

const bark = SHARED_MATS.jungleBark, pollen = SHARED_MATS.junglePollen;
function leaves(P, x, y, z, n = 5, size = 1) {
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n;
    P('juLeaf', () => new THREE.OctahedronGeometry(0.35, 0), {
      x: x + Math.cos(a) * 0.4 * size, y, z: z + Math.sin(a) * 0.4 * size,
      sx: 0.8, sy: 0.16, sz: 1.9, ry: Math.PI / 2 - a, s: size });
    P('juVein', slab(0.018, 0.018, 0.65), {
      x: x + Math.cos(a) * 0.4 * size, y: y + 0.055 * size,
      z: z + Math.sin(a) * 0.4 * size, ry: Math.PI / 2 - a, s: size, mat: pollen });
  }
}
function roots(P, width, n = 4) {
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n;
    P('juRoot', prism(0.06, 0.16, 0.6, 5), { x: Math.cos(a) * width, y: 0.25,
      z: Math.sin(a) * width, rx: Math.sin(a) * 0.7, rz: -Math.cos(a) * 0.7, mat: bark });
  }
}
function buildVinecat(e, g, s) {
  const P = partsFor(e, g, s);
  P('juCatBody', lump(0.34), { y: 0.5, sz: 1.8 });
  P('juCatHead', lump(0.28), { y: 0.7, z: -0.5 });
  for (const side of [-1, 1]) {
    P('juCatEar', spike(0.12, 0.25, 3), { x: side * 0.2, y: 0.96, z: -0.48, mat: bark });
    for (const z of [-0.35, 0.35]) {
      P('juCatLeg', slab(0.14, 0.32, 0.17), { x: side * 0.27, y: 0.23, z });
      P('juCatClaw', spike(0.05, 0.23, 4), { x: side * 0.27, y: 0.08, z: z - 0.15, rx: -Math.PI / 2, mat: pollen });
    }
  }
  for (let i = 0; i < 4; i++) P('juCatTail', lump(0.09), { x: Math.sin(i * 0.6) * 0.2, y: 0.6 + i * 0.1, z: 0.6 + i * 0.15, mat: bark });
  leaves(P, 0, 0.75, 0.12, 3, 0.65);
  eyes(P, { y: 0.7, z: -0.73, x: 0.14, mat: e.eyeMat });
}
function buildQuillmonkey(e, g, s) {
  const P = partsFor(e, g, s);
  P('juMonkeyBody', lump(0.32), { y: 0.75, sy: 1.35 });
  P('juMonkeyMask', lump(0.27), { y: 1.25, sz: 0.7, mat: bark });
  for (const side of [-1, 1]) {
    P('juMonkeyEar', lump(0.15), { x: side * 0.3, y: 1.25 });
    P('juMonkeyArm', prism(0.09, 0.14, 0.65, 5), { x: side * 0.4, y: 0.65, rz: side * 0.3, mat: bark });
    P('juMonkeyFoot', slab(0.18, 0.16, 0.35), { x: side * 0.17, y: 0.12 });
    for (let i = 0; i < 3; i++) P('juMonkeyQuill', spike(0.05, 0.55, 4),
      { x: side * (0.2 + i * 0.07), y: 1.05, z: 0.3 + i * 0.06, rx: 0.7, mat: pollen });
  }
  leaves(P, 0, 1.6, 0, 5, 0.7);
  eyes(P, { y: 1.25, z: -0.22, mat: e.eyeMat });
}
function buildRootgorilla(e, g, s) {
  const P = partsFor(e, g, s);
  P('juGorillaChest', lump(0.55), { y: 0.9, sx: 1.3 });
  P('juGorillaMask', slab(0.42, 0.32, 0.28), { y: 1, z: -0.5, mat: bark });
  e.arms = [];
  for (const side of [-1, 1]) {
    e.arms.push(P('juGorillaArm', prism(0.24, 0.3, 0.9, 6), { x: side * 0.65, y: 0.6, rz: side * 0.2, mat: bark }));
    P('juGorillaFist', lump(0.3), { x: side * 0.75, y: 0.2, z: -0.15 });
    leaves(P, side * 0.5, 1.3, 0.1, 4, 0.65);
  }
  roots(P, 0.4); eyes(P, { y: 1, z: -0.66, x: 0.14, mat: e.eyeMat });
}
function buildSeedpod(e, g, s) {
  const P = partsFor(e, g, s);
  P('juPodStem', prism(0.14, 0.3, 0.75, 5), { y: 0.45, mat: bark });
  e.husks = [];
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    e.husks.push(P('juPodHusk', lump(0.22), { x: Math.cos(a) * 0.25,
      y: 1.05, z: Math.sin(a) * 0.25, sy: 2 }));
  }
  P('juPodSeed', lump(0.22), { y: 1.4, mat: pollen });
  roots(P, 0.4); leaves(P, 0, 0.4, 0, 5, 0.85);
  eyes(P, { y: 1.1, z: -0.39, mat: e.eyeMat });
}
function buildOrchidkeeper(e, g, s) {
  const P = partsFor(e, g, s);
  P('juOrchidStem', prism(0.12, 0.22, 1.3, 5), { y: 0.7, mat: bark });
  e.core = P('juOrchidHeart', lump(0.2), { y: 1.45, z: -0.2, mat: e.eyeMat });
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    P('juOrchidPetal', lump(0.25), { x: Math.cos(a) * 0.36, y: 1.45 + Math.sin(a) * 0.36,
      z: 0, sx: 0.7, sz: 0.35, rz: a - Math.PI / 2, mat: pollen });
  }
  leaves(P, 0, 0.8, 0, 4, 0.9); roots(P, 0.35, 5);
  eyes(P, { y: 1.45, z: -0.37, mat: e.eyeMat });
}
function buildSunfeather(e, g, s) {
  const P = partsFor(e, g, s);
  P('juBirdBody', lump(0.3), { y: 0.4, sz: 1.5 });
  P('juBirdBeak', spike(0.14, 0.45, 4), { y: 0.5, z: -0.5, rx: -Math.PI / 2, mat: pollen });
  e.wings = [];
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    e.wings.push(P('juBirdFeather', spike(0.14, 0.9, 3), { x: side * (0.45 + i * 0.12),
      y: 0.45, z: i * 0.14, rz: side * 1.2, mat: i % 2 ? pollen : e.bodyMat }));
  }
  for (let i = -1; i <= 1; i++) P('juBirdTail', spike(0.13, 0.8, 3),
    { x: i * 0.13, y: 0.35, z: 0.75, rx: Math.PI / 2, ry: i * 0.2, mat: pollen });
  eyes(P, { y: 0.5, z: -0.3, x: 0.18, mat: e.eyeMat });
}
function buildCanopyTitan(e, g, s) {
  const P = partsFor(e, g, s);
  P('juTitanTrunk', prism(0.6, 0.85, 1.6, 7), { y: 1, mat: bark });
  P('juTitanChest', lump(0.75), { y: 1.15, sx: 1.3, sz: 0.8 });
  P('juTitanHead', lump(0.38), { y: 1.85, z: -0.45 });
  P('juTitanMuzzle', slab(0.4, 0.2, 0.25), { y: 1.73, z: -0.76, mat: bark });
  e.core = P('juTitanHeart', lump(0.3), { y: 1.4, z: -0.66, mat: e.eyeMat });
  e.shutters = [-1, 1].map((side) => P('juTitanBarkValve', slab(0.34, 0.75, 0.16),
    { x: side * 0.18, y: 1.4, z: -0.85, rz: side * 0.16, mat: bark }));
  e.arms = [];
  for (const side of [-1, 1]) {
    e.arms.push(P('juTitanArm', prism(0.28, 0.4, 1.3, 6), { x: side * 1.05, y: 0.85, rz: side * 0.25, mat: bark }));
    P('juTitanKnuckle', lump(0.4), { x: side * 1.22, y: 0.25, z: -0.3 });
    P('juTitanTusk', spike(0.11, 0.6, 4), { x: side * 0.38, y: 1.35, z: -0.68, mat: pollen });
    P('juTitanBough', prism(0.1, 0.2, 1.4, 5), { x: side * 0.65, y: 2, rz: side * 0.8, mat: bark });
    leaves(P, side * 1.0, 2.45, 0.15, 7, 1.55);
    for (let i = 0; i < 3; i++) {
      P('juTitanVine', prism(0.035, 0.035, 0.8 + i * 0.1, 4), { x: side * (0.8 + i * 0.16), y: 1.7, z: 0.4, mat: bark });
      P('juTitanFruit', lump(0.12), { x: side * (0.8 + i * 0.16), y: 1.25 - i * 0.05, z: 0.4, mat: pollen });
    }
  }
  // Three overlapping crowns read as a walking canopy, with hanging fruit
  // below the leaves and buttress roots carrying its weight at floor level.
  P('juTitanSpire', prism(0.12, 0.3, 1.2, 6), { y: 2.1, z: 0.2, mat: bark });
  leaves(P, 0, 2.8, 0.2, 8, 1.6); roots(P, 0.8, 7);
  eyes(P, { y: 1.9, z: -0.77, x: 0.17, r: 1.5, mat: e.eyeMat });
}

function jungleCleanup(e) {
  releasePattern(e);
  if (e.laneMark >= 0) e.laneFx.markRelease(e.laneMark);
  e.laneMark = undefined;
}
function capture(e, a) {
  e.nx = a.nx; e.nz = a.nz; e.aim = Math.atan2(a.nz, a.nx);
  e.tx = a.ctx.player.pos.x; e.tz = a.ctx.player.pos.z; e._setEyeAlert(true);
}
function rest(e, seconds) { e.state = 'rest'; e.timer = seconds; e.stepMul = 1.4; e._setEyeAlert(false); }
function point(x, z, radius, delay, damage) { return { x, z, radius, delay, damage }; }
function lane(e, a, length, width, progress) {
  if (e.laneMark === undefined) { e.laneFx = a.ctx.effects; e.laneMark = e.laneFx.markAcquire(); }
  e.laneFx.markSet(e.laneMark, e.pos.x + e.nx * length / 2, e.pos.z + e.nz * length / 2,
    width, COLOR, progress, length / (2 * width), Math.atan2(-e.nx, -e.nz));
}
function face(e) { e.faceLocked = true; e.group.rotation.y = Math.atan2(-e.nx, -e.nz); }
function aiVinecat(e, a) {
  e.timer = (e.timer || 0) - a.dt;
  if (e.state === 'tell') {
    face(e); lane(e, a, 7, 1.5, 1 - e.timer / 0.7);
    if (e.timer <= 0) {
      const warned = e.laneMark >= 0; jungleCleanup(e);
      e.state = warned ? 'pounce' : 'rest'; e.timer = warned ? 0.65 : 1.4; e.hit = false;
    }
    return;
  }
  if (e.state === 'pounce') {
    face(e); e.stepMul = 3;
    const speed = Math.min(8, e.speed * 3) * Math.min(1, a.sp / Math.max(0.001, e.speed)) *
      Math.min(1, Math.max(0, e.timer + a.dt) / a.dt);
    a.vx = e.nx * speed; a.vz = e.nz * speed;
    if (!e.hit && contactReach(e, a, 1.5)) { landHit(e, a.ctx); e.hit = true; }
    if (e.timer <= 0 || e.blockedBy > 0.05) rest(e, 1.5);
    return;
  }
  if (e.state === 'rest' && e.timer > 0) return;
  // The lateral prowl happens BEFORE commitment. The warning and the pounce
  // never turn, even when the player changes direction or speed scales up.
  if (a.dist < 7) { capture(e, a); e.state = 'tell'; e.timer = 0.7; return; }
  a.vx = a.px * a.sp - a.pz * a.sp * e.strafe * 0.45;
  a.vz = a.pz * a.sp + a.px * a.sp * e.strafe * 0.45;
}
function aiQuillmonkey(e, a) {
  if (e.state === 'tell') {
    face(e);
    e.timer -= a.dt;
    if (e.timer <= 0) {
      for (const spread of [-0.12, 0, 0.12]) capturedShot(e, a, e.aim, spread, 1.25);
      e.state = 'escape'; e.timer = 0.75; e._setEyeAlert(false);
    }
    return;
  }
  if (e.state === 'escape') {
    e.timer -= a.dt;
    a.vx = -Math.sin(e.aim) * e.strafe * a.sp * 1.3;
    a.vz = Math.cos(e.aim) * e.strafe * a.sp * 1.3;
    if (e.timer <= 0) { e.state = 'rest'; e.timer = 1.5; }
    return;
  }
  if (e.state === 'rest' && (e.timer -= a.dt) > 0) return;
  orbit(e, a, ORBIT);
  if (a.dist < 22 && e.attackCd <= 0) { capture(e, a); e.state = 'tell'; e.timer = 0.7; e.attackCd = 3.4; }
}
function aiRootgorilla(e, a) {
  for (const arm of e.arms) arm.position.y = (e.state === 'tell' ? 1.0 : 0.6) * e.scale;
  if (e.state === 'tell') { if (tickPattern(e, a)) rest(e, 1.8); return; }
  if (e.state === 'rest' && (e.timer -= a.dt) > 0) return;
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (a.dist < 6) {
    capture(e, a); e.state = 'tell';
    beginPattern(e, a, [1.8, 4, 6.2].map((d, i) => point(e.pos.x + a.nx * d,
      e.pos.z + a.nz * d, 1.5, 0.9 + i * 0.35, e.damage * 0.8)), COLOR);
  }
}
function aiSeedpod(e, a) {
  for (let i = 0; i < e.husks.length; i++) e.husks[i].rotation.z = e.state === 'seeds' ? Math.cos(i * Math.PI * 2 / 5) * 0.45 : 0;
  if (e.state === 'seeds') { if (tickPattern(e, a)) rest(e, 2); return; }
  if (e.state === 'rest' && (e.timer -= a.dt) > 0) return;
  orbit(e, a, ORBIT);
  if (a.dist < 24 && e.attackCd <= 0) {
    capture(e, a); e.state = 'seeds'; e.attackCd = 4.7;
    // A central seed splits into two diagonals. The old centre is safe once
    // it has popped, so changing direction beats simply running farther back.
    beginPattern(e, a, [point(e.tx, e.tz, 1.8, 1.1, e.damage),
      ...[-1, 1].map((side) => point(e.tx + a.nx * 3 - a.nz * side * 2.8,
        e.tz + a.nz * 3 + a.nx * side * 2.8, 1.8, 1.85, e.damage))], COLOR);
  }
}
function aiOrchidkeeper(e, a) {
  orbit(e, a, ORBIT);
  if (e.state === 'pollen') {
    a.vx = a.vz = 0; e.timer -= a.dt;
    if (e.timer > 0) return;
    const o = e.partner;
    // A one-off cooldown advance, not a permanent speed multiplier. It
    // cannot shorten a warning already running, buff a boss, or chain itself.
    if (o && !o.dead && o.pos.distanceToSquared(e.pos) < 64 &&
      !segBlocked(e.pos.x, e.pos.y + 1, e.pos.z, o.pos.x, o.pos.y + 1, o.pos.z, a.ctx.obstacles)) {
      o.attackCd = Math.max(0, o.attackCd - 1.5);
      a.ctx.effects.beam(e.pos, o.pos, COLOR);
      a.ctx.effects.shockwave(e.pos, COLOR, 2, 0.4);
    }
    e.partner = null; e.state = 'rest'; e.attackCd = 5; e._setEyeAlert(false); return;
  }
  if (e.attackCd > 0) return;
  // Select cooldown-driven shooters; custom recovery states belong to their
  // owners and are never shortened by pollen.
  e.partner = a.ctx.enemies.find((o) => o !== e && !o.dead && !o.boss && o.type !== e.type &&
    o.attackCd > 1.5 && o.pos.distanceToSquared(e.pos) < 64);
  if (e.partner) { e.state = 'pollen'; e.timer = 0.9; e._setEyeAlert(true); }
}
function aiSunfeather(e, a) {
  for (let i = 0; i < e.wings.length; i++) e.wings[i].rotation.z = (i < 4 ? -1 : 1) * (1.1 + Math.sin(a.ctx.time * 14) * 0.3);
  if (e.state === 'tell') {
    e.timer -= a.dt; e.hoverY = 4.5; e.flyRate = 3;
    if (e.timer <= 0) {
      // A high, slow fan followed by a low single dart: two elevations with
      // a fresh warning before the second aim, rather than invisible homing.
      for (const spread of [-0.22, 0, 0.22]) capturedShot(e, a, e.aim, spread, 0.5);
      e.state = 'dive'; e.timer = 0.9; e.hoverY = 1.4;
      e.aim = Math.atan2(a.nz, a.nx);
    }
    return;
  }
  if (e.state === 'dive') {
    e.timer -= a.dt;
    if (e.timer <= 0) { capturedShot(e, a, e.aim, 0, 0.5); e.hoverY = 3.5; rest(e, 1.8); }
    return;
  }
  if (e.state === 'rest' && (e.timer -= a.dt) > 0) return;
  orbit(e, a, ORBIT);
  if (a.dist < 20 && e.attackCd <= 0) { capture(e, a); e.state = 'tell'; e.timer = 1; e.attackCd = 4.5; }
}
function titanRest(e, a) {
  jungleCleanup(e); rest(e, 1.9); e.bs.weakOpen = true;
  e.bs.ventNote = 'HEARTWOOD EXPOSED'; a.ctx.bossEvent('vent', e);
}
function aiCanopyTitan(e, a) {
  const bs = e.bs;
  if (!e.state) { e.state = 'stalk'; e.timer = 1.2; bs.turn = 0; }
  bs.enraged = e.hp < e.maxHp * 0.5;
  for (let i = 0; i < e.shutters.length; i++) e.shutters[i].position.x = (i ? 1 : -1) * (bs.weakOpen ? 0.58 : 0.18) * e.scale;
  e.core.scale.setScalar(e.scale * (bs.weakOpen ? 1.4 : 1));
  for (const arm of e.arms) arm.position.y = (e.state === 'pattern' || e.state === 'tell' ? 1.3 : 0.85) * e.scale;
  if (e.state === 'pattern') { if (tickPattern(e, a)) titanRest(e, a); return; }
  e.timer -= a.dt;
  if (e.state === 'charge') {
    face(e); e.stepMul = 4;
    const speed = Math.min(7.2, e.speed * 4) * Math.min(1, a.sp / Math.max(0.001, e.speed)) *
      Math.min(1, Math.max(0, e.timer + a.dt) / a.dt);
    a.vx = e.nx * speed; a.vz = e.nz * speed;
    if (!e.hit && contactReach(e, a, 2.8)) { landHit(e, a.ctx, Math.min(30, e.damage)); e.hit = true; }
    if (e.timer <= 0 || e.blockedBy > 0.05 || Math.abs(e.pos.x) > 20 || Math.abs(e.pos.z) > 20) titanRest(e, a);
    return;
  }
  if (e.state === 'tell') {
    face(e); lane(e, a, 12, 2.8, 1 - e.timer / 1.15);
    if (e.timer <= 0) {
      const warned = e.laneMark >= 0; jungleCleanup(e);
      if (!warned) { titanRest(e, a); return; }
      e.state = 'charge'; e.timer = 1.2; e.hit = false;
    }
    return;
  }
  if (e.state === 'salvo') {
    face(e);
    if (e.timer > 0) return;
    const n = bs.enraged ? 7 : 5;
    for (let i = 0; i < n; i++) capturedShot(e, a, e.aim, (i - (n - 1) / 2) * 0.2 + (1 - e.volley) * 0.2, 1.4 * e.scale);
    e.timer = 0.6; e.volley++;
    if (e.volley === 3) titanRest(e, a);
    return;
  }
  if (e.state === 'rest') {
    if (e.timer > 0) return;
    bs.weakOpen = false; a.ctx.bossEvent('vent', e); e.state = 'stalk'; e.timer = bs.enraged ? 0.8 : 1.5;
  }
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (e.timer > 0 || a.dist > 28) return;
  capture(e, a); a.vx = a.vz = 0;
  bs.attack = ['roots', 'stampede', 'seeds', 'canopy'][bs.turn++ % 4];
  if (bs.attack === 'stampede') { e.state = 'tell'; e.timer = 1.15; return; }
  if (bs.attack === 'seeds') { e.state = 'salvo'; e.timer = 1.15; e.volley = 0; return; }
  const damage = Math.min(22, e.damage * 0.75), points = [];
  e.state = 'pattern';
  if (bs.attack === 'roots') {
    // Two branching roots diverge from the captured bearing. The narrow
    // middle remains a route toward the exposed heart after the first pulse.
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      points.push(point(e.tx + a.nx * i * 2.8 - a.nz * side * (1.8 + i),
        e.tz + a.nz * i * 2.8 + a.nx * side * (1.8 + i), 1.5, 1.15 + i * 0.45, damage));
    }
  } else {
    points.push(point(e.tx, e.tz, 2.4, 1.25, damage));
    const n = bs.enraged ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const angle = e.aim + i * Math.PI * 2 / n;
      points.push(point(e.tx + Math.cos(angle) * 4.5, e.tz + Math.sin(angle) * 4.5,
        1.6, 2.05 + (i % 2) * 0.25, damage));
    }
  }
  beginPattern(e, a, points, COLOR);
}
