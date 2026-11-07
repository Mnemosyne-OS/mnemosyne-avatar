/**
 * faceMicro — the small life under a face's gestures (doc 180 §30): what makes
 * a face read as alive more than any expression does, all of it small and
 * never stopping.
 *
 *  - MICRO-EXPRESSIONS: every few seconds, a flicker of an expression, under
 *    half a second in all (Yan et al. 2013 put micro-expressions under 500 ms)
 *    and faint (FACS intensity A to B): a brow, a corner of the mouth, the
 *    eyes narrowing a hair. Her mood picks which (glad: smiles flicker; low:
 *    the inner brows).
 *  - THE HEAD WITH THE VOICE: a speaking head moves about 90 % of the time
 *    and a listening one about 13 % (Hadar 1983); quick movements fall on
 *    stressed words (a small nod on each, past the head's spring, which would
 *    swallow it) and the head drifts with the voice's loudness (Munhall 2004:
 *    natural head motion helps a listener, doubled it no longer does, so it
 *    stays small). At the end of a phrase, a nod now and then and often a blink
 *    (listeners and speakers blink at pauses: Nakano & Kitazawa 2010).
 *  - BREATHING: on the chest (the `breath` movement: it swells and the
 *    shoulders rise), 12 to 20 breaths a minute at rest, the breath out twice
 *    as long as the breath in; asleep slower and deeper; speaking, the air goes
 *    out slowly over a phrase and comes back in quickly at each pause. The
 *    head nods a hair with it.
 *  - THE HEAD AT REST: a slow drift, much smaller than while speaking.
 *
 * Draws from its own random (the animator hands it one), so the rest of her
 * life keeps its own draws.
 *
 * @module avatar/faceMicro
 */
import { FS, type FaceShapeId } from './faceShapes';
import { envelope, G, pick, side, type Gesture, type Random } from './faceGesture';
import { settle } from './motion';

/** Seconds between two micro-expressions. */
const MICRO_GAP: [number, number] = [1.2, 4];
/** A micro-expression's flicker: up, held, down, in seconds (under half a second in all). */
const flicker = (rnd: Random, weights: Gesture['weights'], more: Partial<Gesture> = {}): Gesture =>
  G(weights, pick(rnd, 0.06, 0.09), pick(rnd, 0.04, 0.12), pick(rnd, 0.16, 0.24), more);

/** The micro-expressions: each a faint flicker of one region. */
const MICRO = {
  browFlick: rnd => { const a = pick(rnd, 0.16, 0.28); return flicker(rnd, { browUpL: a, browUpR: a * pick(rnd, 0.85, 1) }); },
  oneBrow: rnd => { const a = pick(rnd, 0.18, 0.3); return flicker(rnd, side(rnd) > 0 ? { browUpL: a } : { browUpR: a }); },
  cornerTwitch: rnd => { const a = pick(rnd, 0.15, 0.28); return flicker(rnd, side(rnd) > 0 ? { smileL: a } : { smileR: a }); },
  eyesSmile: rnd => flicker(rnd, { cheekRaise: pick(rnd, 0.1, 0.2), smileL: 0.08, smileR: 0.08 }, { squint: { left: 0.2, right: 0.2, lag: 0.02 } }),
  innerBrow: rnd => flicker(rnd, { browInnerUp: pick(rnd, 0.18, 0.3) }),
  frownFlick: rnd => flicker(rnd, { browFrown: pick(rnd, 0.16, 0.26) }),
  lipPress: rnd => flicker(rnd, { lipPress: pick(rnd, 0.18, 0.3) }, { mouth: true }),
  cornersDown: rnd => flicker(rnd, { mouthFrown: pick(rnd, 0.14, 0.24) }, { mouth: true }),
  noseFlick: rnd => flicker(rnd, { noseWrinkle: pick(rnd, 0.15, 0.25) }),
  lipsAside: rnd => flicker(rnd, { mouthSide: pick(rnd, 0.15, 0.25) * side(rnd) }, { mouth: true }),
} satisfies Record<string, (rnd: Random) => Gesture>;
type MicroId = keyof typeof MICRO;
/** How often each, at a neutral mood; `glad` and `low` say which her mood favours. */
const MICRO_POOL: ReadonlyArray<{ id: MicroId; k: number; glad?: true; low?: true }> = [
  { id: 'browFlick', k: 2 }, { id: 'oneBrow', k: 1 }, { id: 'cornerTwitch', k: 1.2, glad: true }, { id: 'eyesSmile', k: 0.8, glad: true },
  { id: 'innerBrow', k: 0.8, low: true }, { id: 'frownFlick', k: 0.8 }, { id: 'lipPress', k: 1 }, { id: 'cornersDown', k: 0.4, low: true },
  { id: 'noseFlick', k: 0.3, low: true }, { id: 'lipsAside', k: 0.6 },
];

