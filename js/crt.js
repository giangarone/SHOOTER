// CRT tube. A post-process pass that stands between the scene and the canvas,
// and the other half of the effect whose scanlines live in styles.css.
//
// THE SPLIT, because it is not obvious from either side alone: scanlines and
// the bezel are CSS, drawn over the whole document so the HUD and the menus
// sit under the same grid as the arena. Everything here needs to SAMPLE the
// image - curvature moves pixels, aberration splits them, glow bleeds them -
// so it can only touch what the renderer draws. The HUD is DOM on top of the
// canvas and is deliberately left flat: it stays pixel-crisp, and at the ~2%
// barrel used here nothing gives the seam away.
//
// Four passes per frame, in order:
//   1. the scene, into a half-float target
//   2. a bright-pass extract into a quarter-res target
//   3. two separable blurs of that, ping-ponged
//   4. the composite: barrel warp, radial aberration, glow, noise, edge mask
//
// NOTHING HERE ROLLS OR FLICKERS. The only animated term is the noise hash,
// at an amplitude you notice as texture and never as motion. A rolling bar
// looks right in a screenshot and is miserable to play under.

import * as THREE from 'three';

// How far the barrel pushes the corners out, in half-screen units. 0.02 is
// about one percent of the width at the corner: enough that a straight HUD
// edge and the arena's horizon disagree, which is the whole tell, and not
// enough to bend anything the player is aiming at.
const CURVE = 0.022;
// Radial split, in UV, at the very corner. Scales with r^2, so the centre of
// the screen - where the crosshair is - has effectively none.
const ABERRATION = 0.0022;
// Luminance above which a pixel starts blooming, and how much of the blurred
// result is added back. The arena is lit by a rig that already runs hot, so
// this sits high; the things that glow are meant to be the lasers, the muzzle
// flashes and the orbs, not the floor.
const GLOW_THRESHOLD = 0.62;
const GLOW_STRENGTH = 0.42;
// Amplitude of the per-pixel noise, on a 0-1 signal.
const NOISE = 0.022;
// Divisor for the glow targets. Quarter res in each axis - the blur is meant
// to be a halo, and running it at full res costs sixteen times the fill for a
// result nobody can tell apart.
const GLOW_SCALE = 4;

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Soft-knee extract. Dividing the excess by the luminance keeps the pixel's
// hue: a hot cyan laser blooms cyan rather than drifting toward white.
const BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = max(max(c.r, c.g), c.b);
    float k = max(l - uThreshold, 0.0) / max(l, 1e-4);
    gl_FragColor = vec4(c * k, 1.0);
  }
`;

// One axis of a 9-tap gaussian. Run twice with uDir swapped.
const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
    sum += (texture2D(tDiffuse, vUv + uDir * 1.3846).rgb
          + texture2D(tDiffuse, vUv - uDir * 1.3846).rgb) * 0.316216;
    sum += (texture2D(tDiffuse, vUv + uDir * 3.2308).rgb
          + texture2D(tDiffuse, vUv - uDir * 3.2308).rgb) * 0.070270;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tGlow;
  uniform float uTime;
  uniform float uCurve;
  uniform float uAberration;
  uniform float uGlow;
  uniform float uNoise;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    // Barrel. Signed centre coords so the push is symmetric, then back to UV.
    vec2 p = vUv * 2.0 - 1.0;
    vec2 uv = (p * (1.0 + uCurve * dot(p, p))) * 0.5 + 0.5;

    // Radial split. The offset rides r^2 for the same reason a real tube's
    // convergence error does: it is a corner problem, not a centre one.
    vec2 c = uv - 0.5;
    vec2 off = c * uAberration * dot(c, c) * 16.0;
    vec3 col = vec3(
      texture2D(tScene, uv + off).r,
      texture2D(tScene, uv).g,
      texture2D(tScene, uv - off).b
    );

    col += texture2D(tGlow, uv).rgb * uGlow;

    // Analog grain. Keyed off the fragment rather than the UV so it stays a
    // fixed size on screen instead of stretching with the warp.
    col += (hash(gl_FragCoord.xy + fract(uTime) * vec2(37.0, 17.0)) - 0.5) * uNoise;

    // The tube's edge. The warp pulls UVs past the frame at the corners, and
    // this both blacks that out and feathers it, so the glass ends on a soft
    // line rather than a stair-stepped one.
    vec2 d = min(uv, 1.0 - uv);
    col *= smoothstep(0.0, 0.0025, min(d.x, d.y));

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class CrtPass {
  constructor(renderer) {
    this.renderer = renderer;
    this._time = 0;

    // One quad, one camera, reused by all four passes. The vertex shader
    // ignores the camera entirely - position is already in clip space - but
    // three still needs one to render with.
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this._quad.frustumCulled = false;
    this._scene = new THREE.Scene();
    this._scene.add(this._quad);

    // Half float, because the scene arrives here tone-mapped but still linear
    // and an 8-bit hop would band every gradient the rig throws on a wall.
    const opts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    };
    this._scene_rt = new THREE.WebGLRenderTarget(1, 1, opts);
    this._glowA = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthBuffer: false });
    this._glowB = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthBuffer: false });

    // toneMapped: false on every material here. The scene's own materials
    // already applied ACES on the way into the target; running it again on
    // the composite would wash the whole image out.
    this._bright = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: GLOW_THRESHOLD } },
      vertexShader: QUAD_VERT,
      fragmentShader: BRIGHT_FRAG,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    });
    this._blur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    });
    this._composite = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this._scene_rt.texture },
        tGlow: { value: this._glowB.texture },
        uTime: { value: 0 },
        uCurve: { value: CURVE },
        uAberration: { value: ABERRATION },
        uGlow: { value: GLOW_STRENGTH },
        uNoise: { value: NOISE },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    });

    const size = renderer.getSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
  }

  // CSS pixels in; the targets are sized in device pixels so the pass runs at
  // the same resolution the renderer is already drawing at.
  setSize(width, height) {
    const dpr = this.renderer.getPixelRatio();
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    this._scene_rt.setSize(w, h);
    const gw = Math.max(1, Math.floor(w / GLOW_SCALE));
    const gh = Math.max(1, Math.floor(h / GLOW_SCALE));
    this._glowA.setSize(gw, gh);
    this._glowB.setSize(gw, gh);
    this._glowTexel = new THREE.Vector2(1 / gw, 1 / gh);
  }

  _draw(material, target) {
    this._quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this._scene, this._camera);
  }

  render(scene, camera, dt = 0) {
    const r = this.renderer;

    r.setRenderTarget(this._scene_rt);
    r.render(scene, camera);

    this._bright.uniforms.tDiffuse.value = this._scene_rt.texture;
    this._draw(this._bright, this._glowA);

    this._blur.uniforms.tDiffuse.value = this._glowA.texture;
    this._blur.uniforms.uDir.value.set(this._glowTexel.x, 0);
    this._draw(this._blur, this._glowB);

    this._blur.uniforms.tDiffuse.value = this._glowB.texture;
    this._blur.uniforms.uDir.value.set(0, this._glowTexel.y);
    this._draw(this._blur, this._glowA);

    // The vertical blur landed back in A, so that is what the composite reads.
    this._time += dt;
    this._composite.uniforms.tGlow.value = this._glowA.texture;
    this._composite.uniforms.uTime.value = this._time;
    this._draw(this._composite, null);
  }

  dispose() {
    this._scene_rt.dispose();
    this._glowA.dispose();
    this._glowB.dispose();
    this._quad.geometry.dispose();
    this._bright.dispose();
    this._blur.dispose();
    this._composite.dispose();
  }
}
