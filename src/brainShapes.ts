/**
 * brainShapes — other figures for the backdrop: a butterfly, a skull, a lion,
 * the faces (docs 173 §8.3, 180). The faces live in portraitFigure (one
 * per portrait: womanFigure, manFigure, galleryFigures); their
 * movements in faceShapes and faceAnimator.
 *
 * Each one is a point generator with the same five engine regions as the
 * brain, so everything built on the regions — the glow, the links, the swing,
 * the comets, the click wave, a region left lit while its app is open — works
 * on any figure unchanged. The brain itself stays in brainCloud, untouched:
 * its points are the site's, pinned by checksum.
 *
 * Coordinates: y up, z towards the camera at rest, within the brain's extent
 * (about 2.7 units across) so the camera frames every figure the same way.
 *
 * @module avatar/brainShapes
 */
import type { BrainCloud, Rng } from './brainCloud';
import type { FaceRig } from './faceShapes';
import { AGENTS, HANDS, MEMORY, VISION, VOICE, cloudFrom, dir, hash, type ArcArrays, type Vec3 } from './shapeKit';
import { MAN } from './manFigure';
import { AMARA, BEAR, CLAIRE, KENJI, KITTEN, KOFI, LABRADOR, LEO, MEI, SHEPHERD } from './galleryFigures';
import { isPortraitShape, type PortraitShape } from './portraitIds';
import type { PortraitFigure } from './portraitFigure';
import { WOMAN } from './womanFigure';

/** The figures the backdrop can draw. `brain` is the site's. */
export const BRAIN_SHAPES = ['brain', 'butterfly', 'skull', 'lion', 'woman', 'man', 'claire', 'amara', 'kofi', 'mei', 'kenji', 'kitten', 'shepherd', 'labrador', 'bear', 'leo'] as const;
export type BrainShape = (typeof BRAIN_SHAPES)[number];


/** A figure's framings: one per region (the swing's target), and the one at rest. */
export interface ShapeViews {
  regions: ReadonlyArray<{ ry: number; rx: number; cam: number }>;
  front: { ry: number; rx: number; cam: number };
  /** The wings' beat, in radians at the top of the stroke; 0 = none. */
  flap: number;
  /** How far the wind moves a hair tip, in units; 0 = no hair. */
  hair: number;
  /** No links between the points: a stippled figure reads as shading, a link as a drawn line. */
  noLinks?: true;
  /** No dust ring around the figure: around a face it pulls the eye away from hers. */
  noDust?: true;
  /** How much of the pointer's gaze the head itself turns (1 = all); the eyes, when there is a face, take the rest. */
  turn?: number;
  /** A face the shader animates: blinks, eyes on the pointer, lips. */
  face?: FaceRig;
  /** How much a lit region lights its points (1 = all); a figure with arcs lets them carry the light. */
  litGlow?: number;
  /**
   * The points' own light, times the look's gain. A figure whose points crowd
   * on thin rims (the butterfly) saturates the bloom at the brain's gain.
   */
  gain: number;
}

/* ── The butterfly ──────────────────────────────────────────────────────────
 * Wings from the butterfly curve (T. Fay): r = e^sin θ − 2 cos 4θ + sin⁵((2θ − π)/24),
 * spread in the x-y plane facing the camera, the body along y. Points crowd
 * towards each wing's rim and along a few veins, so the outline reads from far.
 * Regions: forewings = memory, head = vision, hindwings = voice, body = hands,
 * antennae = agents. */
const fay = (t: number): number => Math.exp(Math.sin(t)) - 2 * Math.cos(4 * t) + Math.pow(Math.sin((2 * t - Math.PI) / 24), 5);
const WING_SCALE = 0.3;

