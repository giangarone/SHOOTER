// BONE spends its own skeleton: ribs become ammunition, plates break away,
// and exposed marrow is the price of attacking. No borrowed bodies or revivals.
import * as THREE from 'three';
import {
  ENEMY_TYPES, SHARED_MATS, aiMelee, bossTouch, eyes, geo, landHit,
  orbit, partsFor, prism, segBlocked, slab, spike,
} from './shared.js';

const IVORY = 0xe5d6b5;
const MARROW = 0xff796f;
const circle = { dist: 12, band: 2, out: 0.75, in: -0.6, strafe: 0.35, flip: 2, flipVar: 2 };
const wingCircle = { ...circle, dist: 7 };

// Open rib arcs, blunt joints, black eye sockets: holes carry the family
// silhouette, rather than a solid torso painted ivory.
function skull(P, e, y, z = -0.12) {
  P('boneSkull', slab(0.4, 0.3, 0.34), { y, z });
  e.boneJaw = P('boneJaw', slab(0.34, 0.09, 0.3), { y: y - 0.22, z: z - 0.04 });
  for (const x of [-0.11, 0.11]) {
    P('boneSocket', slab(0.14, 0.12, 0.04), { x, y, z: z - 0.18, mat: SHARED_MATS.gunmetal });
    P('boneTooth', spike(0.035, 0.13, 4), { x, y: y - 0.16, z: z - 0.2, rx: Math.PI });
  }
  eyes(P, { y, x: 0.11, z: z - 0.21, r: 0.65, mat: e.eyeMat });
}

function cage(P, e, y, width = 1) {
  P('boneSpine', slab(0.1, 0.68, 0.13), { y, z: 0.18, mat: SHARED_MATS.boneIvory });
  e.boneRibs = [];
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const rib = P('boneRib', () => new THREE.TorusGeometry(0.27, 0.045, 4, 7, Math.PI * 0.85), {
        x: side * 0.08, y: y - 0.22 + i * 0.2, z: -0.04,
        rx: Math.PI / 2, rz: side < 0 ? Math.PI : 0, sx: width, sy: width,
      });
      e.boneRibs.push(rib);
    }
  }
  e.boneCore = P('boneCore', prism(0.075, 0.11, 0.44, 5), {
    y, z: -0.02, mat: SHARED_MATS.boneMarrow, shadow: false,
  });
}

function legs(P, spread = 0.2, height = 0.55) {
  for (const side of [-1, 1]) {
    P('boneLeg', slab(0.1, 1, 0.11), { x: side * spread, y: height / 2, sy: height, rz: side * 0.12 });
    P('boneJoint', prism(0.11, 0.11, 0.12, 5), { x: side * spread, y: height * 0.52, mat: SHARED_MATS.boneIvory });
    P('boneFoot', slab(0.15, 0.09, 0.3), { x: side * spread, y: 0.05, z: -0.07 });
  }
}

export function buildKnuckler(e, g, s) {
  const P = partsFor(e, g, s);
  cage(P, e, 0.52);
  skull(P, e, 0.8, -0.3);
  // Forearms take the weight: the runner reads as a hand scrambling forward.
  for (const side of [-1, 1]) {
    P('knuckleArm', slab(0.1, 0.62, 0.12), { x: side * 0.42, y: 0.34, z: -0.08, rz: side * 0.45 });
    P('knuckleFist', slab(0.3, 0.18, 0.32), { x: side * 0.55, y: 0.12, z: -0.22, mat: SHARED_MATS.boneIvory });
  }
  legs(P, 0.16, 0.3);
}

export function buildRibshot(e, g, s) {
  const P = partsFor(e, g, s);
  legs(P);
  cage(P, e, 0.95, 1.4);
  skull(P, e, 1.45);
  for (const side of [-1, 1]) {
    P('ribshotArm', slab(0.08, 0.55, 0.1), { x: side * 0.55, y: 1, rz: side * 0.6 });
  }
}

