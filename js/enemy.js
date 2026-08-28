import * as THREE from 'three';
import { resolveCircle, pointInObstacle } from './utils.js';

export const ENEMY_TYPES = {
  chaser: { hp: 42, speed: 3.4, damage: 12, score: 100, color: 0xff3b30, eye: 0xffe08a, scale: 1 },
  shooter: { hp: 28, speed: 2.7, damage: 8, score: 150, color: 0xb14aed, eye: 0x4ef3ff, scale: 1.08 },
};

let idSeq = 0;

export class Enemy {
  constructor(type, pos, hpScale, speedScale, dmgScale) {
    const def = ENEMY_TYPES[type];
    this.id = ++idSeq;
    this.type = type;
    this.maxHp = def.hp * hpScale;
    this.hp = this.maxHp;
    this.speed = def.speed * speedScale;
    this.damage = def.damage * dmgScale;
    this.score = def.score;
    this.radius = 0.5;
    this.colorHex = def.color;
    this.eyeBase = def.eye;
    this.pos = pos.clone();
    this.attackCd = 0.8 + Math.random();
    this.windup = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1 + Math.random() * 2;
    this.flash = 0;
    this.dead = false;

    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: def.color, roughness: 0.4, metalness: 0.3,
      emissive: def.color, emissiveIntensity: 0.18,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34 * def.scale, 0.55 * def.scale, 4, 10), this.bodyMat);
    body.position.y = 0.75 * def.scale;
    body.castShadow = true;
    this.group.add(body);

    const eyeMat = new THREE.MeshBasicMaterial({ color: def.eye });
    this.eyes = eyeMat;
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat);
    e1.position.set(-0.13 * def.scale, 1.05 * def.scale, -0.27 * def.scale);
    const e2 = e1.clone();
    e2.position.x *= -1;
    this.group.add(e1, e2);

    if (type === 'shooter') {
      const barrel = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.55),
        new THREE.MeshStandardMaterial({ color: 0x2a2f3d, roughness: 0.4, metalness: 0.6 })
      );
      barrel.position.set(0.22, 0.8, -0.32);
      this.group.add(barrel);
    } else {
      const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 6), this.bodyMat.clone());
      jaw.rotation.x = -Math.PI / 2;
      jaw.position.set(0, 0.68, -0.34);
      this.group.add(jaw);
    }

    this.hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitbox.position.y = 0.8;
    this.hitbox.userData.enemy = this;
    this.group.add(this.hitbox);
    this.group.updateMatrixWorld(true);
  }

  update(dt, ctx) {
    if (this.dead) return;
    const p = ctx.player.pos;
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const nx = dx / Math.max(dist, 0.001);
    const nz = dz / Math.max(dist, 0.001);
    this.attackCd -= dt;

    let vx = 0;
    let vz = 0;
    if (this.type === 'chaser') {
      if (this.windup > 0) {
        this.windup -= dt;
        this.eyes.color.setHex(0xffffff);
        if (this.windup <= 0) {
          this.eyes.color.setHex(this.eyeBase);
          if (dist < 2.2) ctx.onHitPlayer(this.damage, this.pos);
          this.attackCd = 1.1;
        }
      } else {
        this.eyes.color.setHex(this.eyeBase);
        if (dist < 1.5 && this.attackCd <= 0) this.windup = 0.45;
        else {
          vx = nx * this.speed;
          vz = nz * this.speed;
        }
      }
    } else {
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafe *= -1;
        this.strafeT = 1 + Math.random() * 2;
      }
      const desired = 7.5;
      const along = dist > desired + 1.5 ? 1 : dist < desired - 1.5 ? -0.7 : 0;
      vx = nx * this.speed * along + -nz * this.strafe * this.speed * 0.5;
      vz = nz * this.speed * along + nx * this.strafe * this.speed * 0.5;
      if (this.attackCd <= 0 && dist < 18) {
        this.attackCd = 1.6 + Math.random() * 0.6;
        this.flash = 0.12;
        ctx.addProjectile(this.pos.x, 0.95, this.pos.z);
      }
    }

    for (const o of ctx.enemies) {
      if (o === this) continue;
      const ox = this.pos.x - o.pos.x;
      const oz = this.pos.z - o.pos.z;
      const d = Math.hypot(ox, oz);
      if (d < 1.0 && d > 0.001) {
        vx += (ox / d) * 2.2;
        vz += (oz / d) * 2.2;
      }
    }

    const step = Math.hypot(vx, vz);
    const maxStep = this.speed * 1.4;
    if (step > maxStep) {
      vx *= maxStep / step;
      vz *= maxStep / step;
    }
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    const B = 21.6;
    this.pos.x = Math.max(-B, Math.min(B, this.pos.x));
    this.pos.z = Math.max(-B, Math.min(B, this.pos.z));
    resolveCircle(this.pos, this.radius, ctx.obstacles);

    this.group.position.set(this.pos.x, Math.sin(ctx.time * 6 + this.id) * 0.05, this.pos.z);
    this.group.rotation.y = Math.atan2(-dx, -dz);

    if (this.flash > 0) {
      this.flash -= dt;
      this.bodyMat.emissive.setHex(0xffffff);
      this.bodyMat.emissiveIntensity = 0.9;
    } else {
      this.bodyMat.emissive.setHex(this.colorHex);
      this.bodyMat.emissiveIntensity = 0.18;
    }
  }

  takeDamage(d) {
    if (this.dead) return false;
    this.hp -= d;
    this.flash = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return true;
    }
    return false;
  }
}

export class Projectile {
  constructor(scene, glowTex, x, y, z, target, speed, damage) {
    this.pos = new THREE.Vector3(x, y, z);
    this.target = target.clone();
    this.vel = this.target.clone().sub(this.pos).normalize().multiplyScalar(speed);
    this.speed = speed;
    this.damage = damage;
    this.life = 4;
    this._t1 = new THREE.Vector3();

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xd08bff }));
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: 0xb14aed, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    sp.scale.setScalar(0.75);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) return 'expired';
    const d = this._t1.copy(this.target).sub(this.pos).length();
    if (d < 0.7) {
      ctx.onHitPlayer(this.damage, this.pos);
      return 'hit';
    }
    this._t1.copy(this.target).sub(this.pos).normalize().multiplyScalar(this.speed);
    this.vel.lerp(this._t1, Math.min(1, 2.5 * dt));
    this.vel.setLength(this.speed);
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    if (this.pos.y <= 0.03) return 'wall';
    if (pointInObstacle(this.pos, ctx.obstacles)) return 'wall';
    return 'alive';
  }
}