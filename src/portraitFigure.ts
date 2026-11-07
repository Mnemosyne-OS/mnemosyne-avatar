/**
 * portraitFigure — a face on the backdrop stippled from a portrait photo (docs
 * 173 §8.3, 180), for any portrait: its points, the rig that says where each
 * face movement takes each point, and the contours its electric arcs run along.
 *
 * A portrait is a density map (scripts/portrait-density-map.py) plus its
 * landmarks measured on the photo (PortraitSpec). The script ALIGNS every photo
 * onto the same frame (514 × 740, the eyes where the first portrait's were), so
 * the movements' sizes, in the photo's pixels, fit every face; only the
 * landmarks change from one face to the next.
 *
 * Points land where the skin is lit, so the photo's own shading draws the face,
 * and in the hair by its texture. Depth is a head with relief, a neck and a
 * volume of hair, enough for the head to turn to three quarters. The photo
 * crops the hair and the shoulders; they fade out before its edges.
 * Regions: hair = memory, eyes = vision, nose, mouth and throat = voice, the
 * rest of the skin = hands, brows = agents.
 *
 * @module avatar/portraitFigure
 */
import type { BrainCloud, Rng } from './brainCloud';
import { FACE_PARTS, FACE_SHAPE_COUNT, FS, GEAR_MAX, HEAD_TILT_RAD, type AnimalSpecies, type FaceRig, type FaceShapeId } from './faceShapes';
import { AGENTS, HANDS, MEMORY, VISION, VOICE, cloudFrom, type ArcArrays, type ShapePoint } from './shapeKit';

/** An eye's opening on the photo: its centre and half sizes, in pixels. */
export interface PhotoEye { x: number; y: number; rx: number; ry: number }
/** A brow's middle line on the photo (its darkest row, column by column), from the inner end out. */
export type BrowLine = ReadonlyArray<readonly [number, number]>;

/** A portrait: its density map and its landmarks, in the aligned photo's pixels. */
export interface PortraitSpec {
  /**
   * The density map: one byte per cell (0 nothing, 1..127 skin, 128..255 hair),
   * base64; with `rgb`, each cell's colour (3 bytes), and the points take it.
   */
  map: { b64: string; w: number; h: number; rgb?: string };
  /** The face's middle: the head's centre for its depth, where the wind is measured from. */
  mid: { x: number; y: number };
  eyes: readonly [PhotoEye, PhotoEye];
  iris: { outer: number; inner: number; lookX: number; lookY: number };
  mouth: { x: number; y: number; rx: number; ry: number };
  brows: readonly [BrowLine, BrowLine];
  /** The cheeks' apples: a smile lifts them. */
  cheeks: readonly [readonly [number, number], readonly [number, number]];
  /** The nose's tip, and the top of its bridge. */
  nose: { x: number; y: number; bridgeTop: number };
  /** The bottom of the chin, the base of the neck (the head's pivot) and where the shoulders stay still. */
  chinY: number;
  pivotY: number;
  neckBaseY: number;
  /** The neck's and the shoulders' half widths, for their depth. */
  neckHalf: number;
  shoulderHalf: number;
  /**
   * The volume of hair, an ellipse on the photo; `depth` = how far it stands out
   * at its middle (a puff of curls far back, short hair close to the skull);
   * `still` = how far from the middle (figure units) the wind starts; `sway` =
   * how much of the wind and of the lag behind the head it takes (1 for long or
   * loose hair; near 0 for short hair, which moves with the head: lagging, it
   * slid over the skull like a loose scalp).
   */
  hair: { cx: number; cy: number; rx: number; ry: number; depth: number; still: number; sway: number };
  /** The lashes: how many per eye, and the outermost one's length, in pixels. */
  lashes: { count: number; long: number; short: number };
  /**
   * An animal's ears, viewer's left then right: the tip, the middle of the root
   * and the root's half width, in pixels. Absent on a person (their ears stay still).
   */
  ears?: readonly [PhotoEar, PhotoEar];
  /** The animal it is (its own way of living and feeling, faceSpecies); absent on a person. */
  species?: AnimalSpecies;
  /** How far its ears may move, when less than all the way (hanging ears). */
  earRange?: readonly [number, number];
  /** A robot's gears (doc 181 §12.3): centre, radius and teeth, in pixels. Their points turn about the centre while it speaks or thinks. */
  gears?: ReadonlyArray<{ x: number; y: number; r: number; teeth: number }>;
}

/** An ear: it turns about its root, the tip moving most. */
export interface PhotoEar { tip: readonly [number, number]; base: readonly [number, number]; half: number }

/** A gear's body, as a share of its radius: past it only the teeth (robotSpec draws the same). */
export const GEAR_ROOT = 0.78;

/** The aligned photo's frame, and its pixels to the figure's units. */
const PHOTO = { w: 514, h: 740, k: 2.9 / 740, top: 1.32 };
const photoX = (px: number): number => (px - PHOTO.w / 2) * PHOTO.k;
const photoY = (py: number): number => PHOTO.top - py * PHOTO.k;

/** The fibres running out from the pupil. */
const IRIS_SPOKES = 22;
/** How bright the iris and its catchlights are: toned down, brighter eyes stared. */
const IRIS_GLOW = 0.5, IRIS_GLINT = 0.7;
/** How far the face stands out at its middle, in figure units (its half width is about 0.69). */
const HEAD_DEPTH = 0.62;
/**
 * The lids' share of the points (after the irises' 2.2 %): dense enough that a
 * closed eye reads as skin as solid as around it, not a few specks over a hole.
 */
const LID_SHARE = 0.047;
/** The irises' share of the points, for a person's eye (iris radius REF_IRIS, opening REF_EYE_AREA). */
const IRIS_SHARE = 0.022, REF_IRIS = 15, REF_EYE_AREA = 640;
/** An eye smaller than this share of a person's takes a share of the points in proportion. */
const SMALL_EYE = 0.6;
/** On a face without hair, the memory region starts this far above the brows (the crown, the ears). */
const HAIRLESS_MEMORY_ABOVE = 40;
/** How far a full ear flick turns the ear about its root, in radians. */
const EAR_TURN_RAD = 0.35;
/**
 * A full breath in, in the photo's pixels: how much the chest widens (a share of its distance
 * from the middle), how far the shoulders rise, and the head with them.
 */