export function buildRibguard(e, g, s) {
  const P = partsFor(e, g, s);
  legs(P, 0.3, 0.5);
  cage(P, e, 0.98, 1.5);
  skull(P, e, 1.5);
  e.bonePlates = [];
  for (const side of [-1, 1]) {
    e.bonePlates.push(P('ribguardPlate', slab(0.48, 0.92, 0.18), {
      x: side * 0.28, y: 1.05, z: -0.35, rz: side * 0.16,
    }));
    P('ribguardClub', prism(0.19, 0.11, 0.88, 5), { x: side * 0.68, y: 0.6, rz: side * 0.15 });
  }
}

export function buildOssuary(e, g, s) {
  const P = partsFor(e, g, s);
  cage(P, e, 0.42, 1.5);
  skull(P, e, 0.65, -0.43);
  // A comb of vertebrae high over a low, four-legged pelvis.
  for (let i = 0; i < 5; i++) {
    P('ossuarySpur', spike(0.1, 1, 5), { x: (i - 2) * 0.2, y: 0.9, z: 0.2, sy: 0.65 + (2 - Math.abs(i - 2)) * 0.25 });
  }
  for (const x of [-0.4, 0.4]) for (const z of [-0.2, 0.35]) {
    P('ossuaryLeg', slab(0.09, 0.42, 0.09), { x, z, y: 0.21, rz: x });
  }
}

export function buildMarrow(e, g, s) {
  const P = partsFor(e, g, s);
  legs(P, 0.14, 0.65);
  cage(P, e, 1.05, 0.85);
  skull(P, e, 1.6);
  // An open femur held horizontally, the red marrow visible at both ends.
  P('marrowStaff', prism(0.09, 0.09, 1.4, 5), { y: 1.05, z: -0.35, rz: Math.PI / 2 });
  for (const side of [-1, 1]) {
    P('marrowCup', prism(0.14, 0.12, 0.18, 5), {
      x: side * 0.7, y: 1.05, z: -0.35, rz: Math.PI / 2, mat: SHARED_MATS.boneMarrow,
    });
    P('marrowArm', slab(0.07, 0.5, 0.08), { x: side * 0.32, y: 1.14, rx: -0.65 });
  }
}

export function buildSkullwing(e, g, s) {
  const P = partsFor(e, g, s);
  cage(P, e, 0.5, 0.75);
  skull(P, e, 0.7, -0.28);
  e.boneWings = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      e.boneWings.push(P('skullwingFinger', slab(0.08, 1, 0.09), {
        x: side * (0.6 + i * 0.16), y: 0.65, z: i * 0.22,
        sy: 1.4 - i * 0.2, rz: side * (1.1 + i * 0.13),
      }));
      P('skullwingFang', spike(0.06, 0.3, 4), { x: side * (0.55 + i * 0.23), y: 0.3, z: i * 0.18, rx: Math.PI });
    }
  }
}

export function buildOssarch(e, g, s) {
  const P = partsFor(e, g, s);
  legs(P, 0.44, 0.65);
  cage(P, e, 1.1, 1.8);
  skull(P, e, 1.8, -0.2);
  e.bonePlates = [];
  for (const side of [-1, 1]) {
    e.bonePlates.push(P('ossarchMantle', slab(0.28, 0.9, 0.58), { x: side * 0.58, y: 1.32, rz: side * 0.3 }));
    P('ossarchArm', slab(0.15, 1.1, 0.17), { x: side * 0.88, y: 0.94, rz: side * 0.22 });
    for (let i = 0; i < 3; i++) {
      P('ossarchClaw', spike(0.07, 0.65, 4), { x: side * (0.82 + i * 0.13), y: 0.3, z: -0.16, rx: Math.PI });
    }
  }
  for (let i = 0; i < 5; i++) {
    P('ossarchCrown', spike(0.07, 0.65, 5), {
      x: (i - 2) * 0.17, y: 2.14, z: 0.02, rz: -(i - 2) * 0.25,
      sy: 1 - Math.abs(i - 2) * 0.12, mat: SHARED_MATS.boneIvory,
    });
  }
}

const at = new THREE.Vector3();
const end = new THREE.Vector3();
export const BONE_TELL = 0.8;
export const MARROW_RANGE = 9;
export const MARROW_HEAL = 0.14;

