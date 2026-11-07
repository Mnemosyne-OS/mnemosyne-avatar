/**
 * brainCloud — the particle brain of the website, as plain arrays.
 *
 * Ported from the site prototype (`proto-cerveau/brain.js`, the plan of the
 * v2 site). The shape, the five engine regions and the seeded draw are the
 * site's own: the same seed and the same order of draws give the same brain,
 * point for point, so the app and the site show one brain and not two
 * (`brainCloud.test.ts` pins a checksum taken from the prototype itself).
 * The prototype is NOT in this repository: it lives in the side-session notes
 * of the site rework, `side-session-notes/local_3561face-…/proto-cerveau/brain.js`,
 * read on 2026-10-23.
 *
 * 🚨 This is NOT the Neural Map's brain (`neural/neuralBrain.ts`, doc 37).
 * That one places the REAL nodes of the vaults on an analytic surface, one
 * lobe per vault. This one is a decoration: rejection-sampled points on a
 * folded cortex, its regions are the five ENGINES (memory, vision, voice,
 * hands, agents), and no vault is in it.
 *
 * 🪤 The prototype kept the generator in a module variable reset on every
 * scene. Here it is an instance: two scenes alive at once (the canvas and a
 * preview) would otherwise interleave one sequence and draw two brains.
 *
 * Pure: no three, no DOM, no React — the tests read it directly.
 *
 * @module avatar/brainCloud
 */

/** The site's seed: every page, every load, the same brain. */
export const BRAIN_SEED = 0x9e3779b9;

/** One region per engine, in the site's order. */
export const ENGINE_SLUGS = ['memory', 'vision', 'voice', 'hands', 'agents'] as const;
/**
 * How many engine regions there are. ⚠️ Not a knob: `regionOf` returns
 * literal indices for these five, a long link is region 5 (= this count) and
 * {@link NO_REGION} is 6. The site plans nine engines; moving to nine means a
 * new partition of the cortex, not a new value here.
 */
export const ENGINE_COUNT = ENGINE_SLUGS.length;

/** The region value of a point that belongs to no engine (stem, deep tissue). */
export const NO_REGION = 6;

/**
 * Framing of each region, copied from the site: the rotation that turns the
 * region towards the camera and the camera distance. `offX`/`offY` were the
 * site's room for its text column; the backdrop centres the brain instead.
 */
export const REGION_VIEWS: ReadonlyArray<{ ry: number; rx: number; cam: number }> = [
  { ry: -1.25, rx: -0.22, cam: 5.3 },
  { ry: -2.95, rx: 0.18, cam: 5.3 },
  { ry: -4.55, rx: 0.02, cam: 5.3 },
  { ry: -5.75, rx: 0.78, cam: 5.4 },
  { ry: -6.55, rx: 0.12, cam: 5.2 },
];

export interface Rng {
  /** Uniform in [0, 1). */
  rand(): number;
  /** Uniform in [a, b). */
  rnd(a?: number, b?: number): number;
}

/**
 * mulberry32, the site's generator, bit for bit. The voice aura has the same
 * algorithm (`auraKit.seeded`); this one stays separate on purpose: the brain
 * must keep the site's draw whatever the aura's owner does to its own.
 */
export function createRng(seed: number = BRAIN_SEED): Rng {
  let s = seed | 0;
  const rand = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { rand, rnd: (a = 0, b = 1) => a + rand() * (b - a) };
}

type Vec3 = [number, number, number];

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function dir(r: Rng): Vec3 {
  let x: number, y: number, z: number, l: number;
  do { x = r.rnd(-1, 1); y = r.rnd(-1, 1); z = r.rnd(-1, 1); l = x * x + y * y + z * z; } while (l > 1 || l < 1e-4);
  l = Math.sqrt(l);
  return [x / l, y / l, z / l];
}

