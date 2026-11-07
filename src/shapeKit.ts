/**
 * shapeKit — what every backdrop figure is built from: the regions, a random
 * direction, a stable hash, one point's description, and the loop that turns
 * points into a cloud the scene can draw (brainShapes, womanFigure).
 *
 * @module avatar/shapeKit
 */
import { ENGINE_COUNT, NO_REGION, type BrainCloud, type Rng } from './brainCloud';
import { FACE_SHAPE_COUNT } from './faceShapes';

/** Region indices, in ENGINE_SLUGS order. */
export const MEMORY = 0, VISION = 1, VOICE = 2, HANDS = 3, AGENTS = 4;

export type Vec3 = [number, number, number];

/** A random unit direction. */
export function dir(r: Rng): Vec3 {
  let x: number, y: number, z: number, l: number;
  do { x = r.rnd(-1, 1); y = r.rnd(-1, 1); z = r.rnd(-1, 1); l = x * x + y * y + z * z; } while (l > 1 || l < 1e-4);
  l = Math.sqrt(l);
  return [x / l, y / l, z / l];
}

/** A deterministic 0..1 value per integer, so a lock or a strand keeps its shape. */
export const hash = (k: number): number => {
  const v = Math.sin(k * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * One point of a figure. `cortex` = the links may join it; `hair` = how far
 * the wind moves it (0..1); `part` = what the shader shows or hides around a
 * face's eyes (FACE_PARTS); `shapes` = where each face movement takes it at
 * full strength (FACE_SHAPES order, x then y). None when absent.
 */
export interface ShapePoint {
  p: Vec3;
  region: number;
  bright: number;
  cortex: boolean;
  hair?: number;
  part?: number;
  shapes?: Float32Array;
  /** Its own colour (rgb, brightest channel at 1), taken from a photo. */
  color?: readonly [number, number, number];
  /** The robot's gear it belongs to, 1-based (doc 181 §12.3); absent: none. */
  gear?: number;
}

/** The points of every contour chain of a figure, each with its place along its chain. */
export interface ArcArrays {
  pos: Float32Array;
  /** 0 at the chain's start, 1 at its end. */
  t: Float32Array;
  /** The chain's length, in figure units (the spark's speed is in units per second). */
  len: Float32Array;
  /** One value per chain: when its sparks fire. */
  seed: Float32Array;
  reg: Float32Array;
  /** How far the wind moves the point (a hair contour moves with the hair). */
  hair: Float32Array;
}

/** Fill the arrays of a cloud from a point source. */
export function cloudFrom(n: number, r: Rng, point: () => ShapePoint): BrainCloud {
  const pos = new Float32Array(n * 3), reg = new Float32Array(n), bright = new Float32Array(n), seed = new Float32Array(n);
  const hair = new Float32Array(n), part = new Float32Array(n);
  let shapes: Float32Array | null = null, color: Float32Array | null = null, gear: Float32Array | null = null;
  let windy = false, parted = false;
  const scatter = new Float32Array(n * 3);
  const cortex = new Uint8Array(n);
  const byRegion: number[][] = Array.from({ length: ENGINE_COUNT }, () => []);
  for (let i = 0; i < n; i++) {
    const q = point();
    pos.set(q.p, i * 3);
    reg[i] = q.region < 0 ? NO_REGION : q.region;
    bright[i] = q.bright;
    seed[i] = r.rand();
    if (q.cortex) cortex[i] = 1;
    if (q.hair) { hair[i] = q.hair; windy = true; }
    if (q.part) { part[i] = q.part; parted = true; }
    if (q.shapes) {
      shapes ??= new Float32Array(n * FACE_SHAPE_COUNT * 2);
      shapes.set(q.shapes, i * FACE_SHAPE_COUNT * 2);
    }
    if (q.color) { color ??= new Float32Array(n * 3); color.set(q.color, i * 3); }
    if (q.gear) { gear ??= new Float32Array(n); gear[i] = q.gear; }
    if (q.region >= 0 && q.cortex) byRegion[q.region]?.push(i);
    const d = dir(r), s = r.rnd(3, 7);
    scatter.set([d[0] * s, d[1] * s, d[2] * s], i * 3);
  }
  return {
    pos, reg, bright, seed, scatter, byRegion, cortex,
    ...(windy ? { hair } : {}), ...(parted ? { part } : {}), ...(shapes ? { shapes } : {}), ...(color ? { color } : {}), ...(gear ? { gear } : {}),
  };
}
