// ACTIVE ITEMS: the one thing in the run with a button on it.
//
// Everything else the player collects is a passive item - a number folded into
// the stat block that then applies itself forever, without being asked. An
// active item is the opposite: it does nothing at all until it is fired, and
// firing it is a decision made at a particular second of a particular fight.
// One slot, one button, no menu.
//
// THE SLOT IS ONE DEEP, AND THAT IS THE FEATURE. Taking a second item throws
// the first away. A run therefore carries an answer to ONE problem - the health
// bar, the crowd, the boss, the corner you got caught in - and swapping is a
// real loss rather than an inventory chore. There is no drop, no swap-back and
// no stash, for the same reason there is no upgrade menu: nothing in this game
// opens.
//
// THE CHARGE IS BOUGHT WITH DEAD ENEMIES. Every kill is worth charge points
// at a flat rate on its own value, banked as it dies and paid into the meter
// as its orbs are collected (see CHARGE_PER_VALUE at the bottom of this file),
// so an item's `charge` below is a COST IN ENEMIES and nothing at all fills it
// but killing. Standing still pays nothing, in the shop or anywhere else. It
// can still be FIRED in the shop - gating the use as well would be a rule the
// player has to discover by being punished for it, and there is nothing in the
// shop worth firing at anyway.
//
// HOW THEY ARE OBTAINED IS NOT IN THIS FILE. This is the catalogue and the
// runtime; the mystery box that hands them out lives in js/mysterybox.js, and
// the only thing it asks of this file is shuffledPool() at the bottom.
//
// EACH ITEM IS ONE `use(game)` AND NOTHING ELSE. None of the five reaches for
// machinery that did not already exist: the heal is the health pickup's sum,
// the freeze is the status every cryo round applies, the damage window is the
// rage pickup's own timer field, the invulnerability is the window a dodge used
// to open, and the dash is the dash. An item that needed a new system would be
// a system with one caller.

import * as THREE from 'three';
import { THEME } from './upgrades.js';
import {
  Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey,
} from './deploy.js';
import { BOUND } from './arena.js';

// Scratch vectors. Every one of these functions runs at most once per button
// press, but they run inside the render loop and the game allocates nothing
// per frame anywhere else either.
const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();

// ---- shared helpers -------------------------------------------------------

// The living enemies, nearest first, capped. Four items pick "the N closest"
// and a sort per item would be four sorts that could disagree about what
// "closest" measures from - this measures from the player's FEET, which is
// where every enemy position in the game already is.
function nearestEnemies(game, n, from = game.player.pos) {
  const out = [];
  for (const e of game.enemies) {
    if (!e.dead) out.push(e);
  }
  out.sort((a, b) => a.pos.distanceToSquared(from) - b.pos.distanceToSquared(from));
  out.length = Math.min(out.length, n);
  return out;
}

// The direction the player is looking, flattened onto the floor. Everything
// thrown, placed or aimed by an item uses this, so no two of them can disagree
// about which way "forward" is - and it is the same -sin/-cos pair Player.dash
// builds its heading from.
function facing(game, out = _dir) {
  return out.set(-Math.sin(game.player.yaw), 0, -Math.cos(game.player.yaw));
}

// Heals without ever going over the cap. Six items do this and the seventh
// would have been the one that forgot.
//
// A PASSTHROUGH NOW, and worth keeping as one: the clamp moved onto the player
// when OVERDRAW needed a single place to see what did not fit (see
// Player.heal), and the six call sites below read better asking to heal a
// player than reaching into one.
function heal(player, amount) {
  player.heal(amount);
}

// Takes health as a PRICE rather than as damage: it does not go through the
// damage sinks, so Evasion cannot dodge it, Holy Mantle cannot eat it, Thorns
// cannot reflect it and Carnage does not drop. An item's own cost is not
// something happening TO the player - they pressed the button - and it can
// never kill them, which is what the floor of 1 is for.
function pay(player, amount) {
  player.health = Math.max(1, player.health - amount);
}

// The lines under an item's name on the box's card, in the same vocabulary
// upgrades.js uses - 1 benefit, 0 qualifier. An item has no drawbacks to draw
// in red: what it costs is the slot, and the slot is not on the card.
const GOOD = 1;
const NOTE = 0;

// WHAT AN ITEM'S READOUT DOES NOT SAY: how long it takes to charge.
//
// It is the most quotable number an item has and it is deliberately nowhere -
// not on the box's card, not in the prompt, not in the HUD. The bar already
// answers it, in the only unit it is ever thought about in: one segment is one
// second, so a glance at the slot says "three blocks" or "twenty hairlines"
// without a number, and the answer arrives from having carried the thing rather
// than from having read it. A player choosing between a heal and a dash should
// be weighing what they do, and a printed "20s" makes that a sum instead.

/**
 * The pool. Thirty-seven.
 *
 * IT USED TO BE FIVE, and the note here used to say that five was the point:
 * few enough that a player learnt all of them inside two runs and a swap was a
 * decision between things they knew. That argument was right about the SLOT and
 * wrong about the pool. What makes a swap a decision is that there is one slot
 * and taking a second item throws the first away - which is unchanged - and the
 * row still comes up only every third shop, so a run still sees three or four
 * offers however deep the pool is. Five meant a player saw the same three items
 * every run. Thirty-seven means the offer is a thing that happens TO a run
 * rather than a menu it works through, and the decision at the box is the
 * same one it always was: is this better than what I am carrying.
 *
 * @property {string} name      shown on the box's card and in the HUD slot
 * @property {number} charge    points of WAVE PROGRESS to refill, and the bar
 * @property {number} theme     colour, following THEME's rule: what it DOES
 * @property {Array}  effects   the box's readout, [text, sign] per line
 * @property {Function} use     (game, s) => void, run once when the button lands
 *
 * AND, FOR THE ITEMS THAT DO NOT FINISH THE MOMENT THEY START:
 *
 * @property {number}   duration  seconds the item stays RUNNING after use
 * @property {Function} tick      (game, s, dt) => void, every frame while it runs
 *                                 - it may set `s.done` to end the window early
 * @property {Function} end       (game, s) => void, when the window closes
 * @property {Function} onKill    (game, s) => void, per enemy killed while running
 * @property {Function} ready     (game) => boolean, false refuses the press
 * @property {boolean}  hud       false to keep a running item off the buff strip
 *
 * `s` is a fresh object per activation - the item's own scratch, so nothing
 * here has to find somewhere on the game to hang a counter. See RunningItems
 * at the foot of this file for the four lines that drive all of it.
 *
 * The key is also the icon key - the catalogue in pixelicons.js is keyed by id
 * exactly the way the upgrade pool is, so two items cannot collide on one
 * drawing and a typo is a missing key rather than a silent substitution.
 */
