/**
 * brainScene — the site's particle brain, drawn with three.js on one canvas.
 *
 * Ported from `proto-cerveau/brain.js` (three r160 there, r184 here). Kept:
 * the points, the links with their travelling pulse, the dust ring, the
 * breathing of a lit region, the formation from scattered points and the
 * bloom, and the projection of a region's anchor to the screen (`project`,
 * where the comets of doc 173 §8 leave from). Left out because nothing on a
 * backdrop calls them: the wordmark and `setMorph` (aText), the retrieval
 * page's sense sphere and lexical hits, and the camera dive into one region.
 * They come back with the first surface that needs them.
 *
 * Every size is the CANVAS's, never the window's: the prototype read
 * `innerWidth` everywhere because its canvas was the page.
 *
 * The site only knows a night ground. Here the ground colour decides
 * (`groundMode`): on a light ground the points are laid as ink (normal
 * blending, no bloom), and a theme switch changes it in place, no rebuild.
 *
 * @module avatar/brainScene
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildArraysFrom, buildBrainArrays, createRng, regionAnchors, ENGINE_COUNT } from './brainCloud';
import { buildShapeArcs, buildShapeCloud, SHAPE_VIEWS, type BrainShape } from './brainShapes';
import type { PortraitFigure } from './portraitFigure';
import { FACE_SHAPE_COUNT, FACE_SHAPE_MAX, FACE_TEXTURE_WIDTH, FS, GEAR_MAX, HEAD_TILT_RAD, packFaceShapes, type FaceFrame } from './faceShapes';
import { HAIR_REST, createHairFollow } from './hairModel';
import { TIER_SPECS, groundMode, pointLook, type BrainTier, type GroundMode, type TourView } from './brainBackdropModel';

/** The site's camera field of view, in degrees: every framing depends on it. */
const FOV = 32;
const TAN = Math.tan((FOV / 2) * Math.PI / 180);

/** The colours, read from CSS variables by the caller. */
export interface BrainColors {
  ground: string;
  base: string;
  glow: string;
  /** One per engine, in ENGINE_SLUGS order. */
  engines: string[];
}

export interface BrainFrame extends TourView {
  /** 0 = scattered, 1 = formed. */
  form: number;
  /** A face's movements this frame (faceAnimator); at rest when absent. */
  face?: FaceFrame;
  /** Light every region keeps whatever the tour lights. */
  all: number;
  /** 0 = as formed; 1 = every point pulled into one ball of light that has gone out (a film's ending). */
  implode?: number;
}

export interface BrainScene {
  readonly tier: BrainTier;
  /** The GPU's unmasked name, when the driver gives it. */
  readonly gpu: string | null;
  render(frame: BrainFrame, time: number): void;
  /** CSS pixels; a pixel ratio, when given, is capped by the tier. */
  resize(width: number, height: number, pixelRatio?: number): void;
  setColors(colors: BrainColors): void;
  setMotion(on: boolean): void;
  /**
   * Where an engine region is on the canvas, in CSS pixels, as last rendered:
   * the point comets leave from (doc 173 §8).
   */
  project(region: number): { x: number; y: number };
  /** Where a face's eyes are on the canvas, CSS pixels, as last rendered: their middle and how far apart; null without a face. */
  projectEyes(): { x: number; y: number; spread: number } | null;
  /** The look the ground colour gave: ink by day, light by night. */
  readonly mode: GroundMode;
  dispose(): void;
}

export interface BrainSceneOptions {
  /** The figure the points form (brainShapes); the brain when absent. */
  shape?: BrainShape;
  /** A face of one's own (doc 180 §11): its points, arcs and rig replace the portrait `shape` names; the framing stays. */
  portrait?: PortraitFigure;
  /** Decides the tier once the GPU's name is known (it needs a context first). */
  pickTier: (gpu: string | null) => BrainTier;
  colors: BrainColors;
  motion: boolean;
  width: number;
  height: number;
  pixelRatio: number;
  /** A portrait's points wear its photo's colours; false = the theme's. True when absent. */
  trueColor?: boolean;
  /** A figure with contours draws its arcs; false = none. True when absent. */
  arcs?: boolean;
}

/**
 * Hair, shared by the points and the arcs (a hair contour moves with its
 * hair): it lags behind the head (uHairSwing), and a wave runs down each
 * strand whose sway grows while the head moves (uHair, hairModel; 0 without
 * hair). The tips move most. The outward billow eases through the middle: a
 * sign() split the hair in two.
 */
const WIND_GLSL = /* glsl */`
    b.xy += aHair * uHairSwing * uMotion;
    float hw = aHair * uHair * uMotion;
    float gust = 0.7 * sin(uTime * 1.3 - b.y * 2.4 + b.x * 0.6) + 0.5 * sin(uTime * 0.8 - b.y * 1.3 + 1.7);
    b += hw * vec3(gust + 0.4 * (b.x / (abs(b.x) + 0.3)) * (0.5 + 0.5 * sin(uTime * 0.9 - b.y * 2.0)), 0.25 * cos(uTime * 1.1 - b.x * 2.0), 0.5 * cos(uTime * 1.3 - b.y * 2.4));`;

