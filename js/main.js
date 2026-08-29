// VOID ARENA - game entry point. Owns the renderer, the scene, all entity
// lists, and the frame loop. Every other module is a leaf: they never call
// back into here except through the callbacks in the ctx objects below.
//
// STATE MACHINE: 'menu' -> 'playing' <-> 'paused' -> 'gameover' -> 'playing'
// Only 'playing' simulates. The loop still runs and renders in every state,
// which is what keeps the menu camera orbiting and the pause overlay live.
//
// NO MENU EVER OPENS. The wave-end upgrade choice is three totems that rise
// out of the arena floor - walk into one or shoot it anywhere - and credits
// are spent at two stations beside them. The player keeps their hands on the
// controls and the camera stays where it was; a modal at the wave boundary
// killed the momentum this game runs on, and that line still holds.
//
// The wave boundary IS held, though: the next wave does not start until a
// totem has been taken. That replaced a five-second timer that let a set sink
// unclaimed, which meant a forfeited pick was silent - the player learned they
// had lost one only by noticing they never got it. Everything else about the
// boundary is unchanged, including that enemies from the cleared wave are
// already gone, so the hold costs no tension.
//
// WAVE STATE (only meaningful while playing):
//   'active'       spawning from the queue and fighting
//   'intermission' wave cleared, totems up, waiting for the player to pick
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
import { buildArena, BOUND as ARENA_BOUND } from './arena.js';
import { Player } from './player.js';
import { Enemy, Projectile, Grenade } from './enemy.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';
import { SFX } from './sfx.js';
import { waveConfig } from './waves.js';
import { spawnPowerup, calcPickupsForWave, spawnAmmo } from './powerups.js';
import { UPGRADES, RARITY, AMMO_PURCHASE, rollTotems, rerollCost } from './upgrades.js';
import { TotemArea } from './totems.js';
import { NavGrid } from './nav.js';
import { WEAPONS, WEAPON_KEYS } from './weapons.js';
import { resolveCircle } from './utils.js';

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

// Seconds a station ignores further hits after one is bought by shooting it.
// A held trigger lands several pellets per second on the same box, and every
// one of those would otherwise be a separate purchase.
const STATION_SHOOT_COOLDOWN = 0.25;

// No enemy spawns closer than this to the player. The spawn grid sits near the
// arena edges, but the player is free to stand on one, and materialising a
// charger inside their hitbox is damage they had no chance to avoid.
const MIN_SPAWN_DISTANCE = 10;

// Melee reach, in metres from the player's feet, and the half-angle of the
// arc it sweeps. It is a swing, not a poke: everything in front of the player
// inside the arc is hit, not just what the crosshair happens to be on.
const MELEE_RANGE = 3.6;
const MELEE_ARC = Math.PI / 3;
const MELEE_DAMAGE = 50;

