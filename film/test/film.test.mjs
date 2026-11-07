/**
 * film.test.mjs — the parts of the film CLI that do not need a browser:
 * argument parsing, film checks, what the page server agrees to serve, the
 * standard timeline, the mix graph, the voice features, the gaze, the score,
 * the tvOff ending, and the locators.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from '../bin/avatar-film.mjs';
import { validateFilm } from '../lib/render.mjs';
import { GAZE_JS, OVERLAYS_JS, routeFor, sceneHtml, SCENE_JS } from '../lib/serve.mjs';
import { buildFilm } from '../lib/timeline.mjs';
import { mixGraph, tvOffGraph } from '../lib/audio.mjs';
import { composeScore, scoreEnd, wavBytes } from '../lib/score.mjs';
import { featuresOf, SR } from '../lib/voice.mjs';
import { PACKAGE_DIR, byVersionDesc, locateModule, locatePlaywright, nodeModuleDirs } from '../lib/env.mjs';
import { ENTRY, bundleIsFresh, engineDir } from '../lib/bundle.mjs';

test('arguments: command, film folder, positional and both flag forms', () => {
  const a = parseArgs(['probe', 'films/x', '2,6', '--fps', '24', '--force', '--lang=es']);
  assert.equal(a.cmd, 'probe');
  assert.equal(a.film, path.resolve('films/x'));
  assert.deepEqual(a.rest, ['2,6']);
  assert.deepEqual(a.flags, { fps: '24', force: true, lang: 'es' });
});

test('a film is refused with what is wrong; a good one passes', () => {
  assert.deepEqual(validateFilm({ total: 10, shots: [{ shape: 'brain', at: 0 }] }), []);
  const bad = validateFilm({ total: 0, shots: [{ shape: 'woman', at: 2 }], width: -1 });
  assert.ok(bad.some((s) => s.includes('total')));
  assert.ok(bad.some((s) => s.includes('first shot must start at 0')));
  assert.ok(bad.some((s) => s.includes('width')));
});

test('the page server serves seven names and nothing else (no way out of the film folder)', () => {
  const film = path.join(os.tmpdir(), 'af-film');
  assert.deepEqual(routeFor('/film.json', film, '/b.js'), { kind: 'file', file: path.join(film, 'film.json'), type: 'application/json' });
  assert.equal(routeFor('/face-bundle.js', film, '/b.js').file, '/b.js');
  assert.equal(routeFor('/scene.js', film, '/b.js').file, SCENE_JS);
  assert.equal(routeFor('/overlays.js', film, '/b.js').file, OVERLAYS_JS);
  assert.equal(routeFor('/gaze.js', film, '/b.js').file, GAZE_JS);
  assert.match(sceneHtml({}), /overlays\.js[\s\S]*gaze\.js[\s\S]*scene\.js/);
  assert.equal(routeFor('/../../etc/passwd', film, '/b.js'), null);
  assert.equal(routeFor('/%2e%2e/secret.txt', film, '/b.js'), null);
  assert.equal(routeFor('/out/video.mp4', film, '/b.js'), null);
});

test('a film folder with its own scene.js keeps it; the engine is always the package one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-own-'));
  fs.writeFileSync(path.join(dir, 'scene.js'), '//');
  fs.writeFileSync(path.join(dir, 'face-bundle.js'), '// frozen');
  assert.equal(routeFor('/scene.js', dir, '/fresh.js').file, path.join(dir, 'scene.js'));
  assert.equal(routeFor('/face-bundle.js', dir, '/fresh.js').file, '/fresh.js');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the page is sized to the film, and a ground colour that is not one is not injected', () => {
  const html = sceneHtml({ width: 1080, height: 1920, colors: { ground: '#112233' } });
  assert.match(html, /width: 1080px; height: 1920px/);
  assert.match(html, /background: #112233/);
  assert.doesNotMatch(sceneHtml({ colors: { ground: 'red;}</style><script>alert(1)</script>' } }), /alert/);
});

test('the standard timeline: brain open, lines one after the other, a move in a long gap, the hold at the end', () => {
  const script = { shape: 'woman', lines: [{ id: 'a', text: 'Hola.', move: 'tender' }, { id: 'b', text: 'Adiós.', pauseAfter: 1.2 }, { id: 'c', text: 'Fin.' }] };
  const film = buildFilm(script, 'es', { a: 1, b: 2, c: 0.5 });
  assert.equal(film.shots[0].shape, 'brain');
  assert.equal(film.shots[1].at, 3.6);
  const first = 3.6 + 2.4 * 0.55;
  assert.equal(film.lines[0].at, Math.round(first * 1000) / 1000);
  assert.equal(film.lines[1].at, Math.round((first + 1 + 0.55) * 1000) / 1000);
  assert.equal(film.total, Math.round((film.lines[2].end + 2) * 1000) / 1000);
  assert.deepEqual(film.moves.map((m) => m.id), ['tender', 'curious']);
  assert.equal(film.gestures, false);
});

test('a line with no measured duration is refused, never given one', () => {
  assert.throws(() => buildFilm({ lines: [{ id: 'a', text: 'x' }] }, 'fr', {}), /no duration for line a/);
  assert.throws(() => buildFilm({ lines: [] }, 'fr', {}), /no lines/);
});

test('the mix lays each cue at its time, the bed first when there is one', () => {
  const film = { total: 10, music: { cutAt: 10 } };
  const g = mixGraph(film, [{ at: 1.5 }, { at: 4, offsetMs: 20, stack: true }], { music: true });
  assert.match(g, /\[1:a\]aresample=48000,adelay=1500:all=1,volume=0.72\[v1\]/);
  assert.match(g, /\[2:a\]aresample=48000,adelay=4020:all=1,volume=0.48\[v2\]/);
  assert.match(g, /\[m\]\[v1\]\[v2\]amix=inputs=3/);
  assert.match(g, /atrim=0:10.000\[aout\]/);
  assert.throws(() => mixGraph(film, [], { music: false }), /nothing to mix/);
});

test('voice features: silence moves no mouth, a voice does', () => {
  const fps = 30, frames = 30;
  const silent = featuresOf(new Float32Array(SR * 2), fps, frames);
  assert.ok(silent.level.every((v) => v === 0));
  const tone = new Float32Array(SR * 2);
  for (let i = 0; i < tone.length; i++) tone[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / SR);
  const voiced = featuresOf(tone, fps, frames);
  assert.ok(voiced.level.slice(1).every((v) => v > 0.2));
  assert.equal(voiced.spectrum.length, frames * 128);
  assert.ok(voiced.spectrum.some((b) => b > 0));
});

test('locators: modules are looked for above the package, above the working folder, then in NODE_PATH; a wrong Playwright override is said, not guessed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-mods-'));
  const nested = path.join(root, 'a', 'b');
  const extra = path.join(root, 'extra');
  fs.mkdirSync(path.join(root, 'node_modules', 'esbuild', 'lib'), { recursive: true });
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(path.join(extra, 'three'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'esbuild', 'lib', 'main.js'), '');
  fs.writeFileSync(path.join(extra, 'three', 'package.json'), '{}');
  const dirs = nodeModuleDirs({ NODE_PATH: extra }, [nested]);
  assert.equal(dirs[0], path.join(root, 'node_modules'));
  assert.equal(dirs.at(-1), extra);
  assert.equal(locateModule('esbuild', path.join('lib', 'main.js'), dirs), path.join(root, 'node_modules', 'esbuild', 'lib', 'main.js'));
  assert.equal(locateModule('three', 'package.json', dirs), path.join(extra, 'three', 'package.json'));
  assert.equal(locateModule('playwright', 'index.mjs', dirs), null);
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(locatePlaywright({ AVATAR_FILM_PLAYWRIGHT: path.join(os.tmpdir(), 'nope', 'index.mjs') }).ok, false);
  assert.deepEqual(['1.9.0', '1.60.0', '1.10.1'].sort(byVersionDesc), ['1.60.0', '1.10.1', '1.9.0']);
});

test('the engine is the package source, reached without the monorepo', () => {
  assert.equal(engineDir(), path.join(PACKAGE_DIR, 'src'));
  assert.ok(fs.existsSync(path.join(engineDir(), 'faceAnimator.ts')));
  const imports = [...fs.readFileSync(ENTRY, 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.ok(imports.length > 0);
  for (const spec of imports) {
    assert.match(spec, /^\.\.\/\.\.\/src\//, `${spec} must stay inside the package`);
    assert.ok(fs.existsSync(path.resolve(path.dirname(ENTRY), `${spec}.ts`)), `${spec}.ts must exist`);
  }
});

test('the engine bundle is stale when the engine source moved', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-stamp-'));
  const stamp = path.join(dir, 's.json');
  const bundle = path.join(dir, 'b.js');
  assert.equal(bundleIsFresh(1, stamp, bundle), false);
  fs.writeFileSync(bundle, '//');
  fs.writeFileSync(stamp, JSON.stringify({ source: 1, entry: -1 }));
  assert.equal(bundleIsFresh(2, stamp, bundle), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

/** runtime/gaze.js is a page script: it is run here against a stand-in window. */
function loadGaze() {
  const win = {};
  new Function('window', fs.readFileSync(GAZE_JS, 'utf8'))(win);
  return win.FilmGaze;
}

