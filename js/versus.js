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
 * TWO MODES OF PLAY, and the second is an interruption of the first.
 *
 *   THE LADDER is ordinary play. The wave counter is shared and goes up on
 *   EVERY clear, so the players climb alternating rungs of one ladder - with
 *   four of them your own curve steps four waves a turn, which is intended.
 *
 *   THE CONTEST is what a failure opens. The ladder stops, and every other
 *   player still alive attempts THAT WAVE, once each. The player who failed it
 *   has already had their attempt. When the last of them has played:
 *
 *     - somebody cleared it -> everyone who failed it, the original failer
 *       included, is ELIMINATED, and the survivors resume the ladder above it.
 *     - nobody cleared it   -> AMNESTY. Nobody is eliminated and the ladder
 *       resumes ON it, with the wave back in the hands of whoever failed first.
 *     - one player left     -> they win. Still the only ending the mode has.
 *
 * THE WAVE IS PINNED for the length of a contest. "Up on every clear" is the
 * LADDER's rule; a contest exists precisely to put everyone on the same wave,
 * so clearing your contest turn keeps you alive and moves nothing.
 *
 * TWO PLAYERS ARE THE SPECIAL CASE OF THIS, NOT A SEPARATE RULESET. A contest
 * with one contestant IS the old `challenge` - clear it and you are the last
 * one standing, which is the win. Both failing IS the old `retry`: the amnesty
 * hands the wave back to the first failer, and clearing it advances, so the
 * other player does not get that wave again. Nothing about a two-player match
 * plays differently than it did when this class could only count to two.
 */
export class VersusMatch {
  constructor(count = 2) {
    this.count = count;
    // The wave about to be played. Shared - there is only ever one.
    this.wave = 1;
    // Every player's run. Indexed by PLAYER NUMBER, not by seat, so an
    // elimination never renumbers anybody: player 3 is slot 2 for the whole
    // match whether or not players 1 and 2 are still in it.
    this.slots = new Array(count).fill(null);
    // The survivors, IN TURN ORDER. Eliminating a player is a splice out of
    // this, which is what makes the seat after them fall to the next player
    // still in rather than to a gap.
    this.alive = Array.from({ length: count }, (_, i) => i);
    // Whose turn it is, as an index into `alive`.
    this.cursor = 0;
    // The open contest, or null during ordinary ladder play. `order` is who
    // was asked, in the order they were asked; `owed` is who has yet to play.
    this.contest = null;
    // Who went out as the last contest closed, for the caption. Cleared at the
    // start of the next turn that is not the one announcing them.
    this.eliminated = [];
    // True on the ladder turn that FOLLOWS an amnesty, so the caption can say
    // the wave beat everybody. One turn only.
    this.amnesty = false;
    // The winning index once there is one, or -1. Nothing else ends a match.
    this.winner = -1;
  }

  /** Whose turn it is, as a player number. */
  get active() { return this.alive[this.cursor]; }

  /**
   * THE OLD THREE-WAY TURN KIND, derived rather than stored. Kept because it
   * is the vocabulary the mode was documented and tested in, and because for
   * two players it still says exactly what it always said.
   */
  get turn() {
    if (!this.contest) return this.amnesty ? 'retry' : 'normal';
    return this.contest.cleared.length ? 'normal' : 'challenge';
  }

  /** 1-based, for anything the player reads. */
  label(i = this.active) {
    return 'PLAYER ' + (i + 1);
  }

  /**
   * True when clearing the turn NOW IN PROGRESS ends the match: the last
   * contestant, with every other survivor already failed. The wave is won on
   * itself in that case and no passive item set is raised for it - a choice
   * spent being told you have won is a choice wasted.
   *
   * For two players this is precisely the old `turn === 'challenge'`.
   */
  wouldWin() {
    const c = this.contest;
    return !!c && c.owed.length === 1 && c.cleared.length === 0
      && this.alive.length > 1;
  }

  /**
   * Books the result of the turn that just ended and works out the next one.
   * Returns nothing - read `winner`, `active`, `wave`, `contest` and
   * `eliminated` after it.
   */
  advance(cleared) {
    const me = this.active;
    this.amnesty = false;

    if (this.contest) {
      const c = this.contest;
      (cleared ? c.cleared : c.failed).push(me);
      c.owed.shift();
      if (c.owed.length) {
        this.cursor = this.alive.indexOf(c.owed[0]);
        return;
      }
      this._closeContest();
      return;
    }

    if (cleared) {
      // The ladder. One rung per clear, and the seat moves on.
      this.eliminated = [];
      this.wave++;
      this.cursor = (this.cursor + 1) % this.alive.length;
      return;
    }
    this._openContest(me);
  }

