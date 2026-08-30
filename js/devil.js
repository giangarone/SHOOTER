// The Devil, and the three deals standing in front of him.
//
// A second installation at the wave break, on the far side of the arena from
// the totems. Where a totem hands a mutation over for nothing, a deal charges
// MAX HEALTH for it - permanently, for the rest of the run. That is the whole
// feature: the only price in this game that cannot be earned back.
//
// WHEN HE APPEARS
//   Cleared the wave without being touched: always. Took damage: 15% (see
//   DEVIL_CHANCE_HURT in main.js). Demonic Presence buys the certainty.
//
// THE DEALS ARE TOTEMS
//   Deliberately, and this file allocates almost nothing of its own because of
//   it. A Totem already owns the rise, the arm delay, the touch-armed guard,
//   the orbiting icon, the canvas panel and the single invisible claim box -
//   all of which a deal needs and none of which should exist twice. What a
//   deal adds is a PRICE, and that is two optional fields on the offer
//   (`cost`, `enabled`) which totems.js draws and gates on. So a deal pillar
//   is a Totem at a different z with a black body and a red readout.
//
// A DEAL YOU CANNOT AFFORD IS INERT, NOT ABSENT
//   `enabled: false` greys the panel and makes canClaim() refuse, so an
//   unaffordable deal cannot be taken by touch or by a shot. That is the
//   guarantee that the Devil can never kill you, and it lives at the claim
//   site rather than at the payment site on purpose - by the time anything
//   asks Player.payMaxHp(), the answer is already known to be yes.
//
// THE DEVIL HIMSELF IS THE REROLL CONSOLE
//   There is no second Station. He stands behind the row with a red heart at
//   chest height: press E in range or put a round through the heart and the
//   set is redrawn for 2 max HP, doubling. The heart is the only part of him
//   that is a raycast target - the rest is scenery, so a shot that goes wide
//   of it is a miss rather than an accidental purchase.
//
// Same performance rules as totems.js and arena.js: no PointLights, built once
// at startup and reused for every set, canvases redrawn rather than
// reallocated, nothing ever disposed because nothing is ever discarded.

import * as THREE from 'three';
import { Totem, makePanel, hex, roundRect, SUNK_Y, ROW_Z } from './totems.js';

// The row sits opposite the totems across the player's spawn at z = 8, far
// enough that neither installation can be walked into while heading for the
// other. Checked against arena.js: clear of the speaker at (2, 5.5), the
// platform at (8, 8) and the truss towers at (0, 14) and (3, 14).
export const DEVIL_ROW_Z = -ROW_Z + 4.5; //  9.5
const DEAL_X = [-3.6, 0, 3.6];
// He stands behind the middle pillar, between it and the towers at the wall.
const DEVIL_Z = DEVIL_ROW_Z + 2.6;
// Press E this close to him. Slightly wider than a station's radius: he is a
// large object and standing at his feet should be enough.
export const DEVIL_RADIUS = 3.0;

const RISE_TIME = 0.7;

// One shared unit box for the whole figure, scaled per part - the same idiom
// arena.js uses for the venue. The horns are the one cone in the file.
const BOX = new THREE.BoxGeometry(1, 1, 1);
const HORN = new THREE.ConeGeometry(0.15, 0.8, 6);
// The heart's claim volume. Invisible but raycast, exactly like a totem's
// `hit` box - three.js raycasts geometry, not visibility.
const HEART_HIT_GEOM = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

