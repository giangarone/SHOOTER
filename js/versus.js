// LOCAL TWO-PLAYER VERSUS - the match rules, and the run snapshot that makes
// them possible.
//
// The mode is a hot seat: one pad, one keyboard, two players, taking one wave
// each. The WAVE COUNTER IS SHARED and everything else is not - each player
// carries their own build, health, ammo, credits and active item through the
// whole match, and hands the controller over at their wave's end.
//
// WHY A SNAPSHOT AND NOT TWO GAMES. Every mutable thing in a run lives on two
// singletons, Game and Player, and both of them are wired into objects that
// outlive any run - the camera, the scene, the arena, the viewmodel parented
// to the camera in Player's constructor. Standing up a second Player would
// mean a second gun in the scene and a second camera to keep in step, so a
// turn change writes FIELDS on the one Player instead. The snapshot is what
// those fields were.
//
// WHERE A HANDOFF CAN HAPPEN. Only at a wave boundary: the pick that ends a
// cleared wave, or a death. Both are moments the game already has no live
// entities in it, or is about to throw them away, which is why nothing here
// serialises an enemy or a projectile. Freezing mid-wave would be a different
// and much larger job - see the note on scene-coupled entities in main.js.

// ---- the match ------------------------------------------------------------

/**
 * The rules, and nothing else. No DOM, no THREE, no Game - so the whole of
 * versus can be reasoned about (and tested) as a state machine over three
 * values: which wave, whose turn, and what is at stake on it.
 *
 * THE THREE KINDS OF TURN:
 *
 *   normal    - an ordinary alternating turn. Clear it and the match moves on
 *               to the next wave with the other player up.
 *   challenge - the other player just failed this wave. Clearing it WINS THE
 *               MATCH; this is the only ending the mode has.
 *   retry     - both players have now failed this wave, so the slate is wiped.
 *               Clearing it just advances the match, and the other player does
 *               NOT get the wave again - they already had their attempt at it.
 *
 * The loop that falls out of this is the point of the mode: a wave one player
 * cannot pass becomes an offer to the other, and it stays an offer until one
 * of them takes it.
 */
export class VersusMatch {
  constructor() {
    // The wave about to be played. Shared - there is only ever one.
    this.wave = 1;
    this.turn = 'normal';
    // Whose turn it is, as an index into `slots`. Player 1 is 0.
    this.active = 0;
    // The benched player's run, and the active player's last committed one.
    // Both are filled at the match start so a handoff never has to special-case
    // the first one.
    this.slots = [null, null];
    // The winning index once there is one, or -1. Nothing else ends a match.
    this.winner = -1;
  }

  get other() {
    return 1 - this.active;
  }

  /** 1-based, for anything the player reads. */
  label(i = this.active) {
    return 'PLAYER ' + (i + 1);
  }

  /**
   * Books the result of the turn that just ended and works out the next one.
   * Returns nothing - read `winner`, `active`, `wave` and `turn` after it.
   */
  advance(cleared) {
    const kind = this.turn;
    if (cleared) {
      // The one ending. Checked before the wave is advanced so `wave` still
      // names the wave that was won on.
      if (kind === 'challenge') {
        this.winner = this.active;
        return;
      }
      // A normal clear, or the clear that closes out a wave both players
      // failed. Either way the match moves on and the failure ledger is spent.
      this.wave++;
      this.turn = 'normal';
    } else {
      // A first failure puts the wave up as a challenge; a second one - the
      // other player failing the challenge - wipes the slate instead of ending
      // anything, and the wave goes back to whoever failed it first.
      this.turn = kind === 'challenge' ? 'retry' : 'challenge';
    }
    this.active = this.other;
  }

  /**
   * The one line the handoff screen shows under the player's name. It has to
   * say what is at stake in a glance, because it is on screen for five seconds
   * and the person reading it has just been handed a controller.
   */
  stake() {
    if (this.turn === 'challenge') return 'CLEAR WAVE ' + this.wave + ' TO WIN';
    if (this.turn === 'retry') {
      return 'BOTH FAILED WAVE ' + this.wave + '  ·  SECOND ATTEMPT';
    }
    return 'WAVE ' + this.wave;
  }
}

// ---- what a snapshot is ---------------------------------------------------

