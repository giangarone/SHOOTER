import * as THREE from 'three';
import { ENEMY_TYPES, SHARED_MATS, partsFor, lump, slab, prism, spike, eyes, orbit, landHit, segBlocked, addWarnedMortar, capturedShot, contactReach, snapAim, faceSnap, markGet, markDrop, bossTouch } from './shared.js';

const COLOR = 0xbaffdc;
const body = { color: 0x985d91, eye: COLOR, scale: 1, radius: 0.5, mass: 1 };
const shot = { core: COLOR, glow: 0x985d91, scale: 0.5, speed: [16, 0.2, 22], dmg: [7, 0.25, 13] };
const TYPES = {
  buttonling: { ...body, hp: 36, speed: 3.3, damage: 8, value: 130,
    head: { r: 0.3, y: 0.9 },
    build: buildRusher, ai: aiRusher, cleanup: markDrop },
  gillspitter: { ...body, hp: 26, speed: 2.4, damage: 9, value: 260,
    head: { r: 0.3, y: 1.3 },
    proj: shot,
    build: buildGunner, ai: aiGunner, cleanup: markDrop },
  bracketback: { ...body, hp: 145, speed: 1.6, damage: 18, value: 320,
    head: { r: 0.3, y: 0.85 },
    scale: 1.4, radius: 0.7, mass: 2,
    armor: (e) => e.state === 'tell' ? 0.6 : 1,
    armorDefault: (e) => e.state === 'tell' ? 0.6 : 1,
    build: buildBrute, ai: aiBrute, cleanup: markDrop },
  puffmortar: { ...body, hp: 44, speed: 1.9, damage: 10, value: 270,
    head: { r: 0.3, y: 0.8 },
    build: buildArtillery, ai: aiArtillery, cleanup: markDrop },
  mycelarch: { ...body, hp: 62, speed: 2.1, damage: 0, value: 350,
    head: { r: 0.3, y: 1.5 },
    build: buildSupport, ai: aiSupport, cleanup: markDrop },
  veilray: { ...body, hp: 52, speed: 3.8, damage: 9, value: 300,
    head: { r: 0.3, y: 0.5 },
    proj: shot,
    fly: { height: 3.5 }, hitbox: { r: 0.6, y: 0.4 },
    build: buildFlier, ai: aiFlier, cleanup: markDrop },
  sporeregent: { ...body, hp: 3200, speed: 2.5, damage: 24, value: 6500,
    head: { r: 0.3, y: 1.55 },
    proj: shot,
    name: 'THE SPORE REGENT', boss: true, scale: 2.6, radius: 1.7, mass: 9,
    hitbox: { r: 0.9, y: 0.9 }, statusMul: 0.3, freezeSlow: true,
    slowFactor: 0.75, freezeVuln: 1, entropyExempt: true, fearMode: 'stagger',
    armor: (e) => e.bs.weakOpen ? 1 : 0.65,
    armorDefault: (e) => e.bs.weakOpen ? 1 : 0.65,
    build: buildBoss, ai: aiBoss, cleanup: markDrop },
};
Object.assign(ENEMY_TYPES, TYPES);