export const ACTIVE_ITEMS = {
  itemHeal: {
    name: 'TRAUMA KIT',
    charge: 50,
    theme: THEME.vitality,
    // NO OVERHEAL, unlike the health pickup, which goes 25 over the cap. A
    // pickup has to be walked to across a live arena and this is a button, so
    // the button is the weaker of the two at the thing they both do. Forty
    // seconds is most of a wave: it is one recovery per fight, not a tap.
    effects: [['HEAL 25 HP', GOOD]],
    use: (game) => {
      const p = game.player;
      p.heal(25);
      game.effects.shockwave(p.pos, THEME.vitality, 5, 0.5);
    },
  },
  itemFreeze: {
    name: 'CRYO PULSE',
    charge: 40,
    theme: THEME.ice,
    // The whole floor at once, through the same per-enemy status a cryo round
    // applies - which means bosses downgrade it to a slow through the
    // resistance block they already carry (see freezeSlow on a boss's stat block in
    // js/enemies/). That is
    // the correct answer and not a special case: an item that could stop a boss
    // dead for five seconds every twenty would be the only boss strategy there is.
    //
    // The cheapest item in the pool because it does no damage. It buys
    // distance, and distance is what the player then has to use - and the
    // player finds that out by carrying it, not by reading it.
    effects: [['FREEZE ALL ENEMIES', GOOD]],
    use: (game) => {
      for (const e of game.enemies) e.applyStatus('freeze', 5);
      game.effects.shockwave(game.player.pos, THEME.ice, 26, 0.9);
    },
  },
  itemRage: {
    name: 'OVERDRIVE',
    charge: 60,
    theme: THEME.damage,
    // Rides damageBoostEnd, the same field the RAGE pickup uses, so it expires
    // through machinery that already exists and shows in the buff strip without
    // being taught to. Math.max against whatever is already running, because a
    // rage pickup landing on top of this must not DOWNGRADE it to 1.5x - the
    // shorter of two overlapping boosts still wins the expiry, which is the
    // honest reading of "for 5 seconds".
    effects: [['2x DAMAGE', GOOD]],
    use: (game) => {
      const p = game.player;
      p.damageMult = Math.max(p.damageMult, 2);
      // The length goes with the deadline, and ONLY when this write wins it:
      // five seconds landing under a rage pickup's remaining ten must leave
      // the HUD chip measuring against the ten it is actually counting down.
      const end = game.time + 10;
      if (end > p.damageBoostEnd) {
        p.damageBoostEnd = end;
        p.damageBoostFull = 10;
      }
      game.effects.shockwave(p.pos, THEME.damage, 6, 0.6);
    },
  },
  itemGuard: {
    name: 'AEGIS',
    charge: 60,
    theme: THEME.holy,
    // invulnEnd is read as the FIRST line of both damage sinks in main.js, so
    // this needs no new guard anywhere - but both of those sinks return in
    // silence, which means five seconds of it look exactly like five seconds of
    // not being shot at. The tell is the caller's job: main.js holds a vignette
    // and a buff chip for the duration, or the strongest item in the pool is
    // also the one the player cannot tell is running.
    effects: [['INVINCIBLE', GOOD]],
    use: (game) => {
      const p = game.player;
      p.invulnEnd = Math.max(p.invulnEnd, game.time + 8);
      game.effects.shockwave(p.pos, THEME.holy, 7, 0.7);
    },
  },
  itemDash: {
    name: 'BLINK DRIVE',
    charge: 3,
    theme: THEME.surge,
    // THE DASH USED TO BE A PASSIVE ITEM. Double Dash held two charges on a
    // 2.5s timer and was fired by double-tapping W, which is a binding that
    // exists because the game had no spare finger - and an active item slot IS
    // a spare finger. So it moved here whole: the envelope, the distance and
    // the forward-only commitment are untouched (see DASH_TIME in player.js),
    // and what changed is that it is now competing with a heal and a panic
    // button for the same slot rather than sitting in the pool for free.
    //
    // Three points - three basic enemies - against Double Dash's two charges
    // on a 2.5s timer. A single charge that comes back fast reads as mobility;
    // two charges that come back slowly read as an escape saved for the worst
    // moment, and the four items above already cover the worst moment.
    effects: [['DASH WHERE YOU ARE LOOKING', GOOD]],
    use: (game) => {
      // THE DASH GOES WHERE THE VIEW GOES, up as well as along. It used to be
      // flattened onto the floor, which made the one item in the pool that is
      // pure movement the one item that ignored half of where the player was
      // pointing - a dash taken at a catwalk went along the ground under it.
      // Pitch is the raw view angle rather than the recoil-shifted aim: the
      // player is dashing where they are LOOKING, and a shot's kick must not
      // steer them.
      game.player.dash(game.time, 1, game.player.pitch);
    },
  },

  // =========================================================================
  // THE REST OF THE POOL
  // =========================================================================
  //
  // Thirty-three more, and the five above are unchanged - which is the test
  // this whole extension had to pass. What made the original five work is that
  // each is ONE decision the player makes at one second of one fight, and that
  // is still the rule: nothing below is a passive with a button on it.
  //
  // THE FILE'S OLD NOTE SAID an item that needed a new system would be a system
  // with one caller. That was true at five and it is not true at thirty-eight:
  // seven items leave something in the arena, so there is one deployable list
  // (js/deploy.js) with seven callers, and fourteen run for a window, so there
  // is one running-item list with fourteen. Two systems, twenty-one callers.
  // Nothing here has a system of its own.

  // ---- the room, all at once ---------------------------------------------

  itemPurify: {
    name: 'WHITE CELL',
    charge: 20,
    theme: THEME.antidote,
    // THE CLEANSE ALONE IS NOT THE ITEM. Every status in the game arrives from
    // something that is still there - a lava patch under your feet, a gas
    // cloud you are inside of, a cinder that is still chasing you - so a
    // cleanse with no window after it can be undone on the very next frame,
    // and an item whose whole payload expires before the button finishes being
    // pressed is one the player will call broken. Two seconds is enough to
    // walk out of what put it on you, which is the actual answer.
    effects: [['CLEAR ALL NEGATIVE', GOOD], ['EFFECTS, BRIEFLY IMMUNE', GOOD]],
    duration: 2,
    hud: true,
    use: (game) => {
      const p = game.player;
      p.clearStatuses();
      p.statusLockEnd = Math.max(p.statusLockEnd, game.time + 2);
      game.effects.shockwave(p.pos, THEME.antidote, 6, 0.55);
      game.effects.burst(p.eyeInto(_v), 0xd6ffdd, 22, 5, 3, 0.6);
      game.sfx.itemHeal2();
    },
    end: (game) => { game.player.statusLockEnd = 0; },
  },

  itemInferno: {
    name: 'BRIMSTONE',
    charge: 40,
    theme: THEME.fire,
    // A FIXED RATE, not the player's own burn. Incendiary may not be owned -
    // most runs it is not - and an item that did nothing at all until you
    // happened to draft an unrelated passive item would be the only item in
    // the pool whose text is a lie on the card it is read from.
    //
    // Three seconds is short and the rate is high, which is the shape fire has
    // everywhere else in this game (see status.js): it is a reason to press
    // the advantage now rather than a clock to wait out.
    //
    // TWICE ONE OF THE PLAYER'S OWN SHOTS PER TICK, at two ticks a beat, on
    // every enemy at once - so an item that used to be a flat 14 a second is
    // worth the same slot on wave 30 as on wave 3. See Player.dotHit.
    effects: [['BURN ALL ENEMIES', GOOD]],
    use: (game) => {
      let n = 0;
      const burn = game.player.dotHit * 2;
      for (const e of game.enemies) {
        if (e.dead) continue;
        e.applyStatus('burn', 3, burn);
        // Lit one at a time from the player outward would be the nicer
        // animation and the wrong read: the item is ONE event, and thirty
        // little fires starting on the same frame is what says so.
        game.effects.impact(e.pos, 0xff7a18, 6, 3, 2.5, 0.5);
        n++;
      }
      game.effects.shockwave(game.player.pos, THEME.fire, 30, 0.9);
      if (n) game.effects.addShake(0.2);
      game.sfx.itemBlast();
    },
  },

  itemArc: {
    name: "JACOB'S LADDER",
    charge: 40,
    theme: THEME.electric,
    // A CHAIN, NOT A BURST, and the difference is the whole drawing: the bolt
    // walks from the player through five bodies in order, so what the item did
    // is legible as a LINE afterwards. Arc Rounds already owns the one-hop
    // jump; this is that idea taken as far as it goes.
    //
    // Five, because the beam pool and the eye both stop being able to follow a
    // chain at about six links, and because a number the player can count is
    // worth more here than a number that scales.
    // TWICE ONE OF THE PLAYER'S OWN SHOTS PER LINK, read live off the gun
    // through getEffectiveDamage the way BOOTSTRAP's blast is - so a flat 45
    // that had stopped mattering by wave ten is now five hits that are still
    // worth a slot at wave thirty.
    effects: [['LIGHTNING ARCS THROUGH', GOOD], ['THE NEAREST ENEMIES', NOTE]],
    use: (game) => {
      const p = game.player;
      const dmg = p.getEffectiveDamage(p.weapon.damage) * 2;
      const chain = nearestEnemies(game, 5);
      if (!chain.length) {
        game.effects.shockwave(game.player.pos, THEME.electric, 6, 0.4);
        return;
      }
      let from = game.player.eyeInto(_v).clone();
      for (const e of chain) {
        const to = e.pos.clone().setY(1.0);
        game.effects.beam(from, to, 0xffee58);
        game.effects.lightning(e.pos.x, e.pos.z, 2.2);
        game.hurtEnemy(e, dmg);
        from = to;
      }
      game.effects.addShake(0.2);
      game.sfx.itemArc();
    },
  },

  itemMercy: {
    name: 'LAST RITES',
    charge: 40,
    theme: THEME.executioner,
    // FINISHES, IT DOES NOT KILL. Thirty percent is low enough that this is
    // never the thing that won the fight - the player already did the work -
    // and high enough that a room full of half-dead chaff clears in one press,
    // which is the moment the item exists for.
    //
    // BOSSES ARE NOT EXEMPT. They used to be, on the reasoning that an item
    // which deletes a boss's last phase would be the only boss strategy there
    // is - and at twenty-four points that was true. At forty it is a whole
    // fight's charge spent on the third of a health bar the player was already
    // going to win, and a finisher that refuses at the one moment a finisher
    // is worth pressing is a finisher nobody presses.
    effects: [['EXECUTE EVERY', GOOD], ['NEARLY-DEAD ENEMY', NOTE]],
    use: (game) => {
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (e.hp > e.maxHp * 0.3) continue;
        game.effects.impact(e.pos, 0xff2d6f, 10, 5, 3, 0.4);
        game.hurtEnemy(e, e.hp + 1);
      }
      game.effects.shockwave(game.player.pos, THEME.executioner, 26, 0.8);
      game.sfx.itemRites();
    },
  },

  itemQuake: {
    name: 'TECTONIC',
    charge: 20,
    theme: THEME.impact,
    // THE FORCE IS THE POINT AND THE DAMAGE IS THE RECEIPT. Forty is not much;
    // nine metres of everything leaving at once is a great deal, and what the
    // player actually bought is the second and a half it takes them all to
    // walk back. It answers the one thing nothing else in the pool answers -
    // being surrounded - without killing anything, so the fight is still
    // there when it lands.
    // THE SHOVE IS A TRAVEL, NOT A PLACEMENT. It goes through _shove, which
    // goes through Enemy.knock - the melee swing's own knockback - so a crowd
    // is visibly thrown out over half a second instead of being found already
    // scattered on the next frame. That half second IS the item: what the
    // player bought is the walk back, and they have to be able to watch it.
    effects: [['HURL NEARBY ENEMIES BACK', GOOD], ['AND DEAL BULLET DAMAGE', GOOD]],
    use: (game) => {
      const p = game.player;
      const dmg = p.getEffectiveDamage(p.weapon.damage);
      for (const e of game.enemies) {
        if (e.dead) continue;
        const d = e.pos.distanceTo(p.pos);
        if (d > 9) continue;
        _v.set(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z);
        if (_v.lengthSq() < 1e-6) _v.copy(facing(game));
        // Falls off with distance, so the thing standing on top of you is
        // thrown the furthest. A flat shove would move the far edge of the
        // circle as hard as the enemy in your face, which is the opposite of
        // what an explosion looks like.
        game._shove(e, _v, 18 * (1 - d / 9) + 4);
        game.hurtEnemy(e, dmg);
      }
      game.effects.shockwave(p.pos, THEME.impact, 9, 0.6);
      game.effects.burst(p.pos, 0x00e5c0, 30, 9, 3, 0.6);
      game.effects.addShake(0.45);
      game.pad.rumble(0.9, 0.7, 260, 2);
      game.sfx.itemBlast();
    },
  },

  itemMartyr: {
    name: 'MARTYR',
    charge: 60,
    theme: THEME.blast,
    // THE BIGGEST NUMBER IN THE POOL, AND THE ONLY ONE THAT COSTS EVERYTHING.
    // It is not a nuke with a downside: it is a trade the player makes at ten
    // percent health either way, and pressing it at full health is how the
    // item teaches what it does. Sixteen metres is most of the arena.
    //
    // It cannot kill you. A button that ends the run is not a decision, it is
    // a misclick - and the ten HP left is the item's real cost, because the
    // next thing that touches you finishes the job.
    effects: [['DETONATE YOURSELF', GOOD], ['LEAVES YOU NEARLY DEAD', NOTE]],
    use: (game) => {
      const p = game.player;
      _v.set(p.pos.x, 0, p.pos.z);
      // TWENTY OF THE PLAYER'S OWN SHOTS, read live off the gun rather than
      // the flat 400 it used to be - the biggest number in the pool has to
      // still be the biggest number in the pool at wave thirty.
      game._blast(_v, p.getEffectiveDamage(p.weapon.damage) * 20, 16, null, false);
      p.health = Math.min(p.health, 10);
      p.clearCarnage();
      game.effects.shockwave(_v, THEME.blast, 16, 1.0);
      game.effects.burst(p.eyeInto(_v), 0xffe9a8, 50, 16, 6, 0.9);
      game.effects.burst(p.pos, 0xff6f00, 60, 12, 8, 1.1);
      game.effects.addShake(0.9);
      game.pad.rumble(1, 0.9, 420, 2);
      game.sfx.itemBlast();
    },
  },

  itemMeteor: {
    name: 'FALLING SKY',
    charge: 60,
    theme: THEME.ember,
    // TWELVE ROCKS OVER THREE SECONDS, PLACED AT RANDOM. The randomness is the
    // item: it is the one thing in the pool the player does not aim, so what
    // they are buying is three seconds of the room being a worse place to
    // stand for everybody who is not them.
    //
    // IT CANNOT HURT THE PLAYER, and that is not generosity. Every telegraph
    // in this game is a question answered by moving, and it can be answered
    // because the player knows who threw it. A dozen rocks THEY called down
    // from nowhere in particular would be a question with no answer.
    effects: [['METEORS STRIKE THE ARENA', GOOD]],
    use: (game) => {
      // THREE OF THE PLAYER'S OWN SHOTS PER ROCK, snapshotted at the press for
      // the same reason a turret's is: the shower was called down by the gun
      // in hand, and twelve rocks that quietly got stronger because a totem
      // was claimed while they were falling would be damage nobody aimed.
      const p = game.player;
      const dmg = p.getEffectiveDamage(p.weapon.damage) * 3;
      for (let i = 0; i < 12; i++) {
        // Biased toward wherever the enemies actually are, by picking a random
        // one and scattering around it. Uniform over the whole floor would put
        // most of the shower in the empty half of an arena this size.
        const near = game.enemies.length
          ? game.enemies[(Math.random() * game.enemies.length) | 0] : null;
        const cx = near && !near.dead ? near.pos.x : 0;
        const cz = near && !near.dead ? near.pos.z : 0;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 9;
        game.deploy(new Meteor(
          game,
          Math.max(-BOUND + 2, Math.min(BOUND - 2, cx + Math.cos(a) * r)),
          Math.max(-BOUND + 2, Math.min(BOUND - 2, cz + Math.sin(a) * r)),
          (i / 12) * 3 * (0.7 + Math.random() * 0.6),
          dmg
        ));
      }
      game.effects.shockwave(game.player.pos, THEME.ember, 8, 0.5);
      game.sfx.itemSky();
    },
  },

  // ---- windows on the player ---------------------------------------------

  itemRate: {
    name: 'RED LINE',
    charge: 30,
    theme: THEME.rate,
    // Rides fireRateMult and fireRateBoostEnd - the fire-rate PICKUP's own two
    // fields - so it expires through machinery that already exists and shows
    // in the buff strip without being taught to, exactly the way OVERDRIVE
    // rides the rage pickup's. Math.max for the same reason: a pickup landing
    // on top of this must not downgrade it.
    //
    // Six seconds at eighteen, against OVERDRIVE's five at twenty. Rate is
    // worth slightly less than damage in a game where the magazine is finite -
    // twice the rate is also twice the reloads.
    effects: [['DOUBLE FIRE RATE', GOOD]],
    use: (game) => {
      const p = game.player;
      p.fireRateMult = Math.max(p.fireRateMult, 2);
      const end = game.time + 6;
      if (end > p.fireRateBoostEnd) {
        p.fireRateBoostEnd = end;
        p.fireRateBoostFull = 6;
      }
      game.effects.shockwave(p.pos, THEME.rate, 6, 0.55);
      game.sfx.itemSurge();
    },
  },

  itemFrenzy: {
    name: 'RED MIST',
    charge: 40,
    theme: THEME.rage,
    // THE DRAWBACK IS THE FEATURE. Three times damage for five seconds is the
    // hardest hit in the pool, and taking double while it runs is what stops
    // it being a strictly-better OVERDRIVE - it is pressed when the room is
    // already nearly clear, or it is pressed once.
    //
    // Both halves are the ITEM's multipliers rather than the shared ones, so a
    // rage pickup and this one stack instead of overwriting each other, and a
    // Blood Pact's damageTakenMult is not silently replaced by the two.
    effects: [['3x DAMAGE', GOOD], ['BUT YOU TAKE 2x', NOTE]],
    duration: 10,
    use: (game) => {
      const p = game.player;
      p.itemDamageMult = 3;
      p.itemTakenMult = 2;
      game.effects.shockwave(p.pos, THEME.rage, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0x8b0000, 26, 6, 3, 0.7);
      game.sfx.itemFrenzy();
    },
    end: (game) => {
      game.player.itemDamageMult = 1;
      game.player.itemTakenMult = 1;
      game.effects.shockwave(game.player.pos, THEME.rage, 4, 0.35);
    },
  },

  itemTally: {
    name: 'BODY COUNT',
    charge: 32,
    theme: THEME.carnage,
    // AN EMPTY BUTTON THAT THE PLAYER FILLS. Pressed into an empty room it
    // does literally nothing, and pressed into a crowd it is the biggest
    // damage number in the game - which makes it the only item in the pool
    // whose value is decided entirely by WHEN, and that is worth thirty-two
    // seconds on its own.
    //
    // THE WINDOW DOES NOT EXTEND ON A KILL. It was the obvious thing to add
    // and it is wrong: a stacking buff that refreshes itself off its own
    // output does not end, it just gets bigger until the wave does, and then
    // the item has no shape at all. Eight seconds, from the press.
    effects: [['MORE DAMAGE', GOOD], ['WITH EVERY KILL', NOTE]],
    duration: 8,
    use: (game, s) => {
      s.stacks = 0;
      game.player.itemDamageMult = 1;
      game.effects.shockwave(game.player.pos, THEME.carnage, 6, 0.5);
      game.sfx.itemSurge();
    },
    onKill: (game, s) => {
      // Twenty is 3x, which is where every other damage window in the pool
      // tops out. Uncapped, a boss wave's adds would put this an order of
      // magnitude past anything else in the game.
      if (s.stacks >= 20) return;
      s.stacks++;
      game.player.itemDamageMult = 1 + 0.1 * s.stacks;
      s.label = String(s.stacks);
      game.effects.impact(game.player.eyeInto(_v), 0xff1744, 5, 3, 2, 0.25);
    },
    end: (game) => { game.player.itemDamageMult = 1; },
  },

  itemPact: {
    name: 'BLOOD TAX',
    charge: 30,
    theme: THEME.pact,
    // PAID UP FRONT, IN THE ONE CURRENCY THE PLAYER CANNOT FARM. It is the
    // same trade RED MIST offers with the terms reversed: that one is cheap
    // now and dangerous for five seconds, this one is expensive now and free
    // for ten. A player at full health should find this the easier press, and
    // a player at thirty should find it a real question.
    effects: [['3x DAMAGE', GOOD], ['COSTS 25 HP', NOTE]],
    duration: 10,
    use: (game) => {
      const p = game.player;
      pay(p, 25);
      p.itemDamageMult = 3;
      game.ui.damage();
      game.effects.shockwave(p.pos, THEME.pact, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0xb71c1c, 30, 6, 3, 0.8);
      game.sfx.itemPact();
    },
    end: (game) => { game.player.itemDamageMult = 1; },
  },

  itemHumours: {
    name: 'FOUR HUMOURS',
    charge: 40,
    theme: THEME.affliction,
    // EVERY ELEMENT IN THE GAME, ONE ROUND AT A TIME. The point is not the
    // damage - each of the four is weaker than the passive item that owns it -
    // it is that a crowd caught by eight seconds of this is burning AND
    // poisoned AND frozen AND arcing, and no draft the player could actually
    // assemble ever does all four at once.
    //
    // It cycles per SHOT and not per pellet, so one trigger pull is one
    // element however many pellets were in it - the same rule Hot Streak and
    // Devil's Gamble already follow.
    effects: [['EVERY SHOT CYCLES', GOOD], ['FIRE, ICE, VENOM, ARC', NOTE]],
    duration: 8,
    use: (game) => {
      game.player.elementCycle = 0;
      game.effects.shockwave(game.player.pos, THEME.affliction, 6, 0.55);
      game.sfx.itemSurge();
    },
    end: (game) => { game.player.elementCycle = -1; },
  },

  itemHoming: {
    name: 'BIRD DOG',
    charge: 40,
    theme: THEME.precision,
    // SEEKER, ON A CLOCK. It reads the same _homeShot path the passive item
    // does - the same cone, the same line-of-sight check, the same bent tracer
    // - so a player who has carried Seeker already knows exactly what this
    // does, and a player who has not gets shown the mechanic for ten seconds.
    //
    // It does not stack with the passive item and it does not need to: the
    // shot path takes the wider of the two cones, so owning Seeker makes this
    // item a dead press rather than a double one, which is the honest
    // behaviour.
    effects: [['YOUR SHOTS FIND THEIR MARK', GOOD]],
    duration: 10,
    use: (game) => {
      game.player.itemHoming = 1;
      game.effects.shockwave(game.player.pos, THEME.precision, 6, 0.5);
      game.sfx.itemSurge();
    },
    end: (game) => { game.player.itemHoming = 0; },
  },

  itemLeech: {
    name: 'HAEMOPHAGE',
    charge: 60,
    theme: THEME.blood,
    // TWENTY SHOTS THAT HIT, not twenty trigger pulls - a magazine emptied
    // into a wall must not be a heal at all, and requiring the hit is also
    // what makes the item something the player has to shoot WELL to spend.
    //
    // ONE HP A HIT, AND THAT IS THE WHOLE SHAPE. Five a hit was a second
    // health bar arriving in four bursts; one a hit is twenty points that
    // accrue while the player does the thing they were going to do anyway, so
    // the item is a slow refill earned by accuracy rather than a heal with a
    // strange trigger on it.
    //
    // THERE IS NO CLOCK ON IT. There used to be a twenty-second backstop, on
    // the reasoning that a player could otherwise bank a charge through a wave
    // break and open the next fight already loaded - which is true, and is
    // also just the item being carried rather than spent. Twenty hits is a
    // real cost at sixty points of charge, and a window that expired with
    // hits left on it was the item silently taking back what it granted.
    //
    // WITH NO DURATION IT NEVER JOINS THE RUNNING LIST, which is why there is
    // no tick and no end here: `leechShots` is the entire state, it is spent
    // by the shot path in main.js, and it is cleared with the rest of the run
    // on a death or a restart (see Player.reset).
    effects: [['YOUR NEXT HITS HEAL YOU', GOOD], ['NO TIME LIMIT', NOTE]],
    use: (game) => {
      game.player.leechShots = 20;
      game.effects.shockwave(game.player.pos, THEME.blood, 6, 0.5);
      game.sfx.itemSurge();
    },
  },

  itemStone: {
    name: 'BLOOD FROM STONE',
    charge: 30,
    theme: THEME.blood,
    // MONEY BECOMES MEDICINE, and only while it is running - which turns a
    // wave's payout into a heal exactly once, and makes the press a question
    // about timing rather than about health. Best used on the corpse of
    // something big, which is the same moment the floor is covered.
    //
    // Eight seconds, not five. Five almost never overlaps an actual payout:
    // orbs arrive on a kill and are picked up over the following few seconds,
    // and a window shorter than the collection is a window that mostly misses.
    effects: [['CREDITS ALSO HEAL YOU', GOOD]],
    duration: 8,
    use: (game) => {
      game.player.orbHealEnd = game.time + 8;
      game.money.vacuum();
      game.effects.shockwave(game.player.pos, THEME.blood, 8, 0.55);
      game.sfx.itemSurge();
    },
    end: (game) => { game.player.orbHealEnd = 0; },
  },

  // ---- the health bar, four ways -----------------------------------------

  itemLastStand: {
    name: 'WATERLINE',
    charge: 40,
    theme: THEME.vitality,
    // A FLOOR, NOT A HEAL, and it is worth less than TRAUMA KIT at every
    // health total above twenty-five missing - which is most of them. What it
    // buys is the bottom of the bar: at eight health it is a fifty-point heal
    // on a forty-second timer, and that is the only place it is the best item in
    // the pool. Forty seconds, because an item that is dead weight two thirds of
    // the time has to be there when the third arrives.
    effects: [['HEAL UP TO HALF HEALTH', GOOD], ['NOTHING ABOVE IT', NOTE]],
    use: (game) => {
      const p = game.player;
      const line = p.maxHealth * 0.5;
      if (p.health >= line) {
        // A press that does nothing has to SAY it did nothing, or it reads as
        // a dropped input. The same distinction tryItem draws between an empty
        // slot and an uncharged one.
        game.sfx.denied();
        game.effects.shockwave(p.pos, THEME.vitality, 3, 0.3);
        return;
      }
      p.health = line;
      game.effects.shockwave(p.pos, THEME.vitality, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0x8affc1, 24, 5, 3, 0.6);
      game.sfx.itemHeal2();
    },
  },

  itemRegen: {
    name: 'SUTURE ENGINE',
    charge: 30,
    theme: THEME.vitality,
    // TWENTY HEALTH THAT ARRIVES SLOWLY, against TRAUMA KIT's twenty-five that
    // arrives now - and TRAUMA KIT costs fifty where this costs thirty. That
    // is the whole comparison and it is a real one: this is cheaper, slower
    // and worse under pressure, so it is the item you press BEFORE the wave
    // rather than during it - and it heals through damage rather than being
    // erased by it, which nothing else in the pool does.
    effects: [['REGENERATE HEALTH', GOOD]],
    duration: 10,
    use: (game) => {
      game.effects.shockwave(game.player.pos, THEME.vitality, 6, 0.5);
      game.sfx.itemHeal2();
    },
    tick: (game, s, dt) => {
      heal(game.player, 2 * dt);
      // A drip rather than a stream: sixty motes a second is a fog, and this
      // has to still read as healing eight seconds later.
      s.drip = (s.drip || 0) - dt;
      if (s.drip > 0) return;
      s.drip = 0.32;
      game.effects.impact(game.player.eyeInto(_v), 0x8affc1, 4, 2, 2, 0.45);
    },
  },

  itemDonate: {
    name: 'OPEN VEIN',
    charge: 50,
    theme: THEME.blood,
    // HEALTH INTO AMMUNITION, at a rate that only looks bad. A full reserve is
    // three hundred rounds and there is no other way to buy them mid-wave: the
    // ammo pickup is a drop the player does not control, and running dry in a
    // fight is the one failure that cannot be played around.
    //
    // Fifty seconds. Fifty health is already the price -
    // charging the slot for almost a whole wave on top of it means the item is
    // never the right press, which is the same as not shipping it.
    effects: [['REFILL YOUR RESERVE', GOOD], ['COSTS 50 HP', NOTE]],
    use: (game) => {
      const p = game.player;
      pay(p, 50);
      p.reserveAmmo = p.maxReserve;
      game.ui.damage();
      game.ui.flashReserve();
      game.effects.shockwave(p.pos, THEME.blood, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0xff2d6f, 28, 6, 3, 0.7);
      game.sfx.itemPact();
    },
  },

  itemRoulette: {
    name: 'SIX CHAMBERS',
    charge: 36,
    theme: THEME.gamble,
    // THE ONLY ITEM IN THE POOL THE PLAYER CANNOT PLAN AROUND. Fifty-fifty
    // between a full heal and one health, which is worth pressing at almost
    // any health total below half and worth nothing above it - so the decision
    // is not whether to gamble, it is when the gamble is free.
    //
    // THE SPIN IS SIX TENTHS OF A SECOND OF NOTHING HAPPENING, and it is the
    // most important part. Resolved on the frame of the press this is a number
    // changing; held for a beat with a cylinder turning under it, it is a
    // gamble the player watches land. Nothing else in the game asks them to
    // wait for an answer.
    effects: [['HEAL TO FULL,', GOOD], ['OR DROP TO 1 HP', NOTE]],
    duration: 0.6,
    hud: false,
    use: (game, s) => {
      // Rolled NOW and revealed later, not rolled at the reveal. If the coin
      // were tossed at the end, a player killed during the spin would have
      // died to an outcome that had not happened yet.
      s.won = Math.random() < 0.5;
      game.sfx.itemSpin();
      game.effects.shockwave(game.player.pos, THEME.gamble, 5, 0.6);
    },
    tick: (game, s, dt) => {
      s.t = (s.t || 0) + dt;
      s.click = (s.click || 0) - dt;
      if (s.click > 0) return;
      // The clicks come FASTER as the cylinder slows, which is backwards for a
      // real revolver and exactly right for a countdown: the ear reads
      // accelerating ticks as an arrival.
      s.click = 0.14 - Math.min(0.09, s.t * 0.13);
      game.effects.impact(game.player.eyeInto(_v), 0xff5252, 3, 2, 1.5, 0.2);
    },
    end: (game, s) => {
      const p = game.player;
      if (s.won) {
        p.health = p.maxHealth;
        game.effects.shockwave(p.pos, THEME.vitality, 10, 0.7);
        game.effects.burst(p.eyeInto(_v), 0x8affc1, 40, 7, 4, 0.9);
        game.ui.banner('LOADED');
        game.sfx.itemHeal2();
      } else {
        p.health = 1;
        p.clearCarnage();
        game.effects.shockwave(p.pos, THEME.gamble, 10, 0.7);
        game.effects.burst(p.eyeInto(_v), 0xff2d6f, 40, 7, 4, 0.9);
        game.ui.banner('EMPTY');
        game.ui.damage();
        game.sfx.hurt();
      }
      game.effects.addShake(0.3);
    },
  },

  itemGraft: {
    name: 'GRAFT',
    charge: 60,
    theme: THEME.temper,
    // THE ONLY ITEM THAT LEAVES A MARK ON THE RUN. Everything else in the pool
    // is spent the moment it is pressed; this one is three health that is
    // still there an hour later, and a run that carries it from wave four to
    // wave twenty is carrying a real number by the end.
    //
    // It rides hpBanked - the field UNTOUCHED and SCAR TISSUE already write -
    // rather than a new one, so it survives rebuildMods() and shows up in the
    // maxHealth getter without anything being taught about it.
    //
    // Sixty seconds, and it stays sixty. A permanent gain has to be rare or it
    // is not a decision, it is a tax on not pressing the button.
    effects: [['+3 MAX HEALTH', GOOD], ['PERMANENTLY', GOOD]],
    use: (game) => {
      const p = game.player;
      p.hpBanked += 3;
      heal(p, 3);
      game.effects.shockwave(p.pos, THEME.temper, 6, 0.6);
      game.effects.burst(p.eyeInto(_v), 0xb2ff59, 24, 5, 3, 0.7);
      game.ui.banner('+3 MAX HP');
      game.sfx.itemGraft();
    },
  },

  // ---- getting out of somewhere ------------------------------------------

  itemBoot: {
    name: 'BOOTSTRAP',
    charge: 30,
    theme: THEME.leap,
    // STRAIGHT UP, AND THAT IS THE WHOLE DESIGN. BLINK DRIVE goes forward,
    // which is useless when what is wrong is that you are surrounded; this
    // leaves the floor entirely, and the floor is where every melee enemy in
    // the game lives. It clears the catwalks, so it is also the only way to
    // get on top of the room on purpose.
    //
    // The blast underneath is not free damage, it is the reason the launch is
    // believable - and it is priced as FOUR OF THE PLAYER'S OWN BULLETS rather
    // than as a flat number, which is what a flat 45 stopped being worth by
    // wave ten. Read live off the gun through getEffectiveDamage, so every
    // damage passive item in the build feeds it exactly the way it feeds a
    // shot, and it is still four rounds' worth at wave twenty - big enough to
    // matter under a crowd, nowhere near enough to press this for the damage.
    //
    // Thirty seconds. An escape that is not there when you need it
    // is not an escape, and this one commits the player to an arc they cannot
    // steer out of, which is its own price.
    effects: [['LAUNCH YOURSELF SKYWARD', GOOD], ['AND SCORCH THE GROUND', GOOD]],
    use: (game) => {
      const p = game.player;
      _v.set(p.pos.x, 0, p.pos.z);
      game._blast(_v, p.getEffectiveDamage(p.weapon.damage) * 4, 5, null, false);
      // Written straight onto the velocity, above the 22 m/s^2 in update() -
      // 17 tops out at about 6.5m, which is over the catwalks and over
      // everything in the enemy pool.
      p.vel.y = 17;
      p.onGround = false;
      p.jumpsLeft = 0;
      game.effects.shockwave(_v, THEME.leap, 5, 0.5);
      game.effects.burst(_v, 0xff8c1a, 30, 7, 6, 0.6);
      game.effects.addShake(0.3);
      game.sfx.itemBoot();
    },
  },

  itemBlink: {
    name: 'COLD SPOT',
    charge: 40,
    theme: THEME.poise,
    // NOT A TELEPORT THE PLAYER AIMS. They press it because they are in
    // trouble, and being asked to pick a destination at that moment is being
    // asked to solve the problem the item is for. It picks the emptiest of the
    // arena's own spawn points, which are already the places the game
    // considers open ground.
    //
    // A SECOND AND A HALF OF INVULNERABILITY, not one. Arriving is not the
    // same as being safe: the room has to be given time to notice, and one
    // second is roughly a frame more than a chaser needs to close the gap it
    // was already closing.
    effects: [['TELEPORT TO OPEN GROUND', GOOD], ['BRIEFLY INVINCIBLE', GOOD]],
    use: (game) => {
      const p = game.player;
      let best = null;
      let bestScore = Infinity;
      for (const sp of game.arena.spawnPoints) {
        let score = 0;
        for (const e of game.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.pos.x - sp.x, e.pos.z - sp.z);
          // Inverse-square-ish crowding rather than a count inside a radius: a
          // point with one enemy at two metres is far worse than one with four
          // at fifteen, and a hard radius cannot say so.
          if (d < 18) score += 1 / (d * d + 1);
        }
        // Ties broken toward the FURTHER point, so the item always feels like
        // it moved you somewhere when the room is empty.
        score -= p.pos.distanceTo(sp) * 0.0004;
        if (score >= bestScore) continue;
        bestScore = score;
        best = sp;
      }
      if (best) {
        game.effects.burst(p.eyeInto(_v), 0x7c4dff, 30, 7, 3, 0.6);
        game.effects.shockwave(p.pos, THEME.poise, 6, 0.5);
        const fromX = p.pos.x;
        const fromZ = p.pos.z;
        p.pos.set(best.x, p.pos.y, best.z);
        p.vel.set(0, p.vel.y, 0);
        p.extX = 0;
        p.extZ = 0;
        // TURNED TO FACE WHERE YOU JUST WERE. A blink that left the view
        // pointing wherever it happened to be pointing dropped the player into
        // a strange corner facing a wall, with the thing they escaped somewhere
        // behind them - so the first second of a 1.5s invulnerability was spent
        // finding the fight again. Looking back at it means the escape and the
        // reassessment are the same moment.
        //
        // Forward is (-sin yaw, 0, -cos yaw) - see Player.forwardInto - so the
        // yaw that points at a delta is atan2 of its negated components.
        const dx = fromX - p.pos.x;
        const dz = fromZ - p.pos.z;
        if (dx * dx + dz * dz > 1e-6) p.yaw = Math.atan2(-dx, -dz);
      }
      p.invulnEnd = Math.max(p.invulnEnd, game.time + 1.5);
      game.effects.shockwave(p.pos, THEME.poise, 8, 0.7);
      game.effects.burst(p.eyeInto(_v), 0x7c4dff, 30, 7, 3, 0.6);
      game.sfx.itemBlink();
    },
  },

  itemCharge: {
    name: 'BONESAW',
    charge: 15,
    theme: THEME.surge,
    // THE SAME DASH BLINK DRIVE FIRES, with a hitbox on it. Deliberately the
    // same movement - the same envelope, the same distance, the same
    // forward-only commitment (see DASH_TIME in player.js) - because the point
    // of comparison IS the other item: one of them gets you out of a crowd and
    // the other one goes through it, and a player choosing between them should
    // be choosing what happens on the way, not learning a second movement.
    //
    // A QUARTER LONGER, AND INVULNERABLE FOR ALL OF IT. Both halves are the
    // same fix: an item whose whole instruction is "go through them" cannot
    // charge the player for the bodies it goes through, or the correct way to
    // press it is at nothing. The window is exactly the dash - it opens on the
    // press and closes when the movement does - so there is no invulnerability
    // left over on the far side to play around.
    //
    // The extra distance is bought with SPEED rather than with time (see
    // Player.dash), so the envelope, the window and the hand-back are still
    // BLINK DRIVE's to the frame, and the two items are still the same
    // movement with different things happening on the way.
    effects: [['DASH THROUGH ENEMIES', GOOD], ['DEALING BONUS DAMAGE', GOOD]],
    duration: 0.7,
    hud: false,
    use: (game, s) => {
      const p = game.player;
      p.dash(game.time, 1.25, p.pitch);
      p.invulnEnd = Math.max(p.invulnEnd, game.time + 0.7);
      s.hit = new Set();
      game.effects.burst(game.player.pos, THEME.surge, 18, 6, 2, 0.4);
      game.sfx.itemCharge();
    },
    tick: (game, s) => {
      const p = game.player;
      const dmg = p.getEffectiveDamage(p.weapon.damage) * 3;
      for (const e of game.enemies) {
        if (e.dead || s.hit.has(e)) continue;
        const dx = e.pos.x - p.pos.x;
        const dz = e.pos.z - p.pos.z;
        const reach = e.radius + 1.3;
        if (dx * dx + dz * dz > reach * reach) continue;
        // Once each, which is what the set is for: a dash that lingered beside
        // a body for three frames would otherwise deal nine times damage to
        // whatever it happened to clip slowly.
        s.hit.add(e);
        _v.set(dx, 0, dz).normalize();
        game.hurtEnemy(e, dmg, _v);
        game._shove(e, _v, 2.2);
        game.effects.burst(e.pos, 0x1de9b6, 16, 6, 3, 0.35);
        game.effects.addShake(0.12);
        game.sfx.impact();
      }
    },
  },

  itemLance: {
    name: 'LANCE',
    charge: 20,
    theme: THEME.pierce,
    // THIRTY ROUNDS AT ONCE, AS ONE ROUND. It is the magazine spent in a
    // straight line, which is why it costs the ammunition rather than being
    // free: the item is not extra damage, it is the SHAPE of damage the pulse
    // rifle cannot make - everything standing between you and the wall, in one
    // frame, through cover the pierce passive item would have stopped at.
    //
    // IT REFUSES WHEN THE ROUNDS ARE NOT THERE, out loud. A press that spent
    // the charge and fired nothing would be the worst failure in the pool, and
    // the denial noise is one the player has already learnt from pressing an
    // uncharged item.
    effects: [['ONE SHOT, 30x DAMAGE', GOOD], ['PIERCES ALL', NOTE], ['COSTS 30 AMMO', NOTE]],
    ready: (game) => game.player.mag + game.player.reserveAmmo >= 30,
    use: (game) => {
      const p = game.player;
      // Out of the magazine first and the reserve second, which is the order
      // every other round in the game is spent in.
      let owed = 30;
      const fromMag = Math.min(p.mag, owed);
      p.mag -= fromMag;
      owed -= fromMag;
      p.reserveAmmo = Math.max(0, p.reserveAmmo - owed);
      game.megaShot(30);
    },
  },

  // ---- things left in the arena ------------------------------------------

  itemTurret: {
    name: 'LITTLE BROTHER',
    charge: 40,
    theme: THEME.feed,
    // FIRE FROM SOMEWHERE THE PLAYER IS NOT. That is the only thing in this
    // game a second gun can buy, and it is worth a slot: a turret behind the
    // crowd means the crowd is taking fire while it walks toward you, which is
    // a position no amount of the player's own damage can create.
    //
    // ONE OF THE PLAYER'S OWN SHOTS PER ROUND, twice a beat, for fifteen
    // seconds - so it scales with the build instead of falling off it, and it
    // is still placement rather than damage: everything it does, the player
    // could have done by standing there, and standing there is the thing the
    // turret is buying them out of.
    //
    // THROWN, NOT PLACED. It used to be set down a step and a half in front,
    // which made an item whose entire decision is WHERE into one with no
    // decision at all. Now it goes where it is aimed - across the room, behind
    // the crowd - which is the only place a second gun is worth having.
    effects: [['THROW AN AUTO-TURRET', GOOD]],
    use: (game) => {
      const p = game.player;
      p.muzzleInto(_v);
      facing(game);
      game.deploy(new Lob(game, _v, _dir, 'turret', p.getEffectiveDamage(p.weapon.damage)));
      game.sfx.itemDeploy();
    },
  },

  itemMine: {
    name: 'WELCOME MAT',
    charge: 30,
    theme: THEME.shrapnel,
    // THE PLAYER CANNOT SET IT OFF AND CAN STILL BE KILLED BY IT. Both halves
    // were asked for and both are right: the trigger belongs to the enemy, and
    // the blast belongs to the room. A mine you could safely stand next to
    // would be five free shots' worth on a six-metre circle every eight
    // seconds; a mine that went off under your own feet could not be thrown
    // anywhere worth throwing it.
    //
    // FIVE OF THE PLAYER'S OWN SHOTS. It is the biggest single number the item
    // pool hands out, and it should be: it has to be aimed, it has to be
    // waited for, and the thing it kills has to walk onto it.
    //
    // Thirty seconds, so the player can lay a line of them across the way in
    // during a lull - which is the item, and it is a completely different item
    // from pressing it once when something is already on top of you.
    effects: [['THROW A PROXIMITY MINE', GOOD], ['THE BLAST HURTS YOU TOO', NOTE]],
    use: (game) => {
      const p = game.player;
      p.muzzleInto(_v);
      facing(game);
      game.deploy(new Lob(game, _v, _dir, 'mine', p.getEffectiveDamage(p.weapon.damage) * 5));
      game.sfx.itemDeploy();
    },
  },

  itemBomb: {
    name: 'SHORT FUSE',
    charge: 30,
    theme: THEME.blast,
    // THREE SECONDS IS THE ITEM. Every other blast in the pool happens at the
    // moment it is asked for; this one happens where the fight is GOING to be,
    // which is a different skill and the only place in the game the player is
    // asked to use it. Thrown short and it kills them, thrown long and it
    // kills nothing.
    //
    // It hurts the player for exactly that reason. A bomb that could be
    // dropped underfoot for free would never be thrown anywhere else.
    effects: [['THROW A BOMB - SHORT FUSE', GOOD], ['THE BLAST HURTS YOU TOO', NOTE]],
    use: (game) => {
      const p = game.player;
      p.muzzleInto(_v);
      facing(game);
      game.deploy(new Bomb(game, _v.x, _v.y, _v.z, _dir.x, _dir.z));
      game.sfx.itemDeploy();
    },
  },

  itemWall: {
    name: 'FIREBREAK',
    charge: 12,
    theme: THEME.hellfire,
    // A LINE, WHERE EVERYTHING ELSE IS A CIRCLE. The answer to every radial
    // effect in this game is the same - back off - and the one item that asks
    // a different question is the one that says "not through here". Laid
    // ACROSS the player's facing, so it goes up between them and whatever they
    // are looking at, which is the only orientation anybody ever wants.
    //
    // IT STOPS ENEMY ROUNDS, which is the half that makes it a wall rather
    // than a long thin lava patch, and the half a player discovers by standing
    // behind one during a shooter volley.
    effects: [['RAISE A WALL OF FIRE', GOOD], ['BURNS, AND STOPS SHOTS', GOOD]],
    use: (game) => {
      const p = game.player;
      facing(game);
      // Four and a half metres out. Close enough that it is unambiguously the
      // player's wall and far enough that they are not standing in it - at
      // three the flames sat on the camera and the arena behind them was gone.
      const x = Math.max(-BOUND + 5, Math.min(BOUND - 5, p.pos.x + _dir.x * 4.5));
      const z = Math.max(-BOUND + 5, Math.min(BOUND - 5, p.pos.z + _dir.z * 4.5));
      game.deploy(new FireWall(game, x, z, _dir.x, _dir.z, game.player.dotHit * 1.5));
      game.effects.shockwave(_v.set(x, 0, z), THEME.hellfire, 5, 0.5);
      game.sfx.itemDeploy();
    },
  },

  itemSwarm: {
    name: 'APIARY',
    charge: 45,
    theme: THEME.salvage,
    // FIVE SMALL THINGS RATHER THAN ONE BIG ONE. A single strong ally is a
    // second turret; five weak ones are a CLOUD, and a cloud does the one
    // thing a turret cannot - it spreads itself over the crowd without being
    // told to, and it follows the crowd when the crowd moves.
    //
    // Forty-five seconds, not sixty-four. Sixty-four is longer than most waves
    // last, which means the item would frequently be uncastable in the fight
    // it was taken for.
    effects: [['RELEASE HUNTING BEES', GOOD]],
    use: (game) => {
      const p = game.player;
      for (let i = 0; i < 5; i++) {
        game.deploy(new Bee(game, p.pos.x, p.pos.z, (i / 5) * Math.PI * 2));
      }
      game.effects.shockwave(p.pos, THEME.salvage, 5, 0.5);
      game.effects.burst(p.eyeInto(_v), 0xc6ff00, 26, 5, 3, 0.6);
      game.sfx.itemSwarm();
    },
  },

  itemHole: {
    name: 'EVENT HORIZON',
    charge: 60,
    theme: THEME.gravity,
    // THROWN, NOT PLACED. The orb flies flat and fast along the line of sight,
    // so where the hole opens is a shot the player took rather than a circle
    // they stood in - and it can be put on the far side of a crowd, which is
    // the placement that actually gathers them.
    //
    // IT NEVER PULLS THE PLAYER. Asked for explicitly and correct anyway: a
    // pull that cannot be fought is the one thing in this game that takes the
    // movement away, and taking the movement away from the player who spent a
    // slot on the item is not a drawback, it is a bug with a rationale.
    effects: [['THROW A SINGULARITY', GOOD], ['IT DRAGS THEM IN', GOOD]],
    use: (game) => {
      const p = game.player;
      p.muzzleInto(_v);
      // The CAMERA's direction, not the flattened yaw: this is the one thrown
      // thing in the pool the player aims with the crosshair, so a shot taken
      // at a flier has to go up.
      game.camera.getWorldDirection(_dir);
      // TWICE ONE OF THE PLAYER'S OWN SHOTS A BEAT, snapshotted at the throw
      // the way a turret's damage is: the hole was opened by the gun in hand.
      game.deploy(new HoleOrb(game, _v.x, _v.y, _v.z, _dir.x, _dir.y, _dir.z,
        p.getEffectiveDamage(p.weapon.damage) * 2));
      game.pad.rumble(0.5, 0.6, 220, 2);
      game.sfx.itemDeploy();
    },
  },

  // ---- the shop, and the floor -------------------------------------------

  itemLodestar: {
    name: 'LODESTAR',
    charge: 60,
    theme: THEME.lodestone,
    // THE WAVE-CLEAR SWEEP, ON DEMAND. Every orb and every pickup in the arena
    // comes in at once - the same sweep a cleared wave already does for free,
    // which is exactly why this is cheap: the player is not buying the
    // pickups, they are buying them EARLY, in the middle of a fight where
    // walking across the room to a health drop is what would have killed them.
    //
    // Thirty seconds. It pays nothing on a clean floor, so it has to be there
    // on the frame the floor is covered.
    effects: [['PULL IN EVERY ORB', GOOD], ['AND EVERY PICKUP', GOOD]],
    use: (game) => {
      game.money.vacuum();
      // `true` applies buff pickups NOW rather than banking them for the next
      // wave - see _vacuumPickups. The wave-clear sweep banks them because the
      // wave is over; this one is pressed mid-fight, and a rage that started
      // counting down at the next wave start would be a rage the player never
      // got.
      game._vacuumPickups(true);
      game.effects.shockwave(game.player.pos, THEME.lodestone, 12, 0.7);
      game.sfx.pickupMagnet();
      game.sfx.itemSurge();
    },
  },

  itemCrit: {
    name: 'SWEET SPOT',
    charge: 60,
    theme: THEME.deadeye,
    // EIGHT SECONDS OF THE THING THE PLAYER HAS BEEN ROLLING FOR. Every run has
    // seen the yellow number since its first magazine - critChance is 5% in
    // DEFAULT_MODS precisely so that it has - so this item does not have to
    // teach anything. It hands over a number the player already wants more of.
    //
    // IT DOES NOT SET critChance TO 1, and the difference matters at both ends.
    // A window written into `mods` would be handed straight back by the next
    // totem walked into (rebuildMods replays the owned list from defaults), and
    // it would also OVERWRITE a DEAD CENTER run's halved chance rather than
    // sitting on top of it. `itemCritEnd` is a deadline on the player, read at
    // the moment a pellet lands (Game._resolveHit), which means the crit
    // MULTIPLIER is still whatever the build says it is: a run carrying DEAD
    // CENTER presses this and gets eight seconds of triple damage.
    //
    // Sixty - the pool's top price, beside AEGIS and OVERDRIVE. It is a damage
    // window like OVERDRIVE and it is worth slightly less on a bare build
    // (1.5x against 2x) and a great deal more on one that has drafted for it,
    // which is exactly the shape an item that rewards a build should have.
    effects: [['EVERY SHOT CRITS', GOOD]],
    duration: 8,
    hud: true,
    use: (game) => {
      const p = game.player;
      p.itemCritEnd = Math.max(p.itemCritEnd, game.time + 8);
      game.effects.shockwave(p.pos, THEME.deadeye, 6, 0.55);
      game.effects.burst(p.eyeInto(_v), 0xffe95e, 22, 5, 3, 0.6);
      game.sfx.itemSurge();
    },
    // Written back to zero rather than trusted to expire, for the same reason
    // every other window in this file has an end(): a wave boundary, a death or
    // a versus handover clears the running list, and a deadline that outlived
    // its chip would be eight seconds nobody was granted.
    end: (game) => { game.player.itemCritEnd = 0; },
  },

  itemAmmo: {
    name: 'BANDOLIER',
    charge: 40,
    theme: THEME.brass,
    // THE ONLY ITEM IN THE POOL THAT ANSWERS THE RESERVE. Ammo is the one
    // resource with no button on it: health has the TRAUMA KIT, the crowd has
    // six answers, and running dry has always meant walking to a station or to
    // a crate on the floor. Thirty rounds is a station's worth in the middle of
    // a fight, at the moment the player cannot afford to cross the room.
    //
    // CLAMPED AT THE CAP, and the press is still allowed at a full reserve -
    // refusing it would be a rule the player discovers by being denied, and the
    // pool already has exactly one refusal in it (LANCE) for a reason that does
    // not apply here.
    //
    // TRIPLE TAP AND AMMO HOARDER BOTH TOUCH IT and neither is special-cased:
    // thirty rounds is thirty ROUNDS, so a build spending three per shot gets
    // ten shots out of this, and a build with a doubled reserve has more room
    // to put them in. That is the honest reading of the card.
    effects: [['+30 RESERVE ROUNDS', GOOD]],
    use: (game) => {
      const p = game.player;
      const before = p.reserveAmmo;
      p.reserveAmmo = Math.min(p.maxReserve, p.reserveAmmo + 30);
      game.effects.shockwave(p.pos, THEME.brass, 5, 0.45);
      // Brass off the gun rather than a wash over the player: the thing that
      // changed is what is in the weapon, so the tell is at the weapon.
      game.effects.burst(p.muzzleInto(_v), 0xffb300, 18, 4, 2.4, 0.5);
      // The number in the corner is where a player actually reads their
      // ammunition - the puff at the muzzle is lost in a firefight. Same flare
      // BRASS ECHO's refund uses, for the same reason.
      if (p.reserveAmmo > before) game.ui.flashReserve();
      game.sfx.itemAmmo();
    },
  },

  itemMonkey: {
    name: 'ORGAN GRINDER',
    charge: 50,
    theme: THEME.hex,
    // THE ONLY ITEM IN THE GAME THAT TAKES THE PLAYER OUT OF THE FIGHT WITHOUT
    // MOVING THEM. Every other answer to being surrounded is about where the
    // PLAYER ends up - the dash, TECTONIC's shove, FIREBREAK's line, AEGIS's
    // window. This one changes where the enemies are LOOKING, and for five
    // seconds the answer is: not at you.
    //
    // IT CANNOT BE KILLED, and that is the whole reason the number on the card
    // is a number of seconds. A decoy with health would last as long as the
    // wave decided - forever on wave three, half a second on wave thirty - and
    // the player would have no way to know which run they were in.
    //
    // EIGHT OF THE PLAYER'S OWN SHOTS, snapshotted at the throw the way the
    // turret's and the mine's are: the monkey was wound up out of the gun that
    // was being held, and one that quietly got stronger because a totem was
    // claimed while it sat there would be a bomb nobody aimed. It is the
    // biggest single blast in the pool and it should be - it takes five
    // seconds, it has to be thrown somewhere useful, and the thing that makes
    // it worth eight shots is that the crowd walks INTO it.
    //
    // THE BLAST DOES NOT KNOW THE PLAYER, unlike SHORT FUSE's and WELCOME MAT's.
    // Those two are aimed at ground; this one is aimed at a crowd that is by
    // construction somewhere the player is not, and punishing them for having
    // been surrounded when they threw it would undo the item outright.
    effects: [
      ['THROW A DECOY THAT', GOOD],
      ['DRAWS ENEMY FIRE', NOTE],
      ['IT EXPLODES AT THE END', GOOD],
    ],
    use: (game) => {
      const p = game.player;
      p.muzzleInto(_v);
      facing(game);
      game.deploy(new Monkey(game, _v, _dir, p.getEffectiveDamage(p.weapon.damage) * 8));
      game.sfx.itemMonkeyThrow();
    },
  },

  itemReroll: {
    name: 'SECOND OPINION',
    charge: 50,
    theme: THEME.charge,
    // THE ONLY ITEM IN THE POOL THAT DOES NOTHING IN A FIGHT, and it IS the
    // reroll rather than a token that buys one. It used to hand out two free
    // rerolls to be spent at a console afterwards, which made the press a
    // piece of bookkeeping: the player pressed the button, read a banner, and
    // then still had to walk to the console and do the thing. One press, one
    // new set of three, no second step.
    //
    // Free, and it does not touch the console's own ladder - see _itemReroll
    // in main.js. What the player is buying is the escalating price they are
    // not paying.
    //
    // A charge that is earned in the fight and spent in the shop is also the
    // one item whose timing is trivially correct, which is a fair trade for it
    // being useless the other ninety percent of the time.
    effects: [['REROLLS SHOP ON USE', GOOD], ['FREE OF CHARGE', NOTE]],
    // REFUSED WHERE THERE IS NOTHING TO REROLL - between waves the totems are
    // down, and a press that spent fifty enemies' worth of charge on an empty
    // room would be the worst failure in the pool. Same voice an uncharged
    // press gets, and the same voice the console gives for NOTHING TO REROLL.
    ready: (game) => game.totemArea.active && !game.totemArea.claimed,
    use: (game) => {
      game._itemReroll();
      game.effects.shockwave(game.player.pos, THEME.charge, 6, 0.5);
      game.ui.banner('REROLLED');
      game.sfx.reroll();
    },
  },

  itemLockpick: {
    name: 'LOCKPICK',
    charge: 120,
    theme: THEME.lockpick,
    // THE MOST EXPENSIVE ITEM IN THE POOL, and it has to be: what it buys is
    // the thing every other item in this file is bought WITH. A hundred and
    // twenty dead chasers is most of two waves, and what comes back is one
    // roll of a box that would otherwise have cost a thousand dollars and
    // doubled from there.
    //
    // IT THROWS ITSELF AWAY. There is one slot, the box hands over what it
    // rolls, and taking that item is what replaces the lockpick - so this is
    // not a machine the player operates twice at one shop. It is a single
    // free roll, and the item it hands back is what the run carries out.
    // Refusing the swap is allowed and costs the roll, exactly as a paid roll
    // left to sink does; the charge is spent either way.
    //
    // SECOND OPINION'S SIBLING, priced the other way up. That one is a shop
    // press too, and it is cheap because a reroll is three cards; this is dear
    // because a box roll is the whole item catalogue.
    effects: [['A FREE MYSTERY BOX ROLL', GOOD], ['USED AT THE SHOP', NOTE]],
    // REFUSED WHERE THERE IS NO BOX TO PICK, on exactly the terms SECOND
    // OPINION is refused with no totems standing - and on the box's own
    // `canBuy`, so a press mid-spin or with an item already hanging there is
    // refused for the same reason a paid roll would be.
    ready: (game) => game.mysteryBox.canBuy,
    use: (game) => {
      game._freeBoxRoll();
      game.effects.shockwave(game.player.pos, THEME.lockpick, 6, 0.5);
      game.ui.banner('PICKED');
    },
  },

  itemPayToWin: {
    name: 'PAY TO WIN',
    charge: 0,
    theme: THEME.payToWin,
    // THE ONLY ITEM IN THE GAME THAT IS NOT PAID FOR IN ENEMIES. Its meter is
    // never drawn, because there is nothing to draw - the cost is a thousand
    // dollars, every press, and the credits readout in the top corner is the
    // charge bar. See UI.setItem, which hides the meter for any zero-charge
    // item rather than for this one by name.
    //
    // THE EXPLOIT IS THE FEATURE, AND IT IS BOUNDED. A player standing on a
    // pile of credits can press this until the pile is gone - that is the
    // whole joke, and it is safe because the pile is finite and because every
    // thousand spent here is a reroll, an ammo refill or a box roll that does
    // not happen. What it cannot become is free: there is no way to earn money
    // without killing, so pressing it is always spending a wave's takings.
    //
    // TWICE THE BASE SHOT, TO EVERYTHING. Read through getEffectiveDamage like
    // every other item's payload, so it scales with the build rather than
    // being a flat number that is enormous on wave three and nothing on wave
    // thirty. Against a crowd that is real money well spent; against one boss
    // it is two shots for a thousand dollars, which is the bad buy the name
    // promises.
    effects: [['$1,000 PER USE', NOTE], ['2x YOUR DAMAGE TO EVERY', GOOD], ['ENEMY IN THE ARENA', GOOD]],
    // The one item refused for want of MONEY rather than charge. Same voice an
    // uncharged press gets, because it is the same message - not now.
    ready: (game) => game.credits >= PAY_TO_WIN_COST,
    use: (game) => {
      const p = game.player;
      game.credits -= PAY_TO_WIN_COST;
      const dmg = p.getEffectiveDamage(p.weapon.damage) * 2;
      // A copy of the list, because hurtEnemy can kill and the sweep that
      // compacts `enemies` runs later in the frame - but a splitter's children
      // are pushed onto it the moment the parent dies, and paying the bonus to
      // something that was not on the floor when the button was pressed is the
      // one way this could hit the same enemy twice.
      const list = game.enemies.slice();
      for (const e of list) {
        if (!e.dead) game.hurtEnemy(e, dmg);
      }
      game.effects.shockwave(p.pos, THEME.payToWin, 30, 0.9);
      game.ui.banner('PAID');
      game.sfx.buy();
    },
  },
};

