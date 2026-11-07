/**
 * musicBeat.test.ts — the rhythm, read on synthetic music (doc 180 §39).
 */
import { describe, it, expect } from 'vitest';
import { createBeatTracker, tempoOf, MIN_GAP_S } from './musicBeat';

const DT = 1 / 60;
const BIN_HZ = 48000 / 2048;
const BINS = 1024;

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** A spectrum: a bed of sound everywhere, the low band at `kick` (0..255). */
function frame(bed: number, kick: number): Uint8Array {
  const b = new Uint8Array(BINS).fill(bed);
  for (let i = 1; i < Math.ceil(160 / BIN_HZ); i++) b[i] = kick;
  return b;
}

/** `seconds` of a kick at `bpm`: the low band leaps on each beat and falls back over ~80 ms. */
function run(bpm: number, seconds: number, opts: { bed?: number; jitter?: number; rand?: () => number } = {}) {
  const tr = createBeatTracker();
  const period = 60 / bpm, rand = opts.rand ?? Math.random;
  const onsets: number[] = [];
  let next = 0.3, last = -1, bpmOut: number | null = null;
  for (let f = 0; f < seconds / DT; f++) {
    const t = f * DT;
    if (t >= next) { last = t; next += period * (1 + (opts.jitter ?? 0) * (rand() * 2 - 1)); }
    const age = t - last;
    const kick = last >= 0 && age < 0.08 ? 230 - age * 1500 : 60;
    const out = tr.step(DT, frame(opts.bed ?? 70, kick), BIN_HZ);
    if (out.onset) onsets.push(t);
    bpmOut = out.bpm;
  }
  return { onsets, bpm: bpmOut };
}

describe('tempoOf', () => {
  it('reads the tempo of regular gaps, folded into one octave', () => {
    expect(tempoOf([0, 0.5, 1, 1.5, 2, 2.5])).toBeCloseTo(120, 0);
    // Every other beat heard: the same tempo, not 60.
    expect(tempoOf([0, 1, 2, 3, 4, 5])).toBeCloseTo(120, 0);
  });

  it('says nothing with too few onsets, or gaps that disagree', () => {
    expect(tempoOf([0, 0.5, 1])).toBeNull();
    expect(tempoOf([0, 0.31, 0.95, 1.2, 2.1, 2.45, 3.3])).toBeNull();
  });
});

describe('createBeatTracker', () => {
  it('hears each beat of a 120 bpm kick, and its tempo', () => {
    const { onsets, bpm } = run(120, 10);
    // ~19 beats after the first 0.3 s; the floor needs a beat or two to settle.
    expect(onsets.length).toBeGreaterThanOrEqual(17);
    expect(onsets.length).toBeLessThanOrEqual(20);
    expect(bpm).not.toBeNull();
    expect(Math.abs((bpm as number) - 120)).toBeLessThan(3);
  });

  it('follows a faster track too', () => {
    const { bpm } = run(150, 10);
    expect(Math.abs((bpm ?? 0) - 150)).toBeLessThan(4);
  });

  it('never hears two beats closer than the minimum gap', () => {
    const { onsets } = run(170, 8);
    for (let i = 1; i < onsets.length; i++) expect(onsets[i]! - onsets[i - 1]!).toBeGreaterThanOrEqual(MIN_GAP_S - 1e-9);
  });

  it('silence: no beat, no tempo', () => {
    const tr = createBeatTracker();
    let any = false, bpm: number | null = 0;
    for (let f = 0; f < 600; f++) { const o = tr.step(DT, new Uint8Array(BINS), BIN_HZ); any ||= o.onset; bpm = o.bpm; }
    expect(any).toBe(false);
    expect(bpm).toBeNull();
  });

  it('the music stopping: the tempo goes at once, never left over from before', () => {
    const tr = createBeatTracker();
    let last = -1, bpm: number | null = null;
    for (let f = 0; f < 6 / DT; f++) {
      const t = f * DT;
      if (t - last >= 0.5) last = t;
      bpm = tr.step(DT, frame(70, t - last < 0.08 ? 230 : 60), BIN_HZ).bpm;
    }
    expect(bpm).not.toBeNull();
    // Silence, though its onsets are still in the 8 s window: no tempo left.
    for (let f = 0; f < 2 / DT; f++) bpm = tr.step(DT, new Uint8Array(BINS), BIN_HZ).bpm;
    expect(bpm).toBeNull();
  });

  it('a kick with no regular pulse gives no tempo', () => {
    const { onsets, bpm } = run(110, 10, { jitter: 0.45, rand: seeded(3) });
    expect(onsets.length).toBeGreaterThan(5);
    expect(bpm).toBeNull();
  });

  it('a steady sound without a kick gives no beat', () => {
    const tr = createBeatTracker();
    let n = 0;
    for (let f = 0; f < 600; f++) if (tr.step(DT, frame(120, 120), BIN_HZ).onset) n++;
    expect(n).toBe(0);
  });
});
