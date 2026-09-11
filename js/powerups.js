// Pickups: ammo crates and the four powerups.
//
// A pickup is a floating mesh plus an additive glow sprite. It is collected by
// proximity (no raycast) and despawns after PICKUP_LIFETIME.
//
// Adding a type means: an entry in POWERUP_TYPES with a per-kill `chance` and
// an `sfx` name that matches a method on SFX, and an `icon` naming a drawing in
// tools/pixelart/icons.py. `apply(player, time)` mutates the player directly;
// timed buffs set an end time that Player.update() watches for.
//
// PICKUPS ARE PIXEL ART. Each one is the same extruded 24x24 plate the totems
// wear, built once per type and cloned per instance so the geometry cache is
// hit exactly six times in a run. They face the player rather than spinning:
// a flat plate on a spin turns edge-on twice a revolution and disappears, and
// a pickup that vanishes for a third of every second in a firefight is worse
// than one with no animation at all.
//
// TWO RULES THAT COST A LOT WHEN BROKEN:
//   1. Never give a pickup a real light. three.js keys shader programs on the
//      scene's light count, so spawning one recompiles every material in the
//      scene. That is what the glow sprite is for.
//   2. Geometries and materials here are shared by every instance and are
//      never disposed. destroy() only removes objects from the scene. Calling
//      dispose() on them would break every other pickup of that type.

import * as THREE from 'three';
import { buildPixelIcon } from './pixelicons.js';
import { BOUND } from './arena.js';
import { groundSurface } from './utils.js';

