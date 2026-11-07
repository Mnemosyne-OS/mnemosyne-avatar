/**
 * brainShapes.test.ts — the other figures keep the five regions. The woman's face (her
 * rig, her eyes) is pinned in womanFigure.test, its life in faceAnimator.test.
 */
import { beforeAll, describe, it, expect } from 'vitest';
import { BRAIN_SHAPES, SHAPE_VIEWS, buildShapeArcs, buildShapeCloud, isBrainShape } from './brainShapes';
import { isPortraitShape, PORTRAIT_SHAPES } from './portraitIds';
import { loadPortraitMap } from './portraitMaps';

// The free faces' maps are fetched when a face is worn (doc 180 §27): here, all of them first.
beforeAll(async () => { await Promise.all(PORTRAIT_SHAPES.map(loadPortraitMap)); });
import { FACE_PARTS, FACE_SHAPE_COUNT, FS } from './faceShapes';
import { buildArraysFrom, ENGINE_COUNT, NO_REGION, createRng } from './brainCloud';

describe('brainShapes', () => {
  it.each(['butterfly', 'skull', 'lion', 'woman', 'man', 'claire', 'amara', 'kofi', 'mei', 'kenji', 'kitten', 'shepherd', 'labrador', 'bear', 'leo'] as const)('%s: every point is placed, every region has points to light and link', (shape) => {
    const cloud = buildShapeCloud(shape, 4000, createRng(7));
    expect(cloud.pos.every(Number.isFinite)).toBe(true);
    for (let r = 0; r < ENGINE_COUNT; r++) expect(cloud.byRegion[r]!.length).toBeGreaterThan(20);
    for (const v of cloud.reg) expect(v === NO_REGION || (v >= 0 && v < ENGINE_COUNT)).toBe(true);
    // Within the brain's extent, so the camera frames every figure the same way.
    let max = 0;
    for (let i = 0; i < cloud.pos.length; i += 3) max = Math.max(max, Math.abs(cloud.pos[i]!), Math.abs(cloud.pos[i + 1]!));
    expect(max).toBeLessThan(1.6);
    expect(SHAPE_VIEWS[shape].regions).toHaveLength(ENGINE_COUNT);
  });

  it('only the woman has hair, the links never join a strand, and the neck reaches the bottom of the frame', () => {
    const cloud = buildShapeCloud('woman', 4000, createRng(7));
    const hair = cloud.hair!;
    expect(hair.some(v => v > 0.8)).toBe(true);
    expect(hair.every(v => v >= 0 && v <= 1)).toBe(true);
    // A strand point moves, so a link drawn to it would tear away from it.
    for (let i = 0; i < hair.length; i++) if (hair[i]! > 0) expect(cloud.cortex[i]).toBe(0);
    let low = 0;
    for (let i = 1; i < cloud.pos.length; i += 3) low = Math.min(low, cloud.pos[i]!);
    expect(low).toBeLessThan(-1.5);
    expect(SHAPE_VIEWS.woman.hair).toBeGreaterThan(0);
    for (const shape of ['butterfly', 'skull', 'lion'] as const) {
      expect(buildShapeCloud(shape, 500, createRng(7)).hair).toBeUndefined();
      expect(SHAPE_VIEWS[shape].hair).toBe(0);
    }
  });

  it('the woman has eyes the shader can animate: irises, lids and lashes on both sides', () => {
    const cloud = buildShapeCloud('woman', 6000, createRng(7));
    const part = cloud.part!;
    const count = (k: number) => part.filter(v => v === k).length;
    for (const k of Object.values(FACE_PARTS)) expect(count(k)).toBeGreaterThan(10);
    // Every iris and lid point sits within its eye's height, so the blink covers it all.
    const face = SHAPE_VIEWS.woman.face!;
    for (let i = 0; i < part.length; i++) {
      const p = part[i]!;
      if (p < FACE_PARTS.IRIS_L || p > FACE_PARTS.LID_R) continue;
      const eye = face.eyes[p === FACE_PARTS.IRIS_L || p === FACE_PARTS.LID_L ? 0 : 1]!;
      expect(Math.abs(cloud.pos[i * 3 + 1]! - eye.y)).toBeLessThanOrEqual(eye.half);
    }
    expect(SHAPE_VIEWS.woman.turn).toBeLessThan(1);
    expect(SHAPE_VIEWS.woman.noDust).toBe(true);
    for (const shape of ['butterfly', 'skull', 'lion'] as const) {
      expect(buildShapeCloud(shape, 500, createRng(7)).part).toBeUndefined();
      expect(buildShapeCloud(shape, 500, createRng(7)).shapes).toBeUndefined();
      expect(SHAPE_VIEWS[shape].face).toBeUndefined();
    }
  });

  it('the woman has contour arcs: chains in order, on her regions; no other figure has any', () => {
    const arcs = buildShapeArcs('woman', createRng(7))!;
    const n = arcs.t.length;
    expect(n).toBeGreaterThan(1000);
    expect(arcs.pos.length).toBe(n * 3);
    expect(arcs.pos.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < n; i++) {
      expect(arcs.t[i]).toBeGreaterThanOrEqual(0);
      expect(arcs.t[i]).toBeLessThanOrEqual(1);
      expect(arcs.len[i]).toBeGreaterThan(0);
    }
    // A chain is a run along a contour: along it, t grows with the distance walked.
    const firstSeed = arcs.seed[0];
    let prevT = -1;
    for (let i = 0; i < n && arcs.seed[i] === firstSeed; i += 3) { expect(arcs.t[i]!).toBeGreaterThan(prevT); prevT = arcs.t[i]!; }
    const regions = new Set(Array.from(arcs.reg));
    expect(regions.size).toBeGreaterThanOrEqual(4);
    // A lit region does not tint a face's points: only its arcs light up.
    for (const shape of ['woman', 'man', 'claire', 'kitten', 'leo'] as const) expect(SHAPE_VIEWS[shape].litGlow).toBe(0);
    for (const shape of ['brain', 'butterfly', 'skull', 'lion'] as const) expect(buildShapeArcs(shape, createRng(7))).toBeNull();
  });

  it('the portraits wear the colours of their photo, hue only (brightest channel at 1); the other figures have none', () => {
    const cloud = buildShapeCloud('man', 4000, createRng(7));
    const c = cloud.color!;
    expect(c.length).toBe(cloud.seed.length * 3);
    let warm = 0;
    for (let i = 0; i < 4000; i++) {
      const r = c[i * 3]!, g = c[i * 3 + 1]!, b = c[i * 3 + 2]!;
      if (r + g + b === 0) continue;
      // Brightest channel at 1, or the neutral grey given to what is too dark to have a hue.
      expect([1, 0.7].some(v => Math.abs(Math.max(r, g, b) - v) < 1e-5)).toBe(true);
      if (r > b) warm++;
    }
    // Skin is warm: most of his coloured points lean red.
    expect(warm).toBeGreaterThan(2000);
    expect(buildShapeCloud('woman', 300, createRng(7)).color).toBeDefined();
    for (const shape of ['butterfly', 'skull', 'lion'] as const) expect(buildShapeCloud(shape, 300, createRng(7)).color).toBeUndefined();
  });

  it('the same seed draws the same figure, links and dust included', () => {
    const a = buildArraysFrom(r => buildShapeCloud('skull', 2000, r), 50, 11);
    const b = buildArraysFrom(r => buildShapeCloud('skull', 2000, r), 50, 11);
    expect(Array.from(a.brain.pos)).toEqual(Array.from(b.brain.pos));
    expect(a.links.positions.length).toBe(b.links.positions.length);
  });

  it('a stored value names a figure, or it is ignored', () => {
    expect(isBrainShape('skull')).toBe(true);
    expect(isBrainShape('dragon')).toBe(false);
    expect(isBrainShape(3)).toBe(false);
  });
  it.each(['woman', 'man', 'claire', 'amara', 'kofi', 'mei', 'kenji', 'kitten', 'shepherd', 'labrador', 'bear', 'leo'] as const)('%s: a closed eye is skin, as light as the skin around it, never the eye’s dark', (shape) => {
    const c = buildShapeCloud(shape, 26000, createRng(7));
    const face = SHAPE_VIEWS[shape].face!;
    const [eye] = face.eyes;
    let lidSum = 0, lidN = 0, skinSum = 0, skinN = 0;
    const lidC = [0, 0, 0], skinC = [0, 0, 0];
    const addC = (acc: number[], i: number) => { for (let k = 0; k < 3; k++) acc[k]! += c.color?.[i * 3 + k] ?? 0; };
    for (let i = 0; i < c.bright.length; i++) {
      const part = Math.round(c.part?.[i] ?? 0);
      const x = c.pos[i * 3]!, y = c.pos[i * 3 + 1]!;
      if (part === 3) { lidSum += c.bright[i]!; lidN++; addC(lidC, i); continue; }
      // The skin in a band around the left eye: above it to the brow, below it to the cheek.
      const dx = Math.abs(x - eye!.x), dy = Math.abs(y - eye!.y);
      if (part === 0 && dx < eye!.halfWidth && dy > eye!.half * 1.2 && dy < eye!.half * 2.5) { skinSum += c.bright[i]!; skinN++; addC(skinC, i); }
    }
    // Enough lid points to measure; a small eye (a dog's) has fewer, in proportion.
    expect(lidN).toBeGreaterThan(60);
    const lid = lidSum / lidN, skin = skinSum / skinN;
    expect(lid).toBeGreaterThan(skin * 0.6);
    expect(lid).toBeLessThan(skin * 1.3);
    // The skin's hue, not the iris's or the pupil's.
    const hue = (acc: number[], n: number) => acc.map(v => v / n);
    const [l, k] = [hue(lidC, lidN), hue(skinC, skinN)];
    expect(Math.hypot(l[0]! - k[0]!, l[1]! - k[1]!, l[2]! - k[2]!)).toBeLessThan(0.12);
  });
  it('the kitten’s ears flick about their roots; nothing else moves with them, and a person has none', () => {
    const offset = (shape: 'kitten' | 'woman', id: number) => {
      const c = buildShapeCloud(shape, 8000, createRng(7));
      const n = c.pos.length / 3;
      let tipMove = 0, faceMove = 0;
      const face = SHAPE_VIEWS[shape].face!;
      for (let i = 0; i < n; i++) {
        const dx = c.shapes?.[(i * FACE_SHAPE_COUNT + id) * 2] ?? 0, dy = c.shapes?.[(i * FACE_SHAPE_COUNT + id) * 2 + 1] ?? 0;
        const m = Math.hypot(dx, dy);
        const y = c.pos[i * 3 + 1]!;
        // Well above the eyes (the ears) vs at the eyes' height and below (the face).
        if (y > face.eyes[0]!.y + 0.55) tipMove = Math.max(tipMove, m); else if (y < face.eyes[0]!.y + 0.1) faceMove = Math.max(faceMove, m);
      }
      return { tipMove, faceMove };
    };
    for (const id of [FS.earL, FS.earR]) {
      const k = offset('kitten', id);
      expect(k.tipMove).toBeGreaterThan(0.05);
      expect(k.faceMove).toBe(0);
      expect(offset('woman', id).tipMove).toBe(0);
    }
    expect(SHAPE_VIEWS.kitten.face!.ears).toBe(true);
    expect(SHAPE_VIEWS.woman.face!.ears).toBeUndefined();
  });
  it('a face has shade points where its photo is dark, drawn on a light ground only, and the dark ground keeps all of its own', () => {
    const c = buildShapeCloud('claire', 6000, createRng(7));
    const shade: number[] = [], lit: number[] = [];
    for (let i = 0; i < c.seed.length; i++) (Math.round(c.part?.[i] ?? 0) === FACE_PARTS.SHADE ? shade : lit).push(c.bright[i]!);
    // Every point the dark ground drew before is still there; the shade points come on top.
    expect(lit.length).toBe(6000);
    expect(shade.length).toBeGreaterThan(1000);
    // They sit where the skin is dark: their mean light well under the face's own.
    const mean = (a: number[]) => a.reduce((m, v) => m + v, 0) / a.length;
    expect(mean(shade)).toBeLessThan(mean(lit) * 0.75);
    // None in the eyes (iris and lids have their own points), and none on a figure that is not a face.
    expect(buildShapeCloud('skull', 2000, createRng(7)).part).toBeUndefined();
  });
});