test('gaze: no keys leaves the eyes to the animator; a key holds, and the next is reached in MOVE seconds', () => {
  const G = loadGaze();
  assert.equal(G.lookAim(G.keysFor(undefined, 'woman'), 3), null);
  const keys = G.keysFor([{ at: 9, x: -0.46, sway: 0 }, { at: 0, x: 0.16, sway: 0 }, { at: 5, x: 0.9, shape: 'kofi' }], 'woman');
  assert.deepEqual(keys.map((k) => k.at), [0, 9]);
  assert.ok(Math.abs(G.lookAim(keys, 4).x - 0.16) < 1e-9);
  const mid = G.lookAim(keys, 9 + G.MOVE / 2).x;
  assert.ok(mid < 0.16 && mid > -0.46);
  assert.ok(Math.abs(G.lookAim(keys, 9 + G.MOVE).x + 0.46) < 1e-9);
  // With sway the aim drifts around the key, never onto it for long.
  const drift = [20, 20.5, 21].map((t) => G.lookAim(G.keysFor([{ at: 0, x: 0 }], 'woman'), t).x);
  assert.ok(new Set(drift.map((x) => x.toFixed(4))).size === 3);
});

test('gaze: steer pulls the parked eyes toward the aim and turns the head a little, within its limits', () => {
  const G = loadGaze();
  const frame = { look: { x: 0, y: 0 }, head: { yaw: 0 } };
  G.steer(frame, { x: -0.46, y: 0 });
  assert.ok(Math.abs(frame.look.x + 0.46) < 1e-9);
  assert.ok(Math.abs(frame.head.yaw + 0.138) < 1e-9);
  const far = { look: { x: -1, y: 0 }, head: { yaw: -1 } };
  G.steer(far, { x: -1, y: 0 });
  assert.equal(far.look.x, -1);
  assert.equal(far.head.yaw, -0.45);
  G.steer(far, null);
  assert.equal(far.look.x, -1);
});

