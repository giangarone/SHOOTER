import { defineActiveItem } from '../shared.js';

export const id = 'itemOrbitalDebris';

const ITEM_THEME = 0x9fd8ff;

// The ring's geometry. Module-level because tick() and use() both have to
// agree on every one of them and there is nothing else for them to drift
// against - the card's "8 seconds" lives below, in the definition itself.
const ORBIT_RADIUS = 2.4;
const ORBIT_SPEED = 3.6;       // rad/s - a blade passes any fixed point three times every two seconds
const ORBIT_HIT = 0.85;        // a blade's reach, before the enemy's own radius
const CUT_AGAIN = 0.45;        // seconds before the same body may be cut again

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'ORBITAL DEBRIS',
    charge: 30,
    theme: ITEM_THEME,
    // NOT A SHIELD AND NOT A BURST. A burst answers the crowd once; this
    // answers it for as long as it stands in arm's reach. The blades are for
    // the fight that is already ON TOP of the player - the rushers at the
    // boots, the thing that came round the corner - and they cut it for
    // staying there, which is the one lesson the player's own gun cannot
    // teach: it points somewhere.
    //
    // FOUR OF THE PLAYER'S OWN SHOTS PER CUT, snapshotted at the press on
    // LITTLE BROTHER's rule: the blades are built out of the gun the player
    // was holding, and a totem claimed mid-orbit is not something they
    // thought they were buying. The CUT cadence is the governor, not the
    // damage - the ring's own turn speed and a per-body cooldown, so one
    // enemy hugging the player takes the full figure twice a second while
    // the crowd around them takes it on the pass.
    effects: [['3 BLADES ORBIT YOU FOR 8s', GOOD], ['4x DAMAGE PER CUT', NOTE]],
    duration: 8,
    use: (game, s) => {
      const p = game.player;
      s.dmg = p.getEffectiveDamage(p.weapon.damage) * 4;
      s.angle = 0;
      // enemy -> the game clock at which it may be cut again. Keyed on the
      // body itself (BONESAW's rule), so the whole ledger dies with the
      // activation and nothing on Enemy has to know the ring exists.
      s.cool = new Map();
      s.blades = [];
      s.mats = [];
      s.geos = [];

      // Built per press and disposed in end() - the deploy.js contract,
      // because start() will run that end() over this exact scratch object
      // on a re-fire, and a ring that survived its own window would be a
      // second source of damage with no chip on the HUD.
      const shardGeo = new THREE.BoxGeometry(0.6, 0.05, 0.16);
      const edgeGeo = new THREE.BoxGeometry(0.62, 0.02, 0.06);
      s.geos.push(shardGeo, edgeGeo);
      const shardMat = new THREE.MeshStandardMaterial({
        color: 0xb9c6e0, roughness: 0.35, metalness: 0.85,
      });
      // The edge is the thing that cuts, so it is the only emissive part -
      // the same rule the turret's eye plays by: light where the danger is.
      const edgeMat = new THREE.MeshStandardMaterial({
        color: 0x9fd8ff, emissive: 0x9fd8ff, emissiveIntensity: 1.7,
        roughness: 0.25, metalness: 0.4,
      });
      s.mats.push(shardMat, edgeMat);
      for (let i = 0; i < 3; i++) {
        const grp = new THREE.Group();
        const shard = new THREE.Mesh(shardGeo, shardMat);
        shard.position.z = -0.05;
        const lip = new THREE.Mesh(edgeGeo, edgeMat);
        lip.position.z = 0.06;
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: game.effects.glowTex, color: 0x9fd8ff, transparent: true,
          opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        halo.scale.setScalar(0.95);
        s.mats.push(halo.material);
        grp.add(shard, lip, halo);
        game.scene.add(grp);
        s.blades.push(grp);
      }
      game.effects.shockwave(p.pos, ITEM_THEME, 7, 0.7);
      game.effects.burst(p.eyeInto(_v), 0x9fd8ff, 24, 5, 3, 0.6);
      game.sfx.itemArc();
    },
    tick: (game, s, dt) => {
      const p = game.player;
      s.angle += dt * ORBIT_SPEED;
      let landed = false;
      for (let i = 0; i < s.blades.length; i++) {
        const a = s.angle + (i / s.blades.length) * Math.PI * 2;
        const bx = p.pos.x + Math.cos(a) * ORBIT_RADIUS;
        const bz = p.pos.z + Math.sin(a) * ORBIT_RADIUS;
        const by = p.pos.y + 0.62;
        const blade = s.blades[i];
        blade.position.set(bx, by, bz);
        // The tumble is what sells it as DEBRIS rather than as a ring of
        // obedient drones.
        blade.rotation.y += dt * 9;
        blade.rotation.z = Math.sin(s.angle * 3 + i) * 0.12;
        for (const e of game.enemies) {
          if (e.dead) continue;
          if ((s.cool.get(e) || 0) > game.time) continue;
          // Reached on the floor like every reach in the game, and gated in
          // height so a flier five metres up is not "closing in".
          const dx = e.pos.x - bx;
          const dz = e.pos.z - bz;
          const reach = ORBIT_HIT + e.radius;
          if (dx * dx + dz * dz > reach * reach) continue;
          if (Math.abs((e.pos.y + 0.9) - by) > 1.35) continue;
          s.cool.set(e, game.time + CUT_AGAIN);
          // Cut AWAY from the player, not along the blade's own travel: the
          // ring is a fence, and what the knock direction adds to the number
          // is that whatever it cut keeps being out there.
          _v.set(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z);
          if (_v.lengthSq() > 1e-6) _v.normalize();
          game.hurtEnemy(e, s.dmg, _v);
          game.effects.impact(e.pos, 0x9fd8ff, 5, 3, 2, 0.22);
          landed = true;
        }
      }
      // One shared whoosh per frame the ring connected, however many blades
      // landed in it - the same rule the trigger's hitmarker follows.
      if (landed) game.sfx.melee();
    },
    end: (game, s) => {
      for (const b of s.blades) game.scene.remove(b);
      for (const g of s.geos) g.dispose();
      for (const m of s.mats) m.dispose();
      game.effects.shockwave(game.player.pos, ITEM_THEME, 3.5, 0.35);
    },
}));

export const icon = [
  // The hub, three blades and the bright arc of travel - the fence,
  // read from above.
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '......4.................',
  '.........223322.........',
  '.......2........2.......',
  '.....2...........433....',
  '....334..........331....',
  '....331...343...........',
  '...22.....333......22...',
  '....233...331......2....',
  '......33.........2......',
  '........334333..........',
  '.........231112.........',
  '.........221122.........',
  '.................4......',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
