/**
 * faceAnimator — what a face on the backdrop does, frame by frame (doc 180).
 *
 * One place decides every movement's weight (FACE_SHAPES), the blink, the
 * squint and where the eyes look; the scene only draws what it is handed.
 * Three sources feed it:
 *  - her VOICE: the jaw and the lips follow the loudness and the vowel
 *    (mouthModel), and a stressed syllable sometimes flashes her brows;
 *  - the POINTER: her eyes follow it, with the small jumps real eyes make
 *    (saccades), and a big jump of the gaze brings a blink, as it does in life;
 *    the head turns only part of the way (HEAD_FOLLOW), the eyes do the rest;
 *    a pointer resting between her eyes makes them cross a little, then smile;
 *    a pointer gone still for a while (WAIT_AFTER_S) and she waits like someone
 *    who waits: her gaze wanders all over, her head goes with it, she fidgets
 *    more often (a light sway of the head, a sigh, a glance), and when the
 *    pointer moves again her brows lift, as if to say « ah, there you are »;
 *    A pointer RUSHING at her face makes her dodge (a start, the head alone
 *    away and back, the eyes still on it); one coming SLOWLY and staying near
 *    a cheek is a caress: her eyes close, her head leans into it, and after a
 *    moment she opens them again and smiles.
 *    While she SPEAKS she looks at the person she speaks to, in the middle,
 *    and the pointer no longer leads her eyes, her head or her body;
 *  - her own LIFE: blinks at irregular moments, and every few seconds a
 *    gesture from her repertoire (a brow raise, a smile, a squint, a curious
 *    tilt, a pensive press of the lips…), never two on top of each other;
 *    and when she wakes (the face appears, or the app comes back after a long
 *    while away), a short waking: eyes shut, lids fluttering while her points
 *    tremble, the eyes open, a long « ooh » breathed out.
 *
 * A gesture is a RECIPE: weights for some movements, held by an envelope (up,
 * held, down). The same recipes are what the app can play on purpose
 * (`express`): an emotion is a recipe, not code.
 *
 * Pure apart from `random`, which the tests pin.
 *
 * @module avatar/faceAnimator
 */
import { FACE_SHAPE_COUNT, FS, type AnimalSpecies, type FaceFrame, type FaceShapeId } from './faceShapes';
import { createMusicLife, type MusicHeard } from './faceMusic';
import { settle } from './motion';
import { mouthShape } from './mouthModel';
import { speechExpression, toneOf } from './speechTone';
import { createFaceMood, drowsiness, gestureGapScale, gladness, lowness, type Mood, type MoodNudge } from './faceMood';
import { envelope, G, pick, side, type Gesture, type Phase, type Random } from './faceGesture';
import { EMOTION_MOOD, EMOTIONS, type EmotionId } from './faceEmotions';
import { ANIMAL_FED_UP, FED_UP, GRIMACE_IDS, GRIMACE_ROW_S, GRIMACES, GRIMACES_BEFORE_FED_UP, SCENES, type GrimaceId, type SceneId } from './faceScenes';
import { createMicroLife } from './faceMicro';
import { ANIMAL_MOVES, SPECIES, speciesTone, type AnimalContext, type AnimalMoveId } from './faceSpecies';
import { createRng } from './brainCloud';

export type { Gesture } from './faceGesture';
export { envelope } from './faceGesture';

/**
 * The repertoire. Each recipe draws its own variation (strength, side, timing),
 * so the same gesture is never played twice identically.
 */
export const EXPRESSIONS = {
  browRaise: rnd => { const a = pick(rnd, 0.5, 1); return { weights: { browUpL: a, browUpR: a }, rise: 0.25, hold: pick(rnd, 0.3, 1.1), fall: 0.5 }; },
  browRaiseOne: rnd => {
    const a = pick(rnd, 0.6, 1), one = side(rnd);
    return { weights: { browUpL: one > 0 ? a : 0.2 * a, browUpR: one > 0 ? 0.2 * a : a }, rise: 0.25, hold: pick(rnd, 0.4, 1.2), fall: 0.5 };
  },
  smile: rnd => { const a = pick(rnd, 0.6, 1); return { weights: { smileL: a, smileR: a * pick(rnd, 0.85, 1) }, rise: 0.7, hold: pick(rnd, 2, 4), fall: 1.2 }; },
  // Joy, never a bigger smile: the mouth opens on it (the teeth show), the cheeks high, the eyes
  // crinkled, the brows lifted, the head up with a light bounce. A smile keeps its lips closed.
  joy: rnd => {
    const a = pick(rnd, 0.9, 1);
    return {
      weights: { smileL: a, smileR: a, cheekRaise: 0.85, jawOpen: 0.22, lipsWide: 0.45, browUpL: 0.25, browUpR: 0.25, browInnerUp: 0.1 },
      squint: { left: 0.75, right: 0.75, lag: 0.04 }, head: { yaw: 0, pitch: 0.3 }, pulse: { hz: 1.6, pitch: 0.08 }, mouth: true,
      rise: 0.4, hold: pick(rnd, 2, 3), fall: 1.1,
    };
  },
  squint: rnd => {
    const a = pick(rnd, 0.6, 1), uneven = rnd() < 0.35 ? pick(rnd, 0.45, 0.75) : 1, weak = side(rnd);
    return {
      weights: {}, squint: { left: weak > 0 ? a * uneven : a, right: weak > 0 ? a : a * uneven, lag: pick(rnd, 0.08, 0.22) * side(rnd) },
      rise: 0.35, hold: pick(rnd, 0.8, 1.7), fall: 0.6,
    };
  },
  curious: rnd => {
    const s = side(rnd);
    return {
      weights: { headTilt: s * pick(rnd, 0.5, 0.9), browUpL: s > 0 ? 0.5 : 0.15, browUpR: s > 0 ? 0.15 : 0.5, browInnerUp: 0.25 },
      rise: 0.6, hold: pick(rnd, 1.5, 2.5), fall: 0.9,
    };
  },
  pensive: rnd => {
    const s = side(rnd);
    return {
      weights: { lipPress: 0.55, mouthSide: -0.2 * s, browFrown: 0.3 }, look: { x: -0.55 * s, y: 0.5 }, head: { yaw: -0.35 * s, pitch: 0.2 }, mouth: true,
      rise: 0.7, hold: pick(rnd, 1.5, 3), fall: 1,
    };
  },
  // A glance aside: the eyes go first, the head turns to three quarters, holds, comes back.
  glance: rnd => {
    const s = side(rnd);
    return { weights: {}, look: { x: 0.5 * s, y: 0 }, head: { yaw: pick(rnd, 0.6, 1) * s, pitch: pick(rnd, -0.2, 0.2) }, rise: 0.6, hold: pick(rnd, 1, 2.2), fall: 0.9 };
  },
  smirk: rnd => {
    const s = side(rnd), a = pick(rnd, 0.55, 0.8);
    return { weights: { smileL: s > 0 ? a : 0, smileR: s > 0 ? 0 : a, cheekRaise: 0.15 }, rise: 0.4, hold: pick(rnd, 1, 2), fall: 0.8 };
  },
  doubt: rnd => {
    const s = side(rnd);
    return {
      weights: { mouthFrown: 0.3, chinRaise: 0.25, mouthSide: 0.2 * s, browUpL: s > 0 ? 0.6 : 0, browUpR: s > 0 ? 0 : 0.6, headTilt: -s * 0.3 }, mouth: true,
      rise: 0.5, hold: pick(rnd, 1, 1.6), fall: 0.8,
    };
  },
  concentrate: rnd => ({
    weights: { browFrown: 0.55, lipPress: 0.3 }, squint: { left: 0.3, right: 0.3, lag: 0 }, mouth: true,
    rise: 0.6, hold: pick(rnd, 1.5, 2.5), fall: 0.9,
  }),
  // Played on purpose only, never at random.
  // Surprise: quick and short (it never lasts), the head drawn back.
  surprise: () => ({ weights: { browUpL: 1, browUpR: 1, browInnerUp: 0.3, jawOpen: 0.3 }, head: { yaw: 0, pitch: 0.3 }, mouth: true, rise: 0.12, hold: 0.6, fall: 0.7 }),
  // Sadness: the inner brows up, the corners of the mouth down, the eyes and the head lowered, the lids heavy.
  sad: rnd => ({ weights: { browInnerUp: 0.75, browFrown: 0.25, mouthFrown: 0.5, chinRaise: 0.25, headTilt: 0.2 * side(rnd) }, look: { x: 0, y: -0.4 }, head: { yaw: 0, pitch: -0.35 }, lid: 0.15, mouth: true, rise: 1, hold: 2, fall: 1.2 }),
  emphasis: () => ({ weights: { browUpL: 0.45, browUpR: 0.45 }, rise: 0.12, hold: 0.12, fall: 0.35 }),
  // An animal's ears: one flicks out and back, quick; both prick up (waking, a pointer back).
  earFlickL: rnd => ({ weights: { earL: pick(rnd, 0.6, 1) }, rise: 0.06, hold: pick(rnd, 0.03, 0.12), fall: 0.22 }),
  earFlickR: rnd => ({ weights: { earR: pick(rnd, 0.6, 1) }, rise: 0.06, hold: pick(rnd, 0.03, 0.12), fall: 0.22 }),
  earsPerk: rnd => ({ weights: { earL: -0.6, earR: -0.6 }, rise: 0.15, hold: pick(rnd, 0.6, 1.2), fall: 0.5 }),
  // A light sway, shoulder to shoulder, for a few seconds: someone listening to music.
  sway: rnd => ({ weights: {}, swing: { hz: pick(rnd, 0.45, 0.65), amp: pick(rnd, 0.45, 0.65) }, rise: 0.8, hold: pick(rnd, 3, 5), fall: 1 }),

} satisfies Record<string, (rnd: Random) => Gesture>;

export type ExpressionId = keyof typeof EXPRESSIONS;

/** An expression's recipe, as a Gesture maker. */
const recipe = (id: ExpressionId): ((rnd: Random) => Gesture) => EXPRESSIONS[id];

/**
 * Movements in several phases, like a camera move rather than a pose: each next
 * phase starts while the one before is falling back, so they flow into one
 * another instead of following each other. They suit a person and an animal
 * alike (only the head, the gaze, the brows, a smile and the lips move).
 */