/** A stressed syllable: the mouth this far over its slow average; at most one beat this often. */
const BEAT_JUMP = 0.18, BEAT_REST_S = 0.3;
/** A beat's nod (a share of the full nod) and the turn and the tilt that come with it, at most. */
const BEAT_PITCH = 0.2, BEAT_YAW = 0.1, BEAT_TILT = 0.12;
/** While she speaks, the head drifts this far (shares of its full turn and nod; a tilt weight), more with a louder voice. */
const TALK_DRIFT = { yaw: 0.07, pitch: 0.05, tilt: 0.14 };
/** At rest, the drift is this much of the speaking one. */
const REST_DRIFT = 0.18;
/** A phrase ended: her voice had lasted this long and has now paused this long. Then a nod this often, a blink this often. */
const PHRASE_MIN_S = 0.8, PAUSE_S = 0.25, PHRASE_NOD = 0.45, PHRASE_BLINK = 0.6;
/** A breath: this many seconds (12 to 20 a minute), a third of it in; asleep, slower. How far it nods the head (a share of the full nod). */
const BREATH_S: [number, number] = [3.2, 4.8], SLEEP_BREATH_S: [number, number] = [4.8, 6.5], BREATH_PITCH = 0.03;
/** How deep a breath shows on the chest (the `breath` movement's weight at the top of it): awake at rest, asleep. */
const BREATH_DEPTH = 0.7, SLEEP_DEPTH = 1;
/** Speaking: the air goes out over this long, comes back in this fast, this soon into a pause. */
const SPEECH_OUT_S = 2.5, SPEECH_IN_S = 0.25, SPEECH_IN_AFTER_S = 0.12;
/** Her voice heard this recently: she still breathes as someone speaking (the pauses between phrases included). */
const SPEECH_BREATH_HOLD_S = 1.5;

/** What the small life reads each frame. */
export interface MicroInput {
  motion: boolean;
  /** Her own gestures allowed: the micro-expressions and the head's movements are hers; the breath and a blink are not. */
  gestures: boolean;
  /** How far the mouth is open with her voice, 0..1, and whether she is speaking. */
  mouth: number;
  speaking: boolean;
  /** How glad and how low she is (faceMood), and how deep asleep. */
  glad: number;
  low: number;
  sleep: number;
  /** A person's face: the micro-expressions are a person's (an animal has its own small life, faceSpecies). */
  person: boolean;
}

/** What it hands back this frame, added by the animator to the rest. */
export interface MicroFrame {
  /** Straight onto the head, past its spring: shares of its full turn and nod. */
  yaw: number;
  pitch: number;
  /** A blink asked for (the end of a phrase). */
  blink: boolean;
  /** How far the chest is breathed in, 0..1, and the `breath` movement's weight it gives (deeper asleep). */
  chest: number;
  breath: number;
  /** How far the eyes narrow, both. */
  squint: number;
}

export interface MicroLife {
  /** Advance; adds the micro-expressions and the head's tilt to `w`. */
  step(dt: number, input: MicroInput, w: Float32Array): MicroFrame;
}