/** The gyri: a field whose zero set is the sulci the points avoid. */
function fold(x: number, y: number, z: number): number {
  const a = Math.sin(17.0 * y + 3.2 * Math.sin(9.0 * z + 2.4 * x));
  const b = Math.cos(15.0 * z + 2.8 * Math.sin(11.0 * x + 1.6 * y));
  const c = Math.sin(19.0 * x + 2.2 * Math.sin(13.0 * z));
  return a * 0.5 + b * 0.35 + c * 0.15;
}

function cortexPoint(r: Rng, inner: boolean): Vec3 | null {
  for (let tries = 0; tries < 60; tries++) {
    const h = r.rand() < 0.5 ? -1 : 1;
    const d = dir(r);
    const lat = d[0] * h;
    const rx = lat > 0 ? 0.74 : 0.24, ry = d[1] > 0 ? 0.8 : 0.56, rz = d[2] > 0 ? 1.08 : 1.2;
    let x = h * 0.3 + d[0] * rx * (1 - 0.12 * Math.max(0, d[2]));
    let y = d[1] * ry - 0.1 * Math.max(0, d[2]) * Math.max(0, d[1]);
    const z = d[2] * rz;
    if (d[1] < 0 && lat > 0.15) {
      const t = Math.max(0, 1 - Math.abs(d[2] - 0.1) / 0.75);
      y -= 0.13 * t * -d[1];
      x += h * 0.05 * t;
    }
    const an = Math.abs(fold(x, y, z));
    let keep = inner ? 1 : (lat < -0.2 ? 0.45 : 1) * (0.03 + 0.97 * smooth(0.12, 0.34, an));
    if (!inner && lat > 0.3 && z > -0.5 && Math.abs(y - (-0.06 + 0.32 * (z - 0.1))) < 0.07) keep *= 0.06;
    if (!inner && y > 0.05 && Math.abs(z - (-0.06 - 0.22 * (y - 0.5))) < 0.045) keep *= 0.08;
    if (r.rand() > keep) continue;
    const cx = h * 0.3;
    let k = 1 + 0.08 * smooth(0.05, 0.5, an) - 0.04;
    k *= inner ? 0.25 + 0.7 * Math.sqrt(r.rand()) : 1 - r.rand() * 0.025;
    return [cx + (x - cx) * k, y * k, z * k];
  }
  return null;
}

function cerebellumPoint(r: Rng): Vec3 {
  const c: Vec3 = [0, -0.6, -0.84];
  for (let tries = 0; tries < 40; tries++) {
    const d = dir(r);
    const side = d[0] < 0 ? -1 : 1;
    const x = side * 0.1 + d[0] * 0.6, y = c[1] + d[1] * 0.28, z = c[2] + d[2] * 0.38;
    const fol = Math.sin((y - c[1]) * 46 + d[0] * 2);
    if (r.rand() > 0.25 + 0.75 * smooth(-0.3, 0.6, fol)) continue;
    const f = 1 + 0.03 * fol;
    return [x * f, c[1] + (y - c[1]) * f, c[2] + (z - c[2]) * f];
  }
  return c;
}

function stemPoint(r: Rng): Vec3 {
  const t = r.rand(), a = r.rand() * Math.PI * 2;
  const rad = 0.15 * (1 - 0.25 * t) * r.rnd(0.9, 1);
  return [Math.cos(a) * rad, -0.55 - t * 0.8, -0.42 + t * 0.12 + Math.sin(a) * rad];
}

type Kind = 'cortex' | 'inner' | 'cere' | 'stem';

/** Which engine a point belongs to, or -1. The site's partition, unchanged. */
function regionOf(x: number, y: number, z: number, kind: Kind): number {
  if (kind === 'stem') return -1;
  if (kind === 'cere') return 3;
  const ax = Math.abs(x);
  if (y < -0.12 && ax > 0.42 && z > -0.55 && z < 0.55) return 0;
  if (kind === 'inner' && ax > 0.12 && ax < 0.55 && y > -0.35 && y < 0.05 && z > -0.45 && z < 0.2) return 0;
  if (z < -0.86 && y > -0.35) return 1;
  if (x < -0.5 && y > -0.12 && y < 0.42 && z > -0.45 && z < 0.6) return 2;
  if (y > 0.2 && z > -0.42 && z < 0.12) return 3;
  if (z > 0.58) return 4;
  return -1;
}