function butterflyPoint(r: Rng): { p: Vec3; region: number; bright: number; cortex: boolean } {
  const u = r.rand();
  if (u < 0.88) {
    // A wing point: an angle, then a distance from the body, rim-heavy.
    const t = r.rnd(0, Math.PI * 2);
    const R = fay(t);
    const rim = r.rand() < 0.28;
    // Never near the body: every wing curve starts there, so points would pile up.
    const k = rim ? 1 - r.rand() * 0.05 : 0.22 + 0.78 * Math.sqrt(r.rand());
    // Veins: a few angles where points line up.
    const vein = Math.abs(Math.sin(t * 9)) < 0.06;
    const x = Math.cos(t) * R * k * WING_SCALE;
    const y = Math.sin(t) * R * k * WING_SCALE + 0.05;
    const z = (r.rand() - 0.5) * 0.03;
    const fore = y > 0.05;
    return { p: [x, y, z], region: fore ? MEMORY : VOICE, bright: rim || vein ? r.rnd(0.45, 0.8) : r.rnd(0.2, 0.55), cortex: true };
  }
  if (u < 0.915) {
    // The body: a slender ellipsoid along y.
    const d = dir(r);
    return { p: [d[0] * 0.05, -0.25 + d[1] * 0.55, d[2] * 0.05], region: HANDS, bright: r.rnd(0.25, 0.55), cortex: true };
  }
  if (u < 0.923) {
    const d = dir(r);
    return { p: [d[0] * 0.09, 0.36 + d[1] * 0.09, d[2] * 0.09], region: VISION, bright: r.rnd(0.4, 0.75), cortex: true };
  }
  // The antennae: two curls from the head.
  const side = r.rand() < 0.5 ? -1 : 1;
  const s = r.rand();
  const x = side * (0.04 + s * 0.32), y = 0.4 + s * 0.55 - s * s * 0.15;
  const curl = s > 0.88 ? (s - 0.88) * 2 : 0;
  return { p: [x + side * curl * 0.2, y - curl * 0.3, 0], region: AGENTS, bright: r.rnd(0.5, 1), cortex: true };
}

/* ── The skull ──────────────────────────────────────────────────────────────
 * A signed distance field (cranium, face, jaw and cheekbones melted together,
 * eye sockets and nasal cavity carved out); points are kept on its surface
 * shell. A row of teeth is added on its own. Facing the camera at rest.
 * Regions: cranium = memory, eyes = vision, jaw and teeth = voice,
 * cheekbones and temples = hands, forehead = agents. */
function ellipsoid(p: Vec3, c: Vec3, rad: Vec3): number {
  const x = (p[0] - c[0]) / rad[0], y = (p[1] - c[1]) / rad[1], z = (p[2] - c[2]) / rad[2];
  return (Math.sqrt(x * x + y * y + z * z) - 1) * Math.min(rad[0], rad[1], rad[2]);
}
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
const EYES: Vec3[] = [[-0.33, -0.02, 0.78], [0.33, -0.02, 0.78]];

function skullField(p: Vec3): number {
  let d = ellipsoid(p, [0, 0.28, -0.1], [0.92, 0.88, 1.08]);
  d = smin(d, ellipsoid(p, [0, -0.32, 0.42], [0.6, 0.42, 0.42]), 0.25);
  d = smin(d, ellipsoid(p, [0, -0.72, 0.3], [0.5, 0.26, 0.42]), 0.18);
  d = smin(d, ellipsoid(p, [-0.56, -0.2, 0.5], [0.2, 0.15, 0.22]), 0.12);
  d = smin(d, ellipsoid(p, [0.56, -0.2, 0.5], [0.2, 0.15, 0.22]), 0.12);
  for (const e of EYES) d = Math.max(d, -ellipsoid(p, e, [0.21, 0.19, 0.26]));
  d = Math.max(d, -ellipsoid(p, [0, -0.32, 0.86], [0.09, 0.15, 0.22]));
  return d;
}

function skullRegion(p: Vec3): number {
  if (p[1] < -0.52) return VOICE;
  for (const e of EYES) if (Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]) < 0.36) return VISION;
  if (Math.abs(p[0]) > 0.5 && p[1] < 0.15) return HANDS;
  if (p[2] > 0.45 && p[1] > 0.12) return AGENTS;
  if (p[1] > 0.2 || p[2] < -0.2) return MEMORY;
  return -1;
}

function skullPoint(r: Rng): { p: Vec3; region: number; bright: number; cortex: boolean } {
  if (r.rand() < 0.06) {
    // The teeth: two rows along an arc in front of the jaw.
    const s = r.rnd(-1, 1);
    const upper = r.rand() < 0.5;
    const x = s * 0.3;
    const z = 0.74 - 0.35 * s * s;
    const tooth = Math.abs(Math.sin(s * 14)) > 0.25;
    const y = (upper ? -0.56 : -0.66) + r.rnd(-0.04, 0.04);
    return { p: [x, y, z], region: VOICE, bright: tooth ? r.rnd(0.6, 1) : r.rnd(0.1, 0.3), cortex: true };
  }
  for (let tries = 0; tries < 400; tries++) {
    const p: Vec3 = [r.rnd(-1.05, 1.05), r.rnd(-1.05, 1.2), r.rnd(-1.25, 1.05)];
    const d = skullField(p);
    if (Math.abs(d) > 0.025) continue;
    const region = skullRegion(p);
    return { p, region, bright: r.rnd(0.35, 1), cortex: region >= 0 };
  }
  return { p: [0, 0.3, 0], region: -1, bright: 0.2, cortex: false };
}