// What one press of PAY TO WIN takes out of the bank. A FLAT thousand, not a
// price that climbs with the wave like the two consoles' do (see blockPrice in
// upgrades.js): those two are things the player buys once or twice a shop, and
// this is a thing they may press eight times in a row. A doubling cost would
// turn the joke into a sum.
export const PAY_TO_WIN_COST = 1000;

export const ACTIVE_ITEM_KEYS = Object.keys(ACTIVE_ITEMS);

// FOUR HUMOURS' cycle, in order. Read by _landShot in main.js, which owns the
// per-shot statuses already - putting the list here rather than there is what
// keeps the item's whole definition in one file, and the shot path only has to
// know that there IS a cycle, not what is in it.
//
// The four are deliberately WEAKER than the passive items that own them -
// Venom's poison is longer, Cryo's slow is longer, Incendiary burns harder.
// What the item sells is having all four at once, which no draft can assemble.
export const HUMOURS = [
  { status: 'burn', dur: 2.5, power: 9, color: 0xff5a00 },
  { status: 'slow', dur: 1.6, power: 0, color: 0x7fe3ff },
  { status: 'poison', dur: 3.5, power: 7, color: 0x39d353 },
  { status: 'arc', dur: 0, power: 0, color: 0xffee58 },
];

// ---------------------------------------------------------------------------
// THE RUNNING LIST
// ---------------------------------------------------------------------------
//
// Fourteen of the thirty-seven items do not finish on the frame they start.
// This is the four lines that make that possible, and it is deliberately the
// smallest thing that could: a list of activations, each holding the item that
// made it, its own scratch object and a clock. No registry, no ids to keep in
// step, no per-item bookkeeping anywhere else in the game.
//
// WHY A LIST AND NOT FIELDS ON THE PLAYER. The player already carries the
// MARKS an item leaves (itemDamageMult and its neighbours) because those have
// to be read by the shot path and the damage sinks, which have no idea items
// exist. What it must NOT carry is the item's own state - a stack count, a
// coin toss, a set of bodies already hit - because that is one field per item
// on a class that would then have to reset thirty-two of them.
//
// RE-FIRING REFRESHES, IT DOES NOT STACK. The same rule Player.applyStatus
// follows, for the same reason: two BLOOD TAXes running at once would be nine
// times damage through a multiplier neither of them could correctly hand back,
// because whichever expired first would write 1 over the other's window.
export class RunningItems {
  constructor() {
    this.list = [];
  }

