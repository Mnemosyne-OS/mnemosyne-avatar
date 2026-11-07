/**
 * womanFigure.test.ts — the woman's rig (doc 180): where each face movement
 * takes the skin, measured on the photo's landmarks, and her lashes.
 */
import { beforeAll, describe, it, expect } from 'vitest';
import { buildShapeCloud, SHAPE_VIEWS } from './brainShapes';
import { createRng } from './brainCloud';
import { FACE_PARTS, FACE_SHAPE_COUNT, FS, type FaceShapeId } from './faceShapes';
import { WOMAN } from './womanFigure';
import { loadPortraitMap } from './portraitMaps';

// Her map is fetched when she is worn (doc 180 §27): here, first.
beforeAll(async () => { await loadPortraitMap('woman'); });

const portraitBrowLift = WOMAN.browLift, portraitJaw = WOMAN.jaw, portraitShapeOffsets = WOMAN.shapeOffsets, portraitSmile = WOMAN.smile;

/** Where a movement takes a pixel of the photo, in figure units: [dx, dy up]. */
const at = (px: number, py: number, id: FaceShapeId): [number, number] => {
  const o = portraitShapeOffsets(px, py);
  return [o[FS[id] * 2]!, o[FS[id] * 2 + 1]!];
};

describe('womanFigure — the rig', () => {
  it('every point carries an offset for every movement', () => {
    const cloud = buildShapeCloud('woman', 3000, createRng(7));
    // Its points and its shade points (drawn on a light ground only), every one rigged.
    expect(cloud.shapes!.length).toBe(cloud.seed.length * FACE_SHAPE_COUNT * 2);
    expect(cloud.seed.length).toBeGreaterThan(3000);
    expect(cloud.shapes!.every(Number.isFinite)).toBe(true);
  });

  it('a brow raise lifts the brow most, the forehead less, the upper lid a little, and nothing far away', () => {
    expect(portraitBrowLift(170, 234)).toEqual({ side: 0, lift: 1 });
    expect(portraitBrowLift(340, 229)!.side).toBe(1);
    const forehead = portraitBrowLift(170, 200)!.lift;
    expect(forehead).toBeGreaterThan(0);
    expect(forehead).toBeLessThan(0.8);
    const lid = portraitBrowLift(170, 252)!.lift;
    expect(lid).toBeGreaterThan(0);
    expect(lid).toBeLessThan(0.6);
    expect(portraitBrowLift(170, 300)).toBeNull();
    // Each brow moves on its own: the left raise leaves the right brow still.
    expect(at(170, 234, 'browUpL')[1]).toBeGreaterThan(0.02);
    expect(at(340, 229, 'browUpL')[1]).toBe(0);
  });

  it('a frown draws the brows down and together; worry lifts their inner ends only', () => {
    const [lx, ly] = at(225, 248, 'browFrown');
    const [rx] = at(288, 251, 'browFrown');
    expect(ly).toBeLessThan(0);
    expect(lx).toBeGreaterThan(0);
    expect(rx).toBeLessThan(0);
    expect(at(225, 248, 'browInnerUp')[1]).toBeGreaterThan(at(140, 245, 'browInnerUp')[1] * 3);
  });

  it('a smile lifts the corners up and out, each side its own movement', () => {
    const [lx, ly] = portraitSmile(200, 439);
    const [rx, ry] = portraitSmile(314, 439);
    expect(lx).toBeLessThan(0);
    expect(rx).toBeGreaterThan(0);
    expect(ly).toBeGreaterThan(5);
    expect(ry).toBeGreaterThan(5);
    expect(Math.abs(portraitSmile(257, 439)[1])).toBeLessThan(ly / 3);
    expect(at(200, 439, 'smileL')[1]).toBeGreaterThan(0);
    expect(at(200, 439, 'smileR')[1]).toBe(0);
  });

  it('a frowning mouth takes the corners down; pressed lips close on the line between them', () => {
    expect(at(200, 439, 'mouthFrown')[1]).toBeLessThan(0);
    expect(at(257, 465, 'lipPress')[1]).toBeGreaterThan(0);
    expect(at(257, 420, 'lipPress')[1]).toBeLessThan(0);
  });

  it('an opening jaw carries the lower lip and the chin down, lifts the upper lip a little, fades to the cheeks', () => {
    expect(portraitJaw(257, 420)).toBe(0);
    expect(portraitJaw(257, 460)).toBeCloseTo(1, 1);
    expect(portraitJaw(257, 520)).toBeCloseTo(1, 1);
    expect(portraitJaw(257, 600)).toBe(0);
    expect(portraitJaw(120, 470)).toBeLessThan(0.2);
    expect(at(257, 470, 'jawOpen')[1]).toBeLessThan(-0.04);
    expect(at(257, 425, 'jawOpen')[1]).toBeGreaterThan(0);
  });

  it('the vowels stretch or round the lips about the mouth\'s middle', () => {
    expect(at(300, 439, 'lipsWide')[0]).toBeGreaterThan(0);
    expect(at(210, 439, 'lipsWide')[0]).toBeLessThan(0);
    expect(at(300, 439, 'lipsRound')[0]).toBeLessThan(0);
  });

  it('a head tilt turns the head about the neck and leaves the shoulders still', () => {
    // A tilt to the viewer's left: the top of the head goes left, the chin's side goes up.
    expect(at(257, 120, 'headTilt')[0]).toBeLessThan(-0.05);
    expect(at(150, 400, 'headTilt')[1]).toBeLessThan(0);
    const [sx, sy] = at(60, 720, 'headTilt');
    expect(Math.hypot(sx, sy)).toBe(0);
  });

  it('the cheeks rise with the cheek movement; the shoulder, far from the face, moves only with the breath', () => {
    expect(at(190, 382, 'cheekRaise')[1]).toBeGreaterThan(0.015);
    const shoulder = portraitShapeOffsets(40, 720);
    const b = FS.breath * 2;
    expect(shoulder.every((v, i) => i === b || i === b + 1 || Math.abs(v) < 1e-4)).toBe(true);
    expect(shoulder[b + 1]).toBeGreaterThan(0.005);
  });
});

describe('womanFigure — the lashes', () => {
  it('grow from the upper lid, upward, reaching further at the outer corner', () => {
    const cloud = buildShapeCloud('woman', 20000, createRng(7));
    const face = SHAPE_VIEWS.woman.face!;
    for (const [code, eye, out] of [[FACE_PARTS.LASH_L, face.eyes[0]!, -1], [FACE_PARTS.LASH_R, face.eyes[1]!, 1]] as const) {
      let inner = -Infinity, outer = -Infinity;
      for (let i = 0; i < cloud.part!.length; i++) {
        if (cloud.part![i] !== code) continue;
        const x = cloud.pos[i * 3]!, y = cloud.pos[i * 3 + 1]!;
        expect(y).toBeGreaterThan(eye.y);
        const side = (x - eye.x) * out;
        if (side < 0) inner = Math.max(inner, Math.hypot(x - eye.x, y - eye.y));
        else outer = Math.max(outer, Math.hypot(x - eye.x, y - eye.y));
      }
      expect(outer).toBeGreaterThan(inner);
    }
  });
});
