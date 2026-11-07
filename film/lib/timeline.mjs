/**
 * timeline.mjs — the standard film from a script: a brain cold open that
 * gathers into ONE face, then the face says the lines, one after the other.
 * (The recipe of a 9:16 voice-over film.)
 *
 * Input: script.<lang>.json in the film folder:
 *   { "shape": "woman", "width": 1080, "height": 1920, "lines": [
 *       { "id": "p01", "text": "Hello there.", "move": "tender" }, … ],
 *     "options": { "brainOpen": 3.6, "form": 2.4, "breath": 0.55, "holdEnd": 2.0 } }
 * plus each line's trimmed wav (voice/<lang>/trim/<id>.wav).
 * Output: film.json. Films that need more (several faces, cards, picture in
 * picture) write their own film.json; the renderer reads any.
 *
 * @module avatar-film/timeline
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ffprobeBin } from './env.mjs';
import { cueWav } from './voice.mjs';

export const DEFAULTS = { brainOpen: 3.6, form: 2.4, breath: 0.55, holdEnd: 2.0, gapMove: 0.85 };
const FILL_MOVES = ['curious', 'glance', 'lookAround', 'browRaiseOne', 'ponder'];
const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * The film from a script and each line's duration (seconds). Pure: testable.
 * A line without a duration is refused, never given a made-up one.
 */
export function buildFilm(script, lang, durations) {
  const o = { ...DEFAULTS, ...(script.options || {}) };
  const shape = script.shape || 'woman';
  if (!Array.isArray(script.lines) || script.lines.length === 0) throw new Error('script has no lines');
  const faceAt = r3(o.brainOpen);
  let t = r3(faceAt + o.form * 0.55);
  const cues = [], lines = [], moves = [];
  for (const line of script.lines) {
    const sec = durations[line.id];
    if (!(sec > 0)) throw new Error(`no duration for line ${line.id} (missing wav?)`);
    const at = r3(t);
    const end = r3(at + sec);
    cues.push({ id: line.id, at, ms: Math.round(sec * 1000), offsetMs: 0 });
    lines.push({ id: line.id, at, end, text: line.text, shape, sub: true });
    if (line.move) moves.push({ at: r3(at - 0.04), id: line.move, shape });
    t = r3(end + (line.pauseAfter ?? o.breath));
  }
  let fill = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i + 1].at - lines[i].end > o.gapMove) moves.push({ at: r3(lines[i].end + 0.2), id: FILL_MOVES[fill++ % FILL_MOVES.length], shape });
  }
  moves.sort((a, b) => a.at - b.at);
  const last = lines[lines.length - 1];
  const total = r3(last.end + o.holdEnd);
  return {
    fps: script.fps ?? 30,
    total,
    seed: script.seed ?? 42,
    width: script.width ?? 1080,
    height: script.height ?? 1920,
    lang,
    arcs: false,
    trueColor: false,
    version: 2,
    gestures: false,
    colors: script.colors ?? {
      ground: '#0e0f13', base: '#8592b0', glow: '#cfe8ea',
      engines: ['#56b6a9', '#e5b567', '#e88a95', '#7bc96f', '#b58ff7'],
    },
    shots: [
      { id: 'brain', shape: 'brain', at: 0, until: r3(faceAt + o.form), fadeIn: 0.1, fadeOut: o.form },
      { id: shape, shape, at: faceAt, until: total, fadeIn: o.form, fadeOut: 0.25 },
    ],
    lines,
    cues,
    moves,
    music: { outroAt: r3(last.at - 0.3), cutAt: total, beatAt: [faceAt, last.at] },
  };
}

const durationOf = (f) => Number(execFileSync(ffprobeBin(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());

/** Reads script.<lang>.json and the wavs, writes film.json. Returns the film. */
export function writeTimeline(filmDir, lang, { log = console.log } = {}) {
  const sp = path.join(filmDir, `script.${lang}.json`);
  if (!fs.existsSync(sp)) throw new Error(`no ${path.basename(sp)} in ${filmDir}`);
  const script = JSON.parse(fs.readFileSync(sp, 'utf8'));
  const durations = {};
  for (const line of script.lines || []) {
    const f = cueWav(filmDir, lang, line.id) ?? (fs.existsSync(path.join(filmDir, 'voice', lang, 'raw', `${line.id}.wav`)) ? path.join(filmDir, 'voice', lang, 'raw', `${line.id}.wav`) : null);
    if (f) durations[line.id] = durationOf(f);
  }
  const film = buildFilm(script, lang, durations);
  fs.writeFileSync(path.join(filmDir, 'film.json'), JSON.stringify(film, null, 2));
  log(`film.json: ${film.total}s, ${film.lines.length} lines, ${film.moves.length} moves (${lang})`);
  return film;
}