/**
 * The head turns (uHeadYaw) and nods (uHeadPitch) about the base of the neck
 * (uHeadPivot): points above the chin all the way; the neck barely (a quarter
 * at most, eased in from its base), or its edge left with the head and the
 * neck vanished on one side; a short band under the chin blends the two; the
 * shoulders not at all (uHeadNeck: neck base y, chin y). The
 * face's relief (the skin's depth) makes a turned head show its volume. What
 * turns away from the viewer fades (headFade): the far cheek's points crowd
 * into a hard edge, and the edges and the hair behind would glow at the back
 * of a head that hides them.
 */
const HEAD_GLSL = /* glsl */`
    float nt = clamp((b.y - uHeadNeck.x) / (uHeadNeck.y - uHeadNeck.x), 0.0, 1.0);
    float hk = mix(0.25 * nt * nt, 1.0, smoothstep(uHeadNeck.y - 0.05, uHeadNeck.y, b.y));
    float headFade = 1.0;
    if (hk > 0.0) {
      vec3 q = b - uHeadPivot;
      float ya = uHeadYaw * hk, pa = uHeadPitch * hk;
      float facing = q.z / max(length(q.xz), 1e-4);
      q = vec3(q.x * cos(ya) + q.z * sin(ya), q.y, -q.x * sin(ya) + q.z * cos(ya));
      float facingNow = q.z / max(length(q.xz), 1e-4);
      // How far it turned away from the viewer, more for what already faced aside: the far edge and
      // what lies behind it fade out (their glow lit the back of the head), the face's middle barely.
      headFade = clamp(1.0 + (facingNow - facing) * 5.0 * (1.0 - max(facing, 0.0)), 0.0, 1.0);
      q = vec3(q.x, q.y * cos(pa) + q.z * sin(pa), -q.y * sin(pa) + q.z * cos(pa));
      b = uHeadPivot + q;
    }`;

