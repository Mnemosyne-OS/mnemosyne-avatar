/**
 * robotSpec — a robot's recipe drawn into a portrait spec (doc 181 §12.1): its
 * density map cell by cell, its colours, and its landmarks computed from the
 * same geometry, so they are exact. createPortraitFigure takes the result as it
 * takes a photo's: the eyes and their lids come from the `eyes` ellipses (the
 * robot blinks), the mouth opens with the voice.
 *
 * Density, as the photo script writes it: 0 nothing, 1..127 lit metal (more
 * light, more points). A robot has no hair. Bright rims, dark seams and glowing
 * eyes draw it, the way a photo's own shading draws a face.
 *
 * @module avatar/robotSpec
 */
import type { PortraitFigure, PortraitSpec } from './portraitFigure';
import { createPortraitFigure, GEAR_ROOT } from './portraitFigure';
import { ROBOT_RECIPES, type RobotId, type RobotRecipe } from './robotRecipes';

/** The portrait frame (doc 180) and the map's cells, the size the photo script writes. */
const FRAME_W = 514, FRAME_H = 740;
export const ROBOT_MAP_W = 171, ROBOT_MAP_H = 247;
const CX = FRAME_W / 2;

/** Which colour a cell takes: the plates, the trim, or what glows. */
const METAL = 0, TRIM = 1, GLOW = 2;
/** The light of each part (1..127): rims catch the light, seams sit in shade, eyes glow. */
const LIGHT = {
  body: 46, neckRing: 72, head: 78, rim: 106, seam: 24, rivet: 118,
  gear: 92, gearHub: 120, gearHole: 18, stalk: 70, tip: 126,
  socket: 24, eye: 112, visor: 30, grilleOn: 108, grilleOff: 26, slot: 116, frame: 30,
} as const;
/** The rim's width inside the head's outline, pixels. */
const RIM = 12;

/** Inside a box from (x0, y0) to (x1, y1), its top and bottom corners rounded apart. */
function inRoundBox(px: number, py: number, x0: number, y0: number, x1: number, y1: number, rTop: number, rBottom: number): boolean {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  // In a corner's band, the point must be inside that corner's circle.
  const corner = (r: number, cy: number) => {
    if (px < x0 + r) return Math.hypot(px - (x0 + r), py - cy) <= r;
    if (px > x1 - r) return Math.hypot(px - (x1 - r), py - cy) <= r;
    return true;
  };
  if (rTop > 0 && py < y0 + rTop) return corner(rTop, y0 + rTop);
  if (rBottom > 0 && py > y1 - rBottom) return corner(rBottom, y1 - rBottom);
  return true;
}

/** The head's outline, grown or shrunk by `by` pixels (a negative `by` gives its inner rim). */
function inHead(rec: RobotRecipe, px: number, py: number, by = 0): boolean {
  const { shape, w, h, cy } = rec.head;
  const x0 = CX - w / 2 - by, x1 = CX + w / 2 + by, y0 = cy - h / 2 - by, y1 = cy + h / 2 + by;
  const ww = x1 - x0, hh = y1 - y0;
  if (shape === 'capsule') return inRoundBox(px, py, x0, y0, x1, y1, Math.min(ww, hh) / 2, Math.min(ww, hh) / 2);
  if (shape === 'dome') return inRoundBox(px, py, x0, y0, x1, y1, ww / 2, 28);
  return inRoundBox(px, py, x0, y0, x1, y1, 30, 30);
}

const inEllipse = (px: number, py: number, cx: number, cy: number, rx: number, ry: number) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
/** Distance from a point to a segment. */
function toSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** The eyes' openings, viewer's left then right. */
function eyeEllipses(rec: RobotRecipe): [PortraitSpec['eyes'][0], PortraitSpec['eyes'][1]] {
  const { shape, r, gap, y } = rec.eyes;
  const rx = shape === 'visor' ? r * 1.25 : shape === 'square' ? r * 0.9 : r;
  const ry = shape === 'visor' ? r * 0.5 : shape === 'square' ? r * 0.9 : r;
  return [{ x: CX - gap / 2, y, rx, ry }, { x: CX + gap / 2, y, rx, ry }];
}

/** An antenna of a pair: where it stands on the head, and its tip. */
interface Antenna { base: readonly [number, number]; tip: readonly [number, number] }
/** The two antennas of a pair, viewer's left then right, leaning outwards. */
function antennaPair(rec: RobotRecipe): readonly [Antenna, Antenna] {
  const top = rec.head.cy - rec.head.h / 2;
  const one = (s: -1 | 1): Antenna => {
    const bx = CX + s * rec.head.w * 0.3;
    return { base: [bx, top + 6], tip: [bx + s * 42, top - 78] };
  };
  return [one(-1), one(1)];
}
/** A brow's five points: where along the eye (inner end first), and how much higher than its ends. */
const BROW_ALONG = [0.9, 0.45, 0, -0.45, -0.9] as const;
const BROW_ARCH = [0, 3, 4, 3, 0] as const;