export const SEQUENCES = {
  // The head tilts, lowers a little, the eyes go down and aside; then she comes back up, a brow lifting.
  ponder: rnd => {
    const s = side(rnd);
    return [
      { at: 0, g: G({ headTilt: 0.55 * s, lipPress: 0.2 }, 0.9, pick(rnd, 1.2, 2), 1.1, { head: { yaw: 0.15 * s, pitch: -0.9 }, look: { x: 0.35 * s, y: -0.7 }, mouth: true }) },
      { at: 2.6, g: G({ browUpL: s > 0 ? 0.55 : 0.2, browUpR: s > 0 ? 0.2 : 0.55 }, 0.4, 0.6, 0.7, { look: { x: 0, y: 0.15 } }) },
    ];
  },
  // Eyes down, a little shy; then up to the side, with the start of a smile.
  shyGlance: rnd => {
    const s = side(rnd);
    return [
      { at: 0, g: G({ browInnerUp: 0.2 }, 0.6, pick(rnd, 0.8, 1.4), 0.8, { head: { yaw: 0, pitch: -0.7 }, look: { x: 0.1 * s, y: -0.8 } }) },
      { at: 1.5, g: G({ smileL: 0.45, smileR: 0.4 }, 0.6, pick(rnd, 0.8, 1.4), 0.9, { head: { yaw: 0.3 * s, pitch: 0.1 }, look: { x: 0.6 * s, y: 0.1 } }) },
    ];
  },
  // A tilt one way, brows up, then the other way, smaller: a dog listening.
  listen: rnd => {
    const s = side(rnd);
    return [
      { at: 0, g: G({ headTilt: 0.8 * s, browInnerUp: 0.35, browUpL: 0.3, browUpR: 0.3 }, 0.5, pick(rnd, 0.6, 1), 0.6) },
      { at: 1.3, g: G({ headTilt: -0.55 * s, browInnerUp: 0.25 }, 0.5, pick(rnd, 0.5, 0.9), 0.7) },
    ];
  },
  // Up and aside, thinking; then back to the person, with a smile, as if the thought came.
  ideaComes: rnd => {
    const s = side(rnd);
    return [
      { at: 0, g: G({ lipPress: 0.35, browFrown: 0.2 }, 0.7, pick(rnd, 1, 1.8), 0.7, { head: { yaw: -0.2 * s, pitch: 0.6 }, look: { x: -0.5 * s, y: 0.6 }, mouth: true }) },
      { at: 2, g: G({ smileL: 0.7, smileR: 0.65, browUpL: 0.4, browUpR: 0.4 }, 0.4, pick(rnd, 1, 1.6), 1, { mouth: true }) },
    ];
  },
  // A sigh (a breath in at least twice a usual one, then a slower breath out): the chest swells and
  // the head lifts; then the air goes out through rounded lips, the chest sinks under its rest and
  // the head dips, then comes back up.
  sigh: rnd => [
    { at: 0, g: G({ breath: 1, browInnerUp: 0.25 }, 0.55, 0.15, 0.5, { head: { yaw: 0, pitch: 0.3 } }) },
    { at: 0.65, g: G({ breath: -0.55, lipsRound: 0.45, jawOpen: 0.12, browInnerUp: 0.35 }, 0.6, pick(rnd, 0.5, 0.9), 1.3, { head: { yaw: 0, pitch: -0.6 }, look: { x: 0, y: -0.3 }, mouth: true }) },
  ],
  // Two small nods, the second softer.
  nod: rnd => [
    { at: 0, g: G({ browUpL: 0.15, browUpR: 0.15 }, 0.25, 0.1, 0.3, { head: { yaw: 0, pitch: -0.8 } }) },
    { at: 0.55, g: G({}, 0.25, 0.08, 0.35, { head: { yaw: 0, pitch: -0.5 * pick(rnd, 0.8, 1.1) } }) },
  ],
  // She looks around the room: one side, slowly, then the other, then back.
  lookAround: rnd => {
    const s = side(rnd);
    return [
      { at: 0, g: G({}, 0.8, pick(rnd, 0.6, 1), 0.8, { head: { yaw: 0.9 * s, pitch: 0.1 }, look: { x: 0.7 * s, y: 0.05 } }) },
      { at: 1.8, g: G({ browUpL: 0.15, browUpR: 0.15 }, 0.9, pick(rnd, 0.6, 1), 0.9, { head: { yaw: -0.9 * s, pitch: -0.1 }, look: { x: -0.7 * s, y: -0.1 } }) },
    ];
  },
  // The head lowers slowly on a breath out, then lifts, the eyes opening wide.
  lowerAndLift: rnd => [
    { at: 0, g: G({ lipsRound: 0.25, browInnerUp: 0.3 }, 1, pick(rnd, 0.5, 0.9), 0.9, { head: { yaw: 0, pitch: -1 }, look: { x: 0, y: -0.6 }, mouth: true }) },
    { at: 1.9, g: G({ browUpL: 0.5, browUpR: 0.5 }, 0.4, 0.5, 0.8, { head: { yaw: 0, pitch: 0.3 }, look: { x: 0, y: 0.25 } }) },
  ],
} satisfies Record<string, (rnd: Random) => Phase[]>;

export type SequenceId = keyof typeof SEQUENCES;
/** What the face can play: a single expression, a sequence, an emotion (faceEmotions), an animal's own (faceSpecies). */
export type MoveId = ExpressionId | SequenceId | EmotionId | AnimalMoveId | SceneId | GrimaceId;
const isSequence = (id: MoveId): id is SequenceId => id in SEQUENCES;
const isEmotion = (id: MoveId): id is EmotionId => id in EMOTIONS;
const isAnimalMove = (id: MoveId): id is AnimalMoveId => id in ANIMAL_MOVES;
const isScene = (id: MoveId): id is SceneId => id in SCENES;
const isGrimace = (id: MoveId): id is GrimaceId => id in GRIMACES;
const ANY_ANIMAL: AnimalContext = { tilt: 1 };
/** A move's phases (one for a single expression), drawn now; an animal's draw with its own side. */
const phasesOf = (id: MoveId, rnd: Random, ctx: AnimalContext = ANY_ANIMAL): Phase[] =>
  isSequence(id) ? SEQUENCES[id](rnd) : isEmotion(id) ? EMOTIONS[id](rnd) : isAnimalMove(id) ? ANIMAL_MOVES[id](rnd, ctx) : isScene(id) ? SCENES[id](rnd) : isGrimace(id) ? GRIMACES[id](rnd) : [{ at: 0, g: recipe(id)(rnd) }];
/** Whether a move moves the mouth anywhere in it: not while she speaks. */
const movesMouth = (id: MoveId): boolean => phasesOf(id, () => 0.5).some(p => p.g.mouth);
/** Every move there is, by name: a name from elsewhere (an animal's table) is checked against it. */
export const isMoveId = (id: string): id is MoveId => id in EXPRESSIONS || id in SEQUENCES || id in EMOTIONS || id in ANIMAL_MOVES || id in SCENES || id in GRIMACES;
/** A move's whole length, its last phase ended. */
const lengthOf = (phases: Phase[]): number => Math.max(...phases.map(p => p.at + p.g.rise + p.g.hold + p.g.fall));

/** What she does on her own, and how often, relative to the rest. */
const IDLE: ReadonlyArray<[MoveId, number]> = [
  ['browRaise', 2.5], ['browRaiseOne', 1], ['smile', 2], ['joy', 1], ['squint', 1.5],
  ['curious', 1], ['pensive', 1], ['smirk', 1], ['doubt', 0.6], ['concentrate', 0.6], ['glance', 1.5],
  ['ponder', 1.5], ['shyGlance', 1], ['listen', 1.2], ['ideaComes', 1.2], ['nod', 1], ['lookAround', 1.2], ['lowerAndLift', 0.8],
  ['sway', 0.8],
  // A daydream (faceScenes); the quiet emotions, now and then (the strong ones are played on purpose only).
  ['daydream', 0.4], ['interest', 0.8], ['amused', 0.4], ['tender', 0.4], ['relief', 0.3], ['confusion', 0.3],
  // A giggle, a wink: only as she is glad (GLAD_ONLY). Never a laugh on her own: a laugh at nothing
  // reads as something wrong; it waits for something truly funny to answer.
  ['giggle', 0.3], ['wink', 0.15],
];
/** The last moves she played: never one of them again straight away. */
const NO_REPEAT = 2;

/** Seconds between two gestures of her own, beyond the gesture itself. */
const IDLE_GAP: [number, number] = [3, 9];
/** Seconds between blinks (60 % fewer than a first, busier take); one in this many is a double blink. */
const BLINK_GAP: [number, number] = [6, 17.5];
const DOUBLE_BLINK = 0.15;
const BLINK_S = 0.2;
/** How much larger than the voice's own measure the jaw opens and the lips shape a vowel while she speaks. */
const SPEECH_JAW = 1.35, SPEECH_LIPS = 1.5;
/** Seconds for the mouth to follow her voice: opening on a syllable, closing after it, shaping a vowel. */
const MOUTH_OPEN_S = 0.04, MOUTH_CLOSE_S = 0.1, MOUTH_SHAPE_S = 0.06;
/** Seconds for the eyes to catch up with the pointer (eyes jump, the head takes its time), and for a saccade. */
const LOOK_S = 0.12, SACCADE_S = 0.05;
/** How far the head turns at most: to three quarters, and a little nod. Radians. */
export const HEAD_YAW = 0.48, HEAD_PITCH = 0.15;
/**
 * How much of the pointer's turn the head takes, at most, as a share of its full
 * turn: a face turns a little and the eyes do the rest, as a real face does.
 * A gesture's own turn (a glance) stays within it too.
 */