const energy = ({ L, sr }, from, to) => {
  let e = 0;
  for (let i = Math.round(from * sr); i < Math.round(to * sr); i++) e += L[i] * L[i];
  return e / ((to - from) * sr);
};

test('score: the bed ducks under a line, the heartbeat can be left out, nothing plays after a tvOff but the switch-off', () => {
  const sr = 8000;
  const base = { total: 8, lines: [{ at: 2, end: 4.5 }] };
  const bed = composeScore(base, { sr });
  assert.equal(bed.L.length, 8 * sr);
  assert.ok(energy(bed, 2.6, 4.3) < 0.3 * energy(bed, 5.5, 7.5));
  // The bed is normalised to its peak, so the heartbeat shows as a share: at a thump (66 bpm,
  // the 7th from 0.55 s) the sound stands well above the bed's average, without it it does not.
  const thump = 0.55 + 6 * (60 / 66);
  const share = (b) => energy(b, thump, thump + 0.08) / energy(b, 5.5, 7.5);
  assert.ok(share(bed) > 2);
  assert.ok(share(composeScore({ ...base, score: { heart: 0 } }, { sr })) < 1.2);
  const off = { ...base, ending: { kind: 'tvOff', at: 6 } };
  assert.equal(scoreEnd(off), 6);
  assert.equal(scoreEnd(base), 8);
  const shut = composeScore(off, { sr });
  assert.ok(energy(shut, 6, 6.4) > 0);
  assert.equal(energy(shut, 7.1, 8), 0);
  const wav = wavBytes(composeScore({ total: 1 }, { sr }));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.length, 44 + sr * 4);
});

