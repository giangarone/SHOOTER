// VOID ARENA - game entry point. Owns the renderer, the scene, all entity
// lists, and the frame loop. Every other module is a leaf: they never call
// back into here except through the callbacks in the ctx objects below.
//
// STATE MACHINE: 'menu' -> 'playing' <-> 'paused' -> 'gameover' -> 'playing'
//                             |
//                             +-> 'draft' (wave-end upgrade pick) -> 'playing'
// Only 'playing' simulates. The loop still runs and renders in every state,
// which is what keeps the menu camera orbiting and the pause overlay live.
// 'draft' deliberately freezes the simulation: the arena is empty by then, and
// a frozen backdrop is what makes the screen readable.
//
// WAVE STATE (only meaningful while playing):
//   'active'       spawning from the queue and fighting
//   'intermission' wave cleared, showing the banner
//   'idle'         short beat, then the next wave starts
//
// TIME: `this.time` is GAME time - it only advances while playing, and dt is
// clamped so a stalled tab can't teleport everything. Every gameplay deadline
// (buff expiry, pickup despawn, regen delay) is measured against it. Use
// performance.now() only for things outside the simulation, like the menu
// camera. Mixing the two is a real bug that has happened here before.
//
// FRAME ORDER in _loop() is deliberate:
//   1. player.update      moves the player and the camera
//   2. _updateWave        spawns enemies and pickups
//   3. shoot / melee      raycasts against enemy hitboxes
//   4. _updatePickups     proximity collection
//   5. _updateEnemies     AI, then remove the dead
//   6. _updateProjectiles movement and player hits
//   7. shake, HUD, render
// Step 3 raycasts against hitbox transforms from the PREVIOUS frame, because
// world matrices are only refreshed during render. That one-frame lag is
// normal for this kind of loop; don't "fix" it by forcing matrix updates
// mid-frame.
//
// ALLOCATION: the loop runs 60 times a second, so the hot path allocates
// nothing. Scratch vectors, raycasters and reusable arrays live on `this`
// (the `_`-prefixed fields in the constructor). Reach for one of those rather
// than writing `new THREE.Vector3()` inside a per-frame method.
//
// GPU RESOURCES: enemies, projectiles and pickups all draw from shared
// geometry and material caches in their own modules. When an entity leaves the
// scene it must be removed AND disposed (Enemy.dispose(), Powerup.destroy()).
// Skipping that leaks for the whole session and was the original cause of the
// framerate decaying over a few waves.

import * as THREE from 'three';
import { buildArena } from './arena.js';
import { Player } from './player.js';
import { Enemy, Projectile, Grenade } from './enemy.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';
import { SFX } from './sfx.js';
import { waveConfig } from './waves.js';
import { spawnPowerup, calcPickupsForWave, spawnAmmo } from './powerups.js';
import { UPGRADES, RARITY, SHOP_ITEMS, SHOP_KEYS, rollDraft, rerollCost } from './upgrades.js';

// ?autotest makes the game play itself and exposes window.__game and
// window.__report() for test/smoke.mjs. It also skips pointer lock, which
// headless Chrome can't grant.
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