const POINT_VS = /* glsl */`
  attribute vec3 aScatter; attribute float aRegion; attribute float aBright; attribute float aSeed; attribute float aHair; attribute float aPart; attribute float aIndex; attribute vec3 aColor;
  attribute float aGear;
  uniform float uTime, uForm, uSize, uPixel, uAll, uMotion, uGain, uFlap, uHair, uBlink, uLit, uEyeW, uTrueColor, uDayFace;
  // A robot's gears (doc 181 §12.3): each one's centre (x, y) and how far it has turned (z, radians).
  uniform vec3 uGear[${GEAR_MAX}];
  // How dark a face's own colours turn on a light ground, and how much more each point weighs
  // there (tuned on the real scene, in the browser: at 0.38 and x1 the face was a pale fog,
  // at 0.26 and x2.2 still light).
  const float DAY_INK = 0.12, DAY_WEIGHT = 3.2, DAY_LIT = 0.45, DAY_SHADE = 1.8, DAY_HAIR = 0.8;
  // A closed lid lies on the eyeball: it comes forward by this much of the eye's half-width in its
  // middle, and its light runs from LID_RIM at the rim to LID_RIM + LID_TOP on the dome.
  const float LID_BULGE = 0.55, LID_RIM = 0.6, LID_TOP = 0.65;
  uniform vec3 uEyeL, uEyeR; uniform vec2 uLook, uSquint, uWink, uHairSwing; uniform float uCross, uTremble, uSleep;
  uniform float uImplode; uniform vec3 uImplodeAt;
  uniform vec3 uHeadPivot; uniform vec2 uHeadNeck; uniform float uHeadYaw, uHeadPitch;
  uniform sampler2D uShapes; uniform float uW[${FACE_SHAPE_MAX}]; uniform int uShapePairs;
  uniform float uAct[${ENGINE_COUNT}]; uniform vec3 uCol[${ENGINE_COUNT}]; uniform vec3 uBase; uniform vec3 uGlow;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    int r = int(aRegion + 0.5);
    float act = uAll * 0.35;
    vec3 col = mix(uBase, uGlow, uAll * 0.6);
    for (int i = 0; i < ${ENGINE_COUNT}; i++) { if (i == r) { act = max(uAct[i], uAll); col = uCol[i]; } }
    act *= uLit;
    vec3 b = position;
    // A gear's points turn about its centre, before the face moves them (the head carries the gear).
    int gear = int(aGear + 0.5);
    for (int i = 0; i < ${GEAR_MAX}; i++) {
      if (i + 1 == gear) {
        vec2 d = b.xy - uGear[i].xy;
        float c = cos(uGear[i].z), s = sin(uGear[i].z);
        b.xy = uGear[i].xy + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
      }
    }
    // A face's eyes (aPart, faceShapes FACE_PARTS), measured on the point's place at rest. The lids
    // follow the eye's outline: the upper lid's edge starts on the arc at the top of the eye and,
    // as it closes, comes down onto the lower lid's curve, so it stays curved all the way (a straight
    // edge cut the eye like a blind). A blink closes the upper lid; a squint (uSquint, per eye)
    // closes it part way, the outer corner most, and lifts the lower lid along its own arc. What
    // the lids cover hides the iris and the white of the eye and shows the lid's points; the lashes ride the upper edge; the
    // irises follow the pointer.
    int part = int(aPart + 0.5);
    float shut = 1.0, lidLight = 1.0;
    if (part >= 1 && part <= 8) {
      bool left = part == 1 || part == 3 || part == 5 || part == 7;
      vec3 eye = left ? uEyeL : uEyeR;
      float sq = left ? uSquint.x : uSquint.y;
      float u = clamp((b.x - eye.x) / uEyeW, -1.0, 1.0);
      float o = left ? -u : u;
      float arch = sqrt(max(0.0, 1.0 - u * u));
      float top = eye.y + eye.z * arch, bottom = eye.y - eye.z * arch;
      float closed = eye.y - eye.z * arch * 0.95;
      // A wink closes one lid on its own (uWink, per eye).
      float topC = max(max(uBlink, left ? uWink.x : uWink.y), sq * 0.42 * (1.0 + 0.7 * o));
      float botC = sq * 0.25 * (1.0 + 0.5 * o);
      float lidY = mix(top, closed, topC);
      float lowY = mix(bottom, top, botC);
      float covered = max(step(lidY, b.y), step(b.y, lowY));
      if (part <= 2) { b.xy += uLook; b.x += left ? uCross : -uCross; shut = 1.0 - covered; }
      else if (part <= 4) {
        shut = covered;
        // Covering the eye, the lid is round, not a flat patch: it rises towards the viewer in
        // its middle (seen when the head turns) and catches the light there, its rim in shade.
        // The eye's bulge under the lid follows the eye (uLook): asleep and dreaming, it darts.
        float ud = clamp((b.x - eye.x - uLook.x) / uEyeW, -1.0, 1.0);
        float v = clamp((b.y - eye.y - uLook.y) / max(eye.z, 1e-4), -1.0, 1.0);
        float dome = sqrt(max(0.0, 1.0 - ud * ud - 0.5 * v * v));
        b.z += uEyeW * LID_BULGE * dome * covered;
        lidLight = mix(1.0, LID_RIM + LID_TOP * dome, covered);
      }
      else if (part <= 6) b.y += lidY - top;
      else shut = 1.0 - covered;
    }
    // A face's shade points (FACE_PARTS.SHADE): drawn on a light ground only.
    if (part == 9) shut *= uDayFace;
    // The face's movements (faceShapes): every point's offset for every movement waits in uShapes,
    // two movements per texel; each is added at its weight (uW, from faceAnimator).
    if (uShapePairs > 0) {
      int base = int(aIndex + 0.5) * uShapePairs;
      for (int s = 0; s < ${FACE_SHAPE_MAX / 2}; s++) {
        if (s >= uShapePairs) break;
        int tx = base + s;
        vec4 off = texelFetch(uShapes, ivec2(tx % ${FACE_TEXTURE_WIDTH}, tx / ${FACE_TEXTURE_WIDTH}), 0);
        b.xy += off.xy * uW[2 * s] + off.zw * uW[2 * s + 1];
      }
    }
    ${HEAD_GLSL}
    // A butterfly's wings beat about its body (uFlap = 0 for every other figure).
    float fa = uFlap * sin(uTime * 2.4) * uMotion;
    b = vec3(b.x * cos(fa), b.y, b.z + abs(b.x) * sin(fa));
    ${WIND_GLSL}
    float breathe = 0.6 + 0.4 * sin(uTime * 2.0 + aSeed * 6.2831);
    b += normalize(b + vec3(0.0, 0.0001, 0.0)) * act * 0.05 * breathe * uMotion;
    vec3 p = mix(aScatter, b, uForm);
    float t = uTime * uMotion;
    p += vec3(sin(t * 0.6 + aSeed * 40.0), cos(t * 0.5 + aSeed * 31.0), sin(t * 0.4 + aSeed * 23.0)) * (0.008 + 0.06 * (1.0 - uForm));
    // A face waking: each point trembles on its own, fast and tiny, a shimmer rather than a shake.
    p.xy += vec2(sin(uTime * 47.0 + aSeed * 71.0), cos(uTime * 53.0 + aSeed * 37.0)) * 0.006 * uTremble * uMotion;
    // Pulled into one ball (a film's ending): each point leaves at a moment of its own, joins a small
    // spinning sphere at uImplodeAt, the sphere shrinks and burns brighter, then goes out.
    float ip = smoothstep(0.0, 1.0, clamp(uImplode * 1.6 - aSeed * 0.6, 0.0, 1.0));
    float spin = uTime * 3.0 + aSeed * 40.0;
    vec3 shell = normalize(aScatter + vec3(0.0001)) * (0.07 - 0.055 * smoothstep(0.6, 0.95, uImplode));
    shell.xz = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * shell.xz;
    p = mix(p, uImplodeAt + shell, ip);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = mix(1.0, 0.62 + 0.38 * sin(t * (1.2 + aSeed * 2.5) + aSeed * 90.0), uMotion);
    gl_PointSize = uSize * (0.55 + aBright * 0.8) * (1.0 + act * 0.35) * uPixel / -mv.z;
    // A point with its own colour (a portrait's photo) wears it at rest; a lit region still tints it.
    vec3 own = mix(uBase, aColor, uTrueColor * step(0.001, aColor.r + aColor.g + aColor.b));
    // A face on a light ground (day): its colours become ink of their own hue, and a point weighs
    // as much as the photo is DARK there (hair, eyes, shade), like a pencil drawing. Lit as on a
    // dark ground, light pastel points on a light ground vanished.
    own = mix(own, own * DAY_INK, uDayFace);
    // There the drawing comes from the shade points, the hair and the eyes; the skin's own points,
    // most numerous where the skin is light, stay faint (DAY_LIT), or they darken the light skin.
    float drawn = part == 9 ? DAY_SHADE : (part >= 1 && part <= 8) ? 1.0 : DAY_LIT;
    // Hair keeps a steady weight there: its texture is not its darkness.
    float dayWeight = part == 10 ? DAY_HAIR : (1.0 - 0.85 * aBright) * drawn;
    float weight = mix(aBright, dayWeight, uDayFace);
    vColor = mix(own, col, clamp(act * 1.2, 0.0, 1.0));
    // A face asleep: its points go dim one after another, in an order of their own (their seed),
    // each down to a fifth of its light, slowly breathing.
    float th = fract(aSeed * 7.31);
    float dim = smoothstep(th, th + 0.25, uSleep * 1.25) * (0.85 + 0.15 * sin(uTime * 0.35 + aSeed * 40.0) * uMotion);
    vAlpha = (0.15 + 0.85 * weight) * (0.3 + 0.5 * act) * tw * uGain * shut * headFade * mix(1.0, DAY_WEIGHT, uDayFace) * (1.0 - 0.8 * dim)
      // On a light ground a point is ink: the lit dome takes less of it, the rim more.
      * mix(lidLight, 2.0 - lidLight, uDayFace)
      // In the ball a point burns brighter, until the ball goes out.
      * (1.0 + 2.5 * ip) * (1.0 - smoothstep(0.9, 1.0, uImplode));
  }`;