// PLAYER FIELDS THAT ARE NOT RUN STATE. Everything else on the instance is
// captured, so a field added to Player is carried by default and only has to
// be named here if it should NOT be - which is the safe way round. A missed
// entry in a hand-written allowlist is a stat that silently resets on every
// handoff, and that is exactly the bug this mode cannot afford.
const PLAYER_SKIP = new Set([
  // Session objects. The camera and the viewmodel outlive every run.
  'camera', 'gunModels', 'muzzle', 'magPart',
  'gunBaseX', 'gunBaseY', 'gunBaseZ', 'magBaseY',

  // ---- THE BODY, WHICH IS NOT THE RUN ------------------------------------
  //
  // A snapshot carries what a player HAS - their build, their vitals, their
  // ammo, their money, their timers. It does not carry where they are standing
  // or which way they are looking, and that is the whole reason a turn change
  // does not cut.
  //
  // The alternative was tried and is worse: restoring a saved transform snaps
  // the camera across the arena at the moment the gun is out of frame, and
  // however well the swing is animated around it, a hard cut in the middle
  // says "different scene" when the thing the pass is meant to say is "same
  // fight, different hands". Leaving the body where it stands costs the
  // incoming player nothing - the field is empty, the wave has not started,
  // and they have the whole wave-start beat to look around - and it buys a
  // transition with no seam in it at all.
  //
  // Nothing here is a resource, so nothing is lost by not carrying it. The
  // things that ARE resources and happen to live near the movement code -
  // stamina, the jump and dash charges - are captured like everything else.
  'pos', 'vel', 'yaw', 'pitch', 'recoilPitch', 'kick', 'onGround',
  'extX', 'extZ', 'moveVX', 'moveVZ',
  // Aiming and sprinting are what the player is DOING this frame; both are
  // recomputed from the controller every frame anyway.
  'aiming', '_aimRaw', 'aimT', 'sprinting', 'sprintFade', '_sprintFov',
  // The sustained-fire cone and its hold, for the same reason sprintFade is
  // here: it is what the trigger is doing THIS FRAME. A benched player's gun
  // has had a whole wave to settle, and the incoming one is not holding it.
  'bloom', '_bloomHold',
  // A slide BUFFERED IN THE AIR, on the same terms as a dash in flight: it is
  // an input waiting to land, and the incoming player did not press it.
  '_slideBuf', '_groundRun',
  // Pose: the walk bob, the sprint carry, and the six offsets they write.
  '_bobPhase', '_bobAmp', '_sprintPose',
  '_gunOffX', '_gunOffY', '_gunOffZ', '_gunOffRX', '_gunOffRY', '_gunOffRZ',
  // A dash IN FLIGHT. Restoring one would resume a lunge the incoming player
  // never started, which is a repositioning by another name. The ITEM that pays
  // for it (item, itemCharge) and jumpsLeft are captured normally.
  'dashDX', 'dashDZ', 'dashStart', 'dashEnd', '_prevJump', 'jumpFx', 'dashFx',
  // Owned by the pass animation, not by either player - see Player.setHolster.
  'holster',
  // DERIVED, and deliberately never captured. mods is replayed from the owned
  // upgrade list by rebuildMods() - see the note at the top of upgrades.js.
  // Storing it would hand the other player a stat block that no longer agrees
  // with their build the moment either of them picks anything up.
  'mods',
  // Fixed for the life of the instance.
  'baseMaxHealth', 'fovHip', 'fovAds',
  // A PREFERENCE, not run state. The screenshake dial belongs to the person in
  // the room, not to either of the two runs being played in it.
  'shakeScale',
]);

// PLAYER FIELDS HOLDING AN ABSOLUTE GAME-TIME DEADLINE.
//
// THE TRAP THIS EXISTS FOR: Game.time is one monotonic clock that runs for the
// whole session and is never rewound. A player benched with eight seconds of
// rage left comes back to find `damageBoostEnd` sitting a full wave in the
// past, and every timed thing they were holding silently expired while someone
// else was playing. So capture stores each of these as time REMAINING and
// restore turns it back into a deadline against the clock as it is now.
//
// Kept as one list rather than as branches at the two call sites, because the
// only way this stays correct is if adding a timed field means adding one line
// in one place.
const PLAYER_CLOCKS = [
  'dodgeEnd', 'invulnEnd', 'frozenUntil', 'damageBoostEnd',
  'fireRateBoostEnd', 'shieldEnd', 'noSprintUntil', 'lastHurt', 'now',
  // Opening Salvo's window. A benched player must not come back to a window
  // that expired while someone else was shooting.
  'salvoEnd',
];

// The same trap, on Game's side of the line.
const GAME_CLOCKS = ['_fireUntil', '_lastDotFx'];

// THE TWO PLAYER LISTS MUST NOT OVERLAP, and this is here because the failure
// is silent in both directions. The clock loops run AFTER the general copy and
// write their own names outright, so a field in both lists would be excluded
// by the skip list and then carried anyway - the skip would read as done and
// have done nothing. Checked once, at load, because the cost of finding this
// by watching a player resume a dash they never started is an afternoon.
for (const k of PLAYER_CLOCKS) {
  if (PLAYER_SKIP.has(k)) {
    throw new Error('versus.js: "' + k + '" is both skipped and rebased');
  }
}

