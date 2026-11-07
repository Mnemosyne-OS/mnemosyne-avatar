# Mnemosyne Avatar film

Turn a `film.json` into an MP4 of the particle avatar, on your own machine.

One engine, built from this package's `src` as it is today. One scene. One command line. A film folder holds only what is its own: `film.json`, its voice takes, and its music.

## Install

From the package folder (the Mnemosyne Avatar repository, or `packages/avatar` in the Mnemosyne OS monorepo):

```bash
npm install
npm install playwright
npx playwright install chromium
npm run film -- doctor
```

You also need `ffmpeg` and `ffprobe` on the PATH, with the libx264 encoder (`render` and `mux` use it). `doctor` says what it found.

## Commands

```bash
node film/bin/avatar-film.mjs <command> <film folder> [options]
```

| Command | What it does |
|---|---|
| `doctor` | Says what it found: the package, Playwright, esbuild, three, ffmpeg |
| `bundle [--force]` | Builds the engine into `film/.cache/face-bundle.js`; rebuilt only when `src` changed |
| `trim <film> --lang fr` | `voice/<lang>/raw/*.wav` → `voice/<lang>/trim/` (silence cut, 48 kHz mono) |
| `timeline <film> --lang fr` | `script.<lang>.json` + the takes → `film.json` (brain cold open, one face, the lines) |
| `voice <film>` | The cues of `film.json` → `voice.json`, what moves the mouth frame by frame |
| `probe <film> 2,6,12` | Stills → `out/probe-<t>.png`. Look at them before a full render |
| `render <film> [--from s --to s --fps n]` | Every frame → `out/video.mp4` (or a segment) |
| `score <film> [--force]` | A light bed synthesised for the film (hop pulse + soft heartbeat, ducked under the lines) → `music.wav`. A `music.wav` already there is kept unless `--force` |
| `audio <film> [--music f.wav]` | The takes at their cues, over the film's `music.wav` if there is one → `out/audio.wav` |
| `mux <film> --name x` | Video + audio → `out/x.mp4`; with a `tvOff` ending, re-encoded with the set switching off |
| `share <film> --name x` | A light copy for phones → `out/x-share.mp4` |
| `outbox <film> --name x` | Copies the share file to `~/.mnemosyne/outbox`, where Mnemosyne OS can open it for review |

## The order of a voice-over film

```text
1. script.<lang>.json        lines { id, text, move? }, shape, size
2. one take per line         voice/<lang>/raw/<id>.wav
3. trim → timeline → voice   the takes cut, placed, and read for the mouth
4. probe                     stills first: the face, the hand-off, a line
5. render → audio → mux → share
```

The takes can come from any voice engine. With Mnemosyne OS installed, its MCP server makes them with `mnemosyne_voice_speak` (it needs `MNEMO_VOICE=1` in the server's config, and you allow the voice once in the app). The files land in `~/.mnemosyne/voiceovers`: copy each one to `voice/<lang>/raw/<id>.wav`. A coding agent can run the whole order above for you.

A film that needs more than the standard timeline (several faces, cards, picture in picture) writes its own `film.json`; `render` reads any. A film folder with its own `scene.js` keeps it, but the engine is always this package's.

## film.json

| Key | Meaning |
|---|---|
| `total`, `fps`, `width`, `height` | Length in seconds, frame rate, size (9:16 = 1080×1920) |
| `shots[]` | `{ shape, at, until, fadeIn, fadeOut, formed? }`. The first starts at 0. `shape` is `brain`, a face (`woman`, `claire`, `kofi`, `kitten`…) or a robot (`robot-rouage`, `robot-boulon`, `robot-pixel`, `robot-vapeur`). `formed: true` cuts in a face already formed, eyes open, instead of gathering it again: the face-to-face cut |
| `lines[]` | `{ id, at, end, text, shape }`: who speaks when (the mouth follows `voice.json`) |
| `cues[]` | `{ id, at, offsetMs? }`: where each take is laid in the mix |
| `moves[]` | `{ at, id, shape? }`: scripted expressions (`tender`, `nod`, `curious`…) |
| `gestures` | `false` by default: no idle yawn or laugh between moves |
| `wake` | `false`: a face forms with its eyes already open (no waking). By default she wakes once formed, which takes ~2.1 s before her eyes are open |
| `allowMoves`, `blockMoves` | Override which moves a film may express |
| `look[]` | `{ at, x, y?, sway?, shape? }`: where the face looks from `at` on (-1..1), reached in 0.4 s, with a small drift (`sway`, 1 by default). Without it the animator holds the eyes at the centre while she speaks. Check the direction on the played file, not on a still |
| `score` | `{ bpm?, heart?, notes? }` for the `score` command: tempo (102), heartbeat per minute (66, 0 = none), the pluck's notes in Hz |
| `ending` | `{ kind: "tvOff", at }`: at `at` the picture folds into a line, holds, fades to black, the sound fades out; needs 0.95 s before `total`. The `score` bed stops there and plays a falling tone. `{ kind: "implode", at, dur? }`: from `at` every point is pulled into one small ball of light that burns brighter and goes out in `dur` seconds (1.8 by default), drawn by the particle scene itself; the bed stops at `at` and plays a rising tone |
| `colors`, `seed`, `trueColor`, `arcs` | Passed to the particle scene |
| `subtitles` | `true`: the spoken line at the bottom |
| `subtitlesBottom` | Where the subtitles sit, as a fraction of the height from the bottom (0.035 by default). A vertical film for YouTube Shorts or TikTok wants about 0.24, above the app's own buttons |
| `overlays[]` | Motion design above the avatar, driven by the film time only: `title {text, sub}`, `badge {text}`, `engine {text, sub}` (a ring that turns, then a ✓), `bubble {text}` (types itself), `mic {text}` (bars follow her voice), `choice {options, pickAt}` (the first turns green at `pickAt`). Each has `at`, `end`, optional `y` (fraction of the height). Default places keep clear of the face and of the subtitles |

## Where the modules are found

- esbuild, three and Playwright: in every `node_modules` above the package, then above the folder you run from, then in `NODE_PATH`.
- `AVATAR_FILM_PLAYWRIGHT` (the path of Playwright's `index.mjs`) and `AVATAR_FILM_CHROME` (a browser) override Playwright.
- `FFMPEG` and `FFPROBE` override the ones on the PATH.

## Render time

Frames are drawn by SwiftShader, on the processor: the graphics card plays no part, and two renders of a film give the same pictures. Measured on one Windows laptop (2026-11-03): 30 frames of 1080×1920 in 22 s, about 22 s of work per second of film at 30 fps. Probe first, render once.

## Tests

```bash
npm run test:film
```

They cover everything that runs without a browser: arguments, film checks, what the page server agrees to serve (seven names, nothing outside the film folder), the standard timeline, the mix graph, the voice features, the gaze, the score, the tvOff graph, and where the modules are looked for.