export const POWERUP_TYPES = {
  health: {
    color: 0x00e676,
    emissive: 0x00e676,
    amount: 25,
    /**
     * THE ONE PICKUP THREE PASSIVE ITEMS ALL REACH FOR, and they are answered
     * here rather than in main.js for AMMO SURPLUS's reason: `amount` above is
     * what the pickup IS - it is what the drop's need-scaling and the HUD read
     * - and what a pick changes is what walking over one is WORTH.
     *
     * The order matters. FIRE SALE scales the crate first (it is a question
     * about the object), then SLOW RELEASE decides whether the result is paid
     * now or owed, and GRISTLE's coin is tossed last and independently of both
     * - it is a question about the crate having been PICKED UP, not about how
     * much of it landed.
     */
    apply: (player) => {
      const m = player.mods || {};
      // CRASH CART. A hundred instead of the crate's own twenty-five, and only
      // while the bar is at or under twenty points.
      //
      // FIRST, so everything below it treats the bigger number as though it had
      // always been the crate's: FIRE SALE doubles it, SLOW RELEASE owes it
      // over twenty seconds, GRISTLE tosses its coin. One crate, one payout,
      // whichever size the crate turned out to be.
      //
      // A FLOOR AND NOT A MULTIPLIER. It does not scale with the build, the
      // wave or healMult, which is what keeps it a rescue rather than a healing
      // strategy - and the line it is measured against is a number of POINTS
      // rather than a fraction of the bar, so the player can read which side of
      // it they are on straight off the HUD.
      const base = (m.crashCart > 0 && player.health <= m.crashCartAt) ? m.crashCart : 25;
      // FIRE SALE. Twice the crate, and the despawn that pays for it is on the
      // Powerup's own clock - see PICKUP_LIFETIME's use in update().
      const amount = base * (m.lootMult || 1);
      if (m.slowRelease > 1) {
        // SLOW RELEASE. Twice as much again, owed rather than paid. It does
        // NOT go through the +25 overheal ceiling below, and cannot: the pool
        // is drained a fraction of a point at a time through Player.heal, so
        // the cap it is measured against is whatever the bar is at on each of
        // those frames. An overheal that only exists on the frame the crate is
        // taken is not something a twenty-second drip can spend.
        player.addSlowHeal(amount * m.slowRelease);
      } else {
        // TWENTY-FIVE OVER THE CAP, which is the crate's own rule and the
        // reason it takes a `cap` at all - see Player.heal. Anything past even
        // that ceiling is OVERDRAW's, if the run owns it.
        player.heal(amount, player.maxHealth + 25);
      }
      // GRISTLE. One permanent point, three times in ten - see
      // Player.bankCrateHealth for why it has a bank of its own.
      player.bankCrateHealth();
      // PLASMA BAG. Ten points of shield on top of whatever the crate healed,
      // and the reason it is last is the reason GRISTLE's coin is: it is a
      // question about the crate having been PICKED UP, not about how much of
      // it landed. A player at full health walks over a crate for nothing today
      // - the plate is withheld at a full bar precisely because it would be a
      // drop that cannot be spent - and this is the pick that makes the walk
      // worth taking whatever the bar is at, because a shield point has no
      // ceiling to hit.
      //
      // ADDED, and the clock is cancelled, on SECOND SKIN's terms: a shield
      // counting down on a timer somebody else started is the one behaviour a
      // player could not predict, and taking the clock off is always the
      // reading in their favour.
      if (m.crateShield > 0) {
        player.shield += m.crateShield;
        player.shieldEnd = 0;
      }
    },
    chance: 0.04,
    needy: 0.04,
    icon: 'pickHealth',
    sfx: 'pickupHealth',
  },
  // RAGE. Damage AND movement, on one clock. The red pickup used to be the
  // only buff that changed nothing about how the player moved, which made it
  // the one you could take without changing how you played; +30% speed turns
  // it into a window to push into the crowd with rather than a number.
  damageBoost: {
    color: 0xff3d00,
    emissive: 0xff3d00,
    duration: 10,
    apply: (player, time) => {
      player.damageMult = 1.5;
      player.rageSpeedMult = 1.3;
      player.damageBoostEnd = time + 10;
      // What the HUD chip measures the countdown against - see the note on
      // damageBoostFull in player.js. The pickup is no longer the only thing
      // that can open this window.
      player.damageBoostFull = 10;
    },
    chance: 0.005,
    icon: 'pickDamage',
    sfx: 'pickupBuff',
  },
  fireRateBoost: {
    color: 0x2979ff,
    emissive: 0x2979ff,
    duration: 8,
    apply: (player, time) => {
      player.fireRateMult = 1.7;
      player.fireRateBoostEnd = time + 8;
      player.fireRateBoostFull = 8;
    },
    chance: 0.005,
    icon: 'pickRate',
    sfx: 'pickupBuff',
  },
  shield: {
    color: 0x4ef3ff,
    emissive: 0x4ef3ff,
    amount: 50,
    apply: (player, time) => {
      player.shield = 50;
      player.shieldEnd = time + 15;
    },
    chance: 0.005,
    icon: 'pickShield',
    sfx: 'pickupShield',
  },
  // MAGNET. Every money orb on the floor, at once, wherever it is - the same
  // sweep the end of a wave does, bought early. It has no duration and no
  // stat: it is a button that pays out, which is why it can afford to be
  // rarer than the buffs without ever feeling like a wasted drop.
  //
  // main.js handles the sweep itself (see _updatePickups): the orbs are not
  // the player's and apply() only ever gets the player.
  magnet: {
    color: 0xb14aed,
    emissive: 0xb14aed,
    chance: 0.005,
    icon: 'pickMagnet',
    apply: () => {},
    sfx: 'pickupMagnet',
  },
  // BATTERY. The active item's meter, filled to the top in one step.
  //
  // THE ONLY DROP IN THE GAME THAT PAYS OUT IN A CURRENCY THE PLAYER MIGHT NOT
  // OWN, which is why it is gated at the roll rather than made to do something
  // else for a player carrying nothing: a pickup whose payload depends on the
  // build is a pickup that has to be explained, and a battery on the floor of a
  // run with no item slot filled is a plate that means nothing. See rollDrop -
  // it is skipped outright unless there is a meter with room in it, exactly as
  // health is skipped on a full bar.
  //
  // FULL, not a fixed number of points. Every active item has its own cost and
  // a flat grant would be most of a Trauma Kit and a rounding error against
  // Brimstone; what the plate promises is a press, and it has to be worth one
  // whatever is in the slot. It fills the CEILING, so a player who has taken
  // TWIN CELL gets both charges - the ceiling is what that pick moves, and an
  // item that quietly paid out half as much to the build that widened the meter
  // would be punishing the pick.
  //
  // Routed through addItemCharge rather than written straight onto the field so
  // the ready chime and the HUD flash fire exactly as they do when the meter
  // fills the ordinary way.
  battery: {
    color: 0xffd54f,
    emissive: 0xffd54f,
    chance: 0.005,
    icon: 'pickBattery',
    apply: (player) => { player.addItemCharge(player.itemChargeMax); },
    sfx: 'pickupBuff',
  },
};