export const HEAD_FOLLOW = 0.35;
/** How far a gesture itself may nod or lower the head, as a share of its full nod: past the pointer's cap. */
const GESTURE_PITCH = 1.2;
/** The head follows on a critically damped spring: this many seconds to most of the way, fluid, never a snap. */
const HEAD_S = 0.9;
/** While the head catches up, the eyes come back towards the middle by this share of its turn. */
const EYES_RECENTER = 0.75;
/** A smile narrows the eyes a little (a real smile does), and a squint lifts the cheeks. */
const SMILE_SQUINT = 0.35, SQUINT_CHEEK = 0.35;
/** A caress: the pointer within this many eye spacings of the face, slower than this (spacings a second), this long. */
const CARESS_R = 1.4, CARESS_SPEED = 0.8, CARESS_AFTER_S = 0.6;
/** How fast she gives in to it, and comes back out of it; how far her lids close, her head leans. */
const CARESS_IN_S = 0.6, CARESS_OUT_S = 0.35, CARESS_LID = 0.88, CARESS_TILT = 0.55;
/** Her eyes stay shut this long under the caress, then open again over CARESS_OPEN_S, on a wider smile. */
const CARESS_SHUT_S = 2, CARESS_OPEN_S = 0.5, CARESS_SMILE = 0.3, CARESS_SMILE_OPEN = 0.65;
/** A dodge: the pointer within this many spacings, coming closer faster than this; then a rest before another. */
const DODGE_R = 2.2, DODGE_SPEED = 3, DODGE_REST_S = 1.6;
/** How far a dodge turns the head away and lifts it back (shares of their full turn), how far it tilts. */
const DODGE_YAW = 0.5, DODGE_PITCH = 0.45, DODGE_TILT = 0.25;
/** How long after her voice stops she still faces the person (the pauses between words); the middle she looks at. */
const TALK_HOLD_S = 1.5;
/**
 * A robot's gears (doc 181 §12.3): how fast they turn while it speaks or thinks (radians per
 * second, about a turn in four seconds), how long they take to start and to stop, and the
 * thinking below which they stop (it fades out slowly, they would creep for a minute).
 */
export const GEAR_SPEED = 1.6, GEAR_EASE_S = 0.6, GEAR_THINK_FLOOR = 0.05;
const CENTRE = { x: 0, y: 0 };
/** The pointer still this long: she starts waiting. Her gaze then jumps to a new spot every so often, sometimes back to the middle. */
export const WAIT_AFTER_S = 20;
const WANDER_GAP: [number, number] = [0.7, 2.6], WANDER_HOME = 0.25;
/** While she waits, a gesture of her own comes sooner; these, more than the others. */
const WAIT_GAP: [number, number] = [1.2, 3.5];
/** A wide yawn while she waits only after a long quiet: twenty seconds still is someone reading, not someone gone. */
const YAWN_QUIET_S = 150;
/**
 * The yawns, a person's and an animal's: never while the person speaks to her (FaceInput.hearing).
 * One already playing when they start fades out over YAWN_CUT_S, rather than snapping shut.
 */
const YAWNS: ReadonlySet<MoveId> = new Set<MoveId>(['yawn', 'yawnLong']);
export const YAWN_CUT_S = 0.4;
const WAIT_IDLE: ReadonlyArray<[MoveId, number]> = [
  ['lookAround', 2], ['lowerAndLift', 1.2], ['ponder', 1],
  ['sway', 2], ['sigh', 2], ['glance', 1.5], ['curious', 1.5], ['browRaiseOne', 1], ['pensive', 1], ['squint', 1], ['smirk', 0.5],
  ['bored', 1.2], ['daydream', 1], ['yawnLong', 0.4],
];
/** While she speaks, now and then she looks up and aside as if thinking: the first after this, then this often. */
const THINK_FIRST: [number, number] = [2, 4], THINK_GAP: [number, number] = [4, 9];
/** That pensive look: the eyes up and to one side, the head lifted a little, a brow; never the mouth (the voice's). */
const thinkUp = (rnd: Random): Gesture => {
  const s = side(rnd);
  return { weights: { browUpL: s > 0 ? 0.3 : 0.12, browUpR: s > 0 ? 0.12 : 0.3 }, look: { x: 0.45 * s, y: 0.65 }, head: { yaw: 0.12 * s, pitch: 0.3 }, rise: 0.45, hold: pick(rnd, 0.8, 1.6), fall: 0.6 };
};
/** Nothing from the person this long (no pointer, no key, no voice): she falls asleep, slowly (SLEEP_IN_S). */
export const SLEEP_AFTER_S = 300;
const SLEEP_IN_S = 12, SLEEP_OUT_S = 0.4;
/** Asleep: her lids shut, her head lowers (a share of its full nod) and leans, her eyes go down, she breathes. */
const SLEEP_PITCH = -0.55, SLEEP_TILT = 0.35, SLEEP_LOOK_Y = -0.4, SLEEP_BREATH = 0.06;
/**
 * Deep asleep, she dreams now and then (REM sleep): her eyes dart under her closed lids in bursts
 * (both together, smaller and slower than awake), a brow or a corner of her mouth twitches; an
 * animal's ears and nose twitch, a dog « woofs » with its jaw. A night's REM comes every 90 min;
 * here it comes far oftener, so a sleeping face is seen dreaming: the first after this long
 * asleep, then this often, each lasting this long; a dart every so often, a twitch every so often.
 */
const REM_FIRST: [number, number] = [8, 20], REM_GAP: [number, number] = [25, 70], REM_LEN: [number, number] = [5, 12];
const REM_DART: [number, number] = [0.15, 0.45], REM_TWITCH: [number, number] = [0.9, 2.8], REM_DART_S = 0.04;
/** A dreaming twitch, a person's or an animal's (never a person's smile on an animal). */
const dreamTwitch = (rnd: Random, species: AnimalSpecies | undefined): Gesture => {
  const quick = (weights: Gesture['weights'], more: Partial<Gesture> = {}): Gesture => ({ weights, rise: 0.05, hold: pick(rnd, 0.03, 0.1), fall: 0.15, ...more });
  const r = rnd();
  if (!species) {
    if (r < 0.35) return quick(side(rnd) > 0 ? { browUpL: 0.3 } : { browUpR: 0.3 });
    if (r < 0.55) return { weights: { smileL: 0.3, smileR: 0.25 }, rise: 0.4, hold: pick(rnd, 0.4, 0.9), fall: 0.8 };
    if (r < 0.75) return quick({ lipPress: 0.2, mouthSide: 0.15 * side(rnd) });
    return quick({ browInnerUp: 0.25 });
  }
  if (r < 0.45 && species !== 'lion') return quick(side(rnd) > 0 ? { earL: 0.6 } : { earR: 0.6 });
  if (r < 0.7) return quick({ noseWrinkle: 0.25 });
  if (species === 'dog' && r < 0.9) return quick({ jawOpen: 0.18, lipsWide: 0.1 }, { mouth: true });
  return quick({ lipsWide: 0.12 }, { mouth: true });
};
/**
 * An answer being written and not yet spoken: she thinks. Her eyes leave the person, up and to
 * one side, and move from one spot to another there as eyes do while thinking; her lips press a
 * little, a brow draws. How fast she goes into it and out; how often her eyes move on.
 */
const THINK_IN_S = 0.35, THINK_OUT_S = 0.5, THINK_SPOT_GAP: [number, number] = [0.8, 2.2];
/**
 * A long thought (an answer written without a voice): past this, her eyes come back to the
 * person now and then (this share of their moves), as people check in while they think; a
 * thinking look-away lasts about 3.5 s (Andrist et al. 2013).
 */
const THINK_CHECK_AFTER_S = 3.5, THINK_CHECK_IN = 0.3;
/** The thought come shows only after a real thought (this long), and not again this soon: between two spoken sentences the stream can make her « think » again for a moment. */
const THOUGHT_MIN_S = 1.5, THOUGHT_REST_S = 8;
type ThinkWay = 'up' | 'down' | 'side' | 'recall';
/**
 * Where thinking eyes go (Andrist et al. 2013, people thinking before they answer): up 39 %
 * of the time, down 29 %, to the side the rest; each thought keeps its way.
 */
const thinkSpotOf = (rnd: Random, way: ThinkWay, s: number) =>
  // Searching her memory (§44): clearly up AND to her side, never only one of them.
  way === 'recall' ? { x: s * pick(rnd, 0.45, 0.75), y: pick(rnd, 0.45, 0.75) }
  : way === 'up' ? { x: s * pick(rnd, 0.25, 0.65), y: pick(rnd, 0.4, 0.75) }
    : way === 'down' ? { x: s * pick(rnd, 0.25, 0.6), y: -pick(rnd, 0.35, 0.65) }
      : { x: s * pick(rnd, 0.55, 0.85), y: pick(rnd, -0.1, 0.15) };
/**
 * Starting to speak, people look away first (73 % of turns, Andrist et al. 2013) and come back
 * to the listener about a second in (Ho et al. 2015): this often, this long.
 */
const TURN_LOOK_AWAY = 0.7, TURN_AWAY_HOLD: [number, number] = [0.5, 1];
/** How far the head goes with her thinking eyes (a share of its full turn), and her brow and lips meanwhile. */
const THINK_HEAD_YAW = 0.18, THINK_HEAD_PITCH = 0.12, THINK_FROWN = 0.18, THINK_PRESS = 0.22;
/**
 * Searching her memory (doc 180 §44): the brow on the side her eyes went first moves a little
 * (up and back down, a flicker), then lifts and stays up until the thought ends. The flicker:
 * how high, when it starts, its rise, hold and fall; the lift: how high, when, over how long.
 */
