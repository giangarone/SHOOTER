// CANDY: stretched taffy, cracked sugar shells and sweets that pop twice.
import * as THREE from 'three';
import { ENEMY_TYPES, SHARED_MATS, partsFor, geo, lump, slab, prism, spike,
  eyes, orbit, segBlocked } from './shared.js';

const CREAM = 0xffedcf;
const PINK = 0xff70b9;
const circle = { dist: 11, band: 2, out: 0.8, in: -0.7, strafe: 0.45, flip: 2, flipVar: 1 };
const kiteCircle = { ...circle, dist: 5 };
const base = { color: 0xd84c8f, eye: 0xfff0be, scale: 1, radius: 0.5, mass: 1 };
const rounds = { core: CREAM, glow: PINK, scale: 0.65, speed: [13, 0.2, 19], dmg: [8, 0.25, 14] };
const TYPES = {
  taffy: { ...base, hp: 36, speed: 3.3, damage: 8, value: 130,
    head: { r: 0.3, y: 1.1 }, build: buildTaffy, ai: aiTaffy, cleanup: cleanupCandy },
  bonbon: { ...base, hp: 26, speed: 2.4, damage: 9, value: 260,
    head: { r: 0.3, y: 1.3 }, proj: { ...rounds, shootable: true, bounce: 1 },
    build: buildBonbon, ai: aiBonbon },
  jawbreaker: { ...base, hp: 150, speed: 1.55, damage: 20, value: 320,
    scale: 1.3, mass: 2, radius: 0.65, head: { r: 0.3, y: 1.35 },
    melee: { windup: 0.85, start: 2.7, hit: 3.3, cd: 2.3 },
    armor: candyArmor, armorDefault: candyArmor,
    build: buildJawbreaker, ai: aiJawbreaker },
  poprock: { ...base, hp: 42, speed: 1.9, damage: 10, value: 270,
    head: { r: 0.28, y: 0.65 }, build: buildPoprock, ai: aiPoprock, cleanup: cleanupCandy },
  sugarspinner: { ...base, hp: 62, speed: 2.05, damage: 0, value: 350,
    head: { r: 0.28, y: 1.45 }, build: buildSugarspinner, ai: aiSugarspinner },
  cottonkite: { ...base, hp: 48, speed: 3.5, damage: 8, value: 300,
    fly: { height: 3.5 }, head: { r: 0.3, y: 0.7 }, hitbox: { r: 0.6, y: 0.45 },
    build: buildCottonkite, ai: aiCottonkite, cleanup: cleanupCandy },
  confectioner: { ...base, name: 'THE CONFECTIONER', hp: 3100, speed: 1.7,
    damage: 25, value: 6500, scale: 2.65, radius: 1.9, mass: 9, boss: true,
    head: { r: 0.4, y: 1.85 }, hitbox: { r: 0.85, y: 0.85 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1,
    entropyExempt: true, fearMode: 'stagger', proj: { ...rounds, speed: [11, 0.15, 16], dmg: [7, 0.2, 12] },
    armor: candyArmor, armorDefault: candyArmor,
    build: buildConfectioner, ai: aiConfectioner, cleanup: cleanupCandy },
};
Object.assign(ENEMY_TYPES, TYPES);

const at = new THREE.Vector3();
const icing = SHARED_MATS.candyCream;
const mint = SHARED_MATS.candyMint;
function boots(P, x = 0.2) {
  for (const side of [-1, 1]) {
    P('caLeg', slab(0.13, 0.4, 0.14), { x: side * x, y: 0.28 });
    P('caBoot', lump(0.18), { x: side * x, y: 0.12, z: -0.07, sy: 0.6, mat: icing });
  }
}
function candyDisc(P, key, x, y, radius) {
  const mesh = P(key, prism(radius, radius, 0.12, 12), { x, y, rx: Math.PI / 2, mat: icing });
  const parts = [mesh];
  // Radial wedges read as a peppermint rather than a plain white shield.
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    parts.push(P(`caMintWedge${radius}`, spike(0.075, radius * 0.8, 3), {
      x: x + Math.sin(a) * radius * 0.5, y: y + Math.cos(a) * radius * 0.5,
      z: -0.085, rz: -a, mat: mint,
    }));
  }
  const group = new THREE.Group();
  mesh.parent.add(group); group.position.copy(mesh.position);
  for (const part of parts) { part.position.sub(group.position); group.add(part); }
  return group;
}
function buildTaffy(e, g, s) {
  const P = partsFor(e, g, s);
  P('caTaffyBody', prism(0.22, 0.29, 0.8, 6), { y: 0.85, rz: 0.12 });
  for (let i = 0; i < 3; i++) P('caTaffyBand', prism(0.25, 0.25, 0.055, 6), { y: 0.6 + i * 0.23, rz: 0.12, mat: icing });
  e.candyArm = P('caTaffyArm', slab(0.16, 0.16, 0.45), { x: 0.32, y: 0.85, z: -0.2 });
  P('caTaffyTwist', spike(0.24, 0.35, 4), { y: 1.42, rz: 0.3, mat: mint });
  boots(P); eyes(P, { y: 1.1, z: -0.22, mat: e.eyeMat });
}
function buildBonbon(e, g, s) {
  const P = partsFor(e, g, s);
  P('caBonBody', lump(0.32), { y: 0.9 });
  for (const side of [-1, 1]) P('caWrapper', spike(0.28, 0.38, 4), { x: side * 0.48, y: 0.9, rz: side * Math.PI / 2, mat: icing });
  e.candyBarrel = P('caBonBarrel', prism(0.22, 0.28, 0.48, 8), { y: 1.25, z: -0.18, rx: Math.PI / 2 });
  P('caBonMouth', prism(0.15, 0.15, 0.06, 8), { y: 1.25, z: -0.45, rx: Math.PI / 2, mat: mint });
  for (let i = 0; i < 3; i++) P('caBonAmmo', lump(0.13), { x: -0.2 + i * 0.2, y: 1.48, z: 0.05, mat: icing });
  boots(P); eyes(P, { y: 1.3, z: -0.5, x: 0.1, mat: e.eyeMat });
}
function buildJawbreaker(e, g, s) {
  const P = partsFor(e, g, s);
  P('caJawCore', lump(0.46), { y: 0.88, mat: mint });
  e.candyShell = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    e.candyShell.push(P('caJawPlate', lump(0.32), { x: Math.cos(a) * 0.4, y: 0.9,
      z: Math.sin(a) * 0.4, mat: i % 2 ? icing : e.bodyMat }));
  }
  for (const x of [-0.65, 0.65]) {
    P('caJawArm', slab(0.2, 0.55, 0.23), { x, y: 0.7 });
    P('caJawFist', lump(0.24), { x, y: 0.4, mat: icing });
  }
  P('caJawMouth', slab(0.45, 0.09, 0.13), { y: 0.75, z: -0.67, mat: mint });
  boots(P, 0.35); eyes(P, { y: 1.35, z: -0.35, x: 0.2, r: 1.2, mat: e.eyeMat });
}
function buildPoprock(e, g, s) {
  const P = partsFor(e, g, s);
  P('caRockBowl', prism(0.52, 0.27, 0.4, 6), { y: 0.45 });
  P('caRockRim', prism(0.55, 0.55, 0.08, 6), { y: 0.68, mat: icing });
  e.candyCrystals = [];
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    e.candyCrystals.push(P('caRockCrystal', spike(0.18, 0.7, 4), { x: Math.cos(a) * 0.25,
      y: 0.95, z: Math.sin(a) * 0.25, rz: -Math.cos(a) * 0.35, mat: i % 2 ? mint : icing }));
  }
  boots(P, 0.38); eyes(P, { y: 0.65, z: -0.5, mat: e.eyeMat });
}
function buildSugarspinner(e, g, s) {
  const P = partsFor(e, g, s);
  P('caSpinnerStick', prism(0.065, 0.09, 1.2, 6), { y: 0.65, mat: icing });
  e.candyWheel = candyDisc(P, 'caSpinnerDisc', 0, 1.45, 0.5);
  for (const x of [-0.22, 0.22]) P('caSpinnerBow', spike(0.19, 0.3, 3), { x, y: 0.8, rz: Math.sign(x) * Math.PI / 2 });
  P('caSpinnerBase', prism(0.23, 0.38, 0.16, 8), { y: 0.16 });
  eyes(P, { y: 1.45, z: -0.12, mat: e.eyeMat });
}
function buildCottonkite(e, g, s) {
  const P = partsFor(e, g, s);
  P('caCottonCore', lump(0.42), { y: 0.5 });
  for (const x of [-0.32, 0.32]) P('caCottonCloud', lump(0.3), { x, y: 0.58, sz: 0.9, mat: icing });
  P('caCottonCone', spike(0.28, 0.65, 6), { y: 0.03, rx: Math.PI, mat: mint });
  e.candyWings = [];
  for (const side of [-1, 1]) e.candyWings.push(P('caCottonWing', spike(0.35, 0.75, 3),
    { x: side * 0.65, y: 0.65, rz: -side * Math.PI / 2, sz: 0.18 }));
  for (let i = 0; i < 3; i++) P('caCottonBead', lump(0.09), { y: -0.25 - i * 0.15, z: i * 0.08, mat: icing });
  eyes(P, { y: 0.7, z: -0.35, x: 0.18, r: 1.2, mat: e.eyeMat });
}
function buildConfectioner(e, g, s) {
  const P = partsFor(e, g, s);
  e.candyTiers = [];
  for (let i = 0; i < 3; i++) {
    const r = 0.85 - i * 0.19, y = 0.6 + i * 0.53;
    e.candyTiers.push(P(`caCakeTier${i}`, prism(r, r, 0.43, 10), { y }));
    P(`caCakeIcing${i}`, prism(r + 0.035, r + 0.035, 0.09, 10), { y: y + 0.23, mat: icing });
    for (let j = 0; j < 8; j++) {
      const a = j * Math.PI / 4;
      P('caCakeDrip', spike(0.075, 0.25, 5), { x: Math.sin(a) * r, y: y + 0.12,
        z: Math.cos(a) * r, rx: Math.PI, mat: icing });
    }
  }
  e.candyHeart = P('caCakeHeart', lump(0.32), { y: 1.05, z: -0.48, mat: mint });
  e.candyDoors = [-1, 1].map((side) => P('caCakeDoor', slab(0.32, 0.5, 0.12),
    { x: side * 0.17, y: 1.05, z: -0.78, mat: icing }));
  e.candyShell = [];
  for (const x of [-0.93, 0.93]) {
    P('caCakeArm', slab(0.2, 0.85, 0.23), { x, y: 1.0, rz: -x * 0.15 });
    candyDisc(P, 'caCakeHand', x * 1.15, 0.64, 0.4);
    e.candyShell.push(P('caCakeShoulder', lump(0.3), { x, y: 1.5, mat: icing }));
  }
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    P('caCakeCrown', prism(0.045, 0.06, 0.55, 6), { x: Math.cos(a) * 0.38, y: 2.23, z: Math.sin(a) * 0.38, mat: icing });
    P('caCakeFlame', lump(0.1), { x: Math.cos(a) * 0.38, y: 2.55, z: Math.sin(a) * 0.38, sy: 1.5, mat: mint });
  }
  boots(P, 0.55); eyes(P, { y: 1.85, z: -0.4, x: 0.18, r: 1.6, mat: e.eyeMat });
}

