/**
 * pointerNear — where the pointer is against a face on screen (doc 180 §13,
 * §23): between its eyes, or near it, how fast and how fast it comes closer.
 * The face animator reads it to cross its eyes, dodge, or be stroked. Shared by
 * the board's backdrop and the Avatar Studio's stage (doc 181 §5).
 *
 * @module avatar/pointerNear
 */
import { settle } from './motion';
import type { FaceInput } from './faceAnimator';

/** The face's middle sits this many eye spacings under the eyes; beyond NEAR_RANGE spacings the pointer is not near it. */
const FACE_MIDDLE_BELOW_EYES = 0.5, NEAR_RANGE = 3;
/** Seconds the pointer's speed and approach are smoothed over. */
const NEAR_SMOOTH_S = 0.08;
/** "Between the eyes": within this share of the eyes' spacing from their middle. */
const BETWEEN_EYES = 0.33;

type Pt = { x: number; y: number };
/** The eyes as last drawn, in the same pixels as the pointer: their middle and how far apart. */
type Eyes = { x: number; y: number; spread: number };

export interface NearTracker {
  /** This frame's reading; `pointerAt` null when the pointer left, `eyes` null without a face. */
  step(pointerAt: Pt | null, eyes: Eyes | null, dt: number): { between: boolean; near?: NonNullable<FaceInput['near']> };
}

/** A tracker keeps the pointer's last place to measure its speed and approach, smoothed over a few frames. */
export function createNearTracker(): NearTracker {
  let prev: { x: number; y: number; dist: number } | null = null, speed = 0, approach = 0;
  return {
    step(pointerAt, eyes, dt) {
      const between = !!eyes && !!pointerAt && Math.hypot(pointerAt.x - eyes.x, pointerAt.y - eyes.y) < BETWEEN_EYES * eyes.spread;
      if (!eyes || !pointerAt || eyes.spread <= 1 || dt <= 0) { prev = null; return { between }; }
      const cx = eyes.x, cy = eyes.y + FACE_MIDDLE_BELOW_EYES * eyes.spread;
      const dist = Math.hypot(pointerAt.x - cx, pointerAt.y - cy) / eyes.spread;
      if (prev) {
        const moved = Math.hypot(pointerAt.x - prev.x, pointerAt.y - prev.y) / eyes.spread / dt;
        speed = settle(speed, moved, dt, NEAR_SMOOTH_S);
        approach = settle(approach, (prev.dist - dist) / dt, dt, NEAR_SMOOTH_S);
      }
      prev = { x: pointerAt.x, y: pointerAt.y, dist };
      if (dist >= NEAR_RANGE) return { between };
      return { between, near: { dist, speed, approach, dx: (pointerAt.x - cx) / eyes.spread, dy: (pointerAt.y - cy) / eyes.spread } };
    },
  };
}