export const THINK_BROW_FLICK = 0.18, THINK_BROW_FLICK_AT: readonly [number, number, number, number] = [0.25, 0.15, 0.08, 0.22];
export const THINK_BROW_LIFT = 0.42, THINK_BROW_LIFT_AT = 0.85, THINK_BROW_LIFT_S = 0.5;
/** The brow of a thought, `age` seconds into it (0 to THINK_BROW_LIFT): the flicker, then the lift. */
export function thinkBrow(age: number): number {
  const [at, rise, hold, fall] = THINK_BROW_FLICK_AT;
  const x = Math.max(0, Math.min(1, (age - THINK_BROW_LIFT_AT) / THINK_BROW_LIFT_S));
  return Math.max(THINK_BROW_FLICK * envelope(age - at, rise, hold, fall), THINK_BROW_LIFT * x * x * (3 - 2 * x));
}
/** The thought come (the answer is there): a quick lift of the brows and the start of a smile, the mouth left alone. */
const thoughtCame = (): Gesture => ({ weights: { browUpL: 0.35, browUpR: 0.35, smileL: 0.25, smileR: 0.22 }, rise: 0.2, hold: 0.35, fall: 0.6 });
/** Her mood on her resting face: a hint of a smile when glad, of worry when low (faceMood). */
const MOOD_SMILE = 0.2, MOOD_CHEEK = 0.1, MOOD_WORRY = 0.25, MOOD_FROWN = 0.12;
/** Which of her own gestures her mood favours: glad ones, low ones, drowsy ones (each weight times 1 + 2 x how much). */
const GLAD_MOVES: ReadonlySet<MoveId> = new Set<MoveId>(['smile', 'joy', 'smirk', 'shyGlance', 'ideaComes', 'sway', 'nod', 'amused', 'tender', 'relief', 'slowBlink', 'playFace', 'animalTender', 'pant']);
const LOW_MOVES: ReadonlySet<MoveId> = new Set<MoveId>(['sigh', 'pensive', 'lowerAndLift', 'ponder', 'bored', 'animalBored', 'puppyEyes']);
const DROWSY_MOVES: ReadonlySet<MoveId> = new Set<MoveId>(['sigh', 'lowerAndLift', 'sway', 'bored', 'yawn', 'animalBored', 'yawnLong', 'daydream']);
/** An animal glad: softer eyes (a cat, a lion), ears relaxed back (a dog, a bear); low: ears back, the head lower. */
const ANIMAL_GLAD_LID = 0.4, ANIMAL_GLAD_EARS = 0.3, ANIMAL_LOW_EARS = 0.4, ANIMAL_LOW_HEAD = -0.25;
/** A cat stroked purrs: its points tremble this much, swelling with its breath. */
const PURR = 0.2;
/** Not while she speaks: nobody daydreams mid-sentence. */
const NOT_WHILE_TALKING: ReadonlySet<MoveId> = new Set<MoveId>(['daydream']);
/** Never at a neutral mood, only as she is glad: a chuckle, a laugh or a wink at nothing reads as strange. */
const GLAD_ONLY: ReadonlySet<MoveId> = new Set<MoveId>(['amused', 'laugh', 'giggle', 'wink']);

/** A pointer between her eyes: how long it rests before they cross, how far they cross (a share of the iris's reach), how fast. */
const CROSS_AFTER_S = 0.25, CROSS = 0.45, CROSS_S = 0.18;
/** …and how long they stay crossed before she smiles at it; the pointer must leave this long before it plays again. */
const CROSS_SMILE_AFTER_S = 0.9, CROSS_RESET_S = 0.6;

/**
 * The waking, in seconds from its start: eyes shut, then the lids flutter half
 * open while the head shivers, then the eyes open, then a long « ooh » breathed
 * out. `WAKE_S` is its whole length; her own gestures and blinks wait for it.
 */
const WAKE = { shut: 0.7, flutter: 1.0, open: 0.4, oohAt: 2.0, ooh: [0.35, 0.6, 0.7] as const };
export const WAKE_S = WAKE.oohAt + WAKE.ooh[0] + WAKE.ooh[1] + WAKE.ooh[2];
/**
 * The flutter's beat (Hz) and how far the lids lift in it. The shiver is mostly in the points
 * (the scene trembles each one, `shiver`); the head itself only sways a hair, slowly: a head
 * that shook read as a seizure.
 */
const FLUTTER_HZ = 7, FLUTTER_OPEN = 0.45, SHIVER_HZ = 3, SHIVER_RAD = 0.006;

/** Where the waking leaves the lids (1 shut) and the head's shiver, `a` seconds in; null once awake. */
export function wakeAt(a: number): { lid: number; shiver: number; tremble: number; ooh: number } | null {
  if (a >= WAKE_S) return null;
  const ease = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  let lid = 1, shiver = 0, tremble = 0;
  if (a < WAKE.shut) lid = 1;
  else if (a < WAKE.shut + WAKE.flutter) {
    const f = (a - WAKE.shut) / WAKE.flutter;
    // The lids part a little more with each beat, never fully.
    lid = 1 - FLUTTER_OPEN * f * (0.5 + 0.5 * Math.sin(2 * Math.PI * FLUTTER_HZ * (a - WAKE.shut) - Math.PI / 2));
    tremble = Math.sin(Math.PI * f);
    shiver = SHIVER_RAD * Math.sin(2 * Math.PI * SHIVER_HZ * a) * tremble;
  } else {
    lid = (1 - FLUTTER_OPEN) * (1 - ease((a - WAKE.shut - WAKE.flutter) / WAKE.open));
  }
  return { lid, shiver, tremble, ooh: envelope(a - WAKE.oohAt, ...WAKE.ooh) };
}

/** Seconds between two ear flicks of an animal's own, at rest and while it waits; one in this many flicks twice. */
const EAR_GAP: [number, number] = [3, 9], EAR_WAIT_GAP: [number, number] = [1.2, 3.5], EAR_DOUBLE = 0.3;

/** What the animator reads every frame. */
export interface FaceInput {
  /** Her voice's loudness, 0..1. */
  voice: number;
  /** Her voice's spectrum this frame, when one was read. */
  spectrum: Uint8Array | null;
  /** Where the pointer is, -1..1 each (x right, y up). */
  lookGoal: { x: number; y: number };
  /** False under reduced motion: no blinks, no gestures, no saccades; the mouth still speaks. */
  motion: boolean;
  /** False: none of her own gestures (the blinks stay); set in Settings › Profile. True when absent. */
  gestures?: boolean;
  /** The pointer rests between her eyes (the scene knows where they are on the screen). */
  between?: boolean;
  /** False: her gaze is off (Settings › Profile), she stays facing and never wanders. True when absent. */
  gaze?: boolean;
  /** The person did something this frame that the pointer does not show (a key, a click, a wheel): she stays awake. */
  active?: boolean;
  /**
   * The pointer near her face, measured by the scene in eye spacings: how far from the face's
   * middle, how fast it moves, how fast it comes closer (negative: going away), and which side
   * (dx > 0: the viewer's right). Absent when the pointer is off the board or far away.
   */
  near?: { dist: number; speed: number; approach: number; dx: number; dy: number };
  /** The sentence her voice is saying and when it began: its tone shows on her face (speechTone). */
  sentence?: { text: string; at: number } | null;
  /**
   * An answer is being written (assistantThinking): until she speaks it, she thinks. `'recall'`:
   * the answer she is about to SAY (the voice orb waiting for the model): she searches her
   * memory, her eyes always up and to one side (doc 180 §44).
   */
  thinking?: boolean | 'recall';
  /**
   * The person is speaking to her (userVoice: the microphone hears a voice). She listens: their
   * voice counts as them being there (no waiting, no dozing off), and she does not yawn.
   */
  hearing?: boolean;
  /**
   * Music plays on the board (lib/musicListening, doc 180 §39): its beats, its loudness, its
   * tempo when known, where the window that plays it is. She listens: it counts as someone
   * being there, her own gestures give way to her listening life (faceMusic). A person only.
   */
  music?: MusicHeard | null;
  /**
   * A window arrived on the board this frame (canvasPan BOARD_WINDOWS_OPENED_EVENT): listening to
   * music, she comes out of it for a few seconds, brows up and a blink (doc 180 §40).
   */
  roused?: boolean;
}

/** A face's life: one per mounted face, never shared (it carries its timers). */
export interface FaceAnimator {
  /** Advance by dt seconds and return the face (the same object every frame). */
  step(dt: number, input: FaceInput): FaceFrame;
  /** Play an expression now, over whatever she is doing. */
  express(id: MoveId): void;
  /** Wake her up, `delay` seconds from now (her eyes stay shut until then). */
  wake(delay?: number): void;
  /** How she feels now (faceMood). */
  mood(): Readonly<Mood>;
  /**
   * Pull a funny face (a person's grimace, an animal's clowning), never the last one again; says which.
   * After three in a quick row the fourth is a fed-up face (an eye roll, a yawn), and the row starts again.
   * Asked while a funny face is still playing: ignored (null), she finishes the one she is pulling.
   */
  grimace(): MoveId | null;
}

/**
 * A new face's life. `random` is injectable so a test can pin every draw; the
 * frame `step` returns is the same object every call, rewritten in place.
 */