  /**
   * Fires an item. `use` runs for every item; only one with a `duration` is
   * kept, and only a kept one ever sees tick, onKill or end.
   *
   * @param {object} game
   * @param {string} id   a key of ACTIVE_ITEMS
   * @param {object} def  ACTIVE_ITEMS[id]
   */
  start(game, id, def) {
    // Ended, not merely dropped: the old activation is holding a multiplier
    // and its end() is the only thing that gives it back.
    this.stop(game, id);
    const s = {};
    def.use(game, s);
    if (!(def.duration > 0)) return;
    this.list.push({ id, def, s, t: def.duration, full: def.duration });
  }

  // Ends one activation early, running its end() so nothing is left written on
  // the player. Silent if it was not running.
  stop(game, id) {
    for (let i = 0; i < this.list.length; i++) {
      if (this.list[i].id !== id) continue;
      const r = this.list[i];
      this.list.splice(i, 1);
      if (r.def.end) r.def.end(game, r.s);
      return;
    }
  }

  /**
   * One frame. Ticks BEFORE the expiry test so an item always gets a tick on
   * the frame it was started and never gets one after it has ended - which is
   * what lets SUTURE ENGINE's eight seconds actually heal forty rather than
   * thirty-nine and a bit.
   */
  update(game, dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      // Clamped, so a long frame cannot bill more healing, more damage or more
      // burning than the window actually had left in it.
      const step = Math.min(dt, r.t);
      if (r.def.tick) r.def.tick(game, r.s, step);
      r.t -= dt;
      // `s.done` IS THE ITEM SAYING IT IS OVER, and it is what keeps the HUD
      // chip honest for anything whose real payload is a COUNT rather than a
      // clock. HAEMOPHAGE is ten hits inside twenty seconds: the twenty is a
      // backstop, and once the tenth hit lands the effect is gone whatever the
      // clock says. A chip that outlived its own effect is the HUD lying about
      // what the player is carrying.
      if (r.t > 0 && !r.s.done) continue;
      this.list.splice(i, 1);
      if (r.def.end) r.def.end(game, r.s);
    }
  }

  // An enemy died. Walked rather than dispatched because there is at most a
  // handful of these and exactly one item currently cares.
  onKill(game) {
    for (const r of this.list) {
      if (r.def.onKill) r.def.onKill(game, r.s);
    }
  }

  /**
   * Everything down, now, running every end(). Called wherever the run's other
   * lingering state is cleared - the wave ending, a death, a restart, a versus
   * handover - because a triple-damage window that survived a wave boundary
   * would be a buff the player was never granted.
   */
  clear(game) {
    for (const r of this.list) {
      if (r.def.end) r.def.end(game, r.s);
    }
    this.list.length = 0;
  }

  // What the HUD strip draws: one chip per running item that asked for one,
  // carrying the item's OWN icon and theme - the same "one shape holds whether
  // it is standing on a totem or counting down in the corner" rule the Opening
  // Salvo chip already follows.
  chips(out) {
    out.length = 0;
    for (const r of this.list) {
      if (r.def.hud === false) continue;
      out.push({
        key: r.id,
        icon: r.id,
        color: r.def.theme,
        fraction: Math.max(0, Math.min(1, r.t / r.full)),
        label: r.s.label || '',
      });
    }
    return out;
  }
}

