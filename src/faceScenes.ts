/**
 * faceScenes — small scenes a person's face plays, longer than a gesture
 * (doc 180 §34): a real laugh, a giggle held back, a wink, a long yawn, a
 * sneeze, a daydream, a kiss blown. Each is timed on what is measured of it:
 *  - a laugh: « ha » pulses every ~210 ms (Trouvain 2003), four or five in
 *    a bout of about a second, slowing; the head back, the eyes narrowed,
 *    the cheeks up (Keltner 2019: AU 6+7+12+25+26+53);
 *  - a yawn: about six seconds (Provine 2005), the jaw opening wide on a
 *    long breath in, the head back, the eyes narrowing then shut at the
 *    peak, then a shorter breath out and a blink or two;
 *  - a sneeze: a few catching breaths (« ah… ah… »), then the snap, the eyes
 *    shut, the head jerked down (its timing is not measured anywhere found:
 *    set by eye).
 * They are a person's: on an animal they become its own (faceSpecies) or
 * nothing.
 *
 * @module avatar/faceScenes
 */
import { G, pick, side, type Phase, type Random } from './faceGesture';

/**
 * The thinking look (thinkUp*, lookUp*): up toward screen side `s`, held; with `sigh`, a breath in
 * and a slow breath out while the gaze stays up, then a moment more before it comes back.
 */
function thinkUp(rnd: Random, s: 1 | -1, sigh: boolean): Phase[] {
  const hold = sigh ? pick(rnd, 3.4, 3.8) : pick(rnd, 1.4, 2);
  const up = { at: 0, g: G({ browInnerUp: 0.25, ...(s > 0 ? { browUpR: 0.2 } : { browUpL: 0.2 }) }, 0.7, hold, 0.9, { look: { x: 0.55 * s, y: 0.65 }, head: { yaw: 0.25 * s, pitch: 0.45 } }) };
  if (!sigh) return [up];
  return [
    up,
    { at: 1.5, g: G({ breath: 1, browInnerUp: 0.2 }, 0.55, 0.15, 0.5, { head: { yaw: 0, pitch: 0.15 } }) },
    { at: 2.15, g: G({ breath: -0.55, lipsRound: 0.45, jawOpen: 0.12, browInnerUp: 0.3 }, 0.6, 0.5, 1.2, { head: { yaw: 0, pitch: -0.2 }, mouth: true }) },
  ];
}

