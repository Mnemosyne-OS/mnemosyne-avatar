/**
 * faceShapes — what a face on the backdrop can do, as data (doc 180).
 *
 * A face's movements are BLENDSHAPES: for each movement, every point carries
 * where it goes when that movement is at full strength (an offset, figure
 * units). The shader adds `weight × offset` for every movement, so a movement
 * costs one weight per frame and no logic; the animator (faceAnimator) decides
 * the weights. The offsets live in a float texture (packFaceShapes), not in
 * vertex attributes: WebGL gives a shader 16 attributes and the figure already
 * spends seven, so one attribute per movement stopped at five more.
 *
 * What is NOT a blendshape: what hides or shows points (the lids closing over
 * the eyes, FACE_PARTS) and the irises following the pointer, which the shader
 * handles with a few uniforms (FaceFrame).
 *
 * @module avatar/faceShapes
 */

/**
 * The movements, in texture order. Left and right are the viewer's (the
 * photo's), not hers. Adding one: an offset in the figure's rig, a line here,
 * and a recipe in the animator if something should play it.
 */
export const FACE_SHAPES = [
  'jawOpen',      // the jaw drops: lower lip and chin down, the upper lip lifts a little
  'lipsWide',     // the lips stretch (bright vowels: i, é)
  'lipsRound',    // the lips round and narrow (dark vowels: o, ou)
  'smileL',       // one corner up and out, its cheek up
  'smileR',
  'browUpL',      // a brow up, the forehead and the upper lid with it
  'browUpR',
  'browFrown',    // both brows down and drawn together (concentration)
  'browInnerUp',  // the inner ends of the brows up (worry, curiosity)
  'cheekRaise',   // the cheeks and the skin under the eyes up (a real smile, a squint)
  'mouthFrown',   // the corners of the mouth down
  'lipPress',     // the lips pressed together, thinner
  'headTilt',     // the head tilts towards the viewer's left (a negative weight, the other way)
  'earL',         // an animal's ear flicks out about its root (a negative weight: pricked up and in)
  'earR',
  'noseWrinkle',  // the nose wrinkles and the upper lip lifts in its middle (disgust; an animal's snarl, a sniff)
  'chinRaise',    // the chin pushes up and the lower lip with it (a pout, doubt, sadness held back)
  'mouthSide',    // the whole mouth slides towards the viewer's right (a negative weight, the left): doubt, a smirk's twist
  'breath',       // a breath in: the chest swells and rises, the shoulders most, the head a hair (a negative weight: breathed out under rest)
  'cheekPuff',    // the cheeks puffed out beside the mouth (a negative weight: sucked in, a fish face)
] as const;

export type FaceShapeId = (typeof FACE_SHAPES)[number];
export const FACE_SHAPE_COUNT = FACE_SHAPES.length;
/** A movement's index in a weights array. */
export const FS = Object.fromEntries(FACE_SHAPES.map((id, i) => [id, i])) as Record<FaceShapeId, number>;

/** How far a full head tilt (`headTilt` at 1) turns the head, in radians: light, a lean more than a swing. */
export const HEAD_TILT_RAD = 0.05;

/** The most movements the shader adds up (its loop bound, a compile-time constant); even, two per texel. */
export const FACE_SHAPE_MAX = 24;

/**
 * The points the shader shows or hides around the eyes. 0 = none. An iris
 * follows the pointer and hides under a closing lid; a lid's points (skin over
 * the eye's opening) show only where the lid covers it; a lash rides the
 * upper lid down; the photo's own points inside the eye's opening (the white
 * of the eye) hide under the lid too, or they would show through it.
 */
export const FACE_PARTS = { IRIS_L: 1, IRIS_R: 2, LID_L: 3, LID_R: 4, LASH_L: 5, LASH_R: 6, EYE_L: 7, EYE_R: 8, SHADE: 9, HAIR: 10 } as const;

/** An animal a face can be: each lives and feels in its own way (faceSpecies). A person has none. */
export type AnimalSpecies = 'cat' | 'dog' | 'bear' | 'lion';