export interface BrainCloud {
  /** n × xyz, brain-local. */
  pos: Float32Array;
  /** Engine index per point, {@link NO_REGION} for none. */
  reg: Float32Array;
  bright: Float32Array;
  seed: Float32Array;
  /** Where each point starts before the brain forms (n × xyz). */
  scatter: Float32Array;
  /** Cortex point indices per engine. */
  byRegion: number[][];
  cortex: Uint8Array;
  /** How far each point moves with the wind, 0 (still) to 1 (a hair tip); absent = none. */
  hair?: Float32Array;
  /** What the shader shows or hides around a face's eyes (FACE_PARTS in faceShapes); absent = none. */
  part?: Float32Array;
  /** Where each face movement takes each point at full strength (n × FACE_SHAPES × xy); absent = none. */
  shapes?: Float32Array;
  /** Each point's own colour, from its photo (n × rgb, brightest channel at 1); absent = the theme's. */
  color?: Float32Array;
  /** Which robot gear each point turns with, 1-based, 0 for none (doc 181 §12.3); absent = no gears. */
  gear?: Float32Array;
}

/** The n points of the brain, each with its region, brightness and scatter start. */
function buildBrain(n: number, r: Rng): BrainCloud {
  const pos = new Float32Array(n * 3), reg = new Float32Array(n), bright = new Float32Array(n), seed = new Float32Array(n);
  const scatter = new Float32Array(n * 3);
  const cortex = new Uint8Array(n);
  const byRegion: number[][] = Array.from({ length: ENGINE_COUNT }, () => []);
  for (let i = 0; i < n; i++) {
    const u = r.rand();
    let kind: Kind;
    let p: Vec3 | null;
    if (u < 0.8) { kind = 'cortex'; p = cortexPoint(r, false); }
    else if (u < 0.87) { kind = 'inner'; p = cortexPoint(r, true); }
    else if (u < 0.98) { kind = 'cere'; p = cerebellumPoint(r); }
    else { kind = 'stem'; p = stemPoint(r); }
    if (!p) { kind = 'inner'; p = [r.rnd(-0.3, 0.3), r.rnd(-0.2, 0.2), r.rnd(-0.4, 0.4)]; }
    pos.set(p, i * 3);
    const region = regionOf(p[0], p[1], p[2], kind);
    reg[i] = region < 0 ? NO_REGION : region;
    bright[i] = kind === 'inner' ? r.rnd(0.05, 0.3) : kind === 'stem' ? r.rnd(0.1, 0.4) : r.rnd(0.35, 1);
    seed[i] = r.rand();
    if (kind === 'cortex') cortex[i] = 1;
    if (region >= 0 && kind === 'cortex') byRegion[region]?.push(i);
    const d = dir(r), s = r.rnd(3, 7);
    scatter.set([d[0] * s, d[1] * s, d[2] * s], i * 3);
  }
  return { pos, reg, bright, seed, scatter, byRegion, cortex };
}

export interface LinkArrays {
  /** 2 vertices × xyz per link. */
  positions: Float32Array;
  /** Engine per vertex; 5 = a long link between any two regions. */
  region: Float32Array;
  /** 0 at the start of a link, 1 at its end (the travelling pulse reads it). */
  t: Float32Array;
  seed: Float32Array;
}