const POINT_FS = /* glsl */`
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    gl_FragColor = vec4(vColor, exp(-d * 14.0) * vAlpha);
    #include <colorspace_fragment>
  }`;
const LINE_VS = /* glsl */`
  attribute float aRegion; attribute float aT; attribute float aSeed;
  uniform float uForm, uAll, uTime, uFlap, uMotion;
  uniform float uAct[${ENGINE_COUNT}]; uniform vec3 uCol[${ENGINE_COUNT}]; uniform vec3 uGlow;
  varying vec3 vColor; varying float vAlpha; varying float vT; varying float vSeed;
  void main() {
    int r = int(aRegion + 0.5);
    float act = 0.0; vec3 col = uGlow;
    for (int i = 0; i < ${ENGINE_COUNT}; i++) { if (i == r) { act = uAct[i]; col = uCol[i]; } }
    act = r == ${ENGINE_COUNT} ? uAll : max(act, uAll * 0.6);
    vColor = col; vAlpha = act * uForm; vT = aT; vSeed = aSeed;
    float fa = uFlap * sin(uTime * 2.4) * uMotion;
    vec3 b = vec3(position.x * cos(fa), position.y, position.z + abs(position.x) * sin(fa));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(b, 1.0);
  }`;
const LINE_FS = /* glsl */`
  uniform float uTime, uMotion;
  varying vec3 vColor; varying float vAlpha; varying float vT; varying float vSeed;
  void main() {
    float head = fract(uTime * 0.45 * uMotion + vSeed);
    float pulse = smoothstep(0.14, 0.0, abs(vT - head));
    float a = vAlpha * (0.08 + 0.9 * pulse);
    if (a < 0.002) discard;
    gl_FragColor = vec4(vColor, a);
    #include <colorspace_fragment>
  }`;
