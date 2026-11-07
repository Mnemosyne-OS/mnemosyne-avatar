/**
 * faceHearing.test.ts — no yawn while the person speaks to her. Their voice
 * (`hearing` in the input) counts as them being there, so she neither waits nor
 * dozes off; no yawn starts; one under way fades out instead of snapping shut.
 */
import { describe, it, expect } from 'vitest';
import { createFaceAnimator, SLEEP_AFTER_S, YAWN_CUT_S, type FaceInput, type MoveId } from './faceAnimator';
import { FS } from './faceShapes';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const DT = 1 / 30;
const quiet: FaceInput = { voice: 0, spectrum: null, lookGoal: { x: 0, y: 0 }, motion: true };
const speaking: FaceInput = { ...quiet, hearing: true };

describe('the face while the person speaks', () => {
  it('never dozes off on someone talking to her; left alone that long, she does', () => {
    const run = (input: FaceInput) => {
      const a = createFaceAnimator(seeded(5));
      let sleep = 0;
      for (let f = 0; f < (SLEEP_AFTER_S + 40) / DT; f++) sleep = a.step(DT, input).sleep;
      return sleep;
    };
    expect(run(speaking)).toBeLessThan(0.05);
    expect(run(quiet)).toBeGreaterThan(0.5);
  });

  it('starts no yawn while hearing; left waiting, a cat yawns', () => {
    const yawns = (input: FaceInput, seconds: number) => {
      const seen: MoveId[] = [];
      const a = createFaceAnimator(seeded(9), { species: 'cat', ears: true, onMove: id => seen.push(id) });
      for (let f = 0; f < seconds / DT; f++) a.step(DT, input);
      return seen.filter(id => id === 'yawn' || id === 'yawnLong').length;
    };
    expect(yawns(speaking, 600)).toBe(0);
    expect(yawns(quiet, 280)).toBeGreaterThan(0);
  });

  it('a yawn under way fades out when the person starts speaking, over a moment, not at once', () => {
    const jaw = (hearingAfter: boolean, at: number) => {
      const a = createFaceAnimator(seeded(3));
      a.express('yawnLong');
      let w = 0;
      for (let f = 0; f < 1.5 / DT; f++) w = a.step(DT, quiet).weights[FS.jawOpen] ?? 0;
      for (let f = 0; f < at / DT; f++) w = a.step(DT, hearingAfter ? speaking : quiet).weights[FS.jawOpen] ?? 0;
      return w;
    };
    const open = jaw(false, 0);
    expect(open).toBeGreaterThan(0.2);
    // Still yawning without a voice; half faded half-way; shut once the fade is over.
    expect(jaw(false, YAWN_CUT_S + 0.1)).toBeGreaterThan(0.2);
    const half = jaw(true, YAWN_CUT_S / 2);
    expect(half).toBeGreaterThan(0.1 * open);
    expect(half).toBeLessThan(0.9 * open);
    expect(jaw(true, YAWN_CUT_S + 0.1)).toBeLessThan(0.02);
  });
});
