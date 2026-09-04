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
//   Add an entry here with a unique key, a `rarity` from RARITY, a `max` stack
//   count and an apply(), and draw its icon in tools/pixelart/icons.py under
//   THE SAME KEY. Entries do not name an icon: the key IS the icon key, which
//   is what makes "one shape per mutation" a fact about the data rather than a
//   rule a test has to police. `npm run test:icons` fails the moment a key here
//   has no drawing. If it needs a stat that does not exist yet, add the
//   field to DEFAULT_MODS in player.js and read it wherever it applies. If it
//   needs to react to an event (a kill, a hit taken) rather than change a
//   stat, add the mod field here and the hook in main.js.
//
//   Because upgrades are granted at random, every entry must be worth getting
//   unprompted. An upgrade that is only useful alongside one specific other
//   upgrade does not belong in this pool.

export const RARITY = {
  common: { label: 'COMMON', color: '#9fb4d8', weight: 1 },
  rare: { label: 'RARE', color: '#4ef3ff', weight: 0.42 },
  cursed: { label: 'CURSED', color: '#ff3d00', weight: 0.3 },
};

// THEME COLOURS. An upgrade's colour is what it DOES, not how rare it is, so
// the totem can be read before any text is: gold means ammo, orange means rate
// of fire, cyan means armour, and the mutations each wear the colour of the
// thing they inflict - green poison, orange fire, pale blue ice. The icons are
// drawn in one neutral ramp and tinted with this colour at build time, so a
// theme change here recolours the icon along with everything else.
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
  // status effects, matched to STATUS_TINT in enemy.js
  poison: 0x39d353,
  fire: 0xff5a00,
  ice: 0x7fe3ff,
  fear: 0x9d4edd,
  stone: 0x9aa5b1,
  // The eleven that came in from the old Devil row. They kept the colours they
  // were drawn in, because those already followed the rule above - Antidote is
  // green because it is about poison, Absolute Zero pale blue because it is
  // about ice - and they are folded into the families here rather than left in
  // a map of their own now that there is no second row to shade them apart
  // from. Two of them DID move: hellfire and gamble were drawn in the exact
  // values `damage` and `shrapnel` already hold, which the rule above forbids.
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
 * The effect lines to draw for a player who owns `owned` stacks of `def`.
 * A static array is used as-is - that is every max-1 mutation, which has no
 * tiers to compare. A function is a tiered readout; see step().
 */
export function effectLines(def, owned = 0) {
  return typeof def.effects === 'function' ? def.effects(owned) : def.effects;
}

