// CANDY: stretched taffy, cracked sugar shells and sweets that pop twice.
import * as THREE from 'three';
import { ENEMY_TYPES, SHARED_MATS, partsFor, geo, lump, slab, prism, spike,
  eyes, orbit, segBlocked, capturedShot, bossTouch, landHit, releaseMarks,
  BOSS_REACH_Y, ARENA_HALF } from './shared.js';

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
  confectioner: { ...base, name: 'THE CONFECTIONER', hp: 3100, speed: 2.6,
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
  e.candyHands = [];
  e.candyFlames = [];
  for (const x of [-0.93, 0.93]) {
    // The hands are kept: the fight's tells are written onto them.
    P('caCakeArm', slab(0.2, 0.85, 0.23), { x, y: 1.0, rz: -x * 0.15 });
    e.candyHands.push(candyDisc(P, 'caCakeHand', x * 1.15, 0.64, 0.4));
    e.candyShell.push(P('caCakeShoulder', lump(0.3), { x, y: 1.5, mat: icing }));
  }
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    P('caCakeCrown', prism(0.045, 0.06, 0.55, 6), { x: Math.cos(a) * 0.38, y: 2.23, z: Math.sin(a) * 0.38, mat: icing });
    e.candyFlames.push(P('caCakeFlame', lump(0.1), { x: Math.cos(a) * 0.38, y: 2.55, z: Math.sin(a) * 0.38, sy: 1.5, mat: mint }));
  }
  // The flare animation scales the flames per instance, so the built scale -
  // the sy stretch above included - has to be kept to be multiplied back in.
  e.candyFlameBase = e.candyFlames.map((f) => f.scale.clone());
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
  // A boss killed mid-pattern is also holding lane telegraphs in bs.rings;
  // the marks pool is shallow enough that one leak per fight would starve it.
  releaseMarks(e);
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
  capturedShot(e, a, heading, spread, e.boss ? e.scale * 1.1 : 1.25);
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
// ---- THE CONFECTIONER, the fight -------------------------------------------
//
// The old Confectioner walked at the player, dealt one of three single-shot
// patterns and stood still while its heart was open - a health bar in a hat.
// The new one never holds still. It circles at throwing range, it crosses
// the arena on a marked lane, and it pays the same heart window for every
// pattern it deals: dodge the pattern, then shoot the heart, then move
// again. Five attacks, each with its own tell and its own answer, dealt from
// a fixed deck so a returning player can read what is coming.

// The band it stalks in, and how hard it circles while it is there.
const bossRing = { dist: 10, band: 2.5, out: 0.85, in: -0.6, strafe: 0.8, flip: 1.7, flipVar: 0.9 };

// SUGAR RUSH: a telegraphed charge. The lane is drawn whole before the cake
// has moved a step - at this speed the lane is the only honest way to show
// where it is going.
const RUSH_SPEED = 25;
const RUSH_STEP_MUL = 10;   // the walk clamp must not be the brake on a dash
const RUSH_LANE_W = 3.2;    // wider than the body: the warning covers the trample
const RUSH_MAX_LEN = 26;
const RUSH_TELL = 0.85;
const RUSH_WINDOW = 1.9;    // the bill for a stampede
const RUSH_DAZE = 2.6;      // ...and baited into a pillar, the cake is dazed for longer

// TAFFY TWIRL: a lash anchored to the boss, swept around it. One marked
// diameter, two arms, one warning. Three answers, all different: outrun it
// inside five metres, leave its nine, or put a pillar in its way.
const TWIRL_TELL = 0.75;
const TWIRL_REACH = 9;
const TWIRL_W = 1.7;
const TWIRL_RATE = 1.9;
const TWIRL_WINDOW = 1.5;

// PEPPERMINT CAROUSEL: rotating volleys on the music's half-beat. The crown
// spinning up is the tell, the wedge between the arms is the channel, and
// the arms walk between volleys so the channel moves too.
const CAROUSEL_TELL = 0.6;
const CAROUSEL_ADVANCE = 0.26;
const CAROUSEL_WINDOW = 1.3;

// GUMDROP BLOOM: a ring of double-popping sweets around where the player was
// going, with two adjacent sectors always left clear - the way out is drawn
// into the pattern, not lucked into.
const BLOOM_TELL = 0.55;
const BLOOM_WINDOW = 1.4;