// Marks and their short-lived teeth belong to the caster, so death cancels
// unspent eruptions. Exhaustion skips an impact rather than hiding its tell.
function tooth(e, ctx, x, z, delay, radius, damage) {
  if (Math.abs(x) > 21 || Math.abs(z) > 21) return;
  const mark = ctx.effects.markAcquire();
  if (mark < 0) return;
  e.boneFx = ctx.effects;
  if (!e.boneTeeth) e.boneTeeth = [];
  const mesh = new THREE.Mesh(geo('boneEruption', spike(0.32, 2.2, 5)), SHARED_MATS.boneIvory);
  mesh.visible = false;
  mesh.position.set(x, 1.1, z);
  ctx.effects.scene.add(mesh);
  e.boneTeeth.push({ x, z, delay, radius, damage, mark, mesh, t: 0, spent: false });
  ctx.effects.markSet(mark, x, z, radius, MARROW, 0);
}

function tickTeeth(e, a) {
  const teeth = e.boneTeeth;
  if (!teeth) return;
  const ctx = a.ctx;
  for (let i = teeth.length - 1; i >= 0; i--) {
    const t = teeth[i];
    t.t += a.dt;
    if (!t.spent && t.t >= t.delay) {
      t.spent = true;
      ctx.effects.markRelease(t.mark);
      t.mark = -1;
      t.mesh.visible = true;
      const p = ctx.player.pos;
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      // Teeth come out of the floor; a walkway and solid cover are answers.
      if (d < t.radius && p.y < 2.2 && !segBlocked(t.x, 0.3, t.z, p.x, p.y + 0.8, p.z, ctx.obstacles)) {
        at.set(t.x, 0, t.z);
        ctx.onHitPlayer(t.damage * (1 - 0.45 * d / t.radius), at, e);
      }
      at.set(t.x, 0.2, t.z);
      ctx.effects.burst(at, IVORY, 10, 3, 2.5, 0.4);
      ctx.effects.shockwave(at, MARROW, t.radius, 0.3);
    }
    if (!t.spent) ctx.effects.markSet(t.mark, t.x, t.z, t.radius, MARROW, t.t / t.delay);
    else {
      t.mesh.scale.y = Math.max(0, 1 - (t.t - t.delay) / 0.4);
      t.mesh.position.y = 1.1 * t.mesh.scale.y;
      if (t.t >= t.delay + 0.4) {
        t.mesh.removeFromParent();
        teeth.splice(i, 1);
      }
    }
  }
}

export function cleanupBone(e) {
  for (const t of e.boneTeeth || []) {
    if (t.mark >= 0) e.boneFx.markRelease(t.mark);
    t.mesh.removeFromParent();
  }
  if (e.boneTeeth) e.boneTeeth.length = 0;
  if (e.boneLane >= 0 && e.boneFx) e.boneFx.markRelease(e.boneLane);
  e.boneLane = undefined;
  e.marrowTarget = null;
}

function lane(e, a, length, width, fill) {
  const fx = a.ctx.effects;
  e.boneFx = fx;
  // Try once per tell. A slot freed on its last frame cannot buy an attack
  // whose warning the player only saw for that last frame.
  if (e.boneLane === undefined) e.boneLane = fx.markAcquire();
  fx.markSet(e.boneLane, e.pos.x + e.boneDX * length / 2, e.pos.z + e.boneDZ * length / 2,
    width, MARROW, fill, length / (width * 2), Math.atan2(-e.boneDX, -e.boneDZ));
}

function releaseLane(e) {
  if (e.boneLane >= 0) e.boneFx.markRelease(e.boneLane);
  e.boneLane = undefined;
}

function face(e) {
  e.faceLocked = true;
  e.group.rotation.y = Math.atan2(-e.boneDX, -e.boneDZ);
}

function chargeSpeed(e, a, multiplier, cap, remaining) {
  // Cap the unmodified stride, then retain slows. Capping the final speed
  // would make a late-wave charge immune to Cryo and Absolute Zero.
  const slow = Math.min(1, a.sp / Math.max(0.001, e.speed));
  const frame = Math.max(0, Math.min(1, (remaining + a.dt) / a.dt));
  return Math.min(cap, e.speed * multiplier) * slow * frame;
}