// --- economy ---
// Seconds a kill chain survives without a new kill.
const COMBO_WINDOW = 3;
// Multiplier per kill beyond the first, and its ceiling. The cap exists so a
// late wave full of splitter children cannot run the multiplier to absurdity.
const COMBO_STEP = 0.15;
const COMBO_MAX = 3;
// Credits per enemy are derived from its score so the two curves cannot drift
// apart. Splitter children score 0 and so are worth nothing, deliberately -
// otherwise splitters would be the best credit source in the game.
const CREDITS_PER_SCORE = 0.1;
const CLEAR_BONUS_BASE = 60;
const CLEAR_BONUS_PER_WAVE = 30;
// How many cards the wave-end draft offers.
const DRAFT_SIZE = 3;

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
    this.credits = 0;
    this.comboKills = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    // Reset at the start of every wave; drives the perfect-clear bonus.
    this.waveDamageTaken = 0;
    // Live wave-end draft. `options` is the current three ids, `rerolls` how
    // many times this one draft has been rerolled (it prices the next one).
    this.draft = { options: [], rerolls: 0, lastGain: 0, perfect: false };
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
        credits: this.credits,
        bestCombo: this.bestCombo,
        upgrades: { ...this.player.upgrades },
        upgradeCount: Object.values(this.player.upgrades).reduce((a, b) => a + b, 0),
        maxHealth: this.player.maxHealth,
        magSize: this.player.magSize,
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
        // Number keys pick a draft card without reaching for the mouse.
        case 'Digit1': this._pickByIndex(0); break;
        case 'Digit2': this._pickByIndex(1); break;
        case 'Digit3': this._pickByIndex(2); break;
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
    this.ui.bindDraft({
      pick: (id) => this._pickUpgrade(id),
      reroll: () => this._rerollDraft(),
      buy: (key) => this._buyItem(key),
      skip: () => { if (this.state === 'draft') this._closeDraft(); },
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

  // Tears down every live entity. Enemies and pickups must be disposed, not
  // just removed, or their per-instance materials leak.
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

  // Starts a fresh run from the menu or the game-over screen. Anything that
  // changes during play must be reset here, including the spawn timers -
  // leftover state used to carry into the next run.
  beginGame() {
    this.sfx.ensure();
    this.player.reset();
    this._clearEntities();
    this.score = 0;
    this.kills = 0;
    this.credits = 0;
    this.comboKills = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.waveDamageTaken = 0;
    this.draft.options.length = 0;
    this.draft.rerolls = 0;
    this.draft.lastGain = 0;
    this.draft.perfect = false;
    this.ui.hideDraft();
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

  // Rolls the next wave's enemy queue and difficulty, and sets the pickup
  // budget for it. Enemies then trickle out of the queue on spawnTimer.
  startWave() {
    this.wave++;
    this._cfg = waveConfig(this.wave);
    this.queue = this._cfg.queue;
    this.spawnTimer = 0.8;
    this.waveState = 'active';
    this.ui.setWave(this.wave);
    this.ui.banner('WAVE ' + this.wave);
    this.sfx.wave();

    this.waveDamageTaken = 0;
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
    this.comboKills = 0;
    this.comboTimer = 0;
    this.ui.showOver(this.score, this.wave, this.kills, this.bestCombo);
    this.sfx.kill();
  }

  // Current credit/score multiplier from the live kill chain.
  comboMult() {
    if (this.comboKills < 2) return 1;
    return Math.min(COMBO_MAX, 1 + COMBO_STEP * (this.comboKills - 1));
  }

  // Single entry point for earning credits, so Scavenger's creditMult applies
  // everywhere without each caller having to remember it.
  _award(amount) {
    if (amount <= 0) return 0;
    const paid = Math.round(amount * this.player.mods.creditMult);
    this.credits += paid;
    return paid;
  }

  // Extends the kill chain. Called once per enemy death, before the credit is
  // computed, so the kill that starts a chain already counts toward it.
  _bumpCombo() {
    this.comboKills++;
    this.comboTimer = COMBO_WINDOW;
    if (this.comboKills > this.bestCombo) this.bestCombo = this.comboKills;
  }

  // Reactive Plating. Detonates around the player when they are hit; damage
  // and radius both come from the mods so extra stacks widen it.
  _shockwave() {
    const mods = this.player.mods;
    if (mods.shockwave <= 0) return;
    const r = mods.shockwaveRadius;
    for (const e of this.enemies) {
      if (e.pos.distanceTo(this.player.pos) > r) continue;
      e.takeDamage(mods.shockwave);
      e.pos.add(
        this._knockback.subVectors(e.pos, this.player.pos).setY(0).normalize().multiplyScalar(2.5)
      );
    }
    this.effects.burst(this.player.eyeInto(this._killPos), 0x4ef3ff, 26, 8, 2.5, 0.6);
    this.effects.addShake(0.12);
  }

  // Hitscan shot. Raycasts once against arena geometry and enemy hitboxes
  // together, so walls correctly block shots: the nearest hit wins whatever it
  // is. Called every frame while the trigger is held; the fire rate is gated
  // inside player.tryShoot().
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
        const dealt = this.player.getEffectiveDamage(34);
        en.takeDamage(dealt);
        this.player.applyLifesteal(dealt);
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

  // Short-range melee. Unlike shoot(), this only tests enemy hitboxes, so it
  // reaches through thin cover. Cooldown lives in player.tryMelee().
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
      const dealt = this.player.getEffectiveDamage(50);
      en.takeDamage(dealt);
      this.player.applyLifesteal(dealt);
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

  // Single entry point for all damage to the player, passed to enemies and
  // projectiles through their ctx. `pos` is only used to place the hit spray.
  _hurtPlayer(d, pos) {
    if (this.state !== 'playing') return;
    const h = this.player.takeDamage(d, this.time);
    this.stats.damaged += d;
    this.waveDamageTaken += d;
    this._shockwave();
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

  // Autotest bot: aims at the nearest enemy, holds the trigger, and wanders in
  // a random cardinal direction. Only good enough to exercise the game.
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

  // Drives the wave state machine and the enemy trickle. A wave ends only when
  // the queue is empty AND no enemies are left alive.
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
        this.interT = 2.2;
        this.score += 100 * this.wave;
        this._payClearBonus();
        this.ui.banner('WAVE ' + this.wave + ' CLEARED');
      }
    } else if (this.waveState === 'intermission') {
      // A short beat on the clear banner before the draft takes the screen,
      // so the wave gets to land before the UI covers it.
      this.interT -= dt;
      if (this.interT <= 0) this._openDraft();
    } else if (this.waveState === 'idle') {
      this.interT -= dt;
      if (this.interT <= 0) this.startWave();
    }
  }

  // Wave-clear payout. A wave cleared without taking a single point of damage
  // pays double - the clearest signal the game has that playing well is worth
  // more than playing safe.
  _payClearBonus() {
    const base = CLEAR_BONUS_BASE + CLEAR_BONUS_PER_WAVE * this.wave;
    const perfect = this.waveDamageTaken <= 0;
    this.draft.perfect = perfect;
    this.draft.lastGain = this._award(perfect ? base * 2 : base);
  }

  // Opens the wave-end screen. Freezes the simulation by leaving 'playing',
  // releases the pointer so the cursor can reach the cards, and rolls the
  // first set of options. Reroll count resets here, not on pick, so each wave
  // starts its reroll pricing at the base cost.
  _openDraft() {
    this.state = 'draft';
    this._clearInput();
    this.comboKills = 0;
    this.comboTimer = 0;
    this.draft.rerolls = 0;
    this.draft.options = rollDraft(this.player.upgrades, this.wave, DRAFT_SIZE);
    if (!this.autoTest && document.pointerLockElement) document.exitPointerLock();
    this.ui.showDraft();
    this._renderDraft();
    this.sfx.wave();

    // The autotest bot has no cursor. Take the first card so the run keeps
    // moving and the upgrade paths still get exercised by the smoke test.
    if (this.autoTest) {
      if (this.draft.options.length) this._pickUpgrade(this.draft.options[0]);
      else this._closeDraft();
    }
  }

  // Builds the plain model the UI renders from. Everything the screen shows is
  // derived here, so ui.js never has to reach back into game state.
  _renderDraft() {
    const owned = this.player.upgrades;
    const cards = this.draft.options.map((id) => {
      const def = UPGRADES[id];
      return {
        id,
        name: def.name,
        desc: def.desc((owned[id] || 0) + 1),
        rarity: RARITY[def.rarity].label,
        color: RARITY[def.rarity].color,
        owned: owned[id] || 0,
        max: def.max,
      };
    });

    const shop = SHOP_KEYS.map((key) => {
      const it = SHOP_ITEMS[key];
      return {
        key,
        name: it.name,
        detail: it.detail,
        cost: it.cost,
        available: this.credits >= it.cost && it.enabled(this.player),
      };
    });

    const cost = rerollCost(this.draft.rerolls);
    const build = Object.entries(owned).map(([id, n]) => ({ name: UPGRADES[id].name, n }));

    let subtitle = '+<b>' + this.draft.lastGain + '</b> CREDITS';
    if (this.draft.perfect) subtitle += ' &nbsp;·&nbsp; <b>FLAWLESS</b> — DOUBLE BONUS';
    subtitle += ' &nbsp;·&nbsp; BEST CHAIN <b>' + this.bestCombo + '</b>';

    this.ui.renderDraft({
      wave: this.wave,
      credits: this.credits,
      subtitle,
      cards,
      shop,
      rerollCost: cost,
      canReroll: this.credits >= cost && this.draft.options.length > 0,
      build,
    });
  }

  // Keyboard shortcut for the draft cards. Silently ignored outside the draft.
  _pickByIndex(i) {
    if (this.state !== 'draft') return;
    const id = this.draft.options[i];
    if (id) this._pickUpgrade(id);
  }

  _pickUpgrade(id) {
    if (this.state !== 'draft') return;
    if (!this.draft.options.includes(id)) return;
    if (!this.player.takeUpgrade(id)) {
      this.sfx.denied();
      return;
    }
    this.sfx.upgrade();
    this._closeDraft();
  }

  _rerollDraft() {
    if (this.state !== 'draft') return;
    const cost = rerollCost(this.draft.rerolls);
    if (this.credits < cost || !this.draft.options.length) {
      this.sfx.denied();
      return;
    }
    this.credits -= cost;
    this.draft.rerolls++;
    // A full redraw, never a partial one: re-offering a card the player just
    // paid to get rid of makes the reroll feel rigged.
    this.draft.options = rollDraft(this.player.upgrades, this.wave, DRAFT_SIZE);
    this.sfx.reroll();
    this._renderDraft();
  }

  _buyItem(key) {
    if (this.state !== 'draft') return;
    const it = SHOP_ITEMS[key];
    if (!it || this.credits < it.cost || !it.enabled(this.player)) {
      this.sfx.denied();
      return;
    }
    this.credits -= it.cost;
    it.apply(this.player, this.time);
    this.sfx.buy();
    this._renderDraft();
  }

  // Leaves the draft and hands control back to the wave state machine, which
  // picks up at 'idle' and starts the next wave after a short beat.
  _closeDraft() {
    this.ui.hideDraft();
    this.state = 'playing';
    this.waveState = 'idle';
    this.interT = 0.6;
    this.ui.resetCache();
    if (!this.autoTest) this._lock();
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

  // Ticks pickups and collects any the player is standing on. Iterates
  // backwards so removals don't skip entries.
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

  // Splitter death: three weaker, faster, smaller chasers worth no score.
  // They go to _pendingSpawns, not straight into the enemy list - see
  // _updateEnemies.
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
      // Splitter children score 0, so they extend the chain but pay nothing.
      // That is intentional: they exist to threaten, not to fund the shop.
      this._bumpCombo();
      const mult = this.comboMult();
      this.score += Math.round(e.score * mult);
      this._award(e.score * CREDITS_PER_SCORE * mult);
      this.player.onKill(this.time);
      if (this.player.mods.ammoOnKill > 0) {
        this.player.reserveAmmo = Math.min(
          this.player.maxReserve,
          this.player.reserveAmmo + this.player.mods.ammoOnKill
        );
      }
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

  // Moves projectiles and reacts to what they hit. Grenades handle their own
  // blast inside update(); this only spawns the impact effect and cleans up.
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

  // Pushes state to the HUD every frame. UI caches internally, so these calls
  // are cheap when nothing changed.
  _updateHud() {
    this.ui.setWave(this.wave);
    this.ui.setEnemies(this.enemies.length + this.queue.length);
    this.ui.setScore(this.score);
    this.ui.setCredits(this.credits);
    this.ui.setCombo(this.comboKills, this.comboMult(), this.comboTimer / COMBO_WINDOW);
    this.ui.setHealth(this.player.health, this.player.maxHealth);
    this.ui.setAmmo(this.player.mag, this.player.reserveAmmo, this.player.reloading > 0);
    this.ui.setBuffs(
      this.player.damageBoostEnd > this.time ? (this.player.damageBoostEnd - this.time) / 10 : 0,
      this.player.fireRateBoostEnd > this.time ? (this.player.fireRateBoostEnd - this.time) / 8 : 0,
      this.player.shieldEnd > this.time ? this.player.shield / 50 : 0
    );
  }

  // The frame. See the FRAME ORDER note at the top before reordering anything.
  _loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (this.state === 'playing') {
      // Game time only advances while playing, otherwise a long pause would
      // silently burn through buff timers and pickup lifetimes.
      this.time += dt;
      if (this.emptyClickCd > 0) this.emptyClickCd -= dt;
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.comboKills = 0;
      }
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
