import * as THREE from 'three';
import { resolveCircle, pointInObstacle } from './utils.js';

export const ENEMY_TYPES = {
  chaser: { hp: 42, speed: 3.4, damage: 12, score: 100, color: 0xff3b30, eye: 0xffe08a, scale: 1 },
  shooter: { hp: 28, speed: 2.7, damage: 8, score: 150, color: 0xb14aed, eye: 0x4ef3ff, scale: 1.08 },
  tank: { hp: 180, speed: 1.8, damage: 25, score: 300, color: 0xff6b00, eye: 0xffaa00, scale: 1.5 },
  sniper: { hp: 18, speed: 2.2, damage: 15, score: 200, color: 0x00ff88, eye: 0x88ffcc, scale: 0.9 },
  splitter: { hp: 30, speed: 3.0, damage: 10, score: 120, color: 0xff00aa, eye: 0xff88dd, scale: 1.0 },
  bomber: { hp: 35, speed: 2.0, damage: 18, score: 180, color: 0xff4400, eye: 0xff8844, scale: 1.1 },
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
    } else if (type === 'tank') {
      const shoulderL = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.35, 0.25),
        this.bodyMat.clone()
      );
      shoulderL.position.set(-0.35 * def.scale, 0.95 * def.scale, 0);
      this.group.add(shoulderL);
      const shoulderR = shoulderL.clone();
      shoulderR.position.x *= -1;
      this.group.add(shoulderR);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.7 * def.scale, 0.12, 0.4 * def.scale),
        new THREE.MeshStandardMaterial({ color: 0x3a2515, roughness: 0.5, metalness: 0.6 })
      );
      plate.position.set(0, 0.6 * def.scale, -0.25 * def.scale);
      this.group.add(plate);
    } else if (type === 'sniper') {
      const longBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 0.9, 8),
        new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.3, metalness: 0.8 })
      );
      longBarrel.rotation.x = Math.PI / 2;
      longBarrel.position.set(0, 0.85 * def.scale, -0.6 * def.scale);
      this.group.add(longBarrel);
      const scope = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.2, metalness: 0.9 })
      );
      scope.position.set(0, 0.98 * def.scale, -0.2 * def.scale);
      this.group.add(scope);
      const e1s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
      e1s.position.set(-0.1 * def.scale, 1.1 * def.scale, -0.3 * def.scale);
      const e2s = e1s.clone();
      e2s.position.x *= -1;
      this.group.add(e1s, e2s);
    } else if (type === 'splitter') {
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.12 * def.scale, 0),
        new THREE.MeshStandardMaterial({
          color: def.color, emissive: def.color, emissiveIntensity: 1.2,
          roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.8
        })
      );
      core.position.set(0, 0.85 * def.scale, 0);
      this.coreMesh = core;
      this.group.add(core);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.25 * def.scale, 0.03, 8, 16),
        new THREE.MeshStandardMaterial({ color: def.eye, emissive: def.eye, emissiveIntensity: 0.8 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.6 * def.scale;
      this.ringMesh = ring;
      this.group.add(ring);
    } else if (type === 'bomber') {
      const grenade = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x2a2515, roughness: 0.5, metalness: 0.4 })
      );
      grenade.position.set(0.25 * def.scale, 0.75 * def.scale, -0.25 * def.scale);
      this.group.add(grenade);
      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6),
        new THREE.MeshStandardMaterial({ color: 0xffd600, emissive: 0xffd600, emissiveIntensity: 1.5 })
      );
      pin.position.set(0.25 * def.scale, 0.9 * def.scale, -0.25 * def.scale);
      this.group.add(pin);
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
    } else if (this.type === 'shooter') {
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
    } else if (this.type === 'tank') {
      if (this.windup > 0) {
        this.windup -= dt;
        this.eyes.color.setHex(0xffffff);
        if (this.windup <= 0) {
          this.eyes.color.setHex(this.eyeBase);
          if (dist < 4.0) ctx.onHitPlayer(this.damage, this.pos);
          this.attackCd = 3.0;
        }
      } else {
        this.eyes.color.setHex(this.eyeBase);
        if (dist < 3.5 && this.attackCd <= 0) {
          this.windup = 0.8;
        } else {
          vx = nx * this.speed;
          vz = nz * this.speed;
        }
      }
    } else if (this.type === 'sniper') {
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafe *= -1;
        this.strafeT = 2 + Math.random() * 3;
      }
      const desired = 22;
      const along = dist > desired + 2 ? 0.8 : dist < desired - 2 ? -0.5 : 0;
      vx = nx * this.speed * along + -nz * this.strafe * this.speed * 0.4;
      vz = nz * this.speed * along + nx * this.strafe * this.speed * 0.4;
      if (this.attackCd <= 0 && dist < 35) {
        this.attackCd = 2.0 + Math.random() * 0.5;
        this.flash = 0.1;
        ctx.addProjectile(this.pos.x, 1.1, this.pos.z, 'sniper');
      }
    } else if (this.type === 'splitter') {
      if (this.windup > 0) {
        this.windup -= dt;
        this.eyes.color.setHex(0xffffff);
        if (this.windup <= 0) {
          this.eyes.color.setHex(this.eyeBase);
          if (dist < 2.0) ctx.onHitPlayer(this.damage, this.pos);
          this.attackCd = 1.0;
        }
      } else {
        this.eyes.color.setHex(this.eyeBase);
        if (dist < 1.4 && this.attackCd <= 0) this.windup = 0.4;
        else {
          vx = nx * this.speed;
          vz = nz * this.speed;
        }
      }
      if (this.coreMesh) this.coreMesh.rotation.y += dt * 3;
      if (this.ringMesh) this.ringMesh.rotation.z += dt * 2;
    } else if (this.type === 'bomber') {
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafe *= -1;
        this.strafeT = 2.5 + Math.random() * 2;
      }
      const desired = 10;
      const along = dist > desired + 2 ? 0.6 : dist < desired - 2 ? -0.3 : 0;
      vx = nx * this.speed * along + -nz * this.strafe * this.speed * 0.3;
      vz = nz * this.speed * along + nx * this.strafe * this.speed * 0.3;
      if (this.attackCd <= 0 && dist < 16) {
        this.attackCd = 2.5 + Math.random() * 0.8;
        this.flash = 0.15;
        ctx.addGrenade(this.pos.x, 1.2, this.pos.z, this.damage);
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
    if (this.dead) return { dead: false };
    this.hp -= d;
    this.flash = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return { dead: true, pos: this.pos.clone(), type: this.type };
    }
    return { dead: false };
  }
}

