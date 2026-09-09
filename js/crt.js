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
//   1. the scene, into a half-float target - AT A LOWER RESOLUTION than the
//      canvas when the pixel setting asks for it, which is what makes the
//      arena itself pixel art rather than a smooth 3D game with pixel art
//      hanging in it
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
// The vertical resolutions the pixel setting steps through. 0 is off - the
// scene renders at the panel's own resolution, the way it always did.
//
// TARGETS, NOT EXACT SIZES. A fraction of the panel would give a 4K monitor
// art-pixels four times the size of a laptop's, so these are stated as line
// counts - but the buffer is NOT sized to them directly. See setSize: the
// scale factor is rounded to a whole number first and the resolution follows
// from that, because a fractional one is worse than a wrong one.
export const PIXEL_STEPS = [0, 720, 540, 360];
// Multisamples on the scene buffer while the pixel setting is on.
//
// THIS IS NOT A CONTRADICTION OF THE PIXEL LOOK, and it is worth being clear
// about why. MSAA anti-aliases WITHIN the low-resolution buffer: an art-pixel
// that a wall strip covers a third of comes out a third as bright, instead of
// being either fully lit or fully missed depending on where the edge happened
// to fall. The art-pixel grid is untouched - it is the buffer's resolution,
// not its sample count - so the image is exactly as chunky, and the composite
// posterises it to sixteen levels afterwards regardless. What changes is that
// a given art-pixel stops changing its mind every frame.
//
// It earns it on thin bright geometry, which is where the flicker was: with a
// camera panning slowly past the wall light strips at the coarsest setting,
// frame-to-frame jitter halved and the strips were DRAWN roughly twice as
// often - most of the popping was a strip vanishing entirely between frames
// rather than merely shimmering.
//
// TWO, not four, and that is a measurement rather than a guess: two and four
// scored identically on the jitter this exists to remove (1.3% either way,
// against 2.5% with none) and differed by under three percent in how much of
// a strip got drawn. Four is twice the bandwidth for that. It also cost
// enough frame time on a software rasteriser to start tipping test/melee.mjs,
// which is frame-rate sensitive - not a real regression, but a fair sign that
// the last two samples were being paid for and not used.
//
// Only while the setting is ON. With it off the scene buffer is the full
// device resolution, where the aliasing is far less visible and multisampling
// a half-float 2560x1440 target costs tens of megabytes for it.
const SCENE_SAMPLES = 2;
// The coarsest an art-pixel is ever allowed to get, in device pixels. Only
// reachable on a very tall panel, and it is a sanity rail rather than a taste
// decision - past this the arena is unplayable at any setting.
const MAX_PIXEL = 8;
export const PIXEL_LABELS = ['OFF', 'SUBTLE', 'MEDIUM', 'FULL'];

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
  // GRAY MATTER. 0 for every run that has not taken it, and the whole branch
  // costs one mix() on a pass that is already running - which is why the pick
  // is a uniform here rather than a second material or a fifth pass.
  uniform float uMono;
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

    // Desaturated HERE - scene-referred, above the tone curve and above the
    // posterise - so the grey the player sees is dithered and banded exactly
    // the way the colour image is. Below the posterise it would be a flat grey
    // wash over an image that had already been quantised in colour, which
    // reads as a filter laid on top of the game rather than as the game.
    //
    // Rec. 709 luma, not an average: an average turns this game's cyan HUD and
    // red damage into the same grey, and the whole cost of the pick is that
    // the player has to read the room by BRIGHTNESS.
    col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), uMono);

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
    //
    // Note that the renderer's own `antialias: true` (main.js) has applied to
    // NOTHING since this pass existed: that flag multisamples the default
    // framebuffer, and the scene has been going into this target instead.
    // Anti-aliasing the scene is `samples` on here - see SCENE_SAMPLES.
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
        uMono: { value: 0 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      // TRUE here, unlike the two passes above: this is the one that reaches
      // the canvas, so it is the one that owes the image its tone curve.
      toneMapped: true,
      depthTest: false,
      depthWrite: false,
    });

    // Which PIXEL_STEPS index is in force, and the CSS size last handed in.
    // Both are kept because the setting can change without a resize and a
    // resize can happen without the setting changing, and either one has to be
    // able to rebuild the targets on its own.
    this._step = 0;
    this._w = 1;
    this._h = 1;

    const size = renderer.getSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
  }

  /**
   * The height, in real pixels, of the buffer the SCENE is drawn into - which
   * since the pixel setting existed is no longer the canvas height.
   *
   * Anything sizing itself in pixels rather than in metres has to ask this
   * rather than the canvas, because gl_PointSize and friends are measured in
   * pixels of the CURRENT render target. See money.setViewport: sized off the
   * canvas, an orb came out as many times too big as the buffer was small.
   */
  get sceneHeight() {
    return this._scene_rt.height;
  }

  /**
   * Pick a step by INDEX into PIXEL_STEPS - not by line count, because the
   * index is also the floor on the scale factor (see setSize). Safe to call at
   * any time, including mid-run from the settings screen.
   */
  setPixelScale(step) {
    if (step === this._step) return;
    const wasOn = this._step > 0;
    this._step = step;
    if (wasOn !== (step > 0)) {
      // The filter and the sample count both change with the mode, and a
      // render target's texture is already on the GPU by now. Dropping it is
      // the honest way to get either applied - three rebuilds it on the next
      // bind, once.
      const on = step > 0;
      this._scene_rt.texture.magFilter = on ? THREE.NearestFilter : THREE.LinearFilter;
      this._scene_rt.texture.minFilter = on ? THREE.NearestFilter : THREE.LinearFilter;
      this._scene_rt.texture.generateMipmaps = false;
      this._scene_rt.samples = on ? SCENE_SAMPLES : 0;
      this._scene_rt.dispose();
    }
    this.setSize(this._w, this._h);
  }

  // CSS pixels in; the targets are sized in device pixels, then divided down
  // again by whatever the pixel setting asks for.
  setSize(width, height) {
    this._w = width;
    this._h = height;
    const dpr = this.renderer.getPixelRatio();
    const dw = Math.max(1, Math.floor(width * dpr));
    const dh = Math.max(1, Math.floor(height * dpr));

    // AN ART-PIXEL IS A WHOLE NUMBER OF DEVICE PIXELS, and this line is the
    // whole reason the pass looks the way it does.
    //
    // Sizing the buffer to the step's line count directly is the obvious thing
    // and it is wrong. 720 lines inside an 840-pixel-tall panel is a 1.167x
    // magnification, so a nearest-neighbour blow-up gives art-pixels that are
    // one device pixel wide six times and two device pixels wide once, in a
    // pattern that drifts across the screen. On a wall or a floor - anything
    // large and evenly lit - the seams between those runs line up into long
    // faint DIAGONAL beat lines. It is the classic pixel-art-in-3D artifact and
    // there is exactly one cure: round the SCALE and derive the resolution from
    // it, rather than rounding the resolution and living with the scale.
    //
    // The index is the floor, so the four steps stay four steps. Without it a
    // small window rounds two different line counts to the same factor and the
    // player presses + to no effect.
    let scale = 1;
    if (this._step > 0) {
      const want = Math.round(dh / PIXEL_STEPS[this._step]);
      scale = Math.max(this._step, Math.min(MAX_PIXEL, want));
    }
    const h = Math.max(1, Math.round(dh / scale));
    const w = Math.max(1, Math.round(dw / scale));
    this._scene_rt.setSize(w, h);

    // THE DITHER HAS TO LAND ON THE ART-PIXEL GRID, not on the device pixel
    // grid. uPixel is the size of one art-pixel in device pixels; the Bayer
    // matrix in the composite divides gl_FragCoord by it. Get this wrong and
    // the 4x4 ordered dither runs several times inside a single art-pixel,
    // speckling the one thing this whole setting exists to make solid.
    //
    // It has to be the WHOLE number above, not a measured ratio, and for the
    // sharper half of the same reason: bayer2 is mod(2x + 3y, 4), a diagonal
    // ramp, so a dither cell that does not divide the pixel grid evenly lays a
    // second diagonal moire over the first one. With the setting off there is
    // no art-pixel and this is the device pixel ratio it has always been.
    // scale === 1 means the step asked for less than this panel already is, so
    // there is no art-pixel to land on and the dither goes back to the device
    // ratio - otherwise a SUBTLE that happens to be doing nothing would still
    // dither differently from OFF.
    this._composite.uniforms.uPixel.value = scale > 1 ? scale : dpr;

    // Glow off the SCENE target rather than the canvas: the bloom is a halo
    // around what was actually drawn, and at 360 lines a quarter-res blur of
    // the panel would be four times the fill for a blur of an image that no
    // longer has that much in it.
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

  /**
   * GRAY MATTER's switch. 0 is the ordinary picture and 1 is the whole game in
   * grey; main.js writes it once a frame off `mods.mono`, so a versus handover
   * takes the colour away and gives it back with the build and nothing here
   * has to know that runs can swap.
   */
  setMono(on) {
    this._composite.uniforms.uMono.value = on ? 1 : 0;
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
