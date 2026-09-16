// THEME COLOURS. A passive item's colour is what it DOES, not how rare it is, so
// the totem can be read before any text is: gold means ammo, orange means rate
// of fire, cyan means armour, and the passive items each wear the colour of
// the thing they inflict - green poison, orange fire, pale blue ice. The icons
// are drawn in one neutral ramp and tinted with this colour at build time, so
// a theme change here recolours the icon along with everything else.
//
// Entries are grouped into families and shaded apart inside one, so two
// passive items never share a colour outright: the family is what makes the palette
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
  // movement, and the one passive item that pays for the absence of it
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
  // ---- THE TWENTY-SEVEN THAT CAME IN WITH THE FOURTH POOL -------------------
  //
  // Same rule as every block above: the colour is what the pick DOES. Most of
  // them land in families that already existed - the armour cyans, the fire
  // oranges, the poison greens, the economy golds - and the two genuinely new
  // ones are the RHYTHM pair, which get the game's danger pinks because what
  // they do is put damage in the room on a clock the player does not control.
  //
  // the music, which nothing in the pool had ever paid for
  syncopation: 0xff33ee,     // the off-beat, striking on its own
  heartbeat: 0xff0066,       // the downbeat, felt in every body at once
  // the magazine, read as a number rather than as a supply
  oddCouple: 0x9ecbff,       // an odd count
  evenBetter: 0x5f9ee8,      // ...and its opposite, one shade down
  hotMag: 0xff7f2a,          // a full magazine, running hot
  pocketGrenade: 0xff5722,   // the round at the bottom of it, going off
  prodigalRounds: 0xc8b560,  // the shot that missed, come home
  fullLoad: 0xffc266,        // the reserve, filled at every clear
  // ---- THE TWENTY-SEVEN THAT CAME IN WITH THE SIXTH POOL --------------------
  //
  // Same rule as every block above: the colour is what the pick DOES. A dozen
  // of these are plain numbers a family already owns - damage reds, rate
  // oranges, economy golds, vitality greens - and they sit beside whichever
  // family already paid that number. The genuinely new hues are the ones for
  // picks that do a thing no earlier pick did.
  //
  // the magazine and its reload
  magnaCarta: 0xc9b037,      // Magna Carta: the economy golds, gone constitutional
  fatHandgun: 0xffc773,      // Fat Handgun: brass, but fatter
  slideRule: 0x9fc5e8,      // Slide Rule: the mobility blues, in calculator grey
  // movement
  fastLane: 0x29b6f6,      // Fast Lane: the mobility blues, at speed
  bicycleKick: 0x81d4fa,    // Bicycle Kick: `leap`'s pale blue, airborne
  stiltLegs: 0x6b4f3a,      // Stilt Legs: the entrench browns, on legs
  // damage, and what it is measured against
  softPoints: 0xffca8a,      // Soft Points: a pale salvo orange, for the slowed
  tenderizer: 0xbb3f20,      // Tenderizer: the damage reds, at full health
  lateFee: 0xa1442e,        // Late Fee: `longHaul`'s family, long-distance red
  killSwitch: 0xbf2b2b,      // Kill Switch: damage red, plain
  armature: 0xe86a17,        // Armature: `overkill`'s shade, banked
  stigmata: 0xd33682,        // Stigmata: the crit magentas, for the near miss
  skipstone: 0x4dd0e1,      // Skipstone: `gravity`'s blues, off the floor
  rearview: 0xff9e80,      // Rearview: `salvo` thrown backwards
  // rate of fire
  wolfPack: 0xffa040,        // Wolf Pack: the rate oranges, per body alive
  monsoon: 0x00796b,       // Monsoon: a storm teal the rate family does not own
  amphetamines: 0xef6c00,    // Amphetamines: the rate oranges, straight
  // staying alive, and what a crate is worth
  secondHelpings: 0xffe0b2,  // Second Helpings: the economy oranges, refilled
  platedDessert: 0xe6b03a,   // Plated Dessert: gold, plated
  soupKitchen: 0x81c784,   // Soup Kitchen: vitality, served with ammo
  glancingBlow: 0xb2ebf2,   // Glancing Blow: `ceramic`'s pale armour, brushed
  thinBlood: 0xe57373,       // Thin Blood: `blood`'s red, watered down
  soulHarvest: 0xab47bc,   // Soul Harvest: `holy`'s violet, for what a kill banks
  fleshBank: 0x689f38,      // Flesh Bank: `boneMarrow`'s green, banked
  // the one that rolls the build
  shuffle: 0x9575cd,        // Shuffle: the mystery box's own violet, shuffled
  // the contract
  deathClause: 0x5e35b1,    // Death Clause: `hex`'s violet, signed

  // ---- THE FIVE THAT CAME IN WITH THE FIFTH POOL ----------------------------
  //
  // Same rule as every block above: the colour is what the pick DOES. Two of
  // these take a VERB away rather than a number, and they are deliberately the
  // two heaviest shades in the set - LEAD BALLOON's brown for the legs that
  // stopped working, and BLACKOUT's murk for the pickups that never appear.
  deskJob: 0x996242,         // the chair, a deeper brown than the entrench family
  pureHeart: 0xa5d6ff,       // a clean bar, in the pale end of `vitality`
  possum: 0x616a70,          // playing dead, in `stone`'s grey family
  deathStare: 0xb06bff,      // the attacker, stopped, in `fear`'s violet
  southpaw: 0x7fd8c8,        // the off hand, a shade off `zero`'s ice
  // the butt of the rifle, three ways
  longArm: 0xa9744f,         // reach, in CROWBAR's own brown
  scythe: 0x7f8fa6,          // the sweep
  throatCut: 0x97233f,       // and the finish
  // the shield, which now has a bar of its own to be read on
  ballastTanks: 0x2ab7d6,    // fifty of it, every wave
  plasmaBag: 0x5fd6c2,       // ten more, off a crate
  // staying alive
  flowReload: 0x2bb3c9,      // a second nothing can reach you in
  bellows: 0x84b6c4,         // a full bar of air
  sterileField: 0xdff5ea,    // everything on you, washed off
  crashCart: 0xff4d6d,       // a hundred, and only at the bottom
  // what your shots carry
  bedbugs: 0x6b3f2a,         // the second bite
  splashback: 0x8e6fd8,      // your own affliction, pointed outward
  // the turrets, which were a single item and are now a family
  sharedMag: 0xffcf40,       // your reserve, in its drum
  venomgrid: 0x4caf50,       // ...poisoned
  hellspitter: 0xd1440f,     // ...alight
  // the floor, and what is lying on it
  vintageOrbs: 0xd9c26b,     // money that ages well
  firstFruits: 0x9ccc65,     // the first three bodies of a wave
  coldFoot: 0xa8e0ff,        // ice behind a run
  // the item slot
  jumperCables: 0xd6e000,    // charge off a hit taken
  dimeNovel: 0xe8a0c8,       // crit off a button pressed
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
// A stacking passive item writes `effects` as a function of the stack count the
// player already owns instead of a fixed array, so the line can name the tier
// they are on and the one the pick moves them to. See step() below.
export const GOOD = 1;
export const BAD = -1;
export const NOTE = 0;

// TIERED READOUTS. A stacking passive item's totem shows what THIS pick changes,
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


const PASSIVE_ITEM_CONTEXT = Object.freeze({
  THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs,
});

export function definePassiveItem(build) {
  return build(PASSIVE_ITEM_CONTEXT);
}