export class Projectile {
  constructor(scene, glowTex, x, y, z, target, speed, damage, type = 'shooter') {
    this.pos = new THREE.Vector3(x, y, z);
    const dir = target.clone().sub(this.pos).normalize();
    this.vel = dir.multiplyScalar(speed);
    this.speed = speed;
    this.damage = damage;
    this.life = 4;
    this.type = type;

    const colors = {
      shooter: { core: 0xd08bff, glow: 0xb14aed },
      sniper: { core: 0x88ffcc, glow: 0x00ff88 },
    };
    const c = colors[type] || colors.shooter;

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: c.core }));
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: c.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    sp.scale.setScalar(type === 'sniper' ? 0.5 : 0.75);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) return 'expired';
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    const playerPos = ctx.player.eyeInto(new THREE.Vector3());
    if (this.pos.distanceTo(playerPos) < 0.7) {
      ctx.onHitPlayer(this.damage, this.pos);
      return 'hit';
    }
    if (this.pos.y <= 0.03) return 'wall';
    if (pointInObstacle(this.pos, ctx.obstacles)) return 'wall';
    return 'alive';
  }
}

export class Grenade {
  constructor(scene, glowTex, x, y, z, target, speed, damage) {
    this.pos = new THREE.Vector3(x, y, z);
    const dir = new THREE.Vector3(target.x - x, 0, target.z - z).normalize();
    this.vel = dir.multiplyScalar(speed * 0.6);
    this.vel.y = 8.5;
    this.speed = speed;
    this.damage = damage;
    this.life = 3.5;
    this.exploded = false;

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.5 })
    );
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: 0xff6600, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    sp.scale.setScalar(1.0);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0 || this.exploded) {
      if (!this.exploded) this.explode(ctx);
      return 'expired';
    }
    this.vel.y -= 22 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += dt * 8;
    this.mesh.rotation.z += dt * 5;

    if (this.pos.y <= 0.2) {
      this.pos.y = 0.2;
      this.explode(ctx);
      return 'exploded';
    }
    if (pointInObstacle(this.pos, ctx.obstacles)) {
      this.explode(ctx);
      return 'exploded';
    }
    return 'alive';
  }

  explode(ctx) {
    this.exploded = true;
    const radius = 4.0;
    const playerPos = ctx.player.eyeInto(new THREE.Vector3());
    if (this.pos.distanceTo(playerPos) < radius + 0.5) {
      const dmg = this.damage * (1 - Math.min(1, this.pos.distanceTo(playerPos) / radius));
      ctx.onHitPlayer(dmg, this.pos);
    }
    if (ctx.effects) {
      ctx.effects.burst(this.pos, 0xff4400, 28, 8, 3, 0.6);
      ctx.effects.burst(this.pos, 0xffaa00, 16, 5, 2, 0.4);
    }
    if (ctx.sfx) ctx.sfx.kill();
    this.mesh.visible = false;
  }
}