// BONBON FAN: wrapped sweets thrown in a spread, each one the gunner's own -
// slow, skipping once off an arena wall, and shootable out of the air.
const FAN_TELL = 0.5;
const FAN_SPREAD = 0.22;
const FAN_WINDOW = 1.3;

// The five patterns as a dealt deck: each twice per ten attacks, never twice
// running, in a fixed order a returning player can read. test/candy.mjs
// holds a mirror of this order and pins patterns by index.
const ATTACK_DECK = [
  'carousel', 'bloom', 'rush', 'fan', 'twirl',
  'bloom', 'carousel', 'fan', 'twirl', 'rush',
];
const TELL_TIME = { rush: RUSH_TELL, twirl: TWIRL_TELL, carousel: CAROUSEL_TELL, bloom: BLOOM_TELL, fan: FAN_TELL };

function nextAttack(e, a) {
  // The twirl is the one pattern with a reach, and the deck will not spend a
  // turn on a lash that cannot connect: far out it deals the next pattern
  // instead, and the turn goes with it.
  let slot = ATTACK_DECK[e.bs.turn % ATTACK_DECK.length];
  if (slot === 'twirl' && a.dist > TWIRL_REACH + 4) {
    for (let i = 1; i < ATTACK_DECK.length; i++) {
      const s = ATTACK_DECK[(e.bs.turn + i) % ATTACK_DECK.length];
      if (s !== 'twirl') { e.bs.turn += i; slot = s; break; }
    }
  }
  return slot;
}

// Lane telegraphs live in bs.rings - the shape releaseMarks() already knows -
// so a boss killed mid-pattern cannot leak its warning handles.
function laneTake(e, a, n) {
  const fx = a.ctx.effects, rings = [];
  for (let i = 0; i < n; i++) {
    const h = fx.markAcquire();
    if (h < 0) break;
    rings.push({ mark: h });
  }
  e.bs.fx = fx;
  e.bs.rings = rings;
  return rings.length;
}
function laneDrop(e) {
  if (!e.bs.rings) return;
  for (const r of e.bs.rings) e.bs.fx.markRelease(r.mark);
  e.bs.rings = null;
}
function drawRushLane(e, fill) {
  const bs = e.bs, r = bs.rings && bs.rings[0];
  if (!r) return;
  bs.fx.markSet(r.mark, bs.dashOX + bs.dashX * bs.laneLen / 2, bs.dashOZ + bs.dashZ * bs.laneLen / 2,
    RUSH_LANE_W / 2, PINK, fill, bs.laneLen / RUSH_LANE_W,
    Math.atan2(-bs.dashX, -bs.dashZ), 0.4);
}
function drawTwirlLane(e, fill) {
  const bs = e.bs, r = bs.rings && bs.rings[0];
  if (!r) return;
  bs.fx.markSet(r.mark, e.pos.x, e.pos.z, TWIRL_W / 2, PINK, fill,
    (TWIRL_REACH * 2) / TWIRL_W,
    Math.atan2(-Math.cos(bs.sweepA), -Math.sin(bs.sweepA)), 0.5);
}

// The model is posed fresh every frame: the states write AIM values, the
// pose closes the distance to them, and nothing an attack left behind can
// stick - a hand raised for a twirl eases home on its own once the twirl is
// done. `gyro` coasts rather than snapping, so a spin-down reads as one.
function bossPose(e, a) {
  const bs = e.bs, k = Math.min(1, a.dt * 8);
  if (bs.throwT > 0) bs.handZAim = -0.5 * Math.max(0, (bs.throwT -= a.dt) / 0.25);
  bs.gyro *= Math.max(0, 1 - a.dt * 2.5);
  // Wrapped, because the angle only ever accumulates: an hour-long fight
  // would otherwise hand the shader a five-digit radian and its float32
  // cosines the bill.
  bs.spinAngle = (bs.spinAngle + bs.gyro * a.dt) % (Math.PI * 2);
  bs.lean += (bs.leanAim - bs.lean) * Math.min(1, a.dt * 7);
  bs.handUp += (bs.handUpAim - bs.handUp) * k;
  bs.handOut += (bs.handOutAim - bs.handOut) * k;
  bs.handZ += (bs.handZAim - bs.handZ) * k;
  bs.flare += (bs.flareAim - bs.flare) * k;
  for (let i = 0; i < e.candyTiers.length; i++) {
    e.candyTiers[i].rotation.y = bs.spinAngle * (i % 2 ? -1 : 1);
    e.candyTiers[i].rotation.x = bs.lean;
  }
  e.candyHands[0].position.set(-(1.15 + bs.handOut) * e.scale, (0.64 + bs.handUp) * e.scale, bs.handZ * e.scale);
  e.candyHands[1].position.set((1.15 + bs.handOut) * e.scale, (0.64 + bs.handUp) * e.scale, bs.handZ * e.scale);
  for (let i = 0; i < e.candyFlames.length; i++) {
    const b = e.candyFlameBase[i], m = 1 + bs.flare * (1 + 0.3 * Math.sin(a.ctx.time * 18 + i));
    e.candyFlames[i].scale.set(b.x * m, b.y * m, b.z * m);
  }
}