// Ammo is deliberately not in POWERUP_TYPES: it is not one of the buffs, and
// rollDrop gives it a need term and a cap of its own.
export const AMMO_PICKUP = {
  color: 0xffd600,
  emissive: 0xffd600,
  amount: 45,
  chance: 0.06,
  needy: 0.06,
  icon: 'pickAmmo',
  // AMMO SURPLUS. The multiplier is read off the player rather than baked into
  // `amount` above, because `amount` is what the pickup IS - it is read by the
  // drop's need-scaling and by the HUD's "+45 ROUNDS" - and a pickup that
  // changed its own advertised size when a totem was claimed would be a
  // different pickup. What the pick changes is what walking over one is worth.
  apply: (player) => {
    const m = player.mods;
    // AMMO SURPLUS and FIRE SALE, multiplying: one pick makes the crate fuller
    // and the other makes it worth double at the price of the clock, and a
    // build holding both has bought both.
    const got = Math.round(45 * (m ? m.ammoPickupMult * (m.lootMult || 1) : 1));
    player.reserveAmmo = Math.min(player.maxReserve, player.reserveAmmo + got);
  },
  sfx: 'pickupAmmo',
};

// How long a pickup sits in the arena before it fades out, in game seconds,
// and how many of those final seconds it spends blinking. The blink is the
// only warning the player gets, so it starts well before the pickup goes.
//
// Short, because pickups are DROPPED where enemies die rather than placed
// around the map: one lands next to the fight and is meant to be taken as part
// of it, not banked and walked back to three waves later.
export const PICKUP_LIFETIME = 30;
export const PICKUP_BLINK_TIME = 5;
// Blinks per second during that window. Fast enough to read as urgent from
// across the arena without strobing.
const BLINK_RATE = 5;

// How far the plate and its glow float above whatever the pickup is resting
// ON. Two numbers rather than one because the glow sits a little higher than
// the plate, which is what stops the sprite reading as a shadow under it.
const HOVER = 0.62;
const GLOW_HOVER = 0.7;

// WAVE-CLEAR ABSORPTION - see Powerup.absorb() below.
//
// The numbers are money.js's, deliberately. The sweep that pulls in the orbs
// pulls in the pickups on the same frame, and two different accelerations
// arriving side by side reads as one of them being broken. Accelerating the
// whole way in is what makes it snap into the player rather than drift after
// them, and steering from the direction every frame (rather than adding a
// force and letting momentum carry it) is what stops it overshooting and
// orbiting - the same note MoneyOrbs.update() carries at length.
const ABSORB_ACCEL = 90;
const ABSORB_MAX_SPEED = 42;
const ABSORB_ARRIVE = 0.7;
// Where on the player it lands: chest height, as the orbs do. Aiming at the
// feet would make the last metre of every pickup a dive into the floor.
const ABSORB_EYE = 0.9;
// Metres over which the plate closes down to its smallest.
//
// IT SHRINKS RATHER THAN FADING. The core and glow materials are shared by
// every pickup of a type (rule 2 at the top of this file), so opacity is not
// one instance's to touch - dimming this pickup would dim the rest. Scale is
// per-object, and reads as the thing being swallowed rather than as it
// politely disappearing, which is the better animation anyway.
const ABSORB_SHRINK = 3.5;
// What is left of the plate and the halo when they arrive. Not zero: a pickup
// that vanishes to nothing a frame before it lands looks like it timed out.
const ABSORB_MIN_CORE = 0.28;
const ABSORB_MIN_GLOW = 0.45;

// WHAT A KILL DROPS.
//
// There is no budget any more. A wave used to carry a fixed number of pickups
// (0.3 per enemy) spread across its kills, which made the loot per wave a
// constant and every kill's chance a function of how many enemies were left.
// That guaranteed two runs of the same wave the same amount of loot - a real
// property, and the reason it was built that way - but it also meant the drops
// arrived on a schedule, and a schedule is something a player learns to wait
// out rather than to be surprised by.
//
// So: every kill rolls each drop INDEPENDENTLY, at a flat chance, and nothing
// is remembered between kills. A wave can be dry and the next can be generous,
// which is the point.
//
// Health and ammo, and only those two, get a need term on top: `chance` is
// what they roll at on a full bar and `chance + needy` is what they roll at on
// an empty one, squared between the two so the pull is gentle at three
// quarters full and steep near empty. `needy` is held EQUAL to `chance`, so a
// bar on empty at most doubles the rate - the bailout is a nudge, not a
// different game being played by whoever is losing. The buffs never scale - a player who is
// doing badly gets more of what keeps them alive, not more damage.
//
// ONE DROP PER KILL AT MOST. The categories are rolled in need order and the
// first hit wins, so a kill can never carpet the floor, and the rarer buffs
// are never crowded out by a needy player's ammo roll being tested first -
// they are simply less likely than it, which is what the numbers say.