export function aiKnuckler(e, a) {
  e.stepMul = 1.4;
  const state = e.boneState || 'chase';
  if (state === 'chase') {
    a.vx = a.px * a.sp;
    a.vz = a.pz * a.sp;
    if (a.dist < 6 && e.attackCd <= 0) {
      e.boneState = 'coil';
      e.boneT = 0.55;
      e.boneDX = a.nx;
      e.boneDZ = a.nz;
      e._setEyeAlert(true);
    }
    return;
  }
  e.boneT -= a.dt;
  face(e);
  e.boneCore.scale.y = e.scale * (state === 'coil' ? 0.5 : 1);
  if (state === 'coil') {
    lane(e, a, 6, 1.6, 1 - Math.max(0, e.boneT) / 0.55);
    if (e.boneT <= 0) {
      // No warning slot means no charge. The crawler retries after recovery.
      e.boneState = e.boneLane >= 0 ? 'lunge' : 'recover';
      e.boneT = 0.55;
      e.boneHit = false;
      releaseLane(e);
    }
  } else if (state === 'lunge') {
    e.stepMul = 3;
    // Travel plus bite reach must fit the six-metre warning at every wave.
    const speed = chargeSpeed(e, a, 2.8, 8, e.boneT);
    a.vx = e.boneDX * speed;
    a.vz = e.boneDZ * speed;
    if (!e.boneHit && a.dist < 1.6 && a.nx * e.boneDX + a.nz * e.boneDZ > 0 && Math.abs(a.ctx.player.pos.y - e.pos.y) < 1.8 &&
        !segBlocked(e.pos.x, e.pos.y + 0.5, e.pos.z, a.ctx.player.pos.x, a.ctx.player.pos.y + 0.8, a.ctx.player.pos.z, a.ctx.obstacles)) {
      landHit(e, a.ctx);
      e.boneHit = true;
    }
    if (e.boneT <= 0 || e.blockedBy > 0.05) { e.boneState = 'recover'; e.boneT = 0.75; }
  } else if (e.boneT <= 0) {
    e.boneState = 'chase';
    e.attackCd = 1.5;
    e._setEyeAlert(false);
  }
}

export function aiRibshot(e, a) {
  orbit(e, a, circle);
  if (e.ribTell > 0) {
    a.vx = a.vz = 0;
    e.ribTell -= a.dt;
    for (const r of e.boneRibs) r.position.z = (-0.04 + (1 - Math.max(0, e.ribTell) / BONE_TELL) * 0.2) * e.scale;
    if (e.ribTell <= 0) {
      for (let i = -2; i <= 2; i++) a.ctx.addProjectile(e.pos.x, e.pos.y + 1, e.pos.z, e.type, e._projScale(), i * 0.13);
      e.ribReload = 1.15;
      e._setEyeAlert(false);
    }
  } else if (e.ribReload > 0) e.ribReload -= a.dt;
  else if (e.attackCd <= 0 && a.dist < 21) {
    e.ribTell = BONE_TELL;
    e.attackCd = 3.2;
    e._setEyeAlert(true);
  }
  for (const r of e.boneRibs) r.visible = !(e.ribReload > 0);
  e.boneCore.scale.x = e.scale * (e.ribReload > 0 ? 1.8 : 1);
}

// The lowest health ever seen owns the plates. Healing can mend the bar but
// cannot sell the player the same shell twice.
function shed(e, a) {
  const tier = e.hp <= e.maxHp * 0.33 ? 2 : e.hp <= e.maxHp * 0.66 ? 1 : 0;
  if (tier <= (e.boneShed || 0)) return;
  e.boneShed = tier;
  e.bonePlates.forEach((p, i) => { p.visible = i >= tier; });
  at.set(e.pos.x, e.pos.y + e.scale, e.pos.z);
  a.ctx.effects.burst(at, IVORY, 16, 4, 2, 0.5);
}

export function ribguardArmor(e, dx, dz) {
  const front = dx * Math.sin(e.group.rotation.y) + dz * Math.cos(e.group.rotation.y);
  return front > 0.35 ? [0.5, 0.75, 1][e.boneShed || 0] : 1;
}

export function aiRibguard(e, a) {
  shed(e, a);
  aiMelee(e, a);
}