// An arc: a spark glides down its contour chain, only while its region is lit by
// something happening on the board (never at rest: sparks at rest read as noise). A pale head, a
// comet's trail of its region's colour behind, a faint shimmer. Nothing between sparks.
const ARC_VS = /* glsl */`
  attribute float aT; attribute float aLen; attribute float aSeed; attribute float aRegion; attribute float aHair;
  uniform float uTime, uMotion, uHair, uPixel, uForm, uGain, uArcRest, uImplode; uniform vec2 uHairSwing;
  uniform vec3 uHeadPivot; uniform vec2 uHeadNeck; uniform float uHeadYaw, uHeadPitch;
  uniform float uAct[${ENGINE_COUNT}]; uniform vec3 uCol[${ENGINE_COUNT}]; uniform vec3 uGlow;
  varying vec3 vColor; varying float vAlpha;
  float h1(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    int r = int(aRegion + 0.5);
    float act = 0.0; vec3 col = uGlow;
    for (int i = 0; i < ${ENGINE_COUNT}; i++) { if (i == r) { act = uAct[i]; col = uCol[i]; } }
    vec3 b = position;
    ${HEAD_GLSL}
    ${WIND_GLSL}
    float speed = 0.55;
    float cyc = aLen / speed * (1.6 + 3.0 * h1(aSeed * 13.1)) + 0.6;
    float tt = uTime + aSeed * 97.0;
    float k = floor(tt / cyc);
    float fire = step(h1(k * 7.13 + aSeed * 31.7), mix(uArcRest, 0.55, clamp(act * 1.4, 0.0, 1.0))) * step(0.02, act + uArcRest);
    float d = (tt - k * cyc) * speed - aT * aLen;
    float trail = d < 0.0 || d > 0.6 ? 0.0 : exp(-d / 0.14) * smoothstep(0.0, 0.04, d);
    float q = floor(uTime * 12.0);
    float flick = 0.85 + 0.15 * h1(q + aSeed * 5.0 + aT * 41.0);
    float a = trail * fire * flick * uMotion * uForm * (1.0 - smoothstep(0.0, 0.4, uImplode));
    vec3 jit = vec3(h1(q + aT * 91.0 + aSeed), h1(q * 1.3 + aT * 57.0 + aSeed * 2.0), h1(q * 0.7 + aT * 33.0 + aSeed * 3.0)) - 0.5;
    b += jit * 0.006 * (1.2 - trail) * step(0.001, a);
    vec4 mv = modelViewMatrix * vec4(b, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.009 + 0.011 * trail) * uPixel / -mv.z;
    vColor = mix(col, vec3(1.0), trail * 0.35);
    vAlpha = a * 0.45 * act * uGain * headFade;
  }`;
const ARC_FS = /* glsl */`
  varying vec3 vColor; varying float vAlpha;
  void main() {
    if (vAlpha < 0.003) discard;
    vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
    if (d > 0.25) discard;
    gl_FragColor = vec4(vColor, exp(-d * 16.0) * vAlpha);
    #include <colorspace_fragment>
  }`;
const DUST_VS = /* glsl */`
  attribute float aSeed;
  uniform float uTime, uPixel, uForm, uMotion, uImplode;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.006 + aSeed * 0.012) * uPixel / -mv.z;
    vAlpha = (0.15 + 0.35 * aSeed) * (0.3 + 0.7 * uForm) * mix(1.0, 0.6 + 0.4 * sin(uTime * 0.8 + aSeed * 50.0), uMotion)
      * (1.0 - smoothstep(0.3, 0.9, uImplode));
  }`;
const DUST_FS = /* glsl */`
  uniform vec3 uGlow; varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
    if (d > 0.25) discard;
    gl_FragColor = vec4(uGlow, exp(-d * 12.0) * vAlpha);
    #include <colorspace_fragment>
  }`;

/** The unmasked renderer name, or null when the driver hides it. */
function readGpuName(renderer: THREE.WebGLRenderer): string | null {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return typeof name === 'string' && name.trim() ? name : null;
  } catch (err) {
    console.warn('[brain] could not read the GPU name:', err);
    return null;
  }
}

/**
 * Build the scene on `canvas`. Returns null when WebGL is unavailable, or when
 * building fails once the context exists (the context is then given back): the
 * caller shows nothing and says so.
 */
export function createBrainScene(canvas: HTMLCanvasElement, opts: BrainSceneOptions): BrainScene | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (err) {
    console.error('[brain] WebGL unavailable, the backdrop stays empty', err);
    return null;
  }
  try {
    return buildScene(renderer, opts);
  } catch (err) {
    console.error('[brain] could not build the scene, the backdrop stays empty', err);
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  }
}