test('tvOff: the picture folds to a line at `at`, then fades; the line keeps an even height at any size', () => {
  const g = tvOffGraph({ total: 10, width: 1080, height: 1920, fps: 30, ending: { kind: 'tvOff', at: 8 } });
  assert.match(g, /color=c=black:s=1080x1920:r=30:d=10\.000/);
  assert.match(g, /scale=w=1080:h='if\(lt\(t\\,8\.000\)\\,1920\\,/);
  assert.match(g, /max\(10\\,1920\*\(1-\(t-8\.000\)\/0\.42\)\)/);
  assert.match(g, /fade=t=out:st=8\.500:d=0\.45\[vout\]/);
  assert.match(g, /\[1:a\]afade=t=out:st=8\.000:d=0\.7\[aout\]/);
  assert.match(tvOffGraph({ total: 10, height: 1080, ending: { kind: 'tvOff', at: 8 } }), /max\(6\\,1080/);
});

test('a film with a look or an ending that cannot be played is refused', () => {
  const ok = { total: 10, shots: [{ shape: 'woman', at: 0 }] };
  assert.deepEqual(validateFilm({ ...ok, look: [{ at: 0, x: -0.46 }], ending: { kind: 'tvOff', at: 9 } }), []);
  assert.ok(validateFilm({ ...ok, look: [{ at: 0, x: -2 }] }).some((s) => s.includes('look[0].x')));
  assert.ok(validateFilm({ ...ok, look: { at: 0 } }).some((s) => s.includes('look must be a list')));
  assert.ok(validateFilm({ ...ok, ending: { kind: 'tvOff', at: 9.5 } }).some((s) => s.includes('ending.at')));
  assert.ok(validateFilm({ ...ok, ending: { kind: 'fade' } }).some((s) => s.includes('ending.kind')));
});

test('implode: it must fit before the end (1.8 s by default), and the bed stops where it starts', () => {
  const ok = { total: 10, shots: [{ shape: 'woman', at: 0 }] };
  assert.deepEqual(validateFilm({ ...ok, ending: { kind: 'implode', at: 8.2 } }), []);
  assert.ok(validateFilm({ ...ok, ending: { kind: 'implode', at: 8.5 } }).some((s) => s.includes('ending.at + dur')));
  assert.deepEqual(validateFilm({ ...ok, ending: { kind: 'implode', at: 9, dur: 1 } }), []);
  assert.equal(scoreEnd({ ...ok, ending: { kind: 'implode', at: 8 } }), 8);
  // A bed cut before the ending (a cutAt left from a shorter cut) would mute its swoop.
  assert.ok(validateFilm({ ...ok, music: { cutAt: 6 }, ending: { kind: 'implode', at: 8 } }).some((s) => s.includes('music.cutAt')));
  assert.deepEqual(validateFilm({ ...ok, music: { cutAt: 10 }, ending: { kind: 'implode', at: 8 } }), []);
});
