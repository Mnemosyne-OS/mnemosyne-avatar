/**
 * faceEmotions — the emotions a face can show, as recipes (doc 180 §29).
 *
 * Each one is what the research on facial action (FACS, Ekman & Friesen; and
 * the studies named on each) finds on a face feeling it, put onto the
 * movements this face has (faceShapes). The basic ones (fear, anger, disgust,
 * contempt) are played on purpose only; the quiet ones (interest, amusement,
 * tenderness, relief, confusion, boredom) also come on their own now and
 * then, more when her mood leans their way (faceMood). Each draws its own
 * variation (side, strength, timing), so no two are played alike.
 *
 * What a recipe cannot do: widen the eyes (the photo's eye is as open as it
 * is); fear and surprise read through the brows, the mouth and the head.
 *
 * @module avatar/faceEmotions
 */
import { G, pick, side, type Phase, type Random } from './faceGesture';

export const EMOTIONS = {
  // Fear: the inner brows up AND drawn together (the worried brow), the whole brow up, the lips
  // stretched back, the jaw a little open; the head draws back and away, the eyes still on it.
  fear: rnd => {
    const s = side(rnd);
    return [{ at: 0, g: G({ browInnerUp: 0.85, browUpL: 0.5, browUpR: 0.5, browFrown: 0.35, lipsWide: 0.5, jawOpen: 0.2 }, 0.15, pick(rnd, 0.9, 1.4), 0.9, { squint: { left: 0.3, right: 0.3, lag: 0 }, head: { yaw: 0.3 * s, pitch: 0.35 }, look: { x: -0.25 * s, y: 0.05 }, mouth: true }) }];
  },
  // Anger: brows down and together, the lids tightened, the lips pressed thin, the chin pushed up; the head lowers, the eyes hold.
  anger: rnd => [{ at: 0, g: G({ browFrown: 0.9, lipPress: 0.6, chinRaise: 0.3, cheekRaise: 0.1 }, 0.25, pick(rnd, 1, 1.6), 0.9, { squint: { left: 0.5, right: 0.5, lag: 0 }, head: { yaw: 0, pitch: -0.35 }, mouth: true }) }],
  // Disgust (EMFACS 9+15+17): the nose wrinkles, the corners of the mouth drop, the chin pushes up, the eyes narrow; the head turns away.
  disgust: rnd => {
    const s = side(rnd);
    return [{ at: 0, g: G({ noseWrinkle: 0.75, browFrown: 0.4, mouthFrown: 0.45, chinRaise: 0.3, cheekRaise: 0.35 }, 0.3, pick(rnd, 0.9, 1.4), 0.8, { squint: { left: 0.45, right: 0.35, lag: 0.05 }, head: { yaw: 0.35 * s, pitch: 0.2 }, look: { x: -0.2 * s, y: -0.1 }, mouth: true }) }];
  },
  // Contempt: one corner of the mouth tightened up, the head lifted a little, looking down the nose, lids lowered.
  contempt: rnd => {
    const s = side(rnd);
    return [{ at: 0, g: G({ ...(s > 0 ? { smileL: 0.5 } : { smileR: 0.5 }), mouthSide: -0.2 * s, lipPress: 0.2, headTilt: -0.2 * s }, 0.4, pick(rnd, 1, 1.6), 0.8, { head: { yaw: 0.1 * s, pitch: 0.35 }, look: { x: 0, y: -0.15 }, lid: 0.25, mouth: true }) }];
  },
  // Embarrassment, in the order Keltner (1995) timed it: the eyes drop (0.7 s in), the lips press
  // to hold back a smile (1.5 s) that comes anyway (2 s), the head turns away and down (2.2 s);
  // two quick glances up; then it settles, about five seconds in all.
  embarrassed: rnd => {
    const s = side(rnd);
    return [
      { at: 0, g: G({ browInnerUp: 0.2 }, 0.5, 3.4, 0.9, { look: { x: 0.25 * s, y: -0.65 }, lid: 0.3 }) },
      { at: 1.3, g: G({ lipPress: 0.45, smileL: 0.4, smileR: 0.35, cheekRaise: 0.2 }, 0.6, pick(rnd, 1.8, 2.4), 0.8, { mouth: true }) },
      { at: 1.9, g: G({}, 0.5, 1.8, 0.9, { head: { yaw: 0.35 * s, pitch: -0.6 } }) },
      { at: 2.7, g: G({}, 0.12, 0.2, 0.15, { look: { x: -0.2 * s, y: 0.75 } }) },
      { at: 3.5, g: G({}, 0.12, 0.2, 0.15, { look: { x: -0.2 * s, y: 0.75 } }) },
    ];
  },
  // Amused: a real smile (the cheeks up, the eyes narrowed), then a few chuckles, the head lifting with each.
  amused: rnd => [
    { at: 0, g: G({ smileL: 0.8, smileR: 0.75, cheekRaise: 0.5 }, 0.4, pick(rnd, 1.6, 2.2), 1, { squint: { left: 0.55, right: 0.55, lag: 0.04 } }) },
    { at: 0.5, g: G({}, 0.15, pick(rnd, 0.8, 1.2), 0.4, { pulse: { hz: pick(rnd, 4, 5), weights: { jawOpen: 0.22 }, pitch: 0.18 }, head: { yaw: 0, pitch: 0.25 }, mouth: true }) },
  ],
  // Relief: a breath out, the eyes half closing, the head lowering; then it lifts on a smile.
  relief: rnd => [
    { at: 0, g: G({ breath: 0.9 }, 0.45, 0.1, 0.4, { head: { yaw: 0, pitch: 0.2 } }) },
    { at: 0.5, g: G({ breath: -0.5, browInnerUp: 0.35, lipsRound: 0.35, jawOpen: 0.1 }, 0.5, pick(rnd, 0.4, 0.7), 1, { head: { yaw: 0, pitch: -0.5 }, lid: 0.4, mouth: true }) },
    { at: 1.7, g: G({ smileL: 0.5, smileR: 0.45, cheekRaise: 0.2 }, 0.5, pick(rnd, 0.9, 1.4), 1, { head: { yaw: 0, pitch: 0.1 } }) },
  ],
  // Interest: the brows lifted a little, the lips parted, the head tilted, the eyes on the person.
  interest: rnd => {
    const s = side(rnd);
    return [{ at: 0, g: G({ browUpL: 0.32, browUpR: 0.3, browInnerUp: 0.2, smileL: 0.15, smileR: 0.13, jawOpen: 0.06, headTilt: 0.25 * s }, 0.4, pick(rnd, 1.4, 2.2), 0.8, { head: { yaw: 0, pitch: 0.08 }, mouth: true }) }];
  },
  // Confusion (Rozin & Cohen 2003): the brows lowered, one lifted more than the other, the eyes narrowed, the head tilted.
  confusion: rnd => {
    const s = side(rnd);
    return [{ at: 0, g: G({ browFrown: 0.45, ...(s > 0 ? { browUpL: 0.45 } : { browUpR: 0.45 }), headTilt: 0.5 * s, mouthFrown: 0.15, lipPress: 0.15 }, 0.45, pick(rnd, 1.2, 1.8), 0.8, { squint: { left: 0.3, right: 0.3, lag: 0.06 }, look: { x: 0.15 * s, y: 0.2 }, mouth: true }) }];
  },
  // Bored: heavy lids, the eyes and the head drifting aside, then a sigh.
  bored: rnd => {
    const s = side(rnd);
    return [
      { at: 0, g: G({ headTilt: 0.35 * s }, 0.9, pick(rnd, 1.6, 2.4), 1, { lid: 0.4, look: { x: 0.5 * s, y: -0.25 }, head: { yaw: 0.25 * s, pitch: -0.25 } }) },
      { at: 2.2, g: G({ lipsRound: 0.4, jawOpen: 0.1, browInnerUp: 0.25 }, 0.6, 0.6, 0.9, { head: { yaw: 0, pitch: -0.5 }, lid: 0.3, mouth: true }) },
    ];
  },
  // Awe (Campos 2013): the inner brows up, the jaw dropping, no smile, the eyes lifted a little; slowly.
  awe: rnd => [{ at: 0, g: G({ browInnerUp: 0.6, browUpL: 0.45, browUpR: 0.45, jawOpen: 0.3 }, 1.1, pick(rnd, 1.3, 2), 1.4, { head: { yaw: 0, pitch: 0.15 }, look: { x: 0, y: 0.3 }, mouth: true }) }],
  // Tenderness: the head tilted, a soft smile, the lids lowered a little, the inner brows up.
  tender: rnd => {
    const s = side(rnd);
    return [{ at: 0, g: G({ headTilt: 0.5 * s, smileL: 0.45, smileR: 0.42, cheekRaise: 0.2, browInnerUp: 0.2 }, 0.9, pick(rnd, 1.8, 2.6), 1.2, { lid: 0.3 }) }];
  },
  // Pride (Tracy & Robins 2004): a small smile, the chin up, the head tilted back, looking down the nose.
  pride: rnd => [{ at: 0, g: G({ smileL: 0.4, smileR: 0.4, chinRaise: 0.2, browUpL: 0.15, browUpR: 0.15 }, 0.6, pick(rnd, 1.3, 1.8), 1, { head: { yaw: 0, pitch: 0.5 }, look: { x: 0, y: -0.2 }, lid: 0.15, mouth: true }) }],
  // Skeptical: one brow up, the other down, the lips pressed to one side, the eyes narrowed, the head back a little.
  skeptical: rnd => {
    const s = side(rnd);
    return [{ at: 0, g: G({ ...(s > 0 ? { browUpL: 0.7, smileR: 0.2 } : { browUpR: 0.7, smileL: 0.2 }), mouthSide: -0.3 * s, browFrown: 0.25, lipPress: 0.3, headTilt: -0.2 * s }, 0.35, pick(rnd, 1, 1.5), 0.7, { squint: { left: 0.25, right: 0.25, lag: 0 }, head: { yaw: -0.1 * s, pitch: 0.15 }, mouth: true }) }];
  },
  // Determined: brows down, lips pressed, the eyes narrowed; then a firm nod.
  determined: rnd => [
    { at: 0, g: G({ browFrown: 0.5, lipPress: 0.5, chinRaise: 0.3 }, 0.35, pick(rnd, 1.2, 1.6), 0.8, { squint: { left: 0.2, right: 0.2, lag: 0 }, mouth: true }) },
    { at: 0.8, g: G({}, 0.2, 0.1, 0.35, { head: { yaw: 0, pitch: -0.8 } }) },
  ],
  // Shame: the head lowered, the eyes down, the inner brows up, the corners of the mouth down, heavy lids.
  shame: rnd => [{ at: 0, g: G({ browInnerUp: 0.5, mouthFrown: 0.3 }, 0.8, pick(rnd, 1.6, 2.4), 1.1, { head: { yaw: 0, pitch: -0.95 }, look: { x: 0, y: -0.75 }, lid: 0.3, mouth: true }) }],
} satisfies Record<string, (rnd: Random) => Phase[]>;

export type EmotionId = keyof typeof EMOTIONS;

/** What playing an emotion on purpose does to her mood (valence, arousal): it lingers after the face. */
export const EMOTION_MOOD: Partial<Record<string, readonly [number, number]>> = {
  joy: [0.3, 0.15], smile: [0.15, 0], amused: [0.35, 0.2], tender: [0.3, -0.1], relief: [0.2, -0.15], pride: [0.2, 0.1],
  sad: [-0.3, -0.1], shame: [-0.3, -0.1], fear: [-0.2, 0.4], anger: [-0.2, 0.4], disgust: [-0.2, 0.1],
  bored: [-0.05, -0.2], surprise: [0, 0.3], awe: [0.15, 0.2], interest: [0.05, 0.15],
  laugh: [0.35, 0.25], giggle: [0.25, 0.15], wink: [0.15, 0.05], kiss: [0.25, 0],
};
