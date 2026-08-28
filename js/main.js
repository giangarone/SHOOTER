import * as THREE from 'three';
import { buildArena } from './arena.js';
import { Player } from './player.js';
import { Enemy, Projectile } from './enemy.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';
import { SFX } from './sfx.js';
import { waveConfig } from './waves.js';
import { Powerup, spawnPowerup, calcPickupsForWave } from './powerups.js';

const autotest = new URLSearchParams(location.search).has('autotest');

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);

    this.arena = buildArena(this.scene);
    this.player = new Player(this.camera, this.scene);
    this.effects = new Effects(this.scene);
    this.ui = new UI();
    this.sfx = new SFX();

    this.state = 'menu';
    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.enemies = [];
    this.projectiles = [];
    this.powerups = [];
    this.queue = [];
    this._cfg = waveConfig(1);
    this.spawnTimer = 0;
    this.waveState = 'idle';
    this.interT = 1.2;
    this.time = 0;
    this.stats = { shotsFired: 0, hits: 0, spawned: 0, damaged: 0 };
    this.input = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, shoot: false, melee: false };
    this.powerupsToSpawn = 0;
    this.powerupSpawnTimer = 0;
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();

    this._bind();
    this.ui.showStart();
    this.last = performance.now();
    this.renderer.setAnimationLoop((now) => this._loop(now));

    if (autotest) {
      this.autoTest = true;
      this._wt = 0;
      this._dir = 0;
      this.beginGame();
      window.__game = this;
      window.__report = () => ({
        state: this.state,
        wave: this.wave,
        score: this.score,
        kills: this.kills,
        enemies: this.enemies.length,
        queue: this.queue.length,
        shots: this.stats.shotsFired,
        hits: this.stats.hits,
        spawned: this.stats.spawned,
        damaged: this.stats.damaged,
        health: Math.round(this.player.health),
      });
    }
  }

  _bind() {
    const canvas = this.renderer.domElement;
    addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': this.input.forward = true; break;
        case 'KeyS': this.input.back = true; break;
        case 'KeyA': this.input.left = true; break;
        case 'KeyD': this.input.right = true; break;
        case 'Space': this.input.jump = true; e.preventDefault(); break;
        case 'ShiftLeft':
        case 'ShiftRight': this.input.sprint = true; break;
        case 'KeyR': this.tryReload(); break;
      }
    });
    addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.input.forward = false; break;
        case 'KeyS': this.input.back = false; break;
        case 'KeyA': this.input.left = false; break;
        case 'KeyD': this.input.right = false; break;
        case 'Space': this.input.jump = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': this.input.sprint = false; break;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.sfx.ensure();
        if (this.state === 'playing') {
          if (!this.autoTest && document.pointerLockElement !== canvas) this._lock();
          this.input.shoot = true;
        } else if (this.state === 'menu') {
          this.beginGame();
        } else if (this.state === 'paused') {
          this.resume();
        }
      } else if (e.button === 2) {
        e.preventDefault();
        if (this.state === 'playing') {
          this.input.melee = true;
        }
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.shoot = false;
      if (e.button === 2) this.input.melee = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing' || this.autoTest) return;
      if (document.pointerLockElement !== canvas) return;
      this.player.yaw -= e.movementX * 0.0021;
      this.player.pitch -= e.movementY * 0.0021;
      this.player.pitch = Math.max(-1.5, Math.min(1.5, this.player.pitch));
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas) {
        if (this.state === 'playing' && !this.autoTest) {
          this.state = 'paused';
          this.input.shoot = false;
          this.input.melee = false;
          this.ui.showPause();
        }
      } else if (this.state === 'paused') {
        this.state = 'playing';
        this.ui.hidePause();
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const onStart = () => {
      this.sfx.ensure();
      if (this.state === 'menu') this.beginGame();
    };
    document.getElementById('overlay-start').addEventListener('click', onStart);
    document.getElementById('btn-start').addEventListener('click', (e) => {
      e.stopPropagation();
      onStart();
    });
    document.getElementById('btn-restart').addEventListener('click', (e) => {
      e.stopPropagation();
      this.sfx.ensure();
      this.beginGame();
    });
    document.getElementById('overlay-pause').addEventListener('click', () => this.resume());
    document.getElementById('btn-resume').addEventListener('click', (e) => {
      e.stopPropagation();
      this.resume();
    });

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  _lock() {
    const p = this.renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }

  beginGame() {
    this.sfx.ensure();
    this.player.reset();
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies.length = 0;
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles.length = 0;
    for (const p of this.powerups) p.destroy();
    this.powerups.length = 0;
    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.queue = [];
    this.waveState = 'idle';
    this.interT = 1.2;
    this.state = 'playing';
    this.input.shoot = false;
    this.input.melee = false;
    this.ui.resetCache();
    this.ui.showHud();
    if (!this.autoTest) this._lock();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hidePause();
    if (!this.autoTest) this._lock();
  }

  tryReload() {
    if (this.state !== 'playing') return;
    if (this.player.startReload()) this.sfx.reload();
  }

  startWave() {
    this.wave++;
    this._cfg = waveConfig(this.wave);
    this.queue = this._cfg.queue.slice();
    this.spawnTimer = 0.8;
    this.waveState = 'active';
    this.ui.setWave(this.wave);
    this.ui.banner('WAVE ' + this.wave);
    this.sfx.wave();

    this.powerupsToSpawn = calcPickupsForWave(this.wave);
    this.powerupSpawnTimer = 2;
  }

  spawnEnemy(type) {
    const sp = this.arena.spawnPoints[(Math.random() * this.arena.spawnPoints.length) | 0];
    const j = new THREE.Vector3(sp.x + (Math.random() - 0.5) * 2, 0, sp.z + (Math.random() - 0.5) * 2);
    const e = new Enemy(type, j, this._cfg.hpScale, this._cfg.speedScale, this._cfg.dmgScale);
    this.scene.add(e.group);
    this.enemies.push(e);
    this.effects.burst(j, e.colorHex, 12, 3, 2, 0.4);
    this.stats.spawned++;
  }

  gameOver() {
    this.state = 'gameover';
    this.input.shoot = false;
    this.input.melee = false;
    if (!this.autoTest && document.pointerLockElement) document.exitPointerLock();
    const eye = this.player.eyeInto(new THREE.Vector3());
    this.effects.burst(eye, 0x4ef3ff, 40, 6, 3, 0.9);
    this.ui.showOver(this.score, this.wave, this.kills);
    this.sfx.kill();
  }

  shoot() {
    const res = this.player.tryShoot();
    if (res === 'empty') {
      this.sfx.empty();
      return;
    }
    if (res !== 'shot') return;
    this.stats.shotsFired++;
    this.sfx.shoot();

    const muzzle = new THREE.Vector3();
    this.player.gun.getObjectByName('muzzle').getWorldPosition(muzzle);
    this.effects.flash(muzzle);
    this.effects.addShake(0.05);

    const spread = (0.012 + (this.input.sprint ? 0.008 : 0)) * 2;
    const ray = new THREE.Raycaster();
    ray.far = 120;
    ray.setFromCamera(
      new THREE.Vector2((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread),
      this.camera
    );
    const targets = this.arena.meshList.concat(this.enemies.map((e) => e.hitbox));
    const hits = ray.intersectObjects(targets, false);

    let end;
    if (hits.length) {
      end = hits[0].point;
      const en = hits[0].object.userData.enemy;
      if (en) {
        this.stats.hits++;
        const dmg = this.player.getEffectiveDamage(34);
        en.takeDamage(dmg);
        this.effects.burst(end, 0xffe95e, 10, 4, 1.5, 0.35);
        this.sfx.hit();
        this.ui.hitMarker();
        this.effects.addShake(0.03);
      } else {
        this.effects.burst(end, 0x9fb4d8, 6, 3, 1, 0.3);
      }
    } else {
      end = ray.ray.at(60, new THREE.Vector3());
    }
    this.effects.tracer(muzzle, end);
  }

  tryMelee() {
    if (!this.player.tryMelee()) return;
    this.sfx.melee();

    const ray = new THREE.Raycaster();
    ray.far = 2.2;
    ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = ray.intersectObjects(this.enemies.map((e) => e.hitbox), false);
    if (hits.length) {
      const en = hits[0].object.userData.enemy;
      const dmg = this.player.getEffectiveDamage(50);
      en.takeDamage(dmg);
      const knockback = new THREE.Vector3().subVectors(en.pos, this.player.pos).normalize().multiplyScalar(3);
      en.pos.add(knockback);
      this.effects.burst(hits[0].point, 0xffd600, 12, 4, 1.5, 0.4);
      this.ui.hitMarker();
      this.effects.addShake(0.08);
    } else {
      this.effects.addShake(0.03);
    }
  }

  _hurtPlayer(d, pos) {
    if (this.state !== 'playing') return;
    const h = this.player.takeDamage(d, this.time);
    this.stats.damaged += d;
    this.effects.addShake(0.25);
    this.effects.burst(pos, 0xff3b30, 12, 4, 1.5, 0.4);
    this.sfx.hurt();
    this.ui.damage();
    if (h <= 0) this.gameOver();
  }

  _spawnProjectile(x, y, z) {
    if (this.projectiles.length > 25) return;
    const t = this.player.eyeInto(new THREE.Vector3());
    const speed = Math.min(16, 10 + this.wave * 0.3);
    const dmg = Math.min(20, 8 + this.wave * 0.8);
    this.projectiles.push(new Projectile(this.scene, this.effects.glowTex, x, y, z, t, speed, dmg));
  }

  _autoInput() {
    let best = null;
    let bd = 1e9;
    for (const e of this.enemies) {
      const d = e.pos.distanceTo(this.player.pos);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) {
      const dx = best.pos.x - this.player.pos.x;
      const dy = 1.0 - (this.player.pos.y + 1.7);
      const dz = best.pos.z - this.player.pos.z;
      const ty = Math.atan2(-dx, -dz);
      const tp = Math.atan2(dy, Math.hypot(dx, dz));
      const k = 0.18;
      this.player.yaw += (ty - this.player.yaw) * k;
      this.player.pitch += (tp - this.player.pitch) * k;
      this.input.shoot = true;
    } else {
      this.input.shoot = false;
    }
    this._wt -= 1 / 60;
    if (this._wt <= 0) {
      this._wt = 1 + Math.random() * 2;
      this._dir = (Math.random() * 5) | 0;
    }
    const dirs = [
      [0, 1], [1, 0], [0, -1], [-1, 0], [0, 0],
    ];
    const [fx, fz] = dirs[this._dir];
    const sinY = Math.sin(this.player.yaw);
    const cosY = Math.cos(this.player.yaw);
    const lf = fx * -sinY + fz * -cosY;
    const lr = fx * cosY + fz * -sinY;
    this.input.forward = lf > 0.1;
    this.input.back = lf < -0.1;
    this.input.right = lr > 0.1;
    this.input.left = lr < -0.1;
    this.input.jump = Math.sin(this.time * 3) > 0.92;
    this.input.sprint = false;
  }

  _loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;

    if (this.state === 'playing') {
      if (this.autoTest) this._autoInput();
      this.player.update(dt, this.input, this.arena.obstacles, this.time);

      if (this.waveState === 'active') {
        this.spawnTimer -= dt;
        if (this.queue.length && this.spawnTimer <= 0) {
          this.spawnEnemy(this.queue.shift());
          this.spawnTimer = this._cfg.spawnInterval;
        }
if (this.powerupsToSpawn > 0) {
            this.powerupSpawnTimer -= dt;
            if (this.powerupSpawnTimer <= 0) {
              this.powerups.push(spawnPowerup(this.arena, this.scene, this.player.health, this.player.maxHealth));
              this.powerupsToSpawn--;
              this.powerupSpawnTimer = this._cfg.spawnInterval * 1.5;
            }
          }
        if (!this.queue.length && !this.enemies.length) {
          this.waveState = 'intermission';
          this.interT = 3;
          this.score += 100 * this.wave;
          this.ui.banner('WAVE ' + this.wave + ' CLEARED');
        }
      } else if (this.waveState === 'intermission') {
        this.interT -= dt;
        if (this.interT <= 0) {
          this.waveState = 'idle';
          this.interT = 0.6;
        }
      } else if (this.waveState === 'idle') {
        this.interT -= dt;
        if (this.interT <= 0) this.startWave();
      }

      if (this.input.shoot) this.shoot();
      if (this.input.melee) this.tryMelee();

      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const p = this.powerups[i];
        p.update(dt, this.time);
        if (p.dead) {
          this.powerups.splice(i, 1);
          continue;
        }
        if (p.tryPickup(this.player.pos)) {
          p.type.apply(this.player, this.time);
          this.sfx[p.type.sfx]();
          this.effects.burst(p.pos, p.type.color, 16, 4, 2, 0.5);
          p.destroy();
          this.powerups.splice(i, 1);
        }
      }

      const ectx = {
        player: this.player,
        enemies: this.enemies,
        obstacles: this.arena.obstacles,
        time: this.time,
        onHitPlayer: (d, pos) => this._hurtPlayer(d, pos),
        addProjectile: (x, y, z) => this._spawnProjectile(x, y, z),
      };
      for (const e of this.enemies) {
        e.update(dt, ectx);
        if (e.dead) {
          this.kills++;
          this.score += e.score;
          const p = this._v2.set(e.pos.x, 0.8, e.pos.z);
          this.effects.burst(p, e.colorHex, 24, 6, 2.5, 0.7);
          this.sfx.kill();
          this.scene.remove(e.group);
        }
      }
      this.enemies = this.enemies.filter((e) => !e.dead);

      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        pr.target.copy(this.player.eyeInto(this._v1));
        const res = pr.update(dt, {
          obstacles: this.arena.obstacles,
          onHitPlayer: (d, pos) => this._hurtPlayer(d, pos),
        });
        if (res !== 'alive') {
          if (res === 'hit') this.effects.burst(pr.pos, 0xff5555, 10, 4, 1, 0.3);
          else if (res === 'wall') this.effects.burst(pr.pos, 0xb14aed, 8, 3, 1, 0.3);
          this.scene.remove(pr.mesh);
          this.projectiles.splice(i, 1);
        }
      }

      this.camera.position.add(this.effects.shakeOffset(this._v2));
      this.camera.rotation.z = (Math.random() - 0.5) * this.effects.shakeAmp * 0.04;

      this.ui.setWave(this.wave);
      this.ui.setEnemies(this.enemies.length + this.queue.length);
      this.ui.setScore(this.score);
      this.ui.setHealth(this.player.health, this.player.maxHealth);
      this.ui.setAmmo(this.player.mag, this.player.reserveAmmo, this.player.reloading > 0);
      this.ui.setBuffs({
        damageBoost: this.player.damageBoostEnd > this.time ? (this.player.damageBoostEnd - this.time) / 10 : 0,
        fireRateBoost: this.player.fireRateBoostEnd > this.time ? (this.player.fireRateBoostEnd - this.time) / 8 : 0,
        shield: this.player.shieldEnd > this.time ? this.player.shield / 50 : 0,
      });

      if (this.player.health <= 0) this.gameOver();
    } else if (this.state === 'menu') {
      const a = this.time * 0.15;
      this.camera.position.set(Math.sin(a) * 13, 5.5, Math.cos(a) * 13);
      this.camera.lookAt(0, 1, 0);
    }

    this.effects.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

new Game();