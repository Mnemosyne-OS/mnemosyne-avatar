<!--
Thank you for helping her come alive.
CONTRIBUTING.md has a template for each kind of change. Keep the section
that matches yours and delete the others.
-->

## What it adds

<!-- One or two sentences: what she does now that she did not do before. -->

## Kind of change

- [ ] An expression (`EXPRESSIONS` in `src/faceAnimator.ts`)
- [ ] A scenario (`scenarios/<name>.json`)
- [ ] A micro-reaction of the gaze (a module in `src/`, issue opened first)
- [ ] A new face (density map and rig, issue opened first)
- [ ] A fix
- [ ] Something else

---

### An expression

- Name:
- What it should look like, in one sentence:
- [ ] Its strength and timing are drawn with `pick(rnd, min, max)`
- [ ] A test plays it and checks that it does what its name says

### A scenario

- What the scene is meant to show:
- Length in seconds:
- Faces it uses:
- [ ] `npm run film -- probe <folder> 5` gives a still that looks right
- [ ] Every `moves` id exists in `EXPRESSIONS`, `SEQUENCES`, `EMOTIONS` or `SCENES`
- [ ] A still or a short clip is attached below

### A micro-reaction of the gaze

- Issue: #
- What sets it off, and what the eyes do:
- [ ] A test feeds it frames by hand
- [ ] It is wired into `createFaceAnimator` in the order agreed in the issue

### A new face

- Issue: #
- [ ] The face is mine to give: drawn in code, or from a picture I made or have the rights to
- [ ] If it is a real person's face, that person gave written consent
- [ ] It comes with a density map (`*Portrait.ts`) and a rig (`PortraitSpec`)
- [ ] A still is attached below

---

## Checks

- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] Comments are in English and say why
- [ ] I agree that my contribution is published under the license of the files it changes: Apache 2.0 for code, CC BY 4.0 for a face

## A still or a clip

<!-- Drop an image or a short video here: it shows the change faster than words. -->
