/**
 * portraitBuild — a portrait photo into a backdrop face, inside the app (doc
 * 180 §11): the same steps as scripts/portrait-density-map.py, plus the
 * landmarks a person used to measure by hand, read from MediaPipe's face
 * landmarker (478 points).
 *
 * Pure: the caller (portraitFromPhoto) runs the landmarker and hands over the
 * aligned pixels; everything here is arithmetic, so it is pinned by tests.
 *
 *  1. alignTransform: the similarity that brings the eyes onto the portrait
 *     frame (514 × 740, eyes at 182,284 and 331,286), so every face shares the
 *     movements' sizes;
 *  2. classifyPixels: background, skin or hair per aligned pixel;
 *  3. buildMaps: the density map (skin by its light, hair by its texture) and
 *     the colour map, 171 × 247 cells;
 *  4. specFromLandmarks: the PortraitSpec landmarks from the 478 points.
 *
 * @module avatar/portraitBuild
 */
import type { PortraitSpec } from './portraitFigure';

/** The portrait frame every face is aligned on, and its eyes. */
export const FRAME = { w: 514, h: 740 } as const;
export const FRAME_EYES = { left: [182, 284], right: [331, 286] } as const;
/** The density map's size. */
export const MAP = { w: 171, h: 247 } as const;

export type Pt = readonly [number, number];

/** A 2D similarity: q = [a -b; b a] p + t. */
export interface Similarity { a: number; b: number; tx: number; ty: number }

/** The similarity taking the photo's eyes (the viewer's left one first) onto the frame's. */
export function alignTransform(eyeL: Pt, eyeR: Pt): Similarity {
  const [fl, fr] = [FRAME_EYES.left, FRAME_EYES.right];
  const sx = eyeR[0] - eyeL[0], sy = eyeR[1] - eyeL[1];
  const dx = fr[0] - fl[0], dy = fr[1] - fl[1];
  const s2 = sx * sx + sy * sy;
  // Complex division (d / s): rotation and scale in one.
  const a = (dx * sx + dy * sy) / s2, b = (dy * sx - dx * sy) / s2;
  return { a, b, tx: fl[0] - (a * eyeL[0] - b * eyeL[1]), ty: fl[1] - (b * eyeL[0] + a * eyeL[1]) };
}

export const applySim = (m: Similarity, p: Pt): [number, number] => [m.a * p[0] - m.b * p[1] + m.tx, m.b * p[0] + m.a * p[1] + m.ty];

// ── MediaPipe face mesh indices (the viewer's left first) ─────────────────────
export const LM = {
  irisL: 468, irisR: 473,
  irisRingL: [469, 470, 471, 472], irisRingR: [474, 475, 476, 477],
  eyeL: { outer: 33, inner: 133, top: 159, bottom: 145 },
  eyeR: { inner: 362, outer: 263, top: 386, bottom: 374 },
  // Each brow inner end first, its upper and lower edge point by point.
  browL: { upper: [107, 66, 105, 63, 70], lower: [55, 65, 52, 53, 46] },
  browR: { upper: [336, 296, 334, 293, 300], lower: [285, 295, 282, 283, 276] },
  mouth: { left: 61, right: 291, top: 0, bottom: 17, innerTop: 13, innerBottom: 14 },
  noseTip: 1, noseBridge: 168, chin: 152, forehead: 10,
  // The cheeks' apples: between the outer cheek and the one beside the nose.
  cheekL: [50, 205], cheekR: [280, 425],
  oval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
} as const;