  /** A failure stops the ladder and puts the wave to everybody else. */
  _openContest(failer) {
    const at = this.alive.indexOf(failer);
    const owed = [];
    for (let i = 1; i < this.alive.length; i++) {
      owed.push(this.alive[(at + i) % this.alive.length]);
    }
    this.eliminated = [];
    this.contest = {
      wave: this.wave,
      cleared: [],
      failed: [failer],
      owed,
      order: [failer, ...owed],
    };
    // Cannot happen while the match is live - one survivor is a winner, and a
    // winner is booked before anybody plays again - but a contest nobody is
    // owed would otherwise sit open forever.
    if (!owed.length) { this._closeContest(); return; }
    this.cursor = this.alive.indexOf(owed[0]);
  }

  /** Every contestant has played. Settle it. */
  _closeContest() {
    const c = this.contest;
    // Taken BEFORE anybody is cut, because the seat the ladder resumes from is
    // a position in the order the contest was played in, not in what is left.
    const seats = this.alive.slice();
    const last = c.order[c.order.length - 1];

    if (c.cleared.length) {
      this.eliminated = c.failed.slice();
      this.alive = this.alive.filter((i) => !c.failed.includes(i));
      if (this.alive.length === 1) {
        this.winner = this.alive[0];
        this.contest = null;
        return;
      }
      // The ladder resumes ABOVE the wave the contest was fought on.
      this.wave++;
    } else {
      // AMNESTY. A wave that beat the whole field eliminates nobody, and the
      // ladder resumes ON it - which hands it back to whoever failed it first,
      // because they are the seat that follows the last contestant.
      this.eliminated = [];
      this.amnesty = true;
    }
    this.contest = null;

    // The first seat after the last contestant that is still in the match.
    const at = seats.indexOf(last);
    for (let i = 1; i <= seats.length; i++) {
      const idx = this.alive.indexOf(seats[(at + i) % seats.length]);
      if (idx >= 0) { this.cursor = idx; return; }
    }
    this.cursor = 0;
  }

  /**
   * The one line the handoff screen shows under the player's name. It has to
   * say what is at stake in a glance, because it is on screen for five seconds
   * and the person reading it has just been handed a controller.
   */
  stake() {
    const c = this.contest;
    let line;
    if (this.wouldWin()) {
      line = 'CLEAR WAVE ' + this.wave + ' TO WIN';
    } else if (c && c.cleared.length) {
      // Somebody has already passed it, so failing it is now an exit.
      line = 'CLEAR WAVE ' + this.wave + ' OR YOU ARE OUT';
    } else if (c) {
      // Named while there is one name to say, counted after that. Kept short:
      // the wave is on the second half of the line, so the first half does not
      // need it too.
      const n = c.failed.length;
      line = (n === 1 ? this.label(c.failed[0]) : n + ' PLAYERS')
        + ' FELL  ·  CLEAR WAVE ' + this.wave + ' TO KNOCK '
        + (n === 1 ? 'THEM' : 'THEM ALL') + ' OUT';
    } else if (this.amnesty) {
      // 'BOTH' while there are two of them, which is the wording this line had
      // before it had to be able to count higher.
      line = (this.alive.length === 2 ? 'BOTH FAILED WAVE ' : 'NOBODY CLEARED WAVE ')
        + this.wave + '  ·  SECOND ATTEMPT';
    } else {
      line = 'WAVE ' + this.wave;
    }
    // HOW MANY ARE LEFT, once there is a field rather than an opponent. With
    // four players nothing else on screen says how much of it is still in, and
    // the people reading it are mostly spectators.
    if (this.count > 2 && this.winner < 0) {
      line += '  ·  ' + this.alive.length + ' LEFT';
    }
    return line;
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
  'kills', 'credits',
  'comboKills', 'comboTimer',
  'waveDamageTaken', 'lastPerfect',
  // NO SHOP COUNTER. The active item row used to come up on every third shop
  // and each run counted its own; the mystery box stands in every wave break
  // for both players, so there is no longer a schedule to carry. What IS
  // carried, and is the whole of the per-player item rule, is `item` on the
  // Player - it falls out of the skip-list copy below like every other field,
  // which is why the box can never offer a player what they are already
  // holding no matter whose turn it is. See shuffledPool in items.js.
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
    // AND THEIR FLAWLESS STREAK, for the same reason and at the same moment.
    // The streak itself rides in `player` like every other Player field - it
    // is what makes the counter per-player at all - but the multiplier the
    // mirrored bounty needs is read here, while there is still a live run to
    // read it from.
    flawlessMult: game.flawlessMult(),
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