// WHAT A POINT OF ITEM CHARGE COSTS, in enemy value.
//
// ONE POINT IS ONE BASIC ENEMY. A chaser is worth 100 value, so at a hundredth
// of a point per value it pays exactly 1. That is the whole unit: an item's
// `charge` above is HOW MANY CHASERS IT COSTS. A three-point dash is three of
// them, the sixty-point items are sixty, and a tank at 300 value pays three at
// once because it is three chasers' worth of wave.
//
// ITEMS USED TO CHARGE ON THE CLOCK, one point per second of wave time, and
// that paid the player for taking longer: kiting the last enemy of a wave was
// the cheapest way to refill the dearest item in the pool. It is the same
// defect the bounty had when the kill chain multiplied it - see the note at the
// kill sweep in main.js - and it has the same answer. Charge is bought with
// DEAD ENEMIES now, and the only way to get more is to kill more.
//
// A FLAT RATE, DELIBERATELY, rather than a share of the wave. A share would
// mean the same chaser paid twelve times more on wave one than on wave
// twenty-six, when the wave-twenty-six one has five and a half times the health
// - less charge for strictly more work, which is backwards. The cost of a thing
// should not depend on where in the run you meet it.
//
// SO LATER WAVES DO GRANT MORE, and that is the intended trade: wave 1 is six
// enemies (~6 points) and wave 26 is thirty-five (~71). More enemies on the
// floor is exactly when a crowd-clear should come back more often. It is also
// bounded - `value` never scales with the wave and the ground count caps at 34
// - so it plateaus around wave 26 instead of running away.
//
// READ OFF `value` AND NEVER OFF THE MONEY DROPPED. value is a flat per-type
// figure with no multipliers on it, so Midas, the flawless streak and the melee
// double cannot reach the charge. Paying on the credits actually collected
// would have turned all three into cooldown reduction, and made the richest
// runs - the ones least in need of help - the fastest-charging ones.
export const CHARGE_PER_VALUE = 0.01;