/** Inside a polygon (even-odd). */
export function insidePolygon(p: Pt, poly: ReadonlyArray<Pt>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (!a || !b) continue;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** What each aligned pixel is. */
export const Px = { Background: 0, Skin: 1, Hair: 2 } as const;

/**
 * Background, skin or hair per pixel of the aligned frame.
 *
 * The figure is what the matte keeps (alpha), or, without a matte, what is not
 * pale and grey (the generated portraits' plain backdrop). Skin is what looks
 * like the face's own skin (its mean colour inside the face's oval); hair is
 * the rest of the figure: outside the oval, or inside it and far from the
 * skin's colour (bangs). Ears count as skin: they are the skin's colour.
 *
 * Two places the colour alone got wrong, measured on fifty real photos:
 *  - the FOREHEAD: the face mesh's oval stops mid-forehead, and the top of a
 *    forehead is often its most lit skin, far from the mean in colour: it read
 *    as hair, a band with a flat bottom across every forehead. Up to a little
 *    above the oval (FOREHEAD_REACH), skin lighter than the mean stays skin;
 *    there, only darker or clearly other-hued pixels are hair.
 *  - THE BROWS (and the eyes, the lips, a beard) are darker than the skin and
 *    read as hair inside the oval: they sat on the hair's shell, behind the
 *    face when the head turned, and swayed. From the brows down, inside the
 *    oval, all is skin.
 *  - UNDER THE JAW, the neck's top sits in the jaw's shade, outside the oval
 *    and darker than the mean skin: it read as hair and cut the neck from the
 *    face. In the neck's column there, shade stays skin; only another hue is hair.
 *  - BELOW THE CHIN everything was skin, long hair beside the neck included: it
 *    stayed on the neck when the head turned and widened the neck's measure.
 *    Below the chin a hair-like pixel is hair when it continues the hair above
 *    (a flood from it, down to the shoulders), at the sides only: the neck's
 *    column (a beard, its shade, a dark collar) and clothes stay skin.
 */
export function classifyPixels(rgba: Uint8ClampedArray, alpha: Uint8Array | null, oval: ReadonlyArray<Pt>, chinY: number): Uint8Array {
  const n = FRAME.w * FRAME.h;
  const out = new Uint8Array(n);
  // Without a matte, the face itself is always figure: a lit forehead's highlight is pale and grey too.
  let faceTop: number = FRAME.h;
  for (const [, y] of oval) faceTop = Math.min(faceTop, y);
  const faceEyes = faceTop + 0.45 * Math.max(1, chinY - faceTop);
  const inFaceZone = (i: number): boolean => {
    const x = i % FRAME.w, y = (i - x) / FRAME.w;
    return insidePolygon([x, y < faceEyes ? faceEyes + (y - faceEyes) / FOREHEAD_REACH : y], oval);
  };
  const figure = (i: number): boolean => {
    if (alpha) return (alpha[i] ?? 0) > 127;
    if (inFaceZone(i)) return true;
    const r = (rgba[i * 4] ?? 0) / 255, g = (rgba[i * 4 + 1] ?? 0) / 255, b = (rgba[i * 4 + 2] ?? 0) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = (mx - mn) / (mx + 1e-6), lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return !(sat < 0.13 && lum > 0.42);
  };
  // The skin's own colour: the mean inside the oval, away from its edge.
  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (let y = 0; y < FRAME.h; y += 2) {
    for (let x = 0; x < FRAME.w; x += 2) {
      const i = y * FRAME.w + x;
      if (!figure(i) || !insidePolygon([x, y], oval)) continue;
      sr += rgba[i * 4] ?? 0; sg += rgba[i * 4 + 1] ?? 0; sb += rgba[i * 4 + 2] ?? 0; sn++;
    }
  }
  const skin: [number, number, number] = sn > 0 ? [sr / sn, sg / sn, sb / sn] : [180, 140, 120];
  const skinLum = 0.299 * skin[0] + 0.587 * skin[1] + 0.114 * skin[2];
  const skinSum = skin[0] + skin[1] + skin[2] || 1;
  // The forehead's reach: the oval's upper half stretched up about the eyes' line.
  let top: number = FRAME.h;
  for (const [, y] of oval) top = Math.min(top, y);
  const span = Math.max(1, chinY - top);
  const eyesY = top + 0.45 * span;
  const inForehead = (x: number, y: number) => y < eyesY && insidePolygon([x, eyesY + (y - eyesY) / FOREHEAD_REACH], oval);
  // Under the jaw, in the neck's column: the neck's top, in the jaw's shade.
  let zx0: number = FRAME.w, zx1 = 0;
  for (const [x] of oval) { zx0 = Math.min(zx0, x); zx1 = Math.max(zx1, x); }
  const zc = (zx0 + zx1) / 2, zHalf = NECK_ZONE * (zx1 - zx0) / 2;
  // Above the chin only: below it the flood decides, and it keeps out of the neck's column (NECK_CLEAR).
  const inNeckTop = (x: number, y: number) => y > chinY - NECK_TOP * span && y <= chinY && Math.abs(x - zc) < zHalf;
  const hueOff = (r: number, g: number, b: number) => {
    const s = r + g + b || 1;
    return Math.hypot(r / s - skin[0] / skinSum, g / s - skin[1] / skinSum, b / s - skin[2] / skinSum);
  };
  const hairLike = (i: number, x: number, y: number): boolean => {
    const r = rgba[i * 4] ?? 0, g = rgba[i * 4 + 1] ?? 0, b = rgba[i * 4 + 2] ?? 0;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const darker = (skinLum - lum) / 255;
    if (inNeckTop(x, y)) {
      // Shade is still skin here, and shade warms the skin's hue: only a clearly other hue is
      // hair (too dark to have a hue: shade).
      return lum > 30 && hueOff(r, g, b) > NECK_HUE;
    }
    if (inForehead(x, y)) {
      // Lit skin is lighter, not another hue: only darker or other-hued pixels are hair here.
      return darker > 0.22 || hueOff(r, g, b) > FOREHEAD_HUE;
    }
    // Distance to the skin's colour, plus how much darker: hair is darker or another colour.
    const dist = Math.hypot(r - skin[0], g - skin[1], b - skin[2]) / 255;
    return dist > 0.32 || darker > 0.28;
  };
  for (let y = 0; y <= Math.min(FRAME.h - 1, chinY); y++) {
    for (let x = 0; x < FRAME.w; x++) {
      const i = y * FRAME.w + x;
      if (!figure(i)) continue;
      const inOval = insidePolygon([x, y], oval);
      const like = hairLike(i, x, y);
      const r = rgba[i * 4] ?? 0, g = rgba[i * 4 + 1] ?? 0, b = rgba[i * 4 + 2] ?? 0;
      const darker = (skinLum - (0.299 * r + 0.587 * g + 0.114 * b)) / 255;
      // From the brows down, inside the oval, all is skin: brows, eyes, lips and a beard are
      // dark, but they belong to the face (as hair they floated on the hair's shell and swayed).
      const features = inOval && y > FRAME_EYES_Y - FEATURES_ABOVE_EYES;
      out[i] = features ? Px.Skin : inOval ? (like && darker > 0.35 ? Px.Hair : Px.Skin) : (like ? Px.Hair : Px.Skin);
    }
  }
  // Below the chin: skin, unless it continues the hair above it (down to the shoulders).
  const below0 = Math.min(FRAME.h, Math.floor(chinY) + 1), below1 = Math.min(FRAME.h, Math.round(chinY + HAIR_BELOW_CHIN * span));
  for (let y = below0; y < FRAME.h; y++) {
    for (let x = 0; x < FRAME.w; x++) { const i = y * FRAME.w + x; if (figure(i)) out[i] = Px.Skin; }
  }
  // Never in the neck's column (a beard, the neck's shade, a dark collar): hair hangs at the sides.
  let ox0: number = FRAME.w, ox1 = 0;
  for (const [x] of oval) { ox0 = Math.min(ox0, x); ox1 = Math.max(ox1, x); }
  const oc = (ox0 + ox1) / 2, clear = NECK_CLEAR * (ox1 - ox0) / 2;
  const stack: number[] = [];
  // It starts from hair that hangs beside the face (hair there at the cheeks too), never from a
  // beard along the jaw.
  const cheekRow = Math.max(0, Math.round(chinY - HANG_ABOVE * span)) * FRAME.w;
  if (below0 > 0) for (let x = 0; x < FRAME.w; x++) {
    const i = (below0 - 1) * FRAME.w + x;
    if (out[i] === Px.Hair && out[cheekRow + x] === Px.Hair && Math.abs(x - oc) > HANG_FROM * (ox1 - ox0) / 2) stack.push(i);
  }
  for (let i = stack.pop(); i !== undefined; i = stack.pop()) {
    const x = i % FRAME.w, y = (i - x) / FRAME.w;
    for (const j of [i + FRAME.w, i - 1, i + 1]) {
      const jx = j % FRAME.w, jy = (j - jx) / FRAME.w;
      if (jy < below0 || jy >= below1 || Math.abs(jx - x) > 1 || jy < y) continue;
      if (out[j] !== Px.Skin || !figure(j) || Math.abs(jx - oc) < clear || !hairLike(j, jx, jy)) continue;
      out[j] = Px.Hair;
      stack.push(j);
    }
  }
  return out;
}

/** Under the jaw, the neck's top: this high above the chin (in spans), this close to the middle (share of the oval's half width). */
const NECK_TOP = 0.3, NECK_ZONE = 0.9;
/** There, how far from the skin's hue a pixel must be to be hair: wider than the forehead's, shade shifts the hue. */
const NECK_HUE = 0.12;
/** The aligned eyes' height: every photo is aligned on it. */
const FRAME_EYES_Y = (FRAME_EYES.left[1] + FRAME_EYES.right[1]) / 2;
/** How far above the eyes the face's features start (the brows' top, with a margin), in frame pixels. */
const FEATURES_ABOVE_EYES = 75;
/** A neck is at least this share of half the face's width (cheek to cheek): narrower is still the chin. */
const NECK_MIN = 0.5;
/** How far up the forehead reaches past the face mesh's oval, as a stretch of its upper half about the eyes. */
const FOREHEAD_REACH = 1.35;
/** In the forehead, how far from the skin's hue (chromaticity) a pixel must be to be hair. */
const FOREHEAD_HUE = 0.06;
/** Hair continues below the chin at most this far, in eyes-to-chin spans: to the shoulders. */
const HAIR_BELOW_CHIN = 0.85;
/** Below the chin, no hair this close to the face's middle, as a share of the oval's half width: the neck's column. */
const NECK_CLEAR = 0.6;
/** …and it continues only hair that hangs beside the face at the chin: this far out, as a share of the oval's half width. */
const HANG_FROM = 0.75;
/** …with hair in the same column this far above the chin, in spans: it falls from above. */
const HANG_ABOVE = 0.3;

/** Both maps, base64: density (1..127 skin, 128..255 hair) and colour (rgb per cell). */
export interface PortraitMaps { b64: string; rgb: string; w: number; h: number; skinCells: number; hairCells: number }

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/**
 * The density and colour maps of an aligned portrait: per cell, skin by its
 * light (stretched over the skin's own range, so the shading draws the face)
 * and hair by its texture (a base plus its local detail), and the mean colour
 * of the figure under it. The port of scripts/portrait-density-map.py.
 */
export function buildMaps(rgba: Uint8ClampedArray, kind: Uint8Array): PortraitMaps {
  const n = FRAME.w * FRAME.h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = (0.299 * (rgba[i * 4] ?? 0) + 0.587 * (rgba[i * 4 + 1] ?? 0) + 0.114 * (rgba[i * 4 + 2] ?? 0)) / 255;
  // The skin's light range: its 3rd and 99th percentiles.
  const skinLums: number[] = [];
  for (let i = 0; i < n; i += 3) if (kind[i] === Px.Skin) skinLums.push(lum[i] ?? 0);
  skinLums.sort((a, b) => a - b);
  const lo = skinLums[Math.floor(skinLums.length * 0.03)] ?? 0, hi = skinLums[Math.floor(skinLums.length * 0.99)] ?? 1;
  // The hair's texture: how far each pixel is from its neighbourhood's mean (a 7 × 7 box).
  const blur = boxBlur(lum, FRAME.w, FRAME.h, 3);

  const cells = new Uint8Array(MAP.w * MAP.h), rgb = new Uint8Array(MAP.w * MAP.h * 3);
  let skinCells = 0, hairCells = 0;
  const cw = FRAME.w / MAP.w, ch = FRAME.h / MAP.h;
  for (let cy = 0; cy < MAP.h; cy++) {
    for (let cx = 0; cx < MAP.w; cx++) {
      let sCount = 0, hCount = 0, sSum = 0, hSum = 0, r = 0, g = 0, b = 0, total = 0;
      const x0 = Math.floor(cx * cw), x1 = Math.floor((cx + 1) * cw), y0 = Math.floor(cy * ch), y1 = Math.floor((cy + 1) * ch);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * FRAME.w + x;
          total++;
          const k = kind[i];
          if (k === Px.Background) continue;
          r += rgba[i * 4] ?? 0; g += rgba[i * 4 + 1] ?? 0; b += rgba[i * 4 + 2] ?? 0;
          if (k === Px.Skin) { sCount++; sSum += Math.min(1, Math.max(0, ((lum[i] ?? 0) - lo) / Math.max(1e-3, hi - lo))) ** 1.5; }
          else { hCount++; hSum += 0.3 + 0.7 * Math.min(1, Math.abs((lum[i] ?? 0) - (blur[i] ?? 0)) * 12); }
        }
      }
      const c = cy * MAP.w + cx;
      if (total === 0) continue;
      if (hCount > total / 2) { cells[c] = Math.round(128 + (hSum / hCount) * 127); hairCells++; }
      else if (sCount > total / 2 || (sCount > 0 && sCount + hCount > total / 2)) { cells[c] = Math.max(1, Math.round(1 + (sSum / Math.max(1, sCount)) * 126)); skinCells++; }
      else continue;
      const fig = sCount + hCount;
      rgb[c * 3] = Math.round(r / fig); rgb[c * 3 + 1] = Math.round(g / fig); rgb[c * 3 + 2] = Math.round(b / fig);
    }
  }
  return { b64: toB64(cells), rgb: toB64(rgb), w: MAP.w, h: MAP.h, skinCells, hairCells };
}

