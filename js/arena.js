// Static level geometry and lighting. Built once at startup and never
// modified - nothing here is per-frame. The animated rave lighting that plays
// over all of this lives in rig.js; what is here is the venue itself.
//
// buildArena() returns:
//   group       the parent Object3D holding all level meshes
//   obstacles   AABBs for collision (utils.js). Only solid, standable things
//               are listed; decorative trims and edges are not.
//   meshList    raycast targets for shooting. Enemy hitboxes are appended to
//               this list per shot in main.js.
//   spawnPoints where enemies and pickups appear, jittered by the caller.
//   rig         the fixtures, trusses and lights rig.js animates
//
// IMPORTANT: the light count here is fixed and must stay that way. three.js
// keys its shader programs on the number of lights, so adding or removing one
// at runtime recompiles every material in the scene and stalls the frame.
// That is why pickups glow with sprites instead of PointLights.
//
// THE ROOM IS A CLOSED BOX. Floor, four walls to the ceiling, and a ceiling at
// CEIL_Y. Nothing is open to a skybox, because a rave happens indoors and the
// beams need something to land on. The walls do NOT cast shadows: at this
// height, with the key light where it is, they would drop the entire floor
// into shade.
//
// GEOMETRY BUDGET: the smoke test caps unique geometries under 120, so
// anything repeated - truss bays, fixtures, speaker boxes - shares one
// geometry instance and only the transform differs. Do not write
// `new BoxGeometry` inside a loop here.
import * as THREE from 'three';
import { makeAabb, AGENT_HEIGHT } from './utils.js';

// Half-width of the playable floor. Walls sit just outside this; entities
// clamp themselves to a slightly smaller bound to stay off the walls.
export const BOUND = 22;
// Ceiling height. Deliberately far above anything reachable - the jump apex is
// 1.84m and the highest catwalk is 4.6 - so the room reads as a big warehouse
// venue rather than a lid pressed down on the fight.
export const CEIL_Y = 16;
// Top surface of the perimeter catwalks. Above every ordinary enemy's head, so
// they walk underneath it: see the overhead skip in resolveCircle and the
// filter in the NavGrid constructor.
export const CATWALK_Y = 4.6;

// Base fog density. EXPONENTIAL, not linear: a linear fog has a hard near
// plane and a hard far plane, and a room with a visible band across it reads
// as a room. Exp2 puts haze everywhere and simply more of it further off,
// which is what air with a smoke machine in it actually does.
//
// It costs nothing to switch. Both are a branch inside shaders every material
// in this scene already runs, and the two measured identical on the software
// rasteriser the smoke test uses. rig.js drives this value: it thickens for a
// boss and breathes with the bass the rest of the time.
//
// Tuned by eye against the linear fog it replaces, and deliberately BELOW the
// value that matches it at distance. Exp2 has one parameter, so it cannot do
// what a near/far pair did - hold the near field perfectly clear and then band
// off - and matching the old occlusion at 40m (0.017) put so much haze in the
// first ten metres that the room lost its blacks and every accent turned to
// pastel. 0.013 keeps the arena reading as a dark box with smoke in it, which
// is the look; the far wall is a little more visible than it was, and that is
// the price of haze everywhere else.
//
// IT MUST STAY MODEST: enemy colour is the game's primary read, and fog is the
// one setting in the venue that can quietly wash all of it out at once.
export const FOG_DENSITY = 0.013;
// What it thickens to for a boss - the room closing in around the fight. The
// old linear pair pulled in to 14/44 for the same effect.
export const FOG_DENSITY_BOSS = 0.024;

// ONE unit cube, scaled per mesh. Every box in the venue - walls, ceiling,
// truss bays, speaker cabinets, catwalk decks, trims - is this geometry with a
// different transform. Writing `new BoxGeometry` per prop would put ~60
// geometries on the budget for no benefit; the smoke test caps it under 120
// for the whole game.
const BOX = new THREE.BoxGeometry(1, 1, 1);
// Likewise one unit cylinder, scaled in Y for the truss towers.
const CYL = new THREE.CylinderGeometry(0.7, 0.7, 1, 10);

