/**
 * faceGesture — what a face's movement IS, shared by every repertoire (doc 180):
 * the animator's own gestures, the emotions (faceEmotions), the scenes
 * (faceScenes), each animal's ways (faceSpecies) and a sentence's tone
 * (speechTone). A gesture is a recipe of weights held by an envelope; a move
 * in several phases is a list of gestures, each starting a little later.
 *
 * @module avatar/faceGesture
 */
import type { FaceShapeId } from './faceShapes';

/** A gesture's shape: its weights, how it moves, and what it does to the eyes. */
export interface Gesture {
  /** How far each movement goes at the top of the envelope, -1..1; the others stay at rest. */
  weights: Partial<Record<FaceShapeId, number>>;
  rise: number;
  hold: number;
  fall: number;
  /** How far each eye narrows (viewer's left, right), and how late the right one follows the left (negative: the right leads). */
  squint?: { left: number; right: number; lag: number };
  /** Where the eyes go meanwhile (pensive eyes look up and aside), -1..1. */
  look?: { x: number; y: number };
  /** Where the head turns meanwhile, as a share of its full turn (HEAD_YAW, HEAD_PITCH), -1..1. */
  head?: { yaw: number; pitch: number };
  /**
   * A sway of the head: tilting from one shoulder to the other like a pendulum, this many times
   * a second, this far (a share of the full tilt), under the envelope. Never a turn: a head
   * turning side to side reads as « no ».
   */
  swing?: { hz: number; amp: number };
  /** How far the upper lids droop meanwhile, 0..1 (heavy, tender or disdainful eyes; a slow blink at 1). */
  lid?: number;
  /** One eye's lid closing on its own, 0..1 each (a wink): viewer's left, right. */
  wink?: { left: number; right: number };
  /** The eyes turned in towards the nose, 0..1 of their reach (a cross-eyed grimace). */
  cross?: number;
  /**
   * A beat under the envelope, this many times a second: each weight goes from 0 to its value
   * and back on every beat (a laugh's « ha », a dog's panting, a sniff), and the head jolts by
   * `pitch` (a share of its full nod) up and down with it. Too quick for the head's spring, the
   * jolt is added straight onto the head.
   */
  pulse?: { hz: number; weights?: Partial<Record<FaceShapeId, number>>; pitch?: number };
  /** How hard the face's points tremble meanwhile, 0..1: a cat's purr. */
  tremble?: number;
  /** It moves the mouth: not played while she speaks, the voice owns the mouth. */
  mouth?: boolean;
}

/** One phase of a move: a gesture starting `at` seconds into it. */
export interface Phase { at: number; g: Gesture }

/**
 * An expression over time t (seconds since it began): up in `rise` seconds,
 * held `hold`, down in `fall`, smooth at both ends; 0 outside.
 */
export function envelope(t: number, rise: number, hold: number, fall: number): number {
  if (t <= 0) return 0;
  const ease = (x: number) => x * x * (3 - 2 * x);
  if (t < rise) return ease(t / rise);
  if (t < rise + hold) return 1;
  const down = (t - rise - hold) / fall;
  return down >= 1 ? 0 : 1 - ease(down);
}

export type Random = () => number;
export const pick = (rnd: Random, lo: number, hi: number) => lo + (hi - lo) * rnd();
export const side = (rnd: Random): 1 | -1 => (rnd() < 0.5 ? 1 : -1);

/** A gesture in one line: its weights, its envelope, and the rest. */
export const G = (weights: Gesture['weights'], rise: number, hold: number, fall: number, more: Partial<Gesture> = {}): Gesture => ({ weights, rise, hold, fall, ...more });
