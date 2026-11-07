/**
 * portraitBuild.test.ts — a photo into a backdrop face, the pure steps (doc 180
 * §11): the eyes land on the frame's, the pixels are told apart, the maps carry
 * skin and hair, and the landmark sheet reads the face mesh the right way round.
 */
import { describe, it, expect } from 'vitest';
import { FRAME, FRAME_EYES, LM, MAP, Px, alignTransform, applySim, buildMaps, classifyPixels, specFromLandmarks, type Pt } from './portraitBuild';

describe('alignTransform', () => {
  it('brings any two eyes onto the frame’s, whatever their scale, tilt and place', () => {
    for (const [l, r] of [[[355, 458], [549, 457]], [[100, 300], [180, 260]], [[600, 900], [400, 910]]] as Array<[Pt, Pt]>) {
      const m = alignTransform(l, r);
      const ql = applySim(m, l), qr = applySim(m, r);
      expect(ql[0]).toBeCloseTo(FRAME_EYES.left[0], 6); expect(ql[1]).toBeCloseTo(FRAME_EYES.left[1], 6);
      expect(qr[0]).toBeCloseTo(FRAME_EYES.right[0], 6); expect(qr[1]).toBeCloseTo(FRAME_EYES.right[1], 6);
    }
  });
});

/** A synthetic aligned portrait: grey ground, a skin-coloured face oval, dark hair above it, a neck below. */
function synthetic() {
  const rgba = new Uint8ClampedArray(FRAME.w * FRAME.h * 4);
  const set = (x: number, y: number, c: [number, number, number]) => { const i = (y * FRAME.w + x) * 4; rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255; };
  const oval: Pt[] = Array.from({ length: 36 }, (_, k) => [257 + 150 * Math.cos((k / 36) * 2 * Math.PI), 360 + 200 * Math.sin((k / 36) * 2 * Math.PI)]);
  for (let y = 0; y < FRAME.h; y++) {
    for (let x = 0; x < FRAME.w; x++) {
      const inFace = ((x - 257) / 150) ** 2 + ((y - 360) / 200) ** 2 < 1;
      // As wide as her curls: about 1.6 times the face.
      const inHair = ((x - 257) / 245) ** 2 + ((y - 230) / 160) ** 2 < 1 && !inFace;
      const neck = y > 560 && Math.abs(x - 257) < 110 + Math.max(0, y - 620);
      // Skin with a little shading, so its light has a range.
      if (inFace || neck) set(x, y, [200 - (x % 20), 150 - (x % 20), 120]);
      else if (inHair) set(x, y, [25 + (x * 7 + y * 13) % 30, 20, 18]);
      else set(x, y, [200, 200, 200]);
    }
  }
  return { rgba, oval };
}

describe('classifyPixels and buildMaps', () => {
  it('tells the grey ground, the skin (face and neck) and the dark hair apart', () => {
    const { rgba, oval } = synthetic();
    const kind = classifyPixels(rgba, null, oval, 560);
    const at = (x: number, y: number) => kind[y * FRAME.w + x];
    expect(at(10, 10)).toBe(Px.Background);
    expect(at(257, 360)).toBe(Px.Skin);
    expect(at(257, 600)).toBe(Px.Skin);
    expect(at(257, 90)).toBe(Px.Hair);
    expect(at(80, 230)).toBe(Px.Hair);
  });

  it('a matte decides the figure on its own: what it leaves out is background, even a skin colour', () => {
    const { rgba, oval } = synthetic();
    const alpha = new Uint8Array(FRAME.w * FRAME.h);
    const kind = classifyPixels(rgba, alpha, oval, 560);
    expect(kind.every(k => k === Px.Background)).toBe(true);
  });

  it('the maps carry skin and hair cells, and the colour of the figure only', () => {
    const { rgba, oval } = synthetic();
    const maps = buildMaps(rgba, classifyPixels(rgba, null, oval, 560));
    expect(maps.w).toBe(MAP.w); expect(maps.h).toBe(MAP.h);
    expect(maps.skinCells).toBeGreaterThan(3000);
    expect(maps.hairCells).toBeGreaterThan(500);
    const cells = Uint8Array.from(atob(maps.b64), c => c.charCodeAt(0));
    const rgb = Uint8Array.from(atob(maps.rgb), c => c.charCodeAt(0));
    expect(cells.length).toBe(MAP.w * MAP.h);
    expect(rgb.length).toBe(MAP.w * MAP.h * 3);
    // A background corner is empty in both maps.
    expect(cells[0]).toBe(0);
    expect([rgb[0], rgb[1], rgb[2]]).toEqual([0, 0, 0]);
    // A cell in the middle of the face is skin, and warm.
    const c = Math.floor(360 / FRAME.h * MAP.h) * MAP.w + Math.floor(257 / FRAME.w * MAP.w);
    expect(cells[c]).toBeGreaterThan(0);
    expect(cells[c]).toBeLessThan(128);
    expect(rgb[c * 3]!).toBeGreaterThan(rgb[c * 3 + 2]!);
  });
});