// Near-black, so the silhouette reads as an absence rather than as a prop. The
// only colour on him is the heart and the eyes, which is what the eye goes to.
const SKIN = new THREE.MeshStandardMaterial({
  color: 0x05060a, emissive: 0x1a0208, emissiveIntensity: 0.6,
  roughness: 0.75, metalness: 0.35,
});
// The horns, which have to carry the read at distance: they are the one part
// of the outline that says devil rather than statue, and against a black room
// a black horn is no horn at all.
const HORN_MAT = new THREE.MeshStandardMaterial({
  color: 0x1a1016, emissive: 0x3a0512, emissiveIntensity: 0.8,
  roughness: 0.5, metalness: 0.5,
});
// The shoulder line. Barely a shade off the body on purpose - it exists to put
// ONE internal edge in the silhouette so the figure reads as a body rather
// than as a cabinet, and anything brighter became the thing the eye went to
// instead of the head above it.
const BONE = new THREE.MeshStandardMaterial({
  color: 0x0d0a10, emissive: 0x24040c, emissiveIntensity: 0.35,
  roughness: 0.6, metalness: 0.45,
});
const HEART_COLOR = 0xff1744;

function part(group, mat, x, y, z, w, h, d) {
  const m = new THREE.Mesh(BOX, mat);
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  group.add(m);
  return m;
}