// The order categories are offered in. Need first: a starving player's ammo
// matters more than a shield they will not live to use.
const ROLL_ORDER = ['ammo', 'health', 'battery', 'damageBoost', 'fireRateBoost', 'magnet',
  'shield'];

// The need curve. `frac` is how full the bar is; the result is 0 at full and 1
// at empty, squared so it stays out of the way until things are actually bad.
function needScale(frac) {
  const lack = Math.max(0, 1 - frac);
  return lack * lack;
}

/**
 * Rolls one kill's drop.
 *
 * HEALTH IS WITHHELD AT A FULL BAR. The need curve already makes it rare up
 * there, but "rare" is not "never" and a health plate landing in front of a
 * player on full HP is a drop that cannot be used - it either times out or is
 * walked over for nothing. The need term reads the same fraction, so the two
 * agree: at hpFrac 1 the roll is skipped outright.
 *
 * ...UNLESS THE CRATE IS WORTH SOMETHING ANYWAY, which is exactly what PLASMA
 * BAG makes it. The gate above is not a rule about health, it is the rule that
 * a drop which cannot be SPENT should not be rolled - and a crate carrying ten
 * points of shield can be spent on a full bar, because a shield point has no
 * ceiling to hit. `crateShield` is the caller saying so.
 *
 * @param {number} hpFrac    health / maxHealth
 * @param {number} ammoFrac  (reserve + mag) / maxReserve
 * @param {boolean} wantBattery false when the player is carrying no active item
 *   or its meter is already at the ceiling. A battery plate is worth nothing in
 *   either case, and the same rule health holds at a full bar applies: a drop
 *   that cannot be spent is a drop that should not have been rolled.
 * @param {boolean} allowAmmo false when the arena already holds as much loose
 *   ammo as it should. An empty player killing a whole wave would otherwise
 *   carpet the floor in crates, all of one shape, most of them redundant by
 *   the time the second is collected.
 * @param {boolean} crateShield true when the build owns PLASMA BAG, which
 *   lifts the full-bar gate above. Defaults false, so every existing caller and
 *   every fixture keeps exactly the behaviour it had.
 * @returns {string|null} a spawnable type key, or null for nothing at all -
 *   which is what most kills return.
 */
export function rollDrop(hpFrac, ammoFrac, allowAmmo = true, luck = 1, wantBattery = true,
  crateShield = false) {
  for (const key of ROLL_ORDER) {
    if (key === 'ammo' && !allowAmmo) continue;
    if (key === 'health' && hpFrac >= 1 && !crateShield) continue;
    if (key === 'battery' && !wantBattery) continue;
    const def = key === 'ammo' ? AMMO_PICKUP : POWERUP_TYPES[key];
    let p = def.chance;
    if (def.needy) {
      p += def.needy * needScale(key === 'ammo' ? ammoFrac : hpFrac);
    }
    // RABBIT'S FOOT. A multiplier, applied AFTER the need term, so it lifts the
    // odds a desperate player already has by the same proportion it lifts a
    // healthy one's. A flat addition would have been worth several times more
    // to the player who needed it least, which is backwards for a luck charm.
    if (Math.random() < p * luck) return key;
  }
  return null;
}

/**
 * PINATA's drop: the same table, with the "nothing" outcome removed.
 *
 * PROPORTIONAL, NOT PRIORITISED. The obvious implementation is to roll the
 * ordinary table over and over until something comes back, and it gives the
 * wrong answer: rollDrop returns the FIRST category that hits, so re-rolling it
 * concentrates the result on whatever is offered earliest - ammo, always. This
 * picks one category with a probability proportional to its own chance, which
 * is the mix the table would produce over a hundred kills, delivered on one.
 *
 * IT KEEPS EVERY GATE. Health is still withheld at a full bar, ammo when the
 * floor already holds enough of it and a battery when there is no meter to
 * pour it into - so a guaranteed drop is guaranteed to be something the player
 * can use, which is the whole reason those gates exist. If every category is
 * gated out (a full player, a carpeted floor, no item) the guarantee cannot be
 * kept and this returns null: the caller keeps its count for the next kill
 * rather than spending it on a plate nobody wants.
 *
 * The arguments are rollDrop's, exactly, so the two can never drift.
 *
 * @returns {string|null}
 */
