/**
 * brainCloud.test.ts — the app draws the SITE's brain, not a lookalike.
 *
 * The checksums below were computed on 2026-10-23 by running the prototype's
 * own `brain.js` (proto-cerveau, the v2 site plan) under node, in its order of
 * draws: brain, links, dust. A port that changes one draw, one constant or the
 * order of two calls is another brain and turns these red.
 */
import { describe, it, expect } from 'vitest';
import { buildBrainArrays, createRng, regionAnchors, ENGINE_COUNT, NO_REGION, BRAIN_SEED } from './brainCloud';

function fnv(arrays: ArrayBufferView[]): string {
  let h = 0x811c9dc5;
  for (const a of arrays) {
    const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    for (let i = 0; i < u.length; i++) { h ^= u[i]!; h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(16);
}

/** Taken from the prototype itself (see the header). */
const PROTOTYPE = [
  { points: 36000, dust: 1600, brain: 'e51bd7b2', links: 'a371a385', linkCount: 1430, dustSum: '626c51cb', perRegion: [3366, 4729, 872, 2058, 6662] },
  { points: 14000, dust: 700, brain: '4d0ffd07', links: '489a5103', linkCount: 1431, dustSum: 'cdb1fa57', perRegion: [1255, 1808, 323, 820, 2612] },
];

describe('brainCloud', () => {
  for (const want of PROTOTYPE) {
    it(`is the prototype's brain at ${want.points} points`, () => {
      const { brain, links, dust } = buildBrainArrays(want.points, want.dust);
      expect(fnv([brain.pos, brain.reg, brain.bright, brain.seed, brain.scatter, brain.cortex])).toBe(want.brain);
      expect(fnv([links.positions, links.region])).toBe(want.links);
      expect(links.positions.length / 6).toBe(want.linkCount);
      expect(fnv([dust.positions, dust.seed])).toBe(want.dustSum);
      expect(brain.byRegion.map(l => l.length)).toEqual(want.perRegion);
    });
  }

  it('builds the same brain twice, whatever was drawn in between', () => {
    const a = buildBrainArrays(2000, 50);
    // A second generator consumed in the middle must not shift the next build.
    const other = createRng(BRAIN_SEED);
    for (let i = 0; i < 1000; i++) other.rand();
    const b = buildBrainArrays(2000, 50);
    expect(fnv([b.brain.pos, b.links.positions, b.dust.positions])).toBe(fnv([a.brain.pos, a.links.positions, a.dust.positions]));
  });

  it('gives every point a region and every engine some cortex', () => {
    const { brain } = buildBrainArrays(14000, 10);
    expect(brain.pos.length).toBe(14000 * 3);
    const stray = brain.reg.filter(r => !(r === NO_REGION || (r >= 0 && r < ENGINE_COUNT)));
    expect(stray.length).toBe(0);
    for (const list of brain.byRegion) expect(list.length).toBeGreaterThan(100);
  });

  it('another seed is another brain', () => {
    const a = buildBrainArrays(1000, 10);
    const b = buildBrainArrays(1000, 10, 42);
    expect(fnv([b.brain.pos])).not.toBe(fnv([a.brain.pos]));
  });
});

describe('regionAnchors — where the comets leave from (doc 173 §8)', () => {
  // The site's own regionAnchors (brain.js, lines 131-145) run on 2026-10-23 on
  // the brains above: the port gave the same points to the sixth decimal.
  const SITE: Record<number, number[][]> = {
    36000: [[1.035177, -0.371003, 0.095277], [0.31969, -0.009501, -1.284528], [-1.145529, -0.0011, 0.014727], [0.391829, 0.804124, -0.41226], [0.318659, 0.011271, 1.154513]],
    14000: [[1.044839, -0.355933, 0.080322], [0.291798, 0.009, -1.281101], [-1.143545, -0.014821, -0.022703], [0.414347, 0.791057, -0.421501], [0.318659, 0.011271, 1.154513]],
  };

  it.each([36000, 14000])('gives the site\'s anchors on the %i-point brain', (n) => {
    const a = regionAnchors(buildBrainArrays(n, 10).brain);
    expect(a).toHaveLength(ENGINE_COUNT * 3);
    SITE[n]!.forEach((xyz, r) => xyz.forEach((v, c) => expect(a[r * 3 + c]).toBeCloseTo(v, 5)));
  });
});