// The figure. Scenery apart from the heart, which is the console.
class Devil {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, 0, DEVIL_Z);
    this.state = 'hidden'; // hidden | rising | up | sinking
    this.rise = 0;
    // Same reasoning as Station.shootCd: the guns here fire far faster than
    // anyone means to buy, and a reroll priced in health must never go off
    // eight times because a burst landed on the heart.
    this.shootCd = 0;

    this.group = new THREE.Group();
    this.group.position.set(0, SUNK_Y, DEVIL_Z);
    this.group.visible = false;

    // Tall and NARROW. The first pass was as wide as it was tall and read as a
    // cabinet with a light on it; a devil has to read as a figure at fifteen
    // metres, and the thing that makes a silhouette read as a body is being
    // taller than it is wide. He still overtops the player by half again -
    // anything at human scale next to a 2.4m pillar is a prop, not a host.
    part(this.group, SKIN, 0, 1.55, 0, 0.92, 1.7, 0.56).castShadow = true;
    part(this.group, SKIN, 0, 0.42, 0, 0.82, 0.9, 0.55);
    part(this.group, BONE, 0, 2.44, 0, 1.34, 0.22, 0.6);
    const head = part(this.group, SKIN, 0, 2.8, 0, 0.5, 0.54, 0.48);
    head.castShadow = true;

    // Arms, hanging, tight to the body. No animation on them - a still figure
    // that only breathes is more unsettling than one waving, and it costs
    // nothing per frame.
    part(this.group, SKIN, -0.68, 1.55, 0, 0.26, 1.5, 0.3);
    part(this.group, SKIN, 0.68, 1.55, 0, 0.26, 1.5, 0.3);

    // Horns and eyes. The eyes are the only lit parts besides the heart, and
    // small next to it, so the heart stays the thing you aim at.
    this.glowMat = new THREE.MeshStandardMaterial({
      color: HEART_COLOR, emissive: HEART_COLOR, emissiveIntensity: 1.2,
      roughness: 0.3, metalness: 0.4,
    });
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(HORN, HORN_MAT);
      horn.position.set(s * 0.2, 3.2, -0.02);
      horn.rotation.z = s * -0.46;
      this.group.add(horn);
      part(this.group, this.glowMat, s * 0.12, 2.84, 0.23, 0.09, 0.06, 0.05);
    }

    // THE HEART. Two lobes over a point, small enough to be a heart and not a
    // chest plate - the first pass was a 0.42m slab across the whole torso,
    // which read as armour with a light behind it. It is the console, so it
    // has to look like something you could put a round through.
    //
    // Its own material, so the beat below can drive it without dragging the
    // eyes along, and the only raycast target on the whole figure.
    this.heartMat = new THREE.MeshStandardMaterial({
      color: HEART_COLOR, emissive: HEART_COLOR, emissiveIntensity: 2.2,
      roughness: 0.25, metalness: 0.5,
    });
    const lobe = 0.19;
    part(this.group, this.heartMat, -0.09, 1.86, 0.3, lobe, lobe, 0.16);
    part(this.group, this.heartMat, 0.09, 1.86, 0.3, lobe, lobe, 0.16);
    // The point: one box turned on its corner under the lobes.
    this.heart = part(this.group, this.heartMat, 0, 1.75, 0.3, 0.2, 0.2, 0.16);
    this.heart.rotation.z = Math.PI / 4;

    this.hit = new THREE.Mesh(HEART_HIT_GEOM, HIT_MAT);
    this.hit.position.set(0, 1.82, 0.32);
    // How main.js tells a heart hit from an ordinary wall hit.
    this.hit.userData.devilHeart = this;
    this.group.add(this.hit);

    this.panel = makePanel(320, 160, 2.4, 1.2);
    this.panel.sprite.position.set(0, 4.05, 0);
    this.group.add(this.panel.sprite);

    scene.add(this.group);
  }

  // The reroll price, and whether it can currently be paid. Same two-state
  // label a Station draws, for the same reason: the player must be able to see
  // that a thing is unaffordable without walking into it to find out.
  setLabel(cost, enabled) {
    const c = this.panel.canvas.getContext('2d');
    c.clearRect(0, 0, 320, 160);
    c.fillStyle = 'rgba(8, 10, 16, 0.85)';
    roundRect(c, 4, 4, 312, 152, 10);
    c.fill();
    c.strokeStyle = hex(HEART_COLOR);
    c.lineWidth = 2;
    c.stroke();

    c.textAlign = 'center';
    c.globalAlpha = enabled ? 1 : 0.4;
    c.fillStyle = hex(HEART_COLOR);
    c.font = 'bold 32px system-ui, sans-serif';
    c.fillText('REROLL', 160, 58);
    c.fillStyle = enabled ? '#ffffff' : '#5b6785';
    c.font = 'bold 26px system-ui, sans-serif';
    c.fillText(cost + ' MAX HP', 160, 104);
    c.globalAlpha = 1;
    // The one line that has to be here rather than on a deal panel: the deals
    // say what they cost, and only this says what ENDS the break.
    c.fillStyle = '#5b6785';
    c.font = '600 17px system-ui, sans-serif';
    c.fillText('A TOTEM STARTS THE WAVE', 160, 138);
    this.panel.tex.needsUpdate = true;
  }

  show() {
    if (this.state === 'hidden') this.state = 'rising';
    this.group.visible = true;
  }
  sink() {
    if (this.state !== 'hidden') this.state = 'sinking';
  }
  isUp() {
    return this.state === 'up';
  }
  canShoot() {
    return this.state === 'up' && this.shootCd <= 0;
  }
  // Squared distance from the player, or -1 when out of E range - the contract
  // Totem.useDistance() and Station.useDistance() share.
  useDistance(playerPos) {
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const d2 = dx * dx + dz * dz;
    return d2 < DEVIL_RADIUS * DEVIL_RADIUS ? d2 : -1;
  }

  update(dt, time, playerPos) {
    if (this.shootCd > 0) this.shootCd -= dt;
    if (this.state === 'hidden') return;
    if (this.state === 'rising') {
      this.rise = Math.min(1, this.rise + dt / RISE_TIME);
      if (this.rise >= 1) this.state = 'up';
    } else if (this.state === 'sinking') {
      this.rise -= dt / RISE_TIME;
      if (this.rise <= 0) {
        this.rise = 0;
        this.state = 'hidden';
        this.group.visible = false;
        return;
      }
    }
    const e = 1 - Math.pow(1 - this.rise, 3);
    // A slow breath on top of the rise, so he is never quite still.
    this.group.position.y = SUNK_Y + (0 - SUNK_Y) * e + Math.sin(time * 0.9) * 0.05;
    // He turns to watch, yaw only. Tracking the player is the cheapest thing
    // in the file and does more for the read than any animation would.
    if (playerPos) {
      this.group.rotation.y = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    }
    // A heartbeat: two quick beats a cycle rather than a sine, because a sine
    // reads as a glowing prop and this has to read as something alive.
    const b = (time * 1.1) % 1;
    const beat = Math.exp(-18 * b) + 0.7 * Math.exp(-18 * Math.max(0, b - 0.22));
    this.heartMat.emissiveIntensity = 1.6 + beat * 2.4;
    this.glowMat.emissiveIntensity = 0.8 + beat * 0.7;
  }
}

