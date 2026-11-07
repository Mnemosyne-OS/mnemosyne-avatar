/**
 * faceSpecies — each animal lives and feels its own way (doc 180 §31).
 *
 * A person's face is not an animal's. What the research on animal faces finds
 * (CatFACS, DogFACS, the ethology of bears and big cats) decides here what
 * each animal does on its own, how it answers what happens to it, and what a
 * person's move becomes on it:
 *  - a CAT speaks with its ears and its lids: 44 % of the actions coded
 *    between cats are the ears (Scott & Florkiewicz 2023); trust is a slow
 *    blink, half-blinks then a long closure (Humphrey et al. 2020); it blinks
 *    rarely (a few times a minute when it faces you, Koyasu 2021); petted, it
 *    purrs; it never presses its lips nor raises its chin;
 *  - a DOG asks with its inner brows (AU101, more when a person faces it,
 *    Kaminski 2017), tilts its head always to the same side (Sommese 2021),
 *    is happy with its mouth open and relaxed, not with a smile (Caeiro
 *    2017), pants, sniffs at about 5 Hz; a labrador's ears hang, so they move
 *    less;
 *  - a BEAR listens with its ears forward, lifts its nose to smell, mouth
 *    opening and closing; a swaying head is a sign of distress and a
 *    protruding lip one of fear (Kilham 2026, BearSmart), so it does neither;
 *  - a LION yawns often when relaxed and blinks slowly like a cat; its face
 *    research is thin, so the rest is borrowed from the cat.
 *
 * What a person does that would read wrong on an animal (a smile, a smirk,
 * pressed lips, an eyebrow flash for emphasis) resolves to the animal's own
 * way of saying it, or to nothing.
 *
 * @module avatar/faceSpecies
 */
import type { AnimalSpecies } from './faceShapes';
import { G, pick, side, type Gesture, type Phase, type Random } from './faceGesture';

/** What an animal's move is drawn with: the side its head always tilts to. */
export interface AnimalContext { tilt: 1 | -1 }

