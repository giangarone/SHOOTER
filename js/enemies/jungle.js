// JUNGLE: buttress roots, jade leaves and golden pollen.
import * as THREE from 'three';
import { pointInObstacle } from '../utils.js';
import { ENEMY_TYPES, SHARED_MATS, ARENA_HALF, partsFor, lump, slab, prism, spike, eyes,
  orbit, landHit, segBlocked, releasePattern, beginPattern, tickPattern, capturedShot, contactReach, snapAim, faceSnap,
  bossTouch, markGet, markDrop } from './shared.js';

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
  canopytitan: { ...body, name: 'CANOPY TITAN', hp: 3300, speed: 2.4, damage: 24, value: 6500,
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
  markDrop(e);
  if (e.laneMark >= 0) e.laneFx.markRelease(e.laneMark);
  e.laneMark = undefined;
}
function rest(e, seconds) { e.state = 'rest'; e.timer = seconds; e.stepMul = 1.4; e._setEyeAlert(false); }
function point(x, z, radius, delay, damage) { return { x, z, radius, delay, damage }; }
function lane(e, a, length, width, progress) {
  if (e.laneMark === undefined) { e.laneFx = a.ctx.effects; e.laneMark = e.laneFx.markAcquire(); }
  e.laneFx.markSet(e.laneMark, e.pos.x + e.nx * length / 2, e.pos.z + e.nz * length / 2,
    width, COLOR, progress, length / (2 * width), Math.atan2(-e.nx, -e.nz));
}