const BREATH_WIDEN = 0.035, BREATH_RISE = 6, BREATH_HEAD = 1.8;
/** How far puffed cheeks push out, in the photo's pixels. */
const CHEEK_PUFF = 9;
/** Shade points on top of a face's points (a share of them), and how strongly they favour the darkest skin. */
const SHADE_EXTRA = 0.8, SHADE_CURVE = 1.6;
/** The least density the neck's skin takes under the chin, whatever its shade. */
const NECK_SHADE_FLOOR = 0.3;
/** Darker than this share of the skin around the eye, or this far from its hue, a lid takes that skin. */
const LID_CHEEK_FLOOR = 0.75, LID_HUE_GAP = 0.06;
/** Where a lid looks for its skin, in eye half-heights from the eye's middle (negative: above). */
const LID_SKIN_AT = [-1.3, -1.6, 1.7] as const;
/** The face's half width at the cheeks, in the photo's pixels: the rows that get the full depth. */
const CHEEK_HALF_WIDTH = 150;
/** Cells along a chain beyond which it is cut in two: a long run reads as a fuse, not a spark. */
const ARC_CHAIN_MAX = 70;
const ARC_CHAIN_MIN = 8;

/** Inside an ellipse of the photo, in its pixels. */
const inside = (px: number, py: number, cx: number, cy: number, rx: number, ry: number): boolean =>
  ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 < 1;

/** The brow line's height at px, or NaN past its ends. */
function browLineAt(line: BrowLine, px: number): number {
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    if (!a || !b) continue;
    const [x0, y0] = a, [x1, y1] = b;
    if ((px - x0) * (px - x1) <= 0) return x0 === x1 ? y0 : y0 + (y1 - y0) * (px - x0) / (x1 - x0);
  }
  return NaN;
}

/** A portrait figure: what the backdrop and the tests use of one face. */
export interface PortraitFigure {
  face: FaceRig;
  buildCloud(n: number, r: Rng): BrainCloud;
  arcs(r: Rng): ArcArrays;
  /** The rig at a pixel of the photo: every movement's offset, figure units, x then y in FACE_SHAPES order. */
  shapeOffsets(px: number, py: number): Float32Array;
  /** How far a brow raise lifts a pixel, and which brow; null away from both. */
  browLift(px: number, py: number): { side: 0 | 1; lift: number } | null;
  /** Where a full smile moves a pixel, in pixels (x out from the middle, y up). */
  smile(px: number, py: number): [number, number];
  /** How far an opening jaw carries a pixel down, 0..1. */
  jaw(px: number, py: number): number;
}

