/**
 * motion.test.ts — the head at rest: towards the pointer, and back to the front.
 */
import { describe, it, expect } from 'vitest';

describe('at rest: the gaze and the way back to the front', () => {
  it('looks towards the pointer, straight ahead in the middle, never further than the edge', async () => {
    const { gazeTarget, GAZE_RY, GAZE_RX } = await import('./motion');
    expect(gazeTarget(0.5, 0.5)).toEqual({ ry: 0, rx: 0 });
    expect(gazeTarget(1, 1)).toEqual({ ry: GAZE_RY, rx: GAZE_RX });
    expect(gazeTarget(9, -9)).toEqual({ ry: GAZE_RY, rx: -GAZE_RX });
  });

  it('the way back to the front is never a full spin', async () => {
    const { frontNear, FRONT } = await import('./motion');
    for (const ry of [-0.4, 3, -3.5, -13, 20]) expect(Math.abs(frontNear(ry) - ry)).toBeLessThanOrEqual(Math.PI + 1e-9);
    expect(frontNear(0.2)).toBeCloseTo(FRONT.ry, 9);
  });
});
