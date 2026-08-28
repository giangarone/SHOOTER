import * as THREE from 'three';
import { buildArena } from './arena.js';
import { Player } from './player.js';
import { Enemy, Projectile, Grenade } from './enemy.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';
import { SFX } from './sfx.js';
import { waveConfig } from './waves.js';
import { spawnPowerup, calcPickupsForWave, spawnAmmo } from './powerups.js';

const autotest = new URLSearchParams(location.search).has('autotest');

// Pickup budget. Every pickup in the arena is a draw call and a collision
// check, and unbounded spawning was the cause of the arena filling with ammo.
const MAX_ACTIVE_PICKUPS = 12;
const MAX_ACTIVE_AMMO = 3;
// Total rounds (magazine + reserve) below which ammo spawns get more frequent.
const LOW_AMMO_THRESHOLD = 60;
const AMMO_INTERVAL = 12;
const AMMO_INTERVAL_JITTER = 6;
const AMMO_INTERVAL_LOW = 5;
// Retry delay used when a spawn is skipped because a cap is already reached,
// so a blocked spawn can never be retried every single frame.
const SPAWN_RETRY = 2;

const MAX_PROJECTILES = 24;
const EMPTY_CLICK_COOLDOWN = 0.35;

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
    this.ammoSpawnTimer = 0;
    this.emptyClickCd = 0;

    // Scratch objects reused every frame so the hot path allocates nothing.
    this._shakeV = new THREE.Vector3();
    this._killPos = new THREE.Vector3();
    this._aimTarget = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
    this._rayEnd = new THREE.Vector3();
    this._screen = new THREE.Vector2();
    this._knockback = new THREE.Vector3();
    this._targets = [];
    this._hits = [];
    this._pendingSpawns = [];
    this._shotRay = new THREE.Raycaster();
    this._shotRay.far = 120;
    this._meleeRay = new THREE.Raycaster();
    this._meleeRay.far = 2.2;
    this._enemyCtx = {
      player: this.player,
      enemies: this.enemies,
      obstacles: this.arena.obstacles,
      time: 0,
      onHitPlayer: (d, pos) => this._hurtPlayer(d, pos),
      addProjectile: (x, y, z, type) => this._spawnProjectile(x, y, z, type),
      addGrenade: (x, y, z, damage) => this._spawnGrenade(x, y, z, damage),
      effects: this.effects,
      sfx: this.sfx,
    };
    this._projCtx = {
      obstacles: this.arena.obstacles,
      onHitPlayer: (d, pos) => this._hurtPlayer(d, pos),
      player: this.player,
      effects: this.effects,
      sfx: this.sfx,
    };

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
        powerups: this.powerups.length,
        ammoPickups: this.powerups.reduce((n, p) => n + (p.typeKey === 'ammo' ? 1 : 0), 0),
        projectiles: this.projectiles.length,
        // Leak canaries. `geometries` is everything the renderer still holds
        // buffers for; `liveGeometries` is what the scene graph actually
        // references. A gap between them means something was removed from the
        // scene without being disposed.
        geometries: this.renderer.info.memory.geometries,
        liveGeometries: this._countLiveGeometries(),
        lights: this._countLights(),
        textures: this.renderer.info.memory.textures,
        programs: this.renderer.info.programs.length,
      });
    }
  }

  // Test helper: unique geometries reachable from the scene graph.
  _countLiveGeometries() {
    const seen = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) seen.add(o.geometry.uuid);
    });
    return seen.size;
  }

  // Test helper. The light count must never move: three.js keys its shader
  // programs on it, so adding or removing one light recompiles every material
  // in the scene.
  _countLights() {
    let n = 0;
    this.scene.traverse((o) => {
      if (o.isLight) n++;
    });
    return n;
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
    // Losing focus mid-key would otherwise leave the player running forever.
    addEventListener('blur', () => this._clearInput());
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
        if (this.state === 'playing') this.input.melee = true;
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
          this._clearInput();
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

  _clearInput() {
    const i = this.input;
    i.forward = i.back = i.left = i.right = false;
    i.jump = i.sprint = i.shoot = i.melee = false;
  }

  _lock() {
    const p = this.renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }

  _clearEntities() {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
      e.dispose();
    }
    this.enemies.length = 0;
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles.length = 0;
    for (const p of this.powerups) p.destroy();
    this.powerups.length = 0;
  }

  beginGame() {
    this.sfx.ensure();
    this.player.reset();
    this._clearEntities();
    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.queue.length = 0;
    this.waveState = 'idle';
    this.interT = 1.2;
    this.spawnTimer = 0;
    this.powerupsToSpawn = 0;
    this.powerupSpawnTimer = 0;
    this.ammoSpawnTimer = 0;
    this.emptyClickCd = 0;
    this.stats.shotsFired = 0;
    this.stats.hits = 0;
    this.stats.spawned = 0;
    this.stats.damaged = 0;
    this.state = 'playing';
    this._clearInput();
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
    this.queue = this._cfg.queue;
    this.spawnTimer = 0.8;
    this.waveState = 'active';
    this.ui.setWave(this.wave);
    this.ui.banner('WAVE ' + this.wave);
    this.sfx.wave();

    this.powerupsToSpawn = calcPickupsForWave(this.wave);
    this.powerupSpawnTimer = 2;
    this.ammoSpawnTimer = 8;
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
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this._clearInput();
    if (!this.autoTest && document.pointerLockElement) document.exitPointerLock();
    const eye = this.player.eyeInto(this._killPos);
    this.effects.burst(eye, 0x4ef3ff, 40, 6, 3, 0.9);
    this.ui.showOver(this.score, this.wave, this.kills);
    this.sfx.kill();
  }

  shoot() {
    const res = this.player.tryShoot();
    if (res === 'empty') {
      // Held trigger on an empty gun would otherwise fire a WebAudio voice
      // every single frame.
      if (this.emptyClickCd <= 0) {
        this.sfx.empty();
        this.emptyClickCd = EMPTY_CLICK_COOLDOWN;
      }
      return;
    }
    if (res !== 'shot') return;
    this.stats.shotsFired++;
    this.sfx.shoot();

    const muzzle = this.player.muzzleInto(this._muzzle);
    this.effects.flash(muzzle);
    this.effects.addShake(0.05);

    const spread = (0.012 + (this.input.sprint ? 0.008 : 0)) * 2;
    const ray = this._shotRay;
    this._screen.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
    ray.setFromCamera(this._screen, this.camera);

    const targets = this._targets;
    targets.length = 0;
    for (const m of this.arena.meshList) targets.push(m);
    for (const e of this.enemies) targets.push(e.hitbox);
    const hits = this._hits;
    hits.length = 0;
    ray.intersectObjects(targets, false, hits);

    let end;
    if (hits.length) {
      end = hits[0].point;
      const en = hits[0].object.userData.enemy;
      if (en) {
        this.stats.hits++;
        en.takeDamage(this.player.getEffectiveDamage(34));
        this.effects.burst(end, 0xffe95e, 10, 4, 1.5, 0.35);
        this.sfx.hit();
        this.ui.hitMarker();
        this.effects.addShake(0.03);
      } else {
        this.effects.burst(end, 0x9fb4d8, 6, 3, 1, 0.3);
      }
    } else {
      end = ray.ray.at(60, this._rayEnd);
    }
    this.effects.tracer(muzzle, end);
    hits.length = 0;
    targets.length = 0;
  }

  tryMelee() {
    if (!this.player.tryMelee()) return;
    this.sfx.melee();

    const ray = this._meleeRay;
    this._screen.set(0, 0);
    ray.setFromCamera(this._screen, this.camera);
    const targets = this._targets;
    targets.length = 0;
    for (const e of this.enemies) targets.push(e.hitbox);
    const hits = this._hits;
    hits.length = 0;
    ray.intersectObjects(targets, false, hits);

    if (hits.length) {
      const en = hits[0].object.userData.enemy;
      en.takeDamage(this.player.getEffectiveDamage(50));
      en.pos.add(
        this._knockback.subVectors(en.pos, this.player.pos).setY(0).normalize().multiplyScalar(3)
      );
      this.effects.burst(hits[0].point, 0xffd600, 12, 4, 1.5, 0.4);
      this.ui.hitMarker();
      this.effects.addShake(0.08);
    } else {
      this.effects.addShake(0.03);
    }
    hits.length = 0;
    targets.length = 0;
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

  _spawnProjectile(x, y, z, type = 'shooter') {
    if (this.projectiles.length >= MAX_PROJECTILES) return;
    const t = this.player.eyeInto(this._aimTarget);
    let speed, dmg;
    if (type === 'sniper') {
      speed = Math.min(32, 22 + this.wave * 0.4);
      dmg = Math.min(22, 12 + this.wave * 0.5);
    } else {
      speed = Math.min(20, 13 + this.wave * 0.3);
      dmg = Math.min(20, 8 + this.wave * 0.8);
    }
    this.projectiles.push(new Projectile(this.scene, this.effects.glowTex, x, y, z, t, speed, dmg, type));
  }

  _spawnGrenade(x, y, z, damage) {
    if (this.projectiles.length >= MAX_PROJECTILES) return;
    const t = this.player.eyeInto(this._aimTarget);
    const speed = Math.min(18, 12 + this.wave * 0.2);
    const dmg = Math.min(28, damage + this.wave * 0.5);
    this.projectiles.push(new Grenade(this.scene, this.effects.glowTex, x, y, z, t, speed, dmg));
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
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0], [0, 0]];
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

  _updateWave(dt) {
    if (this.waveState === 'active') {
      this.spawnTimer -= dt;
      if (this.queue.length && this.spawnTimer <= 0) {
        this.spawnEnemy(this.queue.shift());
        this.spawnTimer = this._cfg.spawnInterval;
      }
      this._updatePickupSpawns(dt);
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
  }

  // Both spawners run on a timer and respect a hard cap on what is already in
  // the arena. When a cap blocks a spawn the timer is pushed out rather than
  // left at zero, so a blocked spawn cannot retry sixty times a second.
  _updatePickupSpawns(dt) {
    if (this.powerupsToSpawn > 0) {
      this.powerupSpawnTimer -= dt;
      if (this.powerupSpawnTimer <= 0) {
        if (this.powerups.length < MAX_ACTIVE_PICKUPS) {
          this.powerups.push(
            spawnPowerup(
              this.arena, this.scene, this.effects.glowTex, this.time,
              this.player.health, this.player.maxHealth
            )
          );
          this.powerupsToSpawn--;
          this.powerupSpawnTimer = this._cfg.spawnInterval * 1.5;
        } else {
          this.powerupSpawnTimer = SPAWN_RETRY;
        }
      }
    }

    this.ammoSpawnTimer -= dt;
    if (this.ammoSpawnTimer > 0) return;

    let ammoActive = 0;
    for (const p of this.powerups) if (p.typeKey === 'ammo') ammoActive++;
    const low = this.player.reserveAmmo + this.player.mag < LOW_AMMO_THRESHOLD;
    const cap = low ? MAX_ACTIVE_AMMO : MAX_ACTIVE_AMMO - 1;

    if (ammoActive >= cap || this.powerups.length >= MAX_ACTIVE_PICKUPS) {
      this.ammoSpawnTimer = SPAWN_RETRY;
      return;
    }
    this.powerups.push(spawnAmmo(this.arena, this.scene, this.effects.glowTex, this.time));
    this.ammoSpawnTimer = low
      ? AMMO_INTERVAL_LOW
      : AMMO_INTERVAL + Math.random() * AMMO_INTERVAL_JITTER;
  }

  _updatePickups(dt) {
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
  }

  _splitInto(e) {
    for (let i = 0; i < 3; i++) {
      const angle = ((Math.PI * 2) / 3) * i + Math.random() * 0.5;
      const spawnPos = new THREE.Vector3(
        e.pos.x + Math.cos(angle) * 1.5,
        0,
        e.pos.z + Math.sin(angle) * 1.5
      );
      const mini = new Enemy(
        'chaser', spawnPos,
        this._cfg.hpScale * 0.5, this._cfg.speedScale * 1.1, this._cfg.dmgScale * 0.7
      );
      mini.score = 0;
      mini.group.scale.setScalar(0.6);
      this.scene.add(mini.group);
      this._pendingSpawns.push(mini);
      this.effects.burst(spawnPos, e.colorHex, 10, 3, 1.5, 0.4);
    }
  }

  _updateEnemies(dt) {
    const ctx = this._enemyCtx;
    ctx.time = this.time;

    // Update everything first, then compact. Doing both in one pass would let
    // an enemy read half-compacted neighbours and feel the same one twice
    // while resolving crowding.
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) list[i].update(dt, ctx);

    let write = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.dead) {
        list[write++] = e;
        continue;
      }
      this.kills++;
      this.score += e.score;
      this.effects.burst(this._killPos.set(e.pos.x, 0.8, e.pos.z), e.colorHex, 24, 6, 2.5, 0.7);
      this.sfx.kill();
      this.scene.remove(e.group);
      if (e.type === 'splitter') this._splitInto(e);
      e.dispose();
    }
    list.length = write;
    // Children of a splitter join the roster only after the sweep, so they are
    // never visited by the loop that created them.
    for (const mini of this._pendingSpawns) list.push(mini);
    this._pendingSpawns.length = 0;
  }

  _updateProjectiles(dt) {
    const ctx = this._projCtx;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const res = pr.update(dt, ctx);
      if (res === 'alive') continue;
      if (res === 'hit') this.effects.burst(pr.pos, 0xff5555, 10, 4, 1, 0.3);
      else if (res === 'wall') this.effects.burst(pr.pos, 0xb14aed, 8, 3, 1, 0.3);
      this.scene.remove(pr.mesh);
      this.projectiles.splice(i, 1);
    }
  }

  _updateHud() {
    this.ui.setWave(this.wave);
    this.ui.setEnemies(this.enemies.length + this.queue.length);
    this.ui.setScore(this.score);
    this.ui.setHealth(this.player.health, this.player.maxHealth);
    this.ui.setAmmo(this.player.mag, this.player.reserveAmmo, this.player.reloading > 0);
    this.ui.setBuffs(
      this.player.damageBoostEnd > this.time ? (this.player.damageBoostEnd - this.time) / 10 : 0,
      this.player.fireRateBoostEnd > this.time ? (this.player.fireRateBoostEnd - this.time) / 8 : 0,
      this.player.shieldEnd > this.time ? this.player.shield / 50 : 0
    );
  }

  _loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (this.state === 'playing') {
      // Game time only advances while playing, otherwise a long pause would
      // silently burn through buff timers and pickup lifetimes.
      this.time += dt;
      if (this.emptyClickCd > 0) this.emptyClickCd -= dt;
      if (this.autoTest) this._autoInput();
      this.player.update(dt, this.input, this.arena.obstacles, this.time);

      this._updateWave(dt);
      if (this.input.shoot) this.shoot();
      if (this.input.melee) this.tryMelee();
      this._updatePickups(dt);
      this._updateEnemies(dt);
      this._updateProjectiles(dt);

      if (this.effects.shakeAmp > 0) {
        this.camera.position.add(this.effects.shakeOffset(this._shakeV));
        this.camera.rotation.z = (Math.random() - 0.5) * this.effects.shakeAmp * 0.04;
      }

      this._updateHud();
      if (this.player.health <= 0) this.gameOver();
    } else if (this.state === 'menu') {
      const a = now * 0.00015;
      this.camera.position.set(Math.sin(a) * 13, 5.5, Math.cos(a) * 13);
      this.camera.lookAt(0, 1, 0);
    }

    this.effects.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

new Game();