describe('classifyPixels on what real photos got wrong', () => {
  /** The synthetic portrait, with a lit forehead above the oval, hair hanging beside the neck, and a dark beard under the jaw. */
  function real() {
    const { rgba, oval } = synthetic();
    const set = (x: number, y: number, c: [number, number, number]) => { const i = (y * FRAME.w + x) * 4; rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255; };
    // The forehead's top, above the oval (which stops at y 160), lit: the skin's hue, much lighter.
    for (let y = 130; y < 162; y++) for (let x = 220; x < 295; x++) set(x, y, [245, 215, 190]);
    // Long dark hair hanging beside the neck, down from the hair above, to below the chin.
    for (let y = 300; y < 640; y++) for (const x0 of [80, 380]) for (let x = x0; x < x0 + 50; x++) set(x, y, [30, 22, 20]);
    // A dark beard under the jaw, in the neck's column, and a dark collar joining it to the hanging hair.
    for (let y = 540; y < 600; y++) for (let x = 220; x < 295; x++) set(x, y, [35, 25, 22]);
    for (let y = 600; y < 612; y++) for (let x = 80; x < 430; x++) set(x, y, [32, 24, 22]);
    return { rgba, oval };
  }

  it('dark brows, eyes and lips inside the face are skin, never hair', () => {
    const { rgba, oval } = synthetic();
    const set = (x: number, y: number, c: [number, number, number]) => { const i = (y * FRAME.w + x) * 4; rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255; };
    // A dark brow above the left eye, a dark pupil, dark lips.
    for (let y = 236; y < 252; y++) for (let x = 140; x < 225; x++) set(x, y, [30, 22, 20]);
    for (let y = 280; y < 290; y++) for (let x = 177; x < 187; x++) set(x, y, [10, 8, 8]);
    for (let y = 432; y < 446; y++) for (let x = 210; x < 305; x++) set(x, y, [70, 25, 30]);
    const kind = classifyPixels(rgba, null, oval, 560);
    expect(kind[244 * FRAME.w + 180]).toBe(Px.Skin);
    expect(kind[284 * FRAME.w + 182]).toBe(Px.Skin);
    expect(kind[439 * FRAME.w + 257]).toBe(Px.Skin);
  });

  it('a lit forehead above the face mesh stays skin, never a band of hair', () => {
    const { rgba, oval } = real();
    const kind = classifyPixels(rgba, null, oval, 560);
    expect(kind[145 * FRAME.w + 257]).toBe(Px.Skin);
  });

  it('the neck’s top in the jaw’s shade stays skin: it joins the face to the neck', () => {
    const { rgba, oval } = synthetic();
    const set = (x: number, y: number, c: [number, number, number]) => { const i = (y * FRAME.w + x) * 4; rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255; };
    // Under the jaw, beside the chin, outside the oval: the skin's hue, in deep shade.
    for (let y = 500; y < 560; y++) for (let x = 170; x < 345; x++) if (((x - 257) / 150) ** 2 + ((y - 360) / 200) ** 2 >= 1) set(x, y, [95, 62, 48]);
    const kind = classifyPixels(rgba, null, oval, 560);
    expect(kind[550 * FRAME.w + 190]).toBe(Px.Skin);
    expect(kind[550 * FRAME.w + 325]).toBe(Px.Skin);
  });

  it('long hair beside the neck stays hair below the chin; a beard in the neck’s column stays skin', () => {
    const { rgba, oval } = real();
    const kind = classifyPixels(rgba, null, oval, 560);
    expect(kind[620 * FRAME.w + 100]).toBe(Px.Hair);
    expect(kind[620 * FRAME.w + 400]).toBe(Px.Hair);
    expect(kind[580 * FRAME.w + 257]).toBe(Px.Skin);
    // The collar touches the hair, but the flood never enters the neck's column.
    expect(kind[606 * FRAME.w + 257]).toBe(Px.Skin);
  });
});

