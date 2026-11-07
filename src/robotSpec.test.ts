/**
 * robotSpec.test.ts — a robot drawn from its recipe (doc 181 §12.1): a map the
 * photo script's size with no hair, in the frame's useful part; landmarks in
 * the order a face has them; glowing eyes where the lids close; the figure built
 * by the same createPortraitFigure as a photo; the ids reaching the setting and
 * the scene without the license of a face of one's own.
 */
import { describe, it, expect } from 'vitest';
import { ROBOT_IDS, ROBOT_RECIPES, isRobotId } from './robotRecipes';
import { robotFigure, robotSpec, robotSpecOf, ROBOT_MAP_H, ROBOT_MAP_W } from './robotSpec';
import { createRng } from './brainCloud';
import { FACE_PARTS } from './faceShapes';

const FRAME_W = 514, FRAME_H = 740;
const bytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
/** The map's value under a frame pixel. */
const at = (cells: Uint8Array, px: number, py: number) => cells[Math.floor((py / FRAME_H) * ROBOT_MAP_H) * ROBOT_MAP_W + Math.floor((px / FRAME_W) * ROBOT_MAP_W)] ?? 0;

describe.each(ROBOT_IDS)('%s', id => {
  const spec = robotSpec(ROBOT_RECIPES[id]);
  const cells = bytes(spec.map.b64);

  it('draws a map of the photo script’s size, coloured, with no hair', () => {
    expect([spec.map.w, spec.map.h]).toEqual([ROBOT_MAP_W, ROBOT_MAP_H]);
    expect(cells).toHaveLength(ROBOT_MAP_W * ROBOT_MAP_H);
    expect(bytes(spec.map.rgb!)).toHaveLength(ROBOT_MAP_W * ROBOT_MAP_H * 3);
    expect(Math.max(...cells)).toBeLessThan(128);
    // A robot fills a good part of the frame: not an empty map, not a full one.
    const lit = cells.filter(v => v > 0).length / cells.length;
    expect(lit).toBeGreaterThan(0.2);
    expect(lit).toBeLessThan(0.75);
  });

  it('stays in the frame’s useful part: nothing at the top, the head clear of the sides', () => {
    for (let y = 0; y < ROBOT_MAP_H; y++) {
      for (let x = 0; x < ROBOT_MAP_W; x++) {
        if (!cells[y * ROBOT_MAP_W + x]) continue;
        const px = ((x + 0.5) / ROBOT_MAP_W) * FRAME_W, py = ((y + 0.5) / ROBOT_MAP_H) * FRAME_H;
        expect(py).toBeGreaterThan(55);
        if (py < spec.chinY) expect(Math.min(px, FRAME_W - px)).toBeGreaterThan(40);
      }
    }
  });

  it('has its landmarks in the order of a face', () => {
    const [l, r] = spec.eyes;
    expect(l.x).toBeLessThan(r.x);
    expect(Math.max(...spec.brows.flat().map(p => p[1]))).toBeLessThan(l.y - l.ry);
    expect(spec.mouth.y).toBeGreaterThan(l.y + l.ry);
    expect(spec.chinY).toBeGreaterThan(spec.mouth.y);
    expect(spec.pivotY).toBeGreaterThan(spec.chinY);
    expect(spec.neckBaseY).toBeGreaterThan(spec.pivotY);
    // The eyes glow where the lids close over them, the mouth is drawn where it opens.
    expect(at(cells, l.x, l.y)).toBeGreaterThanOrEqual(100);
    expect(at(cells, r.x, r.y)).toBeGreaterThanOrEqual(100);
    expect(at(cells, spec.mouth.x, spec.mouth.y)).toBeGreaterThan(0);
  });

  it('declares its gears, and a pair of antennas as ears', () => {
    const rec = ROBOT_RECIPES[id];
    expect(spec.gears).toEqual(rec.gears.map(({ x, y, r, teeth }) => ({ x, y, r, teeth })));
    expect(spec.ears !== undefined).toBe(rec.antenna === 'pair');
  });

  it('becomes a figure the way a photo does, eyes and lids included', () => {
    const fig = robotFigure(id);
    expect(robotFigure(id)).toBe(fig);
    expect(fig.face.ears === true).toBe(ROBOT_RECIPES[id].antenna === 'pair');
    const cloud = fig.buildCloud(3000, createRng(7));
    // The figure adds its own points (shade, contours) to the ones asked for.
    expect(cloud.pos.length).toBeGreaterThanOrEqual(3000 * 3);
    const parts = Array.from(cloud.part ?? []);
    for (const p of [FACE_PARTS.IRIS_L, FACE_PARTS.IRIS_R, FACE_PARTS.LID_L, FACE_PARTS.LID_R]) expect(parts).toContain(p);
  });
});

describe('robotSpecOf', () => {
  it('a spec is drawn once per window', () => {
    expect(robotSpecOf('robot-vapeur')).toBe(robotSpecOf('robot-vapeur'));
  });
});