/* ── The lion's head ────────────────────────────────────────────────────────
 * Seen from the front a carved volume reads as a ball, so the face is drawn
 * like the butterfly's veins: bright strokes (almond eyes, the long nose
 * bridge, the nose, the muzzle pads and the mouth, the ears) laid on a dim
 * face surface. The mane is a fixed set of locks: each point picks one lock
 * and a place along it, so the points line up into hair, not a cloud.
 * Regions: mane = memory, eyes = vision, nose, muzzle and mouth = voice,
 * ears = hands, brow = agents. */
type Stroke = { at: (t: number) => [number, number]; region: number; weight: number };

/** The face's depth at (x, y): a head ellipsoid plus the muzzle's bulge. */
function lionFaceZ(x: number, y: number): number {
  const h = 1 - (x / 0.62) ** 2 - ((y - 0.05) / 0.68) ** 2;
  const head = 0.62 * Math.sqrt(Math.max(0, h));
  const muzzle = 0.28 * Math.exp(-((x / 0.3) ** 2 + ((y + 0.28) / 0.24) ** 2));
  return head + muzzle;
}

const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number) =>
  (t: number): [number, number] => {
    const a = a0 + (a1 - a0) * t;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  };
const line = (x0: number, y0: number, x1: number, y1: number) =>
  (t: number): [number, number] => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];

const LION_STROKES: Stroke[] = [];
for (const side of [-1, 1]) {
  // Almond eyes, slanting up and out, and the pupil.
  LION_STROKES.push({ at: t => [side * (0.11 + 0.25 * t), 0.13 + 0.09 * t + 0.055 * Math.sin(Math.PI * t)], region: VISION, weight: 3 });
  LION_STROKES.push({ at: t => [side * (0.11 + 0.25 * t), 0.13 + 0.09 * t - 0.035 * Math.sin(Math.PI * t)], region: VISION, weight: 3 });
  LION_STROKES.push({ at: arc(side * 0.24, 0.17, 0.025, 0.035, 0, Math.PI * 2), region: VISION, weight: 1.5 });
  // The brow above each eye.
  LION_STROKES.push({ at: t => [side * (0.06 + 0.34 * t), 0.3 + 0.06 * t - 0.03 * Math.sin(Math.PI * t)], region: AGENTS, weight: 2 });
  // The long nose bridge, widening to the nose.
  LION_STROKES.push({ at: line(side * 0.06, 0.22, side * 0.1, -0.1), region: VOICE, weight: 2.5 });
  // The muzzle pads, their lower halves.
  LION_STROKES.push({ at: arc(side * 0.13, -0.3, 0.14, 0.11, -Math.PI * 1.05, 0.05), region: VOICE, weight: 3 });
  // The mouth: from under the nose, out and down.
  LION_STROKES.push({ at: t => [side * 0.17 * t, -0.33 - 0.06 * t * t], region: VOICE, weight: 1.5 });
  // The ears: a round outer rim and an inner one.
  LION_STROKES.push({ at: arc(side * 0.44, 0.6, 0.15, 0.15, 0, Math.PI), region: HANDS, weight: 3 });
  LION_STROKES.push({ at: arc(side * 0.44, 0.6, 0.08, 0.08, 0.2, Math.PI - 0.2), region: HANDS, weight: 1.5 });
  // The cheek line down to the chin.
  LION_STROKES.push({ at: t => [side * (0.5 - 0.3 * t), -0.05 - 0.45 * t], region: -1, weight: 2.5 });
}
// The nose: a wide triangle, its top edge, and the line down to the mouth.
LION_STROKES.push({ at: line(-0.13, -0.1, 0.13, -0.1), region: VOICE, weight: 2 });
LION_STROKES.push({ at: line(-0.13, -0.1, 0, -0.22), region: VOICE, weight: 1.8 });
LION_STROKES.push({ at: line(0.13, -0.1, 0, -0.22), region: VOICE, weight: 1.8 });
LION_STROKES.push({ at: line(0, -0.22, 0, -0.33), region: VOICE, weight: 1 });
// The chin.
LION_STROKES.push({ at: arc(0, -0.5, 0.2, 0.06, Math.PI * 0.15, Math.PI * 0.85), region: VOICE, weight: 1.5 });
const STROKE_TOTAL = LION_STROKES.reduce((n, st) => n + st.weight, 0);
/** What a weighted pick lands on past the last stroke (rounding): never drawn in practice. */
const NO_STROKE: Stroke = LION_STROKES[LION_STROKES.length - 1] ?? { at: () => [0, 0], region: -1, weight: 0 };