function beginTell(e, a) {
  const bs = e.bs;
  e.candyState = 'tell';
  e.candyT = TELL_TIME[bs.attack];
  e.stepMul = 1.4;
  e._setEyeAlert(true);
  if (bs.attack === 'rush') {
    const dx = e.candyX - e.pos.x, dz = e.candyZ - e.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    bs.dashX = dx / len; bs.dashZ = dz / len;
    bs.dashOX = e.pos.x; bs.dashOZ = e.pos.z;
    // Travel stops the BODY short of the wall; the lane is drawn past the
    // travel by the same margin, so the body and the slam it ends in are
    // both inside the warning. The near-axis wall distance needs the sign,
    // or a dash aimed out of a corner reads as negative room.
    const bound = ARENA_HALF - (e.radius - 0.5);
    const wallAlong = (o, v) => Math.abs(v) < 1e-4 ? 1e9 : (bound * Math.sign(v) - o) / v;
    bs.dashLen = Math.max(4, Math.min(RUSH_MAX_LEN,
      wallAlong(e.pos.x, bs.dashX), wallAlong(e.pos.z, bs.dashZ)) - e.radius);
    bs.laneLen = bs.dashLen + 4;
    bs.dashHit = false;
  } else if (bs.attack === 'twirl') {
    // The lash starts behind the player's bearing and swings toward them:
    // the first thing the tell teaches is where the arm is coming from.
    bs.sweepDir = Math.random() < 0.5 ? 1 : -1;
    bs.sweepA = e.candyAim - bs.sweepDir * 1.2;
    bs.sweepHit = 0;
  } else if (bs.attack === 'carousel') {
    bs.spinBase = e.candyAim;
    bs.spinDir = Math.random() < 0.5 ? 1 : -1;
    bs.volleys = 0;
    bs.spinPulse = a.ctx.pulse;
  } else if (bs.attack === 'fan') {
    bs.fanSide = -bs.fanSide;
  }
}

function fireAttack(e, a) {
  const bs = e.bs, tier = e.candyShed || 0;
  if (bs.attack === 'rush') {
    e.candyState = 'rush';
    e.candyT = bs.dashLen / RUSH_SPEED + 0.05;
    e.stepMul = RUSH_STEP_MUL;
    // Eyes stay lit: the tell is not over, the charge is the warning paying out.
  } else if (bs.attack === 'twirl') {
    e.candyState = 'twirl';
    e.candyT = (4.71 + tier * 0.52) / (TWIRL_RATE + tier * 0.15);
  } else if (bs.attack === 'carousel') {
    e.candyState = 'carousel';
    e.candyT = 4;   // a fuse only: the volleys count themselves out on the pulse
    e._setEyeAlert(false);
  } else if (bs.attack === 'bloom') {
    gumdropBloom(e, a);
    openHeart(e, a, BLOOM_WINDOW);
  } else {
    bonbonFan(e, a);
    openHeart(e, a, FAN_WINDOW);
  }
}