// The most charge a boss wave's adds can be worth between them.
//
// THE ONE PLACE A FLAT RATE NEEDS A CEILING. Every other wave has a fixed cast,
// so killing more is simply not possible; a boss wave trickles adds for as long
// as the boss is alive, which makes "leave it standing and farm" a strategy
// again unless something stops it. Set at roughly what the nominal sixteen adds
// a boss wave is reckoned to be worth would pay, so a player who fights the
// wave normally never touches it and a player who stalls gets nothing for it.
export const BOSS_ADD_CHARGE_CAP = 24;

// The most segments the HUD meter is ever cut into.
//
// TWELVE, because past that the cells are thinner than the gaps between them
// and a bar nobody can count is a bar that has stopped being segmented. It is
// also about the largest number a player can read at a glance without counting,
// which is the only way this is ever read.
export const ITEM_BAR_MAX_CELLS = 12;

/**
 * How many segments an item's charge meter is cut into.
 *
 * ONE RULE, TWO BEHAVIOURS, and the second falls out of the first:
 *
 *   - Twelve points or less: one segment per point. A three-point item wears
 *     three fat blocks, so the segment WIDTH is itself a reading - the bar is
 *     always the same length, and a wide cell means a cheap item.
 *   - Longer than twelve: twelve segments, each worth `charge / 12` points.
 *
 * The caller lights `floor(frac * cells)` of them, which is what makes both
 * cases exact and keeps every segment whole. Under twelve that reduces to
 * `floor(pointsBanked)` - literally one cell per point earned - and over it the
 * cells are evenly spaced by construction at a rational fraction of the cost,
 * so a 13, 25, 27, 33 or 40 point item divides as evenly as twelve segments can
 * divide anything. Nothing here needs the cost to be a multiple of twelve, or
 * even to be a whole number of points.
 *
 * THE NUMBERS DID NOT MOVE WHEN THE UNIT DID. This used to be seconds, and the
 * costs are the same thirty-seven figures they always were - what changed is
 * what fills them, so the segmenting is untouched along with the ratios.
 *
 * @param {number} charge  points to fill
 * @returns {number} 1..ITEM_BAR_MAX_CELLS
 */