const MANE_LOCKS = 84;

function lionPoint(r: Rng): { p: Vec3; region: number; bright: number; cortex: boolean } {
  const u = r.rand();
  if (u < 0.5) {
    // A mane lock: inner and outer rings, each lock an S-curve that tapers.
    const k = Math.floor(r.rand() * MANE_LOCKS);
    const outer = k % 2 === 1;
    const a = (k / MANE_LOCKS) * Math.PI * 2 + (hash(k) - 0.5) * 0.12;
    const ring = outer ? 0.62 : 0.5;
    const len = (outer ? 0.55 : 0.4) + hash(k + 99) * 0.3;
    const bend = (hash(k + 7) - 0.5) * 0.9;
    const t = Math.pow(r.rand(), 0.8);
    const w = (1 - t) * 0.045 * (r.rand() * 2 - 1);
    // The lock's own direction swings by `bend`, more towards the tip.
    const d = a + bend * Math.sin(t * Math.PI * 0.8);
    const rr = ring + len * t;
    // Lions' manes fall: the lower half reaches further down.
    const sag = Math.sin(a) < 0 ? 1.12 : 1;
    const x = Math.cos(d) * rr - Math.sin(d) * w;
    const y = 0.05 + (Math.sin(d) * rr + Math.cos(d) * w) * sag;
    const z = -0.05 - 0.3 * t - (outer ? 0.12 : 0) + (r.rand() - 0.5) * 0.04;
    return { p: [x, y, z], region: MEMORY, bright: r.rnd(0.35, 0.8) * (1 - 0.45 * t), cortex: true };
  }
  if (u < 0.75) {
    // A stroke of the face.
    let pick = r.rand() * STROKE_TOTAL;
    const st = LION_STROKES.find(cand => (pick -= cand.weight) <= 0) ?? NO_STROKE;
    const [x0, y0] = st.at(r.rand());
    const x = x0 + (r.rand() - 0.5) * 0.014, y = y0 + (r.rand() - 0.5) * 0.014;
    const ear = st.region === HANDS;
    const z = ear ? 0.05 : lionFaceZ(x, y) + 0.01;
    return { p: [x, y, z], region: st.region, bright: r.rnd(0.6, 1), cortex: st.region >= 0 };
  }
  // The face itself, dim, so the strokes carry the drawing.
  for (let tries = 0; tries < 400; tries++) {
    const x = r.rnd(-0.62, 0.62), y = r.rnd(-0.62, 0.72);
    if ((x / 0.62) ** 2 + ((y - 0.05) / 0.68) ** 2 > 1) continue;
    const region = y > 0.28 && Math.abs(x) < 0.35 ? AGENTS : y < -0.15 && Math.abs(x) < 0.32 ? VOICE : -1;
    return { p: [x, y, lionFaceZ(x, y) - r.rand() * 0.02], region, bright: r.rnd(0.12, 0.35), cortex: false };
  }
  return { p: [0, 0, 0.5], region: -1, bright: 0.2, cortex: false };
}

/** The figures drawn from a portrait photo. */
const PORTRAITS: Record<PortraitShape, PortraitFigure> = { woman: WOMAN, man: MAN, claire: CLAIRE, amara: AMARA, kofi: KOFI, mei: MEI, kenji: KENJI, kitten: KITTEN, shepherd: SHEPHERD, labrador: LABRADOR, bear: BEAR, leo: LEO };

/** A figure's contour arcs, or null when it has none. `portrait` is a face of one's own, drawn in a portrait's place. */
export function buildShapeArcs(shape: BrainShape, r: Rng, portrait?: PortraitFigure): ArcArrays | null {
  if (portrait) return portrait.arcs(r);
  return isPortraitShape(shape) ? PORTRAITS[shape].arcs(r) : null;
}