function spine(e, a, fork = false) {
  const p = a.ctx.player.pos;
  const dx = a.nx, dz = a.nz;
  // Snapshot the lane. The next tooth never reads the player's new position.
  for (let i = -1; i <= 1; i++) {
    tooth(e, a.ctx, p.x + dx * i * 2.3, p.z + dz * i * 2.3,
      BONE_TELL + (i + 1) * 0.22, 1.2, Math.min(e.boss ? 26 : 22, e.damage));
  }
  if (fork) for (const side of [-1, 1]) {
    tooth(e, a.ctx, p.x + dx * 2.3 - dz * side * 2.8, p.z + dz * 2.3 + dx * side * 2.8,
      BONE_TELL + 0.66, 1.2, Math.min(26, e.damage));
  }
}

export function aiOssuary(e, a) {
  tickTeeth(e, a);
  orbit(e, a, circle);
  if (e.boneTeeth?.length) { a.vx = a.vz = 0; return; }
  if (e.attackCd <= 0 && a.dist < 22) {
    spine(e, a);
    e.attackCd = 4.6;
  }
  e.boneCore.scale.y = e.scale * (1 + Math.max(0, 1 - e.attackCd) * 0.4);
}

function canMend(e, o, ctx) {
  return o && o !== e && !o.dead && !o.boss && o.type !== 'marrow' && o.hp < o.maxHp &&
    Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) <= MARROW_RANGE &&
    !segBlocked(e.pos.x, e.pos.y + 1.1, e.pos.z, o.pos.x, o.pos.y + 0.8, o.pos.z, ctx.obstacles);
}

export function aiMarrow(e, a) {
  orbit(e, a, circle);
  const ctx = a.ctx;
  if (e.marrowTarget) {
    const o = e.marrowTarget;
    // A real hit breaks the cast; a lost target also spends the cooldown.
    if (!canMend(e, o, ctx) || e.hp < e.marrowHp) {
      e.marrowTarget = null;
      e.attackCd = 3.8;
      e._setEyeAlert(false);
      return;
    }
    a.vx = a.vz = 0;
    e.marrowT -= a.dt;
    e.marrowBeam = (e.marrowBeam || 0) - a.dt;
    if (e.marrowBeam <= 0) {
      e.marrowBeam = 0.12;
      at.set(e.pos.x, e.pos.y + 1.1, e.pos.z);
      end.set(o.pos.x, o.pos.y + 0.8, o.pos.z);
      ctx.effects.beam(at, end, MARROW);
    }
    if (e.marrowT <= 0) {
      o.hp = Math.min(o.maxHp, o.hp + o.maxHp * MARROW_HEAL);
      e.marrowTarget = null;
      e.attackCd = 4.5;
      e._setEyeAlert(false);
      ctx.effects.burst(end.set(o.pos.x, o.pos.y + 0.8, o.pos.z), MARROW, 12, 2, 1, 0.5);
    }
  } else if (e.attackCd <= 0) {
    let target = null;
    for (const o of ctx.enemies) if (canMend(e, o, ctx) && (!target || o.hp / o.maxHp < target.hp / target.maxHp)) target = o;
    if (target) {
      e.marrowTarget = target;
      e.marrowT = 1.2;
      e.marrowHp = e.hp;
      e._setEyeAlert(true);
    }
  }
}

export function aiSkullwing(e, a) {
  e.stepMul = 1.4;
  tickTeeth(e, a);
  const state = e.boneState || 'orbit';
  for (let i = 0; i < e.boneWings.length; i++) e.boneWings[i].rotation.x = Math.sin(a.ctx.time * 5) * 0.18;
  if (state === 'orbit') {
    orbit(e, a, wingCircle);
    if (e.attackCd <= 0 && a.dist < 12) {
      e.boneState = 'tell';
      e.boneT = 0.8;
      e.boneDX = a.nx;
      e.boneDZ = a.nz;
      e._setEyeAlert(true);
    }
    return;
  }
  e.boneT -= a.dt;
  face(e);
  if (state === 'tell') {
    e.hoverY = 2.4;
    if (e.boneT <= 0) {
      e.boneState = 'sweep';
      e.boneT = 1.8;
      e.toothCd = 0;
      e.toothN = 0;
    }
  } else if (state === 'sweep') {
    a.vx = e.boneDX * a.sp * 1.4;
    a.vz = e.boneDZ * a.sp * 1.4;
    e.stepMul = 1.5;
    e.toothCd -= a.dt;
    if (e.toothCd <= 0 && e.toothN < 3) {
      e.toothN++;
      e.toothCd = 0.55;
      tooth(e, a.ctx, e.pos.x, e.pos.z, 0.85, 1.25, Math.min(20, e.damage));
    }
    if (e.boneT <= 0) {
      e.boneState = 'recover';
      e.boneT = 1.3;
      e._setEyeAlert(false);
    }
  } else {
    e.hoverY = 3.2;
    a.vx = -e.boneDX * a.sp * 0.35;
    a.vz = -e.boneDZ * a.sp * 0.35;
    if (e.boneT <= 0) { e.boneState = 'orbit'; e.attackCd = 3.5; }
  }
}