describe('specFromLandmarks', () => {
  /** A face mesh with only the points the sheet reads, placed like the woman's face. */
  function mesh(): Pt[] {
    const pts: Pt[] = Array.from({ length: 478 }, () => [257, 360] as const);
    const put = (i: number, p: Pt) => { pts[i] = p; };
    put(LM.irisL, [182, 284]); put(LM.irisR, [331, 286]);
    LM.irisRingL.forEach((i, k) => put(i, [182 + 15 * Math.cos(k * Math.PI / 2), 284 + 15 * Math.sin(k * Math.PI / 2)]));
    LM.irisRingR.forEach((i, k) => put(i, [331 + 15 * Math.cos(k * Math.PI / 2), 286 + 15 * Math.sin(k * Math.PI / 2)]));
    put(LM.eyeL.outer, [145, 284]); put(LM.eyeL.inner, [220, 284]); put(LM.eyeL.top, [182, 272]); put(LM.eyeL.bottom, [182, 296]);
    put(LM.eyeR.inner, [295, 286]); put(LM.eyeR.outer, [368, 286]); put(LM.eyeR.top, [331, 274]); put(LM.eyeR.bottom, [331, 298]);
    LM.browL.upper.forEach((i, k) => put(i, [228 - 22 * k, 238]));
    LM.browL.lower.forEach((i, k) => put(i, [228 - 22 * k, 252]));
    LM.browR.upper.forEach((i, k) => put(i, [285 + 25 * k, 238]));
    LM.browR.lower.forEach((i, k) => put(i, [285 + 25 * k, 252]));
    put(LM.mouth.left, [197, 439]); put(LM.mouth.right, [317, 439]); put(LM.mouth.top, [257, 412]); put(LM.mouth.bottom, [257, 475]);
    put(LM.mouth.innerTop, [257, 437]); put(LM.mouth.innerBottom, [257, 441]);
    put(LM.noseTip, [257, 345]); put(LM.noseBridge, [257, 270]); put(LM.chin, [257, 520]); put(LM.forehead, [257, 150]);
    LM.cheekL.forEach(i => put(i, [190, 382])); LM.cheekR.forEach(i => put(i, [325, 382]));
    put(234, [104, 340]); put(454, [410, 340]);
    return pts;
  }

  it('reads the eyes, the iris, the mouth, the brows inner end first, and the chin', () => {
    const { rgba, oval } = synthetic();
    const spec = specFromLandmarks(mesh(), classifyPixels(rgba, null, oval, 520));
    expect(spec.eyes[0].x).toBe(182); expect(spec.eyes[1].x).toBe(331);
    expect(spec.eyes[0].rx).toBeCloseTo(41.25, 1);
    expect(spec.iris.outer).toBeCloseTo(15, 5);
    expect(spec.mouth).toMatchObject({ x: 257, y: 439, rx: 60 });
    expect(spec.brows[0][0]).toEqual([228, 245]);
    expect(spec.brows[1][0]).toEqual([285, 245]);
    expect(spec.chinY).toBe(520);
    expect(spec.pivotY).toBeGreaterThan(spec.chinY);
    expect(spec.neckBaseY).toBeGreaterThan(spec.pivotY);
    expect(spec.nose).toEqual({ x: 257, y: 345, bridgeTop: 270 });
  });

  it('the neck is measured on its skin alone: hair hanging beside it does not widen it', () => {
    const { rgba, oval } = synthetic();
    const set = (x: number, y: number, c: [number, number, number]) => { const i = (y * FRAME.w + x) * 4; rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255; };
    // Hair touching the neck on both sides, from above the chin down.
    for (let y = 300; y < 680; y++) for (const x0 of [97, 367]) for (let x = x0; x < x0 + 50; x++) set(x, y, [30, 22, 20]);
    // The chin where the drawn face ends, as the face mesh puts it.
    const pts = mesh(); pts[LM.chin] = [257, 560];
    const spec = specFromLandmarks(pts, classifyPixels(rgba, null, oval, 560));
    expect(spec.neckHalf).toBeGreaterThan(95);
    expect(spec.neckHalf).toBeLessThan(125);
  });

  it('wide hair sways like hers, hair close to the head moves with it', () => {
    const { rgba, oval } = synthetic();
    const wide = specFromLandmarks(mesh(), classifyPixels(rgba, null, oval, 520));
    expect(wide.hair.sway).toBe(1);
    // The same face with only a cap of hair above the forehead.
    const kind = classifyPixels(rgba, null, oval, 520).map((k, i) => (k === Px.Hair && (i % FRAME.w < 180 || i % FRAME.w > 334) ? Px.Background : k));
    const short = specFromLandmarks(mesh(), kind);
    expect(short.hair.sway).toBeLessThan(0.2);
    expect(short.hair.depth).toBeGreaterThan(wide.hair.depth);
  });
});
