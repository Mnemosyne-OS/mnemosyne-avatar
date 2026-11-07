/**
 * voice.mjs — what the board's analyser would read while the avatar speaks,
 * computed ahead of time for every frame (the mouth follows it).
 *
 * Per frame: a loudness (RMS of a 256-sample window, x4.5, capped at 1, as
 * chat/ttsAudio.ts does) and the 128 byte bins of a 256-point FFT (Blackman
 * window, -100..-30 dB mapped to 0..255, smoothed 0.5 frame to frame, as the
 * Web Audio analyser does). Ported unchanged from the films of 2026-10-30.
 *
 * The voice files: voice/<lang>/trim/<id>.wav, else voice/trim/<id>.wav.
 *
 * @module avatar-film/voice
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ffmpegBin } from './env.mjs';

export const SR = 48000;
export const N = 256;

/** The trimmed wav of a cue, or null. */
export function cueWav(filmDir, lang, id) {
  for (const f of [path.join(filmDir, 'voice', lang, 'trim', `${id}.wav`), path.join(filmDir, 'voice', 'trim', `${id}.wav`)]) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/** A textbook in-place radix-2 FFT (n = 256 here). */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar; im[i + k] += ai;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

/** Per-frame level and spectrum of a mono 48 kHz track. Pure: testable. */
export function featuresOf(track, fps, frames) {
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / N) + 0.08 * Math.cos(4 * Math.PI * i / N);
  const level = new Array(frames).fill(0);
  const spectrum = new Uint8Array(frames * 128);
  const smooth = new Float32Array(128);
  const re = new Float32Array(N), im = new Float32Array(N);
  const MIN_DB = -100, MAX_DB = -30, K = 0.5;
  for (let f = 0; f < frames; f++) {
    const centre = Math.round((f / fps) * SR);
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const x = track[centre - N / 2 + i] ?? 0;
      sum += x * x;
      re[i] = x * win[i]; im[i] = 0;
    }
    level[f] = Math.round(Math.min(1, Math.sqrt(sum / N) * 4.5) * 1000) / 1000;
    fft(re, im);
    for (let b = 0; b < 128; b++) {
      const mag = Math.hypot(re[b], im[b]) / N;
      smooth[b] = K * smooth[b] + (1 - K) * mag;
      const db = smooth[b] > 0 ? 20 * Math.log10(smooth[b]) : -1000;
      spectrum[f * 128 + b] = Math.max(0, Math.min(255, Math.round(255 * (db - MIN_DB) / (MAX_DB - MIN_DB))));
    }
  }
  return { level, spectrum };
}

/** Builds voice.json for a film from its cues. Returns a short report. */
export function writeVoiceFeatures(filmDir, film, { log = console.log } = {}) {
  const fps = film.fps ?? 30;
  const frames = Math.ceil(film.total * fps);
  const track = new Float32Array(Math.ceil(film.total * SR) + SR);
  const lang = film.lang || 'fr';
  const missing = [];
  for (const c of film.cues || []) {
    const f = cueWav(filmDir, lang, c.id);
    if (!f) { missing.push(c.id); continue; }
    const raw = execFileSync(ffmpegBin(), ['-v', 'error', '-i', f, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    const start = Math.round(c.at * SR);
    for (let i = 0; i < pcm.length && start + i < track.length; i++) track[start + i] += pcm[i] * 0.9;
  }
  const { level, spectrum } = featuresOf(track, fps, frames);
  fs.writeFileSync(path.join(filmDir, 'voice.json'), JSON.stringify({ fps, frames, level, spectrum: Buffer.from(spectrum).toString('base64') }));
  const speaking = level.filter((v) => v > 0.04).length;
  log(`voice.json: ${frames} frames, speaking on ${speaking} (${((speaking / frames) * 100).toFixed(0)} %)${missing.length ? `, NO AUDIO for ${missing.join(', ')}` : ''}`);
  return { frames, speaking, missing };
}