export function itemCells(charge) {
  return Math.max(1, Math.min(ITEM_BAR_MAX_CELLS, Math.ceil(charge)));
}

/**
 * The items a player could be given right now, in a random order.
 *
 * NEVER THE ITEM ALREADY CARRIED. A box that can hand back what is already in
 * the slot is a box that can charge two thousand dollars for nothing, and there
 * is no way for the player to see that coming. With thirty-seven items and one
 * carried there are always thirty-six left, so this can never come up empty.
 *
 * THE EXCLUSION IS PER PLAYER AND COSTS NOTHING TO MAKE SO. Versus is hot seat:
 * one Player instance whose whole run - `item` included - is snapshotted and
 * restored at each handoff (see captureRun in versus.js). `carried` is therefore
 * always the ACTIVE player's item, and a box rolled by player two cannot know
 * or care what player one is holding. The caller passes `game.player.item` and
 * that is the whole of it.
 *
 * SHUFFLED, NOT SAMPLED, because the box walks this list rather than rolling
 * against it once per tick. A walk cannot show the same item twice in a row -
 * which a per-tick roll does roughly once every thirty ticks, and it reads as
 * the reel having stuck - and over a long spin it shows the player a real
 * cross-section of what is in the box instead of the same four favourites.
 *
 * FLAT, and never gated on the wave. Every item in the pool is meant to be
 * reachable. A deep pool is already the thing a weighting would have been for,
 * and now that the box stands in every shop the pool is the only thing between
 * a run and its whole catalogue.
 *
 * @param {string|null} carried  the id in the player's slot, excluded
 * @returns {string[]} a fresh array, safe for the caller to keep and consume
 */
export function shuffledPool(carried) {
  const pool = ACTIVE_ITEM_KEYS.filter((k) => k !== carried);
  // Fisher-Yates, in place on the copy filter() just handed us.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  return pool;
}

/**
 * One item the player is not carrying. The single-draw form of the above, kept
 * for callers that want an item rather than a reel.
 *
 * @param {string|null} carried  the id in the player's slot, excluded
 * @returns {string} an item id
 */
export function rollItem(carried) {
  return shuffledPool(carried)[0];
}
