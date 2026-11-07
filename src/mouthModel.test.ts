/**
 * mouthModel.test.ts — the mouth shapes a sound like a human one: a quiet
 * syllable still opens it, silence closes it, and the vowel's colour rounds or
 * stretches the lips.
 */
import { describe, it, expect } from 'vitest';
import { mouthShape, spectralCentroid } from './mouthModel';

/** A spectrum with all its energy around one bin. */
function peakAt(bin: number): Uint8Array {
  const b = new Uint8Array(128);
  for (let i = 0; i < 128; i++) b[i] = Math.round(220 * Math.exp(-(((i - bin) / 2) ** 2)));
  return b;
}

describe('mouthModel', () => {
  it('silence closes the mouth and leaves the lips neutral', () => {
    expect(mouthShape(0, peakAt(30))).toEqual({ open: 0, spread: 0 });
  });

  it('a quiet syllable still opens the mouth more than its loudness', () => {
    expect(mouthShape(0.2, null).open).toBeGreaterThan(0.3);
    expect(mouthShape(1, null).open).toBe(1);
  });

  it('a dark vowel rounds the lips, a bright one stretches them', () => {
    expect(mouthShape(0.6, peakAt(5)).spread).toBeLessThan(-0.5);
    expect(mouthShape(0.6, peakAt(25)).spread).toBeGreaterThan(0.5);
    expect(Math.abs(mouthShape(0.6, peakAt(12)).spread)).toBeLessThan(0.2);
  });

  it('the centroid is the bin the energy balances on; none for a silent spectrum', () => {
    expect(spectralCentroid(peakAt(20))).toBeCloseTo(20, 0);
    expect(spectralCentroid(new Uint8Array(128))).toBeNaN();
    expect(mouthShape(0.6, new Uint8Array(128)).spread).toBe(0);
  });
});
