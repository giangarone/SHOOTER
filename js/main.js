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
import { Player, NO_HIT_CAP } from './player.js';
import { Enemy, Projectile, Grenade, Shard, Spit, ENEMY_TYPES } from './enemy.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';
import { SFX } from './sfx.js';
import { Music } from './music.js';
import { Rig } from './rig.js';
import * as leaderboard from './leaderboard.js';
import { waveConfig, bossScale, pickAddType } from './waves.js';
import { calcDropsForWave, pickDropType, spawnDropAt, spawnRelief } from './powerups.js';
import {
  UPGRADES, AMMO_PURCHASE, rollTotems, rollDeals, rerollCost,
  dealRerollCost, effectLines,
} from './upgrades.js';
import { TotemArea, ARM_TIME_DEVIL } from './totems.js';
import { DevilArea } from './devil.js';
import { NavGrid } from './nav.js';
import { resolveCircle, BOSS_HEIGHT } from './utils.js';

// ?autotest makes the game play itself and exposes window.__game and
// window.__report() for test/smoke.mjs. It also skips pointer lock, which
// headless Chrome can't grant.
const autotest = new URLSearchParams(location.search).has('autotest');

// Pickup budget. Every pickup in the arena is a draw call and a collision
// check, and unbounded spawning was the cause of the arena filling with ammo.
const MAX_ACTIVE_PICKUPS = 12;
// How much loose ammo the arena may hold at once. The old timer needed this to
// stop it flooding the map; the budget bounds a wave's total now, but the cap
// stays because need-weighting alone would let an empty player's whole budget
// land as ammo and nothing else.
const MAX_ACTIVE_AMMO = 5;

// ---- drops ---------------------------------------------------------------
// Pickups come off the enemies that die, not from timers around the map.
//
// A wave carries a fixed budget (calcDropsForWave) and each kill's chance to
// drop is `budget remaining / enemies remaining`, so the budget is always
// spent in full and always spread evenly - a wave contains the same loot
// whether it is cleared fast or slow, which is what keeps two runs comparable.
// What each drop turns out to BE is need-weighted; how MUCH drops is not.
//
// Boss waves cannot use a budget: their adds are endless, so there is no
// denominator. They pay out per add kill at a flat rate, plus the boss itself
// shedding a pickup as it crosses each health threshold.
const BOSS_ADD_DROP_CHANCE = 0.2;
const BOSS_BLEED_THRESHOLDS = [0.75, 0.5, 0.25];

// The safety net. Kill drops alone would be a death spiral: out of ammo means
// no kills, and no kills means no ammo. If either bar is under its floor and
// nothing has dropped for a while, one is placed near the player regardless of
// how the fight is going.
const RELIEF_INTERVAL = 10;
const RELIEF_HEALTH_FRAC = 0.35;
const RELIEF_AMMO = 40;
// Retry delay used when a spawn is skipped because a cap is already reached,
// so a blocked spawn can never be retried every single frame.
const SPAWN_RETRY = 2;

// Enemy shots, grenades and Reload Burst's shards share one pool. Raised from
// 24 when Reload Burst arrived: eight shards live for well under a second, but
// a reload during a heavy wave would otherwise spend the whole budget and
// silently drop enemy fire, which reads as the wave going quiet.
//
// Raised again for bosses, and SPLIT. Herald throws five-shot volleys on top
// of whatever the adds are firing, and with one shared ceiling a boss wave
// could hold the pool full for seconds at a time - which would silently
// cancel Reload Burst, an upgrade the player paid for. Enemies stop at
// MAX_ENEMY_PROJECTILES, so eight slots are always there for the shards.
const MAX_PROJECTILES = 48;
const MAX_ENEMY_PROJECTILES = 40;
const EMPTY_CLICK_COOLDOWN = 0.35;

// Seconds a station ignores further hits after one is bought by shooting it.
// A held trigger lands several pellets per second on the same box, and every
// one of those would otherwise be a separate purchase.
const STATION_SHOOT_COOLDOWN = 0.25;