/** A box blur of radius r, by running sums (rows then columns). */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))] ?? 0;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (2 * r + 1);
      acc += (src[y * w + Math.min(w - 1, x + r + 1)] ?? 0) - (src[y * w + Math.max(0, x - r)] ?? 0);
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x] ?? 0;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += (tmp[Math.min(h - 1, y + r + 1) * w + x] ?? 0) - (tmp[Math.max(0, y - r) * w + x] ?? 0);
    }
  }
  return out;
}

/**
 * A face's landmarks (PortraitSpec, all but its maps) from the face mesh,
 * already in the aligned frame's pixels, and its classified pixels (for the
 * neck's width and the hair's extent). The ratios are those measured on the
 * first two faces (doc 180 §8 bis).
 */
export function specFromLandmarks(pts: ReadonlyArray<Pt>, kind: Uint8Array): Omit<PortraitSpec, 'map'> {
  const P = (i: number): Pt => pts[i] ?? [0, 0];
  const avg = (is: readonly number[]): Pt => {
    const s = is.reduce<[number, number]>((acc, i) => [acc[0] + P(i)[0], acc[1] + P(i)[1]], [0, 0]);
    return [s[0] / is.length, s[1] / is.length];
  };
  const eye = (e: { outer: number; inner: number; top: number; bottom: number }, iris: number) => ({
    x: P(iris)[0], y: (P(e.top)[1] + P(e.bottom)[1]) / 2,
    rx: Math.abs(P(e.outer)[0] - P(e.inner)[0]) * 0.55,
    ry: Math.max(9, Math.abs(P(e.bottom)[1] - P(e.top)[1]) / 2 + 4),
  });
  const eyeL = eye(LM.eyeL, LM.irisL), eyeR = eye(LM.eyeR, LM.irisR);
  const irisR = (ring: readonly number[], c: number) => ring.reduce((m, i) => m + Math.hypot(P(i)[0] - P(c)[0], P(i)[1] - P(c)[1]), 0) / ring.length;
  const outer = Math.max(9, (irisR(LM.irisRingL, LM.irisL) + irisR(LM.irisRingR, LM.irisR)) / 2);
  const brow = (b: { upper: readonly number[]; lower: readonly number[] }) =>
    b.upper.map((u, k) => { const l = b.lower[k] ?? u; return [Math.round((P(u)[0] + P(l)[0]) / 2), Math.round((P(u)[1] + P(l)[1]) / 2)] as const; });
  const chinY = P(LM.chin)[1];
  const eyesY = (eyeL.y + eyeR.y) / 2;
  const span = chinY - eyesY;
  const midX = (P(LM.noseTip)[0] + (eyeL.x + eyeR.x) / 2) / 2;
  const mouth = { x: (P(LM.mouth.left)[0] + P(LM.mouth.right)[0]) / 2, y: (P(LM.mouth.innerTop)[1] + P(LM.mouth.innerBottom)[1]) / 2 };

  // The neck's half width: the narrowest run of SKIN around the middle, just under the chin and
  // above the shoulders, which widen it; a run too narrow to be a neck is the chin's underside
  // Skin only: hair hanging beside the neck widened the old measure
  // to its cap on half of fifty real photos. Never wider than 85 % of half the face.
  const faceHalf = Math.abs(P(454)[0] - P(234)[0]) / 2;
  let narrowest = Infinity;
  for (let k = 0.04; k <= 0.3; k += 0.02) {
    const y = Math.min(FRAME.h - 1, Math.round(chinY + k * span));
    let l = Math.round(midX), r = Math.round(midX);
    if (kind[y * FRAME.w + l] !== Px.Skin) continue;
    while (l > 0 && kind[y * FRAME.w + l - 1] === Px.Skin) l--;
    while (r < FRAME.w - 1 && kind[y * FRAME.w + r + 1] === Px.Skin) r++;
    // Narrower than a neck can be: the chin's underside, not the neck yet.
    if ((r - l) / 2 < NECK_MIN * faceHalf) continue;
    narrowest = Math.min(narrowest, (r - l) / 2);
  }
  const neckHalf = Math.min(170, 0.85 * faceHalf, Math.max(80, Number.isFinite(narrowest) ? narrowest : 0.6 * faceHalf));

  // The hair's extent, and what it says: puffy or long hair sways, short hair hugs the skull.
  let hx0: number = FRAME.w, hx1 = 0, hy0: number = FRAME.h, hy1 = 0, hairPx = 0;
  for (let y = 0; y < FRAME.h; y += 2) {
    for (let x = 0; x < FRAME.w; x += 2) {
      if (kind[y * FRAME.w + x] !== Px.Hair) continue;
      hairPx++;
      hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); hy0 = Math.min(hy0, y); hy1 = Math.max(hy1, y);
    }
  }
  const faceW = Math.abs(P(454)[0] - P(234)[0]);
  const hairW = hairPx > 0 ? hx1 - hx0 : 0;
  const loose = hairPx > 0 && (hairW > faceW * 1.45 || hy1 > chinY);
  const hair = hairPx > 0
    ? { cx: (hx0 + hx1) / 2, cy: (hy0 + Math.min(hy1, chinY)) / 2, rx: Math.max(120, hairW / 2 + 10), ry: Math.max(120, (Math.min(hy1, chinY) - hy0) / 2 + 10), depth: loose ? 0.4 : 0.62, still: loose ? 0.95 : 1.1, sway: loose ? 1 : 0.08 }
    : { cx: midX, cy: P(LM.forehead)[1], rx: 200, ry: 160, depth: 0.62, still: 1.1, sway: 0 };

  return {
    mid: { x: midX, y: eyesY + 0.33 * span },
    eyes: [eyeL, eyeR],
    iris: { outer, inner: outer * 0.37, lookX: outer * 0.8, lookY: outer * 0.33 },
    mouth: { x: mouth.x, y: mouth.y, rx: Math.abs(P(LM.mouth.right)[0] - P(LM.mouth.left)[0]) / 2, ry: Math.max(26, (P(LM.mouth.bottom)[1] - P(LM.mouth.top)[1]) / 2 + 10) },
    brows: [brow(LM.browL), brow(LM.browR)],
    cheeks: [avg(LM.cheekL), avg(LM.cheekR)],
    nose: { x: P(LM.noseTip)[0], y: P(LM.noseTip)[1], bridgeTop: P(LM.noseBridge)[1] },
    chinY,
    // The mesh's chin is the chin's true bottom, lower than a hand-measured one: the neck is shorter under it.
    pivotY: chinY + 0.25 * span,
    neckBaseY: chinY + 0.33 * span,
    neckHalf,
    shoulderHalf: 260,
    hair,
    lashes: { count: 12, long: 16, short: 5 },
  };
}
