/**
 * faceRig.test.ts — the three movements added for the emotions and the animals
 * (doc 180 §32): each one moves its own part of any face, a person's or a
 * muzzle, and nothing far from it. Read on the rig itself (shapeOffsets), at
 * the landmarks of each face.
 */
import { describe, it, expect } from 'vitest';
import { createPortraitFigure, type PortraitSpec } from './portraitFigure';
import { CLAIRE_SPEC, KITTEN_SPEC, SHEPHERD_SPEC, LEO_SPEC } from './galleryFigures';
import { FS } from './faceShapes';

/** A movement's offset at a photo pixel, in the photo's pixels (x right, y up). */
const at = (spec: PortraitSpec, id: number, px: number, py: number): { x: number; y: number } => {
  const o = createPortraitFigure(spec).shapeOffsets(px, py);
  const k = 740 / 2.9;
  return { x: (o[id * 2] ?? 0) * k, y: (o[id * 2 + 1] ?? 0) * k };
};

describe('the movements added for the emotions and the animals', () => {
  for (const [name, spec] of [['claire', CLAIRE_SPEC], ['kitten', KITTEN_SPEC], ['shepherd', SHEPHERD_SPEC], ['leo', LEO_SPEC]] as const) {
    const N = spec.nose, M = spec.mouth, eye = spec.eyes[0];
    it(`${name}: the nose wrinkles up, the skin between it and the mouth with it; the eyes and the chin stay`, () => {
      const len = N.y - N.bridgeTop;
      expect(at(spec, FS.noseWrinkle, N.x + 0.15 * len, N.y).y).toBeGreaterThan(3);
      expect(at(spec, FS.noseWrinkle, N.x, (N.y + M.y) / 2).y).toBeGreaterThan(2);
      expect(Math.abs(at(spec, FS.noseWrinkle, eye.x, eye.y).y)).toBeLessThan(0.5);
      expect(Math.abs(at(spec, FS.noseWrinkle, M.x, spec.chinY).y)).toBeLessThan(0.5);
    });
    it(`${name}: the chin pushes up, the lower lip with it; the nose and the eyes stay`, () => {
      const chinMid = M.y + 0.6 * (spec.chinY - M.y);
      expect(at(spec, FS.chinRaise, M.x, chinMid).y).toBeGreaterThan(4);
      expect(at(spec, FS.chinRaise, M.x, M.y + 0.5 * M.ry).y).toBeGreaterThan(0.5);
      expect(Math.abs(at(spec, FS.chinRaise, N.x, N.y - 20).y)).toBeLessThan(0.3);
      expect(Math.abs(at(spec, FS.chinRaise, eye.x, eye.y).y)).toBe(0);
    });
    it(`${name}: a breath in widens the chest and lifts the shoulders most, the head a hair`, () => {
      const shoulderY = spec.neckBaseY + 30, side = spec.mid.x + 0.7 * spec.shoulderHalf;
      const shoulder = at(spec, FS.breath, side, shoulderY);
      expect(shoulder.x).toBeGreaterThan(3);
      expect(shoulder.y).toBeGreaterThan(4);
      const low = at(spec, FS.breath, side, Math.min(739, spec.neckBaseY + 160));
      expect(low.y).toBeLessThan(shoulder.y);
      const head = at(spec, FS.breath, eye.x, eye.y);
      expect(head.y).toBeGreaterThan(0.5);
      expect(head.y).toBeLessThan(2.5);
      expect(Math.abs(head.x)).toBe(0);
    });
    it(`${name}: puffed cheeks push out beside the mouth, away from the middle; the eyes stay`, () => {
      const [l, r] = spec.cheeks;
      const left = at(spec, FS.cheekPuff, l[0], (l[1] + M.y) / 2), right = at(spec, FS.cheekPuff, r[0], (r[1] + M.y) / 2);
      expect(left.x).toBeLessThan(-4);
      expect(right.x).toBeGreaterThan(4);
      expect(Math.abs(at(spec, FS.cheekPuff, eye.x, eye.y - 20).x)).toBeLessThan(0.5);
    });
    it(`${name}: the mouth slides to the viewer's right; the eyes stay`, () => {
      expect(at(spec, FS.mouthSide, M.x, M.y).x).toBeGreaterThan(0.1 * M.rx);
      expect(Math.abs(at(spec, FS.mouthSide, eye.x, eye.y).x)).toBeLessThan(0.3);
    });
  }
});