function rushSlam(e, a, stopped) {
  laneDrop(e);
  at.set(e.pos.x, 0.6, e.pos.z);
  a.ctx.effects.shockwave(at, PINK, 5.5, 0.5);
  a.ctx.effects.burst(at, CREAM, 26, 7, 3.2, 0.6);
  a.ctx.effects.addShake(stopped ? 0.32 : 0.24);
  // The impact knocks frosting loose, so the heart window that follows is
  // contested rather than free.
  const dmg = Math.min(25, e.damage) * 0.4;
  for (let i = 0; i < 3; i++) {
    const ang = Math.random() * Math.PI * 2;
    sweet(e, a, e.pos.x + Math.cos(ang) * 2.4, e.pos.z + Math.sin(ang) * 2.4,
      1.5, 0.9 + i * 0.12, dmg);
  }
  // A burnout is the stampede running its course; a PILLAR is the player's
  // doing, and the cake pays for it with a longer window. Wall stops add a
  // flat 1 to blockedBy (see Enemy.update), obstacles do not.
  openHeart(e, a, stopped && e.blockedBy < 0.9 ? RUSH_DAZE : RUSH_WINDOW);
}

function gumdropBloom(e, a) {
  const ctx = a.ctx, tier = e.candyShed || 0;
  const dmg = Math.min(25, e.damage) * 0.48;
  // A gentle lead on the captured spot: holding a straight line stays
  // punished, the same law the blight's spit follows.
  const lx = Math.max(-20, Math.min(20, e.candyX + ctx.player.vel.x * 0.4));
  const lz = Math.max(-20, Math.min(20, e.candyZ + ctx.player.vel.z * 0.4));
  // The centre sweet is placed first: the one the eight-pop cap must never
  // eat, because the player's current ground is the whole question.
  sweet(e, a, lx, lz, 2.3, 1.2, dmg, { double: true });
  const gap = Math.random() * Math.PI * 2;
  for (let i = 0; i < 5; i++) {
    // Two adjacent sectors stay clear, so the way out is part of the
    // pattern rather than a gap the dice left.
    if (i < 2) continue;
    const ang = gap + (i / 5) * Math.PI * 2;
    sweet(e, a, lx + Math.cos(ang) * 3.4, lz + Math.sin(ang) * 3.4,
      2.2, 1.0 + (i % 2) * 0.15, dmg, { double: true });
  }
  // Cracked shells scatter the ring wider: outer sweets sit in the gap's
  // mouth, so the way out is still there but asks for an angle, not a line.
  if (tier > 0) sweet(e, a, lx + Math.cos(gap + 0.4 * Math.PI) * 5.6,
    lz + Math.sin(gap + 0.4 * Math.PI) * 5.6, 2.0, 1.45, dmg, { double: true });
  if (tier > 1) for (const o of [-0.35, 0.35]) sweet(e, a,
    lx + Math.cos(gap + 0.4 * Math.PI + o) * 5.6, lz + Math.sin(gap + 0.4 * Math.PI + o) * 5.6,
    2.0, 1.55, dmg, { double: true });
}

function bonbonFan(e, a) {
  const bs = e.bs, tier = e.candyShed || 0;
  const n = Math.min(5, 3 + tier + (e.cycle > 0 ? 1 : 0));
  // Thrown from the hand, alternating sides, so the fan's origin moves.
  const ox = e.pos.x + a.nx * 1.4 - a.nz * bs.fanSide * 1.9;
  const oz = e.pos.z + a.nz * 1.4 + a.nx * bs.fanSide * 1.9;
  for (let i = 0; i < n; i++) {
    a.ctx.addProjectile(ox, e.pos.y + e.scale * 1.1, oz, 'bonbon', 1,
      (i - (n - 1) / 2) * FAN_SPREAD);
  }
  bs.throwT = 0.25;
}

function openHeart(e, a, secs) {
  e.candyState = 'window';
  e.candyT = secs;
  cakeWindow(e, a, true);
  e._setEyeAlert(false);
}