export function forcedDrop(hpFrac, ammoFrac, allowAmmo = true, luck = 1, wantBattery = true,
  crateShield = false) {
  let total = 0;
  for (const key of ROLL_ORDER) {
    if (key === 'ammo' && !allowAmmo) continue;
    if (key === 'health' && hpFrac >= 1 && !crateShield) continue;
    if (key === 'battery' && !wantBattery) continue;
    const def = key === 'ammo' ? AMMO_PICKUP : POWERUP_TYPES[key];
    total += def.chance + (def.needy ? def.needy * needScale(key === 'ammo' ? ammoFrac : hpFrac) : 0);
  }
  if (total <= 0) return null;
  // LUCK IS DELIBERATELY NOT READ. RABBIT'S FOOT lifts the odds that anything
  // drops at all, and here everything drops - a multiplier applied to every
  // weight in a normalised draw cancels itself out, so passing it would be a
  // parameter that provably does nothing.
  let r = Math.random() * total;
  for (const key of ROLL_ORDER) {
    if (key === 'ammo' && !allowAmmo) continue;
    if (key === 'health' && hpFrac >= 1 && !crateShield) continue;
    if (key === 'battery' && !wantBattery) continue;
    const def = key === 'ammo' ? AMMO_PICKUP : POWERUP_TYPES[key];
    r -= def.chance + (def.needy ? def.needy * needScale(key === 'ammo' ? ammoFrac : hpFrac) : 0);
    if (r <= 0) return key;
  }
  // Floating-point crumbs at the very end of the walk. The last eligible
  // category is the honest answer, and it is never null.
  for (let i = ROLL_ORDER.length - 1; i >= 0; i--) {
    const key = ROLL_ORDER[i];
    if (key === 'ammo' && !allowAmmo) continue;
    if (key === 'health' && hpFrac >= 1 && !crateShield) continue;
    if (key === 'battery' && !wantBattery) continue;
    return key;
  }
  return null;
}

/**
 * The chance a single kill drops anything at all, for tests and for tuning.
 * Exact rather than a sum: the categories are independent rolls, so this is
 * one minus the chance every one of them misses.
 */
export function dropChance(hpFrac, ammoFrac, allowAmmo = true, luck = 1, wantBattery = true,
  crateShield = false) {
  let miss = 1;
  for (const key of ROLL_ORDER) {
    if (key === 'ammo' && !allowAmmo) continue;
    if (key === 'health' && hpFrac >= 1 && !crateShield) continue;
    if (key === 'battery' && !wantBattery) continue;
    const def = key === 'ammo' ? AMMO_PICKUP : POWERUP_TYPES[key];
    let p = def.chance;
    if (def.needy) {
      p += def.needy * needScale(key === 'ammo' ? ammoFrac : hpFrac);
    }
    miss *= 1 - p * luck;
  }
  return 1 - miss;
}

// PIXEL PLATES. One extruded 24x24 icon per type, built once and cloned per
// pickup: pixelicons.js caches the geometry by key+colour, so six calls in a
// run cover every pickup the arena will ever hold, and a clone shares both the
// geometry and the material with its template. Nothing here is ever disposed -
// see rule 2 at the top of this file.
// The plate comes out of pixelicons.js at ~0.62m across (24 pixels at PX), so
// this is a fraction of a metre and not a pixel size - a pickup a little
// smaller than a totem's icon, which is what it should read as.
const ICON_SCALE = 0.85;
const iconTemplates = new Map();
function pickupIcon(typeKey, def) {
  let t = iconTemplates.get(typeKey);
  if (!t) {
    t = buildPixelIcon(def.icon, def.color);
    t.scale.setScalar(ICON_SCALE);
    iconTemplates.set(typeKey, t);
  }
  return t.clone();
}