export function ossarchArmor(e) {
  return e.bs.weakOpen ? 1 : [0.55, 0.75, 1][e.boneShed || 0];
}

function ossarchRest(e, a) {
  releaseLane(e);
  e.bs.state = 'recover';
  e.bs.t = 1.6;
  e.bs.weakOpen = true;
  e._setEyeAlert(false);
  a.ctx.bossEvent('vent', e);
}

export function aiOssarch(e, a) {
  e.stepMul = 1.4;
  const bs = e.bs, ctx = a.ctx;
  if (bs.state === undefined) { bs.state = 'walk'; bs.t = 2; bs.attack = 0; bs.ventNote = 'MARROW EXPOSED'; }
  shed(e, a);
  if (e.status.fear > 0) {
    cleanupBone(e);
    ossarchRest(e, a);
    return;
  }
  tickTeeth(e, a);
  bs.t -= a.dt;
  e.boneCore.scale.setScalar(e.scale * (bs.weakOpen ? 1.7 : 1));
  e.boneRibs.forEach((r, i) => { r.position.x = (i % 2 ? 1 : -1) * (bs.weakOpen ? 0.22 : 0.08) * e.scale; });
  e.boneJaw.position.y = (bs.state === 'jawTell' || bs.state === 'charge' ? 1.35 : 1.58) * e.scale;

  // Contact is suppressed in recovery: the exposed window is safe to use.
  if (bs.state !== 'recover' && bs.state !== 'charge') bossTouch(e, a);
  if (bs.state === 'walk') {
    a.vx = a.px * a.sp;
    a.vz = a.pz * a.sp;
    if (bs.t > 0) return;
    const attack = bs.attack++ % 3;
    e._setEyeAlert(true);
    if (attack === 0) { bs.state = 'ribs'; bs.t = 0.85; }
    else if (attack === 1) {
      bs.state = 'spine'; bs.t = 1.9;
      spine(e, a, (e.boneShed || 0) > 0);
    } else {
      bs.state = 'jawTell'; bs.t = 0.9;
      e.boneDX = a.nx; e.boneDZ = a.nz;
      ctx.bossEvent('charge', e);
    }
  } else if (bs.state === 'ribs') {
    e.boneCore.scale.y = e.scale * (1 + 0.8 * (1 - Math.max(0, bs.t) / 0.85));
    if (bs.t <= 0) {
      // Two missing ribs leave a broad escape sector; all other bearings
      // carry small, cover-blocked rounds. Later shells tighten the spacing.
      const n = (e.boneShed || 0) === 2 ? 14 : 12;
      for (let i = 0; i < n - 2; i++) ctx.addProjectile(e.pos.x, e.pos.y + 1.5, e.pos.z, e.type, e._projScale(), i * Math.PI * 2 / n);
      ossarchRest(e, a);
    }
  } else if (bs.state === 'spine') {
    if (bs.t <= 0) ossarchRest(e, a);
  } else if (bs.state === 'jawTell') {
    face(e);
    lane(e, a, 12, 2.7, 1 - Math.max(0, bs.t) / 0.9);
    if (bs.t <= 0) {
      if (e.boneLane < 0) { ossarchRest(e, a); return; }
      releaseLane(e);
      bs.state = 'charge'; bs.t = 0.9; bs.hit = false;
    }
  } else if (bs.state === 'charge') {
    face(e);
    e.stepMul = 5;
    const speed = chargeSpeed(e, a, 4.5, 10, bs.t);
    a.vx = e.boneDX * speed;
    a.vz = e.boneDZ * speed;
    if (!bs.hit && a.dist < 2.7 && a.nx * e.boneDX + a.nz * e.boneDZ > 0 && ctx.player.pos.y < 3.6 &&
        !segBlocked(e.pos.x, 1.4, e.pos.z, ctx.player.pos.x, ctx.player.pos.y + 0.8, ctx.player.pos.z, ctx.obstacles)) {
      ctx.onHitPlayer(Math.min(32, e.damage), e.pos, e);
      bs.hit = true;
    }
    if (bs.t <= 0 || e.blockedBy > 0.05) ossarchRest(e, a);
  } else if (bs.t <= 0) {
    bs.weakOpen = false;
    bs.state = 'walk';
    bs.t = 1.5 * e.rate;
    ctx.bossEvent('vent', e);
  }
}