// A candy keeps its warning and its damage together, including both pops.
// Killing the caster cancels unspent sweets; scarce marks never hide a hit.
function sweet(e, a, x, z, radius, delay, damage, opts = {}) {
  if (Math.abs(x) > 21 || Math.abs(z) > 21 || (e.candyPops?.length || 0) >= 8) return;
  const fx = a.ctx.effects, mark = fx.markAcquire();
  if (mark < 0) return;
  e.candyFx = fx;
  const mesh = new THREE.Mesh(geo('caFloorSweet', lump(0.18)), mint);
  mesh.position.set(x, 0.22, z); fx.scene.add(mesh);
  const pop = { x, z, radius, delay, damage, mark, mesh, t: 0, second: false, ...opts };
  (e.candyPops ||= []).push(pop);
  drawSweet(e, pop);
}
function drawSweet(e, p) {
  e.candyFx.markSet(p.mark, p.x, p.z, p.radius, p.second ? CREAM : PINK,
    Math.min(1, p.t / p.delay), p.length ? p.length / (2 * p.radius) : 1, p.angle || 0);
}
function tickSweets(e, a) {
  const pops = e.candyPops;
  if (!pops) return;
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += a.dt;
    p.mesh.scale.setScalar(1 + Math.min(1, p.t / p.delay));
    if (p.t < p.delay) { drawSweet(e, p); continue; }
    const target = a.ctx.player.pos, dx = target.x - p.x, dz = target.z - p.z;
    const radius = p.double && !p.second ? p.radius * 0.5 : p.radius;
    // The lane's angle uses the same floor-plane convention as markSet.
    const inside = p.length ? Math.abs(dx * Math.cos(p.angle) - dz * Math.sin(p.angle)) < radius &&
      Math.abs(dx * Math.sin(p.angle) + dz * Math.cos(p.angle)) < p.length / 2 : Math.hypot(dx, dz) < radius;
    // Taffy is attached to its caster. Testing only from the strip's centre
    // would let its arm strike through a wall nearer the shoulder.
    const armBlocked = e.type === 'taffy' && segBlocked(e.pos.x, e.pos.y + 0.85, e.pos.z,
      target.x, target.y + 0.8, target.z, a.ctx.obstacles);
    if (inside && !armBlocked && target.y < 2.2 && !segBlocked(p.x, 0.3, p.z, target.x, target.y + 0.8, target.z, a.ctx.obstacles)) {
      at.set(p.x, 0, p.z); a.ctx.onHitPlayer(p.damage, at, e);
    }
    at.set(p.x, 0.2, p.z);
    a.ctx.effects.shockwave(at, p.second ? CREAM : PINK, radius, 0.3);
    a.ctx.effects.burst(at, CREAM, 10, 4, 2, 0.4);
    if (p.double && !p.second) {
      p.second = true; p.t = 0; p.delay = 0.85; drawSweet(e, p);
    } else {
      e.candyFx.markRelease(p.mark); p.mesh.removeFromParent(); pops.splice(i, 1);
    }
  }
}
function cleanupCandy(e) {
  for (const p of e.candyPops || []) {
    e.candyFx.markRelease(p.mark); p.mesh.removeFromParent();
  }
  if (e.candyPops) e.candyPops.length = 0;
}
function candyArmor(e) {
  if (e.boss && e.bs.weakOpen) return 1;
  return (e.boss ? [0.6, 0.75, 0.9] : [0.65, 0.82, 1])[e.candyShed || 0];
}
function shedSugar(e, a) {
  const tier = e.hp <= e.maxHp / 3 ? 2 : e.hp <= e.maxHp * 2 / 3 ? 1 : 0;
  if (tier <= (e.candyShed || 0)) return;
  e.candyShed = tier;
  e.candyShell.forEach((m, i) => { m.visible = e.boss ? i >= tier : i >= tier * 2; });
  at.set(e.pos.x, e.pos.y + e.scale, e.pos.z);
  a.ctx.effects.burst(at, CREAM, 20, 5, 2.5, 0.5);
}
function fireCandy(e, a, heading, spread = 0) {
  const live = Math.atan2(a.ctx.player.pos.z - e.pos.z, a.ctx.player.pos.x - e.pos.x);
  a.ctx.addProjectile(e.pos.x, e.pos.y + (e.boss ? e.scale * 1.1 : 1.25), e.pos.z,
    e.type, e._projScale(), heading - live + spread);
}
function aiTaffy(e, a) {
  tickSweets(e, a);
  if (e.candyState === 'stretch') {
    e.faceLocked = true; e.group.rotation.y = Math.atan2(-e.candyDX, -e.candyDZ);
    const pop = e.candyPops?.[0];
    const stretch = pop ? Math.min(1, pop.t / pop.delay) : 1;
    e.candyArm.scale.z = e.scale * (1 + stretch * 9);
    e.candyArm.position.z = (-0.2 - stretch * 1.8) * e.scale;
    if (!pop) { e.candyState = 'recover'; e.candyT = 0.9; e._setEyeAlert(false); }
    return;
  }
  if (e.candyState === 'recover') {
    e.candyT -= a.dt;
    e.candyArm.scale.z = e.scale * (1 + Math.max(0, e.candyT) * 10);
    e.candyArm.position.z = (-0.2 - Math.max(0, e.candyT) * 2) * e.scale;
    if (e.candyT <= 0) e.candyState = 'walk';
    return;
  }
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (e.attackCd > 0 || a.dist > 5.8) return;
  e.candyDX = a.nx; e.candyDZ = a.nz;
  sweet(e, a, e.pos.x + a.nx * 2.5, e.pos.z + a.nz * 2.5, 0.9, 0.7, e.damage,
    { length: 6, angle: Math.atan2(-a.nx, -a.nz) });
  e.candyState = 'stretch'; e.attackCd = 2; e._setEyeAlert(true);
  a.vx = a.vz = 0;
}
function aiBonbon(e, a) {
  if (e.candyT > 0) {
    e.candyT -= a.dt;
    e.candyBarrel.scale.z = e.scale * (1 + 0.25 * Math.sin(e.candyT * 8));
    e.faceLocked = true; e.group.rotation.y = Math.atan2(-Math.cos(e.candyAim), -Math.sin(e.candyAim));
    if (e.candyT <= 0) {
      fireCandy(e, a, e.candyAim); e._setEyeAlert(false); e.candyBarrel.scale.setScalar(e.scale);
    }
    return;
  }
  orbit(e, a, circle);
  if (e.attackCd <= 0 && a.dist < 22) {
    e.attackCd = 2.7; e.candyT = 0.65; e.candyAim = Math.atan2(a.nz, a.nx); e._setEyeAlert(true);
  }
}
function aiJawbreaker(e, a) {
  shedSugar(e, a);
  const m = TYPES.jawbreaker.melee, tier = e.candyShed || 0;
  // Losing shell trades protection for shorter recoveries, never a shorter tell.
  if (e._meleeCycle(a.dt, a.dist, a.ctx, m.windup, m.start, m.hit, m.cd - tier * 0.45)) {
    a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  }
}
function aiPoprock(e, a) {
  tickSweets(e, a); orbit(e, a, circle);
  for (const m of e.candyCrystals) m.rotation.y += a.dt;
  if (e.attackCd > 0 || a.dist > 24) return;
  e.attackCd = 4.2;
  sweet(e, a, a.ctx.player.pos.x, a.ctx.player.pos.z, 2.8, 1.3, Math.min(18, e.damage), { double: true });
  e.flash = 0.15;
}
function aiSugarspinner(e, a) {
  orbit(e, a, circle);
  if (e.candyPulse === undefined) e.candyPulse = a.ctx.pulse;
  if (e.candyPulse === a.ctx.pulse) return;
  e.candyPulse = a.ctx.pulse;
  e.candyWheel.rotation.z += Math.PI / 6;
  let linked = 0;
  for (const other of a.ctx.enemies) {
    if (other === e || other.dead || other.boss || other.type === e.type || other.attackCd <= 0 ||
      other.candyHastePulse === a.ctx.pulse || other.pos.distanceToSquared(e.pos) > 64 ||
      segBlocked(e.pos.x, e.pos.y + 1, e.pos.z, other.pos.x, other.pos.y + 1, other.pos.z, a.ctx.obstacles)) continue;
    // A sugar rush advances recovery, never an attack's readable wind-up.
    // Marked on the recipient so overlapping spinners cannot multiply it.
    other.candyHastePulse = a.ctx.pulse;
    other.attackCd = Math.max(0, other.attackCd - 0.18);
    a.ctx.effects.beam(e.pos, other.pos, 0x8cffe0);
    if (++linked === 3) break;
  }
}
function aiCottonkite(e, a) {
  tickSweets(e, a);
  e.candyWings.forEach((m, i) => { m.rotation.x = Math.sin(a.ctx.time * 12) * (i ? 0.25 : -0.25); });
  if (e.candyState === 'pass') {
    e.candyT -= a.dt;
    a.vx = e.candyDX * Math.min(a.sp * 1.6, 6); a.vz = e.candyDZ * Math.min(a.sp * 1.6, 6); e.stepMul = 1.6;
    e.faceLocked = true; e.group.rotation.y = Math.atan2(-e.candyDX, -e.candyDZ);
    if (e.candyT <= 0) {
      sweet(e, a, e.pos.x, e.pos.z, 2.2, 1.2, Math.min(16, e.damage));
      e.candyState = 'recover'; e.candyT = 1.4; e.stepMul = 1.4; e._setEyeAlert(false);
    }
    return;
  }
  if (e.candyState === 'recover') {
    e.candyT -= a.dt; a.vx = -a.nx * a.sp * 0.5; a.vz = -a.nz * a.sp * 0.5;
    if (e.candyT <= 0) e.candyState = 'circle';
    return;
  }
  orbit(e, a, kiteCircle);
  if (e.attackCd <= 0 && a.dist < 10) {
    e.attackCd = 4; e.candyState = 'pass'; e.candyT = 1.0;
    e.candyDX = a.nx; e.candyDZ = a.nz; e._setEyeAlert(true);
  }
}
function cakeWindow(e, a, open) {
  e.bs.weakOpen = open; e.bs.ventNote = 'SUGAR HEART EXPOSED';
  e.candyDoors.forEach((m, i) => { m.position.x = (i ? 1 : -1) * (open ? 0.5 : 0.17) * e.scale; });
  e.candyHeart.scale.setScalar(e.scale * (open ? 1.5 : 1));
  a.ctx.bossEvent('vent', e);
}
function aiConfectioner(e, a) {
  tickSweets(e, a); shedSugar(e, a);
  const bs = e.bs;
  if (!e.candyState) { e.candyState = 'walk'; e.candyT = 1.2; bs.turn = 0; }
  e.candyT -= a.dt;
  if (e.candyState === 'resolve') {
    if (!e.candyPops?.length) {
      e.candyState = 'recover'; e.candyT = 1.6; cakeWindow(e, a, true);
    }
    return;
  }
  if (e.candyState === 'recover') {
    if (e.candyT <= 0) {
      cakeWindow(e, a, false); e.candyState = 'walk';
      e.candyT = (1.5 - (e.candyShed || 0) * 0.3) * e.rate;
    }
    return;
  }
  if (e.candyState === 'tell') {
    e.faceLocked = true; e.group.rotation.y = Math.atan2(-Math.cos(e.candyAim), -Math.sin(e.candyAim));
    // The cake twists apart before the carousel; crossing strips and popping
    // clusters have their own ground warnings after the crown's wind-up.
    e.candyTiers.forEach((m, i) => { m.rotation.y = Math.sin(e.candyT * 4) * (i % 2 ? -0.25 : 0.25); });
    if (e.candyT > 0) return;
    const tier = e.candyShed || 0;
    const damage = Math.min(25, e.damage);
    if (bs.attack === 'ribbons') {
      sweet(e, a, e.candyX, e.candyZ, 1.1, 1.05, damage, { length: 14, angle: e.candyAim });
      sweet(e, a, e.candyX, e.candyZ, 1.1, 1.8, damage, { length: 14, angle: e.candyAim + Math.PI / 2 });
    } else if (bs.attack === 'carousel') {
      // A missing wedge is always present. More shells lost means more candy,
      // but the gap stays a quarter-turn wide rather than shrinking shut.
      const n = 12 + tier * 2;
      for (let i = 0; i < n; i++) {
        const angle = i * Math.PI * 2 / n;
        if (angle < Math.PI / 4 || angle > Math.PI * 7 / 4) continue;
        fireCandy(e, a, e.candyAim, angle);
      }
    } else {
      for (let i = -1; i <= 1; i++) sweet(e, a, e.candyX + i * 3.8, e.candyZ,
        2.5, 1.1 + Math.abs(i) * 0.25, damage * 0.48, { double: true });
      if (tier === 2) sweet(e, a, e.candyX, e.candyZ + 4.5, 2.5, 1.5, damage * 0.48, { double: true });
    }
    e.candyTiers.forEach((m) => { m.rotation.y = 0; });
    e._setEyeAlert(false); e.candyState = 'resolve';
    return;
  }
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (e.candyT > 0 || a.dist > 28) return;
  bs.attack = ['ribbons', 'carousel', 'clusters'][bs.turn++ % 3];
  e.candyAim = Math.atan2(a.nz, a.nx); e.candyX = a.ctx.player.pos.x; e.candyZ = a.ctx.player.pos.z;
  e.candyState = 'tell'; e.candyT = 0.9; e._setEyeAlert(true);
}