export const UPGRADES = {
  overclock: {
    name: 'OVERCLOCK',
    rarity: 'common',
    max: 5,
    theme: THEME.rate,
    effects: (n) => [['FIRE RATE ' + step(n, pctUp(20)), GOOD]],
    apply: (mods, n) => { mods.fireRate *= 1 + 0.2 * n; },
  },
  extendedMag: {
    name: 'EXTENDED MAG',
    rarity: 'common',
    max: 3,
    theme: THEME.ammo,
    effects: (n) => [['MAGAZINE ' + step(n, pctUp(50)), GOOD]],
    apply: (mods, n) => { mods.magMult *= 1 + 0.5 * n; },
  },
  speedLoader: {
    name: 'SPEED LOADER',
    rarity: 'common',
    max: 3,
    theme: THEME.brass,
    effects: (n) => [['RELOAD ' + step(n, pctDown(0.7)), GOOD]],
    apply: (mods, n) => { mods.reloadMult *= Math.pow(0.7, n); },
  },
  hollowPoint: {
    name: 'HOLLOW POINT',
    rarity: 'common',
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
    rarity: 'common',
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
    rarity: 'common',
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
    rarity: 'common',
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
    rarity: 'common',
    max: 3,
    theme: THEME.lodestone,
    effects: (n) => [
      ['PICKUP RANGE ' + step(n, pctUp(50)), GOOD],
      ['MONEY COMES TO YOU', NOTE],
    ],
    // +50% a tier and not more, because the radius it multiplies is already
    // five metres: at the tier the arena is 44 across, and a mutation that
    // empties half the room from a standstill stops being a way of moving and
    // starts being a way of not having to.
    apply: (mods, n) => {
      mods.magnetMult = 1 + 0.5 * n;
    },
  },
  combatStims: {
    name: 'COMBAT STIMS',
    rarity: 'common',
    max: 2,
    theme: THEME.mobility,
    effects: (n) => [['MOVE SPEED ' + step(n, pctUp(30)), GOOD]],
    apply: (mods, n) => { mods.moveMult *= 1 + 0.30 * n; },
  },
  vampiric: {
    name: 'VAMPIRIC ROUNDS',
    rarity: 'rare',
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
    rarity: 'rare',
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
  bloodlust: {
    name: 'BLOODLUST',
    rarity: 'rare',
    max: 1,
    theme: THEME.frenzy,
    // A gun that starts worse and is bought back by the kill chain. Tied to
    // the COMBO rather than to a timer of its own: the run already has one
    // clock for "are you still killing", and a second one beside it would be
    // two bars saying almost the same thing.
    effects: [
      ['-25% FIRE RATE', BAD],
      ['+5% PER COMBO KILL', GOOD],
      ['10 KILLS, UP TO +50%', NOTE],
    ],
    apply: (mods, n) => {
      mods.fireRate *= Math.pow(0.75, n);
      mods.bloodlust = 0.05 * n;
      mods.bloodlustMax = 10;
    },
  },
  ammoFab: {
    name: 'AMMO FABRICATOR',
    rarity: 'rare',
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
    rarity: 'rare',
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
    rarity: 'common',
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
  // second read as almost nothing, and a mutation whose downside nobody can
  // name is not a trade.
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
    rarity: 'common',
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
    rarity: 'common',
    max: 1,
    theme: THEME.wind,
    effects: [['SPRINT TWICE AS LONG', GOOD], ['STAMINA BACK 2x FAST', GOOD]],
    apply: (mods, n) => {
      mods.staminaDrain *= Math.pow(0.5, n);
      mods.staminaRegen *= 1 + n;
    },
  },
  // ---- MUTATIONS ---------------------------------------------------------
  // Single-tier picks: max 1, no levels, one distinct behaviour each. Where
  // every upgrade above answers "how much", these answer "what happens" - the
  // player should be able to name what a mutation does from watching one shot
  // land, without reading the totem twice.
  //
  // The ones that afflict an enemy all have to SAY SO ON THE ENEMY. A status
  // the player cannot see is a stat increase with extra steps, so each drives
  // a body tint and a particle drip (see STATUS_TINT in enemy.js) and the
  // colours are held distinct from each other and from the hit flash.
  //
  // `mark: true` also puts a plate in the theme colour on the gun's receiver
  // (see setGunMarks in weapons.js). It belongs on upgrades that change what a
  // bullet DOES to what it hits - a status, a chain, a blast, a second shot -
  // and never on a stat change. Twelve plates fit; keep the marked set inside
  // that. Passive numbers like magazine size or reload speed stay unmarked, or
  // the readout stops meaning anything.
  venom: {
    mark: true,
    name: 'VENOM ROUNDS',
    rarity: 'rare',
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
    mark: true,
    name: 'INCENDIARY',
    rarity: 'rare',
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
    mark: true,
    name: 'CRYO ROUNDS',
    rarity: 'rare',
    max: 1,
    theme: THEME.ice,
    effects: [['HITS SLOW BY HALF', GOOD], ['THEIR SHOTS TOO, 3s', NOTE]],
    apply: (mods, n) => { mods.slowTime = 3 * n; },
  },
  terror: {
    mark: true,
    name: 'TERROR',
    rarity: 'rare',
    max: 1,
    theme: THEME.fear,
    effects: [['HIT ENEMIES FLEE', GOOD], ['2s, CANNOT ATTACK', NOTE]],
    apply: (mods, n) => { mods.fearTime = 2 * n; },
  },
  petrify: {
    mark: true,
    name: 'PETRIFY',
    rarity: 'rare',
    max: 1,
    theme: THEME.stone,
    effects: [['12% TO FREEZE 1.5s', GOOD], ['FROZEN TAKE +50%', GOOD]],
    apply: (mods, n) => {
      mods.petrifyChance = 0.12 * n;
      mods.petrifyTime = 1.5 * n;
    },
  },
  arcRounds: {
    mark: true,
    name: 'ARC ROUNDS',
    rarity: 'rare',
    max: 1,
    theme: THEME.electric,
    effects: [['CHAINS TO 1 ENEMY', GOOD], ['CHAIN HITS FOR 40%', NOTE]],
    apply: (mods, n) => {
      mods.chainDamage = 0.4 * n;
      mods.chainRange = 6;
    },
  },
  knockout: {
    mark: true,
    name: 'KNOCKOUT DROPS',
    rarity: 'rare',
    max: 1,
    theme: THEME.impact,
    effects: [['HITS SHOVE ENEMIES', GOOD], ['1.5 METRES BACK', NOTE]],
    apply: (mods, n) => { mods.knockback = 1.5 * n; },
  },
  midas: {
    name: 'MIDAS TOUCH',
    rarity: 'rare',
    max: 1,
    theme: THEME.gold,
    effects: [['2x CREDITS', GOOD], ['THE HIT TURN GOLD', NOTE]],
    apply: (mods, n) => {
      mods.creditMult *= 1 + n;
      mods.midas = 1;
    },
  },
  detonator: {
    mark: true,
    name: 'DETONATOR',
    rarity: 'cursed',
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
    mark: true,
    name: 'BLAST CORPSE',
    rarity: 'cursed',
    max: 1,
    theme: THEME.ember,
    effects: [['THE DEAD EXPLODE', GOOD], ['45 DMG IN 4m', NOTE], ['IT CAN HIT YOU', BAD]],
    apply: (mods, n) => {
      mods.corpseDamage = 45 * n;
      mods.corpseRadius = 4;
    },
  },
  twentyTwenty: {
    mark: true,
    name: 'TWENTY/TWENTY',
    rarity: 'rare',
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
  holyMantle: {
    name: 'HOLY MANTLE',
    rarity: 'rare',
    max: 1,
    theme: THEME.holy,
    effects: [['1st HIT EACH WAVE', GOOD], ['DEALS NO DAMAGE', NOTE]],
    apply: (mods, n) => { mods.wardPerWave = n; },
  },
  deadCat: {
    name: 'DEAD CAT',
    rarity: 'cursed',
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
    rarity: 'cursed',
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
    rarity: 'rare',
    max: 3,
    mark: true,
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
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.gravity,
    effects: [['HITS DRAG ENEMIES IN', GOOD], ['1.5m, WITHIN 5m', NOTE]],
    apply: (mods, n) => {
      mods.gravityPull = 1.5 * n;
      mods.gravityRadius = 5;
    },
  },
  berserker: {
    name: 'BERSERKER',
    rarity: 'rare',
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
    rarity: 'cursed',
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
    rarity: 'cursed',
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
    rarity: 'common',
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
    rarity: 'rare',
    max: 3,
    theme: THEME.evade,
    effects: (n) => [
      ['DODGE ' + step(n, pctUp(12)), GOOD],
      ['OF HITS TAKEN', NOTE],
      ['+40% SPEED ON DODGE', GOOD],
    ],
    apply: (mods, n) => { mods.dodgeChance = 0.12 * n; },
  },
  reloadBurst: {
    name: 'RELOAD BURST',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.shrapnel,
    effects: [['RELOAD THROWS 8', GOOD], ['SHARDS, 25 DMG EACH', NOTE], ['THEY CANNOT HURT YOU', NOTE]],
    apply: (mods, n) => {
      mods.reloadShards = 8 * n;
      mods.reloadShardDamage = 25 * n;
    },
  },
  crystallize: {
    name: 'CRYSTALLIZE',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.ice,
    effects: [['FROZEN DEAD SHATTER', GOOD], ['60 DMG IN 3.5m', NOTE]],
    apply: (mods, n) => {
      mods.shatterDamage = 60 * n;
      mods.shatterRadius = 3.5;
    },
  },
  ashen: {
    name: 'ASHEN',
    rarity: 'rare',
    max: 1,
    mark: true,
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
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.poison,
    // Slowing a poisoned enemy would have been Cryo Rounds with a different
    // name - Cryo already halves their speed and their shots. Spreading is the
    // thing only poison does.
    effects: [['POISON JUMPS ENEMY', GOOD], ['TO ENEMY, WITHIN 3m', NOTE]],
    apply: (mods, n) => { mods.poisonSpread = 3 * n; },
  },
  entropy: {
    name: 'ENTROPY',
    rarity: 'common',
    max: 1,
    mark: true,
    theme: THEME.stone,
    effects: [['STATUS NEVER ENDS', GOOD], ['ON ENEMIES UNDER 30%', NOTE]],
    apply: (mods, n) => { mods.entropyBelow = 0.3 * n; },
  },
  malady: {
    name: 'MALADY',
    rarity: 'rare',
    max: 1,
    mark: true,
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
    rarity: 'rare',
    max: 1,
    mark: true,
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
    rarity: 'rare',
    max: 1,
    mark: true,
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
    rarity: 'rare',
    max: 1,
    mark: true,
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
    rarity: 'rare',
    max: 1,
    mark: true,
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
    rarity: 'rare',
    max: 1,
    theme: THEME.hoard,
    // Unmarked: the receiver plates say what a BULLET does, and this changes
    // nothing about the bullet. It is the only upgrade that touches reserve
    // CAPACITY rather than reserve income, which is what makes it worth a slot
    // next to Scavenger and Ammo Fabricator instead of competing with them.
    effects: [['2x MAX AMMO RESERVE', GOOD], ['300 \u2192 600 ROUNDS', NOTE]],
    apply: (mods, n) => { mods.reserveMult = 1 + n; },
  },
  hotStreak: {
    name: 'HOT STREAK',
    rarity: 'rare',
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
    rarity: 'rare',
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
    rarity: 'rare',
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
    rarity: 'cursed',
    max: 1,
    theme: THEME.scar,
    effects: [['+2 MAX HP EVERY WAVE', GOOD], ['UP TO +80', NOTE], ['TAKE +25% DAMAGE', BAD]],
    apply: (mods, n) => {
      mods.hpPerWave = 2 * n;
      mods.hpBankCap = Math.max(mods.hpBankCap, 80 * n);
      mods.damageTakenMult *= 1 + 0.25 * n;
    },
  },
  // HEALTH BOUGHT WITH SIGHT. Bulwark sells max HP for speed; this sells it
  // for the range at which the room can be read at all, which is a much
  // stranger thing to own - the haze sits thicker than a boss wave's, so
  // enemy colour arrives late and a shot across the arena is taken on a shape.
  // Driven through rig.js, which owns the fog and breathes it with the music,
  // so this is one multiplier on the target rather than a second writer.
  blackout: {
    name: 'BLACKOUT',
    rarity: 'cursed',
    max: 1,
    theme: THEME.murk,
    effects: [['+55 MAX HEALTH', GOOD], ['THE HAZE CLOSES IN', BAD], ['YOU SEE MUCH LESS', BAD]],
    apply: (mods, n) => {
      mods.maxHpBonus += 55 * n;
      mods.fogMult *= 1 + 0.9 * n;
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
    rarity: 'rare',
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
    rarity: 'rare',
    max: 1,
    theme: THEME.entrench,
    effects: [['STAND STILL 3s:', NOTE], ['REGEN 3 HP/s', GOOD], ['ANY HIT RESETS IT', BAD]],
    apply: (mods, n) => {
      mods.plantRegen = 3 * n;
      mods.plantDelay = 3;
    },
  },
  // ---- THE OLD DEVIL DEALS ------------------------------------------------
  //
  // These eleven were sold, not given: a second row at the wave break charged
  // MAX HEALTH for them, permanently. That row is gone (it sells active items
  // now - see js/items.js), and they are ordinary mutations, rolled onto free
  // totems like everything above.
  //
  // WHAT CHANGED WHEN THE PRICE DID. A deal did not need a drawback, because
  // the price WAS the drawback and it was the same price for every build. Free,
  // each one has to weigh itself, so the rarity is assigned by whether it
  // already carried a real cost - `cursed` where it does, `rare` where the
  // effect stands on its own. Only EXECUTIONER still charges health, and it
  // charges it as a mod rather than as a payment: see mods.maxHpFlat.

  carnage: {
    name: 'CARNAGE',
    rarity: 'rare',
    max: 1,
    mark: true,
    theme: THEME.carnage,
    // Named CARNAGE and not Bloodlust because BLOODLUST is already in this map
    // above, paying fire rate for a combo. Two mutations with one name would be
    // unreadable on the build sheet.
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
    rarity: 'cursed',
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
    rarity: 'rare',
    max: 1,
    mark: true,
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
    rarity: 'cursed',
    max: 1,
    mark: true,
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
    rarity: 'cursed',
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
    rarity: 'rare',
    max: 1,
    mark: true,
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
    rarity: 'cursed',
    max: 1,
    theme: THEME.executioner,
    // THE ONE MUTATION THAT STILL COSTS MAX HEALTH. It was the most expensive
    // thing the Devil sold at 50, and it keeps that price now that nothing else
    // does - halving a boss is worth a permanent third of the bar, and without
    // the price it would be a free answer to the only fight in the game that is
    // meant to be a wall.
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
    rarity: 'rare',
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
    rarity: 'cursed',
    max: 1,
    mark: true,
    theme: THEME.gamble,
    // Rolled once per SHOT, not per pellet: a shotgun whose nine pellets each
    // rolled their own coin would average out to nothing, and the whole point
    // is that a shot is either a windfall or a waste.
    //
    // The name outlived the Devil. It is a coin toss with the odds barely in
    // your favour, which is what the phrase means - and renaming a mutation
    // players already know would cost more than the reference does.
    effects: [['51% OF SHOTS: 2x DMG', GOOD], ['49% OF SHOTS: HALF', BAD]],
    apply: (mods, n) => { mods.gamble = n; },
  },
  thorns: {
    name: 'THORNS',
    rarity: 'rare',
    max: 1,
    theme: THEME.thorns,
    effects: [['ATTACKERS TAKE BACK', NOTE], ['50% OF THEIR DAMAGE', GOOD]],
    apply: (mods, n) => { mods.thorns = 0.5 * n; },
  },
  darkPower: {
    name: 'DARK POWER',
    rarity: 'rare',
    max: 1,
    theme: THEME.power,
    // The plainest entry in the pool: damage, no drawback, no condition. It was
    // five max HP when the Devil sold it, and free it is still UNDER Hollow
    // Point - a common, at +30% a stack for a smaller magazine - so it needs no
    // rebalance to sit here. Not everything has to be a decision.
    effects: [['+20% DAMAGE', GOOD]],
    apply: (mods, n) => { mods.damage *= 1 + 0.2 * n; },
  },
};

export const UPGRADE_KEYS = Object.keys(UPGRADES);

// Rarity gate: keeps the first few picks as plain foundations, then opens up.
// Returns the roll weight for a rarity on a given wave, or 0 if it is not
// available yet.
function rarityWeight(rarity, wave) {
  if (rarity === 'rare' && wave < 2) return 0;
  if (rarity === 'cursed' && wave < 3) return 0;
  const base = RARITY[rarity].weight;
  // Rares get commoner as the run goes on; commons never fall out of the pool
  // because low-rarity stat stacking is what a build is made of. The ramp is
  // deliberately shallow and capped: the mutations are all rare or cursed, so
  // the rare half of the pool is now three times the size it was, and the old
  // +0.05 climb to 1.0 would have crowded stat stacking out of a long run
  // entirely rather than merely making it less certain.
  if (rarity === 'rare') return Math.min(0.7, base + wave * 0.02);
  return base;
}

/**
 * Rolls the three upgrades offered on a totem set.
 *
 * Drawn WITHOUT replacement, so one upgrade can never fill two totems of the
 * same set. Upgrades already at their stack cap drop out of the pool, which is
 * what stops a long run from offering a maxed common forever.
 *
 * @param {Object<string, number>} owned  stack count per upgrade id
 * @param {number} wave  the wave just cleared; gates rarity
 * @param {number} count how many totems to fill
 * @returns {string[]} upgrade ids. Shorter than `count` - possibly empty -
 *   once the pool runs dry, and the caller must cope with that.
 */
export function rollTotems(owned, wave, count = 3) {
  const pool = [];
  for (const key of UPGRADE_KEYS) {
    if ((owned[key] || 0) >= UPGRADES[key].max) continue;
    const w = rarityWeight(UPGRADES[key].rarity, wave);
    if (w > 0) pool.push([key, w]);
  }

  const picked = [];
  while (picked.length < count && pool.length) {
    let total = 0;
    for (const [, w] of pool) total += w;
    let r = Math.random() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i][1];
      if (r <= 0) { idx = i; break; }
    }
    picked.push(pool[idx][0]);
    pool.splice(idx, 1);
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

