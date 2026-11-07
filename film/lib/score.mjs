/**
 * score.mjs — a light bed for a film, synthesised here (no sample library):
 * a hop pulse (pluck + hat + a soft pad) and a soft heartbeat (lub-dub), both
 * ducked under the lines. Written to the film folder as music.wav, which
 * `audio` already mixes under the voice.
 *
 * film.json `score` (all optional):
 *   bpm    the hop's tempo (102)
 *   heart  the heartbeat's rate, beats per minute; 0 = none (66)
 *   notes  the pluck's notes, Hz, played in turn (D, F#, A, F#)
 * The bed stops at the film's end, or at `ending.at` for a tvOff ending,
 * where a falling tone plays the set switching off.
 *
 * Generalised from the bed of the first Mnemosyne OS film where the avatar
 * hosts a video.
 *
 * @module avatar-film/score
 */
import fs from 'node:fs';
import path from 'node:path';

const TAU = Math.PI * 2;
export const SCORE_DEFAULTS = Object.freeze({ bpm: 102, heart: 66, notes: [293.66, 369.99, 440.0, 369.99] });
/** Peak of the written bed, before `audio` lays it under the voice. */
const PEAK = 0.24;

/** Where the bed stops: the tvOff ending, or the film's end. */
export const scoreEnd = (film) => ((film.ending?.kind === 'tvOff' || film.ending?.kind === 'implode') && Number.isFinite(film.ending.at) ? film.ending.at : film.total);