// GAME FIELDS THAT ARE RUN STATE. An allowlist here rather than a blocklist,
// because Game carries the renderer, the scene, the arena, the rig, every
// scratch vector in the frame loop and a hundred other things that are not a
// run - naming what belongs to a player is much the shorter list.
const GAME_FIELDS = [
  'score', 'kills', 'credits',
  'comboKills', 'comboTimer', 'bestCombo',
  'waveDamageTaken', 'lastPerfect',
  // The shop counter the active item row comes up on. SHARED, in the sense
  // that both players' runs count their own shops - a schedule is not a reward
  // and neither player can be unlucky with it.
  'shopCount',
  'emptyClickCd', '_spreadCd', '_deathCount', '_reliefT',
  '_fireLastX', '_fireLastZ',
  ...GAME_CLOCKS,
];

function clonePlain(v) {
  // A Vector3, and anything else carrying its own copy contract.
  if (v && typeof v.clone === 'function') return v.clone();
  if (Array.isArray(v)) return v.slice();
  if (v && typeof v === 'object') return { ...v };
  return v;
}

/**
 * The active player's whole run, as plain data.
 *
 * IN MEMORY, NEVER JSON. `_pendingBuffs` holds live POWERUP_TYPES entries and
 * has to survive by identity - the wave that starts after a handoff calls
 * apply() on them.
 */
export function captureRun(game) {
  const p = game.player;
  const player = {};
  for (const k of Object.keys(p)) {
    if (PLAYER_SKIP.has(k)) continue;
    player[k] = clonePlain(p[k]);
  }
  // Deadlines become durations. After the copy above, so these overwrite it.
  for (const k of PLAYER_CLOCKS) player[k] = p[k] - game.time;

  const g = {};
  for (const k of GAME_FIELDS) g[k] = clonePlain(game[k]);
  for (const k of GAME_CLOCKS) g[k] = game[k] - game.time;
  g.stats = { ...game.stats };
  // Kept by reference on purpose - see above.
  g._pendingBuffs = game._pendingBuffs.slice();

  return {
    player,
    game: g,
    // CACHED BECAUSE THE BENCH CANNOT COMPUTE IT. A boss bounty is mirrored
    // into whichever player is not on the controller, and scaling it by their
    // Midas needs their mods - which do not exist while their build is sitting
    // in a snapshot. One scalar, read at the only moment it is available.
    creditMult: p.mods.creditMult,
  };
}

/**
 * Writes a snapshot back over the live singletons.
 *
 * ORDER MATTERS at the end: the build has to be replayed into `mods` before
 * anything reads a derived stat, and the viewmodel has to be re-marked because
 * the receiver plates are baked into the ONE gun both players are holding.
 */
export function restoreRun(game, snap) {
  const p = game.player;

  for (const k of Object.keys(snap.player)) {
    const v = snap.player[k];
    const cur = p[k];
    // A Vector3 is written INTO rather than replaced: `pos` is handed out to
    // the nav grid, the money magnet and the rig every frame, and swapping the
    // object would leave all of them pointing at the previous player's.
    if (cur && typeof cur.copy === 'function' && v && typeof v.clone === 'function') {
      cur.copy(v);
    } else if (cur && typeof cur === 'object' && !Array.isArray(cur) && v && typeof v === 'object') {
      // status / statusFull / upgrades - same reasoning, one level down.
      for (const kk of Object.keys(cur)) delete cur[kk];
      Object.assign(cur, v);
    } else {
      p[k] = clonePlain(v);
    }
  }
  // Durations become deadlines again.
  for (const k of PLAYER_CLOCKS) p[k] = game.time + snap.player[k];

  for (const k of GAME_FIELDS) game[k] = snap.game[k];
  for (const k of GAME_CLOCKS) game[k] = game.time + snap.game[k];
  Object.assign(game.stats, snap.game.stats);
  // In place: _pendingBuffs is not captured by any closure, but every other
  // array on Game is, and being consistent about it is cheaper than being
  // right about which.
  game._pendingBuffs.length = 0;
  for (const b of snap.game._pendingBuffs) game._pendingBuffs.push(b);

  p.rebuildMods();
  p._equipModel();
  p.refreshGunMarks();
  // NOT applyCamera. The body was never captured, so there is nothing to write
  // back to it - and calling it here is exactly the hard cut the skip list
  // above exists to avoid.
}
