// THE THEMES, AND THE ORDER A RUN MEETS THEM IN.
//
// Pure data + maths: no three.js, no game state, no side effects - the same
// contract waves.js keeps, and for the same reason. waves.js asks this file
// which theme a wave belongs to and which type fills a role; nothing here ever
// asks anything back.
//
// WHY THIS EXISTS
//
// Waves used to draw their cast from one flat roster gated by a per-type
// unlock wave, so wave 14 was a chaser, a rime, a husk and a warden - four
// unrelated silhouettes with nothing to say to each other - and the boss
// rotation was fixed, so wave 5 was Colossus in every run that ever played.
//
// A run is now A BLOCK OF FIVE WAVES PER THEME. Each block is one theme: four
// waves of that theme's six enemies, then that theme's boss. The blocks are
// dealt in a random order, so one run opens on EMBER and the next on BRINE.
//
// WHAT RANDOM ORDER COSTS, AND WHO PAYS IT
//
// A type can no longer be balanced against the wave it appears on, because it
// has no wave any more - EMBER's rusher may be the first enemy of the run or
// the last thing before wave 45. Difficulty comes entirely from waves.js's
// per-wave multipliers, which are pure functions of the ABSOLUTE wave number
// and so scale a theme to wherever it landed for free.
//
// The price is that every theme's stat blocks must be normalised against every
// other theme's, role by role: every rusher interchangeable with every other
// rusher, every brute with every other brute. That is the same role-parity
// rule waves.js has always had, widened from six pools to the whole grid, and
// it is enforced in test/themes.mjs rather than by good intentions.
//
// ONE TYPE PER ROLE PER THEME. Not a list. A theme is six enemies and a boss,
// and which six is not a roll - the roll is which theme, and it happens once
// per block rather than once per slot.

// The six roles, in the order a block opens them up (see BREADTH in waves.js).
export const ROLE_KEYS = ['rusher', 'gunner', 'brute', 'artillery', 'support', 'flier'];

// THE TABLE IS AUTHORED COMPLETE AND FILLED IN OVER TIME.
//
// Every one of the slots below names its FINAL type, including the ones
// that do not exist yet. `resolveRole` falls back to RUST's type for any name
// with no entry in ENEMY_TYPES, so the whole rotation is playable from the
// first day and each theme quietly stops borrowing the moment its own enemies
// land. The alternative - a table that grows a theme at a time - would mean
// the schedule, the tests and the room theming all changing shape every time.
//
// `color` is the room's colour for that block: rig.js tints fixtures, beams
// and fog toward it, the way it already does for a boss.
export const THEMES = {
  // The original roster, kept together as one family rather than scattered.
  // It is the theme with no gimmick - it closes, it shoots, it soaks - which
  // is what makes it the yardstick every other theme's role parity is read
  // against.
  rust: {
    name: 'RUST',
    color: 0xb5651d,
    boss: 'colossus',
    roles: {
      rusher: 'chaser',
      gunner: 'shooter',
      brute: 'tank',
      artillery: 'bomber',
      support: 'conduit',
      flier: 'harrier',
    },
  },

  // Displacement. Nothing here damages you the ordinary way - it moves you, or
  // it takes your cover away.
  void: {
    name: 'VOID',
    color: 0x6f5bff,
    boss: 'maw',
    roles: {
      rusher: 'wraith',
      gunner: 'warp',
      brute: 'monolith',
      artillery: 'singularity',
      support: 'hexer',
      flier: 'shade',
    },
  },

  // Heat that is still working after the thing that dealt it is dead.
  ember: {
    name: 'EMBER',
    color: 0xff5a1f,
    boss: 'forge',
    roles: {
      rusher: 'cinder',
      gunner: 'flare',
      brute: 'magma',
      artillery: 'kiln',
      support: 'bellows',
      flier: 'ashwing',
    },
  },

  // Brittle cold. Everything here has a shell, and the shell is the mechanic.
  rime: {
    name: 'RIME',
    color: 0x63b3ff,
    boss: 'palecrown',
    roles: {
      rusher: 'rime',
      gunner: 'shard',
      brute: 'glacier',
      artillery: 'hailer',
      support: 'hoarfrost',
      flier: 'sleet',
    },
  },

  // Overgrowth. The theme that grows things where you are standing.
  verdant: {
    name: 'VERDANT',
    color: 0x8fbf4a,
    boss: 'overgrowth',
    roles: {
      rusher: 'thornling',
      gunner: 'sporegun',
      brute: 'bramblehide',
      artillery: 'blight',
      support: 'heartwood',
      flier: 'mothcap',
    },
  },

  // Stone. Slow, planted and heavily plated - the theme that answers aim
  // rather than movement.
  strata: {
    name: 'STRATA',
    color: 0x9aa5b1,
    boss: 'siege',
    roles: {
      rusher: 'scree',
      gunner: 'slinger',
      brute: 'bulwark',
      artillery: 'geode',
      support: 'warden',
      flier: 'gargoyle',
    },
  },

  // Charge. The one theme whose threats are about the space BETWEEN enemies.
  tempest: {
    name: 'TEMPEST',
    color: 0x4ef3ff,
    boss: 'conductor',
    roles: {
      rusher: 'arcling',
      gunner: 'coil',
      brute: 'dynamo',
      artillery: 'stormcaller',
      support: 'capacitor',
      flier: 'squall',
    },
  },

  // The deep. Everything here attaches, anchors or blinds - the theme that
  // takes away where you are rather than how much health you have.
  brine: {
    name: 'BRINE',
    color: 0x1f8a8a,
    boss: 'choir',
    roles: {
      rusher: 'gulper',
      gunner: 'angler',
      brute: 'barnacle',
      artillery: 'vent',
      support: 'howler',
      flier: 'drifter',
    },
  },

  // Rot. The theme that punishes killing things - every death here leaves
  // something behind.
  plague: {
    name: 'PLAGUE',
    color: 0xcc3d8a,
    boss: 'schism',
    roles: {
      rusher: 'splitter',
      gunner: 'lesion',
      brute: 'husk',
      artillery: 'vitriol',
      support: 'carrion',
      flier: 'bloatfly',
    },
  },

  // Radiance. The theme that attacks what the player can SEE and KNOW rather
  // than what they have left.
  solar: {
    name: 'SOLAR',
    color: 0xffd54f,
    boss: 'herald',
    roles: {
      rusher: 'zealot',
      gunner: 'sniper',
      brute: 'aegis',
      artillery: 'lens',
      support: 'halo',
      flier: 'shrike',
    },
  },

  // The swarm. No body in it is the threat on its own - the colony is - and
  // every one of its six is about what the OTHERS are doing: a drone that
  // runs with the cloud, a gunner that fires on the beat with every gunner
  // in the room, a support that feeds the wave's cooldowns. The theme that
  // spends ORGANIZATION, where EMBER spends floor and RIME spends the
  // player.
  hive: {
    name: 'HIVE',
    color: 0xffa000,
    boss: 'broodqueen',
    roles: {
      rusher: 'drone',
      gunner: 'spitter',
      brute: 'soldier',
      artillery: 'brooder',
      support: 'nurse',
      flier: 'wasp',
    },
  },
};