// Broad wine-coloured caps, pale radial gills and dark woody feet. The caps
// use one cached geometry at different scales, keeping a dense grove cheap.
const ORBIT = { dist: 11, band: 2, out: 0.8, in: -0.7, strafe: 0.4, flip: 2, flipVar: 1 };
const at = new THREE.Vector3();
function cap(P, x, y, z, r) {
  const top = P('fgCap', prism(0.12, 0.6, 0.28, 9), { x, y, z, s: r });
  P('fgLip', prism(0.6, 0.52, 0.08, 9), { x, y: y - 0.16 * r, z, s: r, mat: SHARED_MATS.fungalRind });
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    P('fgGill', slab(0.035, 0.035, 0.36), { x: x + Math.sin(a) * r * 0.3,
      y: y - 0.21 * r, z: z + Math.cos(a) * r * 0.3, ry: a, s: r,
      mat: SHARED_MATS.fungalGills, shadow: false });
  }
  for (const side of [-1, 1]) P('fgSpot', lump(0.075),
    { x: x + side * r * 0.25, y: y + 0.07 * r, z, s: r, sy: 0.3, mat: SHARED_MATS.fungalGills });
  return top;
}
function roots(P, radius, count = 4) {
  for (let i = 0; i < count; i++) {
    const a = i * Math.PI * 2 / count;
    P('fgRoot', spike(0.1, 0.8, 5), { x: Math.sin(a) * radius, y: 0.22,
      z: Math.cos(a) * radius, rz: Math.cos(a) * 0.9, rx: Math.sin(a) * 0.9, mat: SHARED_MATS.fungalRind });
  }
}
function buildRusher(e, g, s) {
  const P = partsFor(e, g, s);
  P('fgButtonStem', prism(0.22, 0.3, 0.65, 6), { y: 0.45 });
  e.cap = cap(P, 0, 1.0, 0, 1.05); roots(P, 0.3);
  eyes(P, { y: 0.9, z: -0.32, mat: e.eyeMat });
}
function buildGunner(e, g, s) {
  const P = partsFor(e, g, s);
  P('fgSpitterStem', prism(0.13, 0.28, 1.5, 5), { y: 0.85 });
  cap(P, 0, 1.7, 0.08, 0.8);
  for (const x of [-0.28, 0.28]) {
    P('fgTrumpet', prism(0.19, 0.07, 0.55, 7), { x, y: 1.2, z: -0.28, rx: -Math.PI / 2 });
    P('fgMuzzle', prism(0.14, 0.14, 0.03, 7), { x, y: 1.2, z: -0.57, rx: Math.PI / 2, mat: e.eyeMat });
  }
  roots(P, 0.25); eyes(P, { y: 1.3, z: -0.2, mat: e.eyeMat });
}
function buildBrute(e, g, s) {
  const P = partsFor(e, g, s);
  P('fgLog', prism(0.35, 0.5, 1.0, 7), { y: 0.6, mat: SHARED_MATS.fungalRind });
  for (let i = 0; i < 3; i++) cap(P, (i % 2 ? -1 : 1) * 0.15, 0.7 + i * 0.32, 0.1, 1.4 - i * 0.2);
  roots(P, 0.55, 6); eyes(P, { y: 0.85, z: -0.48, x: 0.23, r: 1.3, mat: e.eyeMat });
}
function buildArtillery(e, g, s) {
  const P = partsFor(e, g, s);
  e.sack = P('fgPuff', lump(0.52), { y: 0.65, sy: 1.25 });
  P('fgPuffMouth', prism(0.21, 0.12, 0.2, 7), { y: 1.25, mat: e.eyeMat });
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    cap(P, Math.cos(a) * 0.43, 0.4, Math.sin(a) * 0.43, 0.4);
  }
  roots(P, 0.4); eyes(P, { y: 0.8, z: -0.49, mat: e.eyeMat });
}
function buildSupport(e, g, s) {
  const P = partsFor(e, g, s);
  for (const x of [-0.3, 0.3]) {
    P('fgArch', prism(0.09, 0.18, 1.4, 5), { x, y: 0.7, rz: x * 0.5, mat: SHARED_MATS.fungalRind });
    cap(P, x, 1.65, 0, 0.8);
  }
  e.heart = P('fgHeart', lump(0.23), { y: 1.2, sy: 1.7, mat: SHARED_MATS.fungalGills });
  roots(P, 0.5, 6); eyes(P, { y: 1.5, z: -0.15, mat: e.eyeMat });
}
function buildFlier(e, g, s) {
  const P = partsFor(e, g, s);
  e.cap = cap(P, 0, 0.7, 0, 1.4);
  P('fgRayBody', lump(0.3), { y: 0.35, sz: 1.6 });
  e.tendrils = [];
  for (let i = 0; i < 5; i++) e.tendrils.push(P('fgVeil', spike(0.055, 0.85, 4),
    { x: (i - 2) * 0.2, y: -0.05, z: 0.15, rx: Math.PI, mat: SHARED_MATS.fungalGills }));
  eyes(P, { y: 0.5, z: -0.37, r: 1.2, mat: e.eyeMat });
}
function buildBoss(e, g, s) {
  const P = partsFor(e, g, s);
  P('fgRegentTrunk', prism(0.45, 0.7, 1.5, 8), { y: 0.8, mat: SHARED_MATS.fungalRind });
  e.crown = cap(P, 0, 2.0, 0, 2.2);
  for (const x of [-0.72, 0.72]) {
    P('fgRegentArm', prism(0.17, 0.24, 1.25, 6), { x, y: 0.85, rz: -x * 0.6 });
    cap(P, x, 1.25, 0.1, 1.1);
    P('fgCrownStem', prism(0.08, 0.12, 0.55, 5), { x: x * 0.8, y: 2.1, z: 0.15, mat: SHARED_MATS.fungalRind });
    cap(P, x * 0.8, 2.35, 0.15, 0.75);
  }
  P('fgCrownStem', prism(0.08, 0.12, 0.55, 5), { y: 2.4, z: 0.15, mat: SHARED_MATS.fungalRind });
  cap(P, 0, 2.65, 0.15, 0.85);
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7;
    P('fgRootSeam', slab(0.035, 0.65, 0.035), { x: Math.cos(angle) * 0.57,
      y: 0.55, z: Math.sin(angle) * 0.57, rz: Math.cos(angle) * 0.22,
      mat: SHARED_MATS.fungalGills, shadow: false });
  }
  e.heart = P('fgRegentHeart', lump(0.28), { y: 1.15, z: -0.57, sy: 1.4, mat: e.eyeMat });
  e.shutters = [-1, 1].map((side) => P('fgRegentShutter', slab(0.25, 0.7, 0.16),
    { x: side * 0.14, y: 1.15, z: -0.75, mat: SHARED_MATS.fungalRind }));
  // The puffball sacs on the chest. They are the regent's magazine: they
  // swell while a sporeburst or a nova is coaxed up, so the model itself says
  // which kind of volley is being loaded before anything is on the floor.
  e.sacs = [-0.5, 0, 0.5].map((x) => P('fgRegentSac', lump(0.2),
    { x, y: 1.78, z: -0.62, mat: SHARED_MATS.fungalGills }));
  roots(P, 0.85, 8);
  eyes(P, { y: 1.55, z: -0.5, x: 0.25, r: 1.6, mat: e.eyeMat });
}
// The aim/warn/touch/fire machinery is shared.js's: snapAim, faceSnap, markGet,
// markDrop, capturedShot, contactReach. Brought there so the SIXTEEN themes
// that ask for a wind-up cannot each grow their own half-copy of it - the
// release-on-every-path line in particular.
function warning(e, a, radius, progress) {
  const mark = markGet(e, a.ctx.effects);
  e.fx.markSet(mark, e.pos.x, e.pos.z, radius, COLOR, progress);
}
function pulse(e, a, radius) {
  at.set(e.pos.x, e.pos.y + 0.3, e.pos.z);
  a.ctx.effects.shockwave(at, COLOR, radius, 0.4);
}
function aiRusher(e, a) {
  e.timer = (e.timer || 0) - a.dt;
  e.cap.position.y = (1 + (e.state === 'tell' ? 0.18 * Math.sin(e.timer * 12) : 0)) * e.scale;
  if (e.state === 'tell') {
    warning(e, a, 2.3, 1 - e.timer / 0.65);
    if (e.timer <= 0) {
      const visible = e.mark >= 0; markDrop(e); pulse(e, a, 2.3);
      if (visible && contactReach(e, a, 2.3, 1.5, 1.5)) landHit(e, a.ctx);
      e.state = 'rest'; e.timer = 1.2; e._setEyeAlert(false);
    }
    return;
  }
  if (e.timer > 0) return;
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (a.dist < 2.8) { e.state = 'tell'; e.timer = 0.65; e._setEyeAlert(true); }
}
function aiGunner(e, a) {
  if (e.timer > 0) {
    faceSnap(e);
    e.timer -= a.dt;
    if (e.timer <= 0) {
      const n = e.alternate ? 3 : 2;
      for (let i = 0; i < n; i++) capturedShot(e, a, e.aim, (i - (n - 1) / 2) * 0.22, e.boss ? 2.5 : 1.2);
      e.alternate = !e.alternate; e._setEyeAlert(false);
    }
    return;
  }
  orbit(e, a, ORBIT);
  if (e.attackCd <= 0 && a.dist < 22) {
    snapAim(e, a); e.timer = 0.65; e.attackCd = 2.8; e._setEyeAlert(true);
  }
}
function aiBrute(e, a) {
  e.timer = (e.timer || 0) - a.dt;
  if (e.state === 'tell') {
    warning(e, a, 3.5, 1 - e.timer / 0.9);
    if (e.timer <= 0) {
      const visible = e.mark >= 0; markDrop(e); pulse(e, a, 3.5);
      if (visible) {
        if (contactReach(e, a, 3.5, 1.5, 1.5)) landHit(e, a.ctx);
        // Two fruiting bodies follow the stomp, leaving both flanks open.
        for (const side of [-1, 1]) addWarnedMortar(a.ctx, e.pos.x + Math.cos(e.aim) * side * 4,
          e.pos.z + Math.sin(e.aim) * side * 4, 1.5, 1.0, e.damage * 0.6);
      }
      e.state = 'rest'; e.timer = 2; e._setEyeAlert(false);
    }
    return;
  }
  if (e.timer > 0) return;
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (a.dist < 4.2) { snapAim(e, a); e.state = 'tell'; e.timer = 0.9; e._setEyeAlert(true); }
}
function aiArtillery(e, a) {
  orbit(e, a, ORBIT);
  if (e.timer > 0) {
    faceSnap(e);
    a.vx = a.vz = 0; e.timer -= a.dt;
    e.sack.scale.set(e.scale * (1 + 0.3 * (1 - e.timer / 0.8)), e.scale * 1.25, e.scale);
    if (e.timer <= 0) {
      addWarnedMortar(a.ctx, e.tx, e.tz, 1.7, 0.9, e.damage);
      for (const side of [-1, 1]) addWarnedMortar(a.ctx, e.tx + Math.cos(e.aim + side * 0.65) * 3.3,
        e.tz + Math.sin(e.aim + side * 0.65) * 3.3, 1.6, 1.6, e.damage);
      e.sack.scale.set(e.scale, e.scale * 1.25, e.scale); e._setEyeAlert(false);
    }
    return;
  }
  if (e.attackCd <= 0 && a.dist < 24) { snapAim(e, a); e.timer = 0.8; e.attackCd = 4.8; e._setEyeAlert(true); }
}
function aiSupport(e, a) {
  orbit(e, a, ORBIT);
  const valid = (o) => o && o !== e && !o.dead && !o.boss && o.type !== e.type &&
    o.hp < o.maxHp && (o.fungalMended || 0) < o.maxHp * 0.24 && o.pos.distanceToSquared(e.pos) < 64 &&
    !segBlocked(e.pos.x, 1, e.pos.z, o.pos.x, 1, o.pos.z, a.ctx.obstacles);
  if (e.timer > 0) {
    a.vx = a.vz = 0; e.timer -= a.dt;
    if (!valid(e.patient)) { e.timer = 0; e.patient = null; e._setEyeAlert(false); return; }
    a.ctx.effects.beam(e.pos, e.patient.pos, COLOR);
    if (e.timer <= 0) {
      const o = e.patient, heal = Math.min(o.maxHp * 0.08, 12, o.maxHp - o.hp, o.maxHp * 0.24 - (o.fungalMended || 0));
      o.hp += heal; o.fungalMended = (o.fungalMended || 0) + heal;
      pulse(e, a, 2); e.patient = null; e._setEyeAlert(false);
    }
    return;
  }
  if (e.attackCd <= 0) {
    e.patient = a.ctx.enemies.find(valid);
    if (e.patient) { e.timer = 1.2; e.attackCd = 5; e._setEyeAlert(true); }
  }
}
function aiFlier(e, a) {
  e.tendrils.forEach((m, i) => { m.rotation.z = Math.sin(a.ctx.time * 4 + i) * 0.22; });
  if (e.timer > 0) {
    faceSnap(e);
    e.timer -= a.dt;
    if (e.timer <= 0) {
      for (let i = 0; i < 3; i++) addWarnedMortar(a.ctx, e.tx + Math.cos(e.aim) * i * 2.4,
        e.tz + Math.sin(e.aim) * i * 2.4, 1.4, 0.9 + i * 0.35, e.damage);
      e.escape = 1.4; e._setEyeAlert(false);
    }
    return;
  }
  if (e.escape > 0) { e.escape -= a.dt; a.vx = -a.nx * a.sp; a.vz = -a.nz * a.sp; return; }
  orbit(e, a, { ...ORBIT, dist: 6 });
  if (e.attackCd <= 0 && a.dist < 12) { snapAim(e, a); e.timer = 0.9; e.attackCd = 4.8; e._setEyeAlert(true); }
}
// ---- THE SPORE REGENT -------------------------------------------------------
//
// Six attacks off a shuffled deck, a body that hurts to touch AT ALL TIMES,
// and a boss that is never parked: it circles at mid range on the nav
// heading, bears down when the player runs, and half of its attacks move it
// across the arena on purpose. Where the old fight was a corner turret with
// three patterns on a five-second clock, this one breathes down the player's
// neck - an attack every couple of seconds, spore ground left where the
// player was, and a heart that opens only briefly after each one.
//
// The six, and the question each asks:
//
//   ring        a fairy ring around the player's stance WITH the centre
//               filled: standing still is no longer the answer. The gap is
//               always toward the boss - through it, then punish the opening.
//   scourge     a crawling fork of mycelium blooms advancing from the boss
//               WHILE the boss strafes - the attack and the repositioning
//               are one move, and the blooms chase the line the tracer drew.
//   sporeburst  spore shells onto the stance, bursting into lasting clouds.
//               The clouds are the half of the attack that keeps asking.
//   nova        rotating fans of gill-shot, each with a gap; the gap turns
//               between fans, so the dodge has to turn with it.
//   rampage     a lowered-crown sprint down a marked lane, sowing spore
//               pockets in its wake; enraged, it turns and runs a second leg.
//   siphon      a long inhale that drags the player in, then detonates the
//               ring it has been drawing and coughs shells out of the blast.
//
// THE FAIRNESS CONTRACT, held across all six: every patch of floor that will
// hurt is drawn before it hurts (a mortar's fill, or the one held mark),
// escapes are never sealed by an enrage, and the heart opens after EVERY
// attack - shorter than the old 1.8s, but always there to be punished.

