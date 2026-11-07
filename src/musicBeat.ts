/**
 * musicBeat — the rhythm of the music the face listens to (doc 180 §39).
 *
 * From the analyser's spectrum, each frame:
 *  - `onset`: a beat lands now. The low band (the kick and the bass, 40 to
 *    160 Hz) jumps over its own recent level by more than its usual spread
 *    (spectral flux against an adaptive floor), at most one every MIN_GAP_S;
 *  - `energy`: how loud the music is, 0..1, slow (a quiet passage, a drop);
 *  - `bpm`: the tempo, from the gaps between the last onsets folded into one
 *    octave (70 to 180) — or null while those gaps do not agree. A guessed
 *    tempo would make her nod beside the beat: null is said, never a default.
 *
 * Pure, fed frames, so it is tested on synthetic music.
 *
 * @module avatar/musicBeat
 */

export const LOW_HZ: readonly [number, number] = [40, 160];
/** No two beats closer than this (a 240 bpm sixteenth would be faster than any nod). */
export const MIN_GAP_S = 0.25;
/** The tempo is read over the onsets of the last few seconds. */
export const TEMPO_WINDOW_S = 8;
export const BPM_RANGE: readonly [number, number] = [70, 180];
/** Gaps within this share of their median agree. */
const AGREE = 0.08;
/** Onsets (so gaps + 1) needed before a tempo is said, and the share of gaps that must agree. */
const TEMPO_MIN_ONSETS = 5, TEMPO_MIN_SHARE = 0.6;
/** Under this loudness the music is silent: no onset. */
export const SILENT = 0.03;
/** The flux's floor follows it over about this long. */
const FLOOR_S = 1.2;
/** How many spreads over its floor the flux must rise. */
const K = 1.6;

export interface Beat {
  onset: boolean;
  energy: number;
  bpm: number | null;
}

export interface BeatTracker {
  /** One frame: `bins` is the analyser's byte spectrum, `binHz` the width of one bin. */
  step(dt: number, bins: Uint8Array, binHz: number): Beat;
}

/** The tempo the gaps agree on, or null: each gap folded into BPM_RANGE, then their median. */
export function tempoOf(onsets: readonly number[]): number | null {
  if (onsets.length < TEMPO_MIN_ONSETS) return null;
  const [lo, hi] = BPM_RANGE;
  const gaps: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    let g = (onsets[i] as number) - (onsets[i - 1] as number);
    if (g <= 0) continue;
    while (60 / g > hi) g *= 2;
    while (60 / g < lo) g /= 2;
    gaps.push(g);
  }
  if (gaps.length < TEMPO_MIN_ONSETS - 1) return null;
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] as number;
  const agree = gaps.filter(g => Math.abs(g - median) <= AGREE * median);
  if (agree.length / gaps.length < TEMPO_MIN_SHARE) return null;
  const mean = agree.reduce((n, g) => n + g, 0) / agree.length;
  return Math.round(600 / mean) / 10;
}

export function createBeatTracker(): BeatTracker {
  let started = false, t = 0, prevLow = 0, floor = 0, spread = 0, lastOnset = -Infinity, energy = 0;
  let onsets: number[] = [];
  const out: Beat = { onset: false, energy: 0, bpm: null };
  return {
    step(dt, bins, binHz) {
      t += dt;
      const from = Math.max(1, Math.floor(LOW_HZ[0] / binHz)), to = Math.max(from + 1, Math.ceil(LOW_HZ[1] / binHz));
      let low = 0;
      for (let i = from; i < to && i < bins.length; i++) low += bins[i] ?? 0;
      low /= Math.max(1, Math.min(to, bins.length) - from) * 255;
      // Loudness over the whole band music lives in (up to ~4 kHz), slow.
      const top = Math.min(bins.length, Math.ceil(4000 / binHz));
      let all = 0;
      for (let i = 1; i < top; i++) all += bins[i] ?? 0;
      all /= Math.max(1, top - 1) * 255;
      const a = Math.min(1, dt / 0.8);
      energy += (all - energy) * a;

      // The first frame has no « before »: the music starting is not a beat.
      const flux = started ? Math.max(0, low - prevLow) : 0;
      started = true;
      prevLow = low;
      const f = Math.min(1, dt / FLOOR_S);
      const over = flux - floor;
      const onset = all > SILENT && over > K * spread && flux > 0.04 && t - lastOnset >= MIN_GAP_S;
      floor += (flux - floor) * f;
      spread += (Math.abs(over) - spread) * f;
      if (onset) {
        lastOnset = t;
        onsets.push(t);
      }
      onsets = onsets.filter(at => t - at <= TEMPO_WINDOW_S);
      out.onset = onset;
      out.energy = energy;
      out.bpm = all > SILENT ? tempoOf(onsets) : null;
      return out;
    },
  };
}
