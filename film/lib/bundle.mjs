/**
 * bundle.mjs — the avatar engine as one browser script (`Face`), built from the
 * avatar package's source (its `src`) and rebuilt only when that source changed.
 *
 * The cache lives next to the CLI (`film/.cache/face-bundle.js`, git-ignored) with a
 * stamp: the newest mtime of the engine folder. A film never ships its own
 * frozen copy; every render uses the engine as it is in the repo.
 *
 * @module avatar-film/bundle
 */
import fs from 'node:fs';
import path from 'node:path';
import { FILM_DIR, PACKAGE_DIR, findRepoRoot, loadEsbuild, nodeModuleDirs } from './env.mjs';

export const ENTRY = path.join(FILM_DIR, 'engine', 'entry.ts');
export const CACHE = path.join(FILM_DIR, '.cache');
export const BUNDLE = path.join(CACHE, 'face-bundle.js');
const STAMP = path.join(CACHE, 'face-bundle.stamp.json');

/** The engine's own folder: the avatar package's source. */
export function engineDir() {
  return path.join(PACKAGE_DIR, 'src');
}

/** The newest modification time (ms) of any file in `dir`, recursively. */
export function newestMtime(dir) {
  let newest = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) newest = Math.max(newest, newestMtime(p));
    else if (e.isFile()) newest = Math.max(newest, fs.statSync(p).mtimeMs);
  }
  return newest;
}

/** Whether the cached bundle matches the engine source of now. */
export function bundleIsFresh(sourceStamp, stampFile = STAMP, bundleFile = BUNDLE) {
  if (!fs.existsSync(bundleFile) || !fs.existsSync(stampFile)) return false;
  try {
    const s = JSON.parse(fs.readFileSync(stampFile, 'utf8'));
    return s.source === sourceStamp && s.entry === fs.statSync(ENTRY).mtimeMs;
  } catch (err) {
    console.warn(`[avatar-film] stamp unreadable, rebuilding: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/** Builds the bundle when stale; returns its path and whether it was rebuilt. */
export async function ensureBundle({ force = false, log = console.log } = {}) {
  const source = newestMtime(engineDir());
  if (!force && bundleIsFresh(source)) return { file: BUNDLE, rebuilt: false };
  const dirs = nodeModuleDirs();
  const esbuild = await loadEsbuild(dirs);
  // In the monorepo, three is also in the app's tree: the fallback while
  // packages/avatar has no node_modules of its own (a worktree).
  const root = findRepoRoot();
  const appModules = root ? path.join(root, 'apps', 'infinity-edition', 'node_modules') : null;
  fs.mkdirSync(CACHE, { recursive: true });
  const t0 = Date.now();
  await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    globalName: 'Face',
    outfile: BUNDLE,
    platform: 'browser',
    target: 'es2022',
    logLevel: 'warning',
    absWorkingDir: PACKAGE_DIR,
    nodePaths: appModules && fs.existsSync(appModules) ? [...dirs, appModules] : dirs,
  });
  fs.writeFileSync(STAMP, JSON.stringify({ source, entry: fs.statSync(ENTRY).mtimeMs, builtAt: Date.now() }));
  log(`[avatar-film] engine bundled from packages/avatar in ${Date.now() - t0} ms (${(fs.statSync(BUNDLE).size / 1e6).toFixed(1)} MB)`);
  return { file: BUNDLE, rebuilt: true };
}