// PACING. The old fight attacked every five-plus seconds; this is the gap
// between one attack's recovery ending and the next wind-up. e.rate squeezes
// it on later waves - telegraph lengths below are NOT scaled, because
// warnings are the contract and late waves get more attacks, not faster lies.
const SUB_CD = 1.45;
const SUB_CD_RAGE = 1.0;
// The heart opening after an attack. Deliberately a fixed length: it is the
// player's turn, and a turn that shrank with pressure would stop being one.
const VENT_REST = 1.1;
const TELL_RING = 0.8;
const TELL_SCOURGE = 0.9;
const TELL_BURST = 0.85;
const TELL_NOVA = 0.85;
// The fairy ring. The gap is always centred on the boss's own bearing, wide
// enough to sprint through, never closed by anything.
const RING_R = 4.6;
const RING_GAP = 1.05;
const RING_R2 = 8.8;
// The scourge's arm: first bloom this far out, then one per step.
const SCOURGE_REACH = 2.6;
const SCOURGE_STEP = 2.7;
// The nova. NOVA_GAP is the dead sector at each fan's centre; the centres
// themselves turn by NOVA_OFFSETS between fans, so the safe bearing is a
// different one every half second. Every offset keeps the full fan inside
// |pi - 1.2|, so a player stood directly behind the boss is never clipped by
// a fan meant for the front - the fungal suite pins that corridor down.
const NOVA_STEP = 0.24;
const NOVA_GAP = 0.55;
const NOVA_FAN_CD = 0.5;
const NOVA_OFFSETS = [0, 1.35, -1.15, 0.7];
// The rampage. The lane is drawn full length from the first frame of the
// square-up; the run itself is always CHARGE_TIME of ground covered at
// CHARGE_SPEED, and it ends early on whatever stops the body.
const CHARGE_TELL = 0.75;
const CHARGE_TELL2 = 0.5;
const CHARGE_LEN = 15;
const CHARGE_W = 3.5;
const CHARGE_SPEED = 11.5;
const CHARGE_TIME = 1.4;
const CHARGE_DROPEVERY = 0.16;
const CHARGE_BURST_R = 3.0;
// The siphon. The pull never reaches inside the body: the drag stops at
// arm's length, which is exactly the distance the detonation then asks about.
const SIPHON_TIME = 1.25;
const SIPHON_R = 6.2;
const SIPHON_REACH = 15;
const SIPHON_PULL = 2.1;
// What a landed shell becomes. Drawn at THIS radius by the mortar that
// delivers it, so the warning circle and the cloud agree to the metre.
const SPORE_GROUND = { radius: 2.3, life: 6.5, dps: 13, kind: 'spore' };
const WAKE_POCKET = { radius: 1.5, life: 2.8, dps: 11 };
const STALK_ORBIT = { dist: 10.5, band: 2.5, out: 1.0, in: -0.9, strafe: 0.7, flip: 1.6, flipVar: 0.9 };

