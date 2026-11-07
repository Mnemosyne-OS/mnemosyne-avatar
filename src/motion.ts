/**
 * motion — how the head turns at rest: towards the person, towards the pointer,
 * and back to the front, every step frame-rate independent (doc 173 §8).
 *
 * Pure, so the face modules and the scene share one easing and the tests read it.
 * The app's board cues (a window opened, an answer given memory) build on these.
 *
 * @module avatar/motion
 */

/**
 * The figure at rest faces the person: for the brain, the frontal lobe towards
 * the camera, both hemispheres seen side by side. After a cue it comes back here
 * once the light has settled.
 */
export const FRONT = { ry: 0, rx: 0.12, cam: 5.3 };
/** Seconds for the heading to come most of the way back to the front. */
export const FRONT_RETURN_S = 0.9;

/** The front, on the turn of `ry` closest to it: the way back is never a full spin. */
export function frontNear(ry: number): number {
  const TAU = Math.PI * 2;
  return FRONT.ry + TAU * Math.round((ry - FRONT.ry) / TAU);
}

/** One step towards a target at rest, frame-rate independent. */
export function settle(current: number, target: number, dt: number, seconds: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / seconds));
}

/** How far the figure turns towards the pointer: at the screen's edge, in radians. */
export const GAZE_RY = 0.5;
export const GAZE_RX = 0.28;
/** Seconds for the gaze to catch most of the way up with the pointer. */
export const GAZE_FOLLOW_S = 0.35;

/** Where the figure looks for a pointer at (px, py) in the layer, 0..1 each, centre 0.5. */
export function gazeTarget(px: number, py: number): { ry: number; rx: number } {
  const x = Math.min(1, Math.max(0, px)) - 0.5;
  const y = Math.min(1, Math.max(0, py)) - 0.5;
  return { ry: x * 2 * GAZE_RY, rx: y * 2 * GAZE_RX };
}

/** One step of a smoothed follow, frame-rate independent. */
export function follow(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / GAZE_FOLLOW_S));
}