/** One cell's light (0..127) and colour, painted part over part, the last one on top. */
function paint(rec: RobotRecipe, px: number, py: number): [number, number] {
  let v = 0, c = METAL;
  const set = (light: number, colour: number) => { v = light; c = colour; };
  const { w, h, cy } = rec.head;
  const top = cy - h / 2, chin = cy + h / 2;
  const neckBase = chin + 64;

  // The body: a ringed neck, then the shoulders, lit from above.
  if (py > chin - 10 && py < neckBase + 12 && Math.abs(px - CX) <= rec.body.neckW / 2) {
    set((py | 0) % 14 < 4 ? LIGHT.neckRing : LIGHT.body, TRIM);
  }
  if (inRoundBox(px, py, CX - rec.body.shoulderW / 2, neckBase, CX + rec.body.shoulderW / 2, FRAME_H + 60, 60, 0)) {
    set(Math.max(20, Math.round(LIGHT.body + 34 * (1 - (py - neckBase) / 260))), METAL);
  }
  // The antenna, behind the head.
  if (rec.antenna === 'single') {
    if (Math.abs(px - CX) <= 4 && py > top - 90 && py < top + 4) set(LIGHT.stalk, TRIM);
    if (Math.hypot(px - CX, py - (top - 90)) <= 15) set(LIGHT.tip, GLOW);
  } else if (rec.antenna === 'pair') {
    for (const a of antennaPair(rec)) {
      if (toSegment(px, py, a.base[0], a.base[1], a.tip[0], a.tip[1]) <= 5) set(LIGHT.stalk, TRIM);
      if (Math.hypot(px - a.tip[0], py - a.tip[1]) <= 13) set(LIGHT.tip, GLOW);
    }
  }
  // The head: plates with a bright rim, a seam across the brow, four rivets.
  if (inHead(rec, px, py)) {
    set(inHead(rec, px, py, -RIM) ? LIGHT.head : LIGHT.rim, METAL);
    if (Math.abs(py - (top + h * 0.2)) <= 2 && inHead(rec, px, py, -RIM)) set(LIGHT.seam, TRIM);
    for (const [rx, ry] of [[CX - w / 2 + 28, top + 28], [CX + w / 2 - 28, top + 28], [CX - w / 2 + 28, chin - 28], [CX + w / 2 - 28, chin - 28]] as const) {
      if (Math.hypot(px - rx, py - ry) <= 6) set(LIGHT.rivet, TRIM);
    }
  }
  // The gears: a toothed ring, its hub, a hole.
  for (const g of rec.gears) {
    const d = Math.hypot(px - g.x, py - g.y);
    if (d > g.r) continue;
    const turn = (Math.atan2(py - g.y, px - g.x) / (2 * Math.PI) + 1) % 1;
    const tooth = (turn * g.teeth) % 1 < 0.5;
    if (d < g.r * GEAR_ROOT || tooth) set(LIGHT.gear, TRIM);
    if (d < g.r * 0.34) set(LIGHT.gearHub, TRIM);
    if (d < g.r * 0.18) set(LIGHT.gearHole, TRIM);
  }
  // The eyes: a dark socket or visor, and the glowing opening the lids close over.
  const eyes = eyeEllipses(rec);
  if (rec.eyes.shape === 'visor') {
    const half = rec.eyes.gap / 2 + eyes[0].rx * 1.35;
    if (Math.abs(px - CX) <= half && Math.abs(py - rec.eyes.y) <= eyes[0].ry * 1.6) set(LIGHT.visor, TRIM);
  }
  for (const e of eyes) {
    if (rec.eyes.shape === 'square') {
      if (Math.abs(px - e.x) <= e.rx * 1.3 && Math.abs(py - e.y) <= e.ry * 1.3) set(LIGHT.socket, TRIM);
      if (Math.abs(px - e.x) <= e.rx && Math.abs(py - e.y) <= e.ry) set(LIGHT.eye, GLOW);
    } else {
      if (rec.eyes.shape === 'lens' && inEllipse(px, py, e.x, e.y, e.rx * 1.35, e.ry * 1.35)) set(LIGHT.socket, TRIM);
      if (inEllipse(px, py, e.x, e.y, e.rx, e.ry)) set(LIGHT.eye, GLOW);
    }
  }
  // The mouth.
  const m = rec.mouth;
  if (m.shape === 'grille' && Math.abs(px - CX) <= m.w / 2 && Math.abs(py - m.y) <= 15) {
    set(((px - (CX - m.w / 2)) | 0) % 12 < 6 ? LIGHT.grilleOn : LIGHT.grilleOff, ((px - (CX - m.w / 2)) | 0) % 12 < 6 ? GLOW : TRIM);
  } else if (m.shape === 'slot' && Math.abs(px - CX) <= m.w / 2 + 4 && Math.abs(py - m.y) <= 10) {
    set(Math.abs(px - CX) <= m.w / 2 && Math.abs(py - m.y) <= 6 ? LIGHT.slot : LIGHT.frame, Math.abs(py - m.y) <= 6 ? GLOW : TRIM);
  } else if (m.shape === 'speaker' && Math.hypot(px - CX, py - m.y) <= m.w / 2) {
    const dot = Math.hypot(((px - CX + 600) % 12) - 6, ((py - m.y + 600) % 12) - 6) <= 3.5;
    set(dot ? LIGHT.grilleOn : LIGHT.grilleOff, dot ? GLOW : TRIM);
  }
  return [v, c];
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The density map and colour map of a recipe, at the photo script's size. */
export function robotMap(rec: RobotRecipe): PortraitSpec['map'] {
  const W = ROBOT_MAP_W, H = ROBOT_MAP_H;
  const cells = new Uint8Array(W * H);
  const rgb = new Uint8Array(W * H * 3);
  const palette = [rec.colors.metal, rec.colors.trim, rec.colors.glow];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [v, c] = paint(rec, ((x + 0.5) / W) * FRAME_W, ((y + 0.5) / H) * FRAME_H);
      const i = y * W + x;
      cells[i] = v;
      if (v > 0) { const col = palette[c] ?? rec.colors.metal; rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]; }
    }
  }
  return { b64: toB64(cells), w: W, h: H, rgb: toB64(rgb) };
}