export const THEME_KEYS = Object.keys(THEMES);

// The theme every unbuilt slot borrows from until its own type exists. RUST,
// because RUST is the theme with no gimmick: a borrowed slot should read as
// plain rather than as a second theme leaking into this one.
export const FALLBACK_THEME = 'rust';

// mulberry32, the same generator terrain.js seeds its layouts with. It is
// COPIED rather than imported because terrain.js pulls in three.js, and this
// file's whole contract is that it does not.
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The themes in the order this run meets them, as a dealt DECK rather than
// independent draws: one full pass through the table plays each theme
// exactly once, so a run cannot see EMBER twice and never see RIME, and
// reaching the end of a pass means the same thing in every run.
//
// `cycle` is which pass through the deck this is, so past the pass the deck is
// reshuffled rather than repeated - a different order, still every theme once,
// still reproducible from the run's one seed.
export function themeOrder(seed, cycle = 0) {
  const rng = makeRng((seed | 0) ^ (cycle * 0x9e3779b1));
  const deck = THEME_KEYS.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = deck[i];
    deck[i] = deck[j];
    deck[j] = t;
  }
  return deck;
}

// Which of the five waves of its block wave n is: 1..4 are the theme, 5 is its
// boss.
export function blockPos(n) {
  return ((n - 1) % 5) + 1;
}

// Which block wave n falls in, counting from zero.
export function blockIndex(n) {
  return Math.floor((n - 1) / 5);
}

// Which pass through the deck wave n is on. Wave 51 starts cycle 1.
export function deckCycle(n) {
  return Math.floor(blockIndex(n) / THEME_KEYS.length);
}

// The theme key for wave n, given the run's seed. The deck is re-dealt for
// each cycle, so this stays a pure function of (seed, n) - there is no
// per-run state to keep in step and nothing to get out of sync with a reload.
export function themeForWave(seed, n, force = null) {
  // The debug override. A theme that can only be reached by rerolling the run
  // until the deck happens to put it at wave 1 is a theme nobody will test at
  // wave 1, and with ten of them being built one at a time that is most of
  // them most of the time.
  if (force && THEMES[force]) return force;
  const cycle = deckCycle(n);
  const deck = themeOrder(seed, cycle);
  return deck[blockIndex(n) % deck.length];
}

/**
 * The type filling `role` for `themeKey`, falling back to RUST's while that
 * theme's own enemy has not been built yet.
 *
 * `have` is a predicate - in practice `(k) => k in ENEMY_TYPES` - passed in
 * rather than imported, because importing ENEMY_TYPES here would drag three.js
 * into a file that is meant to be loadable by a test with no renderer.
 */
export function resolveRole(themeKey, role, have) {
  const theme = THEMES[themeKey] || THEMES[FALLBACK_THEME];
  const want = theme.roles[role];
  if (!have || have(want)) return want;
  return THEMES[FALLBACK_THEME].roles[role];
}

/**
 * The boss for `themeKey`, or a stand-in while that theme's own boss has not
 * been built yet.
 *
 * NOT the fallback theme's boss. Every theme borrowing one boss would make
 * every fifth wave of every run the same fight, which is the exact thing the
 * fixed rotation was replaced to stop - and it would stay that way for the
 * whole time the fights are being built. So a theme with no boss of its
 * own borrows from whichever bosses DO exist, chosen by its position in the
 * table: deterministic, and it spreads what is built as evenly as it can over
 * what is not.
 */
export function resolveBoss(themeKey, have) {
  const theme = THEMES[themeKey] || THEMES[FALLBACK_THEME];
  if (!have || have(theme.boss)) return theme.boss;
  const built = THEME_KEYS.map((k) => THEMES[k].boss).filter(have);
  if (!built.length) return theme.boss;
  return built[THEME_KEYS.indexOf(themeKey) % built.length];
}