/** The points of a figure other than the brain. `portrait` is a face of one's own, framed like the portraits. */
export function buildShapeCloud(shape: Exclude<BrainShape, 'brain'>, n: number, r: Rng, portrait?: PortraitFigure): BrainCloud {
  if (portrait) return portrait.buildCloud(n, r);
  if (isPortraitShape(shape)) return PORTRAITS[shape].buildCloud(n, r);
  const point = shape === 'butterfly' ? butterflyPoint : shape === 'skull' ? skullPoint : lionPoint;
  return cloudFrom(n, r, () => point(r));
}

/** How a portrait is framed, turns and lights: every face the same, only its rig differs. */
function portraitView(fig: PortraitFigure): ShapeViews {
  return {
    // A face turns little and slowly: wide, quick swings read as a mask spun around.
    regions: [
      { ry: 0.22, rx: 0.05, cam: 5.0 },
      { ry: 0, rx: 0, cam: 4.4 },
      { ry: 0.05, rx: -0.1, cam: 4.6 },
      { ry: 0.18, rx: -0.08, cam: 5.0 },
      { ry: 0, rx: 0.1, cam: 4.7 },
    ],
    // Closer than the others: the hair touches the top of the frame, the neck leaves by the bottom.
    front: { ry: 0, rx: 0.04, cam: 5.0 },
    flap: 0,
    hair: 0.12,
    noLinks: true,
    // A turning dust ring around a face pulls the eye away from it.
    noDust: true,
    // The body barely turns: the head does (faceAnimator), the shoulders stay.
    turn: 0.08,
    face: fig.face,
    // A lit region leaves a face's points as they are: its engine's colour patched part of the
    // face. The arcs alone carry the light, they do not read litGlow.
    litGlow: 0,
    gain: 0.85,
  };
}

/** How each figure is framed. The brain's are the site's (brainCloud REGION_VIEWS). */
export const SHAPE_VIEWS: Record<Exclude<BrainShape, 'brain'>, ShapeViews> = {
  butterfly: {
    regions: [
      { ry: -0.35, rx: -0.25, cam: 5.0 },
      { ry: 0, rx: 0.35, cam: 4.6 },
      { ry: 0.35, rx: 0.3, cam: 5.0 },
      { ry: 0.5, rx: 0.05, cam: 4.8 },
      { ry: -0.2, rx: -0.45, cam: 4.8 },
    ],
    front: { ry: 0, rx: 0.08, cam: 5.2 },
    flap: 0.55,
    hair: 0,
    gain: 0.62,
  },
  skull: {
    regions: [
      { ry: 2.6, rx: 0.55, cam: 5.3 },
      { ry: 0, rx: 0.02, cam: 4.8 },
      { ry: 0.15, rx: -0.3, cam: 5.0 },
      { ry: 1.15, rx: 0.05, cam: 5.2 },
      { ry: 0, rx: 0.3, cam: 5.0 },
    ],
    front: { ry: 0, rx: 0.06, cam: 5.3 },
    flap: 0,
    hair: 0,
    gain: 1,
  },
  lion: {
    regions: [
      { ry: 0.5, rx: 0.1, cam: 5.4 },
      { ry: 0, rx: 0, cam: 4.6 },
      { ry: 0.1, rx: -0.25, cam: 4.8 },
      { ry: 0.4, rx: 0.35, cam: 5.0 },
      { ry: 0, rx: 0.3, cam: 4.8 },
    ],
    front: { ry: 0, rx: 0.06, cam: 5.3 },
    flap: 0,
    hair: 0,
    gain: 0.85,
  },
  woman: portraitView(WOMAN),
  man: portraitView(MAN),
  claire: portraitView(CLAIRE),
  amara: portraitView(AMARA),
  kofi: portraitView(KOFI),
  mei: portraitView(MEI),
  kenji: portraitView(KENJI),
  kitten: portraitView(KITTEN),
  shepherd: portraitView(SHEPHERD),
  labrador: portraitView(LABRADOR),
  bear: portraitView(BEAR),
  leo: portraitView(LEO),
};

/** Whether a value read from storage names a figure. */
export function isBrainShape(v: unknown): v is BrainShape {
  return typeof v === 'string' && (BRAIN_SHAPES as readonly string[]).includes(v);
}