/** The most gears a face may turn (doc 181 §12.3): the shader has one uniform each. */
export const GEAR_MAX = 4;

/** Where a face's eyes and mouth are, in figure units, for the shader. */
export interface FaceRig {
  /** Each eye's centre, half height (the lid comes down over that height) and half width. */
  eyes: ReadonlyArray<{ x: number; y: number; half: number; halfWidth: number }>;
  /** How far an iris travels when it looks to an edge: x, y. */
  look: [number, number];
  /** The line between the lips, and the mouth's half width. */
  mouth: { x: number; y: number; half: number };
  /**
   * The head turns and nods about `pivot` (the base of the neck, at the head's
   * depth). Points above `chin` turn all the way; below it the neck turns less
   * and less, down to `neckBase`, where the shoulders stay still.
   */
  head: { pivot: [number, number, number]; chin: number; neckBase: number };
  /** The face has ears that move (an animal's): the animator flicks them. */
  ears?: true;
  /** The animal this face is; absent on a person. */
  species?: AnimalSpecies;
  /** How far its ears may move (a labrador's hang: they lift and swing less than a shepherd's stand). */
  earRange?: readonly [number, number];
  /** A robot's gears, in figure units (doc 181 §12.3): their points turn about the centre; at most GEAR_MAX. */
  gears?: ReadonlyArray<{ x: number; y: number; r: number }>;
}

/** A face, this frame: what the animator hands the scene. */
export interface FaceFrame {
  /** One weight per FACE_SHAPES entry, -1..1. */
  weights: Float32Array;
  /** How far the lids are closed in a blink, 0..1 (both eyes). */
  blink: number;
  /** How far each eye narrows, 0..1: viewer's left, then right. */
  squint: [number, number];
  /** How far each eye's lid closes on its own, 0..1 (a wink): viewer's left, then right. */
  wink: [number, number];
  /** Where the irises look, -1..1 each (x right, y up). */
  look: { x: number; y: number };
  /** Where the head turns, in radians: yaw (towards the viewer's right) and pitch (up). */
  head: { yaw: number; pitch: number };
  /** How far the irises turn in towards the nose, 0..1 of their reach (a pointer between the eyes). */
  cross: number;
  /** How hard the points tremble, 0..1: waking up (a shiver), or a cat's purr; each one on its own, fast and tiny. */
  tremble: number;
  /** She is speaking (a breath after included): she faces the person, the pointer no longer leads. */
  talking: boolean;
  /** How deep asleep, 0..1: her eyes shut, her head lowers, her points dim one by one. */
  sleep: number;
  /**
   * How far a robot's gears have turned, in radians (doc 181 §12.3): it grows while the face speaks
   * or thinks, and stays put at rest. Absent: still.
   */
  gearTurn?: number;
}

/** Texels per row of the shapes texture. */
export const FACE_TEXTURE_WIDTH = 2048;

/**
 * The offsets of every point for every movement, as an RGBA float texture's
 * data: point i owns `pairs` texels in a row, two movements per texel (x, y of
 * one, then x, y of the next). `shapes` is n × FACE_SHAPE_COUNT × 2.
 */
export function packFaceShapes(shapes: Float32Array, n: number): { data: Float32Array; width: number; height: number; pairs: number } {
  const pairs = Math.ceil(FACE_SHAPE_COUNT / 2);
  const texels = n * pairs;
  const width = FACE_TEXTURE_WIDTH;
  const height = Math.max(1, Math.ceil(texels / width));
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < FACE_SHAPE_COUNT; s++) {
      const texel = i * pairs + (s >> 1);
      const at = texel * 4 + (s & 1) * 2;
      data[at] = shapes[(i * FACE_SHAPE_COUNT + s) * 2] ?? 0;
      data[at + 1] = shapes[(i * FACE_SHAPE_COUNT + s) * 2 + 1] ?? 0;
    }
  }
  return { data, width, height, pairs };
}
