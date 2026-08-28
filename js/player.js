import * as THREE from 'three';
import { resolveCircle } from './utils.js';

function buildGun() {
  const g = new THREE.Group();
  g.position.set(0.3, -0.26, -0.55);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c212c, roughness: 0.35, metalness: 0.7 });
  const acc = new THREE.MeshStandardMaterial({ color: 0x0b0e14, emissive: 0x4ef3ff, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.5), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), dark);
  barrel.position.set(0, 0.02, -0.42);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.2), acc);
  strip.position.set(0, 0.06, -0.08);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
  grip.position.set(0, -0.14, 0.12);
  grip.rotation.x = 0.3;
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0.02, -0.65);
  g.add(body, barrel, strip, grip, muzzle);
  return g;
}

export class Player {
  constructor(camera, scene) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(0, 0, 8);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.maxHealth = 100;
    this.health = 100;
    this.magSize = 30;
    this.mag = 30;
    this.maxReserve = 300;
    this.reserveAmmo = 90;
    this.fireRate = 8;
    this.fireCd = 0;
    this.reloadTime = 1.4;
    this.reloading = 0;
    this.onGround = false;
    this.lastHurt = -99;
    this.kick = 0;
    this.meleeCd = 0;
    this.meleeActive = 0;
    this.damageMult = 1;
    this.damageBoostEnd = 0;
    this.fireRateMult = 1;
    this.fireRateBoostEnd = 0;
    this.shield = 0;
    this.shieldEnd = 0;
    this.gun = buildGun();
    this.gunBaseZ = this.gun.position.z;
    camera.add(this.gun);
    scene.add(camera);
    this.applyCamera();
  }

  reset() {
    this.pos.set(0, 0, 8);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.mag = this.magSize;
    this.reserveAmmo = 90;
    this.fireCd = 0;
    this.reloading = 0;
    this.onGround = false;
    this.lastHurt = -99;
    this.kick = 0;
    this.meleeCd = 0;
    this.meleeActive = 0;
    this.damageMult = 1;
    this.damageBoostEnd = 0;
    this.fireRateMult = 1;
    this.fireRateBoostEnd = 0;
    this.shield = 0;
    this.shieldEnd = 0;
  }

  eyeInto(v) {
    v.set(this.pos.x, this.pos.y + 1.7, this.pos.z);
    return v;
  }

  update(dt, input, obstacles, time) {
    this.fireCd -= dt;
    if (this.meleeCd > 0) this.meleeCd -= dt;
    if (this.meleeActive > 0) this.meleeActive -= dt;

    if (this.damageBoostEnd > 0 && time >= this.damageBoostEnd) {
      this.damageMult = 1;
      this.damageBoostEnd = 0;
    }
    if (this.fireRateBoostEnd > 0 && time >= this.fireRateBoostEnd) {
      this.fireRateMult = 1;
      this.fireRateBoostEnd = 0;
    }
    if (this.shieldEnd > 0 && time >= this.shieldEnd) {
      this.shield = 0;
      this.shieldEnd = 0;
    }

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const needed = this.magSize - this.mag;
        const take = Math.min(needed, this.reserveAmmo);
        this.mag += take;
        this.reserveAmmo -= take;
      }
    }

    const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (f || s) {
      const len = Math.hypot(f, s);
      const fn = f / len;
      const sn = s / len;
      const speed = input.sprint ? 10 : 6.5;
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      this.vel.x = (-sinY * fn + cosY * sn) * speed;
      this.vel.z = (-cosY * fn - sinY * sn) * speed;
    } else {
      const damp = Math.pow(0.0001, dt);
      this.vel.x *= damp;
      this.vel.z *= damp;
    }

    this.vel.y -= 22 * dt;
    if (input.jump && this.onGround) {
      this.vel.y = 9;
      this.onGround = false;
    }

    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    this.onGround = false;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      for (const b of obstacles) {
        const top = b.max.y;
        if (
          this.pos.x > b.min.x - 0.2 && this.pos.x < b.max.x + 0.2 &&
          this.pos.z > b.min.z - 0.2 && this.pos.z < b.max.z + 0.2 &&
          prevY >= top - 0.02 && this.pos.y <= top
        ) {
          this.pos.y = top;
          this.vel.y = 0;
          this.onGround = true;
          break;
        }
      }
    }
    resolveCircle(this.pos, 0.4, obstacles);
    const B = 21.6;
    this.pos.x = Math.max(-B, Math.min(B, this.pos.x));
    this.pos.z = Math.max(-B, Math.min(B, this.pos.z));

    if (time - this.lastHurt > 4 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 5 * dt);
    } else if (this.health > this.maxHealth) {
      this.health = Math.max(this.maxHealth, this.health - 5 * dt);
    }

    this.kick *= Math.pow(0.0001, dt);
    this.gun.position.z = this.gunBaseZ + this.kick;
    this.applyCamera();
  }

  applyCamera() {
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.position.set(this.pos.x, this.pos.y + 1.7, this.pos.z);
  }

  startReload() {
    if (this.reloading > 0 || this.mag === this.magSize || this.reserveAmmo <= 0) return false;
    this.reloading = this.reloadTime;
    return true;
  }

  tryShoot() {
    if (this.reloading > 0 || this.fireCd > 0) return null;
    if (this.mag <= 0) {
      if (this.reserveAmmo > 0) this.startReload();
      else this.startReload();
      return 'empty';
    }
    this.mag--;
    const effectiveFireRate = this.fireRate * this.fireRateMult;
    this.fireCd = 1 / effectiveFireRate;
    this.kick = 0.09;
    this.pitch = Math.min(1.5, this.pitch + 0.006 + Math.random() * 0.004);
    if (this.mag === 0) this.startReload();
    return 'shot';
  }

  tryMelee() {
    if (this.meleeCd > 0) return false;
    this.meleeCd = 0.6;
    this.meleeActive = 0.15;
    this.kick = 0.12;
    return true;
  }

  takeDamage(d, time) {
    if (this.shield > 0) {
      this.shield = Math.max(0, this.shield - d);
      if (this.shield <= 0) {
        this.shieldEnd = 0;
      }
      this.lastHurt = time;
      return this.health;
    }
    this.health = Math.max(0, this.health - d);
    this.lastHurt = time;
    return this.health;
  }

  getEffectiveDamage(base) {
    return base * this.damageMult;
  }
}