/** The animals' own moves. */
export const ANIMAL_MOVES = {
  // Trust (Humphrey et al. 2020): two half-blinks, then the eyes close a long moment, ears a little forward.
  slowBlink: rnd => [
    { at: 0, g: G({}, 0.22, 0.08, 0.25, { lid: 0.5 }) },
    { at: 0.65, g: G({}, 0.22, 0.08, 0.25, { lid: 0.55 }) },
    { at: 1.3, g: G({ earL: -0.2, earR: -0.2 }, 0.35, pick(rnd, 0.6, 1.2), 0.7, { lid: 1 }) },
  ],
  // A purr: the eyes nearly shut, the ears a little forward, the whole face trembling softly (26 Hz, too fast to see as more).
  purr: rnd => [
    { at: 0, g: G({ earL: -0.2, earR: -0.2 }, 0.8, pick(rnd, 2.5, 3.5), 1, { lid: 0.7, tremble: 0.22 }) },
  ],
  // The ears flattened and turned back (« airplane ears »): annoyed, uneasy.
  earsBack: rnd => [{ at: 0, g: G({ earL: 0.9, earR: 0.9 }, 0.12, pick(rnd, 0.8, 1.4), 0.5, { squint: { left: 0.15, right: 0.15, lag: 0 } }) }],
  // One ear turned back to something behind, the other forward.
  earSwivel: rnd => { const s = side(rnd); return [{ at: 0, g: G(s > 0 ? { earL: 0.6, earR: -0.3 } : { earL: -0.3, earR: 0.6 }, 0.1, pick(rnd, 0.6, 1.2), 0.3) }]; },
  // Sniffing (about 5 Hz across mammals): the nose up and twitching, the head bobbing a hair, the ears forward.
  sniff: rnd => [{ at: 0, g: G({ earL: -0.3, earR: -0.3 }, 0.25, pick(rnd, 0.8, 1.6), 0.4, { head: { yaw: 0, pitch: 0.25 }, look: { x: 0, y: 0.2 }, pulse: { hz: 5, weights: { noseWrinkle: 0.2 }, pitch: 0.05 } }) }],
  // A bear smelling the air: the nose high and twitching, the mouth opening and closing slowly.
  sniffAir: rnd => {
    const hold = pick(rnd, 1.6, 2.6);
    return [
      { at: 0, g: G({ earL: -0.4, earR: -0.4 }, 0.5, hold, 0.7, { head: { yaw: 0, pitch: 0.4 }, look: { x: 0, y: 0.3 }, pulse: { hz: 1, weights: { jawOpen: 0.14 } }, mouth: true }) },
      { at: 0.3, g: G({}, 0.2, hold - 0.4, 0.4, { pulse: { hz: 5, weights: { noseWrinkle: 0.18 } } }) },
    ];
  },
  // Flehmen (cats, lions): the upper lip curled back, the mouth a little open, the head up, the eyes half shut, held while it smells.
  flehmen: rnd => [{ at: 0, g: G({ noseWrinkle: 0.75, jawOpen: 0.3, lipsWide: 0.2 }, 0.5, pick(rnd, 2, 3), 0.8, { head: { yaw: 0, pitch: 0.3 }, lid: 0.4, mouth: true }) }],
  // A yawn: the jaw wide, the lips back, the eyes nearly shut, the ears back, the head up (a cat's lasts about 2 s, a dog's 2.4 s).
  yawn: rnd => [{ at: 0, g: G({ jawOpen: 0.95, lipsWide: 0.35, earL: 0.4, earR: 0.4 }, 0.85, pick(rnd, 0.3, 0.5), 0.75, { lid: 0.85, head: { yaw: 0, pitch: 0.35 }, mouth: true }) }],
  // Happy (Caeiro 2017; a bear's play face, Taylor 2019): the mouth open and relaxed, the corners back, soft eyes, ears back.
  playFace: rnd => [{ at: 0, g: G({ jawOpen: 0.45, lipsWide: 0.3, earL: 0.3, earR: 0.3 }, 0.3, pick(rnd, 1.2, 2), 0.6, { lid: 0.2, mouth: true }) }],
  // Panting: the mouth open, the jaw beating with the breath.
  pant: rnd => [{ at: 0, g: G({ jawOpen: 0.3, lipsWide: 0.25, earL: 0.15, earR: 0.15 }, 0.4, pick(rnd, 2.5, 4), 0.6, { pulse: { hz: 3.2, weights: { jawOpen: 0.1, breath: 0.35 } }, mouth: true }) }],
  // « Puppy eyes » (AU101, Kaminski 2017): the inner brows up, the eyes up to the person.
  puppyEyes: rnd => [{ at: 0, g: G({ browInnerUp: 0.7, earL: 0.2, earR: 0.2 }, 0.25, pick(rnd, 0.6, 1.2), 0.4, { look: { x: 0, y: 0.3 } }) }],
  // A dog's head tilt, always to its own side (Sommese 2021), ears forward, the inner brows up.
  dogTilt: (rnd, ctx) => [{ at: 0, g: G({ headTilt: 0.45 * ctx.tilt, earL: -0.4, earR: -0.4, browInnerUp: 0.3 }, 0.3, pick(rnd, 1, 2), 0.5) }],
  // Surprised: the ears forward at once, the head up, the jaw a little open (never wide eyes: on a cat they mean a threat).
  animalSurprise: () => [{ at: 0, g: G({ earL: -1, earR: -1, jawOpen: 0.1 }, 0.08, 0.5, 0.6, { head: { yaw: 0, pitch: 0.3 }, mouth: true }) }],
  // Sad: the inner brows up (a dog's), the ears back, the head and the eyes down.
  animalSad: rnd => [{ at: 0, g: G({ browInnerUp: 0.5, earL: 0.4, earR: 0.4 }, 0.8, pick(rnd, 1.5, 2.2), 1, { look: { x: 0, y: -0.4 }, head: { yaw: 0, pitch: -0.5 }, lid: 0.2 }) }],
  // Afraid (defensive, Bennett 2017): the ears flat, the head back and away, the mouth open, the lips back, the nose wrinkled.
  animalFear: rnd => { const s = side(rnd); return [{ at: 0, g: G({ earL: 1, earR: 1, jawOpen: 0.25, lipsWide: 0.4, noseWrinkle: 0.5 }, 0.12, pick(rnd, 0.8, 1.2), 0.8, { head: { yaw: 0.3 * s, pitch: 0.25 }, look: { x: -0.25 * s, y: 0 }, mouth: true }) }]; },
  // Angry: a snarl, the muzzle wrinkled and the upper lip up, the ears flat, the eyes narrowed, the head down.
  animalAnger: rnd => [{ at: 0, g: G({ earL: 0.8, earR: 0.8, jawOpen: 0.25, lipsWide: 0.35, noseWrinkle: 0.75 }, 0.2, pick(rnd, 0.8, 1.3), 0.7, { squint: { left: 0.4, right: 0.4, lag: 0 }, head: { yaw: 0, pitch: -0.3 }, mouth: true }) }],
  // Interested: the ears forward, the head tilted.
  animalInterest: (rnd, ctx) => [{ at: 0, g: G({ earL: -0.6, earR: -0.6, headTilt: 0.35 * ctx.tilt }, 0.3, pick(rnd, 1, 2), 0.5, { look: { x: 0, y: 0.1 } }) }],
  // Tender: soft eyes, the head tilted, the ears relaxed.
  animalTender: (rnd, ctx) => [{ at: 0, g: G({ headTilt: 0.3 * ctx.tilt, earL: 0.25, earR: 0.25 }, 0.8, pick(rnd, 1.8, 2.6), 1, { lid: 0.5 }) }],
  // Proud: the head up, the lids a little lowered.
  animalPride: rnd => [{ at: 0, g: G({}, 0.6, pick(rnd, 1.2, 1.8), 0.9, { head: { yaw: 0, pitch: 0.4 }, lid: 0.2 }) }],
  // Bored: heavy lids, the eyes aside and down; then a yawn.
  animalBored: rnd => {
    const s = side(rnd);
    return [
      { at: 0, g: G({ headTilt: 0.25 * s }, 0.9, pick(rnd, 1.4, 2), 1, { lid: 0.45, look: { x: 0.5 * s, y: -0.25 }, head: { yaw: 0.2 * s, pitch: -0.25 } }) },
      { at: 2.2, g: G({ jawOpen: 0.9, lipsWide: 0.3, earL: 0.35, earR: 0.35 }, 0.8, 0.35, 0.7, { lid: 0.85, head: { yaw: 0, pitch: 0.3 }, mouth: true }) },
    ];
  },
  // A greeting rub (lions, cats): the head sweeping from one side to the other, the eyes half closed.
  headRub: rnd => [{ at: 0, g: G({}, 0.5, pick(rnd, 1.4, 2), 0.7, { swing: { hz: 0.7, amp: 0.5 }, lid: 0.5 }) }],
  // The ears dancing: one back, then the other, quick, four times; then both up.
  earDance: (rnd, ctx) => {
    const phases: Phase[] = [];
    for (let i = 0; i < 4; i++) phases.push({ at: i * 0.28, g: G((i % 2 === 0) === (ctx.tilt > 0) ? { earL: 0.85 } : { earR: 0.85 }, 0.06, 0.08, 0.12) });
    phases.push({ at: 1.2, g: G({ earL: -0.8, earR: -0.8 }, 0.1, pick(rnd, 0.3, 0.5), 0.4, { swing: { hz: 2, amp: 0.25 } }) });
    return phases;
  },
  // A dog seeing its person come back: the ears up, the inner brows, then the open mouth, panting quick.
  excited: rnd => [
    { at: 0, g: G({ earL: -0.7, earR: -0.7, browInnerUp: 0.5 }, 0.12, 0.4, 0.4, { look: { x: 0, y: 0.25 } }) },
    { at: 0.5, g: G({ jawOpen: 0.4, lipsWide: 0.3, earL: 0.3, earR: 0.3 }, 0.3, pick(rnd, 1.4, 2.2), 0.6, { lid: 0.15, pulse: { hz: 5, weights: { jawOpen: 0.1 } }, mouth: true }) },
  ],
} satisfies Record<string, (rnd: Random, ctx: AnimalContext) => Phase[]>;

