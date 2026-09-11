// Roguelike upgrade pool and the wave-clear roll.
//
// Pure data plus a weighted picker: no three.js, no DOM, no game state. Like
// waves.js, this module is a leaf - main.js rolls one upgrade when a wave is
// cleared, hands the id to Player.takeUpgrade(), and it mutates player.mods
// from there. The player is never asked to choose; the roll is the reward.
//
// HOW AN UPGRADE WORKS
//   Every upgrade is a pure function of the stack count. `apply(mods, n)` is
//   called with n = 1, 2, 3... as the player takes it repeatedly, and is
//   ALWAYS re-applied from a fresh set of defaults (see Player.rebuildMods).
//   That means apply() must set absolute values, never accumulate:
//
//     GOOD  mods.fireRate *= 1 + 0.2 * n      (n is the full stack)
//     BAD   mods.fireRate *= 1.2              (only correct for n === 1)
//
//   Rebuilding from scratch is what keeps a run's stats reproducible and stops
//   rounding drift over twenty picks. It costs nothing - it runs once per
//   draft pick, not per frame.
//
// ADDING AN UPGRADE
//   Add an entry here with a unique key, a `max` stack count and an apply(),
//   and draw its icon in tools/pixelart/icons.py under
//   THE SAME KEY. Entries do not name an icon: the key IS the icon key, which
//   is what makes "one shape per passive item" a fact about the data rather
//   than a rule a test has to police. `npm run test:icons` fails the moment a
//   key here has no drawing. If it needs a stat that does not exist yet, add
//   the field to DEFAULT_MODS in player.js and read it wherever it applies. If
//   it needs to react to an event (a kill, a hit taken) rather than change a
//   stat, add the mod field here and the hook in main.js.
//
//   Because upgrades are granted at random, every entry must be worth getting
//   unprompted. An upgrade that is only useful alongside one specific other
//   upgrade does not belong in this pool.

// THEME COLOURS. An upgrade's colour is what it DOES, not how rare it is, so
// the totem can be read before any text is: gold means ammo, orange means rate
// of fire, cyan means armour, and the passive items each wear the colour of
// the thing they inflict - green poison, orange fire, pale blue ice. The icons
// are drawn in one neutral ramp and tinted with this colour at build time, so
// a theme change here recolours the icon along with everything else.
//
// Entries are grouped into families and shaded apart inside one, so two
// upgrades never share a colour outright: the family is what makes the palette
// learnable, the shade is what makes a particular totem recognisable from the
// far side of the arena before its icon resolves. Add a shade to a family
// rather than opening a new hue when the two would land next to each other.
export const THEME = {
  // rate of fire
  rate: 0xff9500,
  frenzy: 0xd50000,
  hair: 0xff6d00,
  // ammo and economy
  ammo: 0xffd600,
  brass: 0xffb300,
  echo: 0xffab00,
  salvo: 0xffd180,
  fabricate: 0xffe57f,
  salvage: 0xc6ff00,
  gold: 0xf9a825,
  hoard: 0xffea00,
  lodestone: 0xffc400,
  // damage
  damage: 0xff3d00,
  precision: 0xff5fd2,
  glass: 0xcfe8ff,
  blast: 0xff6f00,
  ember: 0xbf360c,
  electric: 0xffee58,
  storm: 0x9fd8ff,
  flawless: 0xeaff6b,
  streak: 0xff2e88,
  // staying alive
  vitality: 0x00e676,
  armor: 0x4ef3ff,
  shock: 0x00b0ff,
  holy: 0xfff2b0,
  ninelives: 0xea80fc,
  blood: 0xff2d6f,
  temper: 0xb2ff59,
  scar: 0xbf5f5f,
  entrench: 0x8d6e63,
  murk: 0x546e7a,
  // movement, and the one upgrade that pays for the absence of it
  mobility: 0x2979ff,
  poise: 0x7c4dff,
  leap: 0x82b1ff,
  wind: 0x26c6da,
  impact: 0x00e5c0,
  surge: 0x1de9b6,
  // the shot itself: how it travels and what it costs to fire
  pierce: 0x76ff03,
  gravity: 0x536dfe,
  rage: 0x8b0000,
  burden: 0xff8a80,
  hex: 0x6a1b9a,
  feed: 0xffab40,
  evade: 0x18ffff,
  shrapnel: 0xff7043,
  charge: 0xe0e0e0,
  // status effects, matched to STATUS_TINT in enemies/shared.js
  poison: 0x39d353,
  fire: 0xff5a00,
  ice: 0x7fe3ff,
  fear: 0x9d4edd,
  stone: 0x9aa5b1,
  // The eleven that came in from the old max-health row. They kept the colours
  // they were drawn in, because those already followed the rule above -
  // Antidote is green because it is about poison, Absolute Zero pale blue
  // because it is about ice - and they are folded into the families here
  // rather than left in a map of their own now that there is no second row to
  // shade them apart from. Two of them DID move: hellfire and gamble were
  // drawn in the exact values `damage` and `shrapnel` already hold, which the
  // rule above forbids.
  carnage: 0xff1744,
  pact: 0xb71c1c,
  hellfire: 0xdd2c00,
  affliction: 0x7b1fa2,
  zero: 0x4fc3f7,
  overload: 0xffca28,
  executioner: 0x880e4f,
  antidote: 0x66bb6a,
  gamble: 0xff5252,
  thorns: 0xd84315,
  power: 0xe53935,

  // ---- THE CRITICAL-HIT FAMILY -------------------------------------------
  //
  // Six passive items now touch the crit, and they are ONE family wearing one
  // hue shaded five ways, for exactly the reason the note at the top of this
  // block gives: a player who has learnt that magenta means "the shot itself
  // hit harder" can read a totem across the arena before its icon resolves,
  // and can tell WHICH of the six it is once it does. Kept clear of
  // `precision` (Twenty/Twenty) and `streak` (Hot Streak), which were already
  // living in this corner of the wheel.
  deadeye: 0xff80ab,      // the plain chance
  marksman: 0xf50057,     // the bigger plain chance
  assassin: 0x9c27b0,     // the first hit on a body
  deadcenter: 0xad1457,   // harder crits, half as many
  telltale: 0xe91e63,     // every third hit on a body

  // ---- RANGE ---------------------------------------------------------------
  //
  // Two picks that read the same number - how far away the thing you shot is -
  // and disagree about which end of it pays. They are deliberately NOT
  // shaded apart in one family: they are opposites, so they get opposite
  // temperatures, cold for the far shot and hot for the near one.
  distance: 0x0288d1,
  muzzle: 0xf4511e,

  // The rest of the new pool, each into the family it belongs to.
  tithe: 0xc79a3a,        // Blood Money: the economy family, gone dark
  charm: 0x7cb342,        // Rabbit's Foot
  hunker: 0xa1887f,       // Crouchfire, a shade off Dig In's brown
  cell: 0xb0bec5,         // Twin Cell, beside `charge`'s neutral grey
  bloodsport: 0xc62828,   // Bloodsport
  warchest: 0xf57f17,     // War Chest
  magpie: 0x78909c,       // the bird
  adrenaline: 0xe64a19,   // the ramp a hit pays for
  lamprey: 0x00897b,      // the leech

  // ---- THE NINE THAT CAME IN WITH THE POSTURES ----------------------------
  //
  // Each into the family it belongs to, on the rule at the top of this block:
  // the colour is what the pick DOES, and a pick that changes what a familiar
  // number does gets a shade of that family rather than a hue of its own.
  reserve: 0xd81b60,      // Fatal Reserve: the crit family, at the magazine's end
  primed: 0xff8f00,       // Primed Mag: ammunition, thrown
  bailiff: 0x90a4ae,      // Bailiff: beside `charge` and `cell`, the item greys
  pace: 0x448aff,         // Pace Car: the movement blues
  ceramic: 0x80deea,      // Ceramic Insert: a pale shade of `armor`
  overdraw: 0x69f0ae,     // Overdraw: vitality, spilling over
  ballast: 0x6d4c41,      // Lead Balloon: heavier than `entrench`'s brown
  cheekweld: 0x00acc1,    // Cheekweld: armour, but only down the sights
  groundhog: 0x795548,    // Groundhog: the brown Dig In and Crouchfire share

  // The two new active items, into the families their payloads belong to.
  lockpick: 0xb388ff,     // LOCKPICK: the mystery box's own violet
  payToWin: 0xffd54f,     // PAY TO WIN: money, which is what it spends

  // ---- THE FORTY-ONE THAT CAME IN WITH THE SECOND POOL --------------------
  //
  // Same rule as everything above: the colour is what the pick DOES, and a
  // pick that changes what a familiar number does gets a shade of that
  // family rather than a hue of its own. Six of them landed in the rate-of-
  // fire oranges, five in the crit magentas, seven in the vitality greens and
  // reds, and the rest beside whichever family already owned the number they
  // move.
  //
  // rate of fire
  machineSpirit: 0xffa000,   // the trigger that learns to be held
  overwound: 0xe65100,       // rate bought with the reload
  hipshot: 0xffb74d,         // rate bought with the sights
  metronome: 0xff6e40,       // rate handed over to the music
  echoChamber: 0xffcc80,     // every fourth round, twice
  // damage
  cannonade: 0xff3d3d,       // the first round out of a fresh magazine
  heavyHand: 0xa93226,       // damage bought with rate
  weakPoint: 0xff4fa3,       // the crit family: a place on a body
  overkill: 0xff7a45,        // damage that does not stop at the corpse
  bloodOath: 0x9b1b30,       // damage bought with the bar itself
  sharedPain: 0x7e57c2,      // one blow, split every way
  grayMatter: 0x9e9e9e,      // a little of everything, and no colour at all
  sacrifice: 0x6d1b7b,       // a little of everything, and one pick gone
  bottomFeeder: 0xc0ca33,    // damage off an empty magazine
  // ammo and economy
  payday: 0xffca00,          // money per body
  ammoSurplus: 0xd4af37,     // fuller pickups
  highStakes: 0xff1493,      // the shop, gambled with
  bruiseRounds: 0xff8a65,    // a magazine filled by being hit
  chainFeed: 0xffa726,       // the kill that seats the next magazine
  beltFedDream: 0xbf8f30,    // no magazine at all
  cashCannon: 0xffe082,      // rounds bought at ten dollars each
  lastBreath: 0xfdd835,      // the reserve, refilled at the edge
  autoLoot: 0xb59a3f,        // the floor, permanently coming to you
  criticalOverflow: 0xd81b8f, // crits that pay for themselves
  // staying alive
  ironLung: 0x26a69a,        // nothing sticks
  lifeline: 0x00c853,        // the floor of the bar, held
  boneMarrow: 0x8bc34a,      // a bigger bar, filled slower
  healthyCore: 0x1b998b,     // the only heal there is
  emergencyRations: 0x74d17a, // every wave opens at fifty
  finalDose: 0x4db6ac,       // the last round in the magazine, cashed
  aimOrBleed: 0xef5350,      // the miss costs blood
  killStreak: 0xaed581,      // twenty clean
  vitalTrigger: 0x64ffda,    // the item heals as it fires
  tireless: 0x40c4ff,        // the bar that never empties
  // what a shot does when it lands
  panicTurret: 0xffa733,     // a gun that answers for you
  delayedFuse: 0xff7519,     // the shot that waits two seconds
  fearAura: 0xba68c8,        // the room backs away
  statusConduit: 0x7cb9e8,   // what is on you is on them
  // the crit family
  trueStrike: 0xf06292,      // the shot taken after a pause
  domino: 0xc2185b,          // one crit leaning on the next
  luckyStreak: 0xff5c8a,     // one body, hit and hit and hit
  // ---- THE TWENTY-SEVEN THAT CAME IN WITH THE THIRD POOL -------------------
  //
  // Same rule as every block above: the colour is what the pick DOES. Ten of
  // them landed in families that already existed (the crit magentas, the
  // vitality greens, the economy golds); the rest sit beside whichever number
  // they move.
  //
  // the gun, and when it is faster
  crowbar: 0x9e7b4f,         // the swing, worth four of itself
  harmWands: 0xff8f6b,       // the bottom of the magazine, faster
  tightrope: 0xffab91,       // rate bought with height
  runningOnFumes: 0xd84b20,  // everything, on an empty bar
  // the crit family
  ironLiturgy: 0xd16ba5,     // crit chance bought with the sights
  pityParty: 0xff4081,       // the crit a drought owes you
  redHarvest: 0xe0245e,      // the crit that pays in blood
  // damage, and what it is measured against
  feverDream: 0x64dd17,      // your own poison, turned outward
  longHaul: 0xb03a2e,        // the fight that has gone on too long
  secondaryInfection: 0x2e9e4f, // poison, three deep
  underfed: 0x7a8b6f,        // thinner enemies
  // staying alive
  coldBlood: 0x5c8dc7,       // armour at the bottom of the bar
  freshBandages: 0xa5d6a7,   // the reload that also dresses a wound
  curtainCall: 0xff6f91,     // the last body, always generous
  slowRelease: 0x66d9a6,     // a crate taken slowly
  strayMercy: 0xad3c5e,      // the shot that helps
  gristle: 0xd7a3a3,         // a bar that grows off the floor
  // money, and what it buys that is not in the shop
  highInterest: 0xe0b040,    // credits that earn
  paperTrail: 0xcdb79e,      // every dollar ever spent
  moneyBelt: 0x8d9b6a,       // the wallet as armour
  fireSale: 0xff9e40,        // twice as much, half as long
  movingDay: 0xc9a227,       // the floor, cashed in as rounds
  raffleTicket: 0xc5a3ff,    // the box's own violet, banked
  // movement, and what a jump is worth
  updraft: 0x64c8e8,         // the jump that does not end
  jackpot: 0xffef62,         // one hop in a hundred
  scorchedEarth: 0xe25822,   // the slide that leaves a line
  // what happens around you
  quorum: 0xf9b233,          // ten bodies, one gun
};


// `effects` is the totem's whole readout: two or three lines, each a short
// phrase and a sign. The sign is about GOOD vs BAD, not about the arithmetic -
// "-30% RELOAD TIME" is a benefit and so scores +1 and renders green.
//
//    1  benefit   (green)
//   -1  drawback  (red)
//    0  neutral qualifier, drawn dim
//
// Keep each line under about 24 characters. It is read at a glance, mid-run,
// from across the arena - a sentence is already too long.
//
// A stacking upgrade writes `effects` as a function of the stack count the
// player already owns instead of a fixed array, so the line can name the tier
// they are on and the one the pick moves them to. See step() below.
const GOOD = 1;
const BAD = -1;
const NOTE = 0;

// TIERED READOUTS. A stacking upgrade's totem shows what THIS pick changes,
// not the whole ladder: the value the player is on now, an arrow, and the
// value they will be on if they take it. The first pick has no "now", so it
// shows the result on its own.
//
// The ladder printed out in full (`50% / 75% / 100%`) made the player work out
// which rung they were on before they could tell what a pick was worth, and it
// went stale the moment an apply() changed. `fmt` is called with a stack count
// and returns that tier's value, so the arithmetic sits next to the apply() it
// mirrors and reads the same numbers.
function step(owned, fmt) {
  return owned > 0 ? fmt(owned) + ' \u2192 ' + fmt(owned + 1) : fmt(owned + 1);
}
// The two shapes every multiplier in the pool takes: `1 + p * n` per stack,
// and `r ^ n` for one that shrinks.
const pctUp = (p) => (k) => '+' + Math.round(p * k) + '%';
const pctDown = (r) => (k) => '-' + Math.round((1 - Math.pow(r, k)) * 100) + '%';
const secs = (v) => (Math.round(v * 10) / 10) + 's';

/**
 * The effect lines to draw for a player who owns `owned` stacks of `def`. A
 * static array is used as-is - that is every max-1 passive item, which has no
 * tiers to compare. A function is a tiered readout; see step().
 */
export function effectLines(def, owned = 0) {
  return typeof def.effects === 'function' ? def.effects(owned) : def.effects;
}

