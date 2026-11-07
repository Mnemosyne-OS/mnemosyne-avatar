/**
 * render.mjs — a film folder to pictures: probe stills, or every frame piped
 * to ffmpeg as out/video.mp4.
 *
 *  - Headless Chromium through Playwright, its own browser unless
 *    AVATAR_FILM_CHROME names one; WebGL by SwiftShader, so the GPU of the
 *    machine plays no part and two renders of a film give the same pictures.
 *  - The scene is stepped frame by frame (`__filmSeek`), never by the clock.
 *
 * @module avatar-film/render
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBundle } from './bundle.mjs';
import { ffmpegBin, loadChromium } from './env.mjs';
import { serveFilm } from './serve.mjs';

/** Reads and checks a film.json; throws with what is wrong. */
/** Seconds an implode ending takes, points gathering to the ball going out (runtime/scene.js reads the same default). */
export const implodeDur = (ending) => Number(ending?.dur) > 0 ? Number(ending.dur) : 1.8;

export function readFilm(filmDir) {
  const p = path.join(filmDir, 'film.json');
  if (!fs.existsSync(p)) throw new Error(`no film.json in ${filmDir}`);
  const film = JSON.parse(fs.readFileSync(p, 'utf8'));
  const problems = validateFilm(film);
  if (problems.length) throw new Error(`film.json: ${problems.join('; ')}`);
  return film;
}

/** What is wrong with a film, as sentences; empty when it can be drawn. */
export function validateFilm(film) {
  const out = [];
  if (!film || typeof film !== 'object') return ['not an object'];
  if (!(Number(film.total) > 0)) out.push('total must be a positive number of seconds');
  if (!Array.isArray(film.shots) || film.shots.length === 0) out.push('shots must list at least one shot');
  else {
    film.shots.forEach((s, i) => {
      if (typeof s.shape !== 'string') out.push(`shots[${i}].shape missing`);
      if (!(Number(s.at) >= 0)) out.push(`shots[${i}].at must be ≥ 0`);
    });
    if (film.shots[0] && Number(film.shots[0].at) !== 0) out.push('the first shot must start at 0');
  }
  for (const k of ['width', 'height', 'fps']) if (film[k] !== undefined && !(Number(film[k]) > 0)) out.push(`${k} must be positive`);
  if (film.look !== undefined) {
    if (!Array.isArray(film.look)) out.push('look must be a list of { at, x, y? }');
    else film.look.forEach((k, i) => {
      if (!(Number(k.at) >= 0)) out.push(`look[${i}].at must be ≥ 0`);
      for (const a of ['x', 'y']) if (k[a] !== undefined && !(Math.abs(Number(k[a])) <= 1)) out.push(`look[${i}].${a} must be between -1 and 1`);
    });
  }
  if (film.ending !== undefined) {
    const kind = film.ending?.kind;
    if (kind !== 'tvOff' && kind !== 'implode') out.push('ending.kind must be tvOff or implode');
    // The fold and the fade take 0.95 s: they must fit before the end.
    else if (kind === 'tvOff' && !(Number(film.ending.at) >= 0 && film.ending.at + 0.95 <= film.total)) out.push('ending.at must leave 0.95 s before total');
    // The points reach the ball and it goes out in `dur` seconds: that too must fit.
    else if (kind === 'implode' && !(Number(film.ending.at) >= 0 && film.ending.at + implodeDur(film.ending) <= film.total)) out.push('ending.at + dur must fit before total');
    // The ending's own sound lives in the bed: a bed cut before it (a cutAt left from a shorter cut) is silence.
    if (Number.isFinite(film.music?.cutAt) && Number(film.ending?.at) >= 0 && film.music.cutAt < film.ending.at) out.push('music.cutAt is before ending.at: the ending would be silent');
  }
  return out;
}

async function openScene(filmDir, film, fps, log) {
  const { file: bundle } = await ensureBundle({ log });
  const server = await serveFilm(filmDir, film, bundle);
  const chromium = await loadChromium();
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.AVATAR_FILM_CHROME ? { executablePath: process.env.AVATAR_FILM_CHROME } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: film.width || 1920, height: film.height || 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') log(`[console] ${m.text().slice(0, 400)}`); });
  await page.goto(`http://127.0.0.1:${server.port}/scene.html?fps=${fps}`);
  await page.waitForFunction(() => window.sceneReady === true || window.sceneError, null, { timeout: 180_000 });
  const err = await page.evaluate(() => window.sceneError);
  const close = async () => { await browser.close(); await server.close(); };
  if (err) { await close(); throw new Error(err); }
  log(`scene ${JSON.stringify(await page.evaluate(() => window.filmInfo))}`);
  return { page, close };
}

/** Stills at the given seconds → out/probe-<t>.png. Returns the files. */
export async function probe(filmDir, times, { fps, log = console.log } = {}) {
  const film = readFilm(filmDir);
  const FPS = fps ?? film.fps ?? 30;
  const out = path.join(filmDir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const { page, close } = await openScene(filmDir, film, FPS, log);
  const files = [];
  try {
    let i = 0;
    for (const target of [...times].sort((a, b) => a - b)) {
      const n = Math.round(target * FPS);
      for (; i <= n; i++) await page.evaluate((t) => window.__filmSeek(t), i / FPS);
      const file = path.join(out, `probe-${target}.png`);
      await page.screenshot({ path: file, timeout: 0 });
      files.push(file);
      log(`probe ${target}s`);
    }
  } finally {
    await close();
  }
  return files;
}

/** Every frame of [from, to) → out/video.mp4 (or video-<from>-<to>.mp4). Returns the file. */
export async function render(filmDir, { from = 0, to, fps, log = console.log } = {}) {
  const film = readFilm(filmDir);
  const FPS = fps ?? film.fps ?? 30;
  const end = to ?? film.total;
  const out = path.join(filmDir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, from === 0 && end === film.total ? 'video.mp4' : `video-${from}-${end}.mp4`);
  const { page, close } = await openScene(filmDir, film, FPS, log);
  const t0 = Date.now();
  try {
    const ff = spawn(ffmpegBin(), ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => {
      ff.on('error', rej);
      ff.on('exit', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`))));
    });
    const first = Math.round(from * FPS), last = Math.round(end * FPS);
    for (let i = 0; i < first; i++) await page.evaluate((t) => window.__filmSeek(t), i / FPS);
    for (let i = first; i < last; i++) {
      await page.evaluate((t) => window.__filmSeek(t), i / FPS);
      const png = await page.screenshot({ type: 'png', timeout: 0 });
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
      if ((i - first) % 150 === 0) log(`frame ${i - first}/${last - first} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
    ff.stdin.end();
    await done;
  } finally {
    await close();
  }
  log(`wrote ${file} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return file;
}