// Owns the whole Devil installation. main.js holds exactly one, built at
// startup and reused for every set - the same contract TotemArea has, and the
// same method names, so main.js drives the two the same way.
export class DevilArea {
  constructor(scene) {
    this.deals = DEAL_X.map((x) => {
      const t = new Totem(x, scene, DEVIL_ROW_Z);
      // Re-tagged. A Totem tags its claim box `userData.totem`, and main.js's
      // shoot() reads that tag to decide what a pellet just bought - a deal
      // routed through _claimTotem() would be handed over free. The tag is the
      // only thing that separates the two, so it is swapped here rather than
      // adding a "which kind am I" field to Totem.
      t.hit.userData.totem = null;
      t.hit.userData.deal = t;
      return t;
    });
    this.devil = new Devil(scene);
    // Rerolls bought against the CURRENT set; reset every time one rises.
    this.rerolls = 0;
  }

  // True while any part of the installation is still standing.
  get active() {
    return this.devil.state !== 'hidden' || this.deals.some((d) => d.state !== 'hidden');
  }

  // True once a deal from the current set has been bought. Unlike a totem
  // claim this does NOT end the wave break - it just closes the shop.
  get claimed() {
    return this.deals.some((d) => d.claimed);
  }

  /**
   * Raises a fresh set of deals and the Devil with them.
   *
   * @param {object[]} offers  up to three offers from _buildDeals() in main.js,
   *   each carrying `cost` and `enabled` on top of the normal offer shape.
   * @param {boolean} resetRerolls  false when this IS a reroll, so the
   *   escalating price is not reset by the set it just paid for.
   */
  present(offers, resetRerolls = true) {
    if (resetRerolls) this.rerolls = 0;
    if (!offers.length) {
      this.dismiss();
      return;
    }
    this.deals.forEach((d, i) => {
      if (i < offers.length) d.present(offers[i]);
      else d.sink();
    });
    this.devil.show();
  }

  // Redraws the standing deals against a changed wallet. Called after a
  // purchase or a reroll, because paying in max HP changes what the REMAINING
  // deals cost you relative to what you have left - a set that was affordable
  // a second ago may not be now, and the pillars have to say so.
  refresh(canPay) {
    for (const d of this.deals) {
      if (d.state === 'hidden' || d.claimed || !d.offer) continue;
      d.setEnabled(canPay(d.offer.cost));
    }
  }

  dismiss() {
    for (const d of this.deals) d.sink();
    this.devil.sink();
  }

  // The NEAREST deal the player could press E on, with its squared distance,
  // or null. Same contract and same nearest-wins reasoning as
  // TotemArea.usable(), so main.js can rank both rows against each other.
  usable(playerPos) {
    let best = null;
    let bestD = Infinity;
    for (const d of this.deals) {
      if (!d.canUse()) continue;
      const dd = d.useDistance(playerPos);
      if (dd < 0 || dd >= bestD) continue;
      bestD = dd;
      best = d;
    }
    return best ? { target: best, d2: bestD } : null;
  }

  // The Devil, when the player is close enough to press E at him.
  heartInRange(playerPos) {
    const d = this.devil.isUp() ? this.devil.useDistance(playerPos) : -1;
    return d < 0 ? null : { target: this.devil, d2: d };
  }

  // Appends this set's shootable parts to a raycast target list: one invisible
  // box per standing pillar, plus the heart. The figure itself is not a target
  // - a shot that goes wide of the heart should be a miss, not a purchase.
  addTargets(out) {
    for (const d of this.deals) {
      if (d.state === 'hidden') continue;
      out.push(d.hit);
    }
    if (this.devil.state !== 'hidden') out.push(this.devil.hit);
  }

  update(dt, time, playerPos) {
    for (const d of this.deals) d.update(dt, time, playerPos);
    this.devil.update(dt, time, playerPos);
  }
}
