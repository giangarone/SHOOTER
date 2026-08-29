// Static level geometry and lighting. Built once at startup and never
// modified - nothing here is per-frame.
//
// buildArena() returns:
//   group       the parent Object3D holding all level meshes
//   obstacles   AABBs for collision (utils.js). Only solid, standable things
//               are listed; decorative trims and edges are not.
//   meshList    raycast targets for shooting. Enemy hitboxes are appended to
//               this list per shot in main.js.
//   spawnPoints where enemies and pickups appear, jittered by the caller.
//
// IMPORTANT: the light count here is fixed and must stay that way. three.js
// keys its shader programs on the number of lights, so adding or removing one
// at runtime recompiles every material in the scene and stalls the frame.
// That is why pickups glow with sprites instead of PointLights.
import * as THREE from 'three';
import { makeAabb } from './utils.js';

// Half-width of the playable floor. Walls sit just outside this; entities
// clamp themselves to a slightly smaller bound to stay off the walls.
export const BOUND = 22;

export function buildArena(scene) {
  const group = new THREE.Group();
  const obstacles = [];
  const meshList = [];
  const spawnPoints = [];

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.75, metalness: 0.1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(BOUND * 2 + 2, BOUND * 2 + 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  // The floor is a raycast target too, otherwise shots aimed at the ground
  // pass straight through and never spawn an impact.
  meshList.push(floor);

  // Purely decorative, floats just above the floor to avoid z-fighting.
  const grid = new THREE.GridHelper(BOUND * 2 + 2, 23, 0x4a5a6a, 0x3a4a5a);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  group.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1d222e, roughness: 0.6, metalness: 0.35 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x0b0e14, emissive: 0x4ef3ff, emissiveIntensity: 1.6 });
  // Four perimeter walls, each with an emissive trim strip along the top.
  // Walls are raycast targets but not obstacles: entities are kept inside by
  // the hard clamp in their update, not by collision.
  const wallDefs = [
    { x: 0, z: -(BOUND + 0.5), w: BOUND * 2 + 3, d: 1 },
    { x: 0, z: BOUND + 0.5, w: BOUND * 2 + 3, d: 1 },
    { x: -(BOUND + 0.5), z: 0, w: 1, d: BOUND * 2 + 3 },
    { x: BOUND + 0.5, z: 0, w: 1, d: BOUND * 2 + 3 },
  ];
  for (const wd of wallDefs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wd.w, 3, wd.d), wallMat);
    wall.position.set(wd.x, 1.5, wd.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
    meshList.push(wall);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(wd.w === 1 ? 1.02 : wd.w, 0.08, wd.d === 1 ? 1.02 : wd.d), trimMat);
    trim.position.set(wd.x, 3.02, wd.z);
    group.add(trim);
  }

  const platMat = new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 0.5, metalness: 0.45 });
  const platEdgeMat = new THREE.MeshStandardMaterial({ color: 0x0b0e14, emissive: 0x4ef3ff, emissiveIntensity: 0.9 });
  // Raised platforms - solid, and jumpable via the step-up test in player.js.
  // h is the height of the top surface.
  const platforms = [
    { x: 0, z: 0, w: 4, d: 4, h: 1.0 },
    { x: -8, z: -8, w: 5, d: 4, h: 1.2 },
    { x: 8, z: 8, w: 6, d: 5, h: 1.3 },
    { x: -9, z: 9, w: 4, d: 4, h: 1.6 },
    { x: 9, z: -9, w: 4, d: 4, h: 1.5 },
  ];
  for (const p of platforms) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), platMat);
    m.position.set(p.x, p.h / 2, p.z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    meshList.push(m);
    obstacles.push(makeAabb(p.x, p.h / 2, p.z, p.w, p.h, p.d));
    const edge = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.04, 0.05, p.d + 0.04), platEdgeMat);
    edge.position.set(p.x, p.h + 0.01, p.z);
    group.add(edge);
  }

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x2e2a22, roughness: 0.7, metalness: 0.25 });
  // Low cover. The collision box is slightly wider than the mesh (1.15 vs
  // 0.95) to compensate for the random Y rotation, which the AABB can't model.
  const crates = [
    { x: 3.5, z: -3 }, { x: -4, z: 2.5 }, { x: 2, z: 5.5 }, { x: -2, z: -5.5 }, { x: 12, z: -2 },
  ];
  for (const c of crates) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), crateMat);
    m.position.set(c.x, 0.475, c.z);
    m.rotation.y = Math.random() * 0.6 - 0.3;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    meshList.push(m);
    obstacles.push(makeAabb(c.x, 0.475, c.z, 1.15, 0.95, 1.15));
  }

  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.4, metalness: 0.6 });
  // Tall cover, too high to jump onto. Boxed as a square AABB around the
  // cylinder, so the corners collide a little wider than they look.
  const pillars = [
    { x: -14, z: 0 }, { x: 14, z: -2 }, { x: 0, z: 14 }, { x: -3, z: -14 }, { x: 3, z: 14 },
  ];
  for (const pl of pillars) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.3, 10), pillarMat);
    m.position.set(pl.x, 1.15, pl.z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    meshList.push(m);
    obstacles.push(makeAabb(pl.x, 1.15, pl.z, 1.5, 2.3, 1.5));
  }

  // ---- lighting: exactly 5 lights, see the note at the top of this file ----
  // 1) hemisphere fill, 2) shadow-casting key light, 3+4) two colour accents.
  // The fifth is the muzzle flash light, owned by effects.js.
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

  scene.background = new THREE.Color(0x1a1f2a);
  scene.fog = new THREE.Fog(0x1a1f2a, 26, 62);

  // Spawn points: a 3x3 grid near the arena edges, minus the centre (which is
  // on top of the middle platform and would drop spawns onto the player).
  for (const sx of [-18, 0, 18]) {
    for (const sz of [-18, 0, 18]) {
      if (sx === 0 && sz === 0) continue;
      spawnPoints.push(new THREE.Vector3(sx, 0, sz));
    }
  }

  scene.add(group);
  return { group, obstacles, meshList, spawnPoints };
}