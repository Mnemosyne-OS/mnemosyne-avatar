/**
 * audio.mjs — the sound of a film: trim the voice takes, lay them at their
 * cues (with an optional music bed), mux with the video, and a light share copy.
 *
 *   trim   voice/<lang>/raw/*.wav → voice/<lang>/trim/ (silence cut, 48 kHz mono)
 *   audio  cues (+ music.wav from the film folder or --music) → out/audio.wav
 *   mux    out/video.mp4 + out/audio.wav → out/<name>.mp4 (a tvOff ending re-encodes)
 *   share  out/<name>.mp4 → out/<name>-share.mp4 (≈1.8 Mbps, AAC 96k: Telegram, phones)
 *
 * This module mixes a given bed; `score` (score.mjs) can synthesise one.
 *
 * @module avatar-film/audio
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ffmpegBin, ffprobeBin } from './env.mjs';
import { cueWav } from './voice.mjs';

const run = (args) => execFileSync(ffmpegBin(), ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
export const durationOf = (f) => Number(execFileSync(ffprobeBin(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());

export const TRIM_FILTER = 'silenceremove=start_periods=1:start_silence=0.08:start_threshold=-40dB:detection=peak,areverse,'
  + 'silenceremove=start_periods=1:start_silence=0.08:start_threshold=-40dB:detection=peak,areverse,aresample=48000';

export function trimVoice(filmDir, lang, { log = console.log } = {}) {
  const raw = path.join(filmDir, 'voice', lang, 'raw');
  const trim = path.join(filmDir, 'voice', lang, 'trim');
  if (!fs.existsSync(raw)) throw new Error(`no ${raw}`);
  fs.mkdirSync(trim, { recursive: true });
  const done = [];
  for (const f of fs.readdirSync(raw).filter((n) => n.endsWith('.wav'))) {
    const dst = path.join(trim, f);
    run(['-i', path.join(raw, f), '-af', TRIM_FILTER, '-ac', '1', '-c:a', 'pcm_s16le', dst]);
    log(`trim ${f} → ${durationOf(dst).toFixed(2)}s`);
    done.push(dst);
  }
  return done;
}

/** The ffmpeg filter that lays each cue at its time over an optional bed. Pure: testable. */
export function mixGraph(film, cueFiles, { music = false, voiceVol = 0.72, musicVol = 0.34 } = {}) {
  const filters = [];
  const labels = [];
  let idx = music ? 1 : 0;
  for (const c of cueFiles) {
    const delay = Math.round(c.at * 1000) + (c.offsetMs || 0);
    filters.push(`[${idx}:a]aresample=48000,adelay=${delay}:all=1,volume=${c.stack ? 0.48 : voiceVol}[v${idx}]`);
    labels.push(`[v${idx}]`);
    idx++;
  }
  const total = film.total.toFixed(3);
  if (music) {
    const cut = (film.music?.cutAt ?? film.total) - 0.4;
    filters.push(`[0:a]aresample=48000,volume=${musicVol},afade=t=out:st=${cut.toFixed(3)}:d=0.4[m]`);
    labels.unshift('[m]');
  }
  if (labels.length === 0) throw new Error('nothing to mix: no cue has audio and there is no music');
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,alimiter=limit=0.891:level=disabled,apad,atrim=0:${total}[aout]`);
  return filters.join(';');
}

export function mixAudio(filmDir, film, { music, log = console.log } = {}) {
  const lang = film.lang || 'fr';
  const out = path.join(filmDir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const bed = music ?? (fs.existsSync(path.join(filmDir, 'music.wav')) ? path.join(filmDir, 'music.wav') : null);
  const cues = [];
  const missing = [];
  for (const c of film.cues || []) {
    const f = cueWav(filmDir, lang, c.id);
    if (f) cues.push({ ...c, file: f }); else missing.push(c.id);
  }
  if (missing.length) log(`no audio for ${missing.join(', ')}: left silent`);
  const inputs = [...(bed ? ['-i', bed] : []), ...cues.flatMap((c) => ['-i', c.file])];
  const file = path.join(out, 'audio.wav');
  run([...inputs, '-filter_complex', mixGraph(film, cues, { music: !!bed }), '-map', '[aout]', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', file]);
  log(`audio.wav ${durationOf(file).toFixed(2)}s${bed ? ' (with music)' : ''}`);
  return file;
}

const fx = (x) => Number(x).toFixed(3);

/**
 * The ffmpeg graph of a tvOff ending: at `at` the picture folds into a thin
 * line across the middle in 0.42 s, holds, then fades to black; the sound
 * fades out over 0.7 s. Inputs: [0:v] the video, [1:a] the audio. Pure: testable.
 * First made for a Mnemosyne OS film where the avatar hosts a video.
 */
export function tvOffGraph(film) {
  const W = film.width || 1920, H = film.height || 1080, fps = film.fps || 30;
  const at = film.ending.at;
  // The line is 6 px on a 1080 frame, then 2 px; even heights whatever the size.
  const line = Math.max(2, Math.round(H / 180) & ~1), last = Math.max(2, Math.round(H / 540) & ~1);
  // Commas inside an expression are escaped (\,), as the graph is read from a script file.
  const c = '\\,';
  const h = `if(lt(t${c}${fx(at)})${c}${H}${c}if(lt(t${c}${fx(at + 0.42)})${c}max(${line}${c}${H}*(1-(t-${fx(at)})/0.42))${c}if(lt(t${c}${fx(at + 0.62)})${c}${line}${c}${last})))`;
  return [
    `color=c=black:s=${W}x${H}:r=${fps}:d=${fx(film.total)},format=rgb24[tvbg]`,
    `[0:v]format=rgb24,scale=w=${W}:h='${h}':eval=frame[shrunk]`,
    `[tvbg][shrunk]overlay=x=0:y='(main_h-overlay_h)/2':eval=frame:format=auto,format=yuv420p,fade=t=out:st=${fx(at + 0.5)}:d=0.45[vout]`,
    `[1:a]afade=t=out:st=${fx(at)}:d=0.7[aout]`,
  ].join(';\n');
}

export function mux(filmDir, name, film) {
  const out = path.join(filmDir, 'out');
  const file = path.join(out, `${name}.mp4`);
  const inputs = ['-i', path.join(out, 'video.mp4'), '-i', path.join(out, 'audio.wav')];
  if (film?.ending?.kind === 'tvOff') {
    const graph = path.join(out, 'tvoff-filter.txt');
    fs.writeFileSync(graph, tvOffGraph(film));
    run([...inputs, '-filter_complex_script', graph, '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', file]);
    return file;
  }
  run([...inputs, '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', file]);
  return file;
}

export function share(filmDir, name) {
  const out = path.join(filmDir, 'out');
  const file = path.join(out, `${name}-share.mp4`);
  run(['-i', path.join(out, `${name}.mp4`), '-c:v', 'libx264', '-preset', 'slow', '-b:v', '1800k', '-maxrate', '2200k', '-bufsize', '4000k',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', file]);
  return file;
}