// innerWidth and innerHeight are both 0 in some real situations - a minimised
// window, a hidden tab, a canvas laid out at zero height. 0/0 is NaN, and a NaN
// aspect poisons the camera's projection matrix, which makes setFromCamera()
// produce a NaN ray and silently breaks EVERY raycast in the game: shooting
// and melee stop registering hits with no error anywhere. Clamp so the aspect
// is always a finite positive number.
function viewportAspect() {
  return Math.max(1, innerWidth) / Math.max(1, innerHeight);
}

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
// Totems offered per set.
const TOTEM_COUNT = 3;
// Chance that one of the three totems offers a weapon instead of an upgrade,
// and the first wave that can happen. Only weapons the player is not already
// carrying are ever offered.
// Forced to a certainty under ?autotest so the smoke test actually exercises
// the weapon path - at 0.3 the bot only sometimes saw a weapon totem in a
// 30-second run, which would have made the assertion flaky.
// Both forced under ?autotest so the smoke test actually exercises the weapon
// path. At 0.3 from wave 2 the bot -- which spends time walking to totems --
// usually never saw a weapon totem inside a 30-second run, and the assertion
// passed vacuously instead of covering anything.
const WEAPON_CHANCE = autotest ? 1 : 0.3;
const WEAPON_FROM_WAVE = autotest ? 1 : 2;

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
    this.camera = new THREE.PerspectiveCamera(75, viewportAspect(), 0.1, 200);

    this.arena = buildArena(this.scene);
    // One navigation grid, shared by every enemy alive. It is baked from the
    // arena's obstacles at startup and reflooded toward the player a few times
    // a second - see nav.js for why it is one field rather than a path each.
    this.nav = new NavGrid(this.arena.obstacles, ARENA_BOUND, 0.5);
    // The totems and their stations are static furniture: three totems and two
    // stations, built once and reused for every set. They are deliberately NOT
    // in the obstacle list - walking into a totem claims it, so the player can
    // never actually pass through one.
    this.totemArea = new TotemArea(this.scene);
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
    // Credits paid by the last wave clear, and whether it was flawless. Both
    // are shown on the upgrade reveal.
    this.lastGain = 0;
    this.lastPerfect = false;
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
    // `shootFresh` is the trigger EDGE - true only on the frame the button
    // went down. Semi-auto weapons need it; the loop clears it every frame.
    this.input = { forward: false, back: false, left: false, right: false, jump: false, shoot: false, shootFresh: false, melee: false };
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
    this._meleeDir = new THREE.Vector3();
    // Enemies already touched by the shot in flight. A scattergun sends eight
    // pellets through _firePellet, and every mutation effect is per-shot, not
    // per-pellet: without this a point-blank shell would roll Petrify eight
    // times and shove its target twelve metres.
    this._shotHits = new Set();
    this._blastAt = new THREE.Vector3();
    this._blastHit = false;
    this._chainFrom = new THREE.Vector3();
    this._chainTo = new THREE.Vector3();
    // Deaths that owe an after-effect, recorded during the enemy sweep and
    // played once it has finished. Doing it inline would let a corpse blast
    // read the enemy list while it is half-compacted - the same hazard the
    // sweep itself is written to avoid. Both arrays are grown once and reused.
    this._deathPos = [];
    this._deathBurn = [];
    this._deathCount = 0;
    this._enemyCtx = {
      player: this.player,
      enemies: this.enemies,
      obstacles: this.arena.obstacles,
      nav: this.nav,
      time: 0,
      onHitPlayer: (d, pos) => this._hurtPlayer(d, pos),
      addProjectile: (x, y, z, type, speedScale) =>
        this._spawnProjectile(x, y, z, type, speedScale),
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
      this._botMove = { x: 0, z: 0 };
      this._wt = 0;
      this._dir = 0;
      this._swapCd = 0;
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
        slots: [...this.player.slots],
        weapon: this.player.weapon.name,
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
        case 'KeyR': this.tryReload(); break;
        case 'KeyE': this.tryUseStation(); break;
        case 'KeyQ': this.trySwapWeapon(); break;
      }
    });
    addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.input.forward = false; break;
        case 'KeyS': this.input.back = false; break;
        case 'KeyA': this.input.left = false; break;
        case 'KeyD': this.input.right = false; break;
        case 'Space': this.input.jump = false; break;
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
          this.input.shootFresh = true;
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
      // A zero-sized viewport is skipped entirely rather than clamped, so the
      // renderer is never resized to nothing; the next real resize restores it.
      if (innerWidth <= 0 || innerHeight <= 0) return;
      this.camera.aspect = viewportAspect();
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  _clearInput() {
    const i = this.input;
    i.forward = i.back = i.left = i.right = false;
    i.jump = i.shoot = i.melee = false;
    i.shootFresh = false;
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
    this.lastGain = 0;
    this.lastPerfect = false;
    this.ui.hideUpgrade();
    this.totemArea.dismiss();
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

  trySwapWeapon() {
    if (this.state !== 'playing') return;
    if (this.player.swapWeapon()) this.sfx.reload();
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
    this.player.armWard();
    this.powerupsToSpawn = calcPickupsForWave(this.wave);
    this.powerupSpawnTimer = 2;
    this.ammoSpawnTimer = 8;
  }

  spawnEnemy(type) {
    const j = this._pickSpawnPos();
    const e = new Enemy(type, j, this._cfg.hpScale, this._cfg.speedScale, this._cfg.dmgScale);
    this.scene.add(e.group);
    this.enemies.push(e);
    this.effects.burst(j, e.colorHex, 12, 3, 2, 0.4);
    this.stats.spawned++;
  }

  // A jittered spawn point at least MIN_SPAWN_DISTANCE from the player. Walks
  // the grid from a random start and takes the first point that clears the
  // distance; if the player has somehow crowded all of them, the farthest one
  // is used rather than giving up and spawning on top of them.
  _pickSpawnPos() {
    const points = this.arena.spawnPoints;
    const start = (Math.random() * points.length) | 0;
    let best = null;
    let bestD = -1;
    for (let i = 0; i < points.length; i++) {
      const sp = points[(start + i) % points.length];
      const d = Math.hypot(sp.x - this.player.pos.x, sp.z - this.player.pos.z);
      if (d >= MIN_SPAWN_DISTANCE) {
        best = sp;
        break;
      }
      if (d > bestD) {
        bestD = d;
        best = sp;
      }
    }
    return new THREE.Vector3(
      best.x + (Math.random() - 0.5) * 2, 0, best.z + (Math.random() - 0.5) * 2
    );
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
    this.ui.setPrompt(null, false);
    this.ui.hideUpgrade();
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
    // Station labels show whether the player can currently afford them, so a
    // balance change has to redraw them. Only fires on a kill or a wave clear,
    // never per frame.
    if (this.totemArea.active) this._refreshStations();
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

  // Arc Rounds. Jumps a fraction of a hit to one more enemy, and exactly one:
  // a chain that could chain again would clear a whole wave from a single
  // pellet, and the tracer would stop reading as a discrete arc.
  _chain(from, dmg, range) {
    let best = null;
    let bestD = range;
    for (const e of this.enemies) {
      if (e === from || e.dead) continue;
      const d = e.pos.distanceTo(from.pos);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) return;
    best.takeDamage(dmg);
    this.effects.tracer(
      this._chainFrom.set(from.pos.x, 1.0, from.pos.z),
      this._chainTo.set(best.pos.x, 1.0, best.pos.z)
    );
    this.effects.burst(this._chainTo, 0x9ff3ff, 6, 3, 1.5, 0.3);
  }

  // Knockout Drops. Shoves an enemy along the shot, then resolves it out of
  // any obstacle it landed in - without that, a shove into cover would leave
  // the enemy stuck inside a crate.
  _shove(en, dir, dist) {
    en.pos.add(this._knockback.set(dir.x, 0, dir.z).normalize().multiplyScalar(dist));
    resolveCircle(en.pos, en.radius, this.arena.obstacles);
  }

  // Radial damage with linear falloff, shared by Detonator and Blast Corpse.
  // `skip` is the enemy that is already taking the hit directly, and
  // `hitPlayer` is what separates the two: your own impact blasts cannot hurt
  // you, but a corpse going off in your face is the whole cost of the pick.
  _blast(point, dmg, radius, skip, hitPlayer) {
    for (const e of this.enemies) {
      if (e === skip || e.dead) continue;
      const d = e.pos.distanceTo(point);
      if (d > radius) continue;
      e.takeDamage(dmg * (1 - d / radius));
    }
    if (hitPlayer) {
      const d = this.player.eyeInto(this._killPos).distanceTo(point);
      if (d < radius) this._hurtPlayer(dmg * (1 - d / radius), point);
    }
    this.effects.shockwave(point, 0xff7a18, radius);
    this.effects.burst(point, 0xff7a18, 18, 6, 2, 0.5);
    this.effects.addShake(0.1);
  }

  // One pellet of a shot. Walks the sorted hit list so a piercing weapon can
  // pass through several enemies, stopping at the first thing that is not one.
  // Returns true if it damaged anything, so the caller can play a single hit
  // sound per shot rather than one per pellet.
  _firePellet(muzzle, targets, spread, w) {
    const ray = this._shotRay;
    this._screen.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
    ray.setFromCamera(this._screen, this.camera);

    const hits = this._hits;
    hits.length = 0;
    ray.intersectObjects(targets, false, hits);

    // Multi-pellet weapons fire eight of these per shot, so their per-impact
    // particle bursts have to be much smaller or a single shell drains the
    // whole pool.
    const burst = w.pellets > 1 ? 4 : 10;
    let end = null;
    let pierced = 0;
    let damaged = false;

    for (const h of hits) {
      const totem = h.object.userData.totem;
      if (totem) {
        // Anywhere on the totem claims it. The pellet stops either way - a
        // totem already claimed is a wall, not a hole to shoot enemies past.
        this._claimTotem(totem);
        end = h.point;
        this.effects.burst(end, totem.offer ? totem.offer.theme : 0x9fb4d8,
          w.pellets > 1 ? 3 : 8, 3, 1.5, 0.3);
        break;
      }
      const station = h.object.userData.station;
      if (station) {
        // The pellet stops here whether or not the purchase went through -
        // a station on cooldown is a wall, not a hole to shoot enemies past.
        this._shootStation(station);
        end = h.point;
        this.effects.burst(end, station.color, w.pellets > 1 ? 3 : 8, 3, 1.5, 0.3);
        break;
      }
      const en = h.object.userData.enemy;
      if (!en) {
        // Wall, floor or crate - the pellet stops here.
        end = h.point;
        this.effects.burst(end, 0x9fb4d8, w.pellets > 1 ? 3 : 6, 3, 1, 0.3);
        break;
      }
      const m = this.player.mods;
      const dealt = this.player.getEffectiveDamage(w.damage * m.volleyDamage)
        * Math.pow(w.falloff, pierced);
      en.takeDamage(dealt);
      this.player.applyLifesteal(dealt);
      this.effects.burst(h.point, 0xffe95e, burst, 4, 1.5, 0.35);
      // Damage and lifesteal are per-pellet; everything below is per-shot.
      if (!this._shotHits.has(en)) {
        this._shotHits.add(en);
        if (m.poisonTime) en.applyStatus('poison', m.poisonTime, m.poisonDps);
        if (m.burnTime) en.applyStatus('burn', m.burnTime, m.burnDps);
        if (m.slowTime) en.applyStatus('slow', m.slowTime);
        if (m.fearTime) en.applyStatus('fear', m.fearTime);
        if (m.petrifyChance && Math.random() < m.petrifyChance) {
          en.applyStatus('freeze', m.petrifyTime);
        }
        if (m.chainDamage) this._chain(en, dealt * m.chainDamage, m.chainRange);
        if (m.knockback) this._shove(en, ray.ray.direction, m.knockback);
        if (m.midas) this.effects.burst(h.point, 0xffd600, 6, 3, 1.5, 0.35);
        // Detonator goes off once per trigger pull, at the first enemy the
        // shot touched. Per-pellet it would fire eight blasts from one shell
        // and exhaust the four-ring pool on its own.
        if (m.blastDamage && !this._blastHit) {
          this._blastHit = true;
          this._blastAt.copy(h.point);
        }
      }
      damaged = true;
      pierced++;
      if (pierced > w.pierce) {
        end = h.point;
        break;
      }
    }

    if (!end) end = ray.ray.at(60, this._rayEnd);
    this.effects.tracer(muzzle, end);
    hits.length = 0;
    return damaged;
  }

  // A shot. Raycast targets are built once for the whole blast and shared by
  // every pellet: arena geometry, enemy hitboxes and the totems together, so
  // the nearest hit wins whatever it is and walls correctly block shots.
  shoot() {
    const res = this.player.tryShoot(this.input.shootFresh);
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

    const w = this.player.weapon;
    this.stats.shotsFired++;
    this.sfx.shoot();

    const muzzle = this.player.muzzleInto(this._muzzle);
    this.effects.flash(muzzle);
    this.effects.addShake(w.shake);

    const targets = this._targets;
    targets.length = 0;
    for (const m of this.arena.meshList) targets.push(m);
    for (const e of this.enemies) targets.push(e.hitbox);
    this.totemArea.addTargets(targets);

    // Moving costs accuracy. This used to be a sprint-key test; with the key
    // gone it reads live speed instead, which also means it fades in and out
    // with the player rather than snapping.
    const spread = w.spread + (this.player.speedXZ > 6 ? 0.016 : 0);
    const mods = this.player.mods;
    let hitAny = false;
    this._shotHits.clear();
    this._blastHit = false;
    // Twenty/Twenty fires the whole pellet pattern twice off one round. The
    // dedup set is NOT cleared between volleys - both barrels are one trigger
    // pull, so an enemy caught by both still takes one dose of status.
    for (let v = 0; v < mods.volley; v++) {
      for (let i = 0; i < w.pellets; i++) {
        if (this._firePellet(muzzle, targets, spread, w)) hitAny = true;
      }
    }
    if (this._blastHit) {
      this._blast(this._blastAt, mods.blastDamage, mods.blastRadius, null, false);
    }
    this._shotHits.clear();

    // One hitmarker and one sound per shot, however many pellets connected.
    if (hitAny) {
      this.stats.hits++;
      this.sfx.hit();
      this.ui.hitMarker();
      this.effects.addShake(0.03);
    }
    targets.length = 0;
  }

  // A melee swing. This is a radial arc test rather than a raycast: everything
  // within MELEE_RANGE and inside MELEE_ARC of where the player is looking is
  // hit, so a swing at a crowd connects with the crowd and not only with
  // whatever the crosshair was on. Like the old raycast it ignores geometry,
  // so it still reaches through thin cover. Cooldown lives in
  // player.tryMelee(); the ring the player sees is drawn at the real range, so
  // the indicator and the hit test can never disagree.
  tryMelee() {
    if (!this.player.tryMelee()) return;
    this.sfx.melee();

    const forward = this.player.forwardInto(this._meleeDir);
    const dealt = this.player.getEffectiveDamage(MELEE_DAMAGE);
    const cosArc = Math.cos(MELEE_ARC);
    let hit = false;

    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - this.player.pos.x;
      const dz = e.pos.z - this.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > MELEE_RANGE) continue;
      // Anything the player is standing inside has no meaningful direction, so
      // it is always in the arc.
      if (d > 0.001 && (dx * forward.x + dz * forward.z) / d < cosArc) continue;
      e.takeDamage(dealt);
      this.player.applyLifesteal(dealt);
      e.pos.add(
        this._knockback.subVectors(e.pos, this.player.pos).setY(0).normalize().multiplyScalar(3)
      );
      this.effects.burst(
        this._killPos.set(e.pos.x, 1.1, e.pos.z), 0xffd600, 12, 4, 1.5, 0.4
      );
      hit = true;
    }

    // The shockwave shows the area that was just swept whether or not it
    // caught anything - a miss that reads as "nothing there" is what makes the
    // range learnable.
    this.effects.shockwave(this.player.pos, 0xff3b30, MELEE_RANGE);
    if (hit) {
      this.ui.hitMarker();
      this.effects.addShake(0.08);
    } else {
      this.effects.addShake(0.03);
    }
  }

  // Single entry point for all damage to the player, passed to enemies and
  // projectiles through their ctx. `pos` is only used to place the hit spray.
  _hurtPlayer(d, pos) {
    if (this.state !== 'playing') return;
    // Holy Mantle. The ward eats the hit whole, however big it was, and is
    // spent doing it - it is a free mistake per wave, not damage reduction.
    if (this.player.wardReady) {
      this.player.wardReady = false;
      this.effects.shockwave(this.player.pos, 0x4ef3ff, 3.5, 0.4);
      this.effects.burst(pos, 0x4ef3ff, 16, 5, 2, 0.5);
      this.sfx.hit();
      this.ui.banner('WARD');
      return;
    }
    const h = this.player.takeDamage(d, this.time);
    this.stats.damaged += d;
    this.waveDamageTaken += d;
    this._shockwave();
    this.effects.addShake(0.25);
    this.effects.burst(pos, 0xff3b30, 12, 4, 1.5, 0.4);
    this.sfx.hurt();
    this.ui.damage();
    if (h > 0) return;
    // Dead Cat. One revive for the whole run, not one per wave: it is the
    // upside of a permanently smaller health pool, and refilling it every wave
    // would make the drawback free after the first clear.
    if (this.player.livesUsed < this.player.mods.extraLives) {
      this.player.livesUsed++;
      this.player.health = 1;
      this.player.shield = 40;
      this.player.shieldEnd = this.time + 3;
      this.effects.shockwave(this.player.pos, 0xff2d6f, 6, 0.5);
      this.effects.burst(this.player.eyeInto(this._killPos), 0xff2d6f, 40, 7, 3, 0.9);
      this.effects.addShake(0.3);
      this.ui.banner('NINE LIVES');
      return;
    }
    this.gameOver();
  }

  // `speedScale` is Cryo Rounds slowing the shot a slowed enemy fires. It is
  // baked in at spawn rather than read per frame: the round is already in the
  // air by the time the shooter thaws, and a shot that sped up mid-flight
  // would be unreadable.
  _spawnProjectile(x, y, z, type = 'shooter', speedScale = 1) {
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
    this.projectiles.push(
      new Projectile(this.scene, this.effects.glowTex, x, y, z, t, speed * speedScale, dmg, type)
    );
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
    // Claiming a totem takes priority over fighting, so the bot exercises the
    // upgrade path every wave instead of ignoring it - and now that the next
    // wave will not start until something is claimed, a bot that failed to
    // claim would hang the run rather than merely skip an upgrade.
    //
    // It SHOOTS the totem it wants rather than walking into it. Touch is a
    // 1.7m radius on totems spaced 3.6m apart, so a bot crossing the row to
    // reach a specific one clips whichever it passes and takes the wrong
    // upgrade - which is what made `picked up a weapon` fail about one run in
    // four, on the old code as well as the new. Shooting picks exactly the
    // totem it aimed at. It walks toward the target at the same time, so a
    // blocked line of sight resolves itself.
    let seekTotem = null;
    if (this.totemArea.active && !this.totemArea.claimed) {
      // While the second slot is empty the bot goes for a weapon totem
      // specifically, so the smoke test covers takeWeapon() deterministically
      // instead of depending on which totem happened to be nearest.
      const wantWeapon = !this.player.slots[1];
      let td = 1e9;
      for (const t of this.totemArea.totems) {
        if (!t.canClaim()) continue;
        const isWeapon = t.offer && t.offer.kind === 'weapon';
        if (wantWeapon && isWeapon) {
          seekTotem = t;
          break;
        }
        if (wantWeapon || isWeapon) continue;
        const d = t.pos.distanceTo(this.player.pos);
        if (d < td) {
          td = d;
          seekTotem = t;
        }
      }
    }

    let best = null;
    let bd = 1e9;
    for (const e of this.enemies) {
      const d = e.pos.distanceTo(this.player.pos);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }

    // Pick a weapon for the range. Without this the bot would hold a
    // scattergun at twenty metres, deal almost nothing, and stall on a wave
    // forever - which it did, silently, and left every downstream assertion
    // passing vacuously. The cooldown stops it oscillating on the boundary.
    this._swapCd -= 1 / 60;
    const stowedKey = this.player.slots[this.player.slot === 0 ? 1 : 0];
    if (best && stowedKey && this._swapCd <= 0) {
      const wantShort = bd < 7;
      const holdingShort = this.player.weapon.pellets > 1;
      const stowedShort = WEAPONS[stowedKey].pellets > 1;
      if (holdingShort !== wantShort && stowedShort === wantShort) {
        if (this.player.swapWeapon()) this._swapCd = 2;
      }
    }
    // Line up on the totem before firing at it. Until the bot is in position
    // it holds fire, because a shot from the wrong angle claims the wrong
    // upgrade just as effectively as a good one claims the right one.
    const lined = seekTotem ? this._botLineUp(seekTotem) : false;

    // The totem outranks the nearest enemy as an aim point: it is the thing
    // that has to be hit for the run to continue.
    const aimAt = seekTotem || best;
    if (aimAt) {
      const dx = aimAt.pos.x - this.player.pos.x;
      // Totems are aimed at icon height, enemies at the chest.
      const dy = (seekTotem ? 1.5 : 1.0) - (this.player.pos.y + 1.7);
      const dz = aimAt.pos.z - this.player.pos.z;
      const ty = Math.atan2(-dx, -dz);
      const tp = Math.atan2(dy, Math.hypot(dx, dz));
      // Sharper than it looks: at 0.18 the bot's aim lagged enough that it hit
      // one shot in five and died on wave 2, which left every assertion about
      // later waves passing vacuously.
      const k = 0.4;
      this.player.yaw += (ty - this.player.yaw) * k;
      this.player.pitch += (tp - this.player.pitch) * k;
      this.input.shoot = seekTotem ? lined : true;
      // The bot re-arms the edge every frame, so it fires semi-autos as fast
      // as their cooldown allows. Fine for a smoke test - it is exercising the
      // weapons, not simulating a human trigger finger.
      this.input.shootFresh = this.input.shoot;
    } else {
      this.input.shoot = false;
    }
    this._wt -= 1 / 60;
    if (this._wt <= 0) {
      this._wt = 1 + Math.random() * 2;
      this._dir = (Math.random() * 5) | 0;
    }
    // World-space direction to walk. Straight at a totem when one is up,
    // otherwise the random cardinal wander.
    let fx;
    let fz;
    if (seekTotem) {
      fx = this._botMove.x;
      fz = this._botMove.z;
    } else {
      const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0], [0, 0]];
      [fx, fz] = dirs[this._dir];
    }
    const sinY = Math.sin(this.player.yaw);
    const cosY = Math.cos(this.player.yaw);
    const lf = fx * -sinY + fz * -cosY;
    const lr = fx * cosY + fz * -sinY;
    this.input.forward = lf > 0.1;
    this.input.back = lf < -0.1;
    this.input.right = lr > 0.1;
    this.input.left = lr < -0.1;
    this.input.jump = Math.sin(this.time * 3) > 0.92;
  }

  // Autotest bot: manoeuvre into a position it can safely shoot `t` from,
  // writing the walk direction into this._botMove and returning whether it is
  // there yet. Three rules, in priority order:
  //
  //   1. Stay out of every totem's touch radius. Touch claims whatever it
  //      brushes, and the bot is trying to claim one SPECIFIC totem.
  //   2. Close to firing range.
  //   3. Sidestep until no other totem sits on the line of fire - the totems
  //      are in a row, so a bot approaching from the flank shoots through two
  //      of them to reach the third and claims the first one it hits.
  _botLineUp(t) {
    const p = this.player.pos;
    const m = this._botMove;
    m.x = 0;
    m.z = 0;

    for (const o of this.totemArea.totems) {
      if (o.state === 'hidden') continue;
      const ox = p.x - o.pos.x;
      const oz = p.z - o.pos.z;
      const d = Math.hypot(ox, oz);
      // Well outside TOUCH_RADIUS (1.7), with room for a frame of movement.
      if (d < 3 && d > 1e-3) {
        m.x = ox / d;
        m.z = oz / d;
        return false;
      }
    }

    const vx = t.pos.x - p.x;
    const vz = t.pos.z - p.z;
    const d = Math.hypot(vx, vz) || 1;
    if (d > 12) {
      m.x = vx / d;
      m.z = vz / d;
      return false;
    }

    for (const o of this.totemArea.totems) {
      if (o === t || o.state === 'hidden') continue;
      // Distance from the other totem to the segment player -> target.
      const l2 = vx * vx + vz * vz;
      const s = Math.max(0, Math.min(1, ((o.pos.x - p.x) * vx + (o.pos.z - p.z) * vz) / l2));
      const cx = p.x + vx * s - o.pos.x;
      const cz = p.z + vz * s - o.pos.z;
      if (cx * cx + cz * cz < 4) {
        // Strafe, always the same way round, so it sweeps clear instead of
        // oscillating on the boundary.
        m.x = -vz / d;
        m.z = vx / d;
        return false;
      }
    }
    return true;
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
        this.score += 100 * this.wave;
        this._payClearBonus();
        this._presentTotems();
        let msg = 'WAVE ' + this.wave + ' CLEARED  +' + this.lastGain + 'c';
        if (this.lastPerfect) msg += '  FLAWLESS';
        this.ui.banner(msg);
        this.sfx.wave();
      }
    } else if (this.waveState === 'intermission') {
      // The next wave is GATED ON A PICK, not on a clock. Nothing else in the
      // game stops for the player, so this is the one held boundary in a run
      // and it exists because a forfeited pick was invisible: the set sank, a
      // wave started, and nothing ever said what was lost. `!active` covers a
      // set that never rose - an empty roll, or one dismissed on a reset - so
      // an exhausted pool can never wedge the run.
      if (!this.totemArea.active || this.totemArea.claimed) {
        this.waveState = 'idle';
        this.interT = 0.4;
      }
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
    this.lastPerfect = this.waveDamageTaken <= 0;
    this.lastGain = this._award(this.lastPerfect ? base * 2 : base);
  }

  // Raises a fresh set of three totems. Called on every wave clear, so a set
  // the player never claimed is simply replaced - that pick is forfeited.
  _presentTotems(isReroll = false) {
    this.totemArea.present(this._buildOffers(), !isReroll);
    this._refreshStations();
  }

  // Normalises upgrades and weapons into the one shape a totem can draw, so
  // totems.js never has to know the difference between them.
  _buildOffers() {
    const ids = rollTotems(this.player.upgrades, this.wave, TOTEM_COUNT);
    const offers = ids.map((id) => {
      const def = UPGRADES[id];
      const owned = this.player.upgrades[id] || 0;
      return {
        id,
        kind: 'upgrade',
        name: def.name,
        theme: def.theme,
        icon: def.icon,
        rarityLabel: RARITY[def.rarity].label,
        rarityColor: RARITY[def.rarity].color,
        effects: def.effects,
        note: owned > 0 ? 'OWNED ' + owned + ' / ' + def.max : '',
      };
    });

    // Weapons the player is not already carrying can take over one slot of the
    // set. Offering a weapon they already hold would be a wasted totem.
    const missing = WEAPON_KEYS.filter((k) => !this.player.slots.includes(k));
    if (
      offers.length && missing.length &&
      this.wave >= WEAPON_FROM_WAVE && Math.random() < WEAPON_CHANCE
    ) {
      const key = missing[(Math.random() * missing.length) | 0];
      const w = WEAPONS[key];
      const displaced = this.player.weaponToDisplace();
      offers[(Math.random() * offers.length) | 0] = {
        id: key,
        kind: 'weapon',
        name: w.name,
        theme: w.theme,
        icon: w.icon,
        rarityLabel: 'WEAPON',
        rarityColor: '#ffffff',
        effects: w.effects,
        // Spelling out the trade matters: with both slots full, taking a
        // weapon throws one away, and that must never be a surprise.
        note: displaced ? 'REPLACES ' + WEAPONS[displaced].name : 'FILLS 2ND SLOT',
      };
    }
    return offers;
  }

  // Redraws both station labels. Only called when something they display
  // actually changes - a purchase, a reroll, or a new set - never per frame.
  _refreshStations() {
    const area = this.totemArea;
    area.ammoStation.setLabel(
      AMMO_PURCHASE.name,
      AMMO_PURCHASE.cost + 'c',
      this.credits >= AMMO_PURCHASE.cost && AMMO_PURCHASE.enabled(this.player)
    );
    const cost = rerollCost(area.rerolls);
    area.rerollStation.setLabel('REROLL', cost + 'c', this.credits >= cost && area.active);
  }

  // Grants the upgrade a totem is offering and sinks the whole set. Every
  // claim path - touch and shoot - funnels through here, so the guard against
  // double-claiming lives in exactly one place.
  _claimTotem(totem) {
    if (!totem.canClaim()) return;
    const offer = totem.offer;
    if (offer.kind === 'weapon') {
      if (!this.player.takeWeapon(offer.id)) return;
    } else if (!this.player.takeUpgrade(offer.id)) {
      return;
    }
    totem.claimed = true;

    const owned = offer.kind === 'upgrade' ? this.player.upgrades[offer.id] : 1;
    const max = offer.kind === 'upgrade' ? UPGRADES[offer.id].max : 1;
    this.ui.showUpgrade({
      name: offer.name,
      effects: offer.effects,
      rarity: offer.rarityLabel,
      color: '#' + offer.theme.toString(16).padStart(6, '0'),
      owned,
      max,
    });
    this.effects.burst(
      this._killPos.set(totem.pos.x, 1.4, totem.pos.z), offer.theme, 30, 7, 2.5, 0.7
    );
    this.effects.addShake(0.1);
    this.sfx.upgrade();
    this.totemArea.dismiss();
  }

  // Ticks the installation and claims by touch. Shooting a totem is handled in
  // shoot(), which already has the raycast.
  _updateTotems(dt) {
    const area = this.totemArea;
    area.update(dt, this.time, this.player.pos);

    const touched = area.touched(this.player.pos);
    if (touched) {
      this._claimTotem(touched);
      return;
    }

    const st = area.stationInRange(this.player.pos);
    if (!st) {
      // With the wave gated on a pick, silence here would read as the game
      // having stalled. A station prompt still wins - the player is standing
      // at one, so that is the thing they are asking about.
      this.ui.setPrompt(this._awaitingPick() ? 'TAKE A TOTEM TO CALL THE NEXT WAVE' : null, false);
      return;
    }
    const blocked = this._stationBlocked(st);
    if (blocked) {
      this.ui.setPrompt((st.kind === 'ammo' ? 'AMMO' : 'REROLL') + ' &nbsp;·&nbsp; ' + blocked, true);
    } else if (st.kind === 'ammo') {
      this.ui.setPrompt(
        '<b>SHOOT</b> / <b>E</b> ' + AMMO_PURCHASE.name + ' &nbsp;·&nbsp; ' + AMMO_PURCHASE.detail
        + ' &nbsp;·&nbsp; <span class="prompt-cost">' + AMMO_PURCHASE.cost + 'c</span>',
        false
      );
    } else {
      this.ui.setPrompt(
        '<b>SHOOT</b> / <b>E</b> REROLL &nbsp;·&nbsp; NEW UPGRADES &nbsp;·&nbsp; '
        + '<span class="prompt-cost">' + rerollCost(area.rerolls) + 'c</span>',
        false
      );
    }
  }

  // True while the run is held at the wave boundary waiting for the player to
  // take one of the totems that are standing.
  _awaitingPick() {
    return this.waveState === 'intermission' && this.totemArea.active && !this.totemArea.claimed;
  }

  // Why a station can't be used, or null if it can. Shared by the prompt and
  // the purchase so the two can never disagree.
  _stationBlocked(st) {
    if (st.kind === 'ammo') {
      if (!AMMO_PURCHASE.enabled(this.player)) return 'AMMO FULL';
      if (this.credits < AMMO_PURCHASE.cost) return 'NEED ' + AMMO_PURCHASE.cost + 'c';
      return null;
    }
    const cost = rerollCost(this.totemArea.rerolls);
    if (!this.totemArea.active || this.totemArea.claimed) return 'NOTHING TO REROLL';
    if (this.credits < cost) return 'NEED ' + cost + 'c';
    return null;
  }

  // E at a station, from anywhere in its radius.
  tryUseStation() {
    if (this.state !== 'playing') return;
    const st = this.totemArea.stationInRange(this.player.pos);
    if (st) this._useStation(st);
  }

  // A pellet hit a station. One purchase per STATION_SHOOT_COOLDOWN however
  // many pellets or shots land inside it, so holding the trigger on the
  // reroll console buys one reroll and not eight.
  _shootStation(st) {
    if (this.state !== 'playing' || !st.canShoot()) return;
    st.shootCd = STATION_SHOOT_COOLDOWN;
    this._useStation(st);
  }

  // Buying ammo leaves the totems standing; rerolling redraws all three,
  // because re-offering an upgrade the player just paid to replace makes the
  // reroll feel rigged.
  _useStation(st) {
    if (this._stationBlocked(st)) {
      this.sfx.denied();
      return;
    }
    if (st.kind === 'ammo') {
      this.credits -= AMMO_PURCHASE.cost;
      AMMO_PURCHASE.apply(this.player, this.time);
      this.sfx.buy();
    } else {
      this.credits -= rerollCost(this.totemArea.rerolls);
      this.totemArea.rerolls++;
      this._presentTotems(true);
      this.sfx.reroll();
    }
    this.effects.burst(st.pos, st.color, 16, 5, 2, 0.45);
    this._refreshStations();
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
    // Refresh the route to the player once for the whole list, before anyone
    // reads it. The grid throttles itself; this call is cheap on most frames.
    this.nav.update(dt, this.player.pos.x, this.player.pos.z);

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
      // Blast Corpse and Incendiary's spread both need the enemy list intact,
      // so they are only noted here and played after the sweep.
      const wasBurning = e.status.burn > 0;
      if (this.player.mods.corpseDamage > 0 || (this.player.mods.burnSpread > 0 && wasBurning)) {
        this._recordDeath(e.pos, wasBurning);
      }
      this.scene.remove(e.group);
      if (e.type === 'splitter') this._splitInto(e);
      e.dispose();
    }
    list.length = write;
    // Children of a splitter join the roster only after the sweep, so they are
    // never visited by the loop that created them.
    for (const mini of this._pendingSpawns) list.push(mini);
    this._pendingSpawns.length = 0;
    if (this._deathCount > 0) this._playDeaths();
  }

  // Notes a death that owes an after-effect. Vectors are reused across frames;
  // the arrays only ever grow to the largest number of deaths seen in one
  // frame, which a wave clear bounds naturally.
  _recordDeath(pos, burning) {
    const i = this._deathCount++;
    if (!this._deathPos[i]) this._deathPos[i] = new THREE.Vector3();
    this._deathPos[i].set(pos.x, 0.9, pos.z);
    this._deathBurn[i] = burning;
  }

  // Blast Corpse and Incendiary's spread, played once the enemy list is whole
  // again. The corpse blast damages the player too - that is the cost of the
  // pick, and it routes through _hurtPlayer so Holy Mantle and Dead Cat see it.
  _playDeaths() {
    const m = this.player.mods;
    for (let i = 0; i < this._deathCount; i++) {
      const at = this._deathPos[i];
      if (m.corpseDamage > 0) {
        this._blast(at, m.corpseDamage, m.corpseRadius, null, true);
      }
      // The fire jumps to exactly one neighbour, so a burning crowd cascades
      // one enemy at a time rather than igniting the whole arena at once.
      if (m.burnSpread > 0 && this._deathBurn[i]) {
        let best = null;
        let bestD = m.burnSpread;
        for (const e of this.enemies) {
          if (e.dead || e.status.burn > 0) continue;
          const d = e.pos.distanceTo(at);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        if (best) {
          best.applyStatus('burn', m.burnTime, m.burnDps);
          this.effects.burst(at, 0xff7a18, 8, 4, 2, 0.4);
        }
      }
    }
    this._deathCount = 0;
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
    this.ui.setReloadProgress(this.player.reloadProgress);
    const other = this.player.slots[this.player.slot === 0 ? 1 : 0];
    this.ui.setWeapon(this.player.weapon.name, other ? WEAPONS[other].name : null);
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
      // One press is one frame of freshness: a semi-auto click made during the
      // fire cooldown is dropped, not queued.
      this.input.shootFresh = false;
      if (this.input.melee) this.tryMelee();
      this._updatePickups(dt);
      this._updateTotems(dt);
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