function aiConfectioner(e, a) {
  tickSweets(e, a);
  shedSugar(e, a);
  const bs = e.bs, ctx = a.ctx, tier = e.candyShed || 0;
  if (!e.candyState) {
    e.candyState = 'stalk'; e.candyT = 1.0;
    bs.turn = 0; bs.gyro = 0; bs.spinAngle = 0;
    bs.lean = 0; bs.handUp = 0; bs.handOut = 0; bs.handZ = 0; bs.flare = 0;
    bs.leanAim = 0; bs.handUpAim = 0; bs.handOutAim = 0; bs.handZAim = 0; bs.flareAim = 0;
    bs.throwT = 0; bs.sweepHit = 0; bs.fanSide = 1;
  }
  e.candyT -= a.dt;
  // REST POISE first: whatever a state does not claim eases back to the walk.
  bs.leanAim = 0; bs.handUpAim = 0; bs.handOutAim = 0; bs.handZAim = 0; bs.flareAim = 0;
  // TOUCHING THE CAKE IS NOT FREE, in any state. The dash is the one
  // exception: it owns a trample of its own, because the shared touch clock
  // would shrug a stampede off.
  if (e.candyState !== 'rush') bossTouch(e, a);

  if (e.candyState === 'stalk') {
    e.stepMul = 1.4;
    e._setEyeAlert(false);
    // Terror is a stagger, not a rout: hold ground, refuse new patterns.
    if (e.status.fear <= 0) {
      orbit(e, a, bossRing);
      if (e.candyT <= 0) {
        let pick = nextAttack(e, a);
        bs.turn++;
        // A pattern that cannot draw its warning does not fire blind - the
        // same law the pop cap keeps. The fan needs no floor mark, so it
        // stands in.
        if ((pick === 'rush' || pick === 'twirl') && laneTake(e, a, 1) < 1) pick = 'fan';
        bs.attack = pick;
        e.candyAim = Math.atan2(a.nz, a.nx);
        e.candyX = ctx.player.pos.x;
        e.candyZ = ctx.player.pos.z;
        beginTell(e, a);
      }
    }
  } else if (e.candyState === 'tell') {
    if (e.status.fear > 0) {
      // Terror cancels a half-told pattern: no new harm while it lasts.
      laneDrop(e); bs.attack = '';
      e._setEyeAlert(false);
      e.candyState = 'stalk'; e.candyT = 0.5;
    } else {
      e.stepMul = 1.4;
      if (bs.attack === 'rush') {
        e.faceLocked = true;
        e.group.rotation.y = Math.atan2(-bs.dashX, -bs.dashZ);
        bs.leanAim = 0.12; bs.flareAim = 0.9;
        drawRushLane(e, 1 - e.candyT / RUSH_TELL);
      } else if (bs.attack === 'twirl') {
        bs.handUpAim = 0.55; bs.handOutAim = 0.5; bs.leanAim = -0.06;
        drawTwirlLane(e, 0.5 * (1 - e.candyT / TWIRL_TELL));
      } else if (bs.attack === 'carousel') {
        // The crown spins up the way it is about to fire: the salvo's
        // direction is legible before the first round leaves.
        bs.gyro = bs.spinDir * (1.5 + 4 * (1 - e.candyT / CAROUSEL_TELL));
        bs.leanAim = -0.05;
      } else if (bs.attack === 'bloom') {
        bs.handUpAim = 0.35;
        e.candyHeart.scale.setScalar(e.scale * (1 + 0.2 * Math.sin(ctx.time * 18)));
      } else {
        bs.handZAim = 0.3; bs.handUpAim = 0.3;   // the throwing hand winds back
      }
      if (e.candyT <= 0) fireAttack(e, a);
    }
  } else if (e.candyState === 'rush') {
    e.stepMul = RUSH_STEP_MUL;
    e.faceLocked = true;
    e.group.rotation.y = Math.atan2(-bs.dashX, -bs.dashZ);
    a.vx = bs.dashX * RUSH_SPEED; a.vz = bs.dashZ * RUSH_SPEED;
    bs.leanAim = -0.14; bs.flareAim = 0.5;
    // TRAMPLE, once per stampede, and only inside the lane that was drawn. A
    // degenerate bearing (the player parked inside the boss at the pick)
    // leaves the lane pointing at nothing, so it takes the trample with it
    // rather than hitting beside its own warning.
    const p = ctx.player.pos;
    const perp = Math.abs(-(p.x - e.pos.x) * bs.dashZ + (p.z - e.pos.z) * bs.dashX);
    if (!bs.dashHit && (bs.dashX || bs.dashZ) && a.dist < e.radius + 1.0
      && perp < RUSH_LANE_W / 2 && Math.abs(p.y - e.pos.y) < BOSS_REACH_Y) {
      bs.dashHit = true;
      landHit(e, ctx);
      at.set(p.x, 0.5, p.z);
      ctx.effects.burst(at, CREAM, 14, 5, 2.4, 0.4);
      ctx.effects.addShake(0.15);
    }
    // A frosting trail: a dash without one reads as a teleport.
    bs.trailT = (bs.trailT || 0) - a.dt;
    if (bs.trailT <= 0) {
      bs.trailT = 0.07;
      at.set(e.pos.x, 0.3, e.pos.z);
      ctx.effects.burst(at, CREAM, 3, 2, 1.2, 0.35);
    }
    drawRushLane(e, 1);
    const stopped = e.blockedBy > 0.15;
    if (e.candyT <= 0 || stopped) rushSlam(e, a, stopped);
  } else if (e.candyState === 'twirl') {
    e.stepMul = 1.4;
    const rate = TWIRL_RATE + tier * 0.15;
    bs.sweepA += bs.sweepDir * rate * a.dt;
    bs.gyro = bs.sweepDir * rate * 1.6;
    bs.handUpAim = 0.55; bs.handOutAim = 0.5; bs.leanAim = -0.08;
    e._setEyeAlert(true);
    drawTwirlLane(e, 0.55);
    if (bs.sweepHit > 0) bs.sweepHit -= a.dt;
    const p = ctx.player.pos;
    const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
    const ca = Math.cos(bs.sweepA), sa = Math.sin(bs.sweepA);
    const along = Math.abs(dx * ca + dz * sa), perp = Math.abs(-dx * sa + dz * ca);
    if (bs.sweepHit <= 0 && along < TWIRL_REACH && perp < TWIRL_W / 2
      && Math.abs(p.y - e.pos.y) < BOSS_REACH_Y
      && !segBlocked(e.pos.x, e.pos.y + 1.2, e.pos.z, p.x, p.y + 0.8, p.z, ctx.obstacles)) {
      bs.sweepHit = 0.85;
      at.set(p.x, 0.5, p.z);
      ctx.onHitPlayer(Math.min(25, e.damage) * 0.65, at, e);
      ctx.effects.burst(at, PINK, 12, 4, 2, 0.4);
      ctx.effects.addShake(0.1);
    }
    if (e.candyT <= 0) { laneDrop(e); openHeart(e, a, TWIRL_WINDOW); }
  } else if (e.candyState === 'carousel') {
    e.stepMul = 1.4;
    bs.gyro = bs.spinDir * 3;
    bs.leanAim = 0.05; bs.flareAim = 0.6;
    // THE VOLLEYS RIDE THE HALF-BEAT, not a timer of their own.
    if (bs.spinPulse !== ctx.pulse) {
      bs.spinPulse = ctx.pulse;
      const arms = Math.min(5, 3 + tier + (e.cycle > 0 ? 1 : 0));
      for (let k = 0; k < arms; k++) fireCandy(e, a, bs.spinBase + k * Math.PI * 2 / arms);
      bs.spinBase += bs.spinDir * CAROUSEL_ADVANCE;
      bs.volleys++;
    }
    // Ended by counting itself out - or by the fuse, which has to be readable
    // on a frame the pulse did not edge, or a stalled clock would hang the
    // state forever with the crown lit and nothing firing.
    if (bs.volleys >= 5 + tier + (e.cycle > 0 ? 1 : 0) || e.candyT <= 0) {
      openHeart(e, a, CAROUSEL_WINDOW);
    }
  } else if (e.candyState === 'window') {
    e.stepMul = 1.4;
    // Catching its breath - but up close it stands and recovers, and from
    // afar it closes ground while you shoot: the window is never free, it
    // only looks calmer.
    if (e.status.fear > 0 || a.dist < 6) { a.vx = 0; a.vz = 0; }
    else { a.vx = a.nx * a.sp * 0.45; a.vz = a.nz * a.sp * 0.45; }
    bs.leanAim = 0.1;
    e.candyHeart.scale.setScalar(e.scale * (1.5 + 0.08 * Math.sin(ctx.time * 9)));
    if (e.candyT <= 0) {
      cakeWindow(e, a, false);
      e.candyState = 'stalk';
      e.candyT = Math.max(0.3, (0.75 - tier * 0.1) * e.rate);
    }
  }
  bossPose(e, a);
}