const glowMats = new Map();
function glowMaterial(typeKey, def, glowTex) {
  let m = glowMats.get(typeKey);
  if (!m) {
    m = new THREE.SpriteMaterial({
      map: glowTex,
      color: def.color,
      transparent: true,
      // Softer than it used to be. The plate IS the pickup now, and a halo
      // bright enough to be the thing you see from across the room was also
      // bright enough to wash the drawing out from two metres away.
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    glowMats.set(typeKey, m);
  }
  return m;
}

// One pickup in the arena. main.js owns the list, calls update() each frame,
// and destroys it on pickup or despawn.
export class Powerup {
  /**
   * @param {number} time game time (the same clock passed to update), used for
   *   the despawn countdown. Mixing this with wall time makes pickups either
   *   despawn instantly or never at all.
   */
  constructor(typeKey, position, scene, glowTex, time, typeDef = null) {
    this.typeKey = typeKey;
    this.type = typeDef || POWERUP_TYPES[typeKey];
    this.pos = position.clone();
    this.scene = scene;
    this.spawnTime = time;
    this.despawnTime = PICKUP_LIFETIME;
    this.dead = false;
    this.bobOffset = Math.random() * Math.PI * 2;
    // Absorption state. `absorbing` takes the pickup out of main.js's live
    // list entirely, so nothing here has to guard the bob, the blink or the
    // proximity test against it.
    this.absorbing = false;
    this.homeDelay = 0;
    this.homeSpeed = 0;
    // WHAT IT IS RESTING ON. `pos.y` is the floor under the pickup, not a
    // height the pickup floats at - the plate and the glow add their own hover
    // and bob on top of it, and the collection test compares the player's FEET
    // against it.
    //
    // It used to be a flat zero for every pickup in the game, which is why an
    // enemy killed on a platform dropped its ammo INSIDE the platform: the
    // crate was at world zero, three metres under the floor the kill happened
    // on, unreachable and usually invisible. The caller resolves the surface
    // (see spawnDropAt) because only the caller knows which body died where.
    this.groundY = this.pos.y;
    // The flight's own height, tracked separately because the absorb arc leaves
    // the resting height behind entirely.
    this.flyY = this.groundY + HOVER;

    this.core = pickupIcon(typeKey, this.type);
    this.core.position.set(this.pos.x, this.groundY + HOVER, this.pos.z);
    scene.add(this.core);

    // An additive sprite instead of a PointLight: a real light would change the
    // scene's light count on every spawn/despawn, which forces three.js to
    // recompile every material in the scene and stalls the frame.
    this.glow = new THREE.Sprite(glowMaterial(typeKey, this.type, glowTex));
    this.glow.scale.setScalar(1.15);
    this.glow.position.set(this.pos.x, this.groundY + GLOW_HOVER, this.pos.z);
    scene.add(this.glow);
  }

  // Bob, face, and pulse. Sets `dead` when its lifetime runs out; main.js
  // removes dead pickups from its list on the same pass.
  //
  // `facing` is where the player is standing, so the plate can turn to them.
  update(dt, time, facing = null) {
    if (this.dead) return;

    const age = time - this.spawnTime;
    if (age >= this.despawnTime) {
      this.destroy();
      return;
    }

    // The last few seconds blink. Visibility is toggled rather than faded
    // because the core and glow materials are shared by every pickup of this
    // type - dimming one would dim all of them (see rule 2 at the top).
    const remaining = this.despawnTime - age;
    const on = remaining > PICKUP_BLINK_TIME || (remaining * BLINK_RATE) % 1 > 0.45;
    if (this.core.visible !== on) {
      this.core.visible = on;
      this.glow.visible = on;
    }

    const bob = Math.sin(time * 2 + this.bobOffset) * 0.15;
    this.core.position.y = this.groundY + HOVER + bob;
    // Turned to the player, not spun. A flat plate on a spin is edge-on twice
    // a revolution, and a pickup that disappears for a third of every second
    // in a firefight is worse than one that never moves at all. The tilt is
    // what stops it reading as a decal painted on the air.
    if (facing) {
      this.core.rotation.y = Math.atan2(facing.x - this.pos.x, facing.z - this.pos.z);
    }
    this.core.rotation.z = Math.sin(time * 1.6 + this.bobOffset) * 0.09;
    this.glow.position.y = this.groundY + GLOW_HOVER + bob;
    this.glow.scale.setScalar(1.15 + Math.sin(time * 5 + this.bobOffset) * 0.18);
  }

  // Proximity collection. Compares against the player's FEET position, so the
  // radius is generous enough to catch a player running over it.
  //
  // FLAT RADIUS PLUS A VERTICAL BAND, rather than one sphere. Now that a pickup
  // can be resting three metres up on a platform, a plain 3D distance would let
  // a player walking underneath collect it through the floor - and would also
  // refuse a crate the player is standing right on top of the moment the crate
  // is a little below their feet. The band is generous upward (a pickup on the
  // step above is still worth catching) and tight downward.
  tryPickup(playerPos) {
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    if (dx * dx + dz * dz >= 1.2 * 1.2) return false;
    const dy = playerPos.y - this.groundY;
    return dy > -1.2 && dy < 2.0;
  }

  // Dragged toward the player by the same magnet that collects money orbs -
  // see _magnetPickups in main.js. Every mesh has to be moved, not just `pos`:
  // the x and z of the plate and its glow are written once at construction
  // and only their y is touched per frame.
  moveTo(x, z, groundY = null) {
    this.pos.x = x;
    this.pos.z = z;
    this.core.position.x = x;
    this.core.position.z = z;
    this.glow.position.x = x;
    this.glow.position.z = z;
    // The magnet pulls a pickup TO the player, so it comes down off the
    // platform as it travels rather than sliding through the air at the height
    // it was dropped at. Eased rather than snapped: a crate that teleported
    // down a stairwell would read as a glitch.
    if (groundY !== null && groundY !== this.groundY) {
      this.groundY += (groundY - this.groundY) * 0.25;
      this.pos.y = this.groundY;
    }
  }

  /**
   * Starts the wave-clear flight into the player. From here on the pickup is
   * no longer a pickup: main.js has already banked its effect, has taken it
   * out of the live list, and only ticks updateAbsorb() until it arrives.
   *
   * @param {number} delay seconds to hold before it starts moving, so a room
   *   full of drops arrives as a stream rather than as one lump - exactly what
   *   MoneyOrbs.vacuum() spreads its orbs over, and for the same reason.
   */
  absorb(delay = 0) {
    this.absorbing = true;
    this.homeDelay = delay;
    this.homeSpeed = 0;
    this.flyY = this.core.position.y;
    // A pickup swept up during its despawn blink could be caught on an
    // invisible frame, and would then fly in as nothing at all.
    this.core.visible = true;
    this.glow.visible = true;
  }

  /**
   * One frame of that flight.
   *
   * @param {THREE.Vector3} target the player's FEET; ABSORB_EYE lifts it.
   * @returns {boolean} true once it has arrived and destroyed itself, at which
   *   point the caller drops it.
   */
  updateAbsorb(dt, target) {
    if (this.dead) return true;
    if (this.homeDelay > 0) {
      this.homeDelay -= dt;
      return false;
    }
    const dx = target.x - this.pos.x;
    const dy = (target.y + ABSORB_EYE) - this.flyY;
    const dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    this.homeSpeed = Math.min(ABSORB_MAX_SPEED, this.homeSpeed + ABSORB_ACCEL * dt);
    const step = this.homeSpeed * dt;
    // Swept, not tested on position alone: at this speed a machine running at
    // thirty frames moves a pickup well over a metre a step, which would
    // tunnel straight through the arrival radius and leave it circling.
    if (dist <= ABSORB_ARRIVE || step >= dist) {
      this.destroy();
      return true;
    }
    const k = step / dist;
    this.pos.x += dx * k;
    this.pos.z += dz * k;
    this.flyY += dy * k;
    const t = Math.min(1, dist / ABSORB_SHRINK);
    this.core.position.set(this.pos.x, this.flyY, this.pos.z);
    this.core.scale.setScalar(ICON_SCALE * (ABSORB_MIN_CORE + (1 - ABSORB_MIN_CORE) * t));
    // Kept turned to the player on the way in. A plate tumbling end over end
    // is edge-on half the time, which is the same reason it never spins while
    // it is lying on the floor.
    this.core.rotation.y = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    this.glow.position.set(this.pos.x, this.flyY, this.pos.z);
    this.glow.scale.setScalar(1.15 * (ABSORB_MIN_GLOW + (1 - ABSORB_MIN_GLOW) * t));
    return false;
  }

  // Removes from the scene only - see rule 2 at the top of this file.
  // Idempotent: pickup and despawn can both reach it.
  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.core);
    this.scene.remove(this.glow);
  }
}

