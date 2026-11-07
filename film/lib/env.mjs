/**
 * env.mjs — where the tools a film needs live, found instead of hard-coded.
 *
 * The film CLI ships inside the avatar package, so it runs in two places: the
 * Mnemosyne OS monorepo (`packages/avatar/film`) and the package on its own
 * (the Mnemosyne Avatar repository, after `npm install`). Nothing here may
 * assume the monorepo.
 *
 *  - Modules (esbuild, three, Playwright) are looked for in every
 *    `node_modules` above the package, then above the working folder, then in
 *    `NODE_PATH`. That is Node's own order, plus the folder the person runs from.
 *  - Playwright: `AVATAR_FILM_PLAYWRIGHT` (path to its index.mjs) first; in the
 *    monorepo, the pnpm store (`node_modules/.pnpm/playwright@<v>`) last,
 *    newest first. Playwright then picks its own installed browser;
 *    `AVATAR_FILM_CHROME` overrides it.
 *  - ffmpeg / ffprobe: `FFMPEG` / `FFPROBE`, else on the PATH.
 *
 * @module avatar-film/env
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** This CLI's own folder (`film/`): its runtime, its engine entry, its cache. */
export const FILM_DIR = path.join(HERE, '..');
/** The avatar package: its `src` is the engine every film is drawn with. */
export const PACKAGE_DIR = path.join(FILM_DIR, '..');

/** The monorepo root above `from` (the first folder holding `pnpm-workspace.yaml`), or null on its own. */
export function findRepoRoot(from = PACKAGE_DIR) {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Every existing `node_modules` folder to look in, nearest first, without duplicates. */
export function nodeModuleDirs(env = process.env, starts = [PACKAGE_DIR, process.cwd()]) {
  const out = [];
  const add = (d) => {
    const r = path.resolve(d);
    if (!out.includes(r) && fs.existsSync(r)) out.push(r);
  };
  for (const start of starts) {
    let dir = path.resolve(start);
    for (;;) {
      add(path.join(dir, 'node_modules'));
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  for (const d of String(env.NODE_PATH ?? '').split(path.delimiter).filter(Boolean)) add(d);
  return out;
}

/** The first `<dir>/<name>/<file>` that exists, or null. */
export function locateModule(name, file, dirs = nodeModuleDirs()) {
  for (const d of dirs) {
    const p = path.join(d, name, file);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Compares "1.60.0" style versions, newest first. */
export function byVersionDesc(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** The Playwright entry (index.mjs) to import, or null with the reason. */
export function locatePlaywright(env = process.env, dirs = nodeModuleDirs(env), root = findRepoRoot()) {
  if (env.AVATAR_FILM_PLAYWRIGHT) {
    return fs.existsSync(env.AVATAR_FILM_PLAYWRIGHT)
      ? { ok: true, entry: env.AVATAR_FILM_PLAYWRIGHT }
      : { ok: false, why: `AVATAR_FILM_PLAYWRIGHT points nowhere: ${env.AVATAR_FILM_PLAYWRIGHT}` };
  }
  const direct = locateModule('playwright', 'index.mjs', dirs);
  if (direct) return { ok: true, entry: direct };
  const store = root ? path.join(root, 'node_modules', '.pnpm') : null;
  const versions = store && fs.existsSync(store)
    ? fs.readdirSync(store).filter((n) => /^playwright@\d/.test(n)).map((n) => n.slice('playwright@'.length)).sort(byVersionDesc)
    : [];
  for (const v of versions) {
    const entry = path.join(store, `playwright@${v}`, 'node_modules', 'playwright', 'index.mjs');
    if (fs.existsSync(entry)) return { ok: true, entry };
  }
  return { ok: false, why: 'Playwright not found: `npm install playwright` then `npx playwright install chromium`, or set AVATAR_FILM_PLAYWRIGHT' };
}

/** Playwright's chromium, imported from wherever it was found. Throws with the reason. */
export async function loadChromium(env = process.env) {
  const found = locatePlaywright(env);
  if (!found.ok) throw new Error(found.why);
  const mod = await import(pathToFileURL(found.entry).href);
  return mod.chromium ?? mod.default?.chromium;
}

/** The esbuild entry, or null. */
export const locateEsbuild = (dirs = nodeModuleDirs()) => locateModule('esbuild', path.join('lib', 'main.js'), dirs);

/** The esbuild module. Throws with the reason. */
export async function loadEsbuild(dirs = nodeModuleDirs()) {
  const entry = locateEsbuild(dirs);
  if (!entry) throw new Error('esbuild not found: run `npm install` in the avatar package, or set NODE_PATH');
  const mod = await import(pathToFileURL(entry).href);
  return mod.default ?? mod;
}

export const ffmpegBin = (env = process.env) => env.FFMPEG || 'ffmpeg';
export const ffprobeBin = (env = process.env) => env.FFPROBE || 'ffprobe';