/** Everything that needs a live context: the tier, the geometry, the passes. */
function buildScene(renderer: THREE.WebGLRenderer, opts: BrainSceneOptions): BrainScene {
  const gpu = readGpuName(renderer);
  const tier = opts.pickTier(gpu);
  const spec = TIER_SPECS[tier];
  renderer.setPixelRatio(Math.min(opts.pixelRatio, spec.maxPixelRatio));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  const root = new THREE.Group();
  scene.add(root);
  const brainGroup = new THREE.Group();
  brainGroup.position.y = 0.12;
  root.add(brainGroup);

  const U = {
    uTime: { value: 0 }, uForm: { value: 1 }, uAll: { value: 0 }, uImplode: { value: 0 }, uImplodeAt: { value: new THREE.Vector3() },
    uMotion: { value: opts.motion ? 1 : 0 }, uFlap: { value: 0 }, uHair: { value: 0 }, uHairSwing: { value: new THREE.Vector2() },
    uHeadPivot: { value: new THREE.Vector3() }, uHeadNeck: { value: new THREE.Vector2(-10, -9) }, uHeadYaw: { value: 0 }, uHeadPitch: { value: 0 }, uBlink: { value: 0 }, uLit: { value: 1 }, uTrueColor: { value: 0 }, uDayFace: { value: 0 }, uArcRest: { value: 0 },
    uEyeL: { value: new THREE.Vector3() }, uEyeR: { value: new THREE.Vector3() }, uLook: { value: new THREE.Vector2() }, uSquint: { value: new THREE.Vector2() }, uWink: { value: new THREE.Vector2() }, uCross: { value: 0 }, uTremble: { value: 0 }, uSleep: { value: 0 }, uEyeW: { value: 1 },
    uShapes: { value: null as THREE.DataTexture | null }, uW: { value: new Array<number>(FACE_SHAPE_MAX).fill(0) }, uShapePairs: { value: 0 }, uSize: { value: 0.016 }, uGain: { value: 1 }, uPixel: { value: 1000 },
    uAct: { value: new Array<number>(ENGINE_COUNT).fill(0) },
    uCol: { value: Array.from({ length: ENGINE_COUNT }, () => new THREE.Color()) },
    uBase: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uGear: { value: Array.from({ length: GEAR_MAX }, () => new THREE.Vector3()) },
  };

  const shape = opts.shape ?? 'brain';
  const { brain, links, dust } = shape === 'brain'
    ? buildBrainArrays(spec.points, spec.dust)
    : buildArraysFrom(r => buildShapeCloud(shape, spec.points, r, opts.portrait), spec.dust);
  U.uFlap.value = shape === 'brain' ? 0 : SHAPE_VIEWS[shape].flap;
  // The hair's full sway; how much of it shows follows the head (hairModel).
  const hairFull = shape === 'brain' ? 0 : SHAPE_VIEWS[shape].hair;
  U.uHair.value = hairFull * HAIR_REST;
  const hair = hairFull > 0 ? createHairFollow() : null;
  let lastTime = -1;
  U.uLit.value = shape === 'brain' ? 1 : SHAPE_VIEWS[shape].litGlow ?? 1;
  const face = shape === 'brain' ? undefined : opts.portrait?.face ?? SHAPE_VIEWS[shape].face;
  const turn = shape === 'brain' ? 1 : SHAPE_VIEWS[shape].turn ?? 1;
  if (face) {
    const [l, rr] = face.eyes;
    if (l) U.uEyeL.value.set(l.x, l.y, l.half);
    if (rr) U.uEyeR.value.set(rr.x, rr.y, rr.half);
    if (l) U.uEyeW.value = l.halfWidth;
    U.uHeadPivot.value.set(...face.head.pivot);
    U.uHeadNeck.value.set(face.head.neckBase, face.head.chin);
  }
  // A robot's gears: their centres now, their turn each frame. Side by side they mesh: every other
  // one turns the other way, and a smaller one turns faster (the first gear's radius is the unit).
  const gears = (face?.gears ?? []).slice(0, GEAR_MAX);
  gears.forEach((g, i) => U.uGear.value[i]?.set(g.x, g.y, 0));
  const gearRate = gears.map((g, i) => (i % 2 === 0 ? 1 : -1) * ((gears[0]?.r ?? g.r) / g.r));
  const shapeGain = shape === 'brain' ? 1 : SHAPE_VIEWS[shape].gain;
  const anchors = regionAnchors(brain);
  const tmp = new THREE.Vector3();

  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(brain.pos, 3));
  pointsGeo.setAttribute('aScatter', new THREE.BufferAttribute(brain.scatter, 3));
  pointsGeo.setAttribute('aRegion', new THREE.BufferAttribute(brain.reg, 1));
  pointsGeo.setAttribute('aBright', new THREE.BufferAttribute(brain.bright, 1));
  pointsGeo.setAttribute('aSeed', new THREE.BufferAttribute(brain.seed, 1));
  pointsGeo.setAttribute('aHair', new THREE.BufferAttribute(brain.hair ?? new Float32Array(brain.seed.length), 1));
  pointsGeo.setAttribute('aPart', new THREE.BufferAttribute(brain.part ?? new Float32Array(brain.seed.length), 1));
  pointsGeo.setAttribute('aGear', new THREE.BufferAttribute(brain.gear ?? new Float32Array(brain.seed.length), 1));
  // The face's movements, as a float texture the shader reads by the point's index; an empty
  // 1×1 one for a figure without a face (a sampler must have a texture bound).
  const n = brain.seed.length;
  pointsGeo.setAttribute('aColor', new THREE.BufferAttribute(brain.color ?? new Float32Array(n * 3), 3));
  U.uTrueColor.value = brain.color && opts.trueColor !== false ? 1 : 0;
  pointsGeo.setAttribute('aIndex', new THREE.BufferAttribute(Float32Array.from({ length: n }, (_, i) => i), 1));
  const packed = brain.shapes ? packFaceShapes(brain.shapes, n) : null;
  const shapesTex = packed
    ? new THREE.DataTexture(packed.data, packed.width, packed.height, THREE.RGBAFormat, THREE.FloatType)
    : new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  shapesTex.needsUpdate = true;
  U.uShapes.value = shapesTex;
  U.uShapePairs.value = packed ? packed.pairs : 0;
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const pointsMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: POINT_VS, fragmentShader: POINT_FS, ...additive });
  const points = new THREE.Points(pointsGeo, pointsMat);
  points.frustumCulled = false;
  brainGroup.add(points);

  const linesGeo = new THREE.BufferGeometry();
  linesGeo.setAttribute('position', new THREE.BufferAttribute(links.positions, 3));
  linesGeo.setAttribute('aRegion', new THREE.BufferAttribute(links.region, 1));
  linesGeo.setAttribute('aT', new THREE.BufferAttribute(links.t, 1));
  linesGeo.setAttribute('aSeed', new THREE.BufferAttribute(links.seed, 1));
  const linesMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: LINE_VS, fragmentShader: LINE_FS, ...additive });
  const lines = new THREE.LineSegments(linesGeo, linesMat);
  lines.frustumCulled = false;
  lines.visible = shape === 'brain' || !SHAPE_VIEWS[shape].noLinks;
  brainGroup.add(lines);

  // The contour arcs, for a figure that has contours.
  const arcs = opts.arcs === false ? null : buildShapeArcs(shape, createRng(7), opts.portrait);
  let arcsGeo: THREE.BufferGeometry | null = null;
  let arcsMat: THREE.ShaderMaterial | null = null;
  if (arcs && arcs.t.length > 0) {
    arcsGeo = new THREE.BufferGeometry();
    arcsGeo.setAttribute('position', new THREE.BufferAttribute(arcs.pos, 3));
    arcsGeo.setAttribute('aT', new THREE.BufferAttribute(arcs.t, 1));
    arcsGeo.setAttribute('aLen', new THREE.BufferAttribute(arcs.len, 1));
    arcsGeo.setAttribute('aSeed', new THREE.BufferAttribute(arcs.seed, 1));
    arcsGeo.setAttribute('aRegion', new THREE.BufferAttribute(arcs.reg, 1));
    arcsGeo.setAttribute('aHair', new THREE.BufferAttribute(arcs.hair, 1));
    arcsMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: ARC_VS, fragmentShader: ARC_FS, ...additive });
    const arcPoints = new THREE.Points(arcsGeo, arcsMat);
    arcPoints.frustumCulled = false;
    brainGroup.add(arcPoints);
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust.positions, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dust.seed, 1));
  const dustMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: DUST_VS, fragmentShader: DUST_FS, ...additive });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.rotation.x = 0.28;
  dustPoints.frustumCulled = false;
  dustPoints.visible = shape === 'brain' || !SHAPE_VIEWS[shape].noDust;
  scene.add(dustPoints);

  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  let output: OutputPass | null = null;
  if (spec.bloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.18, 0.32);
    composer.addPass(bloom);
    output = new OutputPass();
    composer.addPass(output);
  }

  let width = 1, height = 1;
  const ground = new THREE.Color();
  const materials = [pointsMat, linesMat, dustMat, ...(arcsMat ? [arcsMat] : [])];
  // The bloom runs only at night: on a light ground it is haze, not glow.
  let useBloom = false;
  let mode: GroundMode = 'night';

  function setColors(c: BrainColors): void {
    U.uBase.value.set(c.base);
    U.uGlow.value.set(c.glow);
    U.uCol.value.forEach((col, i) => col.set(c.engines[i] ?? c.base));
    ground.set(c.ground);
    // The ground decides the look (the colour holds LINEAR values here).
    mode = groundMode(ground.r, ground.g, ground.b);
    const blending = mode === 'day' ? THREE.NormalBlending : THREE.AdditiveBlending;
    for (const m of materials) {
      if (m.blending !== blending) { m.blending = blending; m.needsUpdate = true; }
    }
    useBloom = composer !== null && mode === 'night';
    U.uDayFace.value = mode === 'day' && face ? 1 : 0;
    const look = pointLook(mode, useBloom);
    U.uGain.value = look.gain * shapeGain;
    U.uSize.value = look.size;
    // 🪤 Measured on three 0.184 (2026-10-23, headless): the composer clears its
    // offscreen target with the sRGB value of the colour and OutputPass encodes
    // it a second time, so #0e0f13 came out (66, 69, 77), grey. The prototype
    // met the same on r160. Pre-compensate on the bloom path only; the direct
    // path already gives (14, 15, 19).
    if (useBloom) renderer.setClearColor(new THREE.Color(ground.r, ground.g, ground.b).convertSRGBToLinear(), 1);
    else renderer.setClearColor(ground, 1);
  }

  function resize(w: number, h: number, pixelRatio?: number): void {
    if (pixelRatio !== undefined) renderer.setPixelRatio(Math.min(pixelRatio, spec.maxPixelRatio));
    width = Math.max(1, Math.round(w));
    height = Math.max(1, Math.round(h));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    }
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    U.uPixel.value = s.y / (2 * TAN);
  }

  /** Back far enough that the brain fits a narrow canvas too. */
  const camFit = (c: number): number => Math.max(c, 2.7 / (2 * TAN * (width / height)));

  function render(f: BrainFrame, time: number): void {
    U.uTime.value = time;
    U.uForm.value = f.form;
    U.uAll.value = f.all;
    U.uImplode.value = Math.max(0, Math.min(1, f.implode ?? 0));
    for (let i = 0; i < ENGINE_COUNT; i++) U.uAct.value[i] = f.act[i] ?? 0;
    const motion = U.uMotion.value;
    const wob = motion * turn * (0.1 * Math.sin(time * 0.23) + 0.04 * Math.sin(time * 0.61));
    if (face) {
      // The face as the animator left it; the scene only hands it to the shader.
      const ff = f.face;
      U.uLook.value.set((ff?.look.x ?? 0) * face.look[0], (ff?.look.y ?? 0) * face.look[1]);
      U.uCross.value = (ff?.cross ?? 0) * face.look[0];
      U.uTremble.value = ff?.tremble ?? 0;
      U.uSleep.value = ff?.sleep ?? 0;
      U.uBlink.value = ff?.blink ?? 0;
      U.uSquint.value.set(ff?.squint[0] ?? 0, ff?.squint[1] ?? 0);
      U.uWink.value.set(ff?.wink[0] ?? 0, ff?.wink[1] ?? 0);
      for (let i = 0; i < FACE_SHAPE_COUNT; i++) U.uW.value[i] = ff?.weights[i] ?? 0;
      U.uHeadYaw.value = ff?.head.yaw ?? 0;
      U.uHeadPitch.value = ff?.head.pitch ?? 0;
      const turnBy = ff?.gearTurn ?? 0;
      gearRate.forEach((rate, i) => { const u = U.uGear.value[i]; if (u) u.z = turnBy * rate; });
    }
    if (hair) {
      const dt = lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, time - lastTime));
      const h = hair.step(dt, {
        yaw: f.ry + wob + (f.face?.head.yaw ?? 0), pitch: f.rx + (f.face?.head.pitch ?? 0),
        tilt: (f.face?.weights[FS.headTilt] ?? 0) * HEAD_TILT_RAD,
      });
      U.uHair.value = hairFull * h.amp;
      U.uHairSwing.value.set(h.swing[0], h.swing[1]);
    }
    lastTime = time;
    root.rotation.set(f.rx, f.ry + wob, 0);
    camera.position.z = camFit(f.cam);
    dustPoints.rotation.y = time * 0.02 * motion;
    if (useBloom && composer) composer.render(); else renderer.render(scene, camera);
  }

  /** The anchor through the matrices of the last render (rendering updates them). */
  function project(region: number): { x: number; y: number } {
    const k = Math.min(ENGINE_COUNT - 1, Math.max(0, region)) * 3;
    tmp.set(anchors[k] ?? 0, anchors[k + 1] ?? 0, anchors[k + 2] ?? 0).applyMatrix4(brainGroup.matrixWorld).project(camera);
    return { x: (tmp.x + 1) / 2 * width, y: (1 - tmp.y) / 2 * height };
  }

  /** The eyes sit about this far in front of the head's middle (portraitFigure's depth at the eyes). */
  const EYE_Z = 0.5;
  function projectEyes(): { x: number; y: number; spread: number } | null {
    const [l, rr] = face?.eyes ?? [];
    if (!l || !rr) return null;
    const at = (x: number, y: number) => {
      tmp.set(x, y, EYE_Z).applyMatrix4(brainGroup.matrixWorld).project(camera);
      return { x: (tmp.x + 1) / 2 * width, y: (1 - tmp.y) / 2 * height };
    };
    const a = at(l.x, l.y), b = at(rr.x, rr.y);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, spread: Math.hypot(b.x - a.x, b.y - a.y) };
  }

  setColors(opts.colors);
  resize(opts.width, opts.height);

  return {
    tier,
    gpu,
    render,
    resize,
    setColors,
    setMotion(on: boolean) { U.uMotion.value = on ? 1 : 0; },
    project,
    projectEyes,
    get mode() { return mode; },
    dispose() {
      pointsGeo.dispose(); linesGeo.dispose(); dustGeo.dispose();
      pointsMat.dispose(); linesMat.dispose(); dustMat.dispose();
      arcsGeo?.dispose(); arcsMat?.dispose();
      shapesTex.dispose();
      bloom?.dispose();
      output?.dispose();
      composer?.dispose();
      renderer.dispose();
      // Chromium caps live WebGL contexts per page: without this, a layer
      // switched on and off ten times holds ten contexts until the GC runs.
      renderer.forceContextLoss();
    },
  };
}