// Pickups land anywhere on the floor rather than on the enemy spawn grid,
// which put them in the same nine clumps every wave. Two rules shape the roll:
//
//   1. Nothing inside CENTER_KEEPOUT of the origin. That disc is where the
//      totems and stations rise between waves, and a pickup sitting in it
//      either hides behind a pillar or gets collected by accident while the
//      player is reading a draft.
//   2. Nothing inside an obstacle. Boxes are grown by PICKUP_CLEARANCE so a
//      crate-hugging pickup is still reachable from outside the crate.
//
// Rejection sampling: the free area is most of the arena, so this lands on the
// first or second try in practice. The fallback ring exists only so the
// function can never return nothing.
const CENTER_KEEPOUT = 10;
const SPAWN_BOUND = BOUND - 2.5;
const PICKUP_CLEARANCE = 0.8;

function blocked(x, z, obstacles) {
  for (const b of obstacles) {
    if (
      x > b.min.x - PICKUP_CLEARANCE && x < b.max.x + PICKUP_CLEARANCE &&
      z > b.min.z - PICKUP_CLEARANCE && z < b.max.z + PICKUP_CLEARANCE
    ) return true;
  }
  return false;
}

function randomSpawnPos(arena) {
  const obstacles = arena.obstacles;
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() * 2 - 1) * SPAWN_BOUND;
    const z = (Math.random() * 2 - 1) * SPAWN_BOUND;
    if (x * x + z * z < CENTER_KEEPOUT * CENTER_KEEPOUT) continue;
    if (blocked(x, z, obstacles)) continue;
    return new THREE.Vector3(x, 0, z);
  }
  // Every sample was rejected - drop it on the keep-out ring instead, which is
  // open floor by construction.
  const a = Math.random() * Math.PI * 2;
  const r = CENTER_KEEPOUT + 1.5;
  return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
}