/** The short links inside each region and the long ones across it. */
function buildLinks(brain: BrainCloud, r: Rng): LinkArrays {
  const { pos, byRegion } = brain;
  const P: number[] = [], R: number[] = [], T: number[] = [], S: number[] = [];
  /** Coordinate c of point i (every index here comes from the cloud itself). */
  const at = (i: number, c: number): number => pos[i * 3 + c] ?? 0;
  /** A random member of a non-empty list. */
  const pick = (list: number[]): number => list[(r.rand() * list.length) | 0] ?? 0;
  const push = (a: number, b: number, region: number) => {
    const s = r.rand();
    P.push(at(a, 0), at(a, 1), at(a, 2), at(b, 0), at(b, 1), at(b, 2));
    R.push(region, region); T.push(0, 1); S.push(s, s);
  };
  byRegion.forEach((list, region) => {
    if (list.length < 10) return;
    for (let k = 0; k < 240; k++) {
      const a = pick(list);
      let best = -1, bd = Infinity;
      for (let j = 0; j < 28; j++) {
        const b = pick(list);
        const d = Math.hypot(at(a, 0) - at(b, 0), at(a, 1) - at(b, 1), at(a, 2) - at(b, 2));
        if (d > 0.07 && d < 0.34 && d < bd) { bd = d; best = b; }
      }
      if (best >= 0) push(a, best, region);
    }
  });
  const all = byRegion.flat();
  if (all.length > 0) {
    for (let k = 0; k < 260; k++) {
      // Two draws, in this order: the first point, then the second.
      const a = pick(all);
      push(a, pick(all), 5);
    }
  }
  return { positions: new Float32Array(P), region: new Float32Array(R), t: new Float32Array(T), seed: new Float32Array(S) };
}

export interface DustArrays {
  positions: Float32Array;
  seed: Float32Array;
}

/** The faint ring of dust around the brain. */
function buildDust(n: number, r: Rng): DustArrays {
  const positions = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = r.rand() * Math.PI * 2, rad = r.rnd(2.0, 3.4);
    positions.set([Math.cos(a) * rad, r.rnd(-0.5, 0.5) * (0.4 + rad * 0.2), Math.sin(a) * rad], i * 3);
    seed[i] = r.rand();
  }
  return { positions, seed };
}

/**
 * One point per engine region, on its outer surface: the region's cortex
 * point furthest along the direction of the region's centre, pushed out by 3 %.
 * The site's `regionAnchors` (brain.js), where comets leave from. Memory
 * spans both hemispheres, so its anchor is taken on the right one (x > 0), as
 * the site does. Draws nothing from the generator: the brain stays the same.
 *
 * @returns ENGINE_COUNT × xyz, brain-local.
 */
export function regionAnchors(brain: BrainCloud): Float32Array {
  const out = new Float32Array(ENGINE_COUNT * 3);
  const { pos, byRegion } = brain;
  const at = (i: number, c: number): number => pos[i * 3 + c] ?? 0;
  byRegion.forEach((list, region) => {
    const pts = list.filter(i => region !== 0 || at(i, 0) > 0);
    if (pts.length === 0) return;
    let cx = 0, cy = 0, cz = 0;
    for (const i of pts) { cx += at(i, 0); cy += at(i, 1); cz += at(i, 2); }
    const n = Math.hypot(cx, cy, cz) || 1;
    let best = pts[0] ?? 0, bd = -Infinity;
    for (const i of pts) {
      const d = (at(i, 0) * cx + at(i, 1) * cy + at(i, 2) * cz) / n;
      if (d > bd) { bd = d; best = i; }
    }
    out.set([at(best, 0) * 1.03, at(best, 1) * 1.03, at(best, 2) * 1.03], region * 3);
  });
  return out;
}

/**
 * Everything the scene draws, in the site's order of draws (brain, links,
 * dust). The order is the seed: reorder these calls and it is another brain.
 */
export function buildBrainArrays(points: number, dust: number, seed: number = BRAIN_SEED): {
  brain: BrainCloud; links: LinkArrays; dust: DustArrays;
} {
  return buildArraysFrom(r => buildBrain(points, r), dust, seed);
}

/**
 * The same three draws (figure, links, dust) for any figure's points: the
 * links and the dust are the brain's, whatever the figure (brainShapes).
 */
export function buildArraysFrom(figure: (r: Rng) => BrainCloud, dust: number, seed: number = BRAIN_SEED): {
  brain: BrainCloud; links: LinkArrays; dust: DustArrays;
} {
  const r = createRng(seed);
  const brain = figure(r);
  const links = buildLinks(brain, r);
  return { brain, links, dust: buildDust(dust, r) };
}
