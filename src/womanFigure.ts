/**
 * womanFigure — the woman on the backdrop (docs 173 §8.3, 180): her portrait's
 * density map and its landmarks, measured on the photo; portraitFigure does the
 * rest (points, rig, arcs).
 *
 * @module avatar/womanFigure
 */
import { createPortraitFigure, type PortraitSpec } from './portraitFigure';
// The map is fetched when the face is worn (portraitMaps); the spec reads it there.
import { portraitMap } from './portraitMaps';

export const WOMAN_SPEC: PortraitSpec = {
  // Her particles take the photo's own colours, as his do.
  get map() { return portraitMap('woman'); },
  mid: { x: 257, y: 360 },
  eyes: [{ x: 182, y: 284, rx: 40, ry: 17 }, { x: 331, y: 286, rx: 40, ry: 17 }],
  iris: { outer: 15, inner: 5.5, lookX: 12, lookY: 5 },
  mouth: { x: 257, y: 439, rx: 60, ry: 38 },
  brows: [
    [[228, 250], [210, 244], [190, 239], [170, 234], [150, 237], [135, 247]],
    [[285, 252], [300, 250], [320, 234], [340, 229], [360, 230], [375, 234], [388, 244]],
  ],
  cheeks: [[190, 382], [325, 382]],
  nose: { x: 257, y: 345, bridgeTop: 270 },
  chinY: 520,
  pivotY: 600,
  neckBaseY: 620,
  neckHalf: 110,
  shoulderHalf: 260,
  hair: { cx: 257, cy: 110, rx: 300, ry: 170, depth: 0.38, still: 0.95, sway: 1 },
  lashes: { count: 13, long: 21, short: 6 },
};

export const WOMAN = createPortraitFigure(WOMAN_SPEC);