// NO-SPAWN BUBBLE. No enemy is ever placed closer than this to the player.
// The spawn grid sits near the arena edges, but the player is free to stand on
// one, and materialising a charger inside their hitbox is damage they had no
// chance to avoid. Ten metres was not enough on its own: a chaser covers that
// in under three seconds, and the jitter applied to a spawn point could take a
// metre back off it. This is a medium bubble - wide enough that anything that
// appears has to visibly travel to reach the player, well short of the arena's
// 21 metre half-width so the grid always has points outside it.
const MIN_SPAWN_DISTANCE = 16;

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
// Deals the Devil puts up, and how likely he is to be there at all after a
// wave the player did NOT clear cleanly. A clean wave summons him outright.
//
// The asymmetry is the whole design: the Devil is a REWARD for not being hit,
// paid in the one currency being hit takes from you. A player having a bad run
// meets him rarely, which is correct - selling max HP is the last thing they
// should be doing - and a player having a perfect one is offered the knife
// every single wave.
const DEVIL_COUNT = 3;
const DEVIL_CHANCE_HURT = 0.15;
// Double Dash: how close together two presses of the SAME movement key have to
// be to read as a double-tap. Long enough to hit reliably mid-fight, short
// enough that ordinary strafe-corrections never trip it by accident.
const DOUBLE_TAP_WINDOW = 0.28;
// Ashen: how many clouds can be alive at once, and how often Neurotoxin's
// poison is allowed to make a jump.
const MAX_ASH_CLOUDS = 8;
// Hellfire's trail. Sized like the magma trail it mirrors (MAX_LAVA) rather
// than like an ash cloud: it is a LINE of small short-lived patches dropped as
// the player runs, not a handful of big ones, and the oldest is recycled so
// the tail burns out behind them instead of the head refusing to appear.
const MAX_FIRE_PATCHES = 20;
// How far the player has to move before the trail drops another patch. Small
// enough to leave an unbroken line at a walk, large enough that standing still
// after a reload lays one patch and not twenty.
const FIRE_STEP = 0.85;
const CREEP_FIRE = 0xff5a00;
// Lingering zones that damage the PLAYER. There are two kinds and they are
// capped separately, because they are completely different shapes of threat:
//
//   pool  a blight's lob, or Herald's spray - big, slow, one at a time, and
//         sitting exactly where the player is standing. Four overlapping ones
//         already means the ground is gone.
//   lava  a magma walker's trail - small, constant, and a dozen alive per
//         enemy by design. It is the LINE it draws that matters, so capping it
//         with the pools would either starve the pools or cut the trail into
//         disconnected dots.
//
// A single list holds both and eviction is per kind, so a magma running laps
// can never push a blight pool out from under the player's feet.
const MAX_POOLS = 4;
const MAX_LAVA = 24;
// Ground-patch colours. THE FIRST QUESTION a patch of floor has to answer is
// whose it is, and the shape family answers it first (see makeCreepShape in
// effects.js), the PULSE second - hostile patches breathe, the player's are
// still. Colour is the third signal and no longer the deciding one, which is
// what frees ash to be the colour it should always have been: it is the ash of
// a fire mutation, so it is warm. It used to be cyan, which read as ice or as
// a pickup and never as the thing Incendiary left behind.
//
// Ash is amber and lava is a deeper red so the two stay apart at distance
// while both staying in the fire family; the blight's toxic green is a
// different hue from either.
const CREEP_ASH = 0xff8a3d;
const CREEP_HAZARD = 0xaaff2a;
const CREEP_LAVA = 0xff4a10;
// Impact-puff colours for an enemy round that broke against geometry, keyed by
// the projectile's own type so the splash matches what was in the air. Mirrors
// PROJ_COLORS in enemy.js; a type with no entry falls back to the shooter's.
const PROJ_IMPACT = {
  shooter: 0xb14aed,
  sniper: 0x00ff88,
  blight: 0xaaff2a,
  colossus: 0xff5a00,
  harrier: 0x27c4ff,
};
// Telegraphed impact circles - Siege's barrage. Capped at the telegraph pool's
// depth minus the handles the bosses hold for their own warnings.
const MAX_MORTARS = 6;
// The boss kill's own payout, separate from the wave clear bonus.
const BOSS_BONUS_BASE = 400;
const BOSS_BONUS_PER_WAVE = 60;
// Display names, kept out of ENEMY_TYPES because nothing else in the game
// needs an enemy to have one.
const BOSS_NAMES = {
  colossus: 'COLOSSUS',
  siege: 'SIEGE',
  schism: 'SCHISM',
  maw: 'MAW',
  herald: 'HERALD',
};
const POISON_SPREAD_INTERVAL = 0.5;

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
    // The lighting show that plays over the arena. Built here, before anything
    // can cue it, and it creates every light it will ever use up front - see
    // the light-count note in arena.js.
    this.rig = new Rig(this.scene, this.arena);
    // One navigation grid, shared by every enemy alive. It is baked from the
    // arena's obstacles at startup and reflooded toward the player a few times
    // a second - see nav.js for why it is one field rather than a path each.
    this.nav = new NavGrid(this.arena.obstacles, ARENA_BOUND, 0.5);
    // A second grid baked for wide bodies. The first is cut for a 0.5m agent,
    // so a boss steered by it would be routed through gaps it cannot fit
    // through and grind against the corners. Flooded only while something big
    // is actually alive, which is never on a normal wave.
    // Also taller: a boss stands well clear of the perimeter catwalks that
    // ordinary enemies walk under, so anything overhead is a wall to it.
    this.navBig = new NavGrid(this.arena.obstacles, ARENA_BOUND, 1.6, BOSS_HEIGHT);
    // The totems and their stations are static furniture: three totems and two
    // stations, built once and reused for every set. They are deliberately NOT
    // in the obstacle list. That USED to be because walking into one claimed
    // it, so nobody could stand inside one anyway; now that a claim takes a
    // shot or an E press, the reason is simply that the row stands in the
    // middle of the arena mid-run and solid pillars there would be five new
    // things to get caught on while a wave is chasing you.
    this.totemArea = new TotemArea(this.scene);
    // The Devil's installation, on the far side of the arena. Built once and
    // reused like the totems, and hidden for most of a run.
    this.devilArea = new DevilArea(this.scene);
    this.player = new Player(this.camera, this.scene);
    this.effects = new Effects(this.scene);
    this.ui = new UI();
    this.sfx = new SFX();
    this.music = new Music('/assets/audio/soundtrack.m4a');
    // Read before the first gesture builds the graph, so a muted player never
    // hears the opening bar leak out before the setting is applied.
    try { this.music.muted = localStorage.getItem('va-music-muted') === '1'; } catch {}
    // Prefilled into the name field so a returning player just presses Enter.
    this._lastName = '';
    try { this._lastName = localStorage.getItem('va-last-name') || ''; } catch {}
    // The run waiting to be named, or null. Guards against double submission.
    this._pending = null;

    this.state = 'menu';
    this.score = 0;
    this.kills = 0;
    this.credits = 0;
    this.comboKills = 0;
    this.comboTimer = 0;
    this.player.setBloodlustStacks(0);
    this.bestCombo = 0;
    // Reset at the start of every wave; drives the perfect-clear bonus.
    this.waveDamageTaken = 0;
    // Credits paid by the last wave clear, and whether it was flawless. Both
    // are shown in the wave-cleared banner.
    this.lastGain = 0;
    this.lastPerfect = false;
    this.wave = 0;
    this.enemies = [];
    this.projectiles = [];
    this.powerups = [];
    this.queue = [];
    this._cfg = waveConfig(1);
    // Pickups this wave still has to give, and the safety-net countdown.
    this.dropsLeft = 0;
    this._reliefT = RELIEF_INTERVAL;
    this.spawnTimer = 0;
    // The live boss fight, or null. `parts` is every entity that counts as the
    // boss - one for most of them, several once Schism has split.
    this.bossFight = null;
    this.waveState = 'idle';
    this.interT = 1.2;
    this.time = 0;
    this.stats = { shotsFired: 0, hits: 0, spawned: 0, damaged: 0 };
    // `shootFresh` is the trigger EDGE - true only on the frame the button
    // went down. Semi-auto weapons need it; the loop clears it every frame.
    this.input = { forward: false, back: false, left: false, right: false, jump: false, shoot: false, shootFresh: false, melee: false, dash: null };
    // Double Dash: the game time each movement key was last pressed FRESH, so
    // a second press inside DOUBLE_TAP_WINDOW reads as a dash. Keyed by
    // e.code; a key held down never writes here (see _bind).
    this._tapT = { KeyW: -99, KeyS: -99, KeyA: -99, KeyD: -99 };
    // Whether the held-TAB build sheet is up. Held, not toggled, so it has to
    // be released by keyup AND by blur - alt-tabbing away with it down would
    // otherwise leave it stuck over the fight on the way back.
    this._statsHeld = false;
    this.emptyClickCd = 0;

    // Refilled and handed to the rig every frame. One object for the life of
    // the game, per the no-allocation rule below.
    this._rigState = {
      mode: 'idle', beat: 0, level: 0, bar: 0, downbeat: false,
      healthFrac: 1, comboMult: 1, bossColor: 0xffffff, bossPos: null,
    };

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
    // Lightning Wizard's strike point. Its OWN scratch and not _blastAt: a
    // bolt is rolled inside _landShot, before Detonator has fired, and sharing
    // the vector moved Detonator's blast onto whatever the last bolt hit.
    this._boltAt = new THREE.Vector3();
    this._blastHit = false;
    // Where the last pellet stopped, for Breach Round's blast.
    this._lastImpact = new THREE.Vector3();
    this._pullTo = new THREE.Vector3();
    this._shardDir = new THREE.Vector3();
    // Seeker's scratch: the candidate's world position, the direction to it,
    // its own hit list, and the candidates already rejected for being behind
    // cover this shot.
    this._homeAt = new THREE.Vector3();
    this._homeDir = new THREE.Vector3();
    this._homeRay = new THREE.Raycaster();
    this._homeHits = [];
    this._homeSkip = [];
    this._chainFrom = new THREE.Vector3();
    this._chainTo = new THREE.Vector3();
    // Deaths that owe an after-effect, recorded during the enemy sweep and
    // played once it has finished. Doing it inline would let a corpse blast
    // read the enemy list while it is half-compacted - the same hazard the
    // sweep itself is written to avoid. Both arrays are grown once and reused.
    this._deathPos = [];
    this._deathBurn = [];
    this._deathFrozen = [];
    // Ashen's lingering clouds. Capped because each one drips particles every
    // frame it is alive and a wave clear can kill twenty burning enemies at
    // once; the oldest is recycled rather than the newest refused, so the
    // cloud you just made is always the one that exists.
    this._ash = [];
    // Hellfire: the trail itself, when it is burning, and where the last patch
    // was laid so the next one waits for FIRE_STEP of movement.
    this._fire = [];
    this._fireUntil = 0;
    this._fireLastX = 0;
    this._fireLastZ = 0;
    this._ashAt = new THREE.Vector3();
    // Player-damaging ground zones, and telegraphed impacts. Both are plain
    // data with no scene objects of their own, the same trick _ash uses: the
    // hazards are drawn by the particle pool and the mortars by the telegraph
    // pool, so creating one costs nothing and disposing one is a splice.
    //
    // Hazards are a SEPARATE list from _ash rather than a flag on it: the ash
    // loop walks every enemy while this one tests a single player, so folding
    // them together would put a branch in a hot loop that is wrong half the
    // time it runs.
    this._hazard = [];
    this._mortars = [];
    this._spreadCd = 0;
    this._deathCount = 0;
    // Live enemies wide enough to need the big-agent nav grid. Counted during
    // the sweep so the grid is only flooded on the waves that have one.
    this._bigAlive = 0;
    this._enemyCtx = {
      player: this.player,
      enemies: this.enemies,
      obstacles: this.arena.obstacles,
      nav: this.nav,
      navBig: this.navBig,
      time: 0,
      // The music, for the crowd bob in Enemy.update. Refreshed every frame
      // alongside `time` - never captured, for the same reason `mods` is not.
      beat: 0,
      level: 0,
      // `source` is the enemy that landed the hit, where there is one. Only
      // Thorns reads it, and it falls back to whatever is standing closest to
      // the impact - a projectile has no owner to name.
      onHitPlayer: (d, pos, source) => this._hurtPlayer(d, pos, source),
      addProjectile: (x, y, z, type, speedScale, spreadRad) =>
        this._spawnProjectile(x, y, z, type, speedScale, spreadRad),
      addGrenade: (x, y, z, damage) => this._spawnGrenade(x, y, z, damage),
      addSpit: (x, y, z) => this._spawnSpit(x, y, z),
      addHazard: (x, z, radius, life, dps, kind) =>
        this._addHazard(x, z, radius, life, dps, kind),
      addMortar: (x, z, radius, delay, damage) => this._addMortar(x, z, radius, delay, damage),
      pullPlayer: (dx, dz, strength) => this._pullPlayer(dx, dz, strength),
      bossEvent: (kind, enemy) => this._bossEvent(kind, enemy),
      // `mods` is deliberately absent here: rebuildMods() swaps the object on
      // every draft pick, so anything captured at construction goes stale on
      // the first upgrade. _updateEnemies() sets it fresh each frame, before
      // any enemy reads it.
      effects: this.effects,
      sfx: this.sfx,
    };
    this._projCtx = {
      // GROUND obstacles, not all of them: a shot fired at a player up on a
      // catwalk must not stop against the deck they are standing on. The high
      // ground is meant to buy sightlines and cost you cover, so the decks are
      // deliberately not bulletproof. Do not "fix" this to arena.obstacles.
      obstacles: this.arena.ground,
      onHitPlayer: (d, pos) => this._hurtPlayer(d, pos),
      // Reload Burst's shards damage enemies and never the player, so they get
      // the enemy list and a blast that cannot reach back.
      enemies: this.enemies,
      onBlast: (pos, dmg, radius) => this._blast(pos, dmg, radius, null, false),
      // A blight's spit grows its pool where it lands, so the projectile ctx
      // needs the same hazard hook the enemy ctx has. Kind is left to default:
      // a spit is a pool, and it is capped against the other pools.
      addHazard: (x, z, radius, life, dps, kind) =>
        this._addHazard(x, z, radius, life, dps, kind),
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
      this.beginGame();
      window.__game = this;
      // The upgrade table, for tests that need to tell a free mutation from a
      // Devil Deal. Autotest only, like everything else in this block.
      this.__upgradesForTest = UPGRADES;
      // The Enemy class, so a test can stand one up without a wave.
      this.__EnemyForTest = Enemy;
      window.__report = () => ({
        state: this.state,
        wave: this.wave,
        score: this.score,
        kills: this.kills,
        credits: this.credits,
        bestCombo: this.bestCombo,
        upgrades: { ...this.player.upgrades },
        upgradeCount: Object.values(this.player.upgrades).reduce((a, b) => a + b, 0),
        weapon: this.player.weapon.name,
        // The receiver plates and the marked upgrades they stand for. Kept
        // side by side so the smoke test can assert they agree.
        gunMarks: this.player.gun.getObjectByName('marks').children
          .reduce((n, m) => n + (m.visible ? 1 : 0), 0),
        markedUpgrades: Object.keys(this.player.upgrades)
          .filter((id) => UPGRADES[id] && UPGRADES[id].mark).length,
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
      // The leaderboard name field is the only text input in the game, and
      // these handlers are on the window. Without this, typing a space into it
      // would be swallowed by the jump binding's preventDefault, and R and E
      // would fire game actions mid-word.
      if (this._typing(e.target)) return;
      switch (e.code) {
        case 'KeyW': this._tapMove(e.code, this.input.forward); this.input.forward = true; break;
        case 'KeyS': this._tapMove(e.code, this.input.back); this.input.back = true; break;
        case 'KeyA': this._tapMove(e.code, this.input.left); this.input.left = true; break;
        case 'KeyD': this._tapMove(e.code, this.input.right); this.input.right = true; break;
        case 'Space': this.input.jump = true; e.preventDefault(); break;
        case 'KeyR': this.tryReload(); break;
        case 'KeyE': this.tryUse(); break;
        // Fullscreen is bound on the window rather than to a button alone so
        // it is reachable mid-run without giving up pointer lock to click.
        case 'KeyF': this._toggleFullscreen(); break;
        // Held, and preventDefault for the same reason Space gets it: these
        // listeners are on the window, and an un-prevented Tab walks browser
        // focus off the canvas and out of pointer lock.
        case 'Tab': this._openStats(); e.preventDefault(); break;
      }
    });
    addEventListener('keyup', (e) => {
      if (this._typing(e.target)) return;
      switch (e.code) {
        case 'KeyW': this.input.forward = false; break;
        case 'KeyS': this.input.back = false; break;
        case 'KeyA': this.input.left = false; break;
        case 'KeyD': this.input.right = false; break;
        case 'Space': this.input.jump = false; break;
        case 'Tab': this._closeStats(); e.preventDefault(); break;
      }
    });
    // Losing focus mid-key would otherwise leave the player running forever,
    // or reading a stat panel it can no longer be told to close.
    addEventListener('blur', () => {
      this._clearInput();
      this._closeStats();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this._audioGesture();
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
          this._closeStats();
          this.ui.showPause();
        }
      } else if (this.state === 'paused') {
        this.state = 'playing';
        this.ui.hidePause();
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const onStart = () => {
      this._audioGesture();
      if (this.state === 'menu') this.beginGame();
    };
    document.getElementById('overlay-start').addEventListener('click', onStart);
    document.getElementById('btn-start').addEventListener('click', (e) => {
      e.stopPropagation();
      onStart();
    });
    document.getElementById('btn-restart').addEventListener('click', (e) => {
      e.stopPropagation();
      this._audioGesture();
      // Restarting without pressing SAVE still banks the run - losing a top-ten
      // score because you hit the obvious button first would be indefensible.
      this._saveScore();
      this.beginGame();
    });
    // Mute toggles live on the start and pause overlays. Both overlays are
    // themselves click-to-continue, so these must stop the event or muting
    // would also start or resume the run.
    this._muteBtns = [document.getElementById('btn-mute-start'), document.getElementById('btn-mute-pause')];
    for (const b of this._muteBtns) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.music.toggleMute();
        this._saveMuted();
        this._syncMuteBtns();
      });
    }
    this._syncMuteBtns();

    // Fullscreen toggles, one per overlay, plus the F binding above. Same
    // stopPropagation reasoning as the mute buttons: the overlays are
    // click-to-continue and this must not also start or resume the run.
    this._fsBtns = [document.getElementById('btn-fs-start'), document.getElementById('btn-fs-pause')];
    for (const b of this._fsBtns) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleFullscreen();
      });
    }
    // The browser owns this state - Esc and the F11 key change it without
    // going through either path above - so the label is driven by the event
    // rather than written at the point of the toggle.
    document.addEventListener('fullscreenchange', () => this._syncFsBtns());
    document.addEventListener('webkitfullscreenchange', () => this._syncFsBtns());
    this._syncFsBtns();

    // Name entry. Both paths go through _saveScore, which is idempotent.
    document.getElementById('btn-lb-save').addEventListener('click', (e) => {
      e.stopPropagation();
      this._saveScore();
    });
    this.ui.lbName.addEventListener('keydown', (e) => {
      // Enter commits. Stopped from propagating so it cannot also reach the
      // overlay handlers and restart the run out from under the player.
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this._saveScore();
      }
    });
    // Clicking the field must not fall through to anything that restarts.
    this.ui.lbName.addEventListener('click', (e) => e.stopPropagation());
    this.ui.renderBoard(this.ui.lbStart, leaderboard.load(), -1);

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
    i.dash = null;
    for (const k in this._tapT) this._tapT[k] = -99;
  }

  // Double Dash's tap clock. `held` is whether that direction was ALREADY down
  // when the key event arrived: a held key repeats keydown at the OS repeat
  // rate, which would otherwise read as a double-tap the moment a player ran
  // in a straight line. Only a fresh press is timed.
  _tapMove(code, held) {
    if (held) return;
    const last = this._tapT[code];
    if (this.time - last < DOUBLE_TAP_WINDOW) {
      this.input.dash = code;
      // Cleared so a third tap has to start a new pair rather than firing
      // again off the same timestamp.
      this._tapT[code] = -99;
    } else {
      this._tapT[code] = this.time;
    }
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
    this._pendingSpawns.length = 0;
    this._bigAlive = 0;
    this.dropsLeft = 0;
    this._reliefT = RELIEF_INTERVAL;
    this.bossFight = null;
    this.ui.setBoss(null, 0, '', '');
    // Lingering zones have to go with the entities that made them. A hazard
    // pool left behind would start the next run already burning the player,
    // standing on a patch of floor nothing on screen explains.
    this._clearHazards();
    for (const a of this._ash) this.effects.creepRelease(a.creep);
    this._ash.length = 0;
    for (const f of this._fire) this.effects.creepRelease(f.creep);
    this._fire.length = 0;
    this._fireUntil = 0;
  }

  // Both buttons show one shared state, so muting on the pause screen is
  // still muted when the start screen comes back after a death.
  // Requests fullscreen on the whole document rather than on the canvas, so
  // the HUD, the overlays and the strobe overlay come with it - a fullscreen
  // canvas alone would leave the run with no health bar. The locked pointer
  // survives because the element it is locked to is inside the one going
  // fullscreen.
  _toggleFullscreen() {
    const d = document;
    const on = d.fullscreenElement || d.webkitFullscreenElement;
    // Both calls reject on a browser that refuses the gesture (or has
    // fullscreen disabled by policy). Nothing to recover, so it is swallowed
    // and the label re-syncs from the event that never arrives.
    const p = on
      ? (d.exitFullscreen || d.webkitExitFullscreen).call(d)
      : (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen)
        .call(d.documentElement);
    if (p && p.catch) p.catch(() => {});
  }

  _syncFsBtns() {
    if (!this._fsBtns) return;
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    for (const b of this._fsBtns) {
      b.textContent = on ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
      b.classList.toggle('off', on);
    }
  }

  _syncMuteBtns() {
    const m = this.music.muted;
    for (const b of this._muteBtns) {
      b.textContent = m ? 'MUSIC OFF' : 'MUSIC ON';
      b.classList.toggle('off', m);
    }
  }

  // Storage throws in private-mode Safari and when cookies are blocked, and a
  // failed preference save is not worth taking the game down for.
  _saveMuted() {
    try { localStorage.setItem('va-music-muted', this.music.muted ? '1' : '0'); } catch {}
  }

  // Fills the object the rig reads. Mutates in place and returns it, so the
  // loop allocates nothing.
  //
  // `mode` is derived from the SAME condition the music muffle uses, so the
  // house lights and the muffled track can never disagree about whether the
  // party is on: combat is the only state that is neither muffled nor lit by
  // the house lights.
  _fillRigState() {
    const r = this._rigState;
    const combat = this.state === 'playing' && this.waveState === 'active';
    r.mode = combat ? (this.bossFight ? 'boss' : 'combat')
      : this.waveState === 'intermission' && this.state === 'playing' ? 'house'
        : 'idle';
    r.beat = this.music.beat;
    r.level = this.music.level;
    // Position in the bar and whether this beat is the ONE. music.js keeps
    // both running whether or not the beat map is driving, so the rig never
    // has to ask which source it is getting.
    r.bar = this.music.bar;
    r.downbeat = this.music.downbeat;
    // Clamped: a health pickup can overheal past max, which would drive the
    // low-health maths backwards.
    r.healthFrac = Math.max(0, Math.min(1, this.player.health / this.player.maxHealth));
    r.comboMult = this.comboMult();
    if (this.bossFight && this.bossFight.parts.length) {
      const boss = this.bossFight.parts[0];
      r.bossColor = ENEMY_TYPES[this.bossFight.key].color;
      r.bossPos = boss.pos;
    } else {
      r.bossPos = null;
    }
    return r;
  }

  // True when a text field has focus, so the global key handlers stand down.
  _typing(el) {
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  // Called once the run is over and the score is final. Shows the board, and
  // opens the name field first when the run placed.
  _postScore() {
    this._pending = null;
    if (leaderboard.qualifies(this.score, this.wave)) {
      this._pending = {
        score: this.score, wave: this.wave, kills: this.kills, combo: this.bestCombo,
      };
      this.ui.showNameEntry(this._lastName);
      // The board underneath still shows the standing table, so the player can
      // see what they are about to break into.
      this.ui.renderBoard(this.ui.lbOver, leaderboard.load(), -1);
    } else {
      this.ui.hideNameEntry();
      this.ui.renderBoard(this.ui.lbOver, leaderboard.load(), -1);
    }
  }

  // Commits the pending run under whatever name is in the field. Safe to call
  // twice - the second call has nothing pending and does nothing, which is what
  // stops a double-click from writing the run in twice.
  _saveScore() {
    if (!this._pending) return;
    const name = (this.ui.lbName.value || '').trim().slice(0, 12) || 'ANON';
    this._lastName = name;
    try { localStorage.setItem('va-last-name', name); } catch {}
    const { list, index } = leaderboard.add({ ...this._pending, name });
    this._pending = null;
    this.ui.hideNameEntry();
    this.ui.renderBoard(this.ui.lbOver, list, index);
    this.sfx.upgrade();
  }

  // Primes the audio graph and gets the soundtrack going. Every user gesture
  // that reaches audio routes through here rather than calling sfx.ensure()
  // directly, because the music has to be (re)started on a gesture too and a
  // gesture that primed only one of the two was the original bug here.
  _audioGesture() {
    this.sfx.ensure();
    this.music.start(this.sfx.ctx);
  }

  // True when the music should sound muffled: anything that is not live
  // combat. Combat is the ONLY clean state - intermission (walking the totems
  // to pick a mutation), the menu, pause and the death screen are all behind
  // the filter, which makes "the music opened up" mean "you are fighting".
  _musicMuffled() {
    return this.state !== 'playing' || this.waveState !== 'active';
  }

  // Starts a fresh run from the menu or the game-over screen. Anything that
  // changes during play must be reset here, including the spawn timers -
  // leftover state used to carry into the next run.
  beginGame() {
    this._audioGesture();
    // Any unnamed run is banked before the state that produced it is reset.
    this._saveScore();
    this.ui.hideNameEntry();
    this.ui.renderBoard(this.ui.lbStart, leaderboard.load(), -1);
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
    this.totemArea.dismiss();
    this.devilArea.dismiss();
    this.wave = 0;
    this.queue.length = 0;
    this.waveState = 'idle';
    this.interT = 1.2;
    this.spawnTimer = 0;
    this.dropsLeft = 0;
    this._reliefT = RELIEF_INTERVAL;
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
    // The Devil keeps wave-break hours. An unclaimed TOTEM set is deliberately
    // left standing into the next wave - that pick is still there to be taken -
    // but a deal pillar standing through a fight would be a shootable box that
    // costs health to touch by accident, in a room the player is running
    // around at speed. He goes whether or not anything was bought.
    this.devilArea.dismiss();
    this.wave++;
    this._cfg = waveConfig(this.wave);
    this.queue = this._cfg.queue;
    this.spawnTimer = 0.8;
    this.waveState = 'active';
    this.bossFight = null;
    this.ui.setWave(this.wave);
    this.ui.banner('WAVE ' + this.wave);
    this.sfx.wave();
    // Blackout, then the whole rig hits at once. The dark beat before it is
    // what makes the hit land - a bright room just getting brighter reads as
    // nothing at all.
    this.rig.cueWaveStart();

    this.waveDamageTaken = 0;
    this.player.armWard();
    // The wave's whole loot budget, spent across its kills.
    this.dropsLeft = calcDropsForWave(this.wave);
    this._reliefT = RELIEF_INTERVAL;
    if (this._cfg.boss) this._spawnBoss(this._cfg.bossKey);
  }

  // ---- boss waves --------------------------------------------------------

  // Places the boss and opens the fight. Unlike a normal spawn this ignores
  // the drip: the boss is there from the first second, and the adds arrive
  // around it.
  _spawnBoss(key) {
    const sc = bossScale(this.wave);
    const def = ENEMY_TYPES[key];
    // The farthest spawn point, not the first clear one. A boss appearing at
    // the edge of vision is an entrance; one appearing at arm's length is an
    // ambush the player had no way to read.
    let best = this.arena.spawnPoints[0];
    let bestD = -1;
    for (const sp of this.arena.spawnPoints) {
      const d = sp.distanceTo(this.player.pos);
      if (d > bestD) {
        bestD = d;
        best = sp;
      }
    }
    const at = new THREE.Vector3(best.x, 0, best.z);
    resolveCircle(at, def.radius, this.arena.obstacles, BOSS_HEIGHT);
    // EXECUTIONER, folded into the wave's own scaling rather than applied to
    // the boss afterwards: hp here is a MULTIPLIER on the type's base block,
    // so halving it halves both the health bar and the max the bar is drawn
    // against. A boss already standing keeps the health it arrived with.
    const boss = new Enemy(key, at, sc.hp * this.player.mods.bossHpMult, sc.speed, sc.dmg);
    boss.rate = sc.rate;
    boss.cycle = Math.floor((this.wave - 1) / 25);
    this.scene.add(boss.group);
    this.enemies.push(boss);
    this._bigAlive++;

    this.bossFight = {
      key,
      name: BOSS_NAMES[key],
      parts: [boss],
      totalMaxHp: boss.maxHp,
      addTimer: 3,
      maxAdds: this._cfg.maxAdds,
      addInterval: this._cfg.addInterval,
      // How many health thresholds the boss has already bled a pickup at.
      bleedAt: 0,
      note: '',
      state: '',
    };
    this.effects.burst(at, def.color, 40, 8, 3, 1.0);
    this.effects.shockwave(at, def.color, 8, 0.7);
    this.effects.addShake(0.4);
    this.ui.banner(BOSS_NAMES[key]);
    this.sfx.wave();
    this.rig.setEnraged(false);
  }

  // Live health across every part, for the bar.
  _bossHpFrac() {
    const bf = this.bossFight;
    if (!bf || !bf.totalMaxHp) return 0;
    let hp = 0;
    for (const p of bf.parts) hp += p.hp;
    return hp / bf.totalMaxHp;
  }

  // Boss-specific announcements. Kept in one place so a boss's ai() does not
  // need to know anything about the HUD.
  _bossEvent(kind, enemy) {
    const bf = this.bossFight;
    if (!bf) return;
    if (kind === 'stagger') {
      bf.state = 'vulnerable';
      bf.note = 'STAGGERED';
      this.ui.banner('STAGGERED');
      this.sfx.hit();
      // Black out, then flare white as it comes back up.
      this.rig.cueStagger();
    } else if (kind === 'recover') {
      bf.state = '';
      // Back to whatever the core is doing, not to blank: a boss standing back
      // up with its shutters still open must not read as a window that closed.
      bf.note = enemy.bs && enemy.bs.weakOpen ? 'CORE EXPOSED' : '';
      this.rig.setEnraged(false);
    } else if (kind === 'vent') {
      // Colossus's chest core opening and closing. The quietest boss note
      // there is, and it yields to STAGGERED and ENRAGED - those are one-shot
      // events the player must not lose sight of behind a label that changes
      // every few seconds.
      if (!bf.state) bf.note = enemy.bs.weakOpen ? 'CORE EXPOSED' : '';
    } else if (kind === 'charge') {
      this.sfx.wave();
    } else if (kind === 'enrage') {
      bf.state = 'enraged';
      bf.note = 'ENRAGED';
      this.ui.banner('ENRAGED');
      this.sfx.wave();
      // Hands the room over to a red alarm until the boss recovers or dies.
      this.rig.setEnraged(true);
    } else if (kind === 'split') {
      this._splitBoss(enemy);
    }
  }

  // Schism's split. Called from a boss's ai() through ctx.bossEvent, which
  // means it runs DURING _updateEnemies' update pass - the parent is still
  // alive and still in both lists at this point.
  //
  // The children go to _pendingSpawns like a splitter's minis, so they are not
  // visited by the loop that created them, and into `parts` immediately. That
  // second write is what keeps the wave from ending: the parent is removed
  // from `parts` later in the same frame, and if the children were not already
  // there the next _updateWave would see an empty parts list and call the
  // fight won.
  _splitBoss(e) {
    const bf = this.bossFight;
    if (!bf) return;
    const sc = bossScale(this.wave);
    const tier = e.bs.tier;
    // Each half carries half the parent's remaining pool, so the total health
    // left in the fight is unchanged by the split itself.
    const half = e.maxHp * 0.5;
    for (let i = 0; i < 2; i++) {
      const ang = (i === 0 ? 1 : -1) * 1.2 + Math.random() * 0.4;
      const at = new THREE.Vector3(
        e.pos.x + Math.cos(ang) * 2.2, 0, e.pos.z + Math.sin(ang) * 2.2
      );
      const child = new Enemy('schism', at, sc.hp, sc.speed, sc.dmg);
      child.rate = e.rate;
      child.cycle = e.cycle;
      child.maxHp = half;
      child.hp = half;
      child.bs.tier = tier;
      // The geometry cache bakes `scale` per TYPE, so a child cannot have its
      // own - visual size comes from the group, exactly as a splitter's minis
      // do. Collision and melee reach follow through `radius`.
      const shrink = tier === 1 ? 0.68 : 0.46;
      child.group.scale.setScalar(shrink);
      child.radius = ENEMY_TYPES.schism.radius * shrink;
      child.speed = e.speed * (tier === 1 ? 1.2 : 1.4);
      // The score is divided rather than duplicated: splitting is the boss
      // surviving, not four more bosses to be paid for.
      child.score = Math.round(e.score * 0.5);
      resolveCircle(child.pos, child.radius, this.arena.obstacles, child.collideH);
      this.scene.add(child.group);
      this._pendingSpawns.push(child);
      bf.parts.push(child);
    }
    // The parent dies of the split itself.
    e.hp = 0;
    e.dead = true;
    e.score = 0;
    bf.note = 'PARTS ' + bf.parts.length;
    this.effects.shockwave(e.pos, ENEMY_TYPES.schism.color, 6, 0.5);
    this.effects.burst(
      this._killPos.set(e.pos.x, 1.2, e.pos.z), ENEMY_TYPES.schism.color, 30, 7, 2.5, 0.7
    );
    this.effects.addShake(0.25);
    this.ui.banner('IT SPLITS');
    this.sfx.wave();
  }

  // Adds keep arriving for as long as the boss lives. There is no budget: the
  // only bound is how many may be alive at once, so a player who kills them
  // faster simply gets more of them, and one who ignores them is surrounded.
  _updateBossAdds(dt) {
    const bf = this.bossFight;
    bf.addTimer -= dt;
    if (bf.addTimer > 0) return;
    bf.addTimer = bf.addInterval;
    if (this.enemies.length - bf.parts.length >= bf.maxAdds) return;
    this.spawnEnemy(pickAddType(this.wave));
  }

  // Ends a boss wave the moment the last part dies. Everything still on the
  // field is cleared out - the fight is over, and leaving a handful of adds to
  // mop up would end the wave on an anticlimax.
  //
  // Deliberately no score and no combo for the purge: five free kills at the
  // wave boundary would inflate both the payout and the best-chain stat with
  // something the player did not do.
  _finishBossWave() {
    for (const e of this.enemies) {
      this.effects.burst(this._killPos.set(e.pos.x, e.pos.y + 0.8, e.pos.z), e.colorHex, 14, 5, 2, 0.5);
      this.scene.remove(e.group);
      e.dispose();
    }
    this.enemies.length = 0;
    this._bigAlive = 0;
    this._clearHazards();
    this.bossFight = null;
    this.ui.setBoss(null, 0, '', '');
    // Hands the room back: the boss colour and the tightened fog both release
    // once nothing is driving them.
    this.rig.setEnraged(false);
  }

  // The boss kill's own payout, on top of the ordinary clear bonus.
  //
  // MONEY ONLY. It used to hand back a full health bar and a full reserve as
  // well, which quietly undid the fight: whatever the boss had cost was
  // refunded the instant it died, so there was no such thing as coming out of
  // one in trouble. The player is paid enough to buy what they need at the
  // stations, and choosing between health and ammo with a fixed sum is the
  // decision the free refill was taking away.
  _payBossBonus() {
    const bonus = BOSS_BONUS_BASE + BOSS_BONUS_PER_WAVE * this.wave;
    this.score += bonus * 4;
    const paid = this._award(bonus);
    this.effects.shockwave(this.player.pos, 0x00e676, 6, 0.6);
    this.ui.banner('BOSS DOWN  +$' + paid);
  }

  spawnEnemy(type) {
    const j = this._pickSpawnPos();
    const e = new Enemy(type, j, this._cfg.hpScale, this._cfg.speedScale, this._cfg.dmgScale);
    this.scene.add(e.group);
    this.enemies.push(e);
    this.effects.burst(j, e.colorHex, 12, 3, 2, 0.4);
    this.stats.spawned++;
  }

  // A jittered spawn point outside the no-spawn bubble. Walks the grid from a
  // random start and takes the first point that clears the distance; if the
  // player has somehow crowded all of them, the farthest one is used rather
  // than giving up and spawning on top of them.
  //
  // The jitter is applied FIRST and then checked, because it is up to a metre
  // in each axis and can carry a point that only just cleared the bubble back
  // inside it - which is exactly the case the bubble exists for. A jittered
  // point that fails is pushed straight back out along the line from the
  // player, so the spread survives and the guarantee holds.
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
    const at = new THREE.Vector3(
      best.x + (Math.random() - 0.5) * 2, 0, best.z + (Math.random() - 0.5) * 2
    );
    const dx = at.x - this.player.pos.x;
    const dz = at.z - this.player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001 && d < MIN_SPAWN_DISTANCE) {
      const k = MIN_SPAWN_DISTANCE / d;
      at.x = this.player.pos.x + dx * k;
      at.z = this.player.pos.z + dz * k;
      // Pushing outward can leave the arena; the walls are at 21.6.
      at.x = Math.max(-21, Math.min(21, at.x));
      at.z = Math.max(-21, Math.min(21, at.z));
    }
    return at;
  }

  gameOver() {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this._clearInput();
    // A panel held open across the death would sit over the game-over screen
    // with no key left to release it.
    this._closeStats();
    if (!this.autoTest && document.pointerLockElement) document.exitPointerLock();
    const eye = this.player.eyeInto(this._killPos);
    this.effects.burst(eye, 0x4ef3ff, 40, 6, 3, 0.9);
    this.comboKills = 0;
    this.comboTimer = 0;
    this.player.setBloodlustStacks(0);
    this.ui.setPrompt(null, false);
    this.ui.setBoss(null, 0, '', '');
    // The boss keeps its telegraphs until it is disposed, and on the game-over
    // screen it never is - release them with the fight.
    if (this.bossFight) {
      for (const p of this.bossFight.parts) {
        const def = ENEMY_TYPES[p.type];
        if (def.cleanup) def.cleanup(p);
      }
      this.bossFight = null;
    }
    this._clearHazards();
    this.ui.showOver(this.score, this.wave, this.kills, this.bestCombo);
    this._postScore();
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
    this.player.setBloodlustStacks(this.comboKills);
  }

  // Reactive Plating. Detonates around the player when they are hit; damage
  // and radius both come from the mods so extra stacks widen it.
  // THORNS. Half of what an attacker just dealt goes straight back into it.
  //
  // `source` is the enemy where the hit came from a body or a swing; a
  // projectile has no owner by the time it lands, so the nearest enemy to the
  // impact takes it instead. That is not a compromise - the thing that shot
  // you is usually the thing standing closest to where the round hit you, and
  // a mutation that silently did nothing against half the roster would read as
  // broken long before anyone worked out why.
  _thorns(d, pos, source) {
    const frac = this.player.mods.thorns;
    if (frac <= 0 || d <= 0) return;
    let target = source && !source.dead ? source : null;
    if (!target && pos) {
      let bestD = 36;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dd = e.pos.distanceToSquared(pos);
        if (dd < bestD) {
          bestD = dd;
          target = e;
        }
      }
    }
    if (!target) return;
    target.takeDamage(d * frac);
    this.effects.burst(target.pos, 0xd84315, 8, 3, 1.6, 0.35);
  }

  _shockwave() {
    const mods = this.player.mods;
    if (mods.shockwave <= 0) return;
    const r = mods.shockwaveRadius;
    for (const e of this.enemies) {
      if (e.pos.distanceTo(this.player.pos) > r) continue;
      e.takeDamage(mods.shockwave);
      // Heavy things take the damage but do not budge - see `immovable` in
      // enemy.js. A boss knocked out of its own charge would not be a fight.
      if (e.immovable) continue;
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
    best.takeDamage(
      dmg, false, best.pos.x - from.pos.x, best.pos.z - from.pos.z
    );
    this.effects.tracer(
      this._chainFrom.set(from.pos.x, 1.0, from.pos.z),
      this._chainTo.set(best.pos.x, 1.0, best.pos.z)
    );
    this.effects.burst(this._chainTo, 0x9ff3ff, 6, 3, 1.5, 0.3);
  }

  // Lightning Wizard. A bolt out of the sky onto the enemy that was hit: the
  // full damage to them, and a smaller share to everything standing around
  // them, so it is worth firing into the middle of a crowd rather than at its
  // edge.
  //
  // The splash goes through _blast with the struck enemy skipped, because
  // _blast already owns radial falloff and the enemy list, and a second copy
  // of that arithmetic here would be one more place for the two to disagree.
  // It cannot hurt the player: the bolt is the player's, and a mutation that
  // rolled itself 5% of the time and occasionally killed you would be a curse.
  _lightning(en) {
    const m = this.player.mods;
    this._boltAt.set(en.pos.x, 0, en.pos.z);
    // The direct hit first. A warden's dome can eat it, exactly like a bullet.
    en.takeDamage(m.lightningDamage);
    this._blast(this._boltAt, m.lightningSplash, m.lightningRadius, en, false);
    this.effects.lightning(en.pos.x, en.pos.z, m.lightningRadius);
    this.sfx.kill();
  }

  // OVERLOAD. Every enemy in the arena loses a fifth of its MAXIMUM health the
  // moment the magazine runs dry.
  //
  // A fraction rather than a flat number, and read off maxHp rather than off
  // what is left, so one bar's worth is one bar's worth whether the target is
  // a wave-4 chaser or a wave-40 boss - it is the only thing in the pool that
  // scales with the enemy instead of with the build. It cannot finish anything
  // on its own for the same reason it cannot be farmed: the damage is fixed
  // and the trigger costs a whole magazine.
  _overload() {
    const frac = this.player.mods.overloadFrac;
    let struck = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.takeDamage(e.maxHp * frac);
      struck++;
      // The visual is capped: a wave with thirty enemies in it would otherwise
      // spend the whole particle budget on one keypress.
      if (struck <= 10) this.effects.lightning(e.pos.x, e.pos.z, 2.5);
    }
    if (!struck) return;
    this.effects.addShake(0.3);
    this.sfx.kill();
  }

  // Knockout Drops. Shoves an enemy along the shot, then resolves it out of
  // any obstacle it landed in - without that, a shove into cover would leave
  // the enemy stuck inside a crate.
  _shove(en, dir, dist) {
    if (en.immovable) return;
    en.pos.add(this._knockback.set(dir.x, 0, dir.z).normalize().multiplyScalar(dist));
    resolveCircle(en.pos, en.radius, this.arena.obstacles, en.collideH);
  }

  // Gravity Rounds. Drags everything around the impact toward it, the pull
  // fading to nothing at the edge of the radius so an enemy at 5m twitches and
  // one at arm's length is yanked. `skip` is the enemy that took the shot: it
  // is already at the impact point, and pulling it into itself jitters it.
  _pull(point, radius, dist, skip) {
    for (const e of this.enemies) {
      if (e === skip || e.dead || e.immovable) continue;
      const d = e.pos.distanceTo(point);
      if (d > radius || d < 0.001) continue;
      this._pullTo.set(point.x - e.pos.x, 0, point.z - e.pos.z).normalize();
      e.pos.addScaledVector(this._pullTo, Math.min(dist * (1 - d / radius), d));
      resolveCircle(e.pos, e.radius, this.arena.obstacles, e.collideH);
    }
    this.effects.burst(point, 0x536dfe, 10, 3, 1.5, 0.35);
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

  // Seeker's rescue. Finds the enemy closest to the line of fire inside the
  // cone, confirms it is actually visible, and lands the shot on it with a
  // curved tracer.
  //
  // The curve is not decoration. Without it a player whose crosshair was off
  // would watch a miss register as a hit with nothing to explain it; the bend
  // is the game saying what it did, which is the whole reason this shape was
  // chosen over silently widening the hitbox.
  //
  // A homed shot hits exactly ONE enemy and stops. It never carries on through
  // a pierce chain: re-homing at every step would let a single round walk
  // itself through an entire wave.
  //
  // Candidates are tried nearest-to-aim first and skipped when something is in
  // the way, rather than giving up on the first blocked one - the enemy
  // closest to your crosshair being behind a pillar should not stop the round
  // finding the one standing beside it in the open.
  _homeShot(ray, muzzle, w, dmgMult, burst) {
    const m = this.player.mods;
    const origin = ray.ray.origin;
    const aim = ray.ray.direction;
    const skip = this._homeSkip;
    const minDot = Math.cos(m.homingAngle);
    let landed = false;

    for (let attempt = 0; attempt < 3 && !landed; attempt++) {
      let best = null;
      let bestDot = minDot;
      for (const e of this.enemies) {
        if (e.dead || skip.includes(e)) continue;
        // The hitbox rather than e.pos: aiming at an enemy's feet would push
        // every candidate below the line of fire and make the cone read as
        // being lower than it is.
        e.hitbox.getWorldPosition(this._homeAt);
        const v = this._homeDir.subVectors(this._homeAt, origin);
        const d = v.length();
        if (d > m.homingRange || d < 0.001) continue;
        v.multiplyScalar(1 / d);
        const dot = v.dot(aim);
        if (dot <= bestDot) continue;
        bestDot = dot;
        best = e;
      }
      if (!best) break;

      // Line of sight, cast from the same origin the shot used so what the
      // round can reach is exactly what the player can see.
      best.hitbox.getWorldPosition(this._homeAt);
      this._homeDir.subVectors(this._homeAt, origin).normalize();
      this._homeRay.set(origin, this._homeDir);
      const hits = this._homeHits;
      hits.length = 0;
      this._homeRay.intersectObjects(this._targets, false, hits);
      if (hits.length && hits[0].object.userData.enemy === best) {
        const dealt = this.player.getEffectiveDamage(w.damage * m.volleyDamage) * dmgMult;
        this._landShot(best, hits[0].point, this._homeDir, dealt, burst);
        this._lastImpact.copy(hits[0].point);
        this.effects.arc(muzzle, hits[0].point, aim);
        // A second burst in Seeker's own colour on top of the ordinary hit
        // spray. The curve is a one-pixel line and can be missed in a crowd;
        // this makes a rescued shot read differently from one the player
        // actually landed, which is the whole point of showing the mechanic.
        this.effects.burst(hits[0].point, 0xff5fd2, 8, 3, 1.5, 0.35);
        landed = true;
      } else {
        skip.push(best);
      }
      hits.length = 0;
    }

    skip.length = 0;
    return landed;
  }

  // Everything one pellet does to the enemy it landed on.
  //
  // Shared by the straight shot and by Seeker's homed shot, so the two cannot
  // drift: status, chaining, knockback and Detonator have to behave the same
  // whether the player's aim was on target or the round curved onto it.
  // `dir` is the direction the shot ARRIVED from, which is what armour reads.
  _landShot(en, point, dir, dealt, burst) {
    const m = this.player.mods;
    // A warded enemy eats the shot whole (see Enemy.takeDamage). It gets the
    // stone-grey spark rather than the ordinary yellow one, so a player
    // emptying a magazine into a group under a warden's dome is told why
    // nothing is dying by the hits themselves, not just by the health bar.
    if (en.wardT > 0) {
      this.effects.burst(point, 0xc9d2dd, burst, 3, 1.2, 0.3);
      return;
    }
    en.takeDamage(dealt, false, dir.x, dir.z);
    this.effects.burst(point, 0xffe95e, burst, 4, 1.5, 0.35);
    // Damage is per-pellet; everything below is per-shot.
    if (this._shotHits.has(en)) return;
    this._shotHits.add(en);
    // Malady scales the two statuses that HAVE a strength. Cryo, Terror
    // and Petrify are left alone: shortening them buys nothing back.
    if (m.poisonTime) {
      en.applyStatus('poison', m.poisonTime * m.dotTime, m.poisonDps * m.dotPower);
    }
    if (m.burnTime) en.applyStatus('burn', m.burnTime * m.dotTime, m.burnDps * m.dotPower);
    if (m.slowTime) en.applyStatus('slow', m.slowTime);
    if (m.fearTime) en.applyStatus('fear', m.fearTime);
    if (m.petrifyChance && Math.random() < m.petrifyChance) {
      en.applyStatus('freeze', m.petrifyTime);
    }
    if (m.lightningChance && Math.random() < m.lightningChance) {
      this._lightning(en);
    }
    if (m.chainDamage) this._chain(en, dealt * m.chainDamage, m.chainRange);
    if (m.knockback) this._shove(en, dir, m.knockback);
    if (m.gravityPull) this._pull(point, m.gravityRadius, m.gravityPull, en);
    if (m.midas) this.effects.burst(point, 0xffd600, 6, 3, 1.5, 0.35);
    // Detonator goes off once per trigger pull, at the first enemy the
    // shot touched. Per-pellet it would fire eight blasts from one shell
    // and exhaust the four-ring pool on its own.
    if (m.blastDamage && !this._blastHit) {
      this._blastHit = true;
      this._blastAt.copy(point);
    }
  }

  // One pellet of a shot. Walks the sorted hit list so a piercing weapon can
  // pass through several enemies, stopping at the first thing that is not one.
  // Returns true if it damaged anything, so the caller can play a single hit
  // sound per shot rather than one per pellet.
  _firePellet(muzzle, targets, spread, w, dmgMult = 1) {
    const m = this.player.mods;
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
    // Piercing Shot adds to whatever the weapon pierces on its own, and its
    // steeper falloff replaces the weapon's - a shot that keeps full damage
    // through four enemies is worth more than any other pick in the pool.
    const pierceCap = w.pierce + m.pierce;
    const falloff = m.pierce > 0 ? Math.min(w.falloff, m.pierceFalloff) : w.falloff;
    let end = null;
    let pierced = 0;
    let damaged = false;
    // A pellet that stopped on a totem or a station was aimed there on
    // purpose. Seeker must not treat that as a miss and steal it.
    let hitProp = false;

    for (const h of hits) {
      const totem = h.object.userData.totem;
      if (totem) {
        // Anywhere on the totem claims it. The pellet stops either way - a
        // totem already claimed is a wall, not a hole to shoot enemies past.
        this._claimTotem(totem);
        hitProp = true;
        end = h.point;
        this.effects.burst(end, totem.offer ? totem.offer.theme : 0x9fb4d8,
          w.pellets > 1 ? 3 : 8, 3, 1.5, 0.3);
        break;
      }
      const deal = h.object.userData.deal;
      if (deal) {
        // Same contract as a totem: the pellet stops on the pillar whether or
        // not the deal was taken. A deal the player cannot afford is a wall.
        this._claimDeal(deal);
        hitProp = true;
        end = h.point;
        this.effects.burst(end, deal.offer ? deal.offer.theme : 0xff1744,
          w.pellets > 1 ? 3 : 8, 3, 1.5, 0.3);
        break;
      }
      const heart = h.object.userData.devilHeart;
      if (heart) {
        // The heart is a console, and consoles are rate-limited: a held
        // trigger lands several pellets a second on it and every one of those
        // would otherwise be a reroll priced in health.
        if (heart.canShoot()) {
          heart.shootCd = STATION_SHOOT_COOLDOWN;
          this._rerollDeals();
        }
        hitProp = true;
        end = h.point;
        this.effects.burst(end, 0xff1744, w.pellets > 1 ? 3 : 8, 3, 1.5, 0.3);
        break;
      }
      const station = h.object.userData.station;
      if (station) {
        // The pellet stops here whether or not the purchase went through -
        // a station on cooldown is a wall, not a hole to shoot enemies past.
        this._shootStation(station);
        hitProp = true;
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
      const dealt = this.player.getEffectiveDamage(w.damage * m.volleyDamage)
        * Math.pow(falloff, pierced) * dmgMult;
      this._landShot(en, h.point, ray.ray.direction, dealt, burst);
      damaged = true;
      pierced++;
      if (pierced > pierceCap) {
        end = h.point;
        break;
      }
    }

    hits.length = 0;

    // SEEKER. Only ever runs on a pellet that touched no enemy, which is what
    // makes the mutation purely additive: a shot already on target is never
    // moved, so it cannot drag a round off a Colossus weak point or a
    // Bulwark's flank that the player deliberately lined up.
    if (!damaged && !hitProp && m.homingAngle > 0
      && this._homeShot(ray, muzzle, w, dmgMult, burst)) {
      return true;
    }

    if (!end) end = ray.ray.at(60, this._rayEnd);
    // Breach Round detonates wherever the shot stopped - an enemy, a wall or
    // the floor - so the last impact point is kept for the caller.
    this._lastImpact.copy(end);
    this.effects.tracer(muzzle, end);
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

    const mods = this.player.mods;
    // Breach Round. The reload arms it and this shot spends it, whether or not
    // it hits anything - a wasted breach round is the cost of firing one at
    // nothing, and it re-arms on the next reload either way.
    const charged = mods.chargeDamage > 0 && this.player.breachReady;
    this.player.breachReady = false;

    // Cursed Ammo, rolled once per trigger pull. The floor is what keeps it
    // playable: a held trigger must never be able to kill you on its own.
    let dmgMult = 1;
    if (mods.cursedChance > 0 && this.player.health > 1
      && Math.random() < mods.cursedChance) {
      this.player.health = Math.max(1, this.player.health - 1);
      dmgMult += mods.cursedDamage;
      this.effects.burst(this.player.eyeInto(this._killPos), 0x6a1b9a, 10, 4, 2, 0.35);
    }

    // DEVIL'S GAMBLE, rolled once per trigger pull and applied to every pellet
    // in it. Per SHOT and not per pellet on purpose: nine pellets each tossing
    // their own coin would average out to almost exactly nothing, and the
    // whole deal is that a shot is either a windfall or a waste.
    if (mods.gamble > 0) {
      const won = Math.random() < 0.51;
      dmgMult *= won ? 2 : 0.5;
      this.effects.burst(
        this.player.muzzleInto(this._killPos), won ? 0xffd600 : 0x5b6785, 6, 3, 1.6, 0.25
      );
    }

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
    this.devilArea.addTargets(targets);

    // Moving costs accuracy. This used to be a sprint-key test; with the key
    // gone it reads live speed instead, which also means it fades in and out
    // with the player rather than snapping.
    const spread = w.spread + (this.player.speedXZ > 6 ? 0.016 : 0);
    let hitAny = false;
    this._shotHits.clear();
    this._blastHit = false;
    // Twenty/Twenty fires the whole pellet pattern twice off one round. The
    // dedup set is NOT cleared between volleys - both barrels are one trigger
    // pull, so an enemy caught by both still takes one dose of status.
    for (let v = 0; v < mods.volley; v++) {
      for (let i = 0; i < w.pellets; i++) {
        if (this._firePellet(muzzle, targets, spread, w, dmgMult)) hitAny = true;
      }
    }
    if (this._blastHit) {
      this._blast(this._blastAt, mods.blastDamage, mods.blastRadius, null, false);
    }
    // Breach Round fires wherever the shot stopped, which is why it is here and
    // not in the enemy branch: a breach round buried in a wall still goes off.
    if (charged) {
      this._blast(this._lastImpact, mods.chargeDamage, mods.chargeRadius, null, false);
      this.effects.addShake(0.2);
    }
    this._shotHits.clear();

    // Hot Streak rides the SHOT, not the pellet: one trigger pull is one step
    // up or one step down however many pellets were in it, and it reads the
    // same boolean the hitmarker below does so the two can never disagree.
    this.player.bumpStreak(hitAny);

    // OVERLOAD. The magazine running dry calls lightning down on the whole
    // room. Fired here rather than in tryShoot() because it has to be the
    // shot that emptied the gun and not the click after it, and because a
    // fraction of MAX HP means the enemy list has to be walked anyway.
    if (mods.overloadFrac > 0 && this.player.mag <= 0) this._overload();

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
      // Reach grows with the target: a boss two metres wide would otherwise be
      // unmeleeable, since its surface is already past MELEE_RANGE while its
      // centre is far outside it.
      if (d > MELEE_RANGE + e.radius - 0.5) continue;
      // Anything the player is standing inside has no meaningful direction, so
      // it is always in the arc.
      if (d > 0.001 && (dx * forward.x + dz * forward.z) / d < cosArc) continue;
      // A swing travels from the player toward the enemy, which is what tells
      // a shield or a weak point whether it was struck.
      e.takeDamage(dealt, false, dx / (d || 1), dz / (d || 1));
      if (!e.immovable) {
        e.pos.add(
          this._knockback.subVectors(e.pos, this.player.pos).setY(0).normalize().multiplyScalar(3)
        );
      }
      this.effects.burst(
        this._killPos.set(e.pos.x, e.pos.y + 1.1, e.pos.z), 0xffd600, 12, 4, 1.5, 0.4
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
  _hurtPlayer(d, pos, source = null) {
    if (this.state !== 'playing') return;
    // Demonic Dodge's invulnerability window, before anything else - it is a
    // second in which nothing lands at all, so there is nothing here for the
    // ward or Evasion to spend themselves on.
    if (this.time < this.player.invulnEnd) return;
    // Thorns pays out on the hit that was ATTEMPTED, which is why it sits
    // above the dodge and the ward: something reached the player either way,
    // and an attacker that got away with it because the ward happened to be up
    // is the one case where the mutation would read as broken.
    this._thorns(d, pos, source);
    // Evasion, rolled before the ward: a dodge is free and the ward is a
    // limited charge, so spending the charge on a hit that was going to miss
    // anyway would be strictly worse for the player. A dodge has to be LOUD -
    // a hit that silently fails to land reads as nothing happening at all.
    if (this.player.mods.dodgeChance > 0 && Math.random() < this.player.mods.dodgeChance) {
      this.player.startDodge(this.time);
      // Demonic Dodge's half: a second of invulnerability to leave in and
      // three of doubled damage to answer with. A no-op for a player who owns
      // only Evasion, which is why the roll above is shared.
      this.player.startDodgeReward(this.time);
      this.effects.shockwave(this.player.pos, 0x18ffff, 3, 0.35);
      this.effects.burst(pos, 0x18ffff, 14, 5, 2.5, 0.4);
      this.sfx.melee();
      this.ui.banner(this.player.mods.dodgeRage > 0 ? 'DODGE  \u00b7  RAGE' : 'DODGE');
      return;
    }
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
    // Blood Pact. Applied after the ward and the dodge, because those are
    // about whether a hit lands at all and this is about how much it costs.
    d *= this.player.mods.damageTakenMult;
    // Carnage resets on any hit that actually lands, and Absolute Zero's
    // drawback plants the player for a second. Both are the price of the deal.
    this.player.clearCarnage();
    this.player.freeze(this.time);
    const h = this.player.takeDamage(d, this.time);
    this.stats.damaged += d;
    this.waveDamageTaken += d;
    this._shockwave();
    this.effects.addShake(0.25);
    this.effects.burst(pos, 0xff3b30, 12, 4, 1.5, 0.4);
    this.sfx.hurt();
    this.ui.damage();
    // A hard white blink over the red vignette. Shorter than the vignette on
    // purpose, so the two read as one hit rather than two events.
    this.rig.cueDamage();
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
  //
  // `spreadRad` yaws the aim off the player by that many radians, which is how
  // a caller fires a FAN: three rounds from one muzzle at -a, 0 and +a diverge
  // with range, where three muzzles all aiming at the player would converge and
  // either all hit or all miss.
  _spawnProjectile(x, y, z, type = 'shooter', speedScale = 1, spreadRad = 0) {
    if (this.projectiles.length >= MAX_ENEMY_PROJECTILES) return;
    const t = this.player.eyeInto(this._aimTarget);
    if (spreadRad) {
      const dx = t.x - x;
      const dz = t.z - z;
      const c = Math.cos(spreadRad);
      const sn = Math.sin(spreadRad);
      t.x = x + dx * c - dz * sn;
      t.z = z + dx * sn + dz * c;
    }
    let speed, dmg;
    if (type === 'sniper') {
      speed = Math.min(32, 22 + this.wave * 0.4);
      dmg = Math.min(22, 12 + this.wave * 0.5);
    } else if (type === 'harrier') {
      // Fast and light. A harrier fires THREE of these per descent, so each
      // one has to cost well under a third of what a shooter's single round
      // does or the burst would be the hardest hit in the wave - and it is
      // fired from close range, at a target that has just been given a reason
      // to stand still and shoot back.
      speed = Math.min(26, 18 + this.wave * 0.25);
      dmg = Math.min(11, 6 + this.wave * 0.25);
    } else if (type === 'colossus') {
      // Slower and heavier than an ordinary shooter round. The vent is the
      // window the player closes in to use, so what comes out of it has to be
      // dodgeable at short range and cost real health if it is not.
      speed = Math.min(17, 12 + this.wave * 0.2);
      dmg = Math.min(24, 11 + this.wave * 0.5);
    } else {
      speed = Math.min(20, 13 + this.wave * 0.3);
      dmg = Math.min(20, 8 + this.wave * 0.8);
    }
    // Absolute Zero applied HERE and nowhere else, so every enemy round in the
    // game is covered by one line - including the boss volleys that pass a
    // speedScale of 1 and never touch Enemy._projScale(). Cryo's own slow is
    // already baked into `speedScale` by the caller, and the two multiply.
    const slow = this.player.mods.worldSlow;
    this.projectiles.push(
      new Projectile(
        this.scene, this.effects.glowTex, x, y, z, t, speed * speedScale * slow, dmg, type
      )
    );
  }

  _spawnGrenade(x, y, z, damage) {
    if (this.projectiles.length >= MAX_ENEMY_PROJECTILES) return;
    const t = this.player.eyeInto(this._aimTarget);
    const speed = Math.min(18, 12 + this.wave * 0.2);
    const dmg = Math.min(28, damage + this.wave * 0.5);
    this.projectiles.push(new Grenade(this.scene, this.effects.glowTex, x, y, z, t, speed, dmg));
  }

  // A blight's lobbed glob. The arc is solved here rather than fired at a fixed
  // elevation like a grenade, because the pool has to land somewhere the player
  // could have been: horizontal speed is constant, the flight time falls out of
  // the range, and the vertical impulse is whatever puts the glob on the ground
  // at the end of it.
  //
  // AIM LEADS BY ALMOST THE WHOLE FLIGHT. Holding a straight line has to stay
  // punished - that was the point of the old instant pool, and a shot that
  // systematically fell short would have replaced an unfair enemy with a
  // harmless one. The dodge is a CHANGE OF DIRECTION, which is legible, not a
  // reaction the player has no time to make. The 0.9 leaves just enough slack
  // that a player already turning is out of the pool before it exists.
  //
  // Solved in two passes: the lead moves the aim point, which changes the range
  // and so the flight time the lead was derived from. One pass under-leads a
  // sprinting player by metres.
  _spawnSpit(x, y, z) {
    if (this.projectiles.length >= MAX_ENEMY_PROJECTILES) return;
    const p = this.player;
    const SPEED = 14;
    const LEAD = 0.9;
    let tx = p.pos.x;
    let tz = p.pos.z;
    for (let i = 0; i < 2; i++) {
      const t = Math.min(2.2, Math.hypot(tx - x, tz - z) / SPEED);
      // Clamped inside the walls: a lead that ran off the arena would put the
      // pool inside the geometry, where it is neither visible nor avoidable.
      tx = Math.max(-ARENA_BOUND + 1, Math.min(ARENA_BOUND - 1, p.pos.x + p.vel.x * t * LEAD));
      tz = Math.max(-ARENA_BOUND + 1, Math.min(ARENA_BOUND - 1, p.pos.z + p.vel.z * t * LEAD));
    }
    const dx = tx - x;
    const dz = tz - z;
    const dist = Math.max(0.5, Math.hypot(dx, dz));
    const t = dist / SPEED;
    // y + vy*t - 0.5*g*t^2 = 0.12, solved for vy.
    const vy = (0.12 - y + 0.5 * 22 * t * t) / t;
    this.projectiles.push(new Spit(
      this.scene, this.effects.glowTex, x, y, z,
      (dx / dist) * SPEED, vy, (dz / dist) * SPEED,
      3.2, 6, 9
    ));
  }

  // Autotest bot: aims at the nearest enemy, holds the trigger, and wanders in
  // a random cardinal direction. Only good enough to exercise the game.
  _autoInput() {
    // Claiming a totem takes priority over fighting, so the bot exercises the
    // upgrade path every wave instead of ignoring it - and now that the next
    // wave will not start until something is claimed, a bot that failed to
    // claim would hang the run rather than merely skip an upgrade.
    //
    // It SHOOTS the totem it wants. Shooting picks exactly the one it aimed at
    // and needs no proximity, and it walks toward the target at the same time
    // so a blocked line of sight resolves itself. The E path is the human one
    // and is covered by test/devil.mjs instead - a bot pressing a key at
    // whatever it happened to be standing next to would test nothing.
    let seekTotem = null;
    if (this.totemArea.active && !this.totemArea.claimed) {
      let td = 1e9;
      for (const t of this.totemArea.totems) {
        if (!t.canClaim()) continue;
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
  //   1. Keep a few metres off every totem. Standing among the row means
  //      firing from inside it, where the pillar it wants is as likely to be
  //      behind a neighbour as in front of one.
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
      // Comfortably clear of the pillar, with room for a frame of movement.
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
      this._updateReliefDrop(dt);
      if (this.bossFight) {
        this._updateBossAdds(dt);
        this._bossBleed();
      }

      // A boss wave ends when the BOSS is dead, not when the field is clear -
      // the adds never stop arriving, so waiting for an empty field would wait
      // forever.
      //
      // The invariant that makes reading parts.length here safe: _updateWave
      // runs BEFORE _updateEnemies in the frame, and a boss that splits has
      // its children pushed into `parts` inside the same sweep that removes
      // the parent. So this only ever sees the settled post-sweep value, never
      // the empty instant in the middle of a split.
      const done = this.bossFight
        ? this.bossFight.parts.length === 0
        : !this.queue.length && !this.enemies.length;
      if (done) {
        if (this.bossFight) this._finishBossWave();
        this._clearHazards();
        this.waveState = 'intermission';
        this.score += 100 * this.wave;
        this._payClearBonus();
        let msg = 'WAVE ' + this.wave + ' CLEARED  +$' + this.lastGain;
        if (this.lastPerfect) msg += '  FLAWLESS';
        // No-Hit Bonus. Read from the same flag the clear bonus just set, so
        // the two can never disagree about what flawless means, and banked on
        // the player rather than in mods - see Player.addNoHitStack. It is
        // folded into the clear banner rather than raised as its own, because
        // a banner replaces whatever is on screen: a second one here would
        // wipe the wave-clear line before it could be read.
        if (this.lastPerfect && this.player.mods.noHitBonus > 0) {
          const n = this.player.addNoHitStack();
          const pct = Math.round(Math.min(NO_HIT_CAP, this.player.mods.noHitBonus * n) * 100);
          this.effects.shockwave(this.player.pos, 0xeaff6b, 7, 0.7);
          msg += '  NO-HIT x' + n + ' (+' + pct + '% DMG & RATE)';
        }
        this.ui.banner(msg);
        this.sfx.wave();
        // After the clear bonus, so the flawless test still reads the damage
        // actually taken during the fight.
        if (this._cfg.boss) this._payBossBonus();
        this._presentTotems();
        this._presentDevil();
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
    // A totem claim is what starts the next wave, so with a Devil standing the
    // arm delay is longer: ending the shopping trip with a pellet that was
    // already in the air when the wave ended is a mistake the player cannot
    // undo. Read at present() time, which is why _presentDevil() runs after
    // this on a wave clear and re-arms them itself.
    const arm = this.devilArea.active ? ARM_TIME_DEVIL : undefined;
    this.totemArea.present(this._buildOffers(), !isReroll, arm);
    this._refreshStations();
  }

  /**
   * Raises the Devil, if he is coming at all.
   *
   * A wave cleared without taking a point of damage summons him every time; a
   * wave that cost the player health gives him a one-in-seven chance, and
   * Demonic Presence buys back the certainty.
   *
   * Skipped outright when the totem set is empty. The wave boundary is gated
   * on a totem claim, so a Devil standing in front of no totems would be a
   * shop the player could never leave.
   */
  _presentDevil() {
    if (!this.totemArea.active) return;
    const certain = this.waveDamageTaken <= 0 || this.player.mods.devilAlways > 0;
    if (!certain && Math.random() >= DEVIL_CHANCE_HURT) return;
    const offers = this._buildDeals();
    if (!offers.length) return;
    this.devilArea.present(offers);
    this._refreshDevil();
    // The totems went up first and armed for 1.2s. Now that he is here they
    // need the longer delay, so they are re-presented with the same offers.
    for (const t of this.totemArea.totems) {
      if (t.state !== 'hidden' && !t.claimed) t.armT = Math.max(t.armT, ARM_TIME_DEVIL);
    }
    this.sfx.devil();
  }

  // Puts each rolled upgrade into the shape a totem can draw.
  _buildOffers() {
    const ids = rollTotems(this.player.upgrades, this.wave, TOTEM_COUNT);
    return ids.map((id) => {
      const def = UPGRADES[id];
      const owned = this.player.upgrades[id] || 0;
      return {
        id,
        name: def.name,
        theme: def.theme,
        icon: def.icon,
        // Resolved against what the player already owns, so a stacking
        // upgrade shows the tier it moves them from and the one it moves
        // them to rather than the whole ladder.
        effects: effectLines(def, owned),
        note: owned > 0 ? 'OWNED ' + owned + ' / ' + def.max : '',
      };
    });
  }

  // The same shape _buildOffers() produces, plus the two fields that make a
  // totem a DEAL: what it costs in max HP, and whether the player can pay it.
  // `enabled` is what greys the pillar out and makes it refuse to be claimed -
  // see Totem.canClaim() and Player.canPay().
  _buildDeals() {
    const ids = rollDeals(this.player.upgrades, DEVIL_COUNT);
    return ids.map((id) => {
      const def = UPGRADES[id];
      return {
        id,
        name: def.name,
        theme: def.theme,
        icon: def.icon,
        effects: effectLines(def, 0),
        cost: def.cost,
        enabled: this.player.canPay(def.cost),
      };
    });
  }

  // Redraws the Devil's reroll label and re-tests every standing deal against
  // the health the player has left. Called after anything that spends max HP,
  // because a deal that was affordable before a purchase may not be after it.
  _refreshDevil() {
    const area = this.devilArea;
    if (!area.active) return;
    area.refresh((cost) => this.player.canPay(cost));
    const cost = dealRerollCost(area.rerolls);
    area.devil.setLabel(cost, this.player.canPay(cost));
  }

  // Redraws both station labels. Only called when something they display
  // actually changes - a purchase, a reroll, or a new set - never per frame.
  _refreshStations() {
    const area = this.totemArea;
    area.ammoStation.setLabel(
      AMMO_PURCHASE.name,
      '$' + AMMO_PURCHASE.cost,
      this.credits >= AMMO_PURCHASE.cost && AMMO_PURCHASE.enabled(this.player)
    );
    const cost = rerollCost(area.rerolls);
    area.rerollStation.setLabel('REROLL', '$' + cost, this.credits >= cost && area.active);
  }

  // Grants the upgrade a totem is offering and sinks the whole set. Every
  // claim path - touch and shoot - funnels through here, so the guard against
  // double-claiming lives in exactly one place. The pick is confirmed by the
  // burst and the gun itself, not by a card: the totem the player walked into
  // already said what it was.
  //
  // `byKey` is true for an E press, which skips the arm delay: that delay
  // exists to stop a burst already in the air from picking a build, and a key
  // press is never that burst. A shot still has to wait it out.
  _claimTotem(totem, byKey = false) {
    if (!(byKey ? totem.canUse() : totem.canClaim())) return;
    const offer = totem.offer;
    if (!this.player.takeUpgrade(offer.id)) return;
    totem.claimed = true;

    this.effects.burst(
      this._killPos.set(totem.pos.x, 1.4, totem.pos.z), offer.theme, 30, 7, 2.5, 0.7
    );
    this.effects.addShake(0.1);
    this.sfx.upgrade();
    this.totemArea.dismiss();
    // The totem claim is the definitive one: it is what starts the next wave,
    // so the Devil packs up with it whether or not anything was bought. That
    // is the single rule at the boundary, and the Devil's own panel says so.
    this.devilArea.dismiss();
  }

  // Buys the deal a pillar is offering. Every path in - touch and shot -
  // funnels through here, so the price is charged in exactly one place.
  //
  // It deliberately does NOT dismiss anything. The totems are still standing
  // and the wave is still waiting on them; a deal closes the Devil's shop and
  // nothing else, so a player can take a deal and then still choose their free
  // mutation. The other two pillars sink because the set is spent.
  _claimDeal(deal, byKey = false) {
    if (!(byKey ? deal.canUse() : deal.canClaim())) return;
    const offer = deal.offer;
    // canClaim() already refused an unaffordable deal via `enabled`, and
    // payMaxHp refuses again on its own. Two guards on the one thing in the
    // game that could otherwise kill a player who only pressed a button.
    if (!this.player.payMaxHp(offer.cost)) {
      this.sfx.denied();
      return;
    }
    if (!this.player.takeUpgrade(offer.id)) return;
    deal.claimed = true;

    this.effects.burst(
      this._killPos.set(deal.pos.x, 1.4, deal.pos.z), offer.theme, 34, 7, 2.5, 0.8
    );
    this.effects.shockwave(this._killPos, 0xff1744, 5, 0.5);
    this.effects.addShake(0.16);
    this.sfx.deal();
    this.ui.banner(offer.name + '  \u2013' + offer.cost + ' MAX HP');
    for (const d of this.devilArea.deals) {
      if (d !== deal) d.sink();
    }
    this._refreshDevil();
  }

  // A Devil reroll. Priced in max HP rather than credits and doubling the same
  // way the credit reroll does, so shopping the whole catalogue at one wave
  // break costs more health than any build can spare.
  _rerollDeals() {
    const area = this.devilArea;
    const cost = dealRerollCost(area.rerolls);
    if (!area.active || area.claimed || !this.player.payMaxHp(cost)) {
      this.sfx.denied();
      return;
    }
    area.rerolls++;
    area.present(this._buildDeals(), false);
    this._refreshDevil();
    this.effects.burst(area.devil.pos, 0xff1744, 20, 5, 2, 0.5);
    this.sfx.reroll();
  }

  // Why the Devil's heart cannot be used, or null if it can. Shared by the
  // prompt and the purchase so the two can never disagree - the same contract
  // _stationBlocked() has.
  _devilBlocked() {
    const area = this.devilArea;
    if (!area.active || area.claimed) return 'NOTHING TO REROLL';
    if (!this.player.canPay(dealRerollCost(area.rerolls))) return 'NOT ENOUGH MAX HP';
    return null;
  }

  // Ticks both installations and writes the E prompt. Shooting is handled in
  // shoot(), which already has the raycast; NOTHING is claimed by walking into
  // it any more - see the note at the top of totems.js.
  _updateTotems(dt) {
    this.totemArea.update(dt, this.time, this.player.pos);
    this.devilArea.update(dt, this.time, this.player.pos);

    const use = this._useTarget();
    if (!use) {
      this.ui.setPrompt(null, false);
      return;
    }
    const [text, blocked] = this._usePrompt(use);
    this.ui.setPrompt(text, blocked);
  }

  /**
   * What E would act on right now, or null.
   *
   * ONE RESOLVER FOR THE PROMPT AND THE KEY, so the line on screen can never
   * name something other than what the press does. Five things can be in
   * reach - three totems, three deals, the Devil's heart, two stations - and
   * several of their radii overlap, so the NEAREST wins rather than whichever
   * happened to be checked first.
   *
   * @returns {?{kind: string, target: object}} kind is 'totem' | 'deal' |
   *   'devil' | 'station'.
   */
  _useTarget() {
    let best = null;
    let bestD = Infinity;
    const consider = (hit, kind) => {
      if (!hit || hit.d2 >= bestD) return;
      bestD = hit.d2;
      best = { kind, target: hit.target };
    };
    consider(this.totemArea.usable(this.player.pos), 'totem');
    consider(this.totemArea.stationInRange(this.player.pos), 'station');
    consider(this.devilArea.usable(this.player.pos), 'deal');
    consider(this.devilArea.heartInRange(this.player.pos), 'devil');
    return best;
  }

  // The prompt line for whatever E is currently pointed at, as [html, blocked].
  _usePrompt(use) {
    const t = use.target;
    if (use.kind === 'totem') {
      return ['<b>SHOOT</b> / <b>E</b> TAKE &nbsp;·&nbsp; ' + t.offer.name, false];
    }
    if (use.kind === 'deal') {
      return [
        '<b>SHOOT</b> / <b>E</b> TAKE &nbsp;·&nbsp; ' + t.offer.name
        + ' &nbsp;·&nbsp; <span class="prompt-cost">\u2212' + t.offer.cost + ' MAX HP</span>',
        false,
      ];
    }
    if (use.kind === 'devil') {
      const blocked = this._devilBlocked();
      return [
        blocked
          ? 'REROLL &nbsp;\u00b7&nbsp; ' + blocked
          : '<b>SHOOT</b> / <b>E</b> REROLL &nbsp;\u00b7&nbsp; NEW DEALS &nbsp;\u00b7&nbsp; '
            + '<span class="prompt-cost">\u2212' + dealRerollCost(this.devilArea.rerolls)
            + ' MAX HP</span>',
        !!blocked,
      ];
    }
    const blocked = this._stationBlocked(t);
    if (blocked) {
      return [(t.kind === 'ammo' ? 'AMMO' : 'REROLL') + ' &nbsp;·&nbsp; ' + blocked, true];
    }
    if (t.kind === 'ammo') {
      return [
        '<b>SHOOT</b> / <b>E</b> ' + AMMO_PURCHASE.name + ' &nbsp;·&nbsp; ' + AMMO_PURCHASE.detail
        + ' &nbsp;·&nbsp; <span class="prompt-cost">$' + AMMO_PURCHASE.cost + '</span>',
        false,
      ];
    }
    return [
      '<b>SHOOT</b> / <b>E</b> REROLL &nbsp;·&nbsp; NEW UPGRADES &nbsp;·&nbsp; '
      + '<span class="prompt-cost">$' + rerollCost(this.totemArea.rerolls) + '</span>',
      false,
    ];
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
      if (this.credits < AMMO_PURCHASE.cost) return 'NEED $' + AMMO_PURCHASE.cost;
      return null;
    }
    const cost = rerollCost(this.totemArea.rerolls);
    if (!this.totemArea.active || this.totemArea.claimed) return 'NOTHING TO REROLL';
    if (this.credits < cost) return 'NEED $' + cost;
    return null;
  }

  // E at a station, from anywhere in its radius.
  // E. Takes whatever _useTarget() says is nearest - a mutation, a deal, a
  // reroll or an ammo refill - so the key always does the thing the prompt on
  // screen just said it would.
  tryUse() {
    if (this.state !== 'playing') return;
    const use = this._useTarget();
    if (!use) return;
    if (use.kind === 'totem') this._claimTotem(use.target, true);
    else if (use.kind === 'deal') this._claimDeal(use.target, true);
    else if (use.kind === 'devil') this._rerollDeals();
    else this._useStation(use.target);
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

  // The safety net, and the only pickup that is not dropped by something dying.
  //
  // Without it the drop system has a death spiral in it: low ammo means no
  // kills, and no kills means no ammo. A player who is genuinely stuck gets one
  // placed near them regardless of how the fight is going. It is deliberately
  // slow and conditional - it should feel like the game catching you, not like
  // a supply line.
  _updateReliefDrop(dt) {
    this._reliefT -= dt;
    if (this._reliefT > 0) return;
    if (this.powerups.length >= MAX_ACTIVE_PICKUPS) {
      this._reliefT = SPAWN_RETRY;
      return;
    }
    const hpFrac = this.player.health / this.player.maxHealth;
    const ammo = this.player.reserveAmmo + this.player.mag;
    const needHealth = hpFrac < RELIEF_HEALTH_FRAC;
    const needAmmo = ammo < RELIEF_AMMO;
    if (!needHealth && !needAmmo) {
      // Checked often, but the clock only starts once something is actually
      // wrong - so a comfortable player never banks relief they did not need.
      this._reliefT = 1;
      return;
    }
    // Ammo first when both are low: health with an empty gun only postpones it.
    //
    // But the ammo cap is a promise the whole drop system holds, and relief is
    // the one path that used to be able to break it - a starving player is
    // exactly the state that fires this every ten seconds, so left unchecked it
    // was the only way six ammo boxes could be on the floor at once. When the
    // cap is already reached the boxes ARE there and the player simply has not
    // walked to them, so relief falls back to health if that is also low and
    // otherwise waits.
    let kind = needAmmo ? 'ammo' : 'health';
    if (kind === 'ammo') {
      let ammoActive = 0;
      for (const p of this.powerups) if (p.typeKey === 'ammo') ammoActive++;
      if (ammoActive >= MAX_ACTIVE_AMMO) {
        if (!needHealth) {
          this._reliefT = SPAWN_RETRY;
          return;
        }
        kind = 'health';
      }
    }
    this.powerups.push(
      spawnRelief(kind, this.arena, this.player.pos, this.scene, this.effects.glowTex, this.time)
    );
    this._reliefT = RELIEF_INTERVAL;
  }

  // One kill's roll. `remaining` is how many more enemies this wave still has
  // to give, which is what makes the budget land evenly instead of all at the
  // start or all at the end.
  _rollDrop(pos, remaining) {
    if (this.powerups.length >= MAX_ACTIVE_PICKUPS) return;
    let chance;
    if (this.bossFight) {
      // No fixed denominator on a boss wave - the adds never stop.
      chance = BOSS_ADD_DROP_CHANCE;
    } else {
      if (this.dropsLeft <= 0) return;
      chance = this.dropsLeft / Math.max(1, remaining);
    }
    if (Math.random() >= chance) return;
    if (!this.bossFight) this.dropsLeft--;
    this._spawnDrop(pos);
  }

  // Places one drop, choosing what it is from what the player is short of.
  _spawnDrop(pos) {
    const hpFrac = this.player.health / this.player.maxHealth;
    const ammoFrac = (this.player.reserveAmmo + this.player.mag) / this.player.maxReserve;
    let ammoActive = 0;
    for (const p of this.powerups) if (p.typeKey === 'ammo') ammoActive++;
    const kind = pickDropType(hpFrac, ammoFrac, ammoActive < MAX_ACTIVE_AMMO);
    this.powerups.push(
      spawnDropAt(kind, pos, this.scene, this.effects.glowTex, this.time)
    );
    // The drop has to be findable in a fight it landed in the middle of.
    this.effects.burst(this._killPos.set(pos.x, 0.9, pos.z), 0xffe95e, 10, 3, 2, 0.5);
  }

  // A boss sheds a pickup as it crosses each health threshold. Without this a
  // forty-second boss fight would be the longest stretch in the game with no
  // resources in it at all: one kill, at the very end.
  _bossBleed() {
    const bf = this.bossFight;
    // No parts means the boss is already dead and _bossHpFrac reads 0, which
    // would trip every remaining threshold at once on a corpse.
    if (!bf || !bf.parts.length) return;
    const frac = this._bossHpFrac();
    while (bf.bleedAt < BOSS_BLEED_THRESHOLDS.length
      && frac <= BOSS_BLEED_THRESHOLDS[bf.bleedAt]) {
      bf.bleedAt++;
      const part = bf.parts[0];
      if (part) this._spawnDrop(part.pos);
    }
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

  // ANTIDOTE's upside. Every poisoned enemy on the floor heals the player one
  // health a second, so the deal turns a Venom build's own damage over time
  // into a second health bar - and is worth almost nothing to a build that
  // cannot poison anything, which is the trade it is priced at.
  //
  // Accumulated as a float and spent in whole points, the same shape Ammo
  // Fabricator uses: at one enemy the rate is under a point a frame, and
  // truncating per frame would pay out nothing at all.
  _poisonLeech(dt) {
    const rate = this.player.mods.poisonLeech;
    if (rate <= 0 || this.player.health >= this.player.maxHealth) return;
    let poisoned = 0;
    for (const e of this.enemies) {
      if (!e.dead && e.status.poison > 0) poisoned++;
    }
    if (!poisoned) return;
    this._leechAcc = (this._leechAcc || 0) + rate * poisoned * dt;
    if (this._leechAcc < 1) return;
    const whole = Math.floor(this._leechAcc);
    this._leechAcc -= whole;
    this.player.health = Math.min(this.player.maxHealth, this.player.health + whole);
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
    ctx.beat = this.music.beat;
    ctx.level = this.music.level;
    // Re-read every frame, never captured: rebuildMods() replaces the whole
    // mods object on each draft pick, so a reference taken once would be the
    // pre-upgrade block for the rest of the run.
    ctx.mods = this.player.mods;
    // Refresh the route to the player once for the whole list, before anyone
    // reads it. The grid throttles itself; this call is cheap on most frames.
    this.nav.update(dt, this.player.pos.x, this.player.pos.z);
    if (this._bigAlive > 0) this.navBig.update(dt, this.player.pos.x, this.player.pos.z);

    // Update everything first, then compact. Doing both in one pass would let
    // an enemy read half-compacted neighbours and feel the same one twice
    // while resolving crowding.
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) list[i].update(dt, ctx);
    this._poisonLeech(dt);

    // Enemies this wave still owes after this frame's deaths - the denominator
    // the drop chance is measured against. Counted once here rather than per
    // death, so several kills in one frame all price against the same figure.
    let remaining = this.queue.length;
    for (let i = 0; i < list.length; i++) if (!list[i].dead) remaining++;

    let write = 0;
    let big = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.dead) {
        if (e.radius > 0.8) big++;
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
      // e.pos.y is zero for everything on the floor, so this is unchanged for
      // the ground roster and puts a flier's death where the flier was.
      this.effects.burst(this._killPos.set(e.pos.x, e.pos.y + 0.8, e.pos.z), e.colorHex, 24, 6, 2.5, 0.7);
      this.sfx.kill();
      // Loot falls where the thing died. Boss parts are excluded: the boss
      // pays out by bleeding at health thresholds and by the kill bonus, and
      // letting the final part roll as well would double-pay the same kill.
      if (!e.boss) this._rollDrop(e.pos, remaining);
      // Blast Corpse and Incendiary's spread both need the enemy list intact,
      // so they are only noted here and played after the sweep.
      const m = this.player.mods;
      const wasBurning = e.status.burn > 0;
      const wasFrozen = e.status.freeze > 0;
      if (m.corpseDamage > 0
        || (m.burnSpread > 0 && wasBurning)
        || (m.ashDps > 0 && wasBurning)
        || (m.shatterDamage > 0 && wasFrozen)) {
        this._recordDeath(e.pos, wasBurning, wasFrozen);
      }
      this.scene.remove(e.group);
      if (e.type === 'splitter') this._splitInto(e);
      // A dead boss part leaves `parts` here, inside the same sweep that would
      // push any children it split into. _updateWave reads parts.length on the
      // next frame, so it never catches the gap between the two.
      if (e.boss && this.bossFight) {
        const bi = this.bossFight.parts.indexOf(e);
        if (bi >= 0) this.bossFight.parts.splice(bi, 1);
        if (this.bossFight.parts.length > 1) {
          this.bossFight.note = 'PARTS ' + this.bossFight.parts.length;
        } else if (this.bossFight.key === 'schism') {
          this.bossFight.note = '';
        }
      }
      e.dispose();
    }
    list.length = write;
    this._bigAlive = big;
    // Children of a splitter join the roster only after the sweep, so they are
    // never visited by the loop that created them.
    for (const mini of this._pendingSpawns) {
      if (mini.radius > 0.8) this._bigAlive++;
      list.push(mini);
    }
    this._pendingSpawns.length = 0;
    if (this._deathCount > 0) this._playDeaths();
  }

  // Notes a death that owes an after-effect. Vectors are reused across frames;
  // the arrays only ever grow to the largest number of deaths seen in one
  // frame, which a wave clear bounds naturally.
  _recordDeath(pos, burning, frozen) {
    const i = this._deathCount++;
    if (!this._deathPos[i]) this._deathPos[i] = new THREE.Vector3();
    this._deathPos[i].set(pos.x, 0.9, pos.z);
    this._deathBurn[i] = burning;
    this._deathFrozen[i] = frozen;
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
      // Crystallize. Only a body that was still frozen when it died shatters,
      // so it is Petrify's payoff rather than a second corpse blast.
      if (m.shatterDamage > 0 && this._deathFrozen[i]) {
        this._blast(at, m.shatterDamage, m.shatterRadius, null, false);
        this.effects.shockwave(at, 0x7fe3ff, m.shatterRadius, 0.5);
        this.effects.burst(at, 0xcfeaff, 22, 6, 3, 0.5);
      }
      // Ashen leaves a ZONE rather than another instant blast - the two
      // upgrades above already own that shape.
      // A CHANCE, not a rule: with Incendiary running every corpse in a wave
      // is a burning one, and a cloud per death paved the arena.
      if (m.ashDps > 0 && this._deathBurn[i] && Math.random() < m.ashChance) {
        this._addAsh(at);
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

  // Ashen. A cloud is four numbers and a drip timer, not a scene object: it is
  // drawn by the same particle pool everything else uses, so a cloud costs
  // nothing to create and nothing to dispose.
  _addAsh(pos) {
    if (this._ash.length >= MAX_ASH_CLOUDS) {
      // Recycled, so its stain has to go back to the pool with it.
      this.effects.creepRelease(this._ash.shift().creep);
    }
    const m = this.player.mods;
    this._ash.push({
      x: pos.x, z: pos.z, life: m.ashTime, maxLife: m.ashTime,
      dps: m.ashDps, radius: m.ashRadius, drip: 0,
      // Friendly: the smooth shape family, the one that never hurts the
      // player. Standing in your own ash has to be visibly safe.
      creep: this.effects.creepAcquire(false),
    });
    // A cloud that faded in was easy to miss in a busy wave, so it announces
    // itself: a ring the size of the damage area, plus an upward puff where
    // the enemy fell.
    this.effects.shockwave(this._ashAt.set(pos.x, 0, pos.z), CREEP_ASH, m.ashRadius, 0.5);
    this.effects.burst(this._ashAt.set(pos.x, 0.4, pos.z), CREEP_ASH, 22, 4, 2.4, 0.8);
  }

  // HELLFIRE. One patch of the burning trail: the same four-numbers-and-a-drip
  // shape an ash cloud is, on its own list with its own cap.
  //
  // Kept apart from _ash rather than folded into it because the two are
  // different SHAPES of zone - ash is a handful of wide clouds where enemies
  // died, this is a line of small patches where the player ran - and one cap
  // over both would mean a reload mid-fight quietly evicted the clouds an
  // Ashen build had just paid for. Friendly creep, exactly like ash: standing
  // in your own fire has to be visibly safe.
  _addFire(x, z) {
    if (this._fire.length >= MAX_FIRE_PATCHES) {
      this.effects.creepRelease(this._fire.shift().creep);
    }
    const m = this.player.mods;
    this._fire.push({
      x, z, life: 2.4, dps: m.hellfireDps, radius: m.hellfireRadius, drip: 0,
      creep: this.effects.creepAcquire(false),
    });
    this.effects.burst(this._ashAt.set(x, 0.3, z), CREEP_FIRE, 5, 1.8, 1.6, 0.5);
  }

  // Lays the trail while it is burning and runs the patches down behind it.
  // Distance-gated rather than time-gated: a player standing still after a
  // reload leaves one patch under their feet, and a player running leaves a
  // continuous line however fast they are going.
  _updateFire(dt) {
    if (this.time < this._fireUntil) {
      const dx = this.player.pos.x - this._fireLastX;
      const dz = this.player.pos.z - this._fireLastZ;
      if (dx * dx + dz * dz > FIRE_STEP * FIRE_STEP) {
        this._fireLastX = this.player.pos.x;
        this._fireLastZ = this.player.pos.z;
        this._addFire(this.player.pos.x, this.player.pos.z);
      }
    }
    for (let i = this._fire.length - 1; i >= 0; i--) {
      const f = this._fire[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.effects.creepRelease(f.creep);
        this._fire.splice(i, 1);
        continue;
      }
      this.effects.creepSet(f.creep, f.x, f.z, f.radius, CREEP_FIRE, Math.min(1, f.life));
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.pos.x - f.x;
        const dz = e.pos.z - f.z;
        if (dx * dx + dz * dz > f.radius * f.radius) continue;
        // `true` marks it as damage over time, the same flag ash passes, so
        // it does not spawn a hitmarker or count as a shot that connected.
        e.takeDamage(f.dps * dt, true);
      }
      // A third the rate a pool drips at: there can be twenty of these on the
      // floor at once, and at the pool's rate one reload would stand a couple
      // of hundred particles up in the shared buffer.
      f.drip -= dt;
      if (f.drip <= 0) {
        f.drip = 0.4;
        const ang = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * f.radius;
        this.effects.burst(
          this._ashAt.set(f.x + Math.cos(ang) * r, 0.25, f.z + Math.sin(ang) * r),
          CREEP_FIRE, 2, 1.2, 1.5, 0.7
        );
      }
    }
  }

  // Runs the clouds down and tickles whatever is standing in one. Damage is
  // dealt per second of exposure, so walking through the edge of a cloud costs
  // an enemy far less than being pushed into the middle of it.
  _updateAsh(dt) {
    for (let i = this._ash.length - 1; i >= 0; i--) {
      const a = this._ash[i];
      a.life -= dt;
      if (a.life <= 0) {
        this.effects.creepRelease(a.creep);
        this._ash.splice(i, 1);
        continue;
      }
      // The stain IS the warning now. It fades over the last second so the
      // ground going clean is what says the cloud has burnt out.
      this.effects.creepSet(
        a.creep, a.x, a.z, a.radius, CREEP_ASH, Math.min(1, a.life)
      );
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.pos.x - a.x;
        const dz = e.pos.z - a.z;
        if (dx * dx + dz * dz > a.radius * a.radius) continue;
        e.takeDamage(a.dps * dt, true);
      }
      // The cloud has to READ as a zone you keep enemies out of: three dark
      // red specks every fifth of a second vanished against the floor. It now
      // drips brighter embers, twice as often, with real height on them, and
      // gets two emissions per drip: one anywhere inside the disc,
      // and one pinned near the RIM, which is what actually draws the edge of
      // the damage area. Rates are held where eight clouds at once still fit
      // inside the shared particle pool, and the edge is drawn with embers
      // rather than a pulsing shockwave because that ring pool is four deep
      // and shared with melee and blasts.
      // Embers on top of the stain, at half the old rate. They used to be the
      // only thing marking the cloud, which is why there were so many of them;
      // now they are texture over a mark the player can already see, and eight
      // clouds' worth at the old rate was a third of the particle buffer.
      a.drip -= dt;
      if (a.drip <= 0) {
        a.drip = 0.2;
        const ang = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * a.radius;
        this.effects.burst(
          this._ashAt.set(a.x + Math.cos(ang) * r, 0.35, a.z + Math.sin(ang) * r),
          CREEP_ASH, 3, 1.5, 1.8, 0.9
        );
      }
    }
  }

  // ---- player-facing hazards ---------------------------------------------

  /**
   * A lingering zone the PLAYER has to walk out of. Same data-only shape as an
   * ash cloud, and recycled the same way: the oldest of its OWN kind goes
   * rather than the newest being refused, so the patch an enemy just laid down
   * always exists.
   *
   * @param {string} kind 'pool' (a blight's lob) or 'lava' (a magma's trail).
   *   It picks the cap, the colour and how loudly the zone announces itself -
   *   a pool lands once and has to be noticed, a trail patch is one of twelve
   *   and a splash per drop would be a strobe.
   */
  _addHazard(x, z, radius, life, dps, kind = 'pool') {
    const cap = kind === 'lava' ? MAX_LAVA : MAX_POOLS;
    let n = 0;
    for (const h of this._hazard) {
      if (h.kind === kind) n++;
    }
    if (n >= cap) {
      for (let i = 0; i < this._hazard.length; i++) {
        if (this._hazard[i].kind !== kind) continue;
        this.effects.creepRelease(this._hazard[i].creep);
        this._hazard.splice(i, 1);
        break;
      }
    }
    this._hazard.push({
      x, z, radius, life, maxLife: life, dps, kind, acc: 0, drip: 0, tick: 0,
      // Hostile, always: everything in this list hurts the player, and the
      // jagged shape family is what says so before any colour is read.
      creep: this.effects.creepAcquire(true),
    });
    const color = kind === 'lava' ? CREEP_LAVA : CREEP_HAZARD;
    this._ashAt.set(x, 0.1, z);
    if (kind === 'lava') {
      // A few embers where it fell. No ring: a magma drops one of these twice
      // a second and a shockwave per drop would spend the whole ring pool.
      this.effects.burst(this._ashAt, color, 6, 1.6, 1.4, 0.5);
      return;
    }
    // A pool lands as a splash, so the moment the ground turns is visible even
    // if the player is looking somewhere else when it is thrown.
    this.effects.shockwave(this._ashAt, color, radius, 0.45);
    this.effects.burst(this._ashAt, color, 16, 3, 1.2, 0.6);
  }

  // Runs the pools down and bleeds the player for standing in one.
  //
  // Damage goes through _hurtPlayerDot, NOT _hurtPlayer - see the note there.
  _updateHazard(dt) {
    for (let i = this._hazard.length - 1; i >= 0; i--) {
      const h = this._hazard[i];
      h.life -= dt;
      if (h.life <= 0) {
        this.effects.creepRelease(h.creep);
        this._hazard.splice(i, 1);
        continue;
      }
      const color = h.kind === 'lava' ? CREEP_LAVA : CREEP_HAZARD;
      this.effects.creepSet(h.creep, h.x, h.z, h.radius, color, Math.min(1, h.life));
      const dx = this.player.pos.x - h.x;
      const dz = this.player.pos.z - h.z;
      // Only while the player is on the ground. A pool is something to jump
      // out of as much as to run out of.
      // ANTIDOTE. A poison pool does nothing at all - the player walks through
      // a blight's lob. Lava is not poison and still burns, which is what
      // keeps the deal a specialist answer rather than hazard immunity.
      const immune = h.kind !== 'lava' && this.player.mods.poisonImmune > 0;
      if (!immune && dx * dx + dz * dz < h.radius * h.radius && this.player.pos.y < 0.8) {
        h.acc += h.dps * dt;
        h.tick -= dt;
        if (h.acc >= 1 && h.tick <= 0) {
          const whole = Math.floor(h.acc);
          h.acc -= whole;
          h.tick = 0.34;
          this._hurtPlayerDot(whole);
        }
      }
      // One emission per drip rather than the ash cloud's two: four pools
      // running at once is already 77 particles standing in the buffer, and
      // unlike ash these are always on screen, right where the player is
      // looking. A trail patch drips a third as often again, because there can
      // be two dozen of those and at the pool's rate one magma would stand a
      // couple of hundred particles up in the shared buffer on its own.
      h.drip -= dt;
      if (h.drip <= 0) {
        h.drip = h.kind === 'lava' ? 0.42 : 0.14;
        const ang = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * h.radius;
        this.effects.burst(
          this._ashAt.set(h.x + Math.cos(ang) * r, 0.3, h.z + Math.sin(ang) * r),
          h.kind === 'lava' ? 0xff8c1a : 0x7ac943, 3, 1.2, 1.4, 0.8
        );
      }
    }
  }

  // Damage over time on the PLAYER. Deliberately not _hurtPlayer.
  //
  // A pool deals its damage in one-point ticks several times a second, and
  // every one of those going through the normal path would roll Evasion sixty
  // times a minute and, worse, spend Holy Mantle's ward - a charge meant to
  // eat one real hit - on a single point of pool damage. So this is the one
  // place damage bypasses the ward, on purpose. It still counts toward the
  // flawless bonus and still ends the run.
  _hurtPlayerDot(d) {
    if (this.state !== 'playing') return;
    // Eternal Affliction's drawback and Blood Pact's, in that order. Neither
    // touches the ward or Evasion, for the reason in the comment above.
    d *= this.player.mods.hazardMult * this.player.mods.damageTakenMult;
    // A pool bleeds a point at a time several times a second, so it is a slow
    // and completely reliable way to lose a Carnage chain. That is correct:
    // standing in fire is being hit.
    this.player.clearCarnage();
    const h = this.player.takeDamage(d, this.time);
    this.stats.damaged += d;
    this.waveDamageTaken += d;
    // Throttled: the vignette flashing on every tick reads as a strobe.
    if (this.time - (this._lastDotFx || 0) > 0.5) {
      this._lastDotFx = this.time;
      this.ui.damage();
      this.sfx.hurt();
      // Inside the throttle with the vignette, for the reason named above: a
      // flinch on every damage tick really would be a strobe.
      this.rig.cueDamage();
    }
    if (h > 0) return;
    if (this.player.livesUsed < this.player.mods.extraLives) {
      this.player.livesUsed++;
      this.player.health = 1;
      this.player.shield = 40;
      this.player.shieldEnd = this.time + 3;
      this.effects.shockwave(this.player.pos, 0xff2d6f, 6, 0.5);
      this.effects.burst(this.player.eyeInto(this._killPos), 0xff2d6f, 40, 7, 3, 0.9);
      this.ui.banner('NINE LIVES');
      return;
    }
    this.gameOver();
  }

  // A telegraphed impact: a circle on the floor that fills, then detonates.
  // Not a projectile - it never touches the projectile pool - and it holds a
  // telegraph handle for its whole life, released when it goes off.
  _addMortar(x, z, radius, delay, damage) {
    if (this._mortars.length >= MAX_MORTARS) return;
    this._mortars.push({
      x, z, radius, delay, damage, t: 0, mark: this.effects.markAcquire(),
    });
  }

  _updateMortars(dt) {
    for (let i = this._mortars.length - 1; i >= 0; i--) {
      const m = this._mortars[i];
      m.t += dt;
      if (m.t < m.delay) {
        this.effects.markSet(m.mark, m.x, m.z, m.radius, 0xff5533, m.t / m.delay);
        continue;
      }
      this.effects.markRelease(m.mark);
      this._mortars.splice(i, 1);
      this._ashAt.set(m.x, 0, m.z);
      // A mortar IS a discrete hit that the player was shown and could have
      // walked out of, so unlike a pool it goes through the normal path and
      // the ward is allowed to eat it.
      const dx = this.player.pos.x - m.x;
      const dz = this.player.pos.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d < m.radius) this._hurtPlayer(m.damage * (1 - d / m.radius), this._ashAt);
      this.effects.shockwave(this._ashAt, 0xff5533, m.radius, 0.35);
      this.effects.burst(this._ashAt, 0xff7043, 20, 6, 2.5, 0.6);
      this.effects.addShake(0.14);
    }
  }

  // Maw's drag. Capped well under the player's 10 m/s: running out of the well
  // has to stay possible, standing still in it does not.
  _pullPlayer(dx, dz, strength) {
    const d = Math.hypot(dx, dz) || 1;
    this.player.extX += (dx / d) * Math.min(5.5, strength);
    this.player.extZ += (dz / d) * Math.min(5.5, strength);
  }

  // Clears every hazard and telegraph. Called when a wave ends and on game
  // over, so a pool thrown a moment before the last enemy died does not keep
  // burning the player through the intermission.
  _clearHazards() {
    for (const h of this._hazard) this.effects.creepRelease(h.creep);
    this._hazard.length = 0;
    for (const m of this._mortars) this.effects.markRelease(m.mark);
    this._mortars.length = 0;
  }

  // Neurotoxin. Poison walks from an afflicted enemy to a clean one standing
  // near it, one jump per tick, so a packed crowd goes green in a couple of
  // seconds and a spread-out one never does. Rate-limited rather than run per
  // frame: at 60fps an untimed spread would infect a whole wave instantly.
  _updatePoisonSpread(dt) {
    const m = this.player.mods;
    if (m.poisonSpread <= 0) return;
    this._spreadCd -= dt;
    if (this._spreadCd > 0) return;
    this._spreadCd = POISON_SPREAD_INTERVAL;
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const src = list[i];
      if (src.dead || src.status.poison <= 0) continue;
      for (let j = 0; j < list.length; j++) {
        const dst = list[j];
        if (dst === src || dst.dead || dst.status.poison > 0) continue;
        if (dst.pos.distanceTo(src.pos) > m.poisonSpread) continue;
        dst.applyStatus('poison', m.poisonTime * m.dotTime, m.poisonDps * m.dotPower);
        this.effects.burst(
          this._ashAt.set(dst.pos.x, 1.0, dst.pos.z), 0x39d353, 6, 3, 1.5, 0.35
        );
        break;
      }
    }
  }

  // Reload Burst. Thrown in an even ring on the frame a reload completes, so
  // it reads as the gun venting rather than as a shot the player aimed. Each
  // shard is a projectile like any other and counts against the same cap: a
  // reload in the middle of a heavy wave throws what there is room for.
  _reloadBurst() {
    const m = this.player.mods;
    const n = m.reloadShards;
    if (n <= 0) return;
    const spin = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      if (this.projectiles.length >= MAX_PROJECTILES) break;
      const a = spin + (i / n) * Math.PI * 2;
      this.projectiles.push(new Shard(
        this.scene, this.effects.glowTex,
        this.player.pos.x, 1.0, this.player.pos.z,
        Math.cos(a), Math.sin(a), 16, m.reloadShardDamage, 2.2
      ));
    }
    this.effects.shockwave(this.player.pos, 0xff7043, 2.5, 0.35);
    this.effects.addShake(0.08);
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
      // A spit paints its own landing splash inside update(), since only it
      // knows where the pool went. Everything else gets the generic impact
      // puff, tinted by what fired it rather than by a hardcoded purple - a
      // green glob that broke against a wall in violet read as a second,
      // unrelated effect.
      else if (res === 'wall') {
        this.effects.burst(pr.pos, PROJ_IMPACT[pr.type] || PROJ_IMPACT.shooter, 8, 3, 1, 0.3);
      }
      this.scene.remove(pr.mesh);
      this.projectiles.splice(i, 1);
    }
  }

  // Pushes state to the HUD every frame. UI caches internally, so these calls
  // are cheap when nothing changed.
  _updateHud() {
    this.ui.setWave(this.wave);
    // The boss has its own bar, so the counter reads as adds on the field
    // rather than sitting at "ENEMIES 1" for the length of a boss fight.
    const parts = this.bossFight ? this.bossFight.parts.length : 0;
    this.ui.setEnemies(this.enemies.length + this.queue.length - parts);
    if (this.bossFight) {
      const bf = this.bossFight;
      this.ui.setBoss(bf.name, this._bossHpFrac(), bf.note, bf.state);
    } else {
      this.ui.setBoss(null, 0, '', '');
    }
    this.ui.setScore(this.score);
    this.ui.setCredits(this.credits);
    const cm = this.comboMult();
    this.ui.setCombo(
      this.comboKills, cm, (cm - 1) / (COMBO_MAX - 1), this.comboTimer / COMBO_WINDOW
    );
    this.ui.setHealth(this.player.health, this.player.maxHealth);
    this.ui.setAmmo(this.player.mag, this.player.reserveAmmo, this.player.reloading > 0);
    this.ui.setReloadProgress(this.player.reloadProgress);
    this.ui.setWeapon(this.player.weapon.name);
    const shieldFrac = this.player.shieldEnd > this.time ? this.player.shield / 50 : 0;
    this.ui.setBuffs(
      this.player.damageBoostEnd > this.time ? (this.player.damageBoostEnd - this.time) / 10 : 0,
      this.player.fireRateBoostEnd > this.time ? (this.player.fireRateBoostEnd - this.time) / 8 : 0,
      shieldFrac,
      this.player.shield
    );
    this.ui.setShield(shieldFrac);
    if (this._statsHeld) this.ui.updateStats(this._statRows());
  }

  // ---- held-TAB build sheet ------------------------------------------------
  //
  // Everything a run accumulates that the HUD has no room for. Held rather than
  // toggled, and the game is NOT paused underneath: a panel that stopped the
  // arena would be a timeout the player could call whenever they liked, so this
  // costs them the seconds they spend reading it.

  _openStats() {
    if (this._statsHeld || this.state !== 'playing') return;
    this._statsHeld = true;
    this.ui.showStats(this._statMuts(), this._statRows());
  }

  _closeStats() {
    if (!this._statsHeld) return;
    this._statsHeld = false;
    this.ui.hideStats();
  }

  // The owned build, in the order it was picked up, carrying each upgrade's own
  // theme colour so the list reads as the totems the player has been walking
  // into all run.
  _statMuts() {
    const out = [];
    for (const [id, n] of Object.entries(this.player.upgrades)) {
      const def = UPGRADES[id];
      if (!def || n <= 0) continue;
      out.push({ name: def.name, color: '#' + def.theme.toString(16).padStart(6, '0'), tier: n });
    }
    return out;
  }

  // Label/value/highlight rows. Order matters: the run's headline numbers
  // first, then the shooting, then the live mutation counters, which are here
  // because they have nowhere else to be seen at all.
  _statRows() {
    const p = this.player;
    const st = this.stats;
    const acc = st.shotsFired > 0 ? Math.round((st.hits / st.shotsFired) * 100) : 0;
    const rows = [
      ['WAVE', String(this.wave)],
      ['SCORE', String(this.score)],
      ['CREDITS', '$' + Math.floor(this.credits)],
      ['KILLS', String(this.kills)],
      ['BEST COMBO', String(this.bestCombo)],
      ['ACCURACY', acc + '%'],
      ['DAMAGE TAKEN', String(Math.round(st.damaged))],
      ['HEALTH', Math.ceil(p.health) + ' / ' + p.maxHealth],
      ['AMMO', p.mag + ' + ' + p.reserveAmmo + ' / ' + p.maxReserve],
    ];
    // Only shown when the mutation that produces them is owned. A row reading
    // "0" for a stat the player has no way to earn is noise.
    if (p.mods.noHitBonus > 0) {
      const pct = Math.round(Math.min(NO_HIT_CAP, p.mods.noHitBonus * p.noHitStacks) * 100);
      rows.push(['NO-HIT BONUS', '+' + pct + '%', p.noHitStacks > 0]);
    }
    if (p.mods.streakStep > 0) {
      const pct = Math.round(p.streak * 100);
      rows.push(['HOT STREAK', (pct > 0 ? '+' : '') + pct + '%', pct > 0]);
    }
    if (p.mods.dashCharges > 0) {
      rows.push(['DASHES', p.dashLeft + ' / ' + p.mods.dashCharges, p.dashLeft > 0]);
    }
    if (p.mods.extraJumps > 0) {
      rows.push(['AIR JUMPS', p.jumpsLeft + ' / ' + p.mods.extraJumps, p.jumpsLeft > 0]);
    }
    return rows;
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
        // The chain lapsing is what takes Bloodlust's bonus away, so the
        // upgrade has exactly one clock and the player can already see it.
        if (this.comboTimer <= 0) {
          this.comboKills = 0;
          this.player.setBloodlustStacks(0);
        }
      }
      if (this.autoTest) this._autoInput();
      if (this.input.dash) {
        this.player.tryDash(this.input.dash, this.time);
        this.input.dash = null;
      }
      const reloaded = this.player.update(dt, this.input, this.arena.obstacles, this.time);
      if (reloaded) {
        this._reloadBurst();
        // HELLFIRE. The reload lights the player up for five seconds; the
        // trail itself is laid by _updateFire as they move. Armed by the same
        // one-frame signal Reload Burst rides, so a build holding both gets
        // both off one magazine.
        if (this.player.mods.hellfireDps > 0) {
          this._fireUntil = this.time + this.player.mods.hellfireTime;
          this._fireLastX = this.player.pos.x;
          this._fireLastZ = this.player.pos.z;
          this._addFire(this.player.pos.x, this.player.pos.z);
        }
      }
      // Double Jump and Double Dash raise one-shot flags rather than calling
      // effects themselves: player.js has no effects reference, and the same
      // split is already what reloadFinished uses.
      if (this.player.jumpFx) {
        this.player.jumpFx = false;
        this.effects.shockwave(this.player.pos, 0x82b1ff, 1.6, 0.22);
        this.sfx.melee();
      }
      if (this.player.dashFx) {
        this.player.dashFx = false;
        this.effects.shockwave(this.player.pos, 0x1de9b6, 2.2, 0.22);
        this.sfx.melee();
      }

      this._updateWave(dt);
      if (this.input.shoot) this.shoot();
      // One press is one frame of freshness: a semi-auto click made during the
      // fire cooldown is dropped, not queued.
      this.input.shootFresh = false;
      if (this.input.melee) this.tryMelee();
      this._updatePickups(dt);
      this._updateTotems(dt);
      // Ash and the poison spread run BEFORE the enemy sweep so anything they
      // kill is collected by the sweep this frame rather than lingering a
      // frame as a dead enemy that is still being drawn.
      this._updateAsh(dt);
      this._updateFire(dt);
      this._updateHazard(dt);
      this._updateMortars(dt);
      this._updatePoisonSpread(dt);
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

    // Outside the `playing` branch: the muffle and the rig both apply to the
    // menu, pause and death screens too, and none of those tick game time.
    // Driven by `dt` (real time, computed in every state) rather than
    // `this.time`, which stops when the simulation does.
    this.music.setMuffled(this._musicMuffled());
    // Sampled before the rig reads it, so a beat lights the room on the same
    // frame it happens rather than the next one.
    this.music.sample(dt);
    this.rig.update(dt, this._fillRigState());
    this.ui.setStrobe(this.rig.flash);

    this.effects.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

new Game();
