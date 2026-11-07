# Contributing to Mnemosyne Avatar

Thank you for helping her come alive. This guide gives a template for the
four things people add most often:

1. an expression,
2. a scenario,
3. a micro-reaction of the gaze,
4. a new face.

An expression or a scenario takes a few lines. A gaze reaction takes a
small module. A new face takes a density map and a rig, so open an issue
first.

## Before you start

```bash
npm install
npm test
npm run typecheck
```

Every change comes with a test. The tests run in Node, without a browser,
in a few seconds.

To see your change, build the example and open it in a browser:

```bash
npm run example
python -m http.server --directory examples/basic
```

<!-- DRAFT: contributor terms pending review by counsel (doc 203 lot 0). -->

The repository is under the Business Source License 1.1. By opening a pull
request, you agree that your contribution is published under the same
license.

## 1. An expression

An expression is one entry of `EXPRESSIONS` in `src/faceAnimator.ts`. It
receives a random function and returns a gesture: which features move, how
far, and how long it takes.

```ts
// src/faceAnimator.ts, inside EXPRESSIONS
relief: rnd => {
  const a = pick(rnd, 0.6, 0.9);
  return {
    // How far each feature goes at the top, from -1 to 1.
    weights: { browInnerUp: 0.4 * a, smileL: 0.5 * a, smileR: 0.5 * a, breath: a },
    // Lids a little heavy, the head a little down.
    lid: 0.3,
    head: { yaw: 0, pitch: -0.15 },
    // Seconds to rise, to hold, to fall.
    rise: 0.5, hold: pick(rnd, 0.8, 1.4), fall: 0.9,
  };
},
```

`FACE_SHAPES` in `src/faceShapes.ts` lists the features you can move:

```text
jawOpen  lipsWide  lipsRound  smileL  smileR  browUpL  browUpR
browFrown  browInnerUp  cheekRaise  mouthFrown  lipPress  headTilt
earL  earR  noseWrinkle  chinRaise  mouthSide  breath  cheekPuff
```

A gesture can also move the eyes (`look`, `squint`, `wink`, `lid`), the
head (`head`, `swing`) or add a beat (`pulse`). The `Gesture` type in
`src/faceGesture.ts` documents each field.

Draw the strength and the timing with `pick(rnd, min, max)`. The same
expression then looks a little different every time.

The test plays the expression and checks that it does what its name says:

```ts
// src/faceRelief.test.ts
import { describe, it, expect } from 'vitest';
import { createFaceAnimator, type FaceInput } from './faceAnimator';
import { FS } from './faceShapes';

const quiet: FaceInput = {
  voice: 0, spectrum: null, lookGoal: { x: 0, y: 0 }, motion: true, gestures: false,
};

describe('relief', () => {
  it('lifts the inner brows and the corners of the mouth, then lets go', () => {
    let s = 3;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const face = createFaceAnimator(rnd);
    for (let f = 0; f < 30; f++) face.step(1 / 60, quiet);
    face.express('relief');
    let top = 0;
    for (let f = 0; f < 120; f++) top = Math.max(top, face.step(1 / 60, quiet).weights[FS.browInnerUp] ?? 0);
    expect(top).toBeGreaterThan(0.15);
    for (let f = 0; f < 300; f++) face.step(1 / 60, quiet);
    expect(face.step(1 / 60, quiet).weights[FS.browInnerUp] ?? 0).toBeLessThan(0.05);
  });
});
```

When your expression lands in Mnemosyne OS, a maintainer gives it a name in
the app's menus.

## 2. A scenario

A scenario is a short scene written in JSON, with no code. It says which
face appears, where she looks, and which expressions she plays, second by
second. Maintainers render scenarios into videos with the film pipeline of
Mnemosyne OS.

Add it as `scenarios/<your-scenario>.json`:

```json
{
  "total": 12,
  "fps": 30,
  "width": 1080,
  "height": 1920,
  "shots": [
    { "shape": "brain", "at": 0, "until": 3 },
    { "shape": "woman", "at": 3, "until": 12, "fadeIn": 0.8 }
  ],
  "look": [
    { "at": 4, "x": 0.6, "y": 0.1 },
    { "at": 7, "x": -0.3, "y": 0.4 },
    { "at": 9, "x": 0, "y": 0 }
  ],
  "moves": [
    { "at": 5.5, "id": "curious" },
    { "at": 8, "id": "smile" },
    { "at": 10.5, "id": "wink" }
  ]
}
```

| Key | Meaning |
|---|---|
| `total` | Length in seconds |
| `shots` | Which figure is on screen, from `at` to `until`. `shape` is `brain` or a face name (`woman`, `claire`, `kitten`...) |
| `look` | Where she looks from `at` on, -1 to 1 on each axis |
| `moves` | Which expression starts at `at`. The names are the keys of `EXPRESSIONS`, `SEQUENCES`, `EMOTIONS` and `SCENES` |

Say in the pull request what the scene is meant to show.

## 3. A micro-reaction of the gaze

The gaze makes her feel alive more than any expression does. Its small
reactions live in modules next to `src/faceMicro.ts` (the small life under
every gesture) and `src/pointerNear.ts` (the pointer close to her face).

A reaction is a pure module. It reads what happens this frame and returns a
small change of the gaze, or nothing.

```ts
// src/gazeStartle.ts
/**
 * gazeStartle: a pointer that dashes towards her face makes her eyes jump to
 * it, then settle back.
 *
 * @module avatar/gazeStartle
 */
import { settle } from './motion';

export interface StartleInput {
  /** How fast the pointer comes closer, in eye spacings per second (pointerNear). */
  approach: number;
  /** Which side it comes from, -1..1 (the viewer's right is positive). */
  dx: number;
}

export interface StartleTracker {
  /** This frame's pull on the gaze, -1..1 on each axis, or null at rest. */
  step(dt: number, input: StartleInput | null): { x: number; y: number } | null;
}

/** Above this approach speed, the pointer startles her. */
export const STARTLE_APPROACH = 12;

export function createStartle(): StartleTracker {
  let pull = 0;
  let side = 0;
  return {
    step(dt, input) {
      if (input && input.approach > STARTLE_APPROACH) {
        pull = 1;
        side = Math.sign(input.dx);
      } else {
        pull = settle(pull, 0, dt, 0.4);
      }
      return pull > 0.02 ? { x: side * 0.6 * pull, y: 0 } : null;
    },
  };
}
```

The test feeds it frames by hand:

```ts
// src/gazeStartle.test.ts
import { describe, it, expect } from 'vitest';
import { createStartle } from './gazeStartle';

describe('gazeStartle', () => {
  it('jumps towards a pointer that dashes in, then settles back', () => {
    const s = createStartle();
    expect(s.step(1 / 60, { approach: 20, dx: 0.8 })?.x).toBeGreaterThan(0.5);
    for (let f = 0; f < 120; f++) s.step(1 / 60, null);
    expect(s.step(1 / 60, null)).toBeNull();
  });
});
```

Open an issue before you wire the module into `createFaceAnimator`. The
animator mixes many reactions on the same eyes, and the order matters.

## 4. A new face

A face is two things.

- A density map. It holds one byte per cell of a grid, for skin and hair,
  in a `*Portrait.ts` file.
- A rig. It places the eyes, the mouth, the brows, the cheeks, the nose and
  the chin on that map. The `PortraitSpec` type in `src/portraitFigure.ts`
  lists every field.

`src/womanFigure.ts` is a complete example. `src/robotSpec.ts` draws a face
in code, with no photo at all.

<!-- DRAFT: the tool that builds a density map from a picture is not public yet. -->

Open an issue first. The tool that turns a picture into a density map is
not in this repository yet.

A face must be yours to give. Draw it in code, or use a picture you made
or have the rights to. A real person's face needs that person's written
consent.

## Style

- Comments in English. A comment says why the code does what it does.
- Every module starts with a short header and its `@module` name.
- One idea per function. Pure functions where possible: they are easy to
  test.
