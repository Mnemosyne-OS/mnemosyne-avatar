/**
 * portraitMaps.test.ts — a free face's map is fetched only when it is worn
 * (doc 180 §27): once, shared by every reader; never read before it is here;
 * and no module of the scene imports a map outright again, which would bring
 * all twelve back with the board.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

beforeEach(() => { vi.resetModules(); });

describe('portraitMaps', () => {
  it('a map is not there before it is asked for; asked twice, it is fetched once', async () => {
    const { isPortraitMapLoaded, loadPortraitMap, portraitMap } = await import('./portraitMaps');
    expect(isPortraitMapLoaded('mei')).toBe(false);
    expect(() => portraitMap('mei')).toThrow(/not loaded/);
    const [a, b] = await Promise.all([loadPortraitMap('mei'), loadPortraitMap('mei')]);
    expect(a).toBe(b);
    expect(portraitMap('mei')).toBe(a);
    expect(a.w).toBeGreaterThan(0);
    expect(a.b64.length).toBeGreaterThan(1000);
    // Only that one: the others stay where they are.
    expect(isPortraitMapLoaded('kofi')).toBe(false);
  });

  it('a face built before its map came throws, never draws an empty face', async () => {
    const { buildShapeCloud } = await import('./brainShapes');
    const { createRng } = await import('./brainCloud');
    expect(() => buildShapeCloud('kenji', 200, createRng(7))).toThrow(/kenji.*not loaded/);
  });

  it('no module of the scene imports a map outright: only portraitMaps fetches them, on demand', () => {
    const dir = __dirname;
    const outright = readdirSync(dir)
      .filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !/Portrait\.ts$/.test(f))
      .filter(f => /^\s*import\b[^;]*from\s+['"]\.\/\w+Portrait['"]/m.test(readFileSync(join(dir, f), 'utf8')));
    expect(outright).toEqual([]);
  });
});
