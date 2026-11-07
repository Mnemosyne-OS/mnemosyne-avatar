/**
 * faceShapes.test.ts — the movements' table and its texture: every point's
 * offset for every movement lands where the shader reads it.
 */
import { describe, it, expect } from 'vitest';
import { FACE_SHAPES, FACE_SHAPE_COUNT, FACE_SHAPE_MAX, FACE_TEXTURE_WIDTH, FS, packFaceShapes } from './faceShapes';

describe('faceShapes', () => {
  it('fits the shader: no more movements than its loop adds up', () => {
    expect(FACE_SHAPE_COUNT).toBeLessThanOrEqual(FACE_SHAPE_MAX);
    expect(new Set(FACE_SHAPES).size).toBe(FACE_SHAPE_COUNT);
    FACE_SHAPES.forEach((id, i) => expect(FS[id]).toBe(i));
  });

  it('packs two movements per texel, each point in its own run of texels, as the shader reads them', () => {
    const n = 3000;
    const shapes = new Float32Array(n * FACE_SHAPE_COUNT * 2);
    for (let i = 0; i < shapes.length; i++) shapes[i] = (i % 997) / 997 - 0.5;
    const { data, width, height, pairs } = packFaceShapes(shapes, n);
    expect(width).toBe(FACE_TEXTURE_WIDTH);
    expect(pairs).toBe(Math.ceil(FACE_SHAPE_COUNT / 2));
    expect(width * height).toBeGreaterThanOrEqual(n * pairs);
    // The shader: texel = point * pairs + movement / 2, x/y in .xy for an even movement, .zw for an odd one.
    for (const [i, s] of [[0, 0], [1, 1], [1234, 5], [n - 1, FACE_SHAPE_COUNT - 1]] as const) {
      const texel = i * pairs + (s >> 1);
      const at = texel * 4 + (s & 1) * 2;
      expect(data[at]).toBe(shapes[(i * FACE_SHAPE_COUNT + s) * 2]);
      expect(data[at + 1]).toBe(shapes[(i * FACE_SHAPE_COUNT + s) * 2 + 1]);
    }
  });
});