export const SCENES = {
  // A real laugh: the smile comes, then the « ha »s (jaw and head beating together), slowing, then it settles.
  laugh: rnd => [
    { at: 0, g: G({ smileL: 0.95, smileR: 0.9, cheekRaise: 0.7, browInnerUp: 0.15 }, 0.35, pick(rnd, 2, 2.6), 1, { squint: { left: 0.7, right: 0.7, lag: 0.03 } }) },
    { at: 0.3, g: G({ jawOpen: 0.2 }, 0.15, pick(rnd, 0.9, 1.2), 0.5, { pulse: { hz: 4.7, weights: { jawOpen: 0.3 }, pitch: 0.25 }, head: { yaw: 0, pitch: 0.6 }, mouth: true }) },
    { at: 1.5, g: G({}, 0.15, 0.5, 0.5, { pulse: { hz: 3.6, weights: { jawOpen: 0.15 }, pitch: 0.15 }, mouth: true }) },
  ],
  // A giggle held back: the lips pressed over a smile, the head bobbing a little, the eyes down.
  giggle: rnd => [
    { at: 0, g: G({ lipPress: 0.4, smileL: 0.55, smileR: 0.5, cheekRaise: 0.35 }, 0.25, pick(rnd, 1, 1.5), 0.6, { squint: { left: 0.4, right: 0.4, lag: 0 }, look: { x: 0.15 * side(rnd), y: -0.35 }, pulse: { hz: 5, pitch: 0.12 }, head: { yaw: 0, pitch: -0.3 }, mouth: true }) },
  ],
  // A wink: one eye shut quick, that side's cheek and corner of the mouth up.
  wink: rnd => {
    const s = side(rnd);
    return [{ at: 0, g: G(s > 0 ? { smileL: 0.5, cheekRaise: 0.4, browUpR: 0.15 } : { smileR: 0.5, cheekRaise: 0.4, browUpL: 0.15 }, 0.1, pick(rnd, 0.2, 0.35), 0.22, { wink: s > 0 ? { left: 1, right: 0 } : { left: 0, right: 1 }, squint: s > 0 ? { left: 0.4, right: 0.15, lag: 0 } : { left: 0.15, right: 0.4, lag: 0 }, head: { yaw: 0, pitch: -0.15 } }) }];
  },
  // A long yawn (Provine: ~6 s): the jaw opening slowly on the breath in, the head back, the eyes
  // narrowing then shut at the peak, the brows up; the breath out shorter; then a blink or two.
  yawnLong: rnd => [
    { at: 0, g: G({ jawOpen: 1, lipsWide: 0.25, browUpL: 0.4, browUpR: 0.4, browInnerUp: 0.2, breath: 1 }, 2.6, pick(rnd, 0.8, 1.2), 1.4, { head: { yaw: 0, pitch: 1 }, squint: { left: 0.5, right: 0.5, lag: 0 }, lid: 0.75, mouth: true }) },
    { at: 2.4, g: G({}, 0.3, 0.8, 0.5, { lid: 1 }) },
    { at: 5.2, g: G({}, 0.08, 0.04, 0.1, { lid: 1 }) },
    { at: 5.6, g: G({}, 0.08, 0.04, 0.1, { lid: 1 }) },
  ],
  // A sneeze: two or three catching breaths, the head going back, the nose wrinkling, the eyes
  // half shut; then the snap, eyes shut and the head jerked down; then a blink.
  sneeze: rnd => {
    const catches = rnd() < 0.5 ? 2 : 3;
    const phases: Phase[] = [];
    for (let i = 0; i < catches; i++) {
      phases.push({ at: i * 0.6, g: G({ browInnerUp: 0.5, noseWrinkle: 0.4 + 0.1 * i, jawOpen: 0.25 + 0.05 * i }, 0.3, 0.12, 0.25, { head: { yaw: 0, pitch: 0.4 + 0.2 * i }, lid: 0.5, mouth: true }) });
    }
    const snap = catches * 0.6 + 0.1;
    phases.push({ at: snap, g: G({ noseWrinkle: 0.85, lipPress: 0.3, browFrown: 0.4 }, 0.06, 0.18, 0.4, { head: { yaw: 0, pitch: -1 }, pulse: { hz: 2.5, pitch: -0.4 }, lid: 1, squint: { left: 1, right: 1, lag: 0 }, mouth: true }) });
    phases.push({ at: snap + 1, g: G({ browInnerUp: 0.2 }, 0.08, 0.05, 0.12, { lid: 1 }) });
    return phases;
  },
  // A daydream: the eyes off and up, unfocused, the lids a little heavy, a faint smile, a slow sway.
  daydream: rnd => {
    const s = side(rnd);
    return [{ at: 0, g: G({ smileL: 0.2, smileR: 0.18 }, 1.2, pick(rnd, 3, 4.5), 1.4, { look: { x: 0.4 * s, y: 0.45 }, head: { yaw: 0.15 * s, pitch: 0.2 }, lid: 0.25, swing: { hz: 0.25, amp: 0.25 } }) }];
  },
  // An eye roll, fed up: the eyes rolled up and aside under half-shut lids, the lips pressed to
  // one side, the head tilted; then a sigh, the head dropping.
  eyeRoll: rnd => {
    const s = side(rnd);
    return [
      { at: 0, g: G({ browUpL: 0.3, browUpR: 0.3, mouthSide: 0.4 * s, lipPress: 0.35, headTilt: 0.3 * s }, 0.45, pick(rnd, 0.8, 1.1), 0.6, { look: { x: 0.35 * s, y: 0.85 }, lid: 0.4, head: { yaw: 0.1 * s, pitch: 0.25 }, mouth: true }) },
      { at: 1.4, g: G({ lipsRound: 0.35, jawOpen: 0.08, browInnerUp: 0.2, breath: 0.8 }, 0.5, 0.5, 0.9, { head: { yaw: 0, pitch: -0.45 }, lid: 0.35, mouth: true }) },
    ];
  },
  // Thinking, for a film: the eyes and the head go up to one side of the screen and stay there; a
  // sigh while she is still up there (the head dips only a little, the gaze does not come down);
  // the gaze held a moment more, then back to the centre. Left and right are the screen's (look.x
  // > 0 is the viewer's right), fixed so a film can put her look toward its picture.
  thinkUpLeft: rnd => thinkUp(rnd, -1, true),
  thinkUpRight: rnd => thinkUp(rnd, 1, true),
  // The same look up, without the sigh: no mouth in it, so it plays while she speaks (a « hmmm »).
  lookUpLeft: rnd => thinkUp(rnd, -1, false),
  lookUpRight: rnd => thinkUp(rnd, 1, false),
  // A kiss blown: the lips pursed, the lids lowered, the head tilted.
  kiss: rnd => [
    { at: 0, g: G({ lipsRound: 0.85, lipPress: 0.2, headTilt: 0.3 * side(rnd) }, 0.35, pick(rnd, 0.5, 0.8), 0.5, { lid: 0.5, mouth: true }) },
    { at: 1.1, g: G({ smileL: 0.4, smileR: 0.4 }, 0.3, 0.6, 0.6, {}) },
  ],
} satisfies Record<string, (rnd: Random) => Phase[]>;

export type SceneId = keyof typeof SCENES;

/**
 * Grimaces, for fun (a double click on her face): each a face a child would pull, over in two or
 * three seconds. A person's; an animal plays its own (faceSpecies `funny`).
 */