const TYPES = {
  knuckler: {
    head: { r: 0.27, y: 0.8 },
    hp: 36, speed: 3.2, damage: 9, value: 200, color: IVORY, eye: MARROW,
    scale: 1, radius: 0.46, mass: 1,
    build: buildKnuckler, ai: aiKnuckler, cleanup: cleanupBone,
  },
  ribshot: {
    head: { r: 0.28, y: 1.45 },
    hp: 26, speed: 2.3, damage: 8, value: 260, color: IVORY, eye: MARROW,
    scale: 1, radius: 0.48, mass: 1, orbit: circle,
    proj: { core: IVORY, glow: MARROW, scale: 0.5, speed: [16, 0.3, 24], dmg: [5, 0.25, 10] },
    armor: (e) => e.ribReload > 0 ? 1.4 : 1,
    armorDefault: (e) => e.ribReload > 0 ? 1.4 : 1,
    build: buildRibshot, ai: aiRibshot,
  },
  ribguard: {
    head: { r: 0.32, y: 1.5 },
    hp: 135, speed: 1.55, damage: 20, value: 310, color: IVORY, eye: MARROW,
    scale: 1.45, radius: 0.65, mass: 2,
    melee: { windup: 0.8, start: 2.8, hit: 3.4, cd: 2.4 },
    armor: ribguardArmor, armorDefault: 1,
    build: buildRibguard, ai: aiRibguard,
  },
  ossuary: {
    head: { r: 0.28, y: 0.65 },
    hp: 44, speed: 1.85, damage: 14, value: 280, color: IVORY, eye: MARROW,
    scale: 1.1, radius: 0.55, mass: 1, orbit: circle,
    build: buildOssuary, ai: aiOssuary, cleanup: cleanupBone,
  },
  marrow: {
    head: { r: 0.28, y: 1.6 },
    hp: 62, speed: 2.1, damage: 0, value: 340, color: IVORY, eye: MARROW,
    scale: 1.1, radius: 0.5, mass: 1, orbit: circle,
    build: buildMarrow, ai: aiMarrow, cleanup: cleanupBone,
  },
  skullwing: {
    head: { r: 0.3, y: 0.7 },
    hp: 52, speed: 3.8, damage: 12, value: 300, color: IVORY, eye: MARROW,
    scale: 1.1, radius: 0.5, mass: 1,
    fly: { height: 3.2 }, hitbox: { r: 0.6, y: 0.55 }, orbit: circle,
    build: buildSkullwing, ai: aiSkullwing, cleanup: cleanupBone,
  },
  ossarch: {
    name: 'OSSARCH',
    head: { r: 0.4, y: 1.8 },
    hp: 3200, speed: 2.2, damage: 26, value: 6000, color: IVORY, eye: MARROW,
    scale: 2.6, radius: 1.7, mass: 8, boss: true,
    hitbox: { r: 0.75, y: 1 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1,
    entropyExempt: true, fearMode: 'stagger',
    proj: { core: IVORY, glow: MARROW, scale: 0.55, speed: [12, 0.2, 18], dmg: [7, 0.3, 14] },
    armor: ossarchArmor, armorDefault: ossarchArmor,
    build: buildOssarch, ai: aiOssarch, cleanup: cleanupBone,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
