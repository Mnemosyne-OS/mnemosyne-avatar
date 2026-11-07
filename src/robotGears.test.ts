/**
 * robotGears.test.ts — a robot's gears (doc 181 §12.3): they turn while the face
 * speaks or thinks, ease to a stop after, and never move at rest or under
 * reduced motion (style-cartouche §7). Only a gear's body and teeth turn with
 * it: the plate between two teeth stays, so the teeth sweep over it.
 */
import { describe, it, expect } from 'vitest';
import { createFaceAnimator, GEAR_SPEED, type FaceInput } from './faceAnimator';
import { robotFigure } from './robotSpec';
import { ROBOT_RECIPES } from './robotRecipes';
import { createRng } from './brainCloud';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const DT = 1 / 60;
const still: FaceInput = { voice: 0, spectrum: null, lookGoal: { x: 0, y: 0 }, motion: true };

/** Steps `seconds` and returns the turn at the end. */
function run(a: ReturnType<typeof createFaceAnimator>, seconds: number, input: FaceInput): number {
  let turn = 0;
  for (let f = 0; f < Math.round(seconds * 60); f++) turn = a.step(DT, input).gearTurn ?? 0;
  return turn;
}

describe('the gears turn on a real state', () => {
  it('at rest, they do not move at all', () => {
    const a = createFaceAnimator(seeded(1));
    expect(run(a, 6, still)).toBe(0);
  });

  it('while an answer is being written, they turn; after, they ease to a stop', () => {
    const a = createFaceAnimator(seeded(2));
    run(a, 1, still);
    const before = run(a, 0, still);
    const thinking = run(a, 3, { ...still, thinking: true });
    expect(thinking - before).toBeGreaterThan(GEAR_SPEED * 1);
    // Thinking over: a few seconds to fade, then still.
    const settled = run(a, 8, still);
    expect(run(a, 2, still)).toBe(settled);
  });

  it('while the voice speaks, they turn too', () => {
    const a = createFaceAnimator(seeded(3));
    expect(run(a, 2, { ...still, voice: 0.6 })).toBeGreaterThan(GEAR_SPEED * 0.5);
  });

  it('under reduced motion, never', () => {
    const a = createFaceAnimator(seeded(4));
    expect(run(a, 3, { ...still, motion: false, thinking: true, voice: 0.6 })).toBe(0);
  });
});

describe('which points turn', () => {
  it('a robot rig carries its gears in figure units; a face without gears has none', () => {
    const fig = robotFigure('robot-rouage');
    expect(fig.face.gears).toHaveLength(ROBOT_RECIPES['robot-rouage'].gears.length);
    expect(robotFigure('robot-pixel').face.gears).toHaveLength(1);
  });

  it('the gear points lie in their gear, and the plate between the teeth is left out', () => {
    const fig = robotFigure('robot-rouage');
    const gears = fig.face.gears ?? [];
    const cloud = fig.buildCloud(12000, createRng(11));
    const gear = cloud.gear;
    expect(gear).toBeDefined();
    const counts = [0, 0];
    let untaggedInRing = 0;
    for (let i = 0; i < cloud.seed.length; i++) {
      const x = cloud.pos[i * 3]!, y = cloud.pos[i * 3 + 1]!;
      const g = gear![i]!;
      if (g > 0) {
        const c = gears[g - 1]!;
        expect(Math.hypot(x - c.x, y - c.y)).toBeLessThanOrEqual(c.r * 1.01);
        counts[g - 1]! += 1;
      } else {
        for (const c of gears) {
          const d = Math.hypot(x - c.x, y - c.y);
          if (d > c.r * 0.82 && d < c.r * 0.98) untaggedInRing += 1;
        }
      }
    }
    // Both gears carry points; between the teeth, points of the plate stay still.
    expect(counts[0]).toBeGreaterThan(20);
    expect(counts[1]).toBeGreaterThan(20);
    expect(untaggedInRing).toBeGreaterThan(0);
  });
});