// A mortar that LEAVES a cloud. addWarnedMortar owns no `ground` payload, so
// the reserve dance is repeated here with one added argument: reserve-check
// synchronously, or a dry mark pool turns a burst volley into a blind hit.
function sporeMortar(ctx, x, z, damage, delay = 1.9) {
  const h = ctx.effects.markAcquire();
  if (h < 0) return false;
  ctx.effects.markRelease(h);
  ctx.addMortar(x, z, SPORE_GROUND.radius, delay, damage, SPORE_GROUND);
  return true;
}

// What the rampage sows: a short-lived pocket of spores off the wake. Direct
// addHazard, never marked - like every pool in the game, a cloud you can SEE
// is its own warning, and it deals nothing on the frame it appears.
function wakePocket(ctx, x, z) {
  ctx.addHazard(x, z, WAKE_POCKET.radius, WAKE_POCKET.life, WAKE_POCKET.dps, 'spore');
}

// THE DECK. Every cycle deals all six attacks exactly once, in a shuffled
// order, with one rule across the boundary: never the same attack twice in a
// row. The fight's very first attack is always the fairy ring - a sealed,
// self-contained question the player can read while they learn the pace.
// Tests pin `bs.queue` directly to force one attack.
function nextAttack(e) {
  const bs = e.bs;
  if (!bs.queue.length) {
    bs.queue = ['ring', 'scourge', 'sporeburst', 'siphon', 'nova', 'rampage'];
    for (let i = bs.queue.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = bs.queue[i]; bs.queue[i] = bs.queue[j]; bs.queue[j] = t;
    }
    if (bs.turn === 0) {
      bs.queue.splice(bs.queue.indexOf('ring'), 1);
      bs.queue.unshift('ring');
    }
    if (bs.queue[0] === bs.last) bs.queue.push(bs.queue.shift());
    bs.turn++;
  }
  bs.last = bs.queue.shift();
  return bs.last;
}

