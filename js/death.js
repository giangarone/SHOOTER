import * as THREE from 'three';
import { groundSurface } from './utils.js';

const FALL_SECONDS = 0.5;
const REST_SPEED = 0.3;
const EYE_HEIGHT = 0.24;
const NO_EFFECT = () => {};

// Integrate the speed ramp so different frame rates advance the same amount.
function worldElapsed(seconds) {
  const p = Math.min(1, seconds / FALL_SECONDS);
  return FALL_SECONDS * (p - (1 - REST_SPEED) * (p ** 3 - p ** 4 / 2))
    + Math.max(0, seconds - FALL_SECONDS) * REST_SPEED;
}

export class DeathScene {
  constructor(game, reduced) {
    this.game = game;
    this.reduced = reduced;
    this.start = this.last = game.last;
    this.wallTime = 0;
    this.time = game.time;
    this.complete = reduced;
    this.rigState = { ...game._fillRigState() };
    this.from = game.camera.position.clone();
    this.rotation = game.camera.quaternion.clone();
    this.fromFov = game.camera.fov;
    this.toFov = game.player.fovHip;
    const floor = groundSurface(game.player.pos, 0.4, game.arena.obstacles, 0);
    const yaw = game.player.yaw;
    this.to = new THREE.Vector3(game.player.pos.x, floor + EYE_HEIGHT, game.player.pos.z);
    this.toRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(55 * Math.PI / 180, yaw, 0, 'YXZ')
    );
    // A private, stationary target keeps attacks off the real player's state,
    // including bosses that write directly to their target's velocity.
    const pos = new THREE.Vector3(game.player.pos.x, floor, game.player.pos.z);
    this.target = {
      pos, vel: new THREE.Vector3(), yaw, eyeH: EYE_HEIGHT,
      eyeInto: v => v.copy(pos).setY(pos.y + EYE_HEIGHT),
      forwardInto: v => v.set(-Math.sin(yaw), 0, -Math.cos(yaw)),
      hasStatus: () => false,
    };
    this.enemyContext = {
      ...game._enemyCtx, player: this.target, mods: { ...game.player.mods },
      nav: game.nav, navBig: game.navBig,
      onHitPlayer: NO_EFFECT, applyPlayerStatus: NO_EFFECT, pullPlayer: NO_EFFECT,
      blind: NO_EFFECT, blindHud: NO_EFFECT, bossEvent: NO_EFFECT,
      // Existing monsters keep fighting; summoning and wave progression ended
      // with the run, so the background cannot grow while results are open.
      addAnchor: null, addTurret: NO_EFFECT, reanimate: null,
      addProjectile: (x, y, z, type, speed, spread) =>
        game._spawnProjectile(x, y, z, type, speed, spread, this.target),
      addGrenade: (x, y, z, damage) => game._spawnGrenade(x, y, z, damage, this.target),
      addSpit: (x, y, z, kind) => game._spawnSpit(x, y, z, kind, this.target),
      beat: this.rigState.beat, level: this.rigState.level,
      // Player-owned status damage and its rewards ended at defeat.
      pulse: undefined, pulseWhole: false,
    };
    this.projectileContext = {
      ...game._projCtx, player: this.target, onHitPlayer: NO_EFFECT,
      onBlast: NO_EFFECT, onMitosisHit: NO_EFFECT, mitosisTarget: () => null,
    };
  }

  update(now, dt = 0.05) {
    if (this.reduced) return 0;
    const step = Math.max(0, Math.min(dt, 0.05, (now - this.last) / 1000));
    this.last = Math.max(this.last, now);
    this.wallTime = Math.max(this.wallTime, (now - this.start) / 1000);
    const p = Math.min(1, this.wallTime / FALL_SECONDS);
    const ease = p * p * (3 - 2 * p);
    const camera = this.game.camera;
    // The drop accelerates like a fall; the tilt eases into the resting pose.
    camera.position.lerpVectors(this.from, this.to, p * p);
    camera.quaternion.copy(this.rotation).slerp(this.toRotation, ease);
    const fov = this.fromFov + (this.toFov - this.fromFov) * ease;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    this.complete = p === 1;
    return worldElapsed(this.wallTime) - worldElapsed(Math.max(0, this.wallTime - step));
  }

  step(dt) {
    const g = this.game;
    const ctx = this.enemyContext;
    this.time += dt;
    ctx.time = this.time;
    this.target.vel.set(0, 0, 0);
    g.nav.update(dt, this.target.pos.x, this.target.pos.z, this.target.pos.y);
    g.navBig.update(dt, this.target.pos.x, this.target.pos.z, this.target.pos.y);
    const list = g.enemies;
    for (const e of list) {
      e.update(dt, ctx);
      // Leave room around the fallen head instead of walking through the
      // camera. Contact attacks still reach this small resting body.
      if (e.dead || Math.abs(e.pos.y - this.target.pos.y) > 0.7) continue;
      let dx = e.pos.x - this.target.pos.x;
      let dz = e.pos.z - this.target.pos.z;
      let dist = Math.hypot(dx, dz);
      const reach = e.radius + 0.4;
      if (dist >= reach) continue;
      if (dist < 0.001) {
        dx = Math.sin(e.group.rotation.y);
        dz = Math.cos(e.group.rotation.y);
        dist = 1;
      }
      const x = this.target.pos.x + dx / dist * reach;
      const z = this.target.pos.z + dz / dist * reach;
      e.group.position.x += x - e.pos.x;
      e.group.position.z += z - e.pos.z;
      e.pos.x = x;
      e.pos.z = z;
    }
    // Use the normal resource release, without booking kills, drops or money.
    let write = 0;
    for (const e of list) {
      if (e.dead) g._corpse(e);
      else list[write++] = e;
    }
    list.length = write;
    g._updateProjectiles(dt, this.projectileContext);
    g._updateHazard(dt);
    g._updateMortars(dt);
  }
}