export type AnimalMoveId = keyof typeof ANIMAL_MOVES;

/** An animal's ways: what it does on its own, how often it blinks, how slowly it moves, what a person's move becomes on it. */
export interface SpeciesWays {
  /** Its own moves at rest and while it waits, with how often each (any MoveId: a person's that suits it too). */
  idle: ReadonlyArray<[string, number]>;
  waitIdle: ReadonlyArray<[string, number]>;
  /** Seconds between two blinks. */
  blinkGap: [number, number];
  /** Its moves last this many times longer than a person's (a bear is slow). */
  tempo: number;
  /** A person's move on this animal: its own way of saying it, or null (nothing). Moves absent here play as they are. */
  resolve: Readonly<Record<string, string | null>>;
  /** What it does when the person comes back after a wait. */
  back: string;
  /** Its own moves, as the Studio offers them. */
  own: readonly string[];
  /** Its clowning (a double click on its face). */
  funny: readonly string[];
}

/** A person's moves that never suit an animal unless resolved (a smile, a smirk, pressed lips, a frown…). */
const HUMAN_ONLY = ['smile', 'joy', 'smirk', 'doubt', 'pensive', 'concentrate', 'shyGlance', 'ideaComes', 'emphasis', 'browRaise', 'browRaiseOne', 'ponder', 'sigh', 'lowerAndLift',
  'laugh', 'giggle', 'wink', 'yawnLong', 'sneeze', 'daydream', 'kiss', 'eyeRoll', 'thinkUpLeft', 'thinkUpRight',
  'puffCheeks', 'crossEyes', 'fishFace', 'wonky', 'scrunch', 'bigEyes', 'dizzy', 'raspberry',
  'fear', 'anger', 'disgust', 'contempt', 'embarrassed', 'amused', 'relief', 'interest', 'confusion', 'bored', 'awe', 'tender', 'pride', 'skeptical', 'determined', 'shame', 'sad', 'surprise'];