export function createPortraitFigure(spec: PortraitSpec): PortraitFigure {
  const { mouth: M, eyes: EYES, iris: IRIS } = spec;
  // The map's size, read with the map itself (cells): a free face's map arrives only when the
  // face is worn (portraitMaps), so nothing here touches it before a face is built.
  let W = 0, H = 0;
  const MID: [number, number] = [photoX(spec.mid.x), photoY(spec.mid.y)];
  // A robot's gears (doc 181 §12.3), as many as the shader turns.
  const GEARS = (spec.gears ?? []).slice(0, GEAR_MAX);

  let cellsCache: Uint8Array | null = null;
  /** The density map, decoded once. */
  const cells = (): Uint8Array => {
    if (!cellsCache) {
      W = spec.map.w; H = spec.map.h;
      cellsCache = Uint8Array.from(atob(spec.map.b64), c => c.charCodeAt(0));
    }
    return cellsCache;
  };

  const face: FaceRig = {
    eyes: EYES.map(e => ({ x: photoX(e.x), y: photoY(e.y), half: e.ry * PHOTO.k, halfWidth: e.rx * PHOTO.k })),
    look: [IRIS.lookX * PHOTO.k, IRIS.lookY * PHOTO.k],
    mouth: { x: photoX(M.x), y: photoY(M.y), half: M.rx * PHOTO.k },
    head: { pivot: [photoX(spec.mid.x), photoY(spec.pivotY), 0], chin: photoY(spec.chinY), neckBase: photoY(spec.neckBaseY) },
    ...(spec.ears ? { ears: true as const } : {}),
    ...(spec.species ? { species: spec.species } : {}),
    ...(spec.earRange ? { earRange: spec.earRange } : {}),
    ...(GEARS.length ? { gears: GEARS.map(g => ({ x: photoX(g.x), y: photoY(g.y), r: g.r * PHOTO.k })) } : {}),
  };
  /**
   * The gear a photo pixel turns with, 1-based, 0 for none: its body or one of its teeth, as the
   * robot's map draws them (robotSpec). The plate between two teeth stays still, so the teeth sweep over it.
   */
  const gearAt = (px: number, py: number): number => GEARS.findIndex(g => {
    const d = Math.hypot(px - g.x, py - g.y);
    if (d > g.r) return false;
    const turn = (Math.atan2(py - g.y, px - g.x) / (2 * Math.PI) + 1) % 1;
    return d < g.r * GEAR_ROOT || (turn * g.teeth) % 1 < 0.5;
  }) + 1;

  /**
   * How far a brow raise lifts a skin pixel, and which brow: 1 on the brow, less
   * up the forehead (the skin creases, it does not slide), a little on the
   * upper lid (it stretches), fading past the brow's ends.
   */
  function browLift(px: number, py: number): { side: 0 | 1; lift: number } | null {
    const side: 0 | 1 = px < spec.mid.x ? 0 : 1;
    const line = spec.brows[side];
    const xs = line.map(p => p[0]);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const out = px < lo ? lo - px : px > hi ? px - hi : 0;
    const across = Math.max(0, 1 - out / 15);
    if (across <= 0) return null;
    const by = browLineAt(line, Math.min(hi, Math.max(lo, px)));
    const dy = py - by;
    const along = dy < -10 ? 0.8 * Math.max(0, 1 - (-dy - 10) / 45) : dy > 10 ? 0.6 * Math.max(0, 1 - (dy - 10) / 16) : 1;
    const lift = across * along;
    return lift > 0.01 ? { side, lift } : null;
  }

  /**
   * Where a full smile moves a skin pixel, in the photo's pixels (x out from the
   * middle, y UP): the corners of the mouth up and out, the lips along a curve
   * (the corners most, the middle not at all), the cheeks up, and the skin under
   * the eyes a little, as a real smile pushes it. 0 far from all of them.
   */
  function smile(px: number, py: number): [number, number] {
    const side = px < M.x ? -1 : 1;
    let ox = 0, oy = 0;
    const g = (d: number, r: number): number => Math.exp(-((d / r) ** 2));
    const corner = g(Math.hypot(px - (M.x + side * M.rx * 0.95), py - M.y), 26);
    ox += side * 5 * corner; oy += 7 * corner;
    if (inside(px, py, M.x, M.y, M.rx, M.ry)) {
      const t = (px - M.x) / M.rx;
      ox += 4 * t; oy += 6 * t * t;
    }
    for (const [cx, cy] of spec.cheeks) { const k = g(Math.hypot(px - cx, py - cy), 45); ox += side * 2 * k; oy += 5 * k; }
    for (const e of EYES) { const k = g(Math.hypot(px - e.x, py - (e.y + 22)), 20); oy += 2.5 * k; }
    return [ox, oy];
  }

  /**
   * How far an opening jaw carries a skin pixel down: the lower lip and the chin
   * all the way, fading out towards the cheeks and down the neck; nothing above
   * the line between the lips (the upper jaw does not move).
   */
  function jaw(px: number, py: number): number {
    if (py <= M.y) return 0;
    const across = Math.exp(-(((px - M.x) / 85) ** 2));
    const below = Math.min(1, (py - M.y) / 10);
    const chin = py < spec.chinY + 10 ? 1 : Math.max(0, 1 - (py - spec.chinY - 10) / 40);
    return across * below * chin;
  }

  /** How close a pixel is to its brow's inner end (the first point of its line), 0..1. */
  const browInnerness = (side: 0 | 1, px: number): number =>
    Math.max(0, Math.min(1, 1 - Math.abs(px - (spec.brows[side][0]?.[0] ?? spec.mid.x)) / 55));

  /**
   * The rig: where every face movement (FACE_SHAPES) takes a pixel of the photo
   * at full strength, in figure units, x then y for each movement in order. Each
   * movement is a smooth field over the face, so the skin moves together, never
   * a line sliding; points far from a movement get 0 for it.
   */
  function shapeOffsets(px: number, py: number): Float32Array {
    const out = new Float32Array(FACE_SHAPE_COUNT * 2);
    /** Add to a movement: `dx` in the photo's pixels, `up` in pixels upward. */
    const put = (id: FaceShapeId, dx: number, up: number) => {
      const at = FS[id] * 2;
      out[at] = (out[at] ?? 0) + dx * PHOTO.k;
      out[at + 1] = (out[at + 1] ?? 0) + up * PHOTO.k;
    };
    const g = (d: number, r: number): number => Math.exp(-((d / r) ** 2));
    // The jaw: the lower lip and chin down; the upper lip lifts a little in its middle.
    const j = jaw(px, py);
    if (j > 0) put('jawOpen', 0, -14 * j);
    if (py < M.y && inside(px, py, M.x, M.y, M.rx, M.ry)) put('jawOpen', 0, 3 * Math.max(0, 1 - ((px - M.x) / M.rx) ** 2));
    // The vowels: the lips stretch, or round and narrow, about the mouth's middle.
    const lips = Math.exp(-(((px - M.x) / 70) ** 2 + ((py - M.y) / 40) ** 2));
    if (lips > 0.01) { put('lipsWide', (px - M.x) * 0.16 * lips, 0); put('lipsRound', -(px - M.x) * 0.18 * lips, 0); }
    // A smile, each side on its own (a smirk is one of them).
    const [sx, sy] = smile(px, py);
    put(px < M.x ? 'smileL' : 'smileR', sx, sy);
    // The brows: up one at a time, down and together, their inner ends up.
    const brow = browLift(px, py);
    if (brow) {
      put(brow.side === 0 ? 'browUpL' : 'browUpR', 0, 7.6 * brow.lift);
      const inner = browInnerness(brow.side, px);
      put('browFrown', Math.sign(spec.mid.x - px) * 4 * inner * brow.lift, -5 * brow.lift);
      put('browInnerUp', 0, 8 * inner * brow.lift);
    }
    // The cheeks and the skin under the eyes, up.
    for (const [cx, cy] of spec.cheeks) { const k = g(Math.hypot(px - cx, py - cy), 45); put('cheekRaise', Math.sign(cx - M.x) * k, 5 * k); }
    for (const e of EYES) put('cheekRaise', 0, 3 * g(Math.hypot(px - e.x, py - (e.y + 22)), 20));
    // The corners of the mouth, down.
    for (const side of [-1, 1]) {
      const k = g(Math.hypot(px - (M.x + side * M.rx * 0.95), py - M.y), 26);
      put('mouthFrown', side * 1.5 * k, -6 * k);
    }
    // The lips pressed: drawn towards the line between them, a little narrower.
    const press = Math.exp(-(((px - M.x) / 62) ** 2 + ((py - M.y) / 30) ** 2));
    if (press > 0.01) put('lipPress', -(px - M.x) * 0.05 * press, (py - M.y) * 0.4 * press);
    // The nose wrinkled (AU9-10; an animal's snarl): the skin of the nose and beside the nostrils
    // drawn up, the skin between the nose and the mouth with it, the upper lip lifted in its middle,
    // the inner brows pulled down a little. Sized on the nose's own length, so a muzzle wrinkles
    // the same way a person's nose does.
    const N = spec.nose, noseLen = Math.max(30, N.y - N.bridgeTop);
    const ridge = Math.exp(-(((px - N.x) / (0.3 * noseLen)) ** 2 + ((py - (N.y - 0.3 * noseLen)) / (0.35 * noseLen)) ** 2));
    const wings = Math.exp(-(((Math.abs(px - N.x) - 0.15 * noseLen) / (0.14 * noseLen)) ** 2 + ((py - N.y) / (0.14 * noseLen)) ** 2));
    const between = M.y > N.y ? Math.exp(-(((px - N.x) / (0.85 * M.rx)) ** 2 + ((py - (N.y + M.y) / 2) / Math.max(8, 0.5 * (M.y - N.y))) ** 2)) : 0;
    const upperLip = py <= M.y + 2 ? Math.exp(-(((px - M.x) / (0.55 * M.rx)) ** 2 + ((py - (M.y - 0.45 * M.ry)) / (0.6 * M.ry)) ** 2)) : 0;
    const wrinkle = 4 * ridge + 5 * wings + 4 * between + 0.15 * M.ry * upperLip;
    if (wrinkle > 0.02) put('noseWrinkle', Math.sign(px - N.x) * 1.2 * wings, wrinkle);
    if (brow) put('noseWrinkle', 0, -2.5 * browInnerness(brow.side, px) * brow.lift);
    // The chin raised (AU17): the skin between the lower lip and the chin's tip pushes up, the
    // lower lip with it, drawn a little towards the middle.
    const chinMid = M.y + 0.6 * Math.max(10, spec.chinY - M.y), chinR = 0.5 * Math.max(10, spec.chinY - M.y);
    if (py > M.y - 4) {
      const k = Math.exp(-(((px - M.x) / (0.95 * M.rx)) ** 2 + ((py - chinMid) / chinR) ** 2));
      if (k > 0.01) put('chinRaise', -(px - M.x) * 0.04 * k, 6 * k);
    }
    // The mouth slid aside: the lips and the skin about them, towards the viewer's right.
    const slide = Math.exp(-(((px - M.x) / (1.25 * M.rx)) ** 2 + ((py - M.y) / (1.6 * M.ry)) ** 2));
    if (slide > 0.01) put('mouthSide', 0.12 * M.rx * slide, 0);
    // The cheeks puffed: the skin beside the mouth pushed out, away from the middle, a little down.
    for (const [cx, cy] of spec.cheeks) {
      const out = Math.sign(cx - M.x) || 1;
      const k = Math.exp(-(((px - (cx + out * 0.15 * M.rx)) / (0.75 * M.rx + 15)) ** 2 + ((py - (cy + M.y) / 2) / (0.6 * Math.max(0, M.y - cy) + 20)) ** 2));
      if (k > 0.01) put('cheekPuff', out * CHEEK_PUFF * k, -2 * k);
    }
    // A breath in: below the neck the chest widens and rises, the shoulders and the collarbones
    // most, the chest lower down less; the neck goes with it; the head rides up a hair.
    const chestTop = spec.chinY + 10, chestFull = spec.neckBaseY + 30;
    if (py < chestTop) put('breath', 0, BREATH_HEAD);
    else {
      const c = Math.min(1, (py - chestTop) / Math.max(1, chestFull - chestTop)), swell = c * c * (3 - 2 * c);
      const low = Math.max(0, Math.min(1, (py - spec.neckBaseY) / 150));
      put('breath', BREATH_WIDEN * (px - spec.mid.x) * swell, BREATH_HEAD + BREATH_RISE * (1 - 0.6 * low) * swell);
    }
    // An ear turns about its root, outward (and down) at a full flick: the tip moves most, the root not at all.
    spec.ears?.forEach((ear, side) => {
      const ax = ear.tip[0] - ear.base[0], ay = ear.tip[1] - ear.base[1];
      const len = Math.hypot(ax, ay) || 1;
      const vx = px - ear.base[0], vy = py - ear.base[1];
      const t = (vx * ax + vy * ay) / (len * len);
      const across = Math.abs(vx * ay - vy * ax) / len;
      if (t <= 0 || t > 1.15 || across > ear.half * (1 - 0.8 * Math.min(1, t)) + 10) return;
      const s = Math.min(1, t) ** 1.5;
      // In y-up terms the viewer's left ear turns counter-clockwise to flick out, the right one clockwise.
      const a = (side === 0 ? 1 : -1) * EAR_TURN_RAD, X = vx, Y = -vy;
      const rx = X * Math.cos(a) - Y * Math.sin(a), ry = X * Math.sin(a) + Y * Math.cos(a);
      put(side === 0 ? 'earL' : 'earR', (rx - X) * s, (ry - Y) * s);
    });
    // The head tilts about the base of the neck; the neck bends less, the shoulders not at all.
    const head = py < spec.chinY ? 1 : Math.max(0, 1 - (py - spec.chinY) / (spec.neckBaseY - spec.chinY));
    if (head > 0) {
      const at = FS.headTilt * 2;
      const x = photoX(px), y = photoY(py), cx = photoX(spec.mid.x), cy = photoY(spec.pivotY);
      out[at] = -(y - cy) * HEAD_TILT_RAD * head;
      out[at + 1] = (x - cx) * HEAD_TILT_RAD * head;
    }
    return out;
  }

  let skinRows: Array<[number, number]> | null = null;
  /** The leftmost and rightmost skin on the density map's row at py, in the photo's pixels, smoothed over a few rows. */
  function skinRow(py: number): [number, number] {
    if (!skinRows) {
      const map = cells();
      const raw = Array.from({ length: H }, (_, row): [number, number] => {
        let lo = -1, hi = -1;
        for (let c = 0; c < W; c++) {
          const v = map[row * W + c] ?? 0;
          if (v > 0 && v < 128) { if (lo < 0) lo = c; hi = c; }
        }
        return lo < 0 ? [spec.mid.x - 175, spec.mid.x + 175] : [(lo / W) * PHOTO.w, ((hi + 1) / W) * PHOTO.w];
      });
      // Smoothed: the contour measured row by row is ragged, and so was the turned head.
      const k = 5;
      skinRows = raw.map((_, row): [number, number] => {
        let l = 0, r = 0, n = 0;
        for (let j = Math.max(0, row - k); j <= Math.min(raw.length - 1, row + k); j++) { l += raw[j]?.[0] ?? 0; r += raw[j]?.[1] ?? 0; n++; }
        return [l / n, r / n];
      });
    }
    return skinRows[Math.max(0, Math.min(H - 1, Math.floor((py / PHOTO.h) * H)))] ?? [spec.mid.x - 175, spec.mid.x + 175];
  }

  let reach = 0;
  /**
   * How far up and down from the face's middle its depth reaches, in pixels: at
   * least to the top of its skin (a high forehead was flat above 240 pixels, and
   * a bright seam crossed it where the depth stopped).
   */
  function headReach(): number {
    if (reach > 0) return reach;
    const map = cells(), col = Math.round((spec.mid.x / PHOTO.w) * W);
    let top = H;
    for (let row = 0; row < H; row++) { const v = map[row * W + col] ?? 0; if (v > 0 && v < 128) { top = row; break; } }
    reach = Math.max(240, spec.mid.y - (top / H) * PHOTO.h + 15);
    return reach;
  }

  /**
   * The skin's depth: a head, then a neck, then the flatter shoulders. The face
   * has relief (the nose and its bridge forward, the lips and the chin a little,
   * the eyes set back), so a turned head shows its volume instead of a flat card.
   */
  function skinZ(px: number, py: number): number {
    if (py < spec.chinY + 10) {
      // Across, the face's own width on this row: its contour has no depth, so a turn leaves the
      // outline where it is (an oval wider than the face slid it inwards, a hole by the ear).
      const [l, r] = skinRow(py);
      const half = Math.max(20, (r - l) / 2);
      const u2 = ((px - (l + r) / 2) / half) ** 2, vy = ((py - spec.mid.y) / headReach()) ** 2;
      const g = (dx: number, dy: number, rad: number) => Math.exp(-((dx / rad) ** 2 + (dy / rad) ** 2));
      const N = spec.nose;
      const nose = 0.07 * g(px - N.x, py - N.y, 26) + 0.03 * Math.exp(-(((px - N.x) / 13) ** 2)) * (py > N.bridgeTop && py < N.y ? 1 : 0);
      const lips = 0.025 * g(px - M.x, py - M.y - 6, 34);
      const chin = 0.02 * g(px - M.x, py - spec.chinY + 15, 30);
      const sockets = EYES.reduce((n, e) => n - 0.03 * g(px - e.x, py - e.y, 30), 0);
      // As deep as a real head is wide (a flatter one barely changed when it turned), and a narrower
      // row is as much shallower (the jaw at the cheeks' depth squeezed the lower face on a turn).
      // Across, a parabola: a face is flat-ish in front and falls away at the sides; an oval kept
      // the cheeks deep to the edge and they bulged past the outline on a turn.
      const across = Math.max(0, 1 - u2), down = Math.sqrt(Math.max(0, 1 - vy));
      return HEAD_DEPTH * Math.min(1, half / CHEEK_HALF_WIDTH) * across * down + nose + lips + chin + sockets;
    }
    const neck = py < spec.neckBaseY;
    const half = neck ? spec.neckHalf : spec.shoulderHalf;
    return (neck ? 0.2 : 0.12) * Math.sqrt(Math.max(0, 1 - ((px - spec.mid.x) / half) ** 2));
  }

  /** The hair's depth: a volume, rounder in the middle, behind the face's front. */
  const hairZ = (px: number, py: number): number => {
    const h = spec.hair;
    return h.depth * Math.sqrt(Math.max(0, 1 - ((px - h.cx) / h.rx) ** 2 - ((py - h.cy) / h.ry) ** 2)) - 0.12;
  };
  /** How far the wind moves a hair point: 0 near the face, 1 at the edges of the hair. */
  const hairWind = (x: number, y: number): number =>
    spec.hair.sway * Math.min(1, Math.max(0, (Math.hypot(x - MID[0], y - MID[1]) - spec.hair.still) / 0.45));

  let hairless: boolean | undefined;
  /** A face without hair (an animal's): the memory region, the hair's on a person, is the top of its head. */
  const noHair = () => (hairless ??= !cells().some(v => v >= 128));

  function region(px: number, py: number): number {
    if (EYES.some(e => inside(px, py, e.x, e.y, e.rx + 15, e.ry + 8))) return VISION;
    const browYs = spec.brows.flat().map(p => p[1]), browXs = spec.brows.flat().map(p => p[0]);
    if (noHair() && py < Math.min(...browYs) - HAIRLESS_MEMORY_ABOVE) return MEMORY;
    if (py > Math.min(...browYs) - 15 && py < Math.max(...browYs) + 12 && px > Math.min(...browXs) - 8 && px < Math.max(...browXs) + 8) return AGENTS;
    if (Math.abs(px - M.x) < M.rx * 0.95 && py > spec.nose.y - 45 && py < M.y + 50) return VOICE;
    if (Math.abs(px - spec.mid.x) < 32 && py > spec.chinY + 10 && py < spec.neckBaseY + 20) return VOICE;
    return HANDS;
  }

  /**
   * A point of an iris, drawn the manga way: a bright rim (the limbal ring),
   * fibres running out from the pupil, darker under the upper lid and lighter
   * towards the bottom, a crescent of reflected light low in the iris, and two
   * catchlights, a big one up and to the left, a small one down and to the
   * right. The pupil is the empty middle. The top of the iris hides under the
   * lid, as in the drawings.
   */
  function irisPoint(r: Rng): ShapePoint {
    const left = r.rand() < 0.5;
    const e = EYES[left ? 0 : 1];
    const R = IRIS.outer, P = IRIS.inner;
    const part = left ? FACE_PARTS.IRIS_L : FACE_PARTS.IRIS_R;
    const kind = r.rand();
    for (let tries = 0; tries < 30; tries++) {
      let dx: number, dy: number, bright: number;
      if (kind < 0.28) {
        const a = r.rnd(0, Math.PI * 2), rad = R * r.rnd(0.86, 1);
        dx = Math.cos(a) * rad; dy = Math.sin(a) * rad; bright = r.rnd(0.55, 0.85);
      } else if (kind < 0.62) {
        const spoke = Math.floor(r.rand() * IRIS_SPOKES);
        const a = (spoke / IRIS_SPOKES) * Math.PI * 2 + r.rnd(-0.06, 0.06);
        const rad = P + (R * 0.86 - P) * r.rand() ** 0.8;
        dx = Math.cos(a) * rad; dy = Math.sin(a) * rad;
        bright = 0.2 + 0.55 * Math.min(1, Math.max(0, 0.5 + 0.6 * dy / R));
      } else if (kind < 0.8) {
        const a = r.rnd(0.15, Math.PI - 0.15), rad = R * r.rnd(0.5, 0.84);
        dx = Math.cos(a) * rad; dy = Math.sin(a) * rad; bright = r.rnd(0.65, 1);
      } else {
        const big = kind < 0.95;
        const cx = big ? -0.36 * R : 0.38 * R, cy = big ? -0.34 * R : 0.32 * R, cr = (big ? 0.26 : 0.11) * R;
        const a = r.rnd(0, Math.PI * 2), rad = cr * Math.sqrt(r.rand());
        dx = cx + Math.cos(a) * rad; dy = cy + Math.sin(a) * rad; bright = 1;
      }
      // Under the upper lid: hidden, except a catchlight, which sits on the eye's surface.
      if (kind < 0.8 && dy < -e.ry * 0.65) continue;
      // The pupil is empty, but a catchlight crosses it.
      if (kind < 0.8 && Math.hypot(dx, dy) < P) continue;
      const px = e.x + dx, py = e.y + dy;
      return {
        p: [photoX(px), photoY(py), skinZ(px, py) + (kind >= 0.8 ? 0.03 : 0.02)], region: VISION,
        bright: bright * (kind >= 0.8 ? IRIS_GLINT : IRIS_GLOW), cortex: true, part,
      };
    }
    return { p: [photoX(e.x), photoY(e.y + R * 0.6), skinZ(e.x, e.y) + 0.02], region: VISION, bright: 0.6, cortex: true, part };
  }

  /**
   * A point of a lash: curved strands rooted on the upper lid's edge, short at
   * the inner corner, longer and sweeping out towards the outer one, curling up
   * at the tip, as in manga. They ride the lid down in a blink (the shader).
   */
  function lashPoint(r: Rng): ShapePoint {
    const left = r.rand() < 0.5;
    const e = EYES[left ? 0 : 1];
    const L = spec.lashes;
    // The outer corner is away from the face's middle.
    const out = left ? -1 : 1;
    const t = (Math.floor(r.rand() * L.count) + 0.5 + r.rnd(-0.2, 0.2)) / L.count;
    const u = -0.8 + 1.7 * t;
    const bx = e.x + out * e.rx * u;
    const by = e.y - e.ry * Math.sqrt(Math.max(0, 1 - u * u)) * 0.95;
    const len = L.short + (L.long - L.short) * t ** 1.3;
    // Up, leaning outward more towards the outer corner; the tip curls further out.
    const s = r.rand();
    const a = 0.15 + 0.9 * t + 0.6 * s * s;
    const px = bx + out * Math.sin(a) * len * s + r.rnd(-0.35, 0.35);
    const py = by - Math.cos(a) * len * s + r.rnd(-0.35, 0.35);
    return {
      p: [photoX(px), photoY(py), skinZ(px, py) + 0.035], region: VISION,
      bright: r.rnd(0.35, 0.6) * (1 - 0.4 * s), cortex: true, part: left ? FACE_PARTS.LASH_L : FACE_PARTS.LASH_R,
    };
  }

  /**
   * A point of a lid: skin over the eye's opening, shown only while a lid covers
   * it. Its light and colour are the skin's just above the eye (the upper lid
   * in the photo), never the eye's own: a closed eye drew the pupil's dark.
   */
  const aroundCache: Array<{ d: number; c: [number, number, number] } | null | undefined> = [undefined, undefined];
  /**
   * The skin around an eye (above it to the brow, below it to the cheek): the lighter half of
   * what is there, so a brow, a lash line or a socket's shade never set its tone.
   */
  function skinAround(side: 0 | 1): { d: number; c: [number, number, number] } | null {
    const cached = aroundCache[side];
    if (cached !== undefined) return cached;
    const e = EYES[side];
    if (!e) return (aroundCache[side] = null);
    const found: Array<{ d: number; c: [number, number, number] | null }> = [];
    for (const k of [-2.4, -2, -1.6, 1.4, 1.8, 2.2]) {
      for (let u = -0.9; u <= 0.9; u += 0.3) {
        const x = e.x + u * e.rx, y = e.y + k * e.ry;
        const v = cells()[Math.min(H - 1, Math.max(0, Math.floor((y / PHOTO.h) * H))) * W + Math.min(W - 1, Math.max(0, Math.floor((x / PHOTO.w) * W)))] ?? 0;
        if (v === 0 || v >= 128) continue;
        found.push({ d: (v - 1) / 126, c: colorAt(x, y) });
      }
    }
    if (found.length === 0) return (aroundCache[side] = null);
    found.sort((a, b) => b.d - a.d);
    const light = found.slice(0, Math.max(1, Math.ceil(found.length / 2)));
    let r = 0, g = 0, b = 0, n = 0;
    for (const f of light) if (f.c) { r += f.c[0]; g += f.c[1]; b += f.c[2]; n++; }
    const c: [number, number, number] = n > 0 ? [r / n, g / n, b / n] : [1, 0.8, 0.7];
    return (aroundCache[side] = { d: light.reduce((m, f) => m + f.d, 0) / light.length, c });
  }
  /** How far apart two colours are in hue alone (chromaticity), whatever their light. */
  const hueGap = ([ar, ag, ab]: readonly [number, number, number], [br, bg, bb]: readonly [number, number, number]) => {
    const sa = ar + ag + ab || 1, sb = br + bg + bb || 1;
    return Math.hypot(ar / sa - br / sb, ag / sa - bg / sb, ab / sa - bb / sb);
  };

  function lidPoint(r: Rng): ShapePoint {
    const left = r.rand() < 0.5;
    const e = EYES[left ? 0 : 1];
    const a = r.rnd(0, Math.PI * 2), rad = Math.sqrt(r.rand()) * 0.95;
    const px = e.x + Math.cos(a) * rad * e.rx, py = e.y + Math.sin(a) * rad * e.ry;
    // The skin nearest the eye, straight above or below this point: the lightest of a few
    // samples, so a brow or a lash line in the photo never darkens the lid.
    let d = -1, sy = e.y;
    for (const k of LID_SKIN_AT) {
      const y = e.y + k * e.ry;
      const v = cells()[Math.min(H - 1, Math.max(0, Math.floor((y / PHOTO.h) * H))) * W + Math.min(W - 1, Math.max(0, Math.floor((px / PHOTO.w) * W)))] ?? 0;
      const dk = v > 0 && v < 128 ? (v - 1) / 126 : -1;
      if (dk > d) { d = dk; sy = y; }
    }
    if (d < 0) d = 0.5;
    let c = colorAt(px, sy);
    // A deep socket, a dark brow or make-up around the eye in the photo: the lid takes the
    // light and colour of the skin around the eye instead, so a closed eye never reads dark.
    const around = skinAround(left ? 0 : 1);
    if (around && (d < LID_CHEEK_FLOOR * around.d || (c && hueGap(c, around.c) > LID_HUE_GAP))) { d = around.d * 0.92; c = around.c; }
    return {
      p: [photoX(px), photoY(py), skinZ(px, py) + 0.03], region: VISION,
      // A lid is in a little shade under the brow.
      bright: (0.2 + 0.8 * d) * r.rnd(0.72, 0.92), cortex: false, part: left ? FACE_PARTS.LID_L : FACE_PARTS.LID_R,
      ...(c ? { color: c } : {}),
    };
  }

  /** Under the chin, across the neck, down to where it meets the shoulders. */
  const inNeckShade = (px: number, py: number) => py > spec.chinY - 10 && py < spec.neckBaseY + 20 && Math.abs(px - spec.mid.x) < spec.neckHalf;

  // Small eyes (a dog's, a bear's) take a smaller share of the points: the same share packed
  // into a small eye added up to a white blob. A person's eyes keep the full share.
  const smallEye = (k: number) => (k < SMALL_EYE ? k : 1);
  const IRIS_END = IRIS_SHARE * smallEye((IRIS.outer / REF_IRIS) ** 2);
  const LID_END = IRIS_END + (LID_SHARE - IRIS_SHARE) * smallEye((EYES[0].rx * EYES[0].ry) / REF_EYE_AREA);

  function basePoint(r: Rng): ShapePoint {
    const u = r.rand();
    if (u < IRIS_END) return irisPoint(r);
    if (u < LID_END) return lidPoint(r);
    if (spec.lashes.count > 0 && u < LID_END + 0.01) return lashPoint(r);
    const map = cells();
    for (let tries = 0; tries < 400; tries++) {
      const cx = r.rand() * W, cy = r.rand() * H;
      const v = map[(cy | 0) * W + (cx | 0)] ?? 0;
      if (v === 0) continue;
      const isHair = v >= 128;
      const d = isHair ? (v - 128) / 127 : (v - 1) / 126;
      const px = (cx / W) * PHOTO.w, py = (cy / H) * PHOTO.h;
      // The photo crops the hair and the shoulders: they fade out before its edges instead of stopping on a straight line.
      const edge = Math.min(1, py / 70, px / 60, (PHOTO.w - px) / 60);
      // Lighter skin, or more textured hair, takes more points; dark skin keeps a few, so no hole has a hard edge.
      // The neck under the chin keeps enough even in the jaw's shade: a near-empty band there cut the head off.
      const take = !isHair && inNeckShade(px, py) ? Math.max(NECK_SHADE_FLOOR, d) : d;
      if (r.rand() > (0.02 + 0.98 * take ** 1.4) * edge ** 1.5) continue;
      const x = photoX(px), y = photoY(py);
      if (isHair) {
        const hair = hairWind(x, y);
        return { p: [x, y, hairZ(px, py) + r.rnd(-0.06, 0.06)], region: MEMORY, bright: 0.25 + 0.6 * d, cortex: hair === 0, hair, part: FACE_PARTS.HAIR };
      }
      // Inside an eye's opening: the white of the eye, hidden as the lid closes over it.
      const eye = EYES.findIndex(e => inside(px, py, e.x, e.y, e.rx, e.ry));
      const part = eye === 0 ? FACE_PARTS.EYE_L : eye === 1 ? FACE_PARTS.EYE_R : 0;
      return { p: [x, y, skinZ(px, py) + 0.03 * d], region: region(px, py), bright: 0.2 + 0.8 * d, cortex: true, ...(part ? { part } : {}) };
    }
    return { p: [MID[0], MID[1], 0.3], region: HANDS, bright: 0.2, cortex: true };
  }

  let rgbCache: Uint8Array | null = null;
  /**
   * The photo's colour at a pixel, its brightest channel brought to 1: the
   * density already says how bright a point is, the colour only its hue. Too
   * dark to have a hue (black hair, a lash): a neutral light grey. Null without
   * a colour map, or where the map has no figure.
   */
  function colorAt(px: number, py: number): [number, number, number] | null {
    if (!spec.map.rgb) return null;
    cells(); // the size
    const rgb = (rgbCache ??= Uint8Array.from(atob(spec.map.rgb), c => c.charCodeAt(0)));
    const cx = Math.max(0, Math.min(W - 1, Math.floor((px / PHOTO.w) * W)));
    const cy = Math.max(0, Math.min(H - 1, Math.floor((py / PHOTO.h) * H)));
    const at = (cy * W + cx) * 3;
    const r = rgb[at] ?? 0, g = rgb[at + 1] ?? 0, b = rgb[at + 2] ?? 0;
    const top = Math.max(r, g, b);
    if (top === 0) return null;
    if (top < 40) return [0.62, 0.64, 0.7];
    return [r / top, g / top, b / top];
  }

  /**
   * A point of shade, drawn only on a light ground (the shader shows FACE_PARTS.SHADE there and
   * hides it on a dark one): where the photo's skin is DARK — the sockets, the nostrils, the line of
   * the lips, the jaw's shade. On a dark ground the face is drawn by light, and its features by the
   * absence of points; on a light ground that absence read as white and the features vanished.
   */
  let shadeRange: [number, number] | null = null;
  /** The face's own darkest and lightest skin (10th and 75th percentiles): shade is relative to it. */
  function skinRange(): [number, number] {
    if (shadeRange) return shadeRange;
    const ds: number[] = [];
    for (const v of cells()) if (v > 0 && v < 128) ds.push((v - 1) / 126);
    ds.sort((a, b) => a - b);
    const at = (q: number) => ds[Math.min(ds.length - 1, Math.floor(q * ds.length))] ?? q;
    return (shadeRange = [at(0.1), Math.max(at(0.75), at(0.1) + 0.05)]);
  }

  function shadePoint(r: Rng): ShapePoint {
    const map = cells();
    const [lo, hi] = skinRange();
    for (let tries = 0; tries < 400; tries++) {
      const cx = r.rand() * W, cy = r.rand() * H;
      const v = map[(cy | 0) * W + (cx | 0)] ?? 0;
      if (v === 0 || v >= 128) continue;
      const d = (v - 1) / 126;
      // Dark for THIS face: a dark-furred dog's shade is its darkest fur, not all of it.
      const t = Math.max(0, Math.min(1, (hi - d) / (hi - lo)));
      if (r.rand() > t ** SHADE_CURVE) continue;
      const px = (cx / W) * PHOTO.w, py = (cy / H) * PHOTO.h;
      // The eyes have their own points (iris, lids).
      if (EYES.some(e => inside(px, py, e.x, e.y, e.rx, e.ry))) continue;
      return { p: [photoX(px), photoY(py), skinZ(px, py) + 0.03 * d], region: region(px, py), bright: d, cortex: false, part: FACE_PARTS.SHADE };
    }
    return { p: [MID[0], MID[1], 0.3], region: HANDS, bright: 0.5, cortex: false, part: FACE_PARTS.SHADE };
  }

  /** A point, with where each face movement takes it (the rig, read where it sits on the photo) and its colour. */
  function point(r: Rng): ShapePoint {
    return finish(basePoint(r));
  }
  function finish(q: ShapePoint): ShapePoint {
    const px = q.p[0] / PHOTO.k + PHOTO.w / 2, py = (PHOTO.top - q.p[1]) / PHOTO.k;
    q.shapes = shapeOffsets(px, py);
    // A lid already carries the skin's colour from above the eye.
    const c = q.color ?? colorAt(px, py);
    if (c) q.color = c;
    if (GEARS.length) { const g = gearAt(px, py); if (g) q.gear = g; }
    return q;
  }

  /**
   * The contour chains of the photo, in cells of the density map: the
   * silhouette, the hairline, and the skin's sharpest shading between the brows
   * and the chin (eyes, brows, nose, lips).
   */
  function chains(): number[][] {
    const map = cells();
    const kind = (x: number, y: number): number => {
      if (x < 0 || y < 0 || x >= W || y >= H) return 0;
      const v = map[y * W + x] ?? 0;
      return v === 0 ? 0 : v >= 128 ? 2 : 1;
    };
    const dens = (x: number, y: number): number => {
      const v = map[y * W + x] ?? 0;
      return v > 0 && v < 128 ? (v - 1) / 126 : 0;
    };
    const browTop = Math.min(...spec.brows.flat().map(p => p[1])) - 20;
    const edge = new Uint8Array(W * H);
    const grads: number[] = [];
    const gradAt = new Float32Array(W * H);
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const k = kind(x, y);
        if (k === 0) continue;
        // The photo's own borders are not contours: the figure fades out there.
        const nearBorder = x < 4 || x > W - 5 || y < 4 || y > H - 5;
        if (!nearBorder && (kind(x + 1, y) !== k || kind(x - 1, y) !== k || kind(x, y + 1) !== k || kind(x, y - 1) !== k)) edge[y * W + x] = 1;
        const py = (y / H) * PHOTO.h;
        if (k === 1 && py > browTop && py < M.y + 60 && kind(x + 1, y) === 1 && kind(x - 1, y) === 1 && kind(x, y + 1) === 1 && kind(x, y - 1) === 1) {
          const gr = Math.hypot(dens(x + 1, y) - dens(x - 1, y), dens(x, y + 1) - dens(x, y - 1));
          gradAt[y * W + x] = gr;
          grads.push(gr);
        }
      }
    }
    grads.sort((a, b) => a - b);
    const sharp = grads[Math.floor(grads.length * 0.93)] ?? Infinity;
    for (let i = 0; i < gradAt.length; i++) if ((gradAt[i] ?? 0) >= sharp) edge[i] = 1;

    // Walk the edge cells into chains: from a cell, on to the unvisited neighbour that turns least.
    const seen = new Uint8Array(W * H);
    const out: number[][] = [];
    const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
    for (let start = 0; start < edge.length; start++) {
      if (!edge[start] || seen[start]) continue;
      const chain = [start];
      seen[start] = 1;
      let cur = start, dx = 0, dy = 0;
      for (;;) {
        const cx = cur % W, cy = (cur / W) | 0;
        let best = -1, bestTurn = Infinity, bdx = 0, bdy = 0;
        for (const [ox, oy] of DIRS) {
          const nx = cx + ox, ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (!edge[ni] || seen[ni]) continue;
          const turn = dx === 0 && dy === 0 ? 0 : -(ox * dx + oy * dy) / Math.hypot(ox, oy);
          if (turn < bestTurn) { bestTurn = turn; best = ni; bdx = ox; bdy = oy; }
        }
        if (best < 0) break;
        seen[best] = 1;
        chain.push(best);
        cur = best; dx = bdx; dy = bdy;
      }
      for (let i = 0; i < chain.length; i += ARC_CHAIN_MAX) {
        const piece = chain.slice(i, i + ARC_CHAIN_MAX);
        if (piece.length >= ARC_CHAIN_MIN) out.push(piece);
      }
    }
    return out;
  }

  /** The contours as arc points: a few per cell, in chain order. */
  function arcs(r: Rng): ArcArrays {
    const map = cells();
    const P: number[] = [], T: number[] = [], L: number[] = [], S: number[] = [], R: number[] = [], Hh: number[] = [];
    for (const chain of chains()) {
      const pts = chain.map(i => {
        const px = ((i % W) + 0.5) / W * PHOTO.w, py = (((i / W) | 0) + 0.5) / H * PHOTO.h;
        return { px, py, x: photoX(px), y: photoY(py), hairy: (map[i] ?? 0) >= 128 };
      });
      const cum: number[] = [];
      let len = 0;
      pts.forEach((q, k) => {
        const prev = pts[k - 1];
        if (prev) len += Math.hypot(q.x - prev.x, q.y - prev.y);
        cum.push(len);
      });
      if (len <= 0) continue;
      const seed = r.rand();
      const step = PHOTO.k * PHOTO.w / W;
      for (const [k, q] of pts.entries()) {
        const z = q.hairy ? hairZ(q.px, q.py) + 0.02 : skinZ(q.px, q.py) + 0.035;
        const hair = q.hairy ? hairWind(q.x, q.y) : 0;
        for (let n = 0; n < 3; n++) {
          const f = (n + r.rand()) / 3;
          P.push(q.x + r.rnd(-0.3, 0.3) * step, q.y + r.rnd(-0.3, 0.3) * step, z);
          T.push(((cum[k] ?? 0) + f * step) / (len + step));
          L.push(len); S.push(seed);
          R.push(q.hairy ? MEMORY : region(q.px, q.py));
          Hh.push(hair);
        }
      }
    }
    return {
      pos: Float32Array.from(P), t: Float32Array.from(T), len: Float32Array.from(L),
      seed: Float32Array.from(S), reg: Float32Array.from(R), hair: Float32Array.from(Hh),
    };
  }

  return {
    face,
    // The shade points come on top of the n points: the dark ground keeps all of its own.
    buildCloud: (n, r) => { let i = 0; return cloudFrom(n + Math.round(n * SHADE_EXTRA), r, () => (i++ < n ? point(r) : finish(shadePoint(r)))); },
    arcs,
    shapeOffsets,
    browLift,
    smile,
    jaw,
  };
}