export function createMicroLife(random: Random): MicroLife {
  let t = 0;
  let playing: Array<{ at: number; g: Gesture }> = [];
  let nextMicro = pick(random, ...MICRO_GAP);
  // The voice: its slow average (a stress jumps over it), when the last beat fell, the beats playing.
  let slow = 0, lastBeat = -10;
  let beats: Array<{ at: number; pitch: number; yaw: number; tilt: number; rise: number; hold: number; fall: number }> = [];
  // The phrase: since when she has been speaking without a pause, since when she has paused.
  let phraseSince = -1, pauseSince = -1;
  // How much she speaks (0..1, settled), and the drift's phases.
  let talk = 0;
  const phase = Array.from({ length: 6 }, () => random() * 2 * Math.PI);
  // The breath: when this one began and how long it lasts.
  let breathAt = 0, breathLen = pick(random, ...BREATH_S);
  // How far the small life is on: it fades in when it may start again (after a waking), never pops.
  let on = 0;
  // How far the chest is breathed in; when her voice was last heard.
  let chest = 0.5, lastVoice = -10;
  const out: MicroFrame = { yaw: 0, pitch: 0, blink: false, squint: 0, chest: 0.5, breath: 0 };

  const add = (w: Float32Array, id: FaceShapeId, v: number) => { w[FS[id]] = (w[FS[id]] ?? 0) + v; };

  return {
    step(dt, input, w) {
      t += dt;
      out.yaw = 0; out.pitch = 0; out.blink = false; out.squint = 0; out.breath = 0; out.chest = chest;
      if (!input.motion) {
        playing = []; beats = []; on = 0;
        nextMicro = Math.max(nextMicro, t + pick(random, ...MICRO_GAP));
        return out;
      }
      on = settle(on, 1, dt, 0.6);
      const awake = (1 - input.sleep) * on;

      // The micro-expressions: a person's, awake, with her gestures on; none that moves the mouth while she speaks.
      if (input.person && input.gestures && input.sleep < 0.3 && t >= nextMicro) {
        const pool = MICRO_POOL.filter(m => !(input.speaking && MICRO[m.id](() => 0.5).mouth));
        const k = (m: (typeof MICRO_POOL)[number]) => m.k * (m.glad ? 1 + 3 * input.glad : 1) * (m.low ? 1 + 3 * input.low : 1);
        let r = random() * pool.reduce((n, m) => n + k(m), 0);
        const chosen = pool.find(m => (r -= k(m)) <= 0) ?? pool[0];
        if (chosen) playing.push({ at: t, g: MICRO[chosen.id](random) });
        nextMicro = t + pick(random, ...MICRO_GAP);
      }
      playing = playing.filter(p => {
        const age = t - p.at, g = p.g;
        if (age > g.rise + g.hold + g.fall) return false;
        const e = envelope(age, g.rise, g.hold, g.fall);
        for (const [id, v] of Object.entries(g.weights) as Array<[FaceShapeId, number]>) add(w, id, v * e);
        if (g.squint) out.squint = Math.max(out.squint, g.squint.left * e);
        return true;
      });

      // The head with the voice: a beat on each stressed syllable, a drift while she speaks.
      slow = settle(slow, input.mouth, dt, 0.3);
      if (input.gestures && input.speaking && input.mouth - slow > BEAT_JUMP && t - lastBeat > BEAT_REST_S) {
        lastBeat = t;
        const a = pick(random, 0.5, 1);
        beats.push({ at: t, pitch: -BEAT_PITCH * a, yaw: BEAT_YAW * pick(random, -1, 1), tilt: BEAT_TILT * pick(random, -1, 1), rise: 0.08, hold: 0.04, fall: 0.22 });
      }
      // The end of a phrase: a nod now and then, often a blink.
      if (input.speaking) { if (phraseSince < 0) phraseSince = t; pauseSince = -1; }
      else if (phraseSince >= 0) {
        if (pauseSince < 0) pauseSince = t;
        if (t - pauseSince >= PAUSE_S) {
          if (pauseSince - phraseSince >= PHRASE_MIN_S) {
            if (random() < PHRASE_NOD && input.gestures) beats.push({ at: t, pitch: -0.3, yaw: 0, tilt: 0, rise: 0.12, hold: 0.06, fall: 0.32 });
            if (random() < PHRASE_BLINK) out.blink = true;
          }
          phraseSince = -1;
        }
      }
      beats = beats.filter(b => {
        const age = t - b.at;
        if (age > b.rise + b.hold + b.fall) return false;
        const e = envelope(age, b.rise, b.hold, b.fall);
        out.pitch += b.pitch * e; out.yaw += b.yaw * e;
        add(w, 'headTilt', b.tilt * e);
        return true;
      });
      talk = settle(talk, input.speaking ? 1 : 0, dt, input.speaking ? 0.2 : 0.8);
      const drift = input.gestures ? (REST_DRIFT + (1 - REST_DRIFT) * talk * (0.6 + 0.8 * slow)) * awake : 0;
      const wave = (i: number, hz: number) => Math.sin(2 * Math.PI * hz * t + (phase[i] ?? 0));
      out.yaw += TALK_DRIFT.yaw * drift * (0.6 * wave(0, 0.23) + 0.4 * wave(1, 0.61));
      out.pitch += TALK_DRIFT.pitch * drift * (0.6 * wave(2, 0.31) + 0.4 * wave(3, 0.77));
      add(w, 'headTilt', TALK_DRIFT.tilt * drift * (0.6 * wave(4, 0.17) + 0.4 * wave(5, 0.43)));

      // The breath, on the chest: in over a third of it, out over the rest; asleep slower and deeper.
      // Speaking, out slowly over the phrase and in quickly at each pause.
      if (t - breathAt >= breathLen) { breathAt = t; breathLen = pick(random, ...(input.sleep > 0.5 ? SLEEP_BREATH_S : BREATH_S)); }
      const b = (t - breathAt) / breathLen;
      const ease = (x: number) => x * x * (3 - 2 * x);
      const cycle = b < 1 / 3 ? ease(b * 3) : 1 - ease((b - 1 / 3) * 1.5);
      if (input.speaking) lastVoice = t;
      if (t - lastVoice < SPEECH_BREATH_HOLD_S) {
        const inhaling = !input.speaking && pauseSince >= 0 && t - pauseSince > SPEECH_IN_AFTER_S;
        chest = settle(chest, input.speaking ? 0.1 : inhaling ? 1 : chest, dt, input.speaking ? SPEECH_OUT_S : SPEECH_IN_S);
      } else chest = settle(chest, cycle, dt, 0.12);
      out.chest = chest;
      out.breath = (BREATH_DEPTH + (SLEEP_DEPTH - BREATH_DEPTH) * input.sleep) * chest * on;
      // The head with it (asleep, the sleeping head breathes its own way: faceAnimator).
      out.pitch += BREATH_PITCH * (chest - 0.5) * (1 - input.sleep) * on;
      return out;
    },
  };
}
