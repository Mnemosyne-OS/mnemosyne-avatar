/**
 * hairModel.test.ts — the hair barely breathes at rest, sways while the head
 * moves, lags behind it and swings back into place.
 */
import { describe, it, expect } from 'vitest';
import { createHairFollow, HAIR_REST } from './hairModel';

const DT = 1 / 60;

describe('hairModel', () => {
  it('a still head: the hair only breathes', () => {
    const h = createHairFollow();
    let s = h.step(DT, { yaw: 0, pitch: 0, tilt: 0 });
    for (let f = 0; f < 120; f++) s = h.step(DT, { yaw: 0, pitch: 0, tilt: 0 });
    expect(s.amp).toBeCloseTo(HAIR_REST, 5);
    expect(s.swing).toEqual([0, 0]);
  });

  it('a turning head: the sway grows, the hair lags the other way, then both settle', () => {
    const h = createHairFollow();
    h.step(DT, { yaw: 0, pitch: 0, tilt: 0 });
    let yaw = 0, peakAmp = 0, minSwing = 0;
    for (let f = 0; f < 20; f++) {
      yaw += 0.6 * DT;
      const s = h.step(DT, { yaw, pitch: 0, tilt: 0 });
      peakAmp = Math.max(peakAmp, s.amp);
      minSwing = Math.min(minSwing, s.swing[0]);
    }
    expect(peakAmp).toBeGreaterThan(0.8);
    // The turn moves the front of the head to +x: the hair lags to -x.
    expect(minSwing).toBeLessThan(-0.01);
    let s = h.step(DT, { yaw, pitch: 0, tilt: 0 });
    for (let f = 0; f < 300; f++) s = h.step(DT, { yaw, pitch: 0, tilt: 0 });
    expect(s.amp).toBeLessThan(HAIR_REST + 0.05);
    expect(Math.abs(s.swing[0])).toBeLessThan(0.002);
  });

  it('a slow frame never throws the spring off', () => {
    const h = createHairFollow();
    h.step(DT, { yaw: 0, pitch: 0, tilt: 0 });
    const s = h.step(0.1, { yaw: 0.05, pitch: -0.03, tilt: 0.02 });
    expect(Number.isFinite(s.swing[0]) && Number.isFinite(s.swing[1])).toBe(true);
    expect(Math.abs(s.swing[0])).toBeLessThanOrEqual(0.15);
  });
});
