/**
 * faceDream.test.ts — deep asleep, she dreams now and then (doc 180 §33): her
 * eyes dart under her closed lids in bursts, then rest; a brow or a corner of
 * her mouth twitches; an animal twitches its ears and nose, never with a
 * person's smile. Awake, none of it.
 */
import { describe, it, expect } from 'vitest';
import { createFaceAnimator, SLEEP_AFTER_S, type FaceInput } from './faceAnimator';
import { FS, type AnimalSpecies } from './faceShapes';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const still: FaceInput = { voice: 0, spectrum: null, lookGoal: { x: 0, y: 0 }, motion: true };
const DT = 1 / 60;

/** Puts a face to sleep, then watches it `seconds` asleep. */
function sleepAndWatch(seconds: number, species?: AnimalSpecies, seed = 61) {
  const a = createFaceAnimator(seeded(seed), { lifeRandom: seeded(seed + 1), ...(species ? { species, ears: species !== 'lion' } : {}) });
  for (let f = 0; f < 60 * (SLEEP_AFTER_S + 40); f++) a.step(DT, still);
  const frames: Array<{ lookX: number; blink: number; w: Float32Array }> = [];
  for (let f = 0; f < 60 * seconds; f++) { const r = a.step(DT, still); frames.push({ lookX: r.look.x, blink: r.blink, w: Float32Array.from(r.weights) }); }
  return frames;
}
/** Quick jumps of the eyes (a dart moves them far in a few frames). */
const darts = (xs: number[]) => { let n = 0; for (let i = 3; i < xs.length; i++) if (Math.abs((xs[i] ?? 0) - (xs[i - 3] ?? 0)) > 0.25) { n++; i += 6; } return n; };

describe('dreaming', () => {
  it('deep asleep, her eyes dart in bursts under shut lids, then rest a long while', () => {
    const frames = sleepAndWatch(240);
    expect(Math.min(...frames.map(f => f.blink))).toBeGreaterThan(0.95);
    const n = darts(frames.map(f => f.lookX));
    expect(n).toBeGreaterThan(15);
    // In bursts: whole stretches of half a minute without a single dart.
    let longestStill = 0, still0 = 0;
    for (let i = 3; i < frames.length; i++) {
      if (Math.abs((frames[i]?.lookX ?? 0) - (frames[i - 3]?.lookX ?? 0)) > 0.05) still0 = 0; else longestStill = Math.max(longestStill, ++still0);
    }
    expect(longestStill * DT).toBeGreaterThan(20);
  });

  it('a person dreaming twitches a brow or the corner of her mouth; an animal its ears or its nose, never a smile', () => {
    const person = sleepAndWatch(240);
    const twitches = (frames: typeof person, ids: number[]) => frames.filter((f, i) => i > 0 && ids.some(id => (f.w[id] ?? 0) > 0.15 && (frames[i - 1]?.w[id] ?? 0) <= 0.15)).length;
    expect(twitches(person, [FS.browUpL, FS.browUpR, FS.browInnerUp, FS.lipPress, FS.smileL])).toBeGreaterThan(5);
    const dog = sleepAndWatch(240, 'dog');
    expect(twitches(dog, [FS.earL, FS.earR, FS.noseWrinkle, FS.jawOpen])).toBeGreaterThan(5);
    expect(Math.max(...dog.map(f => f.w[FS.smileL] ?? 0))).toBe(0);
  });

  it('awake, her eyes never dart that way', () => {
    const a = createFaceAnimator(seeded(62), { lifeRandom: seeded(63) });
    const xs: number[] = [];
    for (let f = 0; f < 60 * 120; f++) xs.push(a.step(DT, { ...still, active: f % 300 === 0, gestures: false }).look.x);
    expect(darts(xs)).toBe(0);
  });
});