// The heart opening that pays for every attack. markDrop covers a boss killed
// out of a marked state by a path that forgot its own release; stepMul is put
// back so a charge's lifted clamp cannot leak into the stalk.
function regentRest(e, a, secs = VENT_REST) {
  markDrop(e);
  e.stepMul = 1.4;
  e.state = 'rest'; e.timer = secs;
  e.bs.weakOpen = true; e.bs.ventNote = 'MYCELIUM HEART EXPOSED';
  e._setEyeAlert(false); a.ctx.bossEvent('vent', e);
}

function aiBoss(e, a) {
  const bs = e.bs;
  if (!e.state) { e.state = 'stalk'; e.timer = 0.8; }
  // Field guards, not an init block: the suite constructs this boss by hand
  // and presets e.state, so anything that must exist by the first attack is
  // filled in here on whichever frame happens to be first.
  bs.turn ??= 0; bs.queue ??= []; bs.last ??= '';
  bs.subCd ??= 1.2 * e.rate; bs.raged ??= false;
  // Enrage is a hard edge at half health, announced exactly once.
  bs.enraged = e.hp < e.maxHp * 0.5;
  if (bs.enraged && !bs.raged) {
    bs.raged = true;
    a.ctx.bossEvent('enrage', e);
    at.set(e.pos.x, e.pos.y + 1.4 * e.scale, e.pos.z);
    a.ctx.effects.burst(at, COLOR, 30, 7, 3, 0.8);
    a.ctx.effects.addShake(0.25);
  }
  e.shutters.forEach((m, i) => { m.position.x = (i ? 1 : -1) * (bs.weakOpen ? 0.45 : 0.14) * e.scale; });
  const committed = e.state !== 'stalk' && e.state !== 'rest';
  e.crown.position.y = (2 + (committed ? 0.08 * Math.sin(a.ctx.time * 10) : 0)) * e.scale;
  // The chest sacs swell while a volley is coaxed up - the model says which
  // kind of storm is loading before anything is on the floor.
  const swell = (e.state === 'sporeburst' || e.state === 'novatell')
    ? 1 + 0.55 * (1 - Math.max(0, e.timer) / TELL_BURST) : 1;
  for (const m of e.sacs) m.scale.setScalar(e.scale * swell);
  // The heart gulps while the siphon runs: the pull made visible.
  const gulp = e.state === 'siphon' ? 1 + 0.5 * (1 - Math.max(0, e.timer) / SIPHON_TIME) : 1;
  e.heart.scale.set(e.scale * gulp, e.scale * 1.4 * gulp, e.scale * gulp);
  // TOUCHING IT COSTS, IN EVERY STATE, AT ANY TIME. It is a walking
  // overgrowth, not a turret. The rampage lands through this same touch
  // rather than through a second, larger hit that would double-bill whoever
  // it runs into - one body, one price.
  bossTouch(e, a);
  if (e.status.fear > 0) return;
  e.timer -= a.dt;

  // ---- RAMPAGE --------------------------------------------------------------
  if (e.state === 'squaring') {
    faceSnap(e);
    // The lane is drawn at full length from the first frame so the AREA reads
    // instantly, and fills so the TIMING reads as it goes.
    const mark = markGet(e, a.ctx.effects);
    bs.markOk = e.mark >= 0;
    e.fx.markSet(mark,
      e.pos.x + bs.dx * CHARGE_LEN * 0.5, e.pos.z + bs.dz * CHARGE_LEN * 0.5,
      CHARGE_W * 0.5, COLOR, 1 - Math.max(0, e.timer) / bs.tellLen,
      CHARGE_LEN / CHARGE_W, Math.atan2(-bs.dx, -bs.dz));
    if (e.timer <= 0) {
      markDrop(e);
      e.state = 'charge'; e.timer = CHARGE_TIME; bs.stepT = 0; bs.burst = false;
      // THE STEP CLAMP HAS TO BE LIFTED FOR THE RUN, and set here rather than
      // at the state change so a charge still outruns the player after a slow
      // has moved `sp` underneath it. Put back in regentRest and below.
      e.stepMul = CHARGE_SPEED / Math.max(0.5, a.sp);
      e._setEyeAlert(false);
      a.ctx.bossEvent('charge', e);
      pulse(e, a, 3);
    }
    return;
  }
  if (e.state === 'charge') {
    e.stepMul = CHARGE_SPEED / Math.max(0.5, a.sp);
    a.vx = bs.dx * CHARGE_SPEED; a.vz = bs.dz * CHARGE_SPEED;
    bs.stepT -= a.dt;
    if (bs.stepT <= 0) { bs.stepT = CHARGE_DROPEVERY; wakePocket(a.ctx, e.pos.x, e.pos.z); }
    if (e.timer > 0 && e.blockedBy <= 0.05) return;
    // Full distance, wall or pillar: it bursts on arrival either way.
    const slammed = e.blockedBy > 0.05;
    e.stepMul = 1.4;
    if (!bs.burst) {
      bs.burst = true;
      pulse(e, a, CHARGE_BURST_R);
      at.set(e.pos.x, e.pos.y + 1, e.pos.z);
      a.ctx.effects.burst(at, COLOR, 26, 7, 2.5, 0.6);
      a.ctx.effects.addShake(slammed ? 0.35 : 0.2);
      if (slammed && a.ctx.sfx) a.ctx.sfx.impact();
      // The lane WAS the warning. No drawn lane (a dry mark pool), no blast -
      // the one rule every floor hit in this fight is held to.
      if (bs.markOk && contactReach(e, a, CHARGE_BURST_R, 1.5)) {
        landHit(e, a.ctx, Math.min(22, e.damage * 0.8));
      }
    }
    if (bs.enraged && bs.leg === 1) {
      // Turns on the spot and runs a second leg at the player it just passed.
      bs.leg = 2;
      snapAim(e, a); bs.dx = a.nx; bs.dz = a.nz;
      bs.tellLen = CHARGE_TELL2;
      e.state = 'squaring'; e.timer = CHARGE_TELL2;
      e._setEyeAlert(true);
      return;
    }
    regentRest(e, a, slammed ? 1.5 : VENT_REST);
    return;
  }

  // ---- SIPHON ---------------------------------------------------------------
  if (e.state === 'siphon') {
    faceSnap(e);
    const mark = markGet(e, a.ctx.effects);
    bs.markOk = e.mark >= 0;
    // The ring it will detonate, filling as the inhale builds: the area and
    // the countdown in one drawing.
    e.fx.markSet(mark, e.pos.x, e.pos.z, SIPHON_R, COLOR, 1 - Math.max(0, e.timer) / SIPHON_TIME);
    e._setEyeAlert(true);
    // The drag crescendos and never reaches inside the body - being eaten
    // whole is the touch rule's job, not the wind's.
    if (a.dist > e.radius + 1.6 && a.dist < SIPHON_REACH) {
      a.ctx.pullPlayer(-a.nx, -a.nz, SIPHON_PULL * (0.4 + 0.6 * (1 - Math.max(0, e.timer) / SIPHON_TIME)));
    }
    if (e.timer <= 0) {
      markDrop(e);
      pulse(e, a, SIPHON_R);
      at.set(e.pos.x, e.pos.y + 1.2, e.pos.z);
      a.ctx.effects.burst(at, COLOR, 34, 9, 3, 0.7);
      a.ctx.effects.addShake(0.3);
      if (a.ctx.sfx) a.ctx.sfx.impact();
      if (bs.markOk && contactReach(e, a, SIPHON_R, 1.5)) landHit(e, a.ctx, Math.min(26, e.damage * 0.9));
      // ...and coughs a fan of shells out of the blast, onto where the player
      // was when the inhale started - the pull's own answer for whoever ran.
      const n = bs.enraged ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const ang = e.aim + (i - (n - 1) / 2) * 0.8;
        sporeMortar(a.ctx, e.tx + Math.cos(ang) * i * 2.2, e.tz + Math.sin(ang) * i * 2.2,
          Math.min(20, e.damage * 0.7));
      }
      regentRest(e, a, 1.3);
    }
    return;
  }

  // ---- FAIRY RING ------------------------------------------------------------
  if (e.state === 'ring' || e.state === 'ring2') {
    faceSnap(e);
    if (e.timer > 0) return;
    const dmg = Math.min(24, e.damage * 0.8);
    const outer = e.state === 'ring2';
    const n = outer ? 6 : bs.enraged ? 8 : 6;
    const R = outer ? RING_R2 : RING_R;
    // Petals cover the whole circle bar a gap toward the boss - swung a third
    // of a turn aside on the second ring, so the front door that escaped the
    // first ring walks into this one's petals.
    const start = e.aim + Math.PI + (outer ? 1.1 : 0) + RING_GAP / 2;
    for (let i = 0; i < n; i++) {
      const angle = start + (i + 0.5) * (Math.PI * 2 - RING_GAP) / n;
      addWarnedMortar(a.ctx, e.tx + Math.cos(angle) * R, e.tz + Math.sin(angle) * R,
        outer ? 1.7 : 1.9, (outer ? 0.9 : 0.95) + i * (outer ? 0.08 : 0.07), dmg);
    }
    // ...and the centre is a mushroom too. The old ring's whole escape was
    // standing still; that is now the one spot that is certainly lethal.
    if (!outer) addWarnedMortar(a.ctx, e.tx, e.tz, 1.9, 0.95, dmg);
    pulse(e, a, 4);
    if (bs.enraged && !outer) {
      // The second, wider ring as its own beat, a full breath later - and
      // ONLY once the first ring's last petal has spent its mark. The mortar
      // pool is ten deep: fused, the two rings are fifteen requests and the
      // back half of the outer one would land unwarned.
      e.state = 'ring2'; e.timer = 1.7;
      return;
    }
    regentRest(e, a, outer ? 1.25 : VENT_REST);
    return;
  }

  // ---- SPOREBURST --------------------------------------------------------------
  if (e.state === 'sporeburst') {
    // It keeps drifting while it pitches - the theme's gunner DNA at boss
    // scale. Standing still to throw is the old fight.
    a.vx = a.px * a.sp * 0.35; a.vz = a.pz * a.sp * 0.35;
    faceSnap(e);
    if (e.timer > 0) return;
    const dmg = Math.min(20, e.damage * 0.7);
    const n = bs.enraged ? 5 : 3;
    // One on the stance, the rest clustered around it: the spread is captured
    // ground, not live tracking - walking out is the whole answer.
    sporeMortar(a.ctx, e.tx, e.tz, dmg);
    for (let i = 1; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = (2.8 + Math.random() * 2.4) * (a.dist > 10 ? 1 : 0.6);
      sporeMortar(a.ctx, e.tx + Math.cos(ang) * r, e.tz + Math.sin(ang) * r, dmg, 1.9 + i * 0.12);
    }
    pulse(e, a, 2.5);
    regentRest(e, a);
    return;
  }

  // ---- SCOURGE -----------------------------------------------------------------
  if (e.state === 'scourge') {
    // The boss strafes while the fork advances. The tracer is drawn from the
    // LIVE position along the snapped bearing, so the corridor it previews is
    // the one the blooms actually crawl down.
    a.vx = -a.pz * e.strafe * a.sp * 0.6; a.vz = a.px * e.strafe * a.sp * 0.6;
    faceSnap(e);
    const mark = markGet(e, a.ctx.effects);
    const prog = 1 - Math.max(0, e.timer) / TELL_SCOURGE;
    const d = SCOURGE_REACH + prog * SCOURGE_STEP * 3;
    e.fx.markSet(mark, e.pos.x + Math.cos(e.aim) * d, e.pos.z + Math.sin(e.aim) * d, 1.15, COLOR, prog);
    if (e.timer <= 0) {
      markDrop(e);
      const dmg = Math.min(22, e.damage * 0.75);
      const n = bs.enraged ? 5 : 4;
      for (let i = 0; i < n; i++)
        addWarnedMortar(a.ctx, e.pos.x + Math.cos(e.aim) * (SCOURGE_REACH + i * SCOURGE_STEP),
          e.pos.z + Math.sin(e.aim) * (SCOURGE_REACH + i * SCOURGE_STEP), 1.6, 0.55 + i * 0.22, dmg);
      if (bs.enraged) {
        // A second arm, bent off the first: the trodden line and its flank.
        // Still staggered, still marked - enrage widens the question, it
        // never shortens the warning.
        for (let i = 0; i < 3; i++)
          addWarnedMortar(a.ctx, e.pos.x + Math.cos(e.aim + 0.9) * (SCOURGE_REACH + i * SCOURGE_STEP),
            e.pos.z + Math.sin(e.aim + 0.9) * (SCOURGE_REACH + i * SCOURGE_STEP), 1.6, 0.75 + i * 0.22, dmg);
      }
      pulse(e, a, 3);
      regentRest(e, a);
    }
    return;
  }

  // ---- CAP NOVA ------------------------------------------------------------------
  if (e.state === 'novatell') {
    faceSnap(e);
    const mark = markGet(e, a.ctx.effects);
    e.fx.markSet(mark, e.pos.x, e.pos.z, 3.0, COLOR, 1 - Math.max(0, e.timer) / TELL_NOVA);
    if (e.timer <= 0) { markDrop(e); e.state = 'nova'; e.timer = 0; e.round = 0; }
    return;
  }
  if (e.state === 'nova') {
    faceSnap(e);
    if (e.timer > 0) return;
    // A fan WITH A GAP, not a ring: the dodge is to stand where this fan is
    // not. The centre turns between fans, so the safe bearing is a different
    // one every wave and standing in the first gap stops working.
    const centre = e.aim + NOVA_OFFSETS[e.round % NOVA_OFFSETS.length];
    for (let i = -5; i <= 5; i++) {
      const dA = i * NOVA_STEP;
      if (Math.abs(dA) < NOVA_GAP) continue;
      capturedShot(e, a, centre, dA, e.boss ? 2.5 : 1.2);
    }
    pulse(e, a, 3);
    e.round++;
    e.timer = bs.enraged ? 0.4 : NOVA_FAN_CD;
    if (e.round >= (bs.enraged ? 4 : 3)) regentRest(e, a, 1.2);
    return;
  }

  // ---- the opening ------------------------------------------------------------
  if (e.state === 'rest') {
    if (e.timer > 0) return;
    bs.weakOpen = false; a.ctx.bossEvent('vent', e);
    e.state = 'stalk';
  }

  // STALK. Never parked: inside the band it circles on its own bias, outside
  // it bears down the nav heading. The next attack is dealt on bs.subCd -
  // the clock the whole "every couple of seconds" promise lives on.
  if (a.dist > 13.5) { a.vx = a.px * a.sp; a.vz = a.pz * a.sp; }
  else orbit(e, a, STALK_ORBIT);
  bs.subCd -= a.dt;
  if (bs.subCd > 0 || a.dist > 27) return;
  const attack = nextAttack(e);
  snapAim(e, a);
  e._setEyeAlert(true);
  if (attack === 'rampage') {
    bs.dx = a.nx; bs.dz = a.nz; bs.leg = 1; bs.tellLen = CHARGE_TELL;
    e.state = 'squaring'; e.timer = CHARGE_TELL; e.stepMul = 1.4;
  } else if (attack === 'siphon') {
    e.state = 'siphon'; e.timer = SIPHON_TIME;
  } else if (attack === 'nova') {
    e.state = 'novatell'; e.timer = TELL_NOVA;
  } else {
    e.state = attack;
    e.timer = attack === 'ring' ? TELL_RING : attack === 'scourge' ? TELL_SCOURGE : TELL_BURST;
  }
  bs.subCd = (bs.enraged ? SUB_CD_RAGE : SUB_CD) * e.rate;
}