// Adds a box of the given world size at the given centre. Returns the mesh so
// the caller can push it onto meshList or tweak it.
function box(group, mat, x, y, z, w, h, d) {
  const m = new THREE.Mesh(BOX, mat);
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  group.add(m);
  return m;
}

export function buildArena(scene) {
  const group = new THREE.Group();
  const obstacles = [];
  const meshList = [];
  const spawnPoints = [];

  // Mostly diffuse on purpose. Metalness here has to stay low: there is no
  // environment map in this scene, so a metallic surface has nothing to
  // reflect and renders very nearly black - a shiny "club floor" made the
  // whole room read as an unlit void.
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2b3040, roughness: 0.55, metalness: 0.18 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(BOUND * 2 + 2, BOUND * 2 + 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  // The floor is a raycast target too, otherwise shots aimed at the ground
  // pass straight through and never spawn an impact.
  meshList.push(floor);

  // Purely decorative, floats just above the floor to avoid z-fighting. Dimmer
  // and cooler than it used to be: the floor is a dancefloor now and the rig
  // is what is supposed to draw the eye, not a bright grid.
  const grid = new THREE.GridHelper(BOUND * 2 + 2, 23, 0x2b6a80, 0x1d3a4a);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  group.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1f2432, roughness: 0.78, metalness: 0.12 });
  // The trim material shared by the fixtures that are NOT part of the wall
  // chase - the lamp heads on the truss towers. rig.js writes its colour and
  // intensity as one object, so those all pulse together.
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x0b0e14, emissive: 0x4ef3ff, emissiveIntensity: 1.6 });
  // Four perimeter walls, floor to ceiling, each with an emissive trim strip
  // at head height. Walls are raycast targets but not obstacles: entities are
  // kept inside by the hard clamp in their update, not by collision.
  //
  // castShadow is deliberately OFF. At CEIL_Y tall, with the key light up at
  // (9, 15, 6), a wall that casts would drop the whole arena into its shade.
  const wallDefs = [
    { x: 0, z: -(BOUND + 0.5), w: BOUND * 2 + 3, d: 1 },
    { x: 0, z: BOUND + 0.5, w: BOUND * 2 + 3, d: 1 },
    { x: -(BOUND + 0.5), z: 0, w: 1, d: BOUND * 2 + 3 },
    { x: BOUND + 0.5, z: 0, w: 1, d: BOUND * 2 + 3 },
  ];
  // THE WALL STRIPS ARE SEGMENTED, and this is the only place in the venue
  // where a material is NOT shared across every prop that looks like it. Six
  // cells per wall, each with its own material, is what lets rig.js run a
  // pulse around the room instead of brightening all four walls at once - the
  // difference between a lit room and a rig that is playing to the music.
  //
  // The cost is 24 draw calls and 24 materials in place of 4 and 1. They are
  // identical MeshStandardMaterial configurations, so three.js compiles ONE
  // shader program for the lot (the smoke test caps programs at 24), and the
  // geometry is the same shared unit box every other prop uses.
  const SEGS = 6;
  // A gap between cells, as a fraction of the cell's length. Without it the
  // strip is continuous and the chase reads as a smear rather than as
  // individual cells lighting.
  const SEG_FILL = 0.88;
  const wallStripCells = [];
  for (const wd of wallDefs) {
    const wall = box(group, wallMat, wd.x, CEIL_Y / 2, wd.z, wd.w, CEIL_Y, wd.d);
    wall.receiveShadow = true;
    meshList.push(wall);
    // `alongX` is true for the two walls that run east-west; the strip is
    // divided along whichever of the wall's two footprint axes is the long one.
    const alongX = wd.w > wd.d;
    const span = alongX ? wd.w : wd.d;
    const cell = span / SEGS;
    for (let i = 0; i < SEGS; i++) {
      const off = -span / 2 + cell * (i + 0.5);
      const m = new THREE.MeshStandardMaterial({
        color: 0x0b0e14, emissive: 0x4ef3ff, emissiveIntensity: 1.6,
      });
      const cx = wd.x + (alongX ? off : 0);
      const cz = wd.z + (alongX ? 0 : off);
      box(
        group, m, cx, 3.02, cz,
        alongX ? cell * SEG_FILL : 1.02, 0.08, alongX ? 1.02 : cell * SEG_FILL
      );
      wallStripCells.push({ m, a: Math.atan2(cz, cx) });
    }
  }
  // Sorted into a single loop around the room, so a chase that walks the array
  // walks the perimeter and crosses the corners in order. Derived from each
  // cell's own bearing rather than from the order the walls were built in,
  // which would send the pulse jumping from one wall to the opposite one.
  wallStripCells.sort((p, q) => p.a - q.a);
  const wallStrip = wallStripCells.map((c) => c.m);

  // The lid. Same reasoning as the walls on shadows. It is a raycast target so
  // a shot fired straight up sparks off something instead of vanishing.
  // Basic, not Standard: the ceiling is a 46x46 unlit slab and running every
  // light in the scene over that many fragments buys nothing you can see.
  const ceilMat = new THREE.MeshBasicMaterial({ color: 0x0a0c12 });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(BOUND * 2 + 2, BOUND * 2 + 2), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = CEIL_Y;
  group.add(ceil);
  meshList.push(ceil);

  // ---- floor furniture ---------------------------------------------------
  // Every prop below keeps the EXACT footprint and height it had before the
  // venue re-skin. Enemy pathing is baked from these AABBs and the combat
  // spacing was tuned around them, so the boxes are fixed points: what changed
  // is only what they look like.

  const platMat = new THREE.MeshStandardMaterial({ color: 0x252b3a, roughness: 0.5, metalness: 0.25 });
  const platEdgeMat = new THREE.MeshStandardMaterial({ color: 0x0b0e14, emissive: 0x4ef3ff, emissiveIntensity: 1.2 });
  // Raised platforms - solid, and jumpable via the step-up test in player.js.
  // h is the height of the top surface.
  //
  // TWO OF THEM MOVED, AND ONLY TWO. The note above is still the rule - these
  // footprints are what enemy pathing is baked from and what the combat
  // spacing was tuned around - but the Devil's row grew two consoles at
  // x = +-6.9, z = 9.5, and the platforms at (8, 8) and (-9, 9) stood exactly
  // where a player has to be able to walk up to one. A console you cannot
  // reach is not a console.
  //
  // They moved OUT along the same diagonal rather than shrinking or
  // disappearing: same size, same height, same job holding the two far corners,
  // pushed back to the +Z corners so the whole band across z = 9.5 is open from
  // wall to wall. The middle of the floor, where the fight actually happens, is
  // untouched.
  const platforms = [
    { x: 0, z: 0, w: 4, d: 4, h: 1.0 },
    { x: -8, z: -8, w: 5, d: 4, h: 1.2 },
    { x: 12, z: 13.5, w: 6, d: 5, h: 1.3 },
    { x: -12.5, z: 13.5, w: 4, d: 4, h: 1.6 },
    { x: 9, z: -9, w: 4, d: 4, h: 1.5 },
  ];
  for (const p of platforms) {
    const m = box(group, platMat, p.x, p.h / 2, p.z, p.w, p.h, p.d);
    m.castShadow = true;
    m.receiveShadow = true;
    meshList.push(m);
    obstacles.push(makeAabb(p.x, p.h / 2, p.z, p.w, p.h, p.d));
    box(group, platEdgeMat, p.x, p.h + 0.01, p.z, p.w + 0.04, 0.05, p.d + 0.04);
  }

  // Low cover, now speaker cabinets. The collision box is slightly wider than
  // the mesh (1.15 vs 0.95) to compensate for the random Y rotation, which the
  // AABB can't model.
  const speakerMat = new THREE.MeshStandardMaterial({ color: 0x191d26, roughness: 0.85, metalness: 0.1 });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x1c1f28, roughness: 0.6, metalness: 0.4 });
  const crates = [
    { x: 3.5, z: -3 }, { x: -4, z: 2.5 }, { x: 2, z: 5.5 }, { x: -2, z: -5.5 }, { x: 12, z: -2 },
  ];
  for (const c of crates) {
    const m = box(group, speakerMat, c.x, 0.475, c.z, 0.95, 0.95, 0.95);
    m.rotation.y = Math.random() * 0.6 - 0.3;
    m.castShadow = true;
    m.receiveShadow = true;
    meshList.push(m);
    obstacles.push(makeAabb(c.x, 0.475, c.z, 1.15, 0.95, 1.15));
    // Driver cones on the front face, purely decorative.
    const cone = box(group, coneMat, 0, 0.12, 0.5, 0.62, 0.62, 0.04);
    const cone2 = box(group, coneMat, 0, -0.22, 0.5, 0.34, 0.34, 0.04);
    m.add(cone);
    m.add(cone2);
  }

  // Tall cover, now lighting-truss towers. Too high to jump onto. Boxed as a
  // square AABB around the cylinder, so the corners collide a little wider
  // than they look.
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x1c2130, roughness: 0.45, metalness: 0.35 });
  const pillars = [
    { x: -14, z: 0 }, { x: 14, z: -2 }, { x: 0, z: 14 }, { x: -3, z: -14 }, { x: 3, z: 14 },
  ];
  for (const pl of pillars) {
    const m = new THREE.Mesh(CYL, towerMat);
    m.position.set(pl.x, 1.15, pl.z);
    m.scale.set(1, 2.3, 1);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    meshList.push(m);
    obstacles.push(makeAabb(pl.x, 1.15, pl.z, 1.5, 2.3, 1.5));
    // A lamp head on top of each tower, lit by rig.js.
    box(group, trimMat, pl.x, 2.42, pl.z, 0.5, 0.14, 0.5);
  }

  // ---- perimeter traversal -----------------------------------------------
  // Going up is OPTIONAL. Everything here hugs the walls so the middle of the
  // floor - where the fight actually happens - is exactly as open as it was.
  //
  // The climb is floor -> stack (1.5) -> ledge (2.9) -> catwalk (4.3). The
  // jump apex is 1.84m, so every hop has ~0.44m of margin; tighter than that
  // and the step-up test in player.js becomes a coin flip.
  //
  // The ledges and the catwalk are SUSPENDED: their undersides sit at 2.65 and
  // 4.05, above the 2.5m agent height the NavGrid filters on, so enemies walk
  // straight under them instead of treating them as pillars. The stacks are
  // the only part of the chain standing on the floor, and they are ordinary
  // cover like the speaker cabinets.
  //
  // There is no railing and no cover up here on purpose: high ground buys you
  // sightlines, and costs you being an easy target for every gunner in the room.
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x232838, roughness: 0.55, metalness: 0.25 });
  const deckEdgeMat = new THREE.MeshStandardMaterial({ color: 0x0b0e14, emissive: 0xffb300, emissiveIntensity: 1.0 });

  // Step 1: solid stacks on the floor. These DO block pathing, like any crate.
  // Placed clear of the spawn points at +-18.
  const stacks = [{ x: -16.0, z: -19.4 }, { x: 16.0, z: 19.4 }];
  for (const st of stacks) {
    const m = box(group, speakerMat, st.x, 0.75, st.z, 1.4, 1.5, 1.4);
    m.castShadow = true;
    m.receiveShadow = true;
    meshList.push(m);
    obstacles.push(makeAabb(st.x, 0.75, st.z, 1.4, 1.5, 1.4));
  }

  // Step 2: wall-mounted ledges, underside at 2.65.
  //
  // These sit BEYOND the ends of the catwalk runs, never beneath one. That is
  // not cosmetic: resolveCircle only ignores a box the mover is standing on or
  // is entirely underneath, so a deck 1.15m above a ledge is neither, and it
  // would shove the player sideways off the ledge they were standing on. The
  // climb has to happen where there is open air overhead.
  const ledges = [{ x: -15.6, z: -20.6 }, { x: 15.6, z: 20.6 }];
  for (const l of ledges) {
    const m = box(group, deckMat, l.x, 2.775, l.z, 2.0, 0.25, 2.0);
    m.castShadow = true;
    meshList.push(m);
    obstacles.push(makeAabb(l.x, 2.775, l.z, 2.0, 0.25, 2.0));
  }

  // Step 3: two catwalk runs, on the north and south walls, underside at 4.05.
  // They stop at |x| = 14 so the access ledges above have clear sky, and so
  // the two sides are not joined - you come down to cross the room, which
  // keeps the floor the fastest way to anywhere.
  const catwalks = [
    { x: 0, z: -20.6, w: 28, d: 1.8 },
    { x: 0, z: 20.6, w: 28, d: 1.8 },
  ];
  for (const c of catwalks) {
    const m = box(group, deckMat, c.x, 4.175, c.z, c.w, 0.25, c.d);
    m.receiveShadow = true;
    meshList.push(m);
    obstacles.push(makeAabb(c.x, 4.175, c.z, c.w, 0.25, c.d));
    // Lit edge strip so the walkway reads from the floor below.
    box(group, deckEdgeMat, c.x, 4.31, c.z, c.w, 0.04, 0.12);
  }

  // ---- lighting: exactly 4 lights here, see the note at the top of this file
  // 1) hemisphere fill, 2) shadow-casting key light, 3+4) two colour accents.
  // The fifth is the muzzle flash light, owned by effects.js. rig.js adds its
  // moving heads on top and animates all of these - it never creates one
  // after startup.
  //
  // The hemisphere and the key light are the WHITE light that keeps enemies
  // readable. rig.js modulates their intensity but never their hue: enemy
  // colours run the whole hue wheel and a coloured key would collapse them
  // into each other.
  const hemi = new THREE.HemisphereLight(0x3a4a6a, 0x2a2f3a, 1.0);
  group.add(hemi);
  const dir = new THREE.DirectionalLight(0xbfd4ff, 1.6);
  dir.position.set(9, 15, 6);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  // The shadow frustum is sized to cover the whole arena, since the light is
  // fixed and everything inside must cast into it.
  dir.shadow.camera.left = -26;
  dir.shadow.camera.right = 26;
  dir.shadow.camera.top = 26;
  dir.shadow.camera.bottom = -26;
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 45;
  dir.shadow.bias = -0.0005;
  group.add(dir);
  const p1 = new THREE.PointLight(0x4ef3ff, 34, 24);
  p1.position.set(-12, 3.6, -12);
  group.add(p1);
  const p2 = new THREE.PointLight(0xb14aed, 34, 24);
  p2.position.set(12, 3.6, 12);
  group.add(p2);

  scene.background = new THREE.Color(0x07090f);
  scene.fog = new THREE.FogExp2(0x07090f, FOG_DENSITY);

  // Spawn points: a 3x3 grid near the arena edges, minus the centre (which is
  // on top of the middle platform and would drop spawns onto the player).
  for (const sx of [-18, 0, 18]) {
    for (const sz of [-18, 0, 18]) {
      if (sx === 0 && sz === 0) continue;
      spawnPoints.push(new THREE.Vector3(sx, 0, sz));
    }
  }

  scene.add(group);
  // `lights` is handed to rig.js, which animates them. `mats` are the emissive
  // materials rig.js pulses - shared instances, so writing one changes every
  // prop that uses it.
  // Obstacles a ground-level thing can actually run into. The suspended decks
  // are excluded, which is what lets enemy fire pass UNDER a catwalk instead
  // of stopping dead on its underside - see the note where projectiles use it
  // in main.js. `obstacles` stays the full list, for the player's landing test.
  const ground = obstacles.filter((o) => o.min.y <= AGENT_HEIGHT);

  return {
    group, obstacles, ground, meshList, spawnPoints,
    lights: { hemi, dir, p1, p2 },
    mats: { trim: trimMat, platEdge: platEdgeMat, deckEdge: deckEdgeMat, wallStrip },
    shared: { BOX, CYL },
  };
}
