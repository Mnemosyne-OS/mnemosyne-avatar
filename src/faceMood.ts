/**
 * faceMood — how she feels, over minutes rather than seconds (doc 180 §28).
 *
 * A gesture lasts two seconds; a mood stays. Two numbers, as psychology
 * measures affect: VALENCE (-1 sad .. 1 glad) and AROUSAL (0 asleep .. 1
 * excited). What happens to her nudges them (a caress, a start, the person
 * coming back, a sentence's tone); each nudge fades over MOOD_FADE_S, and the
 * mood follows slowly, so a caress leaves her glad for a while after.
 *
 * The animator reads it back three ways, all quiet: a hint of a smile when she
 * is glad (or of worry when low), her own gestures sooner when she is lively
 * and later when she is calm, and which gestures she picks (glad ones when
 * glad, a sigh when low, a yawn when drowsy). At rest every effect is exactly
 * nil, so a face that nothing happens to lives as it did.
 *
 * Pure: no random, no clock of its own.
 *
 * @module avatar/faceMood
 */
import { settle } from './motion';

export interface Mood { valence: number; arousal: number }

/** Where her mood rests when nothing happens: neutral, awake. */
export const MOOD_REST: Readonly<Mood> = { valence: 0, arousal: 0.45 };
/** Seconds for a nudge to fade to a third; seconds for her mood to follow most of the way. */
const MOOD_FADE_S = 40, MOOD_FOLLOW_S = 4;
/** Arousal while she waits for the person, and while she sleeps. */
const WAIT_AROUSAL = 0.25, SLEEP_AROUSAL = 0.02;
/** A caress, fully given in to: this much gladder and calmer each second it lasts (and it stays, fading). */
const CARESS_GLAD_PER_S = 0.15, CARESS_CALM_PER_S = 0.05;
/** Below this distance from neutral her face shows nothing of her mood. */
const MOOD_QUIET = 0.15;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** What moves her mood, and by how much (valence, arousal). */
export const MOOD_NUDGES = {
  /** Something came at her face fast. */
  startled: [-0.15, 0.5],
  /** The person came back after a wait. */
  back: [0.25, 0.35],
  /** She said something glad, sorry, a warning, an exclamation. */
  happy: [0.25, 0.1],
  sorry: [-0.25, -0.05],
  warn: [-0.1, 0.2],
  exclaim: [0.1, 0.25],
} as const satisfies Record<string, readonly [number, number]>;
export type MoodNudge = keyof typeof MOOD_NUDGES;

/** A face's mood: nudged by what happens, stepped every frame. */
export interface FaceMood {
  nudge(by: MoodNudge | readonly [number, number]): void;
  /** Advance; `stroked` 0..1 is how far she gives in to a caress, `sleep` 0..1 how deep asleep. */
  step(dt: number, state: { waiting: boolean; stroked: number; sleep: number; thinking: number }): Readonly<Mood>;
  get(): Readonly<Mood>;
}

export function createFaceMood(): FaceMood {
  const mood: Mood = { ...MOOD_REST };
  // The nudges not yet faded: what pushes her mood off its rest.
  let pushV = 0, pushA = 0;
  return {
    nudge(by) {
      const [dv, da] = typeof by === 'string' ? MOOD_NUDGES[by] : by;
      pushV = clamp(pushV + dv, -1, 1);
      pushA = clamp(pushA + da, -1, 1);
    },
    step(dt, state) {
      const fade = Math.exp(-dt / MOOD_FADE_S);
      pushV = clamp(pushV * fade + CARESS_GLAD_PER_S * state.stroked * dt, -1, 1);
      pushA = clamp(pushA * fade - CARESS_CALM_PER_S * state.stroked * dt, -1, 1);
      const restA = state.waiting ? WAIT_AROUSAL : MOOD_REST.arousal;
      const goalV = clamp(MOOD_REST.valence + pushV, -1, 1);
      // Thinking keeps her a little more awake; asleep, all of it goes.
      const awake = clamp(restA + pushA + 0.1 * state.thinking, 0, 1);
      const goalA = awake + (SLEEP_AROUSAL - awake) * state.sleep;
      mood.valence = settle(mood.valence, goalV, dt, MOOD_FOLLOW_S);
      mood.arousal = settle(mood.arousal, goalA, dt, MOOD_FOLLOW_S);
      return mood;
    },
    get: () => mood,
  };
}

/** How glad, past the quiet band (0 at rest): what her resting face shows of it. */
export const gladness = (m: Readonly<Mood>): number => Math.max(0, m.valence - MOOD_QUIET);
/** How low, past the quiet band (0 at rest). */
export const lowness = (m: Readonly<Mood>): number => Math.max(0, -m.valence - MOOD_QUIET);
/** How drowsy: arousal under its rest (0 at rest and above). */
export const drowsiness = (m: Readonly<Mood>): number => Math.max(0, MOOD_REST.arousal - m.arousal) / MOOD_REST.arousal;

/**
 * How much longer than usual between her own gestures (1 at rest): lively, they come
 * sooner; calm, later. Never under half nor over twice.
 */
export const gestureGapScale = (m: Readonly<Mood>): number => clamp(1 - 1.2 * (m.arousal - MOOD_REST.arousal), 0.5, 2);