export function createFaceAnimator(
  random: Random = Math.random,
  opts: { ears?: boolean; species?: AnimalSpecies; earRange?: readonly [number, number]; onMove?: (id: MoveId) => void; lifeRandom?: Random } = {},
): FaceAnimator {
  // The small life (faceMicro) and the newer draws take their own random, so the older ones keep
  // theirs; a pinned random (a test) pins this one too, from a fixed seed.
  const lifeRandom = opts.lifeRandom ?? (random === Math.random ? Math.random : createRng(0x5eed).rand);
  const micro = createMicroLife(lifeRandom);
  // Her listening life takes its own random too, so every older draw keeps its own.
  const musicLife = createMusicLife(random === Math.random ? Math.random : createRng(0x6d75).rand);
  // An animal's ways (faceSpecies), and the side its head always tilts to (a dog's is its own, for months).
  const ways = opts.species ? SPECIES[opts.species] : null;
  const ctx: AnimalContext = { tilt: ways && lifeRandom() < 0.5 ? -1 : 1 };
  /** A move asked of this face: a person's as it is; on an animal, its own way of saying it, or nothing. */
  const resolveMove = (id: MoveId): MoveId | null => {
    if (!ways) return id;
    const r = ways.resolve[id];
    return r === undefined ? id : r !== null && isMoveId(r) ? r : null;
  };
  /** A move's phases on this face, at its own pace (a bear is slower). */
  const phasesHere = (id: MoveId): Phase[] => {
    const phases = phasesOf(id, random, ctx), k = ways?.tempo ?? 1;
    return k === 1 ? phases : phases.map(p => ({ at: p.at * k, g: { ...p.g, rise: p.g.rise * k, hold: p.g.hold * k, fall: p.g.fall * k } }));
  };
  const idlePool = (ways?.idle ?? IDLE) as ReadonlyArray<[MoveId, number]>;
  const waitPool = (ways?.waitIdle ?? WAIT_IDLE) as ReadonlyArray<[MoveId, number]>;
  const blinkGap = ways?.blinkGap ?? BLINK_GAP;
  const frame: FaceFrame = { weights: new Float32Array(FACE_SHAPE_COUNT), blink: 0, squint: [0, 0], wink: [0, 0], look: { x: 0, y: 0 }, head: { yaw: 0, pitch: 0 }, cross: 0, tremble: 0, talking: false, sleep: 0, gearTurn: 0 };
  // A robot's gears (doc 181 §12.3): how fast they turn now, and how far they have turned.
  let gearSpeed = 0, gearTurn = 0;
  // The head's spring: where it is and how fast it moves, per axis (share of the full turn).
  const headPos = { yaw: 0, pitch: 0 }, headVel = { yaw: 0, pitch: 0 };
  // The pointer's share of the head's turn alone, on the same spring: what the eyes give back.
  const ptrPos = { yaw: 0, pitch: 0 }, ptrVel = { yaw: 0, pitch: 0 };
  let t = 0;
  // What she is playing: each phase, whether it belongs to a yawn, and when it was asked to fade out.
  let playing: Array<{ at: number; g: Gesture; yawn?: true; cut?: number }> = [];
  let nextIdle = pick(random, 2, 5);
  let nextBlink = pick(random, ...(opts.species ? SPECIES[opts.species].blinkGap : BLINK_GAP)), blinkAt = -10, secondBlink = -1;
  let mouth = 0, spread = 0, slow = 0, lastFlash = -10;
  const look = { x: 0, y: 0 }, saccade = { x: 0, y: 0 }, saccadeGoal = { x: 0, y: 0 };
  let nextSaccade = 1, lastGoal = { x: 0, y: 0 };
  // The pointer between her eyes: since when, how crossed they are, whether she smiled at it yet.
  let betweenSince = -1, betweenLeft = -10, cross = 0, smiledAtIt = false;
  // When her waking starts; -1 = awake.
  let wakeStart = -1;
  // An animal's ears flick on their own clock, never taking a gesture's turn.
  let ears: Array<{ at: number; g: Gesture }> = [];
  let nextEar = pick(random, ...EAR_GAP), secondEar: { at: number; id: ExpressionId } | null = null, earsPerkedAtWake = -1;
  const flick = (id: ExpressionId, at = t) => { ears.push({ at, g: recipe(id)(random) }); };
  // When her voice was last heard; the last sentence whose tone she showed.
  let lastSpoke = -10, lastSentenceAt = -1;
  // The pointer near her face: since when it has been slow and near (a caress), how far she has
  // given in to it, which side it is on; when she last dodged, and to which side.
  let slowSince = -1, caress = 0, caressSide = 1, dodgeAt = -10, dodgeSide = 1;
  // Under a long caress, how far her eyes have opened again (0: shut, 1: open and smiling).
  let caressOpen = 0;
  // When the pointer last moved, and where her gaze wanders while she waits.
  let lastMoved = 0, wanderGoal = { x: 0, y: 0 }, nextWander = 0, wasWaiting = false;
  // While she speaks: when she next looks up, thinking; whether she spoke at the last frame.
  let nextThink = 0, wasTalking = false;
  // How deep asleep she is, whether she got there (a real sleep wakes with her waking), which way her head leans.
  let sleep = 0, asleep = false, sleepSide = 1, wasDozing = false;
  let afterWaking: MoveId | null = null;
  // The last funny face pulled: never the same twice in a row.
  let lastGrimace: MoveId | null = null;
  // How many grimaces in the current quick row, and when the last one was asked.
  let grimaceRow = 0, lastGrimaceAt = -Infinity;
  // Until when the funny face she is pulling lasts.
  let funnyUntil = -Infinity;
  const pull = (id: MoveId) => {
    if (asleep || sleep > 0.3) { lastMoved = t; afterWaking = id; return; }
    funnyUntil = t + play(id);
  };
  // Dreaming: when the next dream comes, until when this one lasts, where her eyes dart under her lids.
  let nextRem = -1, remEnd = -1, nextDart = 0, nextTwitch = 0;
  const remGoal = { x: 0, y: 0 }, remLook = { x: 0, y: 0 };
  // Thinking: how far she is in it, to which side her eyes went, where they rest now and until when.
  let think = 0, thinkSide = 1, wasThinking = false, thinkSpot = { x: 0, y: 0 }, nextThinkSpot = 0;
  let thinkWay: ThinkWay = 'up', thoughtEnded = -10, thinkStart = -10, thoughtCameAt = -10;
  // How she feels, over minutes (faceMood).
  const mood = createFaceMood();

  /** Plays a move; says how long it lasts (0 when this face has none for it). */
  const play = (asked: MoveId): number => {
    const id = resolveMove(asked);
    if (!id) return 0;
    const phases = phasesHere(id);
    const yawn = YAWNS.has(id) || YAWNS.has(asked);
    for (const p of phases) playing.push({ at: t + p.at, g: p.g, ...(yawn ? { yawn: true as const } : {}) });
    return lengthOf(phases);
  };
  let lastMoves: MoveId[] = [];
  const blink = () => { blinkAt = t; };
  /** A wink is playing now (started, not yet faded). */
  const winking = () => playing.some(p => p.g.wink && t >= p.at && t - p.at <= p.g.rise + p.g.hold + p.g.fall);

  // Her small life (faceMicro) waits a moment after a waking.
  let smallFrom = 0;
  const wakeUp = (delay = 0) => {
    wakeStart = t + delay;
    smallFrom = wakeStart + WAKE_S + 0.5;
    playing = [];
    // Nothing of her own until she is up.
    nextIdle = Math.max(nextIdle, wakeStart + WAKE_S + pick(random, 1, 3));
    nextBlink = Math.max(nextBlink, wakeStart + WAKE_S + pick(random, 1.5, 4));
  };

  return {
    express(id) {
      // Asked of her asleep: she wakes first (the person is there), then plays it.
      if (asleep || sleep > 0.3) { lastMoved = t; afterWaking = id; return; }
      play(id);
      // An emotion played on purpose lingers in her mood after her face lets it go.
      const nudge = EMOTION_MOOD[id];
      if (nudge) mood.nudge(nudge);
    },
    wake: wakeUp,
    mood: () => mood.get(),
    grimace() {
      if (t < funnyUntil) return null;
      if (t - lastGrimaceAt > GRIMACE_ROW_S) grimaceRow = 0;
      lastGrimaceAt = t;
      if (grimaceRow >= GRIMACES_BEFORE_FED_UP) {
        grimaceRow = 0;
        const fedUp = (ways ? ANIMAL_FED_UP : FED_UP) as readonly MoveId[];
        const id = fedUp[Math.floor(lifeRandom() * fedUp.length)] ?? fedUp[0] ?? 'sigh';
        pull(id);
        // Enough clowning: a little flat.
        mood.nudge([-0.05, -0.2]);
        return id;
      }
      grimaceRow++;
      const pool = (ways ? ways.funny.filter(isMoveId) : GRIMACE_IDS) as MoveId[];
      const choices = pool.length > 1 ? pool.filter(id => id !== lastGrimace) : pool;
      const id = choices[Math.floor(lifeRandom() * choices.length)] ?? pool[0] ?? 'smile';
      lastGrimace = id;
      pull(id);
      // Clowning amuses her.
      mood.nudge([0.2, 0.3]);
      return id;
    },
    step(dt, input) {
      t += dt;
      const w = frame.weights;
      w.fill(0);

      // Her voice: the jaw and the lips.
      const shape = mouthShape(input.voice, input.spectrum);
      mouth = settle(mouth, shape.open, dt, shape.open > mouth ? MOUTH_OPEN_S : MOUTH_CLOSE_S);
      spread = settle(spread, shape.spread, dt, MOUTH_SHAPE_S);
      const speaking = mouth > 0.05;
      // While she speaks (and a breath after, the pauses between words included) she looks at
      // the person she speaks to: the middle, not the pointer.
      if (speaking) lastSpoke = t;
      const talking = input.motion && t - lastSpoke < TALK_HOLD_S;

      const waking = input.motion && wakeStart >= 0 ? (t < wakeStart ? wakeAt(0) : wakeAt(t - wakeStart)) : null;
      if (wakeStart >= 0 && !waking && t >= wakeStart) wakeStart = -1;

      // The pointer still for a while: she waits (her own life, so only with her gestures on).
      // The person's voice counts as them being there: she never waits for, or falls asleep on, someone talking to her.
      if (Math.abs(input.lookGoal.x - lastGoal.x) + Math.abs(input.lookGoal.y - lastGoal.y) > 0.002 || input.active || input.hearing || input.music) lastMoved = t;
      // Nothing from the person for a long while: she falls asleep (her own life, so only with her gestures on).
      const dozing = input.motion && input.gestures !== false && !waking && !talking && t - Math.max(lastMoved, lastSpoke) >= SLEEP_AFTER_S;
      if (dozing && sleep < 0.01) sleepSide = random() < 0.5 ? 1 : -1;
      // Falling asleep, a long yawn (an animal's own).
      if (dozing && !wasDozing) play('yawnLong');
      wasDozing = dozing;
      sleep = settle(sleep, dozing ? 1 : 0, dt, dozing ? SLEEP_IN_S : SLEEP_OUT_S);
      if (sleep > 0.5) asleep = true;
      // Woken from a real sleep (the person is back): her waking, eyes opening, the « ooh ».
      if (asleep && !dozing) { asleep = false; wakeUp(0); }
      // A move asked of her while she slept, once she is up.
      if (afterWaking && !dozing && wakeStart < 0 && sleep < 0.05) { play(afterWaking); afterWaking = null; }
      const waiting = input.motion && input.gestures !== false && input.gaze !== false && !waking && !talking && !dozing && t - lastMoved >= WAIT_AFTER_S;
      // An answer being written and not yet spoken: she thinks (her own life, so only with her gestures on).
      const thinking = input.motion && input.gestures !== false && (input.thinking === true || input.thinking === 'recall') && !talking && !waking && !dozing;
      if (thinking && !wasThinking) {
        thinkSide = random() < 0.5 ? 1 : -1;
        const r = lifeRandom();
        // Searching her memory before she speaks: up and aside, always.
        thinkWay = input.thinking === 'recall' ? 'recall' : r < 0.39 ? 'up' : r < 0.68 ? 'down' : 'side';
        nextThinkSpot = t;
        thinkStart = t;
      }
      if (thinking && t >= nextThinkSpot) {
        const checkIn = t - thinkStart > THINK_CHECK_AFTER_S && lifeRandom() < THINK_CHECK_IN;
        thinkSpot = checkIn ? CENTRE : thinkSpotOf(random, thinkWay, thinkSide);
        nextThinkSpot = t + pick(random, ...THINK_SPOT_GAP);
      }
      if (wasThinking && !thinking) thoughtEnded = t;
      // The thought came: her brows lift, a smile starts (the voice may take the mouth right after);
      // once for a real thought, not at every pause of a long answer.
      if (wasThinking && !thinking && input.gestures !== false && input.motion && t - thinkStart >= THOUGHT_MIN_S && t - thoughtCameAt >= THOUGHT_REST_S) {
        thoughtCameAt = t;
        // An animal: its ears up at once (a dog's inner brows too).
        playing.push({ at: t, g: ways ? { weights: { earL: -0.7, earR: -0.7, ...(opts.species === 'dog' ? { browInnerUp: 0.4 } : {}) }, rise: 0.12, hold: 0.35, fall: 0.5 } : thoughtCame() });
      }
      wasThinking = thinking;
      think = settle(think, thinking ? 1 : 0, dt, thinking ? THINK_IN_S : THINK_OUT_S);
      const feel = mood.get();
      // Music: she listens when nothing else holds her (her voice owns her face, a thought her eyes).
      const listenFree = input.motion && input.gestures !== false && !ways && !talking && !thinking && !waking && !dozing && sleep < 0.05;
      // A window arriving pulls her out of the music: her brows lift, she blinks.
      if (input.roused && musicLife.rouse() && listenFree) { play('browRaise'); blink(); }
      const heard = musicLife.step(dt, { music: input.music ?? null, free: listenFree });
      const listening = heard.listening > 0.5;
      if (heard.play && playing.length === 0) play(heard.play);

      if (input.motion) {
        const gestures = input.gestures !== false;
        if (waiting && t >= nextWander) {
          const home = random() < WANDER_HOME;
          wanderGoal = home ? { x: 0, y: 0 } : { x: pick(random, -0.9, 0.9), y: pick(random, -0.45, 0.55) };
          nextWander = t + pick(random, ...WANDER_GAP);
        }
        // Back from a wait: « ah, there you are ».
        if (wasWaiting && !waiting && t - lastMoved < 0.5 && gestures) {
          // A person's brows lift; an animal greets its own way (a dog's excitement, a cat's slow blink, a lion's rub).
          play(ways ? (ways.back as MoveId) : 'browRaise');
          if (opts.ears) flick('earsPerk');
          nextIdle = Math.max(nextIdle, t + 3);
          mood.nudge('back');
        }
        wasWaiting = waiting;
        if (waiting && nextIdle > t + WAIT_GAP[1]) nextIdle = t + pick(random, ...WAIT_GAP);
        // A stressed syllable: the open mouth jumps over its slow average.
        slow = settle(slow, mouth, dt, 0.3);
        if (gestures && mouth - slow > 0.22 && t - lastFlash > 1.4) { lastFlash = t; if (random() < 0.35) play('emphasis'); }
        // Each new sentence she says shows its tone (a question, thanks, an apology…), over whatever she does.
        if (gestures && input.sentence && input.sentence.at !== lastSentenceAt) {
          lastSentenceAt = input.sentence.at;
          const tone = toneOf(input.sentence.text);
          if (tone === 'happy' || tone === 'sorry' || tone === 'warn' || tone === 'exclaim') mood.nudge(tone satisfies MoodNudge);
          const g = opts.species ? speciesTone(opts.species, tone, random, ctx) : speechExpression(input.sentence.text, random);
          if (g) { playing.push({ at: t, g }); nextIdle = Math.max(nextIdle, t + g.rise + g.hold + g.fall + 1); }
        }
        // While she speaks, now and then a pensive look up and aside, when no gesture already leads her eyes.
        if (talking && !wasTalking) {
          nextThink = t + pick(random, ...THINK_FIRST);
          // She starts speaking with her eyes away, back on the person a second in; just out of a
          // thought, from where her thought was.
          if (gestures && lifeRandom() < TURN_LOOK_AWAY) {
            const away = t - thoughtEnded < 1 ? thinkSpot : thinkSpotOf(lifeRandom, lifeRandom() < 0.5 ? 'side' : 'up', lifeRandom() < 0.5 ? 1 : -1);
            playing.push({ at: t, g: { weights: {}, look: away, head: { yaw: 0.25 * away.x, pitch: 0.15 * away.y }, rise: 0.12, hold: pick(lifeRandom, ...TURN_AWAY_HOLD), fall: 0.45 } });
          }
        }
        wasTalking = talking;
        if (gestures && talking && t >= nextThink && playing.every(p => !p.g.look)) {
          // An animal: the look without a person's brows.
          const g = thinkUp(random);
          playing.push({ at: t, g: ways ? { ...g, weights: {} } : g });
          nextThink = t + pick(random, ...THINK_GAP);
        }
        // Her own gestures, one at a time; while she speaks, none that would move her mouth; asleep, none.
        // Listening to music, her listening life (faceMusic) is what she does instead.
        if (listening && nextIdle < t + 2) nextIdle = t + 2;
        if (gestures && !dozing && !thinking && !listening && t >= nextIdle && playing.length === 0) {
          // Her mood favours some (all as usual at rest: every factor is 1 there).
          const glad = gladness(feel), low = lowness(feel), drowsy = drowsiness(feel);
          const favour = (id: MoveId, k: number) => k * (GLAD_ONLY.has(id) ? 2 * glad : 1) * (GLAD_MOVES.has(id) ? 1 + 2 * glad : 1) * (LOW_MOVES.has(id) ? 1 + 2 * low : 1) * (DROWSY_MOVES.has(id) ? 1 + 2 * drowsy : 1);
          const pool = (waiting ? waitPool : idlePool).filter(([id]) => !(speaking && movesMouth(id)) && !(talking && NOT_WHILE_TALKING.has(id)) && !(id === 'yawnLong' && t - lastMoved < YAWN_QUIET_S) && !(input.hearing && YAWNS.has(id)) && !lastMoves.includes(id)).map(([id, k]): [MoveId, number] => [id, favour(id, k)]);
          let r = random() * pool.reduce((n, [, k]) => n + k, 0);
          const chosen = pool.find(([, k]) => (r -= k) <= 0)?.[0] ?? 'browRaise';
          const phases = phasesHere(chosen);
          const yawn = YAWNS.has(chosen);
          for (const p of phases) playing.push({ at: t + p.at, g: p.g, ...(yawn ? { yawn: true as const } : {}) });
          lastMoves = [chosen, ...lastMoves].slice(0, NO_REPEAT);
          opts.onMove?.(chosen);
          nextIdle = t + lengthOf(phases) + pick(random, ...(waiting ? WAIT_GAP : IDLE_GAP)) * (waiting ? 1 : gestureGapScale(feel));
        }
        // Blinks: at irregular moments, sometimes twice, and when the gaze jumps far.
        const jump = Math.hypot(input.lookGoal.x - lastGoal.x, input.lookGoal.y - lastGoal.y);
        lastGoal = { ...input.lookGoal };
        // Nobody blinks mid-wink: a blink on top of it shuts both eyes and reads as two winks.
        if (winking()) { nextBlink = Math.max(nextBlink, t + 0.4); if (secondBlink > 0) secondBlink = -1; }
        else {
          if (jump > 0.6 && t - blinkAt > 2.5 && !waking) blink();
          if (t >= nextBlink && caress * (1 - caressOpen) < 0.3) { blink(); nextBlink = t + pick(random, ...blinkGap); if (random() < DOUBLE_BLINK) secondBlink = t + 0.35; }
          if (secondBlink > 0 && t >= secondBlink) { blink(); secondBlink = -1; }
        }
        // A pointer resting between her eyes: they cross a little, then she smiles at it, once per visit.
        if (input.between && !talking) {
          if (betweenSince < 0) betweenSince = t;
          if (gestures && !waking && !smiledAtIt && t - betweenSince >= CROSS_SMILE_AFTER_S) { smiledAtIt = true; play('smile'); }
        } else if (betweenSince >= 0) {
          betweenSince = -1; betweenLeft = t;
        }
        if (betweenSince < 0 && t - betweenLeft >= CROSS_RESET_S) smiledAtIt = false;
        // The ears: a flick now and then (more often while it waits), sometimes twice; pricked up
        // when the eyes open on waking and when the pointer comes back.
        if (opts.ears && gestures) {
          if (waking && t - wakeStart > 2 && earsPerkedAtWake !== wakeStart) { earsPerkedAtWake = wakeStart; flick('earsPerk'); }
          if (!waking && t >= nextEar) {
            const id: ExpressionId = random() < 0.5 ? 'earFlickL' : 'earFlickR';
            flick(id);
            if (random() < EAR_DOUBLE) secondEar = { at: t + 0.35, id };
            nextEar = t + pick(random, ...(waiting ? EAR_WAIT_GAP : EAR_GAP));
          }
          if (secondEar && t >= secondEar.at) { flick(secondEar.id); secondEar = null; }
        }
        // Saccades: awake, the eyes never rest perfectly still; asleep, they rest (but when she dreams).
        if (sleep > 0.5) { saccadeGoal.x = 0; saccadeGoal.y = 0; }
        else if (t >= nextSaccade) { saccadeGoal.x = pick(random, -0.12, 0.12); saccadeGoal.y = pick(random, -0.08, 0.08); nextSaccade = t + pick(random, 0.6, 2.2); }
      } else {
        playing = [];
        ears = [];
        saccadeGoal.x = 0; saccadeGoal.y = 0;
        betweenSince = -1;
      }
      ears = ears.filter(p => {
        const age = t - p.at, g = p.g;
        if (age > g.rise + g.hold + g.fall) return false;
        const e = envelope(age, g.rise, g.hold, g.fall);
        for (const [id, v] of Object.entries(g.weights) as Array<[FaceShapeId, number]>) w[FS[id]] = (w[FS[id]] ?? 0) + v * e;
        return true;
      });
      cross = settle(cross, betweenSince >= 0 && t - betweenSince >= CROSS_AFTER_S ? CROSS : 0, dt, CROSS_S);

      // The gestures playing, added up; a beat's jolt goes straight onto the head (too quick for its spring).
      let sqL = 0, sqR = 0, lookX = 0, lookY = 0, headX = 0, headY = 0, lid = 0, joltPitch = 0, shake = 0, winkL = 0, winkR = 0, crossed = 0;
      // The person speaking: a yawn under way fades out now, it never plays over their voice.
      if (input.hearing) for (const p of playing) if (p.yawn && p.cut === undefined) p.cut = t;
      playing = playing.filter(p => {
        const age = t - p.at, g = p.g;
        if (age > g.rise + g.hold + g.fall + Math.abs(g.squint?.lag ?? 0)) return false;
        const fade = p.cut === undefined ? 1 : 1 - (t - p.cut) / YAWN_CUT_S;
        if (fade <= 0) return false;
        const e = envelope(age, g.rise, g.hold, g.fall) * fade;
        for (const [id, v] of Object.entries(g.weights) as Array<[FaceShapeId, number]>) w[FS[id]] = (w[FS[id]] ?? 0) + v * e;
        if (g.squint) {
          const eL = envelope(age - Math.max(0, -g.squint.lag), g.rise, g.hold, g.fall) * fade;
          const eR = envelope(age - Math.max(0, g.squint.lag), g.rise, g.hold, g.fall) * fade;
          sqL = Math.max(sqL, g.squint.left * eL);
          sqR = Math.max(sqR, g.squint.right * eR);
        }
        if (g.look) { lookX += g.look.x * e; lookY += g.look.y * e; }
        if (g.head) { headX += g.head.yaw * e; headY += g.head.pitch * e; }
        if (g.swing) w[FS.headTilt] = (w[FS.headTilt] ?? 0) + g.swing.amp * e * Math.sin(2 * Math.PI * g.swing.hz * age);
        if (g.lid) lid = Math.max(lid, g.lid * e);
        if (g.tremble) shake = Math.max(shake, g.tremble * e);
        if (g.wink) { winkL = Math.max(winkL, g.wink.left * e); winkR = Math.max(winkR, g.wink.right * e); }
        if (g.cross) crossed = Math.max(crossed, g.cross * e);
        if (g.pulse) {
          const phase = 2 * Math.PI * g.pulse.hz * age, beat = 0.5 - 0.5 * Math.cos(phase);
          for (const [id, v] of Object.entries(g.pulse.weights ?? {}) as Array<[FaceShapeId, number]>) w[FS[id]] = (w[FS[id]] ?? 0) + v * e * beat;
          joltPitch += (g.pulse.pitch ?? 0) * e * Math.sin(phase);
        }
        return true;
      });

      // Asleep: the head lowers and leans, rising and falling a little with her breath; the eyes go down.
      if (sleep > 0.001) {
        headY += SLEEP_PITCH * sleep;
        w[FS.headTilt] = (w[FS.headTilt] ?? 0) + sleepSide * SLEEP_TILT * sleep;
        lookY += SLEEP_LOOK_Y * sleep;
      }
      // Deep asleep, she dreams now and then: her eyes dart under her lids, small twitches.
      const deep = input.motion && sleep > 0.9;
      if (deep) {
        if (nextRem < 0) nextRem = t + pick(lifeRandom, ...REM_FIRST);
        if (t >= nextRem && t >= remEnd) { remEnd = t + pick(lifeRandom, ...REM_LEN); nextRem = remEnd + pick(lifeRandom, ...REM_GAP); }
      } else { nextRem = -1; remEnd = -1; }
      const dreaming = deep && t < remEnd;
      if (dreaming && t >= nextDart) {
        remGoal.x = pick(lifeRandom, -0.7, 0.7); remGoal.y = pick(lifeRandom, -0.25, 0.2);
        nextDart = t + pick(lifeRandom, ...REM_DART);
      }
      if (!dreaming) { remGoal.x = 0; remGoal.y = 0; }
      if (dreaming && input.gestures !== false && t >= nextTwitch) {
        playing.push({ at: t, g: dreamTwitch(lifeRandom, opts.species) });
        nextTwitch = t + pick(lifeRandom, ...REM_TWITCH);
      }
      remLook.x = settle(remLook.x, remGoal.x, dt, REM_DART_S);
      remLook.y = settle(remLook.y, remGoal.y, dt, REM_DART_S);
      lookX += remLook.x; lookY += remLook.y;

      // The pointer near her face. Its own life: not while she wakes or speaks, not with her gestures off.
      const near = input.motion && input.gestures !== false && !waking && !talking ? input.near : undefined;
      // A slow approach that stays near (a cheek, the forehead; not between the eyes): a caress.
      if (near && near.dist < CARESS_R && near.speed < CARESS_SPEED && !input.between) {
        if (slowSince < 0) slowSince = t;
        caressSide = near.dx >= 0 ? 1 : -1;
      } else slowSince = -1;
      const stroked = slowSince >= 0 && t - slowSince >= CARESS_AFTER_S;
      caress = settle(caress, stroked ? 1 : 0, dt, stroked ? CARESS_IN_S : CARESS_OUT_S);
      const longStroked = stroked && t - slowSince - CARESS_AFTER_S >= CARESS_SHUT_S;
      caressOpen = stroked ? settle(caressOpen, longStroked ? 1 : 0, dt, CARESS_OPEN_S) : 0;
      // A quick approach: she dodges it, once, then rests a moment.
      if (near && near.dist < DODGE_R && near.approach > DODGE_SPEED && t - dodgeAt > DODGE_REST_S && caress < 0.3) {
        dodgeAt = t;
        dodgeSide = near.dx >= 0 ? -1 : 1;
        blink();
        mood.nudge('startled');
      }
      const dodge = input.motion ? envelope(t - dodgeAt, 0.12, 0.45, 0.9) : 0;
      // Dodging: the head away from the pointer and back, a little start in the brows.
      headX += dodgeSide * DODGE_YAW * dodge;
      headY += DODGE_PITCH * dodge;
      w[FS.headTilt] = (w[FS.headTilt] ?? 0) + dodgeSide * DODGE_TILT * dodge;
      if (ways) {
        // An animal flattens its ears instead.
        w[FS.earL] = (w[FS.earL] ?? 0) + 0.9 * dodge;
        w[FS.earR] = (w[FS.earR] ?? 0) + 0.9 * dodge;
      } else {
        w[FS.browUpL] = (w[FS.browUpL] ?? 0) + 0.35 * dodge;
        w[FS.browUpR] = (w[FS.browUpR] ?? 0) + 0.35 * dodge;
      }
      // Stroked: the head leans into the hand (a positive tilt goes to the viewer's left), a quiet
      // smile that widens when her eyes open again, an animal's ears relax back and out.
      // An animal smiles no more than it would: a cat purrs, its ears a little forward (friendly);
      // a dog's mouth opens, relaxed.
      let purr = 0;
      if (caress > 0.001) {
        w[FS.headTilt] = (w[FS.headTilt] ?? 0) - caressSide * CARESS_TILT * caress;
        if (!ways) {
          const smile = (CARESS_SMILE + (CARESS_SMILE_OPEN - CARESS_SMILE) * caressOpen) * caress;
          w[FS.smileL] = (w[FS.smileL] ?? 0) + smile;
          w[FS.smileR] = (w[FS.smileR] ?? 0) + smile;
        }
        if (opts.species !== 'cat') w[FS.browInnerUp] = (w[FS.browInnerUp] ?? 0) + 0.15 * caress;
        const ears = opts.species === 'cat' ? -0.15 : 0.45;
        if (opts.ears) { w[FS.earL] = (w[FS.earL] ?? 0) + ears * caress; w[FS.earR] = (w[FS.earR] ?? 0) + ears * caress; }
        if (opts.species === 'cat') purr = PURR * caress * (0.8 + 0.2 * Math.sin(t * 1.6));
        if (opts.species === 'dog') { w[FS.jawOpen] = (w[FS.jawOpen] ?? 0) + 0.15 * caress; w[FS.lipsWide] = (w[FS.lipsWide] ?? 0) + 0.1 * caress; }
      }

      // Thinking: her brow drawn, her lips pressed a little, the head with her eyes, up and aside.
      // An animal presses no lips: its ears go forward, a dog's head tilts to its side, a bear's nose lifts.
      if (think > 0.001) {
        if (!ways) {
          w[FS.browFrown] = (w[FS.browFrown] ?? 0) + THINK_FROWN * think;
          w[FS.lipPress] = (w[FS.lipPress] ?? 0) + THINK_PRESS * think;
          // The lips pushed a little to the side the eyes went.
          w[FS.mouthSide] = (w[FS.mouthSide] ?? 0) + 0.15 * thinkSide * think;
          // The brow on her eyes' side: searching her memory, a flicker then it lifts (§44); a
          // written answer (a long thought, its pauses) keeps it barely up. `think` eases it out.
          const brow = thinkSide > 0 ? FS.browUpL : FS.browUpR;
          w[brow] = (w[brow] ?? 0) + (thinkWay === 'recall' ? thinkBrow(t - thinkStart) : 0.12) * think;
        } else {
          w[FS.earL] = (w[FS.earL] ?? 0) - 0.3 * think;
          w[FS.earR] = (w[FS.earR] ?? 0) - 0.3 * think;
          if (opts.species === 'dog') w[FS.headTilt] = (w[FS.headTilt] ?? 0) + 0.35 * ctx.tilt * think;
          if (opts.species === 'bear') headY += 0.2 * think;
        }
        headX += THINK_HEAD_YAW * thinkSide * think;
        headY += THINK_HEAD_PITCH * think;
      }
      // Listening: her head sways with the music; singing along, her lips and brows move with it.
      w[FS.headTilt] = (w[FS.headTilt] ?? 0) + heard.tilt;
      w[FS.jawOpen] = (w[FS.jawOpen] ?? 0) + heard.mouth.jaw;
      w[FS.lipsRound] = (w[FS.lipsRound] ?? 0) + heard.mouth.round;
      w[FS.lipsWide] = (w[FS.lipsWide] ?? 0) + heard.mouth.wide;
      w[FS.browUpL] = (w[FS.browUpL] ?? 0) + heard.brows.up;
      w[FS.browUpR] = (w[FS.browUpR] ?? 0) + heard.brows.up;
      w[FS.browInnerUp] = (w[FS.browInnerUp] ?? 0) + heard.brows.inner;
      w[FS.breath] = (w[FS.breath] ?? 0) + heard.breath;
      // A thought while she listens (faceMusic museFrame).
      for (const [id, v] of Object.entries(heard.face) as Array<[FaceShapeId, number]>) w[FS[id]] = (w[FS[id]] ?? 0) + v;
      // Her mood on her resting face, quiet: nothing at all at rest.
      const glad = gladness(feel), low = lowness(feel);
      if (glad > 0 && !ways) {
        w[FS.smileL] = (w[FS.smileL] ?? 0) + MOOD_SMILE * glad;
        w[FS.smileR] = (w[FS.smileR] ?? 0) + MOOD_SMILE * glad;
        w[FS.cheekRaise] = (w[FS.cheekRaise] ?? 0) + MOOD_CHEEK * glad;
      }
      if (low > 0 && !ways) {
        w[FS.browInnerUp] = (w[FS.browInnerUp] ?? 0) + MOOD_WORRY * low;
        w[FS.mouthFrown] = (w[FS.mouthFrown] ?? 0) + MOOD_FROWN * low;
      }
      if (ways && input.motion) {
        if (opts.species === 'cat' || opts.species === 'lion') lid = Math.max(lid, ANIMAL_GLAD_LID * glad);
        else { w[FS.earL] = (w[FS.earL] ?? 0) + ANIMAL_GLAD_EARS * glad; w[FS.earR] = (w[FS.earR] ?? 0) + ANIMAL_GLAD_EARS * glad; }
        w[FS.earL] = (w[FS.earL] ?? 0) + ANIMAL_LOW_EARS * low;
        w[FS.earR] = (w[FS.earR] ?? 0) + ANIMAL_LOW_EARS * low;
        if (opts.species === 'dog') w[FS.browInnerUp] = (w[FS.browInnerUp] ?? 0) + MOOD_WORRY * low;
        headY += ANIMAL_LOW_HEAD * low;
      }

      // The small life: micro-expressions, the head with her voice, her breath (faceMicro).
      // Not while she wakes: the waking is all she does then.
      const small = micro.step(dt, { motion: input.motion && !waking && t >= smallFrom, gestures: input.gestures !== false, mouth, speaking, glad, low, sleep, person: !opts.species }, w);
      if (small.blink && t - blinkAt > 1.2 && !waking && !winking()) blink();
      // Her breath on her chest; asleep, her lowered head rises and falls with it.
      w[FS.breath] = (w[FS.breath] ?? 0) + small.breath;
      headY += SLEEP_BREATH * 2 * (small.chest - 0.5) * sleep;
      sqL = Math.max(sqL, small.squint);
      sqR = Math.max(sqR, small.squint);

      // The voice owns the mouth: it adds on top of any gesture, a little larger than the
      // loudness alone, so speech reads from across the room.
      w[FS.jawOpen] = (w[FS.jawOpen] ?? 0) + Math.min(1, SPEECH_JAW * mouth);
      w[FS.lipsWide] = (w[FS.lipsWide] ?? 0) + Math.min(1, SPEECH_LIPS * Math.max(0, spread) * mouth);
      w[FS.lipsRound] = (w[FS.lipsRound] ?? 0) + Math.min(1, SPEECH_LIPS * Math.max(0, -spread) * mouth);

      // Waking: a long « ooh » breathed out, lips rounded, the jaw barely open. An animal's lips do
      // not round (on a bear it reads as fear): a small yawn instead, the lips back.
      if (waking && waking.ooh > 0 && !speaking) {
        if (ways) {
          w[FS.jawOpen] = (w[FS.jawOpen] ?? 0) + 0.4 * waking.ooh;
          w[FS.lipsWide] = (w[FS.lipsWide] ?? 0) + 0.25 * waking.ooh;
        } else {
          w[FS.lipsRound] = (w[FS.lipsRound] ?? 0) + 0.8 * waking.ooh;
          w[FS.jawOpen] = (w[FS.jawOpen] ?? 0) + 0.2 * waking.ooh;
          w[FS.browInnerUp] = (w[FS.browInnerUp] ?? 0) + 0.25 * waking.ooh;
        }
      }
      // A smile narrows the eyes a little; a squint lifts the cheeks.
      const smile = ((w[FS.smileL] ?? 0) + (w[FS.smileR] ?? 0)) / 2;
      sqL = Math.max(sqL, SMILE_SQUINT * smile);
      sqR = Math.max(sqR, SMILE_SQUINT * smile);
      w[FS.cheekRaise] = (w[FS.cheekRaise] ?? 0) + SQUINT_CHEEK * Math.max(sqL, sqR);
      for (let i = 0; i < w.length; i++) w[i] = Math.max(-1, Math.min(1, w[i] ?? 0));
      // Hanging ears move less than standing ones.
      if (opts.earRange) {
        const [lo, hi] = opts.earRange;
        w[FS.earL] = Math.max(lo, Math.min(hi, w[FS.earL] ?? 0));
        w[FS.earR] = Math.max(lo, Math.min(hi, w[FS.earR] ?? 0));
      }

      // The eyes: the pointer, the gesture's own look, the saccades.
      saccade.x = settle(saccade.x, saccadeGoal.x, dt, SACCADE_S);
      saccade.y = settle(saccade.y, saccadeGoal.y, dt, SACCADE_S);
      // Waiting, her gaze goes where it wanders; otherwise where the pointer is.
      // Listening, now and then her eyes go to the window that plays.
      // In the music the pointer does not pull her gaze: ahead, or the window that plays.
      const goal = talking ? CENTRE : thinking ? thinkSpot : listening ? heard.look ?? CENTRE : waiting ? wanderGoal : input.lookGoal;
      look.x = settle(look.x, goal.x, dt, LOOK_S);
      look.y = settle(look.y, goal.y, dt, LOOK_S);
      // The head follows the pointer and the gesture's own turn on a critically damped spring
      // (fluid, no overshoot); under reduced motion it stays facing.
      const cap = (v: number) => Math.max(-HEAD_FOLLOW, Math.min(HEAD_FOLLOW, v));
      const goalYaw = input.motion ? cap(goal.x * HEAD_FOLLOW + headX) : 0;
      // Nodding and lowering the head are a gesture's own: the pitch they add goes past the
      // pointer's cap (GESTURE_PITCH), the pointer's share stays within it.
      const goalPitch = input.motion ? cap(goal.y * HEAD_FOLLOW) + Math.max(-GESTURE_PITCH, Math.min(GESTURE_PITCH, headY)) : 0;
      const w0 = 4 / HEAD_S;
      for (const [k, goal] of [['yaw', goalYaw], ['pitch', goalPitch]] as const) {
        headVel[k] += (w0 * w0 * (goal - headPos[k]) - 2 * w0 * headVel[k]) * dt;
        headPos[k] += headVel[k] * dt;
      }
      const ptrGoal = { yaw: input.motion ? cap(goal.x * HEAD_FOLLOW) : 0, pitch: input.motion ? cap(goal.y * HEAD_FOLLOW) : 0 };
      for (const k of ['yaw', 'pitch'] as const) {
        ptrVel[k] += (w0 * w0 * (ptrGoal[k] - ptrPos[k]) - 2 * w0 * ptrVel[k]) * dt;
        ptrPos[k] += ptrVel[k] * dt;
      }
      // The small life's turn stays within the head's own reach (HEAD_FOLLOW), as every turn does.
      frame.head.yaw = Math.max(-HEAD_FOLLOW, Math.min(HEAD_FOLLOW, headPos.yaw + small.yaw + (input.motion ? heard.yaw : 0))) * HEAD_YAW + (waking?.shiver ?? 0);
      frame.head.pitch = headPos.pitch * HEAD_PITCH + 0.5 * (waking?.shiver ?? 0) + (input.motion ? joltPitch * HEAD_PITCH : 0) + small.pitch * HEAD_PITCH + (input.motion ? heard.pitch * HEAD_PITCH : 0);
      frame.cross = input.motion ? Math.max(cross, crossed) : 0;
      frame.talking = talking;
      frame.tremble = Math.max(waking?.tremble ?? 0, input.motion ? Math.max(shake, purr) : 0);
      frame.sleep = input.motion ? sleep : 0;
      // The eyes lead, then come back towards the middle as the head catches up with the pointer.
      // Only the pointer's share: a head lowered by a gesture keeps the gesture's own gaze (down).
      frame.look.x = Math.max(-1, Math.min(1, look.x + lookX + saccade.x - EYES_RECENTER * ptrPos.yaw));
      frame.look.y = Math.max(-1, Math.min(1, look.y + lookY + saccade.y - EYES_RECENTER * ptrPos.pitch));

      const bt = (t - blinkAt) / BLINK_S;
      frame.blink = input.motion && bt >= 0 && bt <= 1 ? Math.sin(Math.PI * bt) : 0;
      if (waking) frame.blink = Math.max(frame.blink, waking.lid);
      // Stroked, her eyes close (not quite shut: a contented look), then open again.
      frame.blink = Math.max(frame.blink, CARESS_LID * caress * (1 - caressOpen));
      // Asleep, they close all the way.
      frame.blink = Math.max(frame.blink, sleep);
      // A gesture's own lids (heavy, tender, a slow blink).
      if (input.motion) frame.blink = Math.max(frame.blink, lid, heard.lid);
      frame.squint[0] = input.motion ? sqL : 0;
      frame.squint[1] = input.motion ? sqR : 0;
      frame.wink[0] = input.motion ? winkL : 0;
      frame.wink[1] = input.motion ? winkR : 0;
      // A robot's gears turn while it speaks or thinks, easing in and out; at rest, and under
      // reduced motion, they stay still (style-cartouche §7). A face without gears ignores it.
      // Under reduced motion `talking` and `thinking` are already off; the `input.motion` test
      // says it here as well, and a mutant removing it alone changes nothing observable.
      const thought = think > GEAR_THINK_FLOOR ? think : 0;
      const gearGoal = input.motion ? GEAR_SPEED * Math.max(talking ? 1 : 0, thought) : 0;
      gearSpeed += (gearGoal - gearSpeed) * Math.min(1, dt / GEAR_EASE_S);
      if (gearGoal === 0 && gearSpeed < GEAR_SPEED * 0.01) gearSpeed = 0;
      gearTurn += gearSpeed * dt;
      frame.gearTurn = gearTurn;
      mood.step(dt, { waiting, stroked: input.motion ? caress : 0, sleep, thinking: think });
      return frame;
    },
  };
}