/** What every animal makes of a person's emotions, before its own differences. */
const COMMON: Record<string, string | null> = {
  ...Object.fromEntries(HUMAN_ONLY.map(id => [id, null])),
  surprise: 'animalSurprise', sad: 'animalSad', shame: 'animalSad', embarrassed: 'animalSad', fear: 'animalFear', anger: 'animalAnger', determined: 'animalAnger',
  interest: 'animalInterest', awe: 'animalInterest', curious: 'animalInterest', confusion: 'animalInterest', tender: 'animalTender', relief: 'animalTender',
  pride: 'animalPride', bored: 'animalBored', eyeRoll: 'animalBored', disgust: 'flehmen', yawnLong: 'yawn', daydream: 'animalTender', skeptical: 'earSwivel', browRaise: 'earsPerk', browRaiseOne: 'earSwivel', emphasis: 'earsPerk',
};

export const SPECIES: Record<AnimalSpecies, SpeciesWays> = {
  cat: {
    idle: [['slowBlink', 1.2], ['animalInterest', 1], ['earSwivel', 1], ['sniff', 0.6], ['squint', 0.8], ['glance', 1], ['lookAround', 0.8], ['animalTender', 0.5], ['yawn', 0.25]],
    waitIdle: [['slowBlink', 1.5], ['yawn', 0.8], ['earSwivel', 1.2], ['lookAround', 1.5], ['glance', 1.2], ['squint', 1], ['animalBored', 0.6]],
    // A few blinks a minute while it faces you (Koyasu 2021: 4.1 a minute).
    blinkGap: [10, 24],
    tempo: 1,
    resolve: { ...COMMON, smile: 'slowBlink', joy: 'slowBlink', amused: 'slowBlink', laugh: 'slowBlink', ideaComes: 'earsPerk', pensive: 'earSwivel', doubt: 'earSwivel', listen: 'animalInterest' },
    back: 'slowBlink',
    own: ['slowBlink', 'purr', 'earsPerk', 'earsBack', 'earSwivel', 'earFlickL', 'earFlickR', 'earDance', 'sniff', 'flehmen', 'yawn', 'headRub'],
    funny: ['earDance', 'flehmen', 'yawn', 'slowBlink'],
  },
  dog: {
    idle: [['dogTilt', 1.2], ['puppyEyes', 1], ['pant', 0.8], ['playFace', 0.6], ['sniff', 0.8], ['listen', 1], ['glance', 1], ['lookAround', 1], ['yawn', 0.25]],
    waitIdle: [['sniff', 1.2], ['yawn', 0.8], ['puppyEyes', 1.2], ['lookAround', 1.5], ['glance', 1.2], ['pant', 0.6], ['animalBored', 0.6]],
    // 6.5 blinks a minute while it faces you (Koyasu 2021).
    blinkGap: [6, 12],
    tempo: 1,
    resolve: { ...COMMON, smile: 'playFace', joy: 'playFace', amused: 'playFace', laugh: 'playFace', curious: 'dogTilt', confusion: 'dogTilt', doubt: 'dogTilt', interest: 'dogTilt', ideaComes: 'puppyEyes', pensive: 'puppyEyes', sad: 'animalSad', listen: 'listen' },
    back: 'excited',
    own: ['dogTilt', 'puppyEyes', 'playFace', 'pant', 'excited', 'earsPerk', 'earsBack', 'earFlickL', 'earFlickR', 'earDance', 'sniff', 'yawn'],
    funny: ['earDance', 'excited', 'listen', 'dogTilt'],
  },
  bear: {
    // No sway (distress) and nothing that pushes the lips out (fear).
    idle: [['sniffAir', 1.5], ['lookAround', 1], ['glance', 0.8], ['animalInterest', 0.6], ['playFace', 0.3], ['yawn', 0.4], ['nod', 0.4]],
    waitIdle: [['sniffAir', 1.5], ['yawn', 1], ['lookAround', 1.5], ['glance', 1], ['animalBored', 0.6]],
    blinkGap: [8, 20],
    tempo: 1.35,
    resolve: { ...COMMON, smile: 'playFace', joy: 'playFace', amused: 'playFace', laugh: 'playFace', sway: null, ideaComes: 'earsPerk', pensive: 'sniffAir', doubt: 'sniffAir' },
    back: 'sniffAir',
    own: ['sniffAir', 'playFace', 'yawn', 'earsPerk', 'earsBack', 'earFlickL', 'earFlickR', 'earDance'],
    funny: ['earDance', 'playFace', 'sniffAir'],
  },
  lion: {
    idle: [['slowBlink', 1.2], ['lookAround', 1.2], ['glance', 1], ['yawn', 0.5], ['sniff', 0.4], ['animalInterest', 0.5], ['squint', 0.6]],
    waitIdle: [['yawn', 1.5], ['slowBlink', 1.2], ['lookAround', 1.5], ['glance', 1], ['animalBored', 0.5]],
    blinkGap: [10, 24],
    tempo: 1.15,
    resolve: { ...COMMON, smile: 'slowBlink', joy: 'slowBlink', amused: 'slowBlink', laugh: 'slowBlink', ideaComes: 'slowBlink', pensive: 'glance', doubt: 'glance' },
    back: 'headRub',
    own: ['slowBlink', 'yawn', 'sniff', 'flehmen', 'headRub'],
    funny: ['flehmen', 'yawn', 'headRub'],
  },
};

