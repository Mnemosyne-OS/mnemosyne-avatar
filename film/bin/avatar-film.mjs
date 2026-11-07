#!/usr/bin/env node
/**
 * avatar-film — one CLI for every film of the particle avatar.
 *
 *   avatar-film doctor                      what is found, what is missing
 *   avatar-film bundle [--force]            build the engine from the package source
 *   avatar-film trim <film> --lang fr       raw voice takes → trimmed
 *   avatar-film timeline <film> --lang fr   script.<lang>.json + wavs → film.json
 *   avatar-film voice <film>                film.json cues → voice.json (the mouth)
 *   avatar-film probe <film> 2,6,12         stills → out/probe-<t>.png
 *   avatar-film render <film> [--from s --to s --fps n]
 *   avatar-film score <film> [--force]      synthesise a light bed → music.wav
 *   avatar-film audio <film> [--music f.wav]
 *   avatar-film mux <film> --name <name>    video + audio → out/<name>.mp4 (+ tvOff ending)
 *   avatar-film share <film> --name <name>  light copy → out/<name>-share.mp4
 *   avatar-film outbox <film> --name <name> copy the share file to ~/.mnemosyne/outbox
 *                                           (where mnemosyne_review_open reads it)
 *
 * It ships inside the avatar package (`film/`), so it runs in the Mnemosyne OS
 * monorepo and in the Mnemosyne Avatar repository alike. The monorepo's
 * `tools/avatar-film` adds `status` (the app's Films window), which needs the app.
 *
 * @module avatar-film/cli
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBundle } from '../lib/bundle.mjs';
import { PACKAGE_DIR, ffmpegBin, locateEsbuild, locateModule, locatePlaywright } from '../lib/env.mjs';
import { probe, readFilm, render } from '../lib/render.mjs';
import { mixAudio, mux, share, trimVoice } from '../lib/audio.mjs';
import { writeScore } from '../lib/score.mjs';
import { writeTimeline } from '../lib/timeline.mjs';
import { writeVoiceFeatures } from '../lib/voice.mjs';

/** argv → { cmd, film, rest, flags }. Pure: testable. */
export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const flags = {};
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) flags[k] = rest[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  return { cmd, film: positional[0] ? path.resolve(positional[0]) : null, rest: positional.slice(1), flags };
}

const num = (v) => (v === undefined ? undefined : Number(v));

/** Runs one command. Exported: the monorepo's `tools/avatar-film` adds its own commands around it. */
export async function main(argv) {
  const { cmd, film, rest, flags } = parseArgs(argv);
  const needFilm = () => {
    if (!film || !fs.existsSync(film)) throw new Error(`${cmd}: give the film folder (${film ?? 'none'} not found)`);
    return film;
  };
  switch (cmd) {
    case 'doctor': {
      const pw = locatePlaywright();
      const esbuild = locateEsbuild();
      const three = locateModule('three', 'package.json');
      console.log(`package     ${PACKAGE_DIR}`);
      console.log(`playwright  ${pw.ok ? pw.entry : `NOT FOUND (${pw.why})`}`);
      console.log(`esbuild     ${esbuild ?? 'NOT FOUND (npm install in the avatar package, or NODE_PATH)'}`);
      console.log(`three       ${three ? path.dirname(three) : 'NOT FOUND here (the monorepo falls back to the app tree)'}`);
      console.log(`ffmpeg      ${ffmpegBin()} (FFMPEG overrides; render and mux encode with libx264)`);
      return;
    }
    case 'bundle': { const r = await ensureBundle({ force: flags.force === true }); console.log(r.rebuilt ? `built ${r.file}` : `up to date ${r.file}`); return; }
    case 'trim': trimVoice(needFilm(), String(flags.lang ?? 'fr')); return;
    case 'timeline': writeTimeline(needFilm(), String(flags.lang ?? 'fr')); return;
    case 'voice': writeVoiceFeatures(needFilm(), readFilm(needFilm())); return;
    case 'probe': {
      const times = String(rest[0] ?? flags.at ?? '').split(',').filter(Boolean).map(Number);
      if (!times.length || times.some((t) => !(t >= 0))) throw new Error('probe: give seconds, e.g. 2,6,12');
      await probe(needFilm(), times, { fps: num(flags.fps) });
      return;
    }
    case 'render': await render(needFilm(), { from: num(flags.from) ?? 0, to: num(flags.to), fps: num(flags.fps) }); return;
    case 'score': writeScore(needFilm(), readFilm(needFilm()), { force: flags.force === true }); return;
    case 'audio': mixAudio(needFilm(), readFilm(needFilm()), { music: flags.music ? path.resolve(String(flags.music)) : undefined }); return;
    case 'mux': console.log(mux(needFilm(), String(flags.name ?? 'film'), readFilm(needFilm()))); return;
    case 'share': console.log(share(needFilm(), String(flags.name ?? 'film'))); return;
    case 'outbox': {
      const src = path.join(needFilm(), 'out', `${flags.name ?? 'film'}-share.mp4`);
      if (!fs.existsSync(src)) throw new Error(`outbox: no ${src} (run share first)`);
      const dir = path.join(os.homedir(), '.mnemosyne', 'outbox');
      fs.mkdirSync(dir, { recursive: true });
      const dst = path.join(dir, path.basename(src));
      fs.copyFileSync(src, dst);
      console.log(dst);
      return;
    }
    default:
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith(' *   avatar-film')).map((l) => l.slice(3)).join('\n'));
      process.exitCode = cmd ? 1 : 0;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`[avatar-film] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  });
}