export const GRIMACES = {
  // Puffed cheeks, the lips pressed on the air, the brows up; then the air pops out.
  puffCheeks: rnd => [
    { at: 0, g: G({ cheekPuff: 1, lipPress: 0.7, lipsRound: 0.2, browUpL: 0.45, browUpR: 0.45 }, 0.25, pick(rnd, 1, 1.4), 0.15, { mouth: true }) },
    { at: 1.35, g: G({ jawOpen: 0.3, lipsRound: 0.5, browUpL: 0.6, browUpR: 0.6 }, 0.06, 0.12, 0.45, { mouth: true }) },
  ],
  // Cross-eyed, the mouth pushed aside and a little open, the head tilted.
  crossEyes: rnd => {
    const s = side(rnd);
    return [{ at: 0, g: G({ browUpL: 0.5, browUpR: 0.5, browInnerUp: 0.3, mouthSide: 0.35 * s, jawOpen: 0.15, headTilt: 0.3 * s }, 0.3, pick(rnd, 1.2, 1.6), 0.5, { cross: 1, mouth: true }) }];
  },
  // A fish: the cheeks sucked in, the lips pursed and gulping, the brows up.
  fishFace: rnd => [
    { at: 0, g: G({ cheekPuff: -0.9, lipsRound: 1, lipPress: 0.3, browUpL: 0.6, browUpR: 0.6 }, 0.3, pick(rnd, 1.6, 2), 0.5, { pulse: { hz: 2, weights: { jawOpen: 0.18 } }, mouth: true }) },
  ],
  // A wonky face: the mouth twisted to one side and up there, one brow up and the other down, that other eye squeezed.
  wonky: rnd => {
    const s = side(rnd);
    return [{ at: 0, g: G({ mouthSide: 0.9 * s, ...(s > 0 ? { smileR: 0.9, browUpL: 1 } : { smileL: 0.9, browUpR: 1 }), browFrown: 0.45, headTilt: -0.4 * s }, 0.25, pick(rnd, 1.1, 1.5), 0.5, { squint: s > 0 ? { left: 0, right: 0.85, lag: 0 } : { left: 0.85, right: 0, lag: 0 }, mouth: true }) }];
  },
  // Everything scrunched (the nose, the eyes, the brows, the lips, the chin), then let go at once, eyes wide.
  scrunch: rnd => [
    { at: 0, g: G({ noseWrinkle: 1, browFrown: 1, lipPress: 0.6, chinRaise: 0.6 }, 0.3, pick(rnd, 0.8, 1.1), 0.12, { squint: { left: 1, right: 1, lag: 0 }, mouth: true }) },
    { at: 1.25, g: G({ browUpL: 0.8, browUpR: 0.8, jawOpen: 0.35, lipsRound: 0.3 }, 0.08, 0.3, 0.6, { mouth: true }) },
  ],
  // Cartoon eyes: the brows shot up, the mouth a round « O », the chin tucked; two quick blinks.
  bigEyes: rnd => [
    { at: 0, g: G({ browUpL: 1, browUpR: 1, browInnerUp: 0.5, jawOpen: 0.7, lipsRound: 0.8 }, 0.12, pick(rnd, 1, 1.3), 0.6, { head: { yaw: 0, pitch: -0.3 }, mouth: true }) },
    { at: 0.9, g: G({}, 0.05, 0.03, 0.08, { lid: 1 }) },
    { at: 1.15, g: G({}, 0.05, 0.03, 0.08, { lid: 1 }) },
  ],
  // Dizzy: the head wobbling from shoulder to shoulder, the eyes crossing, droopy lids, the mouth hanging open.
  dizzy: rnd => [
    { at: 0, g: G({ jawOpen: 0.2, browInnerUp: 0.3 }, 0.3, pick(rnd, 1.6, 2), 0.6, { swing: { hz: 1.6, amp: 0.9 }, cross: 0.6, lid: 0.3, mouth: true }) },
  ],
  // A raspberry: the lips pressed and buzzing, the cheeks puffed, the eyes squeezed.
  raspberry: rnd => [
    { at: 0, g: G({ lipPress: 0.5, cheekPuff: 0.6 }, 0.15, pick(rnd, 0.9, 1.2), 0.3, { pulse: { hz: 14, weights: { jawOpen: 0.04, lipsRound: 0.2 } }, squint: { left: 0.5, right: 0.5, lag: 0 }, head: { yaw: 0, pitch: -0.2 }, mouth: true }) },
  ],
} satisfies Record<string, (rnd: Random) => Phase[]>;

export type GrimaceId = keyof typeof GRIMACES;
export const GRIMACE_IDS = Object.keys(GRIMACES) as GrimaceId[];

/** Grimaces pulled in a quick row before she has had enough; the next double click gets a fed-up face. */
export const GRIMACES_BEFORE_FED_UP = 3;
/** Seconds without a double click after which the row starts again. */
export const GRIMACE_ROW_S = 20;
/** A person's fed-up faces (an eye roll, a long yawn, boredom); an animal's: boredom, a yawn. */
export const FED_UP = ['eyeRoll', 'yawnLong', 'bored'] as const;
export const ANIMAL_FED_UP = ['animalBored', 'yawn'] as const;