function aiVinecat(e, a) {
  e.timer = (e.timer || 0) - a.dt;
  if (e.state === 'tell') {
    faceSnap(e); lane(e, a, 7, 1.5, 1 - e.timer / 0.7);
    if (e.timer <= 0) {
      const warned = e.laneMark >= 0; jungleCleanup(e);
      e.state = warned ? 'pounce' : 'rest'; e.timer = warned ? 0.65 : 1.4; e.hit = false;
    }
    return;
  }
  if (e.state === 'pounce') {
    faceSnap(e); e.stepMul = 3;
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
  if (a.dist < 7) { snapAim(e, a, true); e.state = 'tell'; e.timer = 0.7; return; }
  a.vx = a.px * a.sp - a.pz * a.sp * e.strafe * 0.45;
  a.vz = a.pz * a.sp + a.px * a.sp * e.strafe * 0.45;
}
function aiQuillmonkey(e, a) {
  if (e.state === 'tell') {
    faceSnap(e);
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
  if (a.dist < 22 && e.attackCd <= 0) { snapAim(e, a, true); e.state = 'tell'; e.timer = 0.7; e.attackCd = 3.4; }
}
function aiRootgorilla(e, a) {
  for (const arm of e.arms) arm.position.y = (e.state === 'tell' ? 1.0 : 0.6) * e.scale;
  if (e.state === 'tell') { if (tickPattern(e, a)) rest(e, 1.8); return; }
  if (e.state === 'rest' && (e.timer -= a.dt) > 0) return;
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (a.dist < 6) {
    snapAim(e, a, true); e.state = 'tell';
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
    snapAim(e, a, true); e.state = 'seeds'; e.attackCd = 4.7;
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
  if (a.dist < 20 && e.attackCd <= 0) { snapAim(e, a, true); e.state = 'tell'; e.timer = 1; e.attackCd = 4.5; }
}
function titanRest(e, a) {
  jungleCleanup(e); rest(e, (e.bs.enraged ? 0.95 : 1.25) * e.rate);
  e.bs.weakOpen = true; e.bs.ventNote = 'HEARTWOOD EXPOSED'; a.ctx.bossEvent('vent', e);
}
// The stalk loop's orbit: the titan closes past twelve metres and works a
// ring inside them, so the fight is never a shooting gallery at one wall.
const TITAN_ORBIT = { dist: 10, band: 3, out: 1, in: -0.9, strafe: 0.9, flip: 1.6, flipVar: 0.9 };
// The eight appointments, drawn at random without an immediate repeat - the
// fight is a bag, not a tape loop. bs.next forces one draw, for the suites.
const TITAN_ATTACKS = ['roots', 'fruitfall', 'liana', 'leap', 'salvo', 'snare', 'spores', 'stampede'];
const TITAN_TELLS = { roots: 0.55, fruitfall: 0.75, liana: 0.85, leap: 0.8, salvo: 0.5, snare: 0.5, spores: 0.9, stampede: 1.0 };
// Scratch for the leap's clearance probe. Once per wind-up, not per frame.
const _leapProbe = new THREE.Vector3();
function aiCanopyTitan(e, a) {
  const bs = e.bs, ctx = a.ctx;
  if (!e.state) { e.state = 'stalk'; e.timer = 0.9; }
  // A one-shot latch at half health: the banner and the red room are an event
  // the player must not lose behind a note that changes every few seconds.
  if (!bs.enraged && e.hp < e.maxHp * 0.5) { bs.enraged = true; ctx.bossEvent('enrage', e); }
  // HUGGING THE TRUNK IS NOT COVER. Contact pays in every state, on the
  // shared boss cadence - the charge is exempt only because its touch is its
  // own one-shot hit.
  if (e.state !== 'charge') bossTouch(e, a);
  for (let i = 0; i < e.shutters.length; i++) e.shutters[i].position.x = (i ? 1 : -1) * (bs.weakOpen ? 0.58 : 0.18) * e.scale;
  // The heart swells through every wind-up: the body itself is the tell
  // before the floor is.
  e.core.scale.setScalar(e.scale * (bs.weakOpen ? 1.4 : 1) *
    (e.state === 'windup' ? 1 + Math.sin(ctx.time * 14) * 0.12 : 1));
  // The arms carry the shape of the attack from across the room: HIGH through
  // a warning or the run, BURIED while the snare is reaching under the floor.
  const armY = e.state === 'snare' ? 0.5 : e.state === 'windup' || e.state === 'charge' ? 1.3 : 0.85;
  for (const arm of e.arms) arm.position.y = armY * e.scale;
  e.timer -= a.dt;

  if (e.state === 'pattern') {
    // A WALKING tree: roots, fruit and the landing shock run while it keeps
    // striding in at under half pace. Only the snare plants it - that one has
    // its arms buried.
    a.vx = a.px * a.sp * 0.45; a.vz = a.pz * a.sp * 0.45;
    if (tickPattern(e, a)) titanRest(e, a);
    return;
  }

  if (e.state === 'charge') {
    faceSnap(e); e.stepMul = 4;
    const speed = Math.min(8.4, e.speed * 3.5) * Math.min(1, a.sp / Math.max(0.001, e.speed)) *
      Math.min(1, Math.max(0, e.timer + a.dt) / a.dt);
    a.vx = e.nx * speed; a.vz = e.nz * speed;
    if (!e.hit && contactReach(e, a, 2.8)) { landHit(e, ctx, Math.min(30, e.damage)); e.hit = true; }
    if (e.timer <= 0 || e.blockedBy > 0.05 || Math.abs(e.pos.x) > 20 || Math.abs(e.pos.z) > 20) {
      // THE ARRIVAL. A player it ran down already paid; any other end plants
      // the titan and lets the landing shock ring out of the footprint - a
      // short fill where it stopped, so baiting it into a wall still asks for
      // the step back.
      if (e.hit) { titanRest(e, a); return; }
      e.state = 'pattern';
      ctx.effects.shockwave(e.pos, COLOR, 2.5, 0.45);
      ctx.effects.addShake(0.18); ctx.sfx.impact();
      beginPattern(e, a, [point(e.pos.x, e.pos.z, 2.5, 0.5, Math.min(18, e.damage * 0.7))], COLOR);
    }
    return;
  }

  if (e.state === 'leapAir') {
    // THE LANDING. No fresh warning: the circle has been on the floor since
    // the crouch, full, and it meant exactly this. The brush-by in the same
    // beat is not a second hit, so the touch cadence is held off briefly.
    jungleCleanup(e); bs.touchCd = 0.8;
    e.state = 'pattern';
    ctx.effects.shockwave(e.pos, COLOR, 3.4, 0.5);
    ctx.effects.burst(e.pos, COLOR, 26, 7, 3.5, 0.6);
    ctx.effects.addShake(0.28); ctx.sfx.impact();
    const points = [point(e.pos.x, e.pos.z, 2.6, 0.02, Math.min(26, e.damage * 0.9))];
    // ...and the roots the landing drove down ring the footprint a beat later.
    for (let i = 0; i < 6; i++) {
      const a2 = i * Math.PI / 3 + Math.PI / 6;
      points.push(point(e.pos.x + Math.cos(a2) * 4.4, e.pos.z + Math.sin(a2) * 4.4,
        1.5, 0.6, Math.min(16, e.damage * 0.6)));
    }
    beginPattern(e, a, points, COLOR);
    return;
  }

  if (e.state === 'windup') {
    const fill = 1 - Math.max(0, e.timer) / bs.windup;
    if (bs.attack === 'stampede' || bs.attack === 'liana') {
      faceSnap(e);
      lane(e, a, bs.attack === 'stampede' ? 14 : 15, bs.attack === 'stampede' ? 2.8 : 1.7, fill);
    } else if (bs.attack === 'leap') {
      // The landing circle from the first frame of the crouch, filled at the
      // moment of takeoff. It never tracks after that - a leap committed is a
      // leap the floor has already told you about.
      const m = markGet(e, ctx.effects);   // acquires before e.fx is read
      e.fx.markSet(m, bs.tx, bs.tz, 2.6, COLOR, fill);
    } else if (bs.attack === 'spores') {
      // Its own ring, taped on the floor at the radius the vent owns: the
      // question the ring asks is how close you were standing when it let go.
      const m = markGet(e, ctx.effects);
      e.fx.markSet(m, e.pos.x, e.pos.z, 3.4, COLOR, fill);
    } else {
      faceSnap(e);
    }
    if (e.timer > 0) return;
    if (bs.attack === 'roots') {
      // Two branching roots diverge from the captured bearing. The narrow
      // middle remains a route toward the exposed heart after the first pulse.
      const damage = Math.min(22, e.damage * 0.75), points = [];
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        points.push(point(e.tx + a.nx * i * 2.8 - a.nz * side * (1.8 + i),
          e.tz + a.nz * i * 2.8 + a.nx * side * (1.8 + i), 1.5, 1.15 + i * 0.45, damage));
      }
      e.state = 'pattern'; beginPattern(e, a, points, COLOR);
      return;
    }
    if (bs.attack === 'fruitfall') {
      // The crown shakes its fruit loose over where the player STOOD: one on
      // the spot, a ring around it. Keeping moving is the whole answer.
      const damage = Math.min(20, e.damage * 0.7), points = [point(e.tx, e.tz, 2.1, 1.25, damage)];
      const n = bs.enraged ? 6 : 4, base = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const ang = base + i * Math.PI * 2 / n;
        points.push(point(e.tx + Math.cos(ang) * 3.7, e.tz + Math.sin(ang) * 3.7,
          1.7, 1.55 + (i % 2) * 0.25, damage));
      }
      e.state = 'pattern'; beginPattern(e, a, points, COLOR);
      ctx.effects.shockwave(e.pos, COLOR, 2, 0.4);
      return;
    }
    if (bs.attack === 'liana') {
      // No acquired lane, no wave - the rule every JUNGLE warning keeps.
      const warned = e.laneMark >= 0; jungleCleanup(e);
      if (!warned) { titanRest(e, a); return; }
      // The thorn wave runs down the lane and never bends: the reads are all
      // perpendicular. Walking straight back is the one line it catches.
      const damage = Math.min(18, e.damage * 0.7), points = [];
      for (let i = 0; i < 6; i++) {
        const d = 2.3 + i * 2.1;
        points.push(point(e.pos.x + e.nx * d, e.pos.z + e.nz * d, 1.35, 0.15 + i * 0.16, damage));
      }
      e.state = 'pattern'; beginPattern(e, a, points, COLOR);
      return;
    }
    if (bs.attack === 'leap') {
      // Ceiling or cargo overhead can refuse the long arc; shorten along the
      // same bearing, and spend the beat on a volley if none of it clears.
      for (const f of [1, 0.6, 0.35]) {
        const jx = e.pos.x + (bs.tx - e.pos.x) * f, jz = e.pos.z + (bs.tz - e.pos.z) * f;
        if (!e._startJump(jx, 0, jz, 5.4, ctx)) continue;
        bs.tx = jx; bs.tz = jz;
        // The mark lands where the boss lands, full, the instant the arc is
        // committed, and rides out the flight.
        const m = markGet(e, ctx.effects);
        e.fx.markSet(m, bs.tx, bs.tz, 2.6, COLOR, 1);
        e.state = 'leapAir';
        ctx.effects.burst(e.pos, COLOR, 24, 6, 3, 0.6);
        ctx.effects.shockwave(e.pos, COLOR, 2.2, 0.4);
        return;
      }
      markDrop(e); snapAim(e, a, true);
      bs.attack = 'salvo'; bs.salvoLeft = 3; e.state = 'salvo'; e.timer = 0.05;
      return;
    }
    if (bs.attack === 'salvo') { bs.salvoLeft = 3; e.state = 'salvo'; e.timer = 0.05; return; }
    if (bs.attack === 'snare') { bs.snareLeft = bs.enraged ? 4 : 3; e.state = 'snare'; return; }
    if (bs.attack === 'spores') {
      markDrop(e);
      e.state = 'spores'; bs.sporeLeft = bs.enraged ? 2 : 1;
      bs.sporeSpin = Math.random() * Math.PI * 2;
      // Both seams stand OFF the captured bearing: standing still is exactly
      // where the ring is whole. The dodge is finding a gap, on either foot.
      bs.sporeGap = e.aim + (Math.random() < 0.5 ? 1 : -1) * (0.9 + Math.random() * 0.5);
      e.timer = 0.05;
      return;
    }
    // stampede
    const warned = e.laneMark >= 0; jungleCleanup(e);
    if (!warned) { titanRest(e, a); return; }
    e.state = 'charge'; e.timer = 1.0; e.hit = false;
    return;
  }

  if (e.state === 'salvo') {
    // The volley is taken ON THE WALK - there is no frame of the fight in
    // which it stands still to be shot - and the fan swings a stride between
    // pulses, so holding one sidestep catches the next one.
    faceSnap(e);
    orbit(e, a, TITAN_ORBIT);
    if (e.timer > 0) return;
    const n = bs.enraged ? 7 : 5, k = 3 - bs.salvoLeft;
    for (let i = 0; i < n; i++) capturedShot(e, a, e.aim + (k - 1) * 0.14 * e.strafe, (i - (n - 1) / 2) * 0.2, 1.4 * e.scale);
    ctx.effects.burst(e.pos, COLOR, 5, 3, 1.5, 0.3);
    if (--bs.salvoLeft > 0) { e.timer = 0.45 * e.rate; return; }
    titanRest(e, a);
    return;
  }

  if (e.state === 'spores') {
    // It backs off through the vent: the ring's origin walks away while the
    // pollen closes in.
    a.vx = -a.px * a.sp * 0.35; a.vz = -a.pz * a.sp * 0.35;
    if (e.timer > 0) return;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const ang = bs.sporeSpin + i * (Math.PI * 2) / n;
      const near = (gap) => Math.abs((ang - gap + Math.PI * 3) % (Math.PI * 2) - Math.PI) < 0.3;
      if (near(bs.sporeGap) || near(bs.sporeGap + Math.PI)) continue;
      capturedShot(e, a, 0, ang, 0.9);
    }
    ctx.effects.burst(e.pos, COLOR, 16, 5, 3, 0.5);
    if (--bs.sporeLeft > 0) { bs.sporeSpin += Math.PI / n; e.timer = 0.45 * e.rate; return; }
    titanRest(e, a);
    return;
  }

  if (e.state === 'snare') {
    // Planted, arms buried. Each pulse captures the LIVE position at the
    // moment its own warning starts - so every circle commits to a place, and
    // the attack's question is whether you stopped moving, not where you
    // stood when the titan crouched.
    if (!tickPattern(e, a)) return;
    if (--bs.snareLeft < 0) { titanRest(e, a); return; }
    const r = bs.enraged ? 2.1 : 1.8;
    beginPattern(e, a, [point(ctx.player.pos.x, ctx.player.pos.z, r, 0.7,
      Math.min(18, e.damage * 0.7))], COLOR);
    return;
  }

  if (e.state === 'rest') {
    if (e.timer > 0) return;
    bs.weakOpen = false; ctx.bossEvent('vent', e);
    e.state = 'stalk'; e.timer = (bs.enraged ? 0.32 : 0.5) * e.rate;
    return;
  }

  // STALK between appointments: closes at a stride past twelve metres, then
  // works the ring. The stride needs the stepMul headroom to be real.
  if (a.dist > 12) { e.stepMul = 1.9; a.vx = a.px * a.sp * 1.35; a.vz = a.pz * a.sp * 1.35; }
  else { e.stepMul = 1.4; orbit(e, a, TITAN_ORBIT); }
  if (e.timer > 0) return;
  let name = bs.next;
  bs.next = null;
  if (!name) {
    for (let tries = 0; tries < 8; tries++) {
      name = TITAN_ATTACKS[Math.floor(Math.random() * TITAN_ATTACKS.length)];
      if (name === bs.last) continue;
      if (name === 'stampede' && a.dist < 6) continue;   // a run-up it needs
      if (name === 'leap' && a.dist < 8) continue;       // a sky it needs
      if (name === 'liana' && a.dist > 17) continue;     // a reach it has
      break;
    }
  }
  // The same vetoes applied to a forced pick, so the suites drive exactly
  // what the bag would.
  if (name === 'stampede' && a.dist < 6) name = 'liana';
  if (name === 'leap' && a.dist < 8) name = 'fruitfall';
  if (name === 'liana' && a.dist > 17) name = 'salvo';
  bs.attack = name; bs.last = name;
  snapAim(e, a, true); a.vx = a.vz = 0;
  if (name === 'leap') {
    // Committed at the CROUCH: where the player is plus a stride of lead,
    // wobbled off the furniture until a landing the shoulders actually fit is
    // found - a centre that is clear with a crate under one arm would abort
    // the arc a body-length short of its own telegraph.
    const p = ctx.player.pos, v = ctx.player.vel;
    const B = ARENA_HALF - (e.radius - 0.5) - 0.4;
    let ok = false;
    for (let t = 0; t < 8 && !ok; t++) {
      bs.tx = Math.max(-B, Math.min(B, p.x + v.x * 0.3 + (t ? (Math.random() - 0.5) * 3 : 0)));
      bs.tz = Math.max(-B, Math.min(B, p.z + v.z * 0.3 + (t ? (Math.random() - 0.5) * 3 : 0)));
      ok = true;
      for (const [ox, oz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
        _leapProbe.set(bs.tx + ox, 0.5, bs.tz + oz);
        if (pointInObstacle(_leapProbe, ctx.obstacles)) { ok = false; break; }
      }
    }
    if (!ok) bs.attack = bs.last = 'salvo';
  }
  e.state = 'windup';
  bs.windup = TITAN_TELLS[bs.attack] * e.rate;
  e.timer = bs.windup;
}
