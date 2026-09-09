// STATUS EFFECTS ON THE PLAYER.
//
// The enemy has carried statuses since Venom and Incendiary shipped (see
// applyStatus in enemy.js and STATUS_ORDER in enemies/shared.js). This is the same idea pointed the
// other way: something in the arena does it to YOU, and it costs you damage,
// speed, or the trigger itself for a few seconds.
//
// ONE TABLE, THREE CONSUMERS. player.js reads the numbers, ui.js reads the
// icon and the colour, and whatever applies the effect names the key. Adding a
// seventh effect means an entry here, a drawing in tools/pixelart/icons.py, and
// nothing else: no branch in the HUD and no field on the player.
//
// THEY REFRESH, THEY DO NOT STACK - exactly as they do on an enemy. Two
// burning hits leave you burning for the longer of the two clocks at one
// rate, never at two. A stacking effect in a game that spawns thirty enemies
// a wave is not a status, it is a death sentence with extra steps, and the
// player cannot see it coming because the number is nowhere on screen.
//
// COLOURS ARE BORROWED, NOT INVENTED. Fire, poison, fear and the cold use the
// same four values enemies wear for the same four things (STATUS_TINT in
// enemies/shared.js), so orange means burning whoever is burning. Weakness and curse
// are new because no enemy carries them: weakness is a drained steel with
// almost no saturation - the one icon in the game that is deliberately dull -
// and curse takes the game's danger pink.

export const PLAYER_STATUS = {
  // The two damage-over-time effects are deliberately different SHAPES rather
  // than different numbers. Fire is short and fierce - it wants you to break
  // contact right now - and poison is long and shallow, a clock you can fight
  // through but not ignore. They come to nearly the same total, and they are
  // not the same problem.
  fire: {
    label: 'BURNING', icon: 'statusFire', color: 0xff7a18,
    duration: 5, dps: 7,
  },
  poison: {
    label: 'POISONED', icon: 'statusPoison', color: 0x39d353,
    duration: 8, dps: 4,
  },
  // SHORT. Two and a half seconds is already the longest a shooter can take
  // the gun away before it stops being tension and starts being a cutscene,
  // and everything else the player has - movement, dash, jump, melee, reload -
  // still works, so the window is something to survive rather than to watch.
  fear: {
    label: 'AFRAID', icon: 'statusFear', color: 0xb06bff,
    duration: 2.5,
  },
  weakness: {
    label: 'WEAKENED', icon: 'statusWeakness', color: 0xa6adbd,
    duration: 8, damageMult: 0.6,
  },
  curse: {
    label: 'CURSED', icon: 'statusCurse', color: 0xff2d6f,
    duration: 10, takenMult: 1.25,
  },
  // SLOWNESS IS COLD. It is the same effect it always was - one multiplier on
  // move speed - but everything the player can see of it says ice: the pale
  // blue enemies already wear for `slow`, a boot frozen into a block for the
  // chip, and frost on the floor where it comes from. That is not decoration.
  // A slow with no cause reads as the game stuttering; a slow that arrives
  // from a patch of ice you can SEE is a thing you chose to walk into, and the
  // player can answer it by going round.
  slowness: {
    label: 'CHILLED', icon: 'statusSlowness', color: 0x63b3ff,
    duration: 6, speedMult: 0.55,
  },
};

// Fixed order, so the chips never swap places on the HUD. A row whose icons
// reorder as effects come and go cannot be read at a glance - the player would
// have to find each icon again every time one expired.
export const PLAYER_STATUS_KEYS = Object.keys(PLAYER_STATUS);
