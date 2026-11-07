/**
 * serve.mjs — the local page a film is drawn in, on 127.0.0.1 only.
 *
 * It serves seven names and nothing else: the page, the scene, its overlays and
 * gaze, the engine, and the film's film.json / voice.json. A film folder with
 * its own scene.js keeps it (older films), but the engine is ALWAYS the
 * package's, built from its source: no film draws with a frozen engine again.
 *
 * @module avatar-film/serve
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { FILM_DIR } from './env.mjs';

export const SCENE_JS = path.join(FILM_DIR, 'runtime', 'scene.js');
export const OVERLAYS_JS = path.join(FILM_DIR, 'runtime', 'overlays.js');
export const GAZE_JS = path.join(FILM_DIR, 'runtime', 'gaze.js');

/** The page, sized to the film, its ground painted before the first frame. */
export function sceneHtml(film) {
  const W = Number(film.width) || 1920;
  const H = Number(film.height) || 1080;
  const ground = /^#[0-9a-f]{3,8}$/i.test(film.colors?.ground ?? '') ? film.colors.ground : '#0e0f13';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>avatar-film</title>
<style>
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
  #stage { position: absolute; inset: 0; width: ${W}px; height: ${H}px; background: ${ground}; }
  #faces { position: absolute; inset: 0; }
  .faceLayer { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; opacity: 0; }
  .faceLayer canvas { display: block; width: ${W}px; height: ${H}px; }
</style></head>
<body><div id="stage"><div id="faces"></div></div>
<script src="face-bundle.js"></script>
<script src="overlays.js"></script>
<script src="gaze.js"></script>
<script src="scene.js"></script>
</body></html>`;
}

/** What each served name maps to, for one film folder. Null = 404. */
export function routeFor(urlPath, filmDir, bundleFile) {
  const name = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  if (name === 'scene.html' || name === '') return { kind: 'html' };
  if (name === 'face-bundle.js') return { kind: 'file', file: bundleFile, type: 'text/javascript' };
  if (name === 'overlays.js') return { kind: 'file', file: OVERLAYS_JS, type: 'text/javascript' };
  if (name === 'gaze.js') return { kind: 'file', file: GAZE_JS, type: 'text/javascript' };
  if (name === 'scene.js') {
    const own = path.join(filmDir, 'scene.js');
    return { kind: 'file', file: fs.existsSync(own) ? own : SCENE_JS, type: 'text/javascript' };
  }
  if (name === 'film.json' || name === 'voice.json') return { kind: 'file', file: path.join(filmDir, name), type: 'application/json' };
  return null;
}

/** Starts the page server; resolves with its port and a close(). */
export async function serveFilm(filmDir, film, bundleFile) {
  const server = http.createServer((req, res) => {
    const route = routeFor(new URL(req.url ?? '/', 'http://x').pathname, filmDir, bundleFile);
    if (!route) { res.writeHead(404); res.end(); return; }
    if (route.kind === 'html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(sceneHtml(film));
      return;
    }
    if (!fs.existsSync(route.file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': route.type });
    fs.createReadStream(route.file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { port, close: () => new Promise((r) => server.close(r)) };
}