/** A recipe as a portrait spec: its map, and its landmarks from the same geometry. */
export function robotSpec(rec: RobotRecipe): PortraitSpec {
  const eyes = eyeEllipses(rec);
  const [eL, eR] = eyes;
  const { w, h, cy } = rec.head;
  const top = cy - h / 2, chin = cy + h / 2;
  const browY = rec.eyes.y - eL.ry * (rec.eyes.shape === 'visor' ? 1.6 : 1) - 18;
  const brow = (e: typeof eL, inward: 1 | -1): PortraitSpec['brows'][0] =>
    BROW_ALONG.map((k, i) => [e.x + inward * k * e.rx, browY - (BROW_ARCH[i] ?? 0)] as const);
  const outer = Math.min(eL.rx, eL.ry) * 0.72;
  const pair = rec.antenna === 'pair' ? antennaPair(rec) : null;
  let map: PortraitSpec['map'] | null = null;
  return {
    // Drawn on first read, like a portrait's map fetched when the face is worn.
    get map() { return (map ??= robotMap(rec)); },
    mid: { x: CX, y: cy + 10 },
    eyes: [eL, eR],
    iris: { outer, inner: outer * 0.42, lookX: eL.rx * 0.16, lookY: eL.ry * 0.12 },
    mouth: { x: CX, y: rec.mouth.y, rx: rec.mouth.w / 2, ry: rec.mouth.shape === 'slot' ? 8 : rec.mouth.shape === 'speaker' ? rec.mouth.w * 0.3 : 16 },
    brows: [brow(eL, 1), brow(eR, -1)],
    cheeks: [[eL.x, rec.mouth.y - 24], [eR.x, rec.mouth.y - 24]],
    nose: { x: CX, y: (rec.eyes.y + rec.mouth.y) / 2, bridgeTop: rec.eyes.y - eL.ry },
    chinY: chin,
    pivotY: chin + 36,
    neckBaseY: chin + 64,
    neckHalf: rec.body.neckW / 2,
    shoulderHalf: rec.body.shoulderW / 2,
    // No hair: the head moves as one piece.
    hair: { cx: CX, cy: top + h * 0.25, rx: w / 2, ry: h * 0.35, depth: 0.5, still: 1.1, sway: 0 },
    lashes: { count: 0, long: 0, short: 0 },
    ...(pair ? { ears: [{ ...pair[0], half: 16 }, { ...pair[1], half: 16 }] as const } : {}),
    gears: rec.gears.map(({ x, y, r, teeth }) => ({ x, y, r, teeth })),
  };
}

const specs = new Map<RobotId, PortraitSpec>();
const figures = new Map<RobotId, PortraitFigure>();
/** A shipped robot's spec, drawn once per window. */
export function robotSpecOf(id: RobotId): PortraitSpec {
  let s = specs.get(id);
  if (!s) { s = robotSpec(ROBOT_RECIPES[id]); specs.set(id, s); }
  return s;
}
/** A shipped robot's figure, built once per window: the scene and the studio share it. */
export function robotFigure(id: RobotId): PortraitFigure {
  let f = figures.get(id);
  if (!f) { f = createPortraitFigure(robotSpecOf(id)); figures.set(id, f); }
  return f;
}