/** The bed as two float channels. Pure (no file): testable. */
export function composeScore(film, { sr = 48000 } = {}) {
  const o = { ...SCORE_DEFAULTS, ...(film.score || {}) };
  const end = scoreEnd(film);
  const n = Math.ceil(film.total * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);

  // Under a line the bed drops to 30 %, eased in 120 ms before and out 420 ms after.
  const duck = new Float32Array(n).fill(1);
  for (const line of film.lines || []) {
    const a = Math.round((line.at - 0.12) * sr), b = Math.round(line.at * sr);
    const e = Math.round(line.end * sr), f = Math.round((line.end + 0.42) * sr);
    for (let i = Math.max(0, a); i < Math.min(n, f); i++) {
      const g = i < b ? (i - a) / (b - a) : i < e ? 1 : 1 - (i - e) / (f - e);
      duck[i] = Math.min(duck[i], 1 - 0.7 * Math.max(0, Math.min(1, g)));
    }
  }

  function thump(startS, f0, gain) {
    const start = Math.round(startS * sr);
    const len = Math.round(0.2 * sr);
    let ph = 0, lp = 0, rng = (start * 17 + 3) | 0;
    for (let j = 0; j < len && start + j < n; j++) {
      const t = j / sr;
      ph += (TAU * f0 * (1 + 0.85 * Math.exp(-t / 0.02))) / sr;
      const env = (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.07);
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      lp += 0.16 * (rng / 0x3fffffff - 1 - lp);
      // The heartbeat is ducked less than the rest: it stays felt under her voice.
      const v = gain * (env * (Math.sin(ph) + 0.4 * Math.sin(2 * ph)) + lp * Math.exp(-t / 0.005) * 0.22) * (0.62 + 0.38 * duck[start + j]);
      L[start + j] += v;
      R[start + j] += v * 0.94;
    }
  }

  function hat(startS, gain) {
    const start = Math.round(startS * sr);
    const len = Math.round(0.035 * sr);
    let rng = (start * 13 + 9) | 1, hp = 0;
    for (let j = 0; j < len && start + j < n; j++) {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      const noise = rng / 0x3fffffff - 1;
      hp += 0.4 * (noise - hp);
      const v = gain * (noise - hp) * Math.exp(-(j / sr) / 0.01) * duck[start + j];
      L[start + j] += v * 0.65;
      R[start + j] += v;
    }
  }

  function pluck(startS, freq, gain, pan) {
    const start = Math.round(startS * sr);
    const len = Math.round(0.26 * sr);
    let ph = 0;
    for (let j = 0; j < len && start + j < n; j++) {
      const t = j / sr;
      ph += (TAU * freq) / sr;
      const v = gain * Math.exp(-t / 0.085) * (Math.sin(ph) + 0.22 * Math.sin(2 * ph)) * duck[start + j];
      L[start + j] += v * (1 - pan);
      R[start + j] += v * (1 + pan);
    }
  }

  // A note can ring past the end by its own decay; nothing starts after it.
  const beat = 60 / o.bpm;
  for (let s = 0.35, k = 0; s < end; s += beat, k++) {
    hat(s + beat * 0.5, 0.016);
    if (k % 2 === 0) pluck(s, o.notes[(k / 2) % o.notes.length], 0.028, k % 4 === 0 ? -0.25 : 0.25);
  }
  if (o.heart > 0) {
    for (let s = 0.55; s < end; s += 60 / o.heart) { thump(s, 50, 0.042); thump(s + 0.17, 60, 0.026); }
  }
  const padEnd = Math.min(n, Math.round(end * sr));
  for (let i = 0; i < padEnd; i++) {
    const t = i / sr;
    const v = 0.011 * Math.min(1, t / 2.2) * duck[i] * (Math.sin(TAU * 73.42 * t) + 0.45 * Math.sin(TAU * 146.83 * t));
    L[i] += v;
    R[i] += v * 0.88;
  }

  // The ball gathering: a swoop, air rushing in (noise whose filter opens) over a tone rising
  // from 110 Hz, swelling as the points close in, cut short as it goes out.
  if (film.ending?.kind === 'implode') {
    const pd = Math.round(end * sr), dur = Number(film.ending.dur) > 0 ? Number(film.ending.dur) : 1.8;
    let ph = 0, lp = 0, seed = 12345;
    for (let j = 0; pd + j < n && j / sr < dur; j++) {
      const u = j / sr / dur;
      ph += (TAU * 110 * Math.pow(6, u)) / sr;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      // One pole low-pass, its cut-off sweeping from ~300 Hz to ~6 kHz.
      lp += (1 - Math.exp(-TAU * (300 * Math.pow(20, u)) / sr)) * ((seed / 4294967296) * 2 - 1 - lp);
      const swell = u * u * Math.max(0, Math.min(1, (1 - u) / 0.08));
      const v = swell * (0.09 * Math.sin(ph) + 0.35 * lp);
      L[pd + j] += v;
      R[pd + j] += v;
    }
  }

  // The set switching off: a tone falling from 240 Hz over 0.75 s.
  if (film.ending?.kind === 'tvOff') {
    const pd = Math.round(end * sr);
    let ph = 0;
    for (let j = 0; pd + j < n; j++) {
      const t = j / sr;
      ph += (TAU * 240 * Math.pow(0.12, Math.min(1, t / 0.75))) / sr;
      const v = 0.07 * Math.max(0, 1 - t / 0.9) * Math.exp(-t / 0.32) * Math.sin(ph);
      L[pd + j] += v;
      R[pd + j] += v;
    }
  }

  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = peak > 0 ? PEAK / peak : 1;
  for (let i = 0; i < n; i++) { L[i] *= gain; R[i] *= gain; }
  return { L, R, sr };
}

/** 16-bit stereo PCM WAV of two float channels. */
export function wavBytes({ L, R, sr }) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  const s16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < n; i++) { buf.writeInt16LE(s16(L[i]), 44 + i * 4); buf.writeInt16LE(s16(R[i]), 46 + i * 4); }
  return buf;
}

/** The bed → <film>/music.wav. A music.wav already there is a film's own: kept unless force. */
export function writeScore(filmDir, film, { force = false, log = console.log } = {}) {
  const file = path.join(filmDir, 'music.wav');
  if (fs.existsSync(file) && !force) throw new Error(`score: ${file} exists (a film's own music?); --force replaces it`);
  fs.writeFileSync(file, wavBytes(composeScore(film)));
  log(`music.wav ${film.total.toFixed(2)}s, bed until ${scoreEnd(film).toFixed(2)}s`);
  return file;
}
