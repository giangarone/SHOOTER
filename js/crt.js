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
//   4. the composite: barrel warp, radial aberration, glow, dither, edge mask
//
// NOTHING HERE MOVES. Not a rolling bar, not a flicker, and no grain either -
// analog noise was tried and cut. Every animated tube artifact looks right in
// a screenshot and is miserable to play under for twenty minutes, so this
// pass is now purely a function of the frame it is handed.

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
// Quantisation steps per channel, before dithering. This is the one knob in
// here that is NOT a display artifact: a tube did not posterise, a machine
// with a small palette did, and it did it before the signal ever reached the
// glass - which is why it happens ahead of the grain below. It is the same
// trick the overlays already pull with their 2px checker (see --dither in
// styles.css), applied to the arena instead of faked behind a menu. 16 is
// deliberately mild: enough that the rig's washes band into steps, not enough
// to cost an enemy silhouette across the arena.
const LEVELS = 16;
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
  uniform float uCurve;
  uniform float uAberration;
  uniform float uGlow;
  uniform float uLevels;
  uniform float uPixel;
  varying vec2 vUv;

  // Ordered dither, 4x4. Built by recursion rather than read out of a const
  // array, because indexing an array by a varying value is not something
  // GLSL ES 1.00 will compile - and this is two mods and a multiply anyway.
  float bayer2(vec2 p) { return mod(2.0 * p.x + 3.0 * p.y, 4.0); }
  float bayer4(vec2 p) {
    vec2 q = mod(p, 4.0);
    return (4.0 * bayer2(mod(q, 2.0)) + bayer2(floor(q * 0.5))) / 16.0;
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

    // ACES, by hand, here rather than in the scene's own materials. three
    // SKIPS tone mapping whenever a render target is bound (WebGLRenderer
    // gates it on currentRenderTarget === null), so the moment this pass
    // existed the arena silently lost the curve it was lit and colour-picked
    // under. Everything above this line is scene-referred and may exceed 1;
    // everything below it is display-referred 0-1.
    #if defined( TONE_MAPPING )
      col = toneMapping( col );
    #endif

    // Screen pixels, not device pixels. Everything below is a fixed-size grid
    // and has to keep that size on a retina panel, or the dither lands at half
    // scale there and stops matching the overlays' checker.
    vec2 px = gl_FragCoord.xy / uPixel;

    // Posterise, with the error pushed into a 4x4 ordered dither. Done in
    // roughly perceptual space: quantising the linear signal directly would
    // spend most of its levels on highlights and band this game's darks into
    // mud, which is exactly where it is being looked at.
    vec3 g = pow(max(col, 0.0), vec3(0.4545));
    g = floor(g * uLevels + 0.5 + (bayer4(px) - 0.5)) / uLevels;
    col = pow(clamp(g, 0.0, 1.0), vec3(2.2));

    // The tube's edge. The warp pulls UVs past the frame at the corners, and
    // this both blacks that out and feathers it, so the glass ends on a soft
    // line rather than a stair-stepped one.
    vec2 d = min(uv, 1.0 - uv);
    col *= smoothstep(0.0, 0.0025, min(d.x, d.y));

    gl_FragColor = vec4(col, 1.0);

    // The other half of the same omission: a custom ShaderMaterial gets no
    // automatic sRGB encode, so without this the whole game was being shown
    // as raw linear - which is a LOT darker, and was being mistaken for the
    // scanlines being too heavy.
    #include <colorspace_fragment>
  }
`;

export class CrtPass {
  constructor(renderer) {
    this.renderer = renderer;

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
        uCurve: { value: CURVE },
        uAberration: { value: ABERRATION },
        uGlow: { value: GLOW_STRENGTH },
        uLevels: { value: LEVELS },
        uPixel: { value: 1 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      // TRUE here, unlike the two passes above: this is the one that reaches
      // the canvas, so it is the one that owes the image its tone curve.
      toneMapped: true,
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
    this._composite.uniforms.uPixel.value = dpr;
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

  render(scene, camera) {
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
    this._composite.uniforms.tGlow.value = this._glowA.texture;
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