export const UPGRADES = {
  overclock: {
    name: 'OVERCLOCK',
    max: 5,
    theme: THEME.rate,
    effects: (n) => [['FIRE RATE ' + step(n, pctUp(20)), GOOD]],
    apply: (mods, n) => { mods.fireRate *= 1 + 0.2 * n; },
  },
  extendedMag: {
    name: 'EXTENDED MAG',
    max: 3,
    theme: THEME.ammo,
    effects: (n) => [['MAGAZINE ' + step(n, pctUp(50)), GOOD]],
    apply: (mods, n) => { mods.magMult *= 1 + 0.5 * n; },
  },
  speedLoader: {
    name: 'SPEED LOADER',
    max: 3,
    theme: THEME.brass,
    effects: (n) => [['RELOAD ' + step(n, pctDown(0.7)), GOOD]],
    apply: (mods, n) => { mods.reloadMult *= Math.pow(0.7, n); },
  },
  hollowPoint: {
    name: 'HOLLOW POINT',
    max: 3,
    theme: THEME.damage,
    effects: (n) => [
      ['DAMAGE ' + step(n, pctUp(30)), GOOD],
      ['MAGAZINE ' + step(n, pctDown(0.75)), BAD],
    ],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.3 * n;
      mods.magMult *= Math.pow(0.75, n);
    },
  },
  nanoweave: {
    name: 'NANOWEAVE',
    max: 2,
    theme: THEME.vitality,
    // THE ONLY SOURCE OF REGENERATION IN THE GAME besides Antidote's leech -
    // there is no natural trickle underneath it any more (see Player's mods
    // block), so this is a real pick rather than a bigger version of something
    // every run already had. Priced accordingly: 2 HP/s is slow enough that it
    // never wins a fight on its own, and the 5s window means it only pays a
    // player who actually broke contact. It does not tick in the wave break.
    effects: (n) => [
      ['REGEN ' + step(n, (k) => 2 * k + ' HP/s'), GOOD],
      ['STARTS AFTER ' + step(n, (k) => secs(Math.max(4, 6 - k))), GOOD],
      ['IN COMBAT ONLY', NOTE],
    ],
    apply: (mods, n) => {
      mods.regenDelay = Math.max(4, 6 - n);
      mods.regenRate = 2 * n;
    },
  },
  bulwark: {
    name: 'BULWARK',
    max: 3,
    theme: THEME.armor,
    effects: (n) => [
      ['MAX HEALTH ' + step(n, (k) => '+' + 50 * k), GOOD],
      ['MOVE SPEED ' + step(n, pctDown(0.88)), BAD],
    ],
    apply: (mods, n) => {
      mods.maxHpBonus += 50 * n;
      mods.moveMult *= Math.pow(0.88, n);
    },
  },
  scavenger: {
    name: 'SCAVENGER',
    max: 3,
    theme: THEME.salvage,
    effects: (n) => [
      ['AMMO / KILL ' + step(n, (k) => '+' + 2 * k), GOOD],
      ['KILLS REFILL RESERVE', NOTE],
    ],
    apply: (mods, n) => {
      mods.ammoOnKill += 2 * n;
    },
  },
  // MONEY IS ON THE FLOOR NOW, so how far you have to walk to get it is a stat,
  // and this is the upgrade that buys it. Three tiers because the interesting
  // part is the SHAPE of the growth: at one tier the orbs near your feet come
  // to you, at three the whole patch of floor a fight happened on empties as
  // you cross it, and the difference between those is a different way of
  // moving through a wave rather than a bigger number.
  //
  // It pulls ammo and health as well, at MAGNET_PICKUP_FRACTION of the radius
  // (see main.js). Money alone would have made it an economy pick competing
  // with Midas and Scavenger; pulling everything makes it a pick about not
  // having to break off a fight to collect things, which nothing else in the
  // pool does.
  lodestone: {
    name: 'LODESTONE',
    max: 3,
    theme: THEME.lodestone,
    effects: (n) => [
      ['PICKUP RANGE ' + step(n, pctUp(50)), GOOD],
      ['MONEY COMES TO YOU', NOTE],
    ],
    // +50% a tier and not more, because the radius it multiplies is already
    // five metres: at the tier the arena is 44 across, and a passive item that
    // empties half the room from a standstill stops being a way of moving and
    // starts being a way of not having to.
    apply: (mods, n) => {
      mods.magnetMult = 1 + 0.5 * n;
    },
  },
  combatStims: {
    name: 'COMBAT STIMS',
    max: 2,
    theme: THEME.mobility,
    effects: (n) => [['MOVE SPEED ' + step(n, pctUp(30)), GOOD]],
    apply: (mods, n) => { mods.moveMult *= 1 + 0.30 * n; },
  },
  vampiric: {
    name: 'VAMPIRIC ROUNDS',
    max: 3,
    theme: THEME.blood,
    effects: (n) => [
      ['HEAL 1 HP ON KILL', GOOD],
      ['CHANCE ' + step(n, (k) => 25 * (k + 1) + '%'), NOTE],
    ],
    // Chance per kill, one stack at a time: 50%, then 75%, then every kill.
    apply: (mods, n) => { mods.killHealChance = 0.25 * (n + 1); },
  },
  reactivePlating: {
    name: 'REACTIVE PLATING',
    max: 3,
    theme: THEME.shock,
    effects: (n) => [
      ['SHOCKWAVE WHEN HIT', GOOD],
      ['DAMAGE ' + step(n, (k) => String(45 * k)), NOTE],
      ['RADIUS ' + step(n, (k) => 5 + k + 'm'), NOTE],
    ],
    apply: (mods, n) => {
      mods.shockwave += 45 * n;
      mods.shockwaveRadius = 5 + n;
    },
  },
  ammoFab: {
    name: 'AMMO FABRICATOR',
    max: 3,
    theme: THEME.fabricate,
    // Combat only, like Nanoweave: the wave break has no clock on it, and a
    // trickle that ran there was an infinite ammo box you reached by waiting.
    effects: (n) => [
      ['AMMO / SEC ' + step(n, (k) => '+' + 2.5 * k), GOOD],
      ['IN COMBAT ONLY', NOTE],
    ],
    apply: (mods, n) => { mods.ammoRegen += 2.5 * n; },
  },
  steadyAim: {
    name: 'STEADY AIM',
    max: 2,
    theme: THEME.poise,
    effects: (n) => [
      ['DAMAGE ' + step(n, pctUp(40)), GOOD],
      ['WHILE STANDING STILL', NOTE],
    ],
    apply: (mods, n) => { mods.steady += 0.4 * n; },
  },
  // A REFUND, NOT INCOME. Scavenger and Ammo Fabricator both make rounds out
  // of nothing; this one only ever gives back what a shot that CONNECTED cost,
  // so it pays accuracy rather than time spent holding the trigger. Rolled
  // once per shot and refunding the whole shotCost, so a Triple Tap build gets
  // three rounds back on the shots it wins - the refund is worth exactly what
  // the trigger pull was.
  brassEcho: {
    name: 'BRASS ECHO',
    max: 3,
    theme: THEME.echo,
    effects: (n) => [
      ['HITS ' + step(n, pctUp(5)) + ' TO REFUND', GOOD],
      ['THE ROUND TO RESERVE', NOTE],
    ],
    apply: (mods, n) => { mods.ammoRefund = 0.05 * n; },
  },
  // RATE IS BOUGHT WITH HANDLING, and it has to be bought at a price the
  // player can feel or the card is a free upgrade with a warning label on it.
  // It was: +70% recoil on a weapon whose kick decays inside a third of a
  // second read as almost nothing, and a passive item whose downside nobody
  // can name is not a trade.
  //
  // So it charges twice, in the two currencies a gun has. RECOIL walks the
  // muzzle up the wall and the player answers it with the stick. BLOOM opens
  // the cone and the player can only answer it by letting go - which is the
  // exact thing a doubled fire rate is tempting them not to do. That is the
  // whole design of the card: it makes holding the trigger better AND it makes
  // holding the trigger worse, and the player decides where the line is.
  //
  // Two tiers only, still: at three the gun climbs faster than a person can
  // answer, and now sprays wider than the room.
  hairTrigger: {
    name: 'HAIR TRIGGER',
    max: 2,
    theme: THEME.hair,
    effects: (n) => [
      ['FIRE RATE ' + step(n, pctUp(25)), GOOD],
      ['RECOIL ' + step(n, pctUp(160)), BAD],
      ['SPREAD ' + step(n, pctUp(90)), BAD],
    ],
    apply: (mods, n) => {
      mods.fireRate *= 1 + 0.25 * n;
      mods.recoilMult *= 1 + 1.6 * n;
      // The sustained-fire cone, which is where most of the accuracy cost
      // lands: this build's whole appeal is a held trigger, so the penalty
      // that scales with rounds held is the one that meets it.
      mods.bloomMult *= 1 + 0.9 * n;
      // Plus a flat widening the player can see the moment they take the card,
      // before they have fired a shot. A downside that only shows up eight
      // rounds into a magazine is one that gets picked by accident.
      mods.spreadAdd += 0.016 * n;
    },
  },
  // THE BAR DOES NOT GET LONGER. Stamina is a rhythm - sprint, break, sprint -
  // and a longer bar changes how long one sprint is rather than how often the
  // rhythm comes round. Halving the drain and doubling the regen is the same
  // budget spent on the part the player actually feels: it is the WAIT that a
  // sprint build is paying, not the run.
  secondWind: {
    name: 'SECOND WIND',
    max: 1,
    theme: THEME.wind,
    effects: [['SPRINT TWICE AS LONG', GOOD], ['STAMINA BACK 2x FAST', GOOD]],
    apply: (mods, n) => {
      mods.staminaDrain *= Math.pow(0.5, n);
      mods.staminaRegen *= 1 + n;
    },
  },
  // ---- PASSIVE ITEMS -------------------------------------------------------
  // Single-tier picks: max 1, no levels, one distinct behaviour each. Where
  // every upgrade above answers "how much", these answer "what happens" - the
  // player should be able to name what a passive item does from watching one
  // shot land, without reading the totem twice.
  //
  // The ones that afflict an enemy all have to SAY SO ON THE ENEMY. A status
  // the player cannot see is a stat increase with extra steps, so each drives
  // a body tint and a particle drip (see STATUS_TINT in enemies/shared.js) and the
  // colours are held distinct from each other and from the hit flash.
  venom: {
    name: 'VENOM ROUNDS',
    max: 1,
    theme: THEME.poison,
    // THE POISON IS AS STRONG AS THE GUN, and it ticks on the beat - once a
    // beat, where fire ticks twice. See Player.dotHit and Enemy._tickStatus.
    // No number in the text on purpose: the tick is one of the player's own
    // shots, which is a moving figure, and printing whatever it happens to be
    // on wave 1 would be a lie for the rest of the run.
    effects: [['YOUR SHOTS APPLY POISON', GOOD], ['FOR 4s', NOTE]],
    apply: (mods, n) => {
      mods.poisonPower = 1 * n;
      mods.poisonTime = 4 * n;
    },
  },
  incendiary: {
    name: 'INCENDIARY',
    max: 1,
    theme: THEME.fire,
    // Twice a beat where poison is once: fire is the fierce, short one and
    // poison the patient one, and on the beat that difference is audible.
    effects: [['YOUR SHOTS SET FIRE', GOOD], ['FOR 3s', NOTE], ['SPREADS ON DEATH', NOTE]],
    apply: (mods, n) => {
      mods.burnPower = 1 * n;
      mods.burnTime = 3 * n;
      mods.burnSpread = 3 * n;
    },
  },
  cryo: {
    name: 'CRYO ROUNDS',
    max: 1,
    theme: THEME.ice,
    effects: [['HITS SLOW BY HALF', GOOD], ['THEIR SHOTS TOO, 3s', NOTE]],
    apply: (mods, n) => { mods.slowTime = 3 * n; },
  },
  terror: {
    name: 'TERROR',
    max: 1,
    theme: THEME.fear,
    effects: [['HIT ENEMIES FLEE', GOOD], ['2s, CANNOT ATTACK', NOTE]],
    apply: (mods, n) => { mods.fearTime = 2 * n; },
  },
  petrify: {
    name: 'PETRIFY',
    max: 1,
    theme: THEME.stone,
    effects: [['12% TO FREEZE 1.5s', GOOD], ['FROZEN TAKE +50%', GOOD]],
    apply: (mods, n) => {
      mods.petrifyChance = 0.12 * n;
      mods.petrifyTime = 1.5 * n;
    },
  },
  arcRounds: {
    name: 'ARC ROUNDS',
    max: 1,
    theme: THEME.electric,
    effects: [['CHAINS TO 1 ENEMY', GOOD], ['CHAIN HITS FOR 40%', NOTE]],
    apply: (mods, n) => {
      mods.chainDamage = 0.4 * n;
      mods.chainRange = 6;
    },
  },
  knockout: {
    name: 'KNOCKOUT DROPS',
    max: 1,
    theme: THEME.impact,
    effects: [['HITS SHOVE ENEMIES', GOOD], ['1.5 METRES BACK', NOTE]],
    apply: (mods, n) => { mods.knockback = 1.5 * n; },
  },
  midas: {
    name: 'MIDAS TOUCH',
    max: 1,
    theme: THEME.gold,
    effects: [['2x CREDITS', GOOD], ['THE HIT TURN GOLD', NOTE]],
    apply: (mods, n) => {
      mods.creditMult *= 1 + n;
      mods.midas = 1;
    },
  },
  detonator: {
    name: 'DETONATOR',
    max: 1,
    theme: THEME.blast,
    effects: [['HITS EXPLODE', GOOD], ['30 DMG IN 2.5m', NOTE], ['-25% FIRE RATE', BAD]],
    apply: (mods, n) => {
      mods.blastDamage = 30 * n;
      mods.blastRadius = 2.5;
      mods.fireRate *= Math.pow(0.75, n);
    },
  },
  blastCorpse: {
    name: 'BLAST CORPSE',
    max: 1,
    theme: THEME.ember,
    effects: [['THE DEAD EXPLODE', GOOD], ['45 DMG IN 4m', NOTE], ['IT CAN HIT YOU', BAD]],
    apply: (mods, n) => {
      mods.corpseDamage = 45 * n;
      mods.corpseRadius = 4;
    },
  },
  twentyTwenty: {
    name: 'TWENTY/TWENTY',
    max: 1,
    theme: THEME.precision,
    // The ammo line is the honest half of the deal and has to be on the card:
    // firing the pattern twice spends two rounds (see Player.shotCost), which
    // is what stops +20% net damage from being free. A 30-round magazine is a
    // 15-shot magazine with this taken, and that is the cost the player is
    // actually weighing.
    effects: [
      ['EVERY SHOT FIRES 2x', GOOD],
      ['60% DAMAGE EACH', BAD],
      ['2 AMMO PER SHOT', BAD],
    ],
    apply: (mods, n) => {
      mods.volley = 1 + n;
      mods.volleyDamage = 0.6;
    },
  },
  // THREE FREE MISTAKES A WAVE, not one. At one it was a pick that mattered for
  // the first contact of a wave and then sat dead for the ninety seconds that
  // decided the run - a passive item the player stopped owning the moment it
  // paid out. Three is a real allowance: it survives an opening the player
  // misread, and it still runs out inside a wave that is going badly, which is
  // the only reason it is worth taking rather than counting on.
  //
  // THEY DO NOT BANK. armWard SETS the count at every wave start, so a clean
  // wave hands the next one three and not six - see Player.armWard.
  holyMantle: {
    name: 'HOLY MANTLE',
    max: 1,
    theme: THEME.holy,
    effects: [['1st 3 HITS EACH WAVE', GOOD], ['DEAL NO DAMAGE', NOTE]],
    apply: (mods, n) => { mods.wardPerWave = 3 * n; },
  },
  deadCat: {
    name: 'DEAD CAT',
    max: 1,
    theme: THEME.ninelives,
    effects: [['REVIVE ONCE AT 1 HP', GOOD], ['-40% MAX HEALTH', BAD]],
    apply: (mods, n) => {
      mods.extraLives += n;
      mods.maxHpMult *= Math.pow(0.6, n);
    },
  },
  glassCannon: {
    name: 'GLASS CANNON',
    max: 1,
    theme: THEME.glass,
    effects: [['+70% DAMAGE', GOOD], ['-50% MAX HEALTH', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.7 * n;
      mods.maxHpMult *= Math.pow(0.5, n);
    },
  },
  piercingShot: {
    name: 'PIERCING SHOT',
    max: 3,
    theme: THEME.pierce,
    effects: (n) => [
      ['PIERCE ' + step(n, (k) => String(k)), GOOD],
      ['ENEMIES PER SHOT', NOTE],
      ['-30% DMG EACH ONE', BAD],
    ],
    apply: (mods, n) => {
      mods.pierce = n;
      mods.pierceFalloff = 0.7;
    },
  },
  gravityRounds: {
    name: 'GRAVITY ROUNDS',
    max: 1,
    theme: THEME.gravity,
    effects: [['HITS DRAG ENEMIES IN', GOOD], ['1.5m, WITHIN 5m', NOTE]],
    apply: (mods, n) => {
      mods.gravityPull = 1.5 * n;
      mods.gravityRadius = 5;
    },
  },
  berserker: {
    name: 'BERSERKER',
    max: 2,
    theme: THEME.rage,
    // Deliberately no numbers: the shape of the deal is the whole pick, and a
    // percentage that only pays at an HP the player is trying not to be at
    // told them less than the sentence does.
    effects: [
      ['THE LESS HP YOU HAVE', NOTE],
      ['THE MORE DAMAGE YOU DEAL', GOOD],
    ],
    apply: (mods, n) => { mods.berserk += 0.5 * n; },
  },
  tripleTap: {
    name: 'TRIPLE TAP',
    max: 1,
    theme: THEME.burden,
    effects: [['+70% DAMAGE', GOOD], ['3 AMMO PER SHOT', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.7 * n;
      mods.ammoPerShot = 1 + 2 * n;
    },
  },
  cursedAmmo: {
    name: 'CURSED AMMO',
    max: 1,
    theme: THEME.hex,
    // The floor is the whole reason this is playable: without it a held
    // trigger kills you from full health with no enemy in the room.
    effects: [['20% OF SHOTS: 2x DMG', GOOD], ['THOSE COST 1 HP', BAD], ['NEVER BELOW 1 HP', NOTE]],
    apply: (mods, n) => {
      mods.cursedChance = 0.2 * n;
      mods.cursedDamage = 1;
    },
  },
  beltFeed: {
    name: 'BELT FEED',
    max: 3,
    theme: THEME.feed,
    effects: (n) => [
      [step(n, pctUp(10)) + ' OF SHOTS', GOOD],
      ['FIRE FROM THE RESERVE', NOTE],
      ['SO YOU RELOAD LESS', GOOD],
    ],
    apply: (mods, n) => { mods.beltFeed = 0.1 * n; },
  },
  evasion: {
    name: 'EVASION',
    max: 3,
    theme: THEME.evade,
    effects: (n) => [
      ['DODGE ' + step(n, pctUp(12)), GOOD],
      ['OF HITS TAKEN', NOTE],
      ['+40% SPEED ON DODGE', GOOD],
    ],
    apply: (mods, n) => { mods.dodgeChance = 0.12 * n; },
  },
  // A MULTIPLE OF THE GUN, NOT A FLAT TWENTY-FIVE. The old number was the same
  // mistake fire and poison were built out of (see Player.dotHit): a real hit
  // on wave three and a rounding error on wave thirty, so the one passive item
  // in the pool that pays out on the reload got weaker every time the player
  // did anything else right. Charged at four times a shot it is worth what the
  // build is worth - every damage passive item feeds it - and a ring of eight
  // is thirty-two shots' worth of damage spread around the player, which is
  // what a vent that costs a reload should be.
  reloadBurst: {
    name: 'RELOAD BURST',
    max: 1,
    theme: THEME.shrapnel,
    effects: [['RELOAD THROWS 8', GOOD], ['SHARDS, 4x YOUR DAMAGE', NOTE], ['THEY CANNOT HURT YOU', NOTE]],
    apply: (mods, n) => {
      mods.reloadShards = 8 * n;
      mods.reloadShardMult = 4 * n;
    },
  },
  crystallize: {
    name: 'CRYSTALLIZE',
    max: 1,
    theme: THEME.ice,
    effects: [['FROZEN DEAD SHATTER', GOOD], ['60 DMG IN 3.5m', NOTE]],
    apply: (mods, n) => {
      mods.shatterDamage = 60 * n;
      mods.shatterRadius = 3.5;
    },
  },
  ashen: {
    name: 'ASHEN',
    max: 1,
    theme: THEME.ember,
    // A lingering ZONE, not another instant blast: Blast Corpse and
    // Crystallize already own that shape, and a cloud you have to push enemies
    // through plays differently from a puff you never see.
    // A CHANCE rather than a certainty. Once Incendiary is running, every
    // burning enemy in a wave dies burning, and a cloud per corpse buried the
    // arena in ash: the zones stopped being places the player had to steer
    // enemies into and became the floor. At 15% a cloud is an event again.
    effects: [['15% OF BURNING DEAD', NOTE], ['LEAVE BURNING ASH, 4s', GOOD], ['IN A 3.5m CLOUD', NOTE]],
    apply: (mods, n) => {
      // A cloud SETS FIRE to what stands in it rather than dealing its own
      // damage - see _updateAsh. One number, one system: every point of fire
      // damage in the game is a burn tick now.
      mods.ashPower = 1 * n;
      mods.ashRadius = 3.5;
      mods.ashTime = 4;
      mods.ashChance = 0.15;
    },
  },
  neurotoxin: {
    name: 'NEUROTOXIN',
    max: 1,
    theme: THEME.poison,
    // Slowing a poisoned enemy would have been Cryo Rounds with a different
    // name - Cryo already halves their speed and their shots. Spreading is the
    // thing only poison does.
    effects: [['POISON JUMPS ENEMY', GOOD], ['TO ENEMY, WITHIN 3m', NOTE]],
    apply: (mods, n) => { mods.poisonSpread = 3 * n; },
  },
  entropy: {
    name: 'ENTROPY',
    max: 1,
    theme: THEME.stone,
    effects: [['STATUS NEVER ENDS', GOOD], ['ON ENEMIES UNDER 30%', NOTE]],
    apply: (mods, n) => { mods.entropyBelow = 0.3 * n; },
  },
  malady: {
    name: 'MALADY',
    max: 1,
    theme: THEME.fire,
    // Poison and burn ONLY. Cryo, Terror and Petrify have no strength to
    // amplify, so the same trade on them would be a drawback with no upside.
    // The old line read "+50% POISON & BURN", which never said WHICH axis moved
    // - a player could not tell a stronger effect from a longer one. Name the
    // axis on its own line and the trade reads in one pass.
    effects: [
      ['POISON & BURN DEAL', NOTE],
      ['+50% DAMAGE PER SEC', GOOD],
      ['FOR HALF AS LONG', BAD],
    ],
    apply: (mods, n) => {
      mods.dotPower *= 1 + 0.5 * n;
      mods.dotTime *= Math.pow(0.5, n);
    },
  },
  breachRound: {
    name: 'BREACH ROUND',
    max: 1,
    theme: THEME.charge,
    // Armed by the reload rather than by a timer, so it rewards a rhythm the
    // player already has instead of asking them to stand still and not shoot.
    effects: [['1st SHOT AFTER EVERY', GOOD], ['RELOAD EXPLODES', GOOD], ['70 DMG IN 4m', NOTE]],
    apply: (mods, n) => {
      mods.chargeDamage = 70 * n;
      mods.chargeRadius = 4;
    },
  },
  seeker: {
    name: 'SEEKER',
    max: 1,
    theme: THEME.precision,
    // Rescues MISSES and nothing else. A shot already on target is never
    // touched, so this can never drag a bullet off the weak point the player
    // deliberately lined up - it only takes the shots that were going to hit
    // a wall and gives them somewhere to go.
    effects: [['MISSED SHOTS CURVE', GOOD], ['TO A TARGET IN 6 deg', NOTE], ['HITS ARE NEVER MOVED', NOTE]],
    apply: (mods, n) => {
      // HALVED from 12 degrees. At 12 the cone was wide enough that aiming
      // roughly at a crowd hit something every time, which is the whole gun
      // rather than a rescue for the shots that deserved one. Halving the
      // half-angle takes roughly three quarters of the solid angle with it, so
      // this is a real cut and not a trim - a miss now has to be close to a
      // hit before the curve will pick it up.
      mods.homingAngle = 0.105 * n;
      mods.homingRange = 30;
    },
  },
  lightningWizard: {
    name: 'LIGHTNING WIZARD',
    max: 1,
    theme: THEME.storm,
    // Rare per shot and heavy when it lands, which is the opposite trade to
    // Arc Rounds: that one is a small certainty on every hit, this is a large
    // uncertainty. At 5% a magazine usually contains one, so it reads as
    // punctuation rather than as a damage number the player has to plan on.
    effects: [['5% OF HITS CALL', GOOD], ['LIGHTNING: 90 DMG', NOTE], ['+50 AROUND IT', NOTE]],
    apply: (mods, n) => {
      mods.lightningChance = 0.05 * n;
      mods.lightningDamage = 90 * n;
      mods.lightningSplash = 50 * n;
      mods.lightningRadius = 4;
    },
  },
  noHitBonus: {
    name: 'NO-HIT BONUS',
    max: 1,
    theme: THEME.flawless,
    // The only PERMANENT growth in the pool, and the only reward for a skill
    // the game already measured and only ever paid in credits. It stacks for
    // the rest of the run, so a player who keeps clearing waves clean is
    // building - and a single hit anywhere in a wave costs them that wave's
    // stack, which is what makes it worth playing around.
    //
    // Capped, and additively rather than compounding. Uncapped compounding was
    // the one line in the pool with no ceiling: a player who was already good
    // enough not to be touched kept multiplying, so by wave 30 it was worth
    // more than the rest of the build put together. Five clean waves for a
    // flat +40% is still the best rare in the pool and is now a target the
    // player can actually finish.
    effects: [['CLEAR A WAVE UNHURT:', NOTE], ['+8% DAMAGE & RATE', GOOD], ['STACKS TO +40%', NOTE]],
    apply: (mods, n) => { mods.noHitBonus = 0.08 * n; },
  },
  ammoHoarder: {
    name: 'AMMO HOARDER',
    max: 1,
    theme: THEME.hoard,
    // It is the only upgrade that touches reserve CAPACITY rather than
    // reserve income, which is what makes it worth a slot
    // next to Scavenger and Ammo Fabricator instead of competing with them.
    effects: [['2x MAX AMMO RESERVE', GOOD], ['300 \u2192 600 ROUNDS', NOTE]],
    apply: (mods, n) => { mods.reserveMult = 1 + n; },
  },
  hotStreak: {
    name: 'HOT STREAK',
    max: 1,
    theme: THEME.streak,
    // The floor is REAL: miss enough and this deals less than no upgrade at
    // all. That is the whole pick - every other damage upgrade in the pool is
    // free once taken, and this one asks to be earned again every magazine.
    // It rides the same per-shot hit flag the hitmarker does, so the number
    // can never disagree with what the player just saw.
    effects: [['+1% DMG PER HIT', GOOD], ['-1% PER MISS', BAD], ['+30% CAP, -10% FLOOR', NOTE]],
    apply: (mods, n) => {
      mods.streakStep = 0.01 * n;
      mods.streakCap = 0.3;
      mods.streakFloor = 0.1;
    },
  },
  doubleJump: {
    name: 'DOUBLE JUMP',
    max: 1,
    theme: THEME.leap,
    // The air jump is deliberately STRONGER than the ground one (11 vs 9
    // against gravity 22): a second hop that only matched the first would clear
    // nothing the first had not already cleared. At 11 off the apex the player
    // tops out near 4.6m, which is over every enemy in the pool and onto the
    // high platforms.
    effects: [['JUMP AGAIN IN MIDAIR', GOOD], ['CLEARS ~4.5m TOTAL', NOTE]],
    apply: (mods, n) => { mods.extraJumps = n; },
  },

  // PERMANENT MAX HP, on the same flawless flag No-Hit Bonus reads. The two
  // are deliberately different rewards for one piece of play: that one makes
  // the gun better and can be lost by a single hit, this one banks something
  // no later wave can take back. Capped so a long clean run cannot simply
  // outgrow the arena - twenty flawless waves is the target.
  untouched: {
    name: 'UNTOUCHED',
    max: 1,
    theme: THEME.temper,
    effects: [['CLEAR A WAVE UNHURT:', NOTE], ['+3 MAX HP, KEPT', GOOD], ['UP TO +60', NOTE]],
    apply: (mods, n) => {
      mods.hpPerCleanWave = 3 * n;
      mods.hpBankCap = Math.max(mods.hpBankCap, 60 * n);
    },
  },
  // The unconditional twin of UNTOUCHED, and the trade is the whole point: it
  // asks nothing of how you play and charges a quarter more damage from every
  // source for the rest of the run. It grows fastest exactly when it is worst
  // to own - a long run - which is what keeps it a cursed pick rather than a
  // slow common.
  scarTissue: {
    name: 'SCAR TISSUE',
    max: 1,
    theme: THEME.scar,
    // FIVE A WAVE, NOT TWO. Two was under the noise floor of a health bar that
    // scales with the wave: a player who took this on wave five and looked at
    // their bar on wave fifteen had earned twenty points, which is less than
    // one late hit, while the +25% taken had been charged on every hit in
    // between. The drawback was the only half of the trade anyone could feel.
    // THE CAP IS UNCHANGED at +80, so what changes is how fast it arrives - it
    // is paid off in sixteen waves instead of forty, and a long run still ends
    // holding the same ceiling with the same permanent 25% on top of it.
    effects: [['+5 MAX HP EVERY WAVE', GOOD], ['UP TO +80', NOTE], ['TAKE +25% DAMAGE', BAD]],
    apply: (mods, n) => {
      mods.hpPerWave = 5 * n;
      mods.hpBankCap = Math.max(mods.hpBankCap, 80 * n);
      mods.damageTakenMult *= 1 + 0.25 * n;
    },
  },
  // HEALTH BOUGHT WITH SIGHT. Bulwark sells max HP for speed; this sells it
  // for the range at which the room can be read at all, which is a much
  // stranger thing to own - the haze sits far thicker than a boss wave's, so
  // enemy colour arrives late and a shot across the arena is taken on a shape.
  // Driven through rig.js, which owns the fog and breathes it with the music,
  // so this is one multiplier on the target rather than a second writer.
  //
  // TWENTY-FIVE HEALTH, NOT FIFTY-FIVE. At fifty-five this was the biggest
  // single block of health in the pool and the haze was something a player
  // simply learned to play through inside one wave - a drawback you adapt to
  // is a drawback you stop paying, and the health never stopped paying. A
  // quarter of a starting bar is still worth taking and no longer worth taking
  // blind.
  //
  // 3.2x, NOT 1.9x. At 1.9 the far wall was slightly greyer and the health
  // was free: the fog is exponential-squared (FogExp2), so at the base
  // 0.013 the haze does not start EATING anything until well past the far side
  // of a 43m room, and doubling a number that small doubles nothing the player
  // can see. The curve has to be moved to where the fight actually happens.
  // At 0.042 an enemy at twenty metres - across the arena, the range a shot is
  // taken at - is half washed out, and one at thirty is most of the way gone,
  // so colour arrives late and the far half of the room is a set of shapes.
  // That is the drawback the card has always claimed and never charged.
  blackout: {
    name: 'BLACKOUT',
    max: 1,
    theme: THEME.murk,
    effects: [['+25 MAX HEALTH', GOOD], ['THE HAZE CLOSES RIGHT IN', BAD], ['YOU SEE VERY LITTLE', BAD]],
    apply: (mods, n) => {
      mods.maxHpBonus += 25 * n;
      mods.fogMult *= 1 + 2.2 * n;
    },
  },
  // TEN SECONDS OFF THE TOP OF EVERY WAVE with no magazine to think about -
  // no rounds spent, no reload, nothing to count. It pays the opening, which
  // is the part of a wave the player has the most control over, and the -5%
  // is charged for the whole rest of it.
  //
  // It says so on the HUD. A window that is silently open and silently shut
  // is a stat the player can only infer from an ammo counter that stopped
  // moving, so it wears a chip with a timer like every other window in the
  // game - see setBuffs in ui.js.
  openingSalvo: {
    name: 'OPENING SALVO',
    max: 1,
    theme: THEME.salvo,
    effects: [['FIRST 10s OF A WAVE:', NOTE], ['SHOTS COST NO AMMO', GOOD], ['-5% DAMAGE', BAD]],
    apply: (mods, n) => {
      mods.salvoTime = 10 * n;
      mods.damage *= Math.pow(0.95, n);
    },
  },
  // Nanoweave's opposite number: that one asks you to break contact and this
  // one asks you to plant. They are not the same pick - a player who owns both
  // still has to choose which one they are playing for in a given fight, and
  // standing still in a room full of enemies is the harder half of that.
  //
  // COMBAT ONLY, for the reason every regeneration in the pool is: the wave
  // break has no clock on it, and a heal that ticked there would be a full
  // health bar you reached by standing in the shop.
  digIn: {
    name: 'DIG IN',
    max: 1,
    theme: THEME.entrench,
    effects: [['STAND STILL 3s:', NOTE], ['REGEN 3 HP/s', GOOD], ['ANY HIT RESETS IT', BAD]],
    apply: (mods, n) => {
      mods.plantRegen = 3 * n;
      mods.plantDelay = 3;
    },
  },
  // ---- THE ELEVEN CONVERTED PICKS -----------------------------------------
  //
  // These eleven were sold, not given: a second row at the wave break charged
  // MAX HEALTH for them, permanently. That row is gone (it sells active items
  // now - see js/items.js), and they are ordinary passive items, rolled onto
  // free totems like everything above.
  //
  // WHAT CHANGED WHEN THE PRICE DID. A paid pick did not need a drawback,
  // because the price WAS the drawback and it was the same price for every
  // build. Free, each one has to weigh itself, which is why the ones that did
  // not already carry a real cost were given one. Only EXECUTIONER still
  // charges health, and it charges it as a mod rather than as a payment: see
  // mods.maxHpFlat.

  carnage: {
    name: 'CARNAGE',
    max: 1,
    theme: THEME.carnage,
    // A CAP, and a smaller step under it. Uncapped at 5% a kill it was the
    // best damage in the game after twenty kills and absurd after fifty. At 1%
    // to a ceiling of +100% the hundred-kill chain is the target rather than
    // the accident, and what it costs you is that any hit at all takes it all
    // back - which is the whole drawback now that no health is charged for it.
    effects: [['KILLS: +1% DAMAGE', GOOD], ['UP TO +100%', NOTE], ['RESET WHEN HURT', BAD]],
    apply: (mods, n) => {
      mods.carnageStep = 0.01 * n;
      mods.carnageMax = 1.0 * n;
    },
  },
  bloodPact: {
    name: 'BLOOD PACT',
    max: 1,
    theme: THEME.pact,
    effects: [['KILLS HEAL 3 HP', GOOD], ['TAKE +25% DAMAGE', BAD]],
    apply: (mods, n) => {
      mods.killHeal = 3 * n;
      mods.damageTakenMult *= 1 + 0.25 * n;
    },
  },
  hellfire: {
    name: 'HELLFIRE',
    max: 1,
    theme: THEME.hellfire,
    // Armed by the reload, the same signal Reload Burst and Breach Round ride,
    // so it pays a rhythm the player already has instead of asking for a new one.
    effects: [['RELOAD LEAVES A', NOTE], ['FIRE TRAIL FOR 3s', GOOD], ['IT BURNS WHAT WALKS IN', NOTE]],
    apply: (mods, n) => {
      // Sets fire, like every other fire in the game - see _updateFire.
      mods.hellfirePower = 1.5 * n;
      mods.hellfireTime = 3;
      mods.hellfireRadius = 1.8;
    },
  },
  eternalAffliction: {
    name: 'ETERNAL AFFLICTION',
    max: 1,
    theme: THEME.affliction,
    // The drafted drawback was "status effects on you last twice as long", and
    // the player has no status effects - only hazard zones to stand out of. So
    // the cost lands on those instead, which is the same idea in the vocabulary
    // the game actually has.
    effects: [['ENEMY STATUS NEVER', NOTE], ['EXPIRES', GOOD], ['POOLS & LAVA HURT 2x', BAD]],
    apply: (mods, n) => {
      mods.statusEternal = n;
      mods.hazardMult *= 2;
    },
  },
  absoluteZero: {
    name: 'ABSOLUTE ZERO',
    max: 1,
    theme: THEME.zero,
    // 30% off everything hostile - bodies and their shots alike - against half
    // a second rooted every time one connects. The freeze is short on purpose:
    // it is the one drawback in the pool that takes the controls away, and a
    // full second of that at close range was a death sentence rather than a
    // price.
    effects: [['ENEMIES & SHOTS', NOTE], ['MOVE 30% SLOWER', GOOD], ['HITS FREEZE YOU 0.5s', BAD]],
    apply: (mods, n) => {
      mods.worldSlow = Math.pow(0.7, n);
      mods.hitFreeze = 0.5;
    },
  },
  overload: {
    name: 'OVERLOAD',
    max: 1,
    theme: THEME.overload,
    // A fraction of MAX HP rather than a flat number, so it stays worth firing
    // the magazine dry on wave 40 as much as on wave 4. It is the one thing in
    // the pool that scales with the enemy instead of with the build - and the
    // health it charges per use is why it needs no drawback beyond itself.
    effects: [['EMPTY THE MAGAZINE:', NOTE], ['LIGHTNING HITS ALL', GOOD], ['FOR 20% OF MAX HP', NOTE]],
    apply: (mods, n) => { mods.overloadFrac = 0.2 * n; },
  },
  executioner: {
    name: 'EXECUTIONER',
    max: 1,
    theme: THEME.executioner,
    // THE ONE PASSIVE ITEM THAT STILL COSTS MAX HEALTH. It was the most
    // expensive pick on that row at 50, and it keeps that price now that
    // nothing else does - halving a boss is worth a permanent third of the
    // bar, and without the price it would be a free answer to the only fight
    // in the game that is meant to be a wall.
    //
    // Charged through mods.maxHpFlat rather than as a payment, because
    // rebuildMods() replays the owned list from fresh defaults after every pick:
    // a price paid once could not survive that, but a mod can.
    //
    // Worth nothing for four waves out of five, and it applies to bosses
    // spawned AFTER it is taken - one already standing keeps the health bar it
    // arrived with.
    effects: [['BOSSES HAVE 50%', NOTE], ['LESS HEALTH', GOOD], ['-50 MAX HEALTH', BAD]],
    apply: (mods, n) => {
      mods.bossHpMult *= Math.pow(0.5, n);
      mods.maxHpFlat += 50 * n;
    },
  },
  antidote: {
    name: 'ANTIDOTE',
    max: 1,
    theme: THEME.antidote,
    effects: [['IMMUNE TO POISON', GOOD], ['HEAL 1 HP/s PER', GOOD], ['POISONED ENEMY', NOTE]],
    apply: (mods, n) => {
      mods.poisonImmune = n;
      mods.poisonLeech = 1 * n;
    },
  },
  devilsGamble: {
    name: "DEVIL'S GAMBLE",
    max: 1,
    theme: THEME.gamble,
    // Rolled once per SHOT, not per pellet: a shotgun whose nine pellets each
    // rolled their own coin would average out to nothing, and the whole point
    // is that a shot is either a windfall or a waste.
    //
    // THE NAME IS THE MECHANIC, not a leftover: it is a coin toss with the
    // odds barely in your favour, which is exactly what the phrase means.
    // Renaming a passive item players already know would cost more than it
    // could possibly buy.
    effects: [['51% OF SHOTS: 2x DMG', GOOD], ['49% OF SHOTS: HALF', BAD]],
    apply: (mods, n) => { mods.gamble = n; },
  },
  // THE WHOLE HIT, NOT HALF OF IT. At 50% this was a pick that shortened a
  // fight the player was already losing by a fraction they could not see: half
  // of one melee swing, spread over a health bar that scales with the wave.
  // At 100% it is legible - whatever just hit you takes exactly that much - and
  // it becomes the answer to the crowd that surrounds you rather than a small
  // discount on being surrounded.
  //
  // IT IS STILL NOT A WAY TO PLAY. The damage is paid out of the player's own
  // health bar, so the optimal exploit - standing in a crowd and letting them
  // kill themselves - is the same play that kills you first: it reflects what
  // an attacker DEALT, and dealing is the part that ends runs. Nothing here
  // heals, blocks or caps the incoming hit.
  thorns: {
    name: 'THORNS',
    max: 1,
    theme: THEME.thorns,
    effects: [['ATTACKERS TAKE BACK', NOTE], ['100% OF THEIR DAMAGE', GOOD]],
    apply: (mods, n) => { mods.thorns = 1 * n; },
  },
  darkPower: {
    name: 'DARK POWER',
    max: 1,
    theme: THEME.power,
    // The plainest entry in the pool: damage, no drawback, no condition. It
    // cost five max HP on the old paid row, and free it is still UNDER Hollow
    // Point - a common, at +30% a stack for a smaller magazine - so it needs
    // no rebalance to sit here. Not everything has to be a decision.
    effects: [['+20% DAMAGE', GOOD]],
    apply: (mods, n) => { mods.damage *= 1 + 0.2 * n; },
  },
  // =========================================================================
  // THE CRITICAL HIT, AS A BUILD
  // =========================================================================
  //
  // The crit has been in the game since the first magazine of the first run -
  // 5% for 1.5x, in DEFAULT_MODS, deliberately non-zero so the yellow number
  // is a thing the player has already seen by the time anything here offers to
  // change it. What was missing was anywhere to take it. These six are that,
  // and they are built so that no two of them are the same pick:
  //
  //   DEADEYE and MARKSMAN raise the DICE. More of them, unconditionally.
  //   DEAD CENTER trades the dice for the PAYOUT, which is the same expected
  //     damage on paper and a completely different feel in the hand.
  //   ASSASSIN and TELLTALE do not touch the dice at all - they make a crit a
  //     thing you can PLAN, off the target's own history rather than a roll.
  //   SWEET SPOT, the active item, is eight seconds of all of it at once.
  //
  // WHERE THEY ARE RESOLVED. Not here and not in rollCrit(): a crit that
  // depends on WHICH BODY was hit cannot be decided at the trigger, because at
  // the trigger there is no body yet. rollCrit() still does the dice once per
  // trigger pull, exactly as it always did, and Game._resolveHit turns that
  // roll into a per-enemy answer at the moment a pellet lands. See the note
  // there - it is the one place all six meet.
  deadeye: {
    name: 'DEADEYE',
    max: 1,
    theme: THEME.deadeye,
    // Common, and the smaller of the two plain chances, because it is the
    // entry point to the whole family: 5% to 20% is the pick where the yellow
    // numbers stop being a curiosity and start being something the player can
    // feel. Everything else here is worth more once this has been taken.
    effects: [['+15% CRITICAL CHANCE', GOOD]],
    apply: (mods, n) => { mods.critChance += 0.15 * n; },
  },
  marksman: {
    name: 'MARKSMAN',
    max: 1,
    theme: THEME.marksman,
    // The same pick, bigger. Two entries rather than one that
    // stacks because the crit chance is a number with a CEILING that matters -
    // past about half, a crit stops reading as a crit and starts reading as
    // the damage number flickering - and a stacking entry would walk into that
    // on its own. 5 + 15 + 25 is 45%, which is as far as the pool goes.
    effects: [['+25% CRITICAL CHANCE', GOOD]],
    apply: (mods, n) => { mods.critChance += 0.25 * n; },
  },
  deadCenter: {
    name: 'DEAD CENTER',
    max: 1,
    theme: THEME.deadcenter,
    // TWICE THE PAYOUT FOR HALF THE DICE. On a bare 5% that is 1.5x on one
    // shot in twenty against 3x on one in forty - almost exactly the same
    // damage per magazine, and nothing like the same magazine. It is cursed
    // because the variance is the drawback: a run carrying this hits a wall
    // of chaff at ordinary damage for ten seconds and then removes a tank in
    // two rounds, and the player does not get to choose when.
    //
    // IT MULTIPLIES THE HALVING RATHER THAN SUBTRACTING, so it composes with
    // whatever the build has stacked: half of 45% is 22.5%, half of the bare
    // 5% is 2.5%, and neither can be driven to zero. Order does not matter -
    // rebuildMods replays the whole list from defaults, and a multiply and an
    // add on the same field commute for every combination the pool can offer.
    effects: [['CRITS DEAL 3x DAMAGE', GOOD], ['CRIT CHANCE HALVED', BAD]],
    apply: (mods, n) => {
      mods.critMult = 3;
      mods.critChance *= Math.pow(0.5, n);
    },
  },
  assassin: {
    name: 'ASSASSIN',
    max: 1,
    theme: THEME.assassin,
    // THE FIRST HIT ON A FRESH BODY, and once a body has been touched it is
    // never fresh again - not by healing, not by a wave boundary, because the
    // body itself does not survive either. So this pays exactly once per enemy
    // in the run, which is what makes it a CROWD pick rather than a boss one:
    // it is worth the most in the wave with thirty chasers in it and worth a
    // single opening round against a boss.
    //
    // It is also the only thing in the pool that rewards SPREADING fire, which
    // is the opposite of everything else a player has been taught - and that
    // is the pick.
    effects: [['FIRST HIT ON AN ENEMY', NOTE], ['IS ALWAYS A CRIT', GOOD]],
    apply: (mods, n) => { mods.assassin = n; },
  },
  telltale: {
    name: 'TELLTALE',
    max: 1,
    theme: THEME.telltale,
    // EVERY THIRD HIT ON THE SAME BODY. The count lives on the enemy and dies
    // with it, so it is the exact opposite of Assassin: this one pays for
    // STAYING on a target, and the two together are a build that has an answer
    // whichever way the player prefers to shoot.
    //
    // Counted per TRIGGER PULL and not per pellet - see the _shotHits guard in
    // _resolveHit - or a scattergun would tick the counter eight times a shell
    // and this would read as a permanent crit rather than as a rhythm.
    effects: [['EVERY 3rd HIT ON AN ENEMY', NOTE], ['IS ALWAYS A CRIT', GOOD]],
    apply: (mods, n) => { mods.telltale = 3; },
  },

  // =========================================================================
  // RANGE, WHICH THE GAME HAD NEVER CHARGED FOR
  // =========================================================================
  //
  // Damage has never cared how far away the thing was. These two make it care,
  // in opposite directions, and they are a matched pair on purpose: whichever
  // one a run draws, it is being told to stand somewhere.
  longshot: {
    name: 'LONGSHOT',
    max: 1,
    theme: THEME.distance,
    // A RAMP, NOT A THRESHOLD. A flat "+30% past 20 metres" would be a cliff
    // the player cannot see, and the tell would be the damage number jumping
    // as they backed over an invisible line. It climbs the whole way instead -
    // nothing at the muzzle, the full thirty at LONGSHOT_RANGE - so the
    // feedback is continuous and a player who has never read the card still
    // learns that backing off pays.
    effects: [['UP TO +30% DAMAGE', GOOD], ['THE FURTHER THE TARGET', NOTE]],
    apply: (mods, n) => { mods.longshot = 0.3 * n; },
  },
  pointBlank: {
    name: 'POINT BLANK',
    max: 1,
    theme: THEME.muzzle,
    // FIVE METRES IS INSIDE THE ARM'S REACH OF HALF THE ROSTER. That is the
    // whole deal: the bonus is only ever collected somewhere that is about to
    // cost health, which is what stops a flat +30% from being strictly better
    // than DARK POWER's +20% for free.
    //
    // A HARD EDGE HERE, where Longshot ramps, and the two are right for
    // opposite reasons. Longshot is about a slope the player rides; this is
    // about a LINE they either stepped over or did not, and the same five
    // metres is the number every melee reach in the game is already built
    // around - so it is a distance the player has learnt by being bitten at it.
    effects: [['+30% DAMAGE WITHIN 5m', GOOD]],
    apply: (mods, n) => { mods.pointBlank = 0.3 * n; },
  },

  // =========================================================================
  // WHAT A HIT TAKEN IS WORTH
  // =========================================================================
  //
  // Two picks that turn the health bar into a resource that pays out, and they
  // pay in different currencies so a run can hold both without either being
  // redundant. Both are hooked at ONE place - Game._hurtPlayer, after the
  // dodge, the ward and every multiplier - so what they read is what the
  // player actually lost, never what was thrown at them.
  bloodMoney: {
    name: 'BLOOD MONEY',
    max: 3,
    theme: THEME.tithe,
    // COMPENSATION, NOT AN INCENTIVE. Two credits a point at the first tier is
    // a fraction of what the same seconds spent killing would have paid, so
    // standing in a fire to farm it is strictly worse than not - which is the
    // only way a "get paid for being hurt" pick can be written without
    // becoming the optimal way to play. See the note above THORNS: the same
    // rule, one file over.
    //
    // It scales with the DAMAGE and not with the hit, so a tank's slam pays
    // like a tank's slam and a poison tick pays like a poison tick.
    effects: (n) => [
      ['CREDITS WHEN HURT ' + step(n, (k) => '$' + 2 * k + '/HP'), GOOD],
      ['PAID ON DAMAGE TAKEN', NOTE],
    ],
    apply: (mods, n) => { mods.bloodMoney += 2 * n; },
  },
  adrenaline: {
    name: 'ADRENALINE',
    max: 1,
    theme: THEME.adrenaline,
    // CARNAGE, RUN BACKWARDS. Carnage climbs on kills and is lost the instant
    // anything touches you; this climbs on being touched and is lost at the
    // end of the wave. A run holding both has a damage number that never sits
    // still, and neither of them can be farmed: one is capped by the wave, the
    // other by the health bar.
    //
    // THE RESET IS THE WAVE AND NOT A CLOCK. A timer would make the pick about
    // stringing hits together, which is a thing the player would then try to
    // DO - and a passive item that pays the player for walking into a rusher
    // is the failure this whole entry is written around. A wave boundary is a
    // moment they do not control, so the ten stacks are something a bad wave
    // gave them rather than something a good one is farmed for.
    effects: [['+4% DAMAGE PER HIT TAKEN', GOOD], ['UP TO +40%, RESETS EACH WAVE', NOTE]],
    apply: (mods, n) => {
      mods.adrenalineStep = 0.04 * n;
      mods.adrenalineMax = 0.4;
    },
  },

  // =========================================================================
  // THE REST
  // =========================================================================

  rabbitsFoot: {
    name: "RABBIT'S FOOT",
    max: 2,
    theme: THEME.charm,
    // A MULTIPLIER ON EVERY CATEGORY'S CHANCE, applied inside rollDrop where
    // the need term has already been added - so it lifts the floor for a
    // player who is fine and lifts the already-raised chance for a player who
    // is not, in the same proportion. Adding a flat 15 points instead would
    // have been worth four times as much to a full-health player as to a
    // desperate one, which is backwards for a luck charm.
    effects: (n) => [['DROP CHANCE ' + step(n, pctUp(15)), GOOD], ['FROM EVERY KILL', NOTE]],
    apply: (mods, n) => { mods.dropLuck *= 1 + 0.15 * n; },
  },
  crouchfire: {
    name: 'CROUCHFIRE',
    max: 2,
    theme: THEME.hunker,
    // THE CROUCH ALREADY COSTS HALF THE PLAYER'S SPEED and until now bought
    // nothing but a lower head. This is the pick that makes it a stance: the
    // rate is read live off `crouching`, so it arrives the frame the button
    // lands and leaves the frame it is let go, and the player finds that out
    // by holding a trigger through a crouch rather than by reading it.
    //
    // Sliding does NOT count. A slide is a movement, not a stance, and one
    // that fired 20% faster would be the best way to cross a room shooting.
    effects: (n) => [['FIRE RATE ' + step(n, pctUp(20)), GOOD], ['WHILE CROUCHING', NOTE]],
    apply: (mods, n) => { mods.crouchRate += 0.2 * n; },
  },
  bloodsport: {
    name: 'BLOODSPORT',
    max: 2,
    theme: THEME.bloodsport,
    // THE MELEE ALREADY PAYS DOUBLE CREDITS and has always been the most
    // dangerous way to finish anything - you have to be inside its reach to
    // use it. This is the second half of that bargain: a swing that connects
    // is now a swing that pays for the hit you took getting there.
    //
    // ON THE KILL, NOT ON THE SWING. Healing per hit would make a held melee
    // button a health regen with a windup; the body has to actually go down.
    // It reads `meleeKill`, the same flag the credit double is decided on, in
    // the same sweep - so the two can never disagree about what a melee kill is.
    effects: (n) => [['MELEE KILLS HEAL ' + step(n, (k) => 3 * k + ' HP'), GOOD]],
    apply: (mods, n) => { mods.meleeHeal += 3 * n; },
  },
  warChest: {
    name: 'WAR CHEST',
    max: 1,
    theme: THEME.warchest,
    // THE MONEY YOU DID NOT SPEND IS THE STAT. One point of damage per
    // thousand banked, read live off the balance, so it climbs as the wave
    // pays out and DROPS the moment the player buys anything - which is the
    // entire pick. Everything else in the game wants the money spent; this is
    // the one voice arguing for the hoard, and it has to lose that argument
    // often enough to stay interesting.
    //
    // FLAT, AND ADDED TO THE WEAPON'S OWN DAMAGE BEFORE EVERY MULTIPLIER, so
    // it is worth the most to a build that has already stacked Hollow Point -
    // and worth exactly a thousand dollars a point to one that has not. A
    // thousand is the mystery box's own opening price, which is the only
    // number in this game a player already reads as "one purchase".
    effects: [['+1 DAMAGE PER $1,000', GOOD], ['ON YOUR BALANCE', NOTE]],
    apply: (mods, n) => { mods.warChest = n; },
  },
  twinCell: {
    name: 'TWIN CELL',
    max: 1,
    theme: THEME.cell,
    // A SECOND CHARGE, NOT A SECOND SLOT. The slot is still one deep and the
    // item in it is still the run's answer to one problem - what changes is
    // that the answer can be given twice in a row, which is a different thing
    // entirely from carrying two answers. Everything the file's opening note
    // says about the slot survives this word for word.
    //
    // The second charge begins filling the instant the first is full, out of
    // the same kills, so what the player is really buying is the right to bank
    // charge they would otherwise have thrown away - see the clamp in
    // Player.addItemCharge, which used to drop the overflow on the floor.
    effects: [['HOLD 2 ITEM CHARGES', GOOD], ['THE SECOND FILLS AFTER', NOTE]],
    apply: (mods, n) => { mods.itemChargeCap = 1 + n; },
  },

  // ---- THE TWO COMPANIONS --------------------------------------------------
  //
  // Nothing else the player owns is ALIVE. A turret is furniture with a
  // cooldown and the bees are a cloud on a timer; these two are around for the
  // whole run, they move on their own account, and the player will watch them.
  // That is the whole reason they are worth the geometry: a passive item you
  // can see doing its job is a different kind of ownership from a number in a
  // stat block, and the pool had none of it.
  //
  // Both live in js/companions.js, and NEITHER is a deployable - a deployable
  // is swept at every wave end (see _clearHazards), and a pet that had to be
  // re-summoned every wave would be a pet the player buries once a minute.
  magpie: {
    name: 'MAGPIE',
    max: 1,
    theme: THEME.magpie,
    // IT DOES NOT EARN MONEY, IT SAVES IT. Every orb it walks onto is one the
    // player was going to collect anyway or was going to lose to ORB_LIFETIME,
    // and it is only ever worth something in the second case - so the pick is
    // "the corner of the room you did not have time to go back for", which is
    // a real thing that happens in every wave and which nothing else answers.
    //
    // Deliberately NOT a magnet upgrade. Lodestone already widens the radius
    // around the player; the bird is somewhere else, which is the only thing
    // it can offer that a bigger circle cannot.
    effects: [['A BIRD COLLECTS CREDITS', GOOD], ['FROM ACROSS THE ARENA', NOTE]],
    apply: (mods, n) => { mods.magpie = n; },
  },
  lamprey: {
    name: 'LAMPREY',
    max: 1,
    theme: THEME.lamprey,
    // TEN DAMAGE ON THE DOWNBEAT - once a beat, not twice. It used to bite on
    // every pulse, which is the half-beat edge the sentry guns and every fire
    // tick ride, and at ten a bite that made a free permanent companion worth
    // two bees. One bite a WHOLE beat is the rate the card always claimed and
    // it is the rate you can hear: the leech chews on the kick drum, so what
    // it is doing is legible without a damage number.
    //
    // The benchmark is still a bee's damage - except this one never expires and
    // never has to be paid for again. What balances that is REACH: a bee flies
    // forty metres at whatever it likes, and the lamprey will not leave the
    // player's side for more than LAMPREY_RANGE. It is a bodyguard, so it is
    // only ever worth anything to a player who is already in trouble.
    //
    // ON THE BEAT, like the turret, the sentry and every fire tick in the game.
    // Nothing rhythmic in this game runs on a private timer - see Music.pulse.
    effects: [['A LEECH GUARDS YOU', NOTE], ['10 PER DOWNBEAT, HEALS 2', GOOD]],
    apply: (mods, n) => { mods.lamprey = n; },
  },

  // ---- THE NINE POSTURE AND MAGAZINE PICKS --------------------------------
  //
  // What these have in common is that none of them is a number that is simply
  // TRUE. Every one asks the player to be doing something particular - to be
  // holding a nearly empty magazine, to be reloading a nearly full one, to be
  // aiming, to be crouched, to be unhurt - and pays only then. A pool made
  // entirely of flat multipliers is a pool where the build is decided at the
  // totem and the fight is arithmetic; these are decided in the fight.

  fatalReserve: {
    name: 'FATAL RESERVE',
    max: 1,
    theme: THEME.reserve,
    // THE BOTTOM OF THE MAGAZINE IS THE WORST PART OF IT, always has been: the
    // rounds you fire knowing a reload is coming, usually while backing away.
    // This pays for staying on the trigger through them, and it is the only
    // crit passive item in the pool that is not a probability - the other five
    // change the odds, and this one names five rounds and guarantees them.
    //
    // FIVE OF THIRTY is a sixth of a magazine, so on paper it is worth rather
    // less than DEADEYE's flat +15%. What it is actually worth is that the
    // player knows WHICH five, which no amount of chance can buy: a boss with
    // a sliver left is a reason to burn down to the last five rather than to
    // reload, and that decision is the pick.
    effects: [['THE LAST 5 ROUNDS OF', NOTE], ['EVERY MAGAZINE ALWAYS CRIT', GOOD]],
    apply: (mods, n) => { mods.fatalReserve = Math.max(mods.fatalReserve, 5 * n); },
  },

  primedMag: {
    name: 'PRIMED MAG',
    max: 1,
    theme: THEME.primed,
    // THE TACTICAL RELOAD, PAID FOR. Every shooter teaches the habit of
    // topping up between fights and no shooter has ever paid for it; here the
    // rounds you did not fire are the bomb, so a magazine dropped at twenty is
    // four hundred damage and one dropped empty is nothing at all.
    //
    // THE ROUNDS ARE GONE, and that is the price. An ordinary reload TOPS the
    // magazine up - what is in it is kept and only the difference comes off
    // the reserve - and this one cannot, because the magazine is no longer
    // there. So a fresh one is filled from empty and a tactical reload costs
    // the whole thing. Without that the pick was free damage: fire one round,
    // reload, and twenty-nine went downrange for one round off the reserve.
    //
    // TWENTY A ROUND, NOT FIVE. At five a full-ish magazine was 145 damage -
    // less than SHORT FUSE, which is an active item costing thirty charge -
    // and the pick read as a decoration on a reload. At twenty the same throw
    // is 580, which is the biggest single number a passive item puts on the
    // board, and it is paid for twice: the whole magazine off the reserve, and
    // the four-metre radius, which is half SHORT FUSE's and means it only pays
    // when a crowd is already close enough to be a problem.
    //
    // IT CANNOT HURT THE PLAYER, unlike SHORT FUSE, which is the item the
    // blast is otherwise borrowed from. A thrown mag is not aimed - it goes
    // out on the reload, which is a button pressed for a different reason -
    // and a passive item that killed the player for reloading in a corridor
    // would be a passive item nobody could take.
    effects: [
      ['RELOADING THROWS THE MAG', GOOD],
      ['20 DAMAGE PER ROUND LEFT', GOOD],
      ['THOSE ROUNDS ARE SPENT', BAD],
    ],
    apply: (mods, n) => { mods.primedMag = 20 * n; },
  },

  bailiff: {
    name: 'BAILIFF',
    max: 1,
    theme: THEME.bailiff,
    // A FIFTH OF EVERY PRESS BACK. It is the only passive item in the pool
    // that reaches the active-item slot at all besides TWIN CELL, and the two
    // are opposites worth owning together: Twin Cell lets the player BANK a
    // second charge, this makes each one cost four fifths of what it did.
    //
    // A REFUND AND NOT A DISCOUNT, which is why it is written as charge handed
    // back after the spend rather than as a cheaper cost: the meter empties
    // when the button is pressed, exactly as it always has, and then a fifth
    // of it comes back. The player sees the item fire and the bar jump.
    effects: [['USING AN ITEM REFUNDS', NOTE], ['20% OF ITS CHARGE', GOOD]],
    apply: (mods, n) => { mods.bailiff = Math.min(0.9, 0.2 * n); },
  },

  paceCar: {
    name: 'PACE CAR',
    max: 1,
    theme: THEME.pace,
    // BERSERKER'S EXACT OPPOSITE, and it belongs in the same pool for that
    // reason. Berserker pays on health missing and is worth nothing until the
    // run is going badly; this is worth something for as long as the run is
    // going well and is gone the instant it is not - one graze, from anything,
    // and both halves switch off until the player has healed all the way back.
    //
    // TEN AND TEN, on the two stats a player FEELS rather than reads. It is a
    // small number twice on purpose: the pick is not the multiplier, it is
    // that being at full health has become a thing worth protecting.
    effects: [['AT FULL HEALTH:', NOTE], ['+10% FIRE RATE', GOOD], ['+10% MOVE SPEED', GOOD]],
    apply: (mods, n) => { mods.pace = 0.1 * n; },
  },

  ceramicInsert: {
    name: 'CERAMIC INSERT',
    max: 1,
    theme: THEME.ceramic,
    // A CEILING, NOT A REDUCTION, and the difference is the whole pick. Damage
    // reduction is worth the same against a chaser's scratch as against a
    // boss's slam; a cap is worth NOTHING against the scratch and everything
    // against the slam. What it buys is that no single thing in the game can
    // take more than a quarter of the bar, so four hits is the fewest the run
    // can ever end in, whatever wave it is.
    //
    // IT SITS INSIDE Player.takeDamage, after curse and before the shield, so
    // it is the last word on what a hit costs: everything that multiplies
    // incoming damage - BLOOD PACT, RED MIST, a curse, a hazard - has already
    // had its say by then and none of them can push a hit past the cap.
    effects: [['NO SINGLE HIT TAKES MORE', NOTE], ['THAN 25% OF YOUR MAX HP', GOOD]],
    apply: (mods, n) => { mods.hitCap = 0.25 / n; },
  },

  overdraw: {
    name: 'OVERDRAW',
    max: 1,
    theme: THEME.overdraw,
    // THE HEALTH ECONOMY'S ONLY LEAK, PLUGGED. A health crate walked over at
    // 98/100 used to be two points and a shrug, and every heal in the game -
    // Nanoweave's trickle, Vampiric's drip, the leech's two - quietly stopped
    // paying the moment the bar was full. Nothing is wasted now: the overflow
    // goes into the one meter that is never full for long.
    //
    // FIVE HP TO ONE POINT is deliberately a poor rate. One point of charge is
    // one dead chaser (see CHARGE_PER_VALUE in items.js), and five health is
    // worth a great deal more than one chaser to a player who is hurt - which
    // is exactly the trade: this is worth something only when the player is
    // ALREADY topped up, so it can never be a reason to stand in a fire.
    //
    // THE EXPLOIT, NAMED. Paired with a REGENERATING source - NANOWEAVE's 2
    // HP/s, or DIG IN's plant tick - this is the one thing in the game that
    // fills the item meter without killing anything, which is the rule
    // CHARGE_PER_VALUE exists to hold. The optimal play is to keep one slow
    // enemy alive at the far end of the arena and stand at full health, and it
    // pays 0.4 points a second for it - about a chaser every two and a half
    // seconds, for doing nothing.
    //
    // WHAT ALREADY BOUNDS IT: regen is gated on `combat` (see Player.update),
    // so none of it ticks at a wave break or in the shop - the wave has to be
    // running, which means something has to be alive and coming for you. The
    // rate is also the floor of what a wave pays anyway. It is left as it is
    // because the pairing costs TWO of the run's picks to assemble and one of
    // them is a heal the player then cannot spend, and because a player who
    // has worked that out has earned it. If it ever needs cutting, cut the
    // RATE here rather than adding a condition: a passive item that pays for
    // some heals and not others is the thing this was built to avoid.
    effects: [['HEALING PAST YOUR MAX HP', NOTE], ['BECOMES ITEM CHARGE', GOOD], ['1 PER 5 HP SPILLED', NOTE]],
    apply: (mods, n) => { mods.overdraw = 5 / n; },
  },

  leadBalloon: {
    name: 'LEAD BALLOON',
    max: 1,
    theme: THEME.ballast,
    // TWENTY-FIVE PERCENT IS A LOT, and the jump is a lot to give up. The
    // arena has catwalks, the boxes are cover you get ON as often as behind,
    // and half the enemies in the pool are answered by not being where they
    // are looking. This is the cursed pick that takes away a VERB rather than
    // a number, which is the only kind of drawback a player cannot stat their
    // way out of later in the run.
    //
    // IT DOES NOT TOUCH THE DASH, THE SLIDE OR A LEDGE. Everything the player
    // has for getting out of a corner still works, and one of them - the slide
    // - is the thing they will end up using instead. Taking the jump is meant
    // to change how the room is crossed, not to nail the player to the floor.
    effects: [['+25% DAMAGE', GOOD], ['YOU CANNOT JUMP', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.25 * n;
      mods.noJump = 1;
    },
  },

  cheekweld: {
    name: 'CHEEKWELD',
    max: 1,
    theme: THEME.cheekweld,
    // ARMOUR ON A POSTURE THAT USED TO BE ALL COST. Aiming already trades
    // movement for accuracy, which in a game about crowds is a trade the
    // player mostly declines - so the sights are the one thing in the control
    // scheme a build could ignore entirely. A fifth off every hit taken while
    // they are up is a reason to be standing there.
    //
    // READ LIVE OFF `aiming`, the same flag the gun's own raise rides, so it
    // arrives on the frame the button lands rather than at the end of the
    // half-second the weapon takes to come up. The player is protected by the
    // DECISION, not by the animation finishing.
    effects: [['TAKE 20% LESS DAMAGE', GOOD], ['WHILE AIMING DOWN SIGHTS', NOTE]],
    apply: (mods, n) => { mods.aimGuard = Math.min(0.9, 0.2 * n); },
  },

  groundhog: {
    name: 'GROUNDHOG',
    max: 1,
    theme: THEME.groundhog,
    // THE THIRD THING CROUCHING IS FOR. It already buys a smaller target and,
    // with CROUCHFIRE, a faster trigger; this makes it the posture you reload
    // in as well, which is the one moment in a fight the player is doing
    // nothing else anyway. Down behind a box, magazine out, taking a fifth
    // less from whatever is still shooting at you - that is a whole way of
    // playing a wave, assembled out of three picks that each read as small.
    //
    // A SLIDE IS NOT A CROUCH, on the same terms Crouchfire draws the line: a
    // slide is a way of MOVING, it is entered out of a sprint and it ends
    // itself, and a slide that also took a fifth less damage would be the best
    // way to cross a room under fire. The stance is what is being paid for.
    effects: [['WHILE CROUCHED:', NOTE], ['TAKE 20% LESS DAMAGE', GOOD], ['RELOAD 20% FASTER', GOOD]],
    apply: (mods, n) => {
      mods.crouchGuard = Math.min(0.9, 0.2 * n);
      mods.crouchReload = Math.min(0.9, 0.2 * n);
    },
  },

  // ---- THE SECOND POOL ----------------------------------------------------
  //
  // Forty-one more max-1 picks, and what holds them together is that almost
  // every one of them names a MOMENT rather than a number: the first round out
  // of a magazine, the second before you fired, the fourth shot, the beat, the
  // frame you were hit on, the wave boundary. The pool above is mostly "how
  // much"; this is mostly "when", which is the axis a player can actually play
  // around once they have learnt it.
  //
  // EVERY ONE OF THEM WEIGHS ITSELF. A free upgrade in a flat draw is a totem
  // the player never has to think at, so the ones that are simply strong -
  // Heavy Hand, Blood Oath, Bone Marrow, Gray Matter - are sold for something
  // the build actually wanted, and the ones that are conditional are the ones
  // allowed to be unconditionally good inside their condition.

  // ---- RATE OF FIRE -------------------------------------------------------

  // THE TRIGGER THAT LEARNS TO BE HELD, and the exact opposite of every other
  // rate pick in the pool: those pay from the first round and this one pays
  // nothing for the first second. Ten seconds of held trigger is the ceiling,
  // which is longer than any magazine this gun has - so the cap is a thing a
  // build reaches by never letting go, not a number it sits at.
  machineSpirit: {
    name: 'MACHINE SPIRIT',
    max: 1,
    theme: THEME.machineSpirit,
    effects: [['HOLD THE TRIGGER:', NOTE], ['+5% FIRE RATE PER SEC', GOOD], ['UP TO +50%', NOTE]],
    apply: (mods, n) => {
      mods.spiritStep = 0.05 * n;
      mods.spiritMax = 0.5 * n;
    },
  },
  // Rate bought with the one thing a faster gun needs more of. A 1.4s reload
  // becomes 2s, which is most of a second longer every thirty rounds - and the
  // rate is spending those rounds faster, so the pick pays for itself twice
  // and charges for itself twice.
  overwound: {
    name: 'OVERWOUND',
    max: 1,
    theme: THEME.overwound,
    effects: [['+40% FIRE RATE', GOOD], ['-30% RELOAD SPEED', BAD]],
    apply: (mods, n) => {
      mods.fireRate *= 1 + 0.4 * n;
      mods.reloadMult *= Math.pow(1 / 0.7, n);
    },
  },
  // THE STANCE IS THE STAT. Crouchfire and Cheekweld already ask the player to
  // choose a posture; this asks the harder question, because hip-fire is the
  // inaccurate half of the gun (see `spread` on the pulse rifle) and doubling
  // the rate of a spray is only worth something at a range the spray can hold.
  hipshot: {
    name: 'HIPSHOT',
    max: 1,
    theme: THEME.hipshot,
    effects: [['2x FIRE RATE FROM THE HIP', GOOD], ['0.5x WHILE AIMING', BAD]],
    apply: (mods, n) => { mods.hipshot = n; },
  },
  // THE GUN JOINS THE BAND. The trigger stops being a rate at all: a shot
  // leaves on the beat and on no other frame, which means the fire rate stat
  // has nothing left to multiply and the player's own timing has nothing left
  // to do. What they get for it is a round worth four.
  //
  // Fire, poison and every sentry gun in the arena already ride Music.pulse
  // (see the note in js/music.js); this is the player joining them.
  metronome: {
    name: 'METRONOME',
    max: 1,
    theme: THEME.metronome,
    effects: [['FIRE ONLY ON THE BEAT', NOTE], ['4x DAMAGE', GOOD], ['FIRE RATE DOES NOTHING', BAD]],
    apply: (mods, n) => {
      mods.metronome = n;
      mods.damage *= Math.pow(4, n);
    },
  },
  // A FREE ROUND EVERY FOURTH TRIGGER PULL, at half strength and off no
  // magazine. Counted per SHOT and not per pellet, the rule every other
  // per-shot pick in the pool follows.
  echoChamber: {
    name: 'ECHO CHAMBER',
    max: 1,
    theme: THEME.echoChamber,
    effects: [['EVERY 4TH SHOT FIRES TWICE', GOOD], ['THE ECHO IS HALF DAMAGE', NOTE], ['AND COSTS NO AMMO', GOOD]],
    apply: (mods, n) => {
      mods.echoEvery = 4;
      mods.echoDamage = 0.5 * n;
    },
  },

  // ---- DAMAGE -------------------------------------------------------------

  // TEN TIMES, ONCE A MAGAZINE. It is the reload rhythm turned into a weapon:
  // Breach Round and Hellfire both pay the player for reloading, and this pays
  // them for reloading EARLY, which is the one thing those two do not ask for.
  cannonade: {
    name: 'CANNONADE',
    max: 1,
    theme: THEME.cannonade,
    effects: [['FIRST SHOT OF A MAGAZINE', NOTE], ['DEALS 10x DAMAGE', GOOD]],
    apply: (mods, n) => { mods.firstShot = 10 * n; },
  },
  // The straight trade, and the only one in the pool that charges rate for
  // damage rather than the other way round. Net DPS is a hair under even; what
  // it actually buys is a bigger number per round, which is what matters
  // against armour, against a boss, and to a magazine that has to last.
  heavyHand: {
    name: 'HEAVY HAND',
    max: 1,
    theme: THEME.heavyHand,
    effects: [['+60% DAMAGE', GOOD], ['-40% FIRE RATE', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.6 * n;
      mods.fireRate *= Math.pow(0.6, n);
    },
  },
  // TELLTALE'S PATIENT COUSIN. That one turns the third hit on a body into a
  // crit; this one turns the body itself into a soft target, permanently, for
  // everything - the gun, a turret, poison, a blast, another enemy's friendly
  // fire. Three hits is one burst.
  weakPoint: {
    name: 'WEAK POINT',
    max: 1,
    theme: THEME.weakPoint,
    effects: [['3 HITS MARK AN ENEMY', GOOD], ['MARKED TAKE +50% DAMAGE', GOOD], ['FROM EVERYTHING', NOTE]],
    apply: (mods, n) => { mods.markHits = 3; mods.markBonus = 0.5 * n; },
  },
  // NOTHING IS WASTED ON A CORPSE. A rifle round worth 34 into a body with 5
  // left used to throw 29 away; now it walks. Five metres, so it pays a player
  // shooting into a crowd and pays nothing at all to one picking off stragglers.
  overkill: {
    name: 'OVERKILL',
    max: 1,
    theme: THEME.overkill,
    effects: [['DAMAGE PAST A KILL', NOTE], ['CARRIES TO THE NEXT ENEMY', GOOD]],
    apply: (mods, n) => { mods.overkill = n; mods.overkillRange = 5; },
  },
  // DOUBLE DAMAGE, PAID FOR IN BAR, FOREVER. Five max HP a wave is nothing on
  // wave two and the whole run by wave twenty - and it stops at fifty, which is
  // the number that keeps it a build rather than a countdown. Anything that
  // raises the cap back over fifty starts the meter again, which is the honest
  // reading of the deal: the oath is on the max, not on a wave count.
  bloodOath: {
    name: 'BLOOD OATH',
    max: 1,
    theme: THEME.bloodOath,
    effects: [['+100% DAMAGE', GOOD], ['-5 MAX HP EVERY WAVE', BAD], ['STOPS AT 50 MAX HP', NOTE]],
    apply: (mods, n) => { mods.oathPerWave = 5 * n; mods.oathFloor = 50; },
  },
  // ONE BLOW, SPLIT EVERY WAY. It is a crowd-clearing pick wearing a drawback:
  // against a lone boss it changes nothing at all, and against thirty bodies it
  // turns a rifle into a room-wide tick that kills the whole wave at once.
  // Every source, so poison, turrets, blasts and lightning are all in it.
  sharedPain: {
    name: 'SHARED PAIN',
    max: 1,
    theme: THEME.sharedPain,
    effects: [['ALL DAMAGE IS SPLIT', NOTE], ['EVENLY OVER EVERY ENEMY', GOOD]],
    apply: (mods, n) => { mods.sharedPain = n; },
  },
  // TEN PERCENT OF EVERYTHING, and the colour of the room. The stats are
  // deliberately small and deliberately unconditional - it is the one pick in
  // the pool with nothing to learn and nothing to play around - so what it
  // actually costs is the thing the game is hardest to read without: the enemy
  // colours, the status tints, the theme light. The whole game, in grey.
  grayMatter: {
    name: 'GRAY MATTER',
    max: 1,
    theme: THEME.grayMatter,
    effects: [['+10% TO EVERY STAT', GOOD], ['THE WORLD LOSES COLOUR', BAD]],
    apply: (mods, n) => {
      mods.maxHpBonus += 10 * n;
      mods.damage *= 1 + 0.1 * n;
      mods.fireRate *= 1 + 0.1 * n;
      mods.moveMult *= 1 + 0.1 * n;
      mods.mono = n;
    },
  },
  // THE ONE PICK THAT TAKES SOMETHING BACK. It is small on purpose: what it
  // costs is not the ten percent, it is that the totem is a coin toss with the
  // rest of the build - and the deeper the build, the worse the odds get.
  sacrifice: {
    name: 'SACRIFICE',
    max: 1,
    theme: THEME.sacrifice,
    effects: [['+10% DAMAGE & FIRE RATE', GOOD], ['DESTROYS ONE OF YOUR', BAD], ['OTHER PASSIVE ITEMS', BAD]],
    apply: (mods, n) => {
      mods.damage *= 1 + 0.1 * n;
      mods.fireRate *= 1 + 0.1 * n;
      // The removal itself is NOT here. apply() is replayed from fresh
      // defaults on every draft pick (see rebuildMods), so an apply() that
      // dropped an upgrade would drop another one every time the player took
      // anything at all. It happens once, at the pick - see Player.takeUpgrade.
      mods.sacrifice = n;
    },
  },
  // DAMAGE OFF AN EMPTY GUN. The only pick in the pool that pays for running
  // dry, which is the one thing every other ammunition pick in the game is
  // trying to stop the player doing.
  bottomFeeder: {
    name: 'BOTTOM FEEDER',
    max: 1,
    theme: THEME.bottomFeeder,
    effects: [['RELOAD FROM EMPTY:', NOTE], ['+20% DAMAGE FOR 5s', GOOD]],
    apply: (mods, n) => { mods.bottomFeed = 0.2 * n; mods.bottomTime = 5; },
  },

  // ---- AMMUNITION AND MONEY ------------------------------------------------

  // A FLAT HUNDRED A BODY, which is worth more early than Midas and less late -
  // it does not scale with the enemy, so it pays a wave of chaff and shrugs at
  // a boss. The damage is what it charges, and it charges it on every source.
  payday: {
    name: 'PAYDAY',
    max: 1,
    theme: THEME.payday,
    effects: [['+$100 PER KILL', GOOD], ['-10% DAMAGE', BAD]],
    apply: (mods, n) => {
      mods.killCredits = 100 * n;
      mods.damage *= Math.pow(0.9, n);
    },
  },
  ammoSurplus: {
    name: 'AMMO SURPLUS',
    max: 1,
    theme: THEME.ammoSurplus,
    effects: [['AMMO PICKUPS GIVE', NOTE], ['+30% MORE ROUNDS', GOOD]],
    apply: (mods, n) => { mods.ammoPickupMult = 1 + 0.3 * n; },
  },
  // THE SHOP, GAMBLED WITH. Nine visits in ten it is the best economy pick in
  // the game - every reroll and every box roll free, price ladder and all - and
  // the tenth is the worst thing that can happen to a run that is winning.
  //
  // The price check goes with the price: a player carrying this can always
  // pull the lever, which is what makes the tenth pull a real risk rather than
  // a discount they were saving up for anyway.
  highStakes: {
    name: 'HIGH STAKES',
    max: 1,
    theme: THEME.highStakes,
    effects: [['REROLLS & BOXES ARE FREE', GOOD], ['10%: DROPPED TO 1 HP', BAD], ['AND 1 AMMO', BAD]],
    apply: (mods, n) => { mods.highStakes = n; mods.stakesOdds = 0.1; },
  },
  // A FULL MAGAZINE FOR A HIT. It is the only pick in the pool that turns
  // taking damage into ammunition, and the rounds are made rather than moved -
  // the reserve is never touched - so it is worth most to exactly the build
  // that is running out of both at once.
  bruiseRounds: {
    name: 'BRUISE ROUNDS',
    max: 1,
    theme: THEME.bruiseRounds,
    effects: [['BEING HIT REFILLS', NOTE], ['THE MAGAZINE, FREE', GOOD]],
    apply: (mods, n) => { mods.bruise = n; },
  },
  // THE LAST ROUND, CASHED. A magazine emptied INTO something reloads itself,
  // so a build that counts its shots never stands still - and one that sprays
  // the last five into a wall pays the full 1.4 seconds like everybody else.
  chainFeed: {
    name: 'CHAIN FEED',
    max: 1,
    theme: THEME.chainFeed,
    effects: [['KILL WITH THE LAST ROUND:', NOTE], ['INSTANT RELOAD', GOOD]],
    apply: (mods, n) => { mods.chainFeed = n; },
  },
  // NO MAGAZINE AT ALL. There is nothing to reload, nothing to run dry and
  // nothing to time - the gun simply runs until the reserve does, at two rounds
  // a shot. It is the biggest change to how the weapon FEELS in either pool,
  // and what it costs is that the reserve is now the only number there is.
  beltFedDream: {
    name: 'BELT FED DREAM',
    max: 1,
    theme: THEME.beltFedDream,
    effects: [['NO MAGAZINE, NO RELOAD', GOOD], ['FIRES FROM THE RESERVE', NOTE], ['2 AMMO PER SHOT', BAD]],
    apply: (mods, n) => { mods.beltFedDream = n; mods.beltFedCost = 2; },
  },
  // THE GUN NEVER STOPS, IT ONLY GETS EXPENSIVE. Ten dollars a round is real
  // money on wave three and pocket change on wave thirty, which is the correct
  // shape: it is an emergency early and a way of playing late.
  cashCannon: {
    name: 'CASH CANNON',
    max: 1,
    theme: THEME.cashCannon,
    effects: [['OUT OF AMMO:', NOTE], ['KEEP FIRING AT $10 A SHOT', GOOD]],
    apply: (mods, n) => { mods.cashCannon = 10 * n; },
  },
  // ONE PER WAVE, at the moment the player is least able to go and look for a
  // crate. It fires on the way DOWN through twenty, so it cannot be farmed by
  // hovering there - the bar has to cross the line.
  lastBreath: {
    name: 'LAST BREATH',
    max: 1,
    theme: THEME.lastBreath,
    effects: [['DROP BELOW 20 HP:', NOTE], ['REFILL THE AMMO RESERVE', GOOD], ['ONCE PER WAVE', NOTE]],
    apply: (mods, n) => { mods.lastBreath = 20 * n; },
  },
  // LODESTONE'S ENDGAME, AT HALF PRICE. The wave-clear sweep never switches
  // off, so money is something that happens rather than something you walk to -
  // and every orb is worth half, so the pick is about ATTENTION and not income.
  autoLoot: {
    name: 'AUTO-LOOT',
    max: 1,
    theme: THEME.autoLoot,
    effects: [['ALL CREDITS COME TO YOU', GOOD], ['ALWAYS', NOTE], ['-50% CREDIT VALUE', BAD]],
    apply: (mods, n) => {
      mods.autoLoot = n;
      mods.creditMult *= Math.pow(0.5, n);
    },
  },
  // CRITS THAT PAY FOR THEMSELVES, and ordinary rounds that pay for the crits.
  // At the base 5% chance this is a straight ammunition tax; every crit pick in
  // the pool above turns it the other way up, which is what makes it a pick for
  // a build rather than a pick on its own.
  criticalOverflow: {
    name: 'CRITICAL OVERFLOW',
    max: 1,
    theme: THEME.criticalOverflow,
    effects: [['CRITS: +50% DMG, +1 AMMO', GOOD], ['NON-CRITS COST 1 MORE', BAD]],
    apply: (mods, n) => {
      mods.critMult *= 1 + 0.5 * n;
      mods.critOverflow = n;
    },
  },

  // ---- STAYING ALIVE -------------------------------------------------------

  // NOTHING STICKS. Fire, poison, chill, fear, weakness and curse all simply
  // fail to land - which is most of what the hazard-heavy themes have to say -
  // and the price is on the other end of the same bar.
  ironLung: {
    name: 'IRON LUNG',
    max: 1,
    theme: THEME.ironLung,
    effects: [['IMMUNE TO ALL STATUS', GOOD], ['-30% HEALING', BAD]],
    apply: (mods, n) => {
      mods.statusImmune = n;
      mods.poisonImmune = n;
      mods.healMult *= Math.pow(0.7, n);
    },
  },
  // A FLOOR UNDER THE BAR. It regenerates only up to 25 and then stops, so it
  // is not a heal - it is a promise that the bottom of the bar refills itself,
  // fast, and that the player can spend it. Nothing else in the pool makes
  // being nearly dead a place you can stay.
  lifeline: {
    name: 'LIFELINE',
    max: 1,
    theme: THEME.lifeline,
    effects: [['AT 25 HP OR BELOW:', NOTE], ['REGEN 5 HP/s', GOOD]],
    apply: (mods, n) => { mods.lifelineAt = 25; mods.lifelineRate = 5 * n; },
  },
  // BULWARK WITHOUT THE LEGS, and a much bigger number - what it charges is
  // every heal in the run, so the bar is twice as long and half as easy to
  // fill. A build with no healing in it pays nothing at all, which is the one
  // way this is a free pick and the reason it is worth checking the sheet.
  boneMarrow: {
    name: 'BONE MARROW',
    max: 1,
    theme: THEME.boneMarrow,
    effects: [['+100 MAX HEALTH', GOOD], ['-50% HEALING', BAD]],
    apply: (mods, n) => {
      mods.maxHpBonus += 100 * n;
      mods.healMult *= Math.pow(0.5, n);
    },
  },
  // ONE HEAL, AND IT IS THIS ONE. A point a second forever, and every other
  // source in the game - crates, Vampiric, Blood Pact, the item pool's four
  // heals, the leech - does nothing at all. It is the strongest slow heal there
  // is and it makes the entire health economy stop applying to you.
  healthyCore: {
    name: 'HEALTHY CORE',
    max: 1,
    theme: THEME.healthyCore,
    effects: [['REGEN 1 HP/s, ALWAYS', GOOD], ['NO OTHER HEALING WORKS', BAD]],
    apply: (mods, n) => { mods.coreRegen = 1 * n; mods.healBlock = n; },
  },
  // EVERY WAVE OPENS AT FIFTY, up OR down. It is a floor for a run that is
  // losing and a ceiling for one that is winning, and the healing bonus is what
  // decides which: fifty and a 1.5x heal is a hand back into the fight, and
  // fifty out of two hundred is a wave you have to earn back.
  emergencyRations: {
    name: 'EMERGENCY RATIONS',
    max: 1,
    theme: THEME.emergencyRations,
    effects: [['EVERY WAVE STARTS', NOTE], ['AT EXACTLY 50 HP', BAD], ['+50% HEALING', GOOD]],
    apply: (mods, n) => { mods.rations = 50; mods.healMult *= 1 + 0.5 * n; },
  },
  // THE TACTICAL RELOAD, PAID. One round left in the magazine is a thing the
  // player has to choose to stop at, which is the whole pick - it asks them to
  // count, and it pays them 5 HP every time they get it right.
  finalDose: {
    name: 'FINAL DOSE',
    max: 1,
    theme: THEME.finalDose,
    effects: [['RELOAD ON YOUR LAST ROUND:', NOTE], ['HEAL 5 HP', GOOD]],
    apply: (mods, n) => { mods.finalDose = 5 * n; },
  },
  // ACCURACY, BILLED BOTH WAYS. Hot Streak charges misses in damage; this
  // charges them in blood, and pays hits in it. Per SHOT, so a shotgun's nine
  // pellets are one hit or one miss - and it can never take the last point,
  // for the same reason Cursed Ammo cannot.
  aimOrBleed: {
    name: 'AIM OR BLEED',
    max: 1,
    theme: THEME.aimOrBleed,
    effects: [['HITS HEAL 1 HP', GOOD], ['MISSES COST 1 HP', BAD], ['NEVER BELOW 1 HP', NOTE]],
    apply: (mods, n) => { mods.aimHeal = 1 * n; mods.missCost = 1 * n; },
  },
  // NO-HIT BONUS AT WAVE SCALE, paid inside a wave instead of at the end of
  // one. Twenty bodies without being touched is one good stretch rather than
  // one perfect wave, so this pays a player who is playing well right now.
  killStreak: {
    name: 'KILL STREAK',
    max: 1,
    theme: THEME.killStreak,
    effects: [['20 KILLS UNHURT:', NOTE], ['HEAL 5 HP, +10 AMMO', GOOD]],
    apply: (mods, n) => { mods.killStreak = 20; mods.streakHeal = 5 * n; mods.streakAmmo = 10 * n; },
  },
  // The item slot, with a heal stapled to it. It is worth the most to the
  // cheapest item in the pool - a 40-point charge fired often is more healing
  // than a 90-point one fired twice a run - which is a nice inversion of how
  // every other item comparison in the game goes.
  vitalTrigger: {
    name: 'VITAL TRIGGER',
    max: 1,
    theme: THEME.vitalTrigger,
    effects: [['USING YOUR ITEM', NOTE], ['ALSO HEALS 5 HP', GOOD]],
    apply: (mods, n) => { mods.itemHeal = 5 * n; },
  },
  // THE BAR NEVER EMPTIES. Second Wind buys the rhythm back faster; this
  // deletes the rhythm, so sprinting and sliding stop being resources and
  // become the way the player moves.
  tireless: {
    name: 'TIRELESS',
    max: 1,
    theme: THEME.tireless,
    effects: [['UNLIMITED STAMINA', GOOD]],
    apply: (mods, n) => { mods.staminaDrain *= Math.pow(0, n); },
  },

  // ---- WHAT HAPPENS AROUND YOU --------------------------------------------

  // LITTLE BROTHER, INVOLUNTARILY. It is the item's own turret, thrown by
  // being hit rather than by a button, and the cap is what stops a bad wave
  // from filling the arena: five at once, ten seconds each.
  panicTurret: {
    name: 'PANIC TURRET',
    max: 1,
    theme: THEME.panicTurret,
    effects: [['BEING HIT DROPS A TURRET', GOOD], ['10s, UP TO 5 AT ONCE', NOTE]],
    apply: (mods, n) => { mods.panicTurret = n; mods.panicLife = 10; mods.panicMax = 5; },
  },
  // SPLASH DAMAGE, PAID FOR IN TIME. Every round sticks and does nothing for
  // two seconds, then goes off for what it was worth over a small area. It is
  // the whole gun turned into a grenade launcher: enormous against a crowd,
  // and genuinely bad against the one thing walking at you.
  delayedFuse: {
    name: 'DELAYED FUSE',
    max: 1,
    theme: THEME.delayedFuse,
    effects: [['SHOTS STICK, THEN EXPLODE', GOOD], ['AFTER 2 SECONDS', BAD]],
    apply: (mods, n) => { mods.fuseDelay = 2; mods.fuseRadius = 2.5 * n; },
  },
  // TERROR WITHOUT THE BULLET. Five metres is close enough that it only ever
  // answers the thing already on top of you, and the half-minute lockout is
  // what stops a fled enemy from walking back in and fleeing again forever.
  fearAura: {
    name: 'FEAR AURA',
    max: 1,
    theme: THEME.fearAura,
    effects: [['ENEMIES WITHIN 5m FLEE', GOOD], ['ONCE EVERY 30s EACH', NOTE]],
    apply: (mods, n) => {
      mods.fearAura = 5 * n;
      mods.fearAuraTime = 5;
      mods.fearAuraCd = 30;
    },
  },
  // WHATEVER IS ON YOU IS ON THEM. It is the only pick in either pool that
  // makes being burnt, poisoned or chilled into a thing worth having - a player
  // standing in the lava is now a lit fuse walking through the crowd.
  statusConduit: {
    name: 'STATUS CONDUIT',
    max: 1,
    theme: THEME.statusConduit,
    effects: [['STATUS EFFECTS ON YOU', NOTE], ['SPREAD TO ENEMIES', GOOD], ['WITHIN 5m', NOTE]],
    apply: (mods, n) => { mods.conduit = 5 * n; },
  },

  // ---- THE CRIT FAMILY, THREE MORE ----------------------------------------

  // THE PAUSE IS THE PICK. Two seconds off the trigger buys four certain
  // crits, which is a burst rather than a rate - it pays the player who taps
  // and takes cover and pays nothing at all to one holding the trigger down.
  trueStrike: {
    name: 'TRUE STRIKE',
    max: 1,
    theme: THEME.trueStrike,
    effects: [['+10% CRIT DAMAGE', GOOD], ['HOLD FIRE 2s:', NOTE], ['NEXT 4 SHOTS ALWAYS CRIT', GOOD]],
    apply: (mods, n) => {
      mods.critMult *= 1 + 0.1 * n;
      mods.trueStrikeWait = 2;
      mods.trueStrikeShots = 4 * n;
    },
  },
  // ONE CRIT LEANING ON THE NEXT. At the base 5% it is a small nudge; on top of
  // Deadeye and Marksman it is a chain that keeps itself going, which is the
  // only kind of scaling the crit family does not already have.
  domino: {
    name: 'DOMINO',
    max: 1,
    theme: THEME.domino,
    effects: [['AFTER A CRIT:', NOTE], ['+30% CRIT CHANCE', GOOD], ['ON THE NEXT SHOT', NOTE]],
    apply: (mods, n) => { mods.domino = 0.3 * n; },
  },
  // ONE BODY, HIT AND HIT AND HIT. It is Telltale's rhythm turned into a ramp
  // and it asks for the hardest thing in the game: staying on one target while
  // the room moves. Switching targets is what breaks it, not missing alone.
  luckyStreak: {
    name: 'LUCKY STREAK',
    max: 1,
    theme: THEME.luckyStreak,
    effects: [['+5% CRIT CHANCE PER HIT', GOOD], ['ON THE SAME ENEMY', NOTE], ['A MISS OR A SWITCH RESETS', BAD]],
    apply: (mods, n) => { mods.luckyStep = 0.05 * n; },
  },
  // ---- THE THIRD POOL ------------------------------------------------------
  //
  // Twenty-seven more max-1 picks, on the contract the two blocks above hold:
  // zero is "not owned" and every reader tests for it. What they have in common
  // as a GROUP is that most of them are questions about a thing the player is
  // DOING or a thing the run has ACCUMULATED - how high they are standing, how
  // much stamina is left, how many boxes they have bought, how long the boss
  // fight has run - rather than a flat number folded into the stat block. The
  // counters those questions need live on the Player (see reset()); only the
  // settings are here, where rebuildMods can replay them.

  // ---- the gun, and the moments it is better ------------------------------

  // THE ONE PICK THAT MAKES THE BUTT OF THE RIFLE A WEAPON. Melee is already
  // worth double at the kill (MELEE_KILL_MULT) and reaches four metres; four
  // times the damage is what turns "the thing you do when something is on top
  // of you" into a thing you walk toward something to do.
  //
  // THE TEN ROUNDS ARE WHAT PAY FOR THE WALK. They land on a HIT and not on a
  // kill - the swing that connected is the one that cost the player the
  // distance, and a swing that finished something off would pay a build that
  // was already winning. It is deliberately the same shape SCAVENGER has and
  // deliberately bigger per event, because a swing is one event every 0.6s and
  // a kill is whatever the wave is handing out.
  crowbar: {
    name: 'CROWBAR',
    max: 1,
    theme: THEME.crowbar,
    effects: [['MELEE DEALS 4x DAMAGE', GOOD], ['AND GRANTS 10 AMMO', GOOD], ['ON EVERY HIT', NOTE]],
    apply: (mods, n) => { mods.crowbar = 4 * n; mods.crowbarAmmo = 10 * n; },
  },
  // FATAL RESERVE'S SHAPE, IN RATE. The bottom of the magazine, read off the
  // count the TRIGGER saw rather than the live one for exactly the reason that
  // pick is - see Player.magAtShot and the note in _resolveHit. Fifteen is
  // most of a default magazine and all of a HOLLOW POINT one, which is the
  // point: what it rewards is shooting the magazine dry instead of topping up.
  harmWands: {
    name: 'HARM WANDS',
    max: 1,
    theme: THEME.harmWands,
    effects: [['THE LAST 15 ROUNDS OF', NOTE], ['EVERY MAGAZINE FIRE', NOTE], ['50% FASTER', GOOD]],
    apply: (mods, n) => { mods.harmWands = 15 * n; mods.harmWandsRate = 0.5 * n; },
  },
  // HEIGHT AS A STAT. Every generated arena has boxes, decks and catwalks in
  // it and nothing in either pool has ever paid for standing on one - the high
  // ground bought sightlines and cost cover, and that was the whole of it.
  // Read off the FEET being off the floor rather than off a named piece of
  // geometry, so a kerb counts, a crate counts and a stair counts.
  tightrope: {
    name: 'TIGHTROPE',
    max: 1,
    theme: THEME.tightrope,
    effects: [['+25% FIRE RATE', GOOD], ['WHILE OFF THE FLOOR', NOTE]],
    apply: (mods, n) => { mods.highRate = 0.25 * n; },
  },
  // THE RED END OF THE STAMINA BAR, WHICH NOTHING HAS EVER PAID FOR. It is the
  // one meter in the game a player only ever sees as a punishment - the lockout
  // that refuses the next sprint - and this makes the bottom of it the best the
  // gun ever is. The line is the LOCKOUT's own (see Player.staminaLow), so the
  // window the card describes is exactly the red the HUD draws.
  runningOnFumes: {
    name: 'RUNNING ON FUMES',
    max: 1,
    theme: THEME.runningOnFumes,
    effects: [['+100% DAMAGE', GOOD], ['+50% FIRE RATE', GOOD], ['WHILE STAMINA IS RED', NOTE]],
    apply: (mods, n) => { mods.fumesDamage = 1.0 * n; mods.fumesRate = 0.5 * n; },
  },

  // ---- the crit family, three more ----------------------------------------

  // CHEEKWELD'S TRADE, POINTED OUTWARD. That pick buys armour down the sights
  // and this buys crit, off the same `aiming` flag and for the same reason -
  // the player is paid for the DECISION, not for the weapon finishing its
  // raise. +25% on a 5% base is a sixfold crit rate for as long as the sights
  // are up, which is the largest single step the crit family has.
  ironLiturgy: {
    name: 'IRON LITURGY',
    max: 1,
    theme: THEME.ironLiturgy,
    effects: [['+25% CRIT CHANCE', GOOD], ['WHILE AIMING DOWN SIGHTS', NOTE]],
    apply: (mods, n) => { mods.aimCrit = 0.25 * n; },
  },
  // THE PITY TIMER, AND IT IS COUNTED IN SHOTS THAT LANDED. A trigger pull
  // that touched nothing is not a drought, it is a miss - counting those would
  // make the pick pay for shooting at a wall, which is the one thing in the
  // game that should never pay. Five is short enough to land twice a magazine
  // at the base crit rate and long enough that a DEADEYE build rarely reaches
  // it, so the pick is worth most to the run that has nothing else.
  //
  // FIVE TIMES, FLAT, and not five times critMult: it is a number the card
  // states outright, and a mega-crit that quietly got bigger with the rest of
  // the crit family would be the one line in the pool that cannot be checked.
  pityParty: {
    name: 'PITY PARTY',
    max: 1,
    theme: THEME.pityParty,
    effects: [['AFTER 5 NON-CRITS:', NOTE], ['A GUARANTEED 5x CRIT', GOOD]],
    apply: (mods, n) => { mods.pityAfter = 5; mods.pityMult = 5 * n; },
  },
  // A CRIT, PAID IN BLOOD. One point is almost nothing per crit and is the
  // whole pick over a magazine: a DEADEYE build crits a third of its shots, so
  // this is a health bar that fills while the trigger is held and nothing at
  // all to a build that never crits - which is the trade it is priced at.
  //
  // ONCE PER TRIGGER PULL, like every other question about a crit. A scattergun
  // landing nine pellets on one chest is one crit and one coin, not nine.
  redHarvest: {
    name: 'RED HARVEST',
    max: 1,
    theme: THEME.redHarvest,
    effects: [['CRITS HEAL 1 HP', GOOD], ['HALF THE TIME', NOTE]],
    apply: (mods, n) => { mods.critHealChance = 0.5 * n; mods.critHeal = 1; },
  },

  // ---- damage, and what it is measured against ----------------------------

  // BEING POISONED IS NOW SOMETHING TO WANT. It is STATUS CONDUIT's idea taken
  // one step further: that pick makes a status on the player into a weapon
  // against the room, and this makes it into the gun. Poison is the LONG
  // status - eight seconds, four a second - so the window is a real stretch of
  // a fight rather than a flash, and every theme with a poisoner in it becomes
  // a theme that arms you.
  feverDream: {
    name: 'FEVER DREAM',
    max: 1,
    theme: THEME.feverDream,
    effects: [['+100% DAMAGE', GOOD], ['WHILE YOU ARE POISONED', NOTE]],
    apply: (mods, n) => { mods.feverDream = 1.0 * n; },
  },
  // THE FIGHT THAT HAS GONE ON TOO LONG. Uncapped, and it is the only pick in
  // the pool that is - a boss fight ENDS, which is the ceiling, and a player
  // who has been at one for two minutes is a player the boss is winning
  // against. +2% every five seconds is 24% at a minute and 48% at two, so it
  // never decides a fight that was going well and always decides one that was
  // not.
  //
  // BOSSES ONLY. Read in _hitMult, which is the one place a hit knows what it
  // landed ON - see the note there.
  longHaul: {
    name: 'LONG HAUL',
    max: 1,
    theme: THEME.longHaul,
    effects: [['+2% DAMAGE TO A BOSS', GOOD], ['EVERY 5s OF THE FIGHT', NOTE], ['NO CEILING', GOOD]],
    apply: (mods, n) => { mods.longHaulStep = 0.02 * n; mods.longHaulEvery = 5; },
  },
  // THE ONE STATUS IN THE GAME THAT STACKS. Everything else refreshes - see
  // the note at the top of status.js - and this is the deliberate exception,
  // held to poison alone and to three deep, because poison is the status that
  // ticks half as often as fire and is meant to be the patient one. Three
  // stacks is fire's rate at three times fire's duration, which is what the
  // pick is worth and why it is only ever worth it to a build that poisons.
  secondaryInfection: {
    name: 'SECONDARY INFECTION',
    max: 1,
    theme: THEME.secondaryInfection,
    effects: [['POISON STACKS 3 DEEP', GOOD], ['ON THE SAME ENEMY', NOTE]],
    apply: (mods, n) => { mods.poisonStacks = 1 + 2 * n; },
  },
  // EVERY BODY IN THE ROOM, THINNER. It is the only pick that changes the
  // enemy rather than the player, which also makes it the only one whose value
  // never falls off: a fifth off every health bar is a fifth off wave 40's as
  // much as wave 4's, where a flat damage number is not.
  //
  // NOT BOSSES. A boss is a fight with a shape, and EXECUTIONER already sells
  // half a boss's health for a piece of the player's own bar - a pick that
  // handed over a fifth of it for nothing would make that one a worse version
  // of this.
  underfed: {
    name: 'UNDERFED',
    max: 1,
    theme: THEME.underfed,
    effects: [['ENEMIES HAVE', NOTE], ['20% LESS HEALTH', GOOD], ['NOT BOSSES', NOTE]],
    apply: (mods, n) => { mods.enemyHpMult *= Math.pow(0.8, n); },
  },

  // ---- staying alive ------------------------------------------------------

  // ARMOUR THAT ONLY EXISTS WHERE IT MATTERS. BERSERKER pays damage for a low
  // bar and this pays survival for it, and the two are meant to be found
  // together: the quarter of the bar that used to be the part a run died in is
  // the part it now fights hardest in.
  //
  // A HARD LINE AND NOT A RAMP, unlike BERSERKER - it is a place on the bar the
  // player can see themselves crossing, and a ramp would make the best moment
  // of the pick invisible.
  coldBlood: {
    name: 'COLD BLOOD',
    max: 1,
    theme: THEME.coldBlood,
    effects: [['-30% DAMAGE TAKEN', GOOD], ['BELOW 25% HEALTH', NOTE]],
    apply: (mods, n) => { mods.coldBloodAt = 0.25; mods.coldBloodCut = 0.3 * n; },
  },
  // THE RELOAD AS A SECOND VERB. Two health is small and the reload is the one
  // thing a player does dozens of times a wave, so over a fight it is a real
  // trickle - and it is gated at half the bar, so a run that is winning gets
  // nothing from it at all.
  //
  // ON THE MAGAZINE SEATING, not on the button. It rides the same one-frame
  // signal RELOAD BURST and HELLFIRE do, so a reload cancelled halfway pays
  // nothing.
  freshBandages: {
    name: 'FRESH BANDAGES',
    max: 1,
    theme: THEME.freshBandages,
    effects: [['RELOADING HEALS 2 HP', GOOD], ['AT HALF HEALTH OR BELOW', NOTE]],
    apply: (mods, n) => { mods.bandage = 2 * n; },
  },
  // THE LAST BODY OF A WAVE, ALWAYS GENEROUS. Three crates is most of a health
  // bar, and it arrives at the one moment in a wave when the player is
  // guaranteed to be able to walk to them - the room is empty and the shop has
  // not risen yet.
  //
  // IT IS NOT A DROP ROLL. rollDrop withholds health at a full bar for a good
  // reason (a plate that cannot be used is a plate that should not have been
  // rolled), and this deliberately ignores that: the wave-clear sweep collects
  // whatever is left anyway, and OVERDRAW and the crate's own +25 ceiling both
  // have something to do with it.
  curtainCall: {
    name: 'CURTAIN CALL',
    max: 1,
    theme: THEME.curtainCall,
    effects: [['THE LAST KILL OF A WAVE', NOTE], ['DROPS 3 HEALTH CRATES', GOOD]],
    apply: (mods, n) => { mods.curtainCall = 3 * n; },
  },
  // TWICE THE CRATE, PAID OUT OVER TWENTY SECONDS. Against NANOWEAVE (a rate
  // that runs forever out of combat) this is a POOL - a fixed amount owed,
  // draining at its own rate - which is what lets two crates stack honestly:
  // each one adds its fifty and its own 2.5 a second, so a player who walks
  // over two heals at five a second for twenty seconds rather than at 2.5 for
  // forty.
  //
  // THE TWENTY SECONDS ARE THE COST. Fifty health is enormous and none of it
  // is there on the frame the crate is taken, so a crate grabbed at 10 HP with
  // something still shooting does not save the run - it has to be taken BEFORE
  // it is needed, which is the one thing a health crate has never asked for.
  slowRelease: {
    name: 'SLOW RELEASE',
    max: 1,
    theme: THEME.slowRelease,
    effects: [['HEALTH CRATES HEAL 2x', GOOD], ['OVER 20 SECONDS', BAD]],
    apply: (mods, n) => { mods.slowRelease = 1 + n; mods.slowReleaseTime = 20; },
  },
  // ONE SHOT IN TWENTY HELPS. Kept clear of BLOOD TRANSFUSION, the active item
  // that spends the player's own bar to top the run up: this is not a
  // transfusion at all, it is a round that arrived and did the wrong thing.
  //
  // It is EVASION's shape - a die rolled on the way in - with the outcome
  // turned all the way round: a dodge is a hit that did not land, and this is
  // a hit that landed on your side. Twenty health is more than most single
  // blows in the game are worth, so the pick is a net gain against anything
  // that shoots and nothing at all against anything that swings.
  //
  // PROJECTILES ONLY, which is the whole shape of it. A rusher's fist reaches
  // the player through the ENEMY context and a bullet through the PROJECTILE
  // one (see _projCtx), so the pick asks the player to let the gunners shoot
  // at them and to stay off the rushers.
  strayMercy: {
    name: 'STRAY MERCY',
    max: 1,
    theme: THEME.strayMercy,
    effects: [['5% OF PROJECTILES', NOTE], ['HEAL YOU 20 HP', GOOD], ['INSTEAD OF HURTING', NOTE]],
    apply: (mods, n) => { mods.strayMercy = 0.05 * n; mods.strayMercyHeal = 20; },
  },
  // SCAR TISSUE OFF THE FLOOR INSTEAD OF OFF THE CLOCK. That pick banks max
  // health at a wave clear, which is a thing that happens TO a run; this banks
  // it off a crate, which is a thing the player walked to - so a run carrying
  // it collects health it does not need, and the bar itself is what the wave
  // paid out.
  //
  // ONE POINT AND NOT FIVE. It has no ceiling and no wave gate, so the number
  // has to be small enough that thirty crates is thirty health and not a
  // second run's worth of bar.
  gristle: {
    name: 'GRISTLE',
    max: 1,
    theme: THEME.gristle,
    effects: [['HEALTH CRATES HAVE A', NOTE], ['30% CHANCE OF +1 MAX HP', GOOD], ['PERMANENTLY', GOOD]],
    apply: (mods, n) => { mods.gristleChance = 0.3 * n; mods.gristleHp = 1; },
  },

  // ---- money, and what it buys that is not in the shop --------------------

  // CREDITS THAT EARN. The only pick in the pool that pays for NOT spending,
  // and it is deliberately paid at the wave END rather than per second: a rate
  // would make standing in the shop the best move in the game, and the wave
  // boundary is a thing the player cannot farm - it arrives when the room is
  // empty and not before.
  //
  // IT COMPOUNDS, as the word means: the interest is paid into the balance the
  // next wave's interest is measured against.
  highInterest: {
    name: 'HIGH INTEREST',
    max: 1,
    theme: THEME.highInterest,
    effects: [['BANKED CREDITS EARN', NOTE], ['20% INTEREST AT', NOTE], ['EVERY WAVE END', GOOD]],
    apply: (mods, n) => { mods.interest = 0.2 * n; },
  },
  // WAR CHEST'S OPPOSITE NUMBER. That pick pays for the money sitting in the
  // wallet and this pays for the money that has left it, so the two are the
  // two halves of an economy build and neither is worth much to a run that
  // does neither.
  //
  // PERMANENT AND UNCAPPED, because the thing it counts already is: a run
  // cannot un-spend money. A wave-40 run has bought perhaps a dozen boxes and
  // as many rerolls at a doubling price, which is +40% or so - real, and
  // nothing like the runaway CARNAGE is.
  paperTrail: {
    name: 'PAPER TRAIL',
    max: 1,
    theme: THEME.paperTrail,
    effects: [['+1% DAMAGE PER $1,000', GOOD], ['YOU HAVE EVER SPENT', NOTE], ['PERMANENTLY', GOOD]],
    apply: (mods, n) => { mods.paperTrail = 0.01 * n; },
  },
  // THE WALLET AS ARMOUR. Capped at 20% and it takes $10,000 to get there,
  // which is a shop's worth of savings deliberately not spent - so the pick is
  // a reason to walk past the box, and it is at its weakest on the wave after
  // one is bought. That swing is the whole of it.
  moneyBelt: {
    name: 'MONEY BELT',
    max: 1,
    theme: THEME.moneyBelt,
    effects: [['-1% DAMAGE TAKEN', GOOD], ['PER $500 HELD', NOTE], ['UP TO -20%', NOTE]],
    apply: (mods, n) => { mods.beltStep = 0.01 * n; mods.beltPer = 500; mods.beltCap = 0.2 * n; },
  },
  // TWICE AS MUCH, HALF AS LONG - and it is much less than half. An orb lies
  // on the floor for 20 seconds and a crate for 30; at a 70% cut those are six
  // and nine, which is barely longer than the fight that dropped them. The pick
  // is a reason to go INTO the room a wave was fought in rather than to sweep
  // it afterwards, and a player who hangs back loses more than the double ever
  // paid them.
  //
  // THE WAVE-CLEAR SWEEP IS NOT A LOOPHOLE. It collects what is left, but the
  // clock runs during the fight - so what the sweep finds is whatever survived
  // six seconds, which on a long wave is the last few kills and nothing else.
  fireSale: {
    name: 'FIRE SALE',
    max: 1,
    theme: THEME.fireSale,
    effects: [['ORBS AND PICKUPS', NOTE], ['ARE WORTH 2x', GOOD], ['AND DESPAWN 70% FASTER', BAD]],
    apply: (mods, n) => { mods.lootMult = 1 + n; mods.lootDespawn = Math.pow(0.3, n); },
  },
  // WHAT IS STILL ON THE FLOOR WHEN THE WAVE ENDS, IN ROUNDS. The sweep pays
  // the credits as it always did; this is paid on top of them, per orb, which
  // makes the pick a reason to STAY IN THE FIGHT rather than to break off and
  // tidy up after every kill.
  //
  // THE EXPLOIT IT IS PRICED AGAINST: hoard the floor, collect nothing, cash
  // in at the clear. It does not work, and the reason is ORB_LIFETIME - an orb
  // left for more than twenty seconds is gone, money and all, so a player
  // hoarding deliberately is burning credits for rounds at a rate nobody would
  // take. What is left at a clear is the orbs from the last twenty seconds of
  // the fight, which is what the pick is actually paying for.
  //
  // The reserve's own ceiling is the cap; there is no second one.
  movingDay: {
    name: 'MOVING DAY',
    max: 1,
    theme: THEME.movingDay,
    effects: [['AT EVERY WAVE END', NOTE], ['UNCOLLECTED ORBS BECOME', NOTE], ['5 AMMO EACH', GOOD]],
    apply: (mods, n) => { mods.movingDay = 5 * n; },
  },
  // THE BOX, BANKED. Every roll ever bought makes the item meter fill faster,
  // for the rest of the run - so the mystery box stops being a thing a run
  // visits and becomes a thing a run is built around, and the doubling price
  // at each shop is what keeps that from being free.
  //
  // IT IS THE RATE AND NOT THE CEILING, which is TWIN CELL's. A player holding
  // both banks two charges and fills them faster; neither pick does the other's
  // job.
  raffleTicket: {
    name: 'RAFFLE TICKET',
    max: 1,
    theme: THEME.raffleTicket,
    effects: [['EVERY MYSTERY BOX BOUGHT', NOTE], ['+5% ITEM CHARGE RATE', GOOD], ['PERMANENTLY', GOOD]],
    apply: (mods, n) => { mods.raffle = 0.05 * n; },
  },

  // ---- movement, and what a jump is worth ---------------------------------

  // HOLD THE BUTTON AND STOP FALLING. It is LEAD BALLOON's exact opposite and
  // DOUBLE JUMP's other half: that pick gives a second arc and this gives the
  // first one no end, for as long as the bar lasts.
  //
  // NOT PARTY BALLOONS' MACHINERY, and deliberately. That item lifts an ENEMY
  // off the floor and holds it there helpless - a scripted removal with a
  // ground snap at the end of it - where this is a verb the player is holding
  // down and steering with. The one is a state on a body; the other is a term
  // in the gravity line (see Player.update), which is the only place a float
  // can compose correctly with a dash, a jump and a ceiling at the same time.
  //
  // IT SPENDS THE SPRINT BAR, which is what stops it being flight: every
  // second in the air is a second of run the player does not have when they
  // land, and the lockout at the bottom applies to the float exactly as it
  // applies to the sprint.
  updraft: {
    name: 'UPDRAFT',
    max: 1,
    theme: THEME.updraft,
    effects: [['HOLD JUMP TO FLOAT', GOOD], ['IT SPENDS STAMINA', BAD]],
    apply: (mods, n) => { mods.float = n; mods.floatDrain = 26; mods.floatFall = 1.1; },
  },
  // ONE HOP IN A HUNDRED PAYS FOR EVERYTHING. A jump is the cheapest thing the
  // player does and the only verb in the game with no resource behind it, so
  // this is the one pick that rewards a habit rather than a decision - and at
  // 1% it lands perhaps twice a run, which is exactly often enough to be a
  // thing that HAPPENS rather than a thing that is farmed.
  //
  // THE GROUND JUMP ONLY. The air jump is edge-triggered off a charge and a
  // held key bunny-hops down a corridor at four hops a second; rolling on both
  // would make a DOUBLE JUMP build's odds twice a plain one's for no reason
  // anybody could read off the card.
  jackpot: {
    name: 'JACKPOT',
    max: 1,
    theme: THEME.jackpot,
    effects: [['GROUND JUMPS HAVE A 1%', NOTE], ['CHANCE OF FULL HP & AMMO', GOOD]],
    apply: (mods, n) => { mods.jackpot = 0.01 * n; },
  },
  // HELLFIRE, OFF THE SLIDE INSTEAD OF OFF THE RELOAD. Same patches, same
  // beat, same friendly creep - what changes is what lays them, and a slide is
  // a thing with a direction and an end, so the line it leaves is a wall drawn
  // across a room rather than a trail that follows the player around.
  //
  // A build holding both gets both; the patches are on one list with one cap,
  // because they are the same object and a slide through your own reload trail
  // should not evict it.
  scorchedEarth: {
    name: 'SCORCHED EARTH',
    max: 1,
    theme: THEME.scorchedEarth,
    effects: [['SLIDING LEAVES A', NOTE], ['TRAIL OF FIRE', GOOD], ['IT BURNS ENEMIES', NOTE]],
    apply: (mods, n) => { mods.slideFire = 0.5 * n; mods.slideFireRadius = 2.2; },
  },

  // ---- what happens around you --------------------------------------------

  // PANIC TURRET, BOUGHT WITH KILLS INSTEAD OF WITH BLOWS. That pick answers a
  // run that is losing and this one answers a run that is winning, which is why
  // they are the same gun at two different prices - ten bodies and ten seconds,
  // against one hit and ten seconds.
  //
  // IT IS THE ITEM'S OWN TURRET, unchanged: same class, same one-of-the-
  // player's-shots per round, same half-beat. Its own cap, counted over the
  // deployed list for the reason PANIC TURRET's is - a turret can be retired by
  // MAX_DEPLOYED's eviction or by its own clock, and a counter would have to be
  // decremented in both places.
  quorum: {
    name: 'QUORUM',
    max: 1,
    theme: THEME.quorum,
    effects: [['EVERY 10 KILLS SUMMONS', NOTE], ['A FREE SENTRY TURRET', GOOD], ['FOR 10s', NOTE]],
    apply: (mods, n) => { mods.quorumEvery = 10; mods.quorumLife = 10; mods.quorumMax = 3 * n; },
  },
};

export const UPGRADE_KEYS = Object.keys(UPGRADES);

/**
 * Rolls the three upgrades offered on a totem set.
 *
 * FLAT. Every upgrade in the pool has exactly the same chance of appearing.
 *
 * IT USED TO BE WEIGHTED, three ways: commons at 1, rares at 0.42 climbing to
 * 0.7 with the wave, cursed at 0.3, with rares locked out before wave 2 and
 * cursed before wave 3. Two things were wrong with that. The player could not
 * see it - the totem stopped printing a rarity line long ago, so the weight
 * was a number that changed what they were offered and was never once stated -
 * and the labels had stopped describing the pool anyway: nearly every passive
 * item added since the pool doubled was filed 'rare' or 'cursed' because that
 * is what a passive item felt like, which left 'common' meaning "one of the
 * nine stat multipliers" rather than "likely". A flat draw says the one thing
 * the totems have always actually promised: here are three of them, taken from
 * everything there is.
 *
 * Drawn WITHOUT REPLACEMENT, so one upgrade can never fill two totems of the
 * same set. Upgrades already at their stack cap drop out of the pool, which is
 * what stops a long run from offering a maxed common forever.
 *
 * @param {Object<string, number>} owned  stack count per upgrade id
 * @param {number} count how many totems to fill
 * @param {?Set<string>} seen  ids ALREADY OFFERED at this shop, excluded. A
 *   reroll is the player saying "not these"; showing one of them back is the
 *   console charging for the answer it already gave. Null on a fresh set.
 * @returns {string[]} upgrade ids. Shorter than `count` - possibly empty -
 *   once the pool runs dry, and the caller must cope with that.
 */
export function rollTotems(owned, count = 3, seen = null) {
  const open = [];
  for (const key of UPGRADE_KEYS) {
    if ((owned[key] || 0) >= UPGRADES[key].max) continue;
    open.push(key);
  }
  // THE EXCLUSION IS A PREFERENCE, NOT A GATE. If a shop has somehow shown
  // everything the player can still take, the next reroll offers the pool over
  // again rather than nothing: a set that fails to rise sinks the shop and
  // forfeits the pick, which is a run wedged by a rule that was only ever
  // meant to stop a reroll repeating itself. It takes about thirty rerolls at
  // one shop to get here and the thirtieth costs two thousand doubled
  // twenty-nine times, so nobody will - which is exactly why it must not be
  // the one path that breaks.
  let pool = seen ? open.filter((k) => !seen.has(k)) : open;
  if (!pool.length) pool = open.slice();

  // Fisher-Yates over the head of the list, which is a draw without
  // replacement and needs no weights to be one.
  const picked = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + ((Math.random() * (pool.length - i)) | 0);
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
    picked.push(pool[i]);
  }
  return picked;
}

// PRICES CLIMB WITH THE RUN. Both consoles beside the totems charge off a
// base that steps up every five waves, so a wallet that grows with the wave
// count is still spending a real fraction of it at wave 40. The step is per
// BLOCK of five and not per wave: the price a player learned at the start of a
// block is the price for the whole block, and it moves at the same boundary
// the boss waves fall on.
//
// @param {number} wave  the wave being shopped at (1-based)
// @param {number} base  the wave 1-5 price
// @param {number} step  what each further block of five adds
function blockPrice(wave, base, step) {
  const block = Math.floor(Math.max(0, (wave || 1) - 1) / 5);
  return base + step * block;
}

// $2,000 at waves 1-5, $2,500 at 6-10, and $500 a block after that.
export const REROLL_BASE = 2000;
export const REROLL_STEP = 500;

// Reroll price for the nth reroll of a single totem set (n starts at 0).
// Doubling is what stops credits from simply buying the best upgrade in the
// pool; the counter resets when a fresh set rises. The base it doubles from is
// the wave's, so the doubling and the block step compound.
export function rerollCost(n, wave = 1) {
  return blockPrice(wave, REROLL_BASE, REROLL_STEP) * Math.pow(2, n);
}

// $1,000 at waves 1-5, $1,500 at 6-10, and $500 a block after that. Half the
// reroll's opening price, because the box asks for the item SLOT as well as
// the money - a roll the player takes costs them whatever they were carrying.
export const BOX_BASE = 1000;
export const BOX_STEP = 500;

// WHAT ONE ROLL OF THE MYSTERY BOX COSTS, for the nth roll bought at a single
// shop (n starts at 0). It doubles on the same terms a reroll does, and for
// the same reason: standing at the box feeding it credits until it hands over
// the item you wanted is the shop answering a question you have already asked,
// and the second asking ought to cost more than the first. The counter is the
// box's own and resets when a fresh totem set rises - see TotemArea.boxRolls -
// so walking away and coming back next wave is what makes it cheap again.
//
// The base it doubles from is the wave's, so the doubling and the block step
// compound exactly as they do for rerolls.
export function boxCost(wave = 1, rolls = 0) {
  return blockPrice(wave, BOX_BASE, BOX_STEP) * Math.pow(2, rolls);
}

// $500 at waves 1-5, $600 at 6-10, and $100 a block after that. See
// blockPrice(): `cost` is a function of the wave, not a number, so every
// caller has to say which wave it is pricing for.
export const AMMO_BASE = 500;
export const AMMO_STEP = 100;

export const AMMO_PURCHASE = {
  name: 'AMMO',
  detail: '+90 ROUNDS',
  // A refill has to compete with a reroll for the same wallet, so it is
  // priced like one: several waves' earnings, not pocket change.
  cost: (wave = 1) => blockPrice(wave, AMMO_BASE, AMMO_STEP),
  enabled: (player) => player.reserveAmmo < player.maxReserve,
  apply: (player) => {
    player.reserveAmmo = Math.min(player.maxReserve, player.reserveAmmo + 90);
  },
};