// A pickup left exactly where something died. The XZ comes from an enemy whose
// own collision has already pushed it clear of obstacles, so there is nothing to
// resolve there - it only needs clamping inside the arena bound in case the kill
// happened against a wall.
//
// THE HEIGHT DOES have to be resolved, and this is why the function takes the
// obstacle list. A body killed on a platform or halfway up a stair used to drop
// its crate at world zero - under the floor it died on, unreachable, and often
// not even visible. groundSurface() is the same query a ground enemy uses to
// find the tread it is standing on, asked from the dead body's own height, so
// the answer is the surface that body was ON and not the tallest thing that
// happens to share its footprint.
export function spawnDropAt(typeKey, pos, scene, glowTex, time, obstacles = null) {
  const B = SPAWN_BOUND;
  const at = new THREE.Vector3(
    Math.max(-B, Math.min(B, pos.x)), 0, Math.max(-B, Math.min(B, pos.z))
  );
  at.y = surfaceUnder(at, pos.y || 0, obstacles);
  return new Powerup(typeKey, at, scene, glowTex, time, defFor(typeKey));
}

// The walkable surface under a spawn point, or the floor when there is nothing
// to stand on. `fromY` is where the thing that dropped it was, which is what
// lets a stair be told apart from the platform above it - see groundSurface.
function surfaceUnder(at, fromY, obstacles) {
  if (!obstacles) return 0;
  // A generous step, because this is not a walk: the drop is allowed to settle
  // onto the tread it was killed on even when the body was mid-stride and its
  // feet were a little above it.
  return groundSurface({ x: at.x, y: fromY + 0.4, z: at.z }, PICKUP_CLEARANCE, obstacles, 1.2);
}

// The safety-net spawn. Placed in a ring around the player rather than
// anywhere on the map: it exists because the player is in trouble with no
// kills coming, and a health pack twenty metres away is no help at all. Close
// enough to reach under pressure, far enough that it still has to be walked to.
export function spawnRelief(typeKey, arena, near, scene, glowTex, time) {
  for (let i = 0; i < 30; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 6 + Math.random() * 5;
    const x = near.x + Math.cos(ang) * rad;
    const z = near.z + Math.sin(ang) * rad;
    if (Math.abs(x) > SPAWN_BOUND || Math.abs(z) > SPAWN_BOUND) continue;
    if (blocked(x, z, arena.obstacles)) continue;
    // `blocked` already rejected anything inside an obstacle footprint, so the
    // surface here is the floor - but the query is asked anyway rather than
    // assumed, because the relief net is the one spawner that aims at the
    // player and the player may well be standing on a platform.
    const at = new THREE.Vector3(x, 0, z);
    at.y = surfaceUnder(at, near.y || 0, arena.obstacles);
    return new Powerup(typeKey, at, scene, glowTex, time, defFor(typeKey));
  }
  // Nowhere clear nearby - fall back to open floor anywhere rather than
  // withholding the one pickup meant to stop a death spiral.
  return new Powerup(typeKey, randomSpawnPos(arena), scene, glowTex, time, defFor(typeKey));
}

/**
 * HEALTH & SEEK's spawn: a pickup on open floor ANYWHERE in the arena.
 *
 * The third spawner, and the only one with no reference point at all. A kill's
 * drop lands on the body and the relief net lands in a ring around the player,
 * because both of those are answers to something that just happened; this one
 * is the item saying "somewhere else", and somewhere else is the whole payload
 * - three plates at the player's feet would be a heal with extra steps.
 *
 * randomSpawnPos already refuses the middle of the arena and the inside of an
 * obstacle, and falls back to open floor when every sample is rejected, so
 * this can never fail to produce a pickup.
 *
 * @returns {Powerup}
 */
export function spawnAnywhere(typeKey, arena, scene, glowTex, time) {
  return new Powerup(typeKey, randomSpawnPos(arena), scene, glowTex, time, defFor(typeKey));
}

// Ammo lives outside POWERUP_TYPES (see the note on AMMO_PICKUP), so every
// spawner that takes a type key has to resolve it through here.
function defFor(typeKey) {
  return typeKey === 'ammo' ? AMMO_PICKUP : POWERUP_TYPES[typeKey];
}