/**
 * A spoken sentence's tone on an animal (speechTone gives a person's): a question tilts a
 * dog's head and pricks a cat's ears, gladness softens the eyes, an apology lowers the head
 * and the ears, a warning flattens them. Never the jaw or the lips: the voice has them.
 */
export function speciesTone(species: AnimalSpecies, tone: string, rnd: Random, ctx: AnimalContext): Gesture | null {
  const hold = pick(rnd, 1, 2);
  switch (tone) {
    case 'question':
      return species === 'dog'
        ? { weights: { headTilt: 0.45 * ctx.tilt, browInnerUp: 0.4, earL: -0.4, earR: -0.4 }, rise: 0.3, hold, fall: 0.6 }
        : { weights: { earL: -0.6, earR: -0.6, headTilt: 0.2 * ctx.tilt }, lid: 0.3, rise: 0.25, hold, fall: 0.6 };
    case 'exclaim':
      return { weights: { earL: -0.8, earR: -0.8 }, head: { yaw: 0, pitch: 0.2 }, rise: 0.12, hold: hold * 0.6, fall: 0.5 };
    case 'happy':
      return species === 'dog'
        ? { weights: { earL: 0.3, earR: 0.3, browInnerUp: 0.2 }, lid: 0.2, rise: 0.35, hold, fall: 0.8 }
        : { weights: { earL: -0.15, earR: -0.15 }, lid: 0.45, rise: 0.4, hold: hold * 0.6, fall: 0.6 };
    case 'sorry':
      return { weights: { earL: 0.45, earR: 0.45, ...(species === 'dog' ? { browInnerUp: 0.6 } : {}) }, head: { yaw: 0, pitch: -0.35 }, look: { x: 0, y: -0.2 }, rise: 0.5, hold, fall: 0.8 };
    case 'doubt':
      return { weights: species === 'dog' ? { headTilt: 0.35 * ctx.tilt, earL: -0.3, earR: -0.3 } : { earL: 0.4, earR: -0.3 }, look: { x: 0.35 * ctx.tilt, y: 0.2 }, rise: 0.4, hold, fall: 0.7 };
    case 'warn':
      return { weights: { earL: 0.8, earR: 0.8 }, squint: { left: 0.25, right: 0.25, lag: 0 }, head: { yaw: 0, pitch: -0.25 }, rise: 0.25, hold, fall: 0.6 };
    default: {
      const r = rnd();
      if (r < 0.4) return null;
      if (r < 0.7) return { weights: side(rnd) > 0 ? { earL: 0.5 } : { earR: 0.5 }, rise: 0.08, hold: 0.1, fall: 0.25 };
      return { weights: { headTilt: 0.25 * ctx.tilt }, rise: 0.4, hold: 0.6, fall: 0.6 };
    }
  }
}
