/**
 * robotRecipes — the robots shipped with the Avatar Studio (doc 181 §12), as
 * recipes: a few numbers per robot, drawn into a density map by robotSpec. A
 * robot more is a recipe more; nothing is generated, nothing measured by hand.
 *
 * Coordinates are pixels of the portrait frame (514 × 740, doc 180): the eyes
 * sit near y 290, about 150 px apart, where the portraits' eyes are aligned, so
 * the face movements' sizes fit a robot as they fit a photo. Stay 70 px under
 * the top and 60 px inside the sides: the map fades out there.
 *
 * @module avatar/robotRecipes
 */

export type RobotRgb = readonly [number, number, number];

/** A gear: its centre and radius, frame pixels, and its count of teeth. */
export interface RobotGear { x: number; y: number; r: number; teeth: number }

export interface RobotRecipe {
  id: RobotId;
  /** The head: its outline, its size and the height of its centre. */
  head: { shape: 'box' | 'dome' | 'capsule'; w: number; h: number; cy: number };
  /** Round lenses, one visor band holding both, or square screens; `r` is an eye's half size. */
  eyes: { shape: 'lens' | 'visor' | 'square'; r: number; gap: number; y: number };
  mouth: { shape: 'grille' | 'slot' | 'speaker'; w: number; y: number };
  /** One antenna on top, or two that move like ears. */
  antenna: 'none' | 'single' | 'pair';
  gears: readonly RobotGear[];
  body: { neckW: number; shoulderW: number };
  /** The plates, the trim (seams, gears, stalks), and what glows (eyes, mouth, the antenna's tip). */
  colors: { metal: RobotRgb; trim: RobotRgb; glow: RobotRgb };
}

export const ROBOT_IDS = ['robot-rouage', 'robot-boulon', 'robot-pixel', 'robot-vapeur'] as const;
export type RobotId = (typeof ROBOT_IDS)[number];
export const isRobotId = (v: unknown): v is RobotId => typeof v === 'string' && (ROBOT_IDS as readonly string[]).includes(v);

export const ROBOT_RECIPES: Record<RobotId, RobotRecipe> = {
  'robot-rouage': {
    id: 'robot-rouage',
    head: { shape: 'box', w: 320, h: 300, cy: 320 },
    eyes: { shape: 'lens', r: 34, gap: 150, y: 292 },
    mouth: { shape: 'grille', w: 160, y: 410 },
    antenna: 'single',
    // Two gears where a person's ears would be.
    gears: [{ x: 87, y: 300, r: 44, teeth: 10 }, { x: 427, y: 300, r: 44, teeth: 10 }],
    body: { neckW: 90, shoulderW: 440 },
    colors: { metal: [150, 185, 215], trim: [85, 110, 145], glow: [110, 235, 255] },
  },
  'robot-boulon': {
    id: 'robot-boulon',
    head: { shape: 'dome', w: 330, h: 300, cy: 325 },
    eyes: { shape: 'visor', r: 30, gap: 150, y: 300 },
    mouth: { shape: 'slot', w: 130, y: 415 },
    antenna: 'pair',
    // One big gear on the chest.
    gears: [{ x: 257, y: 610, r: 56, teeth: 12 }],
    body: { neckW: 100, shoulderW: 460 },
    colors: { metal: [215, 145, 95], trim: [150, 90, 60], glow: [255, 205, 120] },
  },
  'robot-pixel': {
    id: 'robot-pixel',
    head: { shape: 'capsule', w: 280, h: 320, cy: 320 },
    eyes: { shape: 'square', r: 30, gap: 140, y: 295 },
    mouth: { shape: 'speaker', w: 90, y: 415 },
    antenna: 'none',
    // A gear for a crown.
    gears: [{ x: 257, y: 168, r: 50, teeth: 12 }],
    body: { neckW: 80, shoulderW: 400 },
    colors: { metal: [150, 225, 195], trim: [80, 150, 130], glow: [190, 255, 150] },
  },
  'robot-vapeur': {
    id: 'robot-vapeur',
    head: { shape: 'box', w: 300, h: 330, cy: 330 },
    eyes: { shape: 'lens', r: 28, gap: 150, y: 300 },
    mouth: { shape: 'grille', w: 140, y: 425 },
    antenna: 'single',
    // A clockwork head: three gears of different sizes.
    gears: [{ x: 115, y: 210, r: 34, teeth: 9 }, { x: 397, y: 220, r: 42, teeth: 10 }, { x: 412, y: 425, r: 30, teeth: 8 }],
    body: { neckW: 90, shoulderW: 450 },
    colors: { metal: [225, 190, 110], trim: [150, 115, 60], glow: [255, 175, 85] },
  },
};
