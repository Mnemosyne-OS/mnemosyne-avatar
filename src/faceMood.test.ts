/**
 * faceMood.test.ts — how she feels lasts (doc 180 §28): at rest her mood shows
 * nothing; a caress leaves her glad for a while, a start leaves her lively, a
 * long wait calms her, sleep takes her arousal; every nudge fades.
 */
import { describe, it, expect } from 'vitest';
import { createFaceMood, drowsiness, gestureGapScale, gladness, lowness, MOOD_REST } from './faceMood';
import { createFaceAnimator, WAKE_S, type FaceInput } from './faceAnimator';
import { FS } from './faceShapes';

const DT = 1 / 60;
const QUIET = { waiting: false, stroked: 0, sleep: 0, thinking: 0 };
const run = (m: ReturnType<typeof createFaceMood>, seconds: number, state = QUIET) => {
  let r = m.get();
  for (let f = 0; f < seconds * 60; f++) r = m.step(DT, state);
  return r;
};

describe('faceMood', () => {
  it('at rest she shows nothing of her mood, and her gestures keep their pace', () => {
    const m = createFaceMood();
    const r = run(m, 60);
    expect(r).toEqual(MOOD_REST);
    expect(gladness(r)).toBe(0);
    expect(lowness(r)).toBe(0);
    expect(drowsiness(r)).toBe(0);
    expect(gestureGapScale(r)).toBe(1);
  });

  it('a caress leaves her glad for a while after it, then it fades', () => {
    const m = createFaceMood();
    run(m, 4, { ...QUIET, stroked: 1 });
    const after = run(m, 10);
    expect(gladness(after)).toBeGreaterThan(0.2);
    expect(run(m, 240).valence).toBeLessThan(0.1);
  });

  it('a start makes her lively (her gestures come sooner); a sorry sentence lowers her', () => {
    const m = createFaceMood();
    m.nudge('startled');
    const r = run(m, 5);
    expect(r.arousal).toBeGreaterThan(MOOD_REST.arousal + 0.2);
    expect(gestureGapScale(r)).toBeLessThan(0.8);
    const s = createFaceMood();
    s.nudge('sorry'); s.nudge('sorry');
    expect(lowness(run(s, 6))).toBeGreaterThan(0.1);
  });

  it('a long wait calms her (drowsy), sleep takes nearly all her arousal', () => {
    const m = createFaceMood();
    expect(drowsiness(run(m, 20, { ...QUIET, waiting: true }))).toBeGreaterThan(0.3);
    expect(run(m, 30, { ...QUIET, sleep: 1 }).arousal).toBeLessThan(0.05);
  });
});

/** A small seeded generator, so a run is the same every time. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const still: FaceInput = { voice: 0, spectrum: null, lookGoal: { x: 0, y: 0 }, motion: true };

describe('her mood on her face (faceAnimator)', () => {
  it('stroked, she stays glad after the hand has gone: a hint of a smile the whole time', () => {
    const a = createFaceAnimator(seeded(41));
    for (let f = 0; f < 60 * (WAKE_S + 1); f++) a.step(DT, still);
    const stroke: FaceInput = { ...still, near: { dist: 0.8, speed: 0.1, approach: 0, dx: 0.5, dy: 0 } };
    for (let f = 0; f < 60 * 5; f++) a.step(DT, stroke);
    for (let f = 0; f < 60 * 4; f++) a.step(DT, still);
    let least = 1;
    for (let f = 0; f < 60 * 4; f++) least = Math.min(least, a.step(DT, still).weights[FS.smileL] ?? 0);
    expect(gladness(a.mood())).toBeGreaterThan(0.15);
    expect(least).toBeGreaterThan(0.03);
  });

  it('a pointer rushing at her face leaves her lively', () => {
    const a = createFaceAnimator(seeded(42));
    for (let f = 0; f < 60 * (WAKE_S + 1); f++) a.step(DT, still);
    a.step(DT, { ...still, near: { dist: 1.5, speed: 6, approach: 5, dx: 0.3, dy: 0 } });
    for (let f = 0; f < 60 * 4; f++) a.step(DT, still);
    expect(a.mood().arousal).toBeGreaterThan(MOOD_REST.arousal + 0.2);
  });
});
