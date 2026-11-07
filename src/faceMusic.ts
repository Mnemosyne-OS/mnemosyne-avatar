/**
 * faceMusic — she listens to the music too (doc 180 §39 to §43).
 *
 * While music plays and nothing else holds her (she is not speaking, thinking,
 * waking or asleep, her gestures are on), she lives in moods, never the same
 * twice in a row:
 *  - GROOVE: a small nod forward and back on the beats she hears (every beat,
 *    or one in two on a fast track), leaning to one side then the other on
 *    alternate nods, deeper when the music is loud. Never a head going left
 *    and right: that reads as « no »;
 *  - EYES CLOSED: the lids low, the same nod, softer. Low, not shut: most of
 *    the time she still glimpses through them, now and then they close;
 *  - CARRIED: when the music builds (its loudness climbing over its own recent
 *    level, read after a few seconds of listening: the music starting is not
 *    a build), she lets it carry her for 12 to 30 s: eyes low, the head back,
 *    tracing slow figures of eight, one loop every four beats;
 *  - SINGING ALONG, under her breath: her lips move on the beats, a syllable
 *    on each, open on one vowel or another, a held note now and then with her
 *    brows lifting on it, a breath taken between two phrases; her eyes half closed,
 *    the nod softer. Only with a tempo heard: miming a song she cannot follow
 *    would be lip-syncing at random. No smile meanwhile, the mouth is busy;
 *  - MUSING: listening, a thought comes to her. Three ways, one drawn each time:
 *    PERPLEXED (the lips pressed into one corner, her eyes aside, then halfway
 *    one brow lifts), AN IDEA (lips pressed, eyes up and aside, then a closed
 *    smile and her brows up), DOUBT (the inner brows up, the corners down, the
 *    head tilted, then the lips pushed aside and a frown). No nod meanwhile;
 *  - A DEEP BREATH: her head leans to one side, her eyes close to 85 %, she
 *    breathes in deep (her chest swells, her head lifts a hair), holds it,
 *    and lets it out slowly, then comes back;
 *  - STILL: almost nothing, the way one listens too.
 * Now and then she looks at the window that plays (`at`); now and then,
 * looking ahead with her eyes open, a closed smile, and rarely a wink.
 *
 * While she listens the pointer does not pull her gaze: she is in the music.
 * A window arriving on the board does (`rouse`): her brows lift, a blink, and
 * she stays out of the music for a few seconds before going back to it.
 *
 * 🚨 No rhythm heard (the sound could not be tapped, or the beats do not
 * agree on a tempo): no nod on the beat, she does not pretend to follow it.
 * She closes her eyes, lets herself be carried at her own slow pace, looks at
 * the window, smiles.
 *
 * Pure and seeded (its own random, like faceMicro).
 *
 * @module avatar/faceMusic
 */
import { envelope, pick, type Random } from './faceGesture';
import { settle } from './motion';
import type { FaceShapeId } from './faceShapes';

export type MusicMood = 'groove' | 'eyesClosed' | 'carried' | 'sing' | 'muse' | 'breathe' | 'still';
export type Musing = 'perplexed' | 'idea' | 'doubt';

export interface MusicHeard {
  onset: boolean;
  /** How loud, 0..1. */
  energy: number;
  /** The tempo, or null while it is not known. */
  bpm: number | null;
  /** Where the window that plays is, in the gaze's space (-1..1, y up); null when unknown. */
  at: { x: number; y: number } | null;
}

export interface MusicLifeIn {
  /** The music this frame; null when none plays. */
  music: MusicHeard | null;
  /** Nothing else holds her: not speaking, thinking, waking or asleep, motion and gestures on. */
  free: boolean;
}

export interface MusicLifeOut {
  /** How far she is in her listening, 0..1 (eases in and out). */
  listening: number;
  /** Added straight onto the head's nod (a share of the full nod; negative: down, positive: back). */
  pitch: number;
  /** Added straight onto the head's turn (a share of the full turn). */
  yaw: number;
  /** Added to the `headTilt` weight. */
  tilt: number;
  /** Where her gaze goes; null: ahead (while she listens the pointer does not lead it). */
  look: { x: number; y: number } | null;
  /** How far her lids are down, 0..1. */
  lid: number;
  /**
   * A move to play now (a smile, rarely a wink), at most one per call. Never joy, nor anything
   * that opens the mouth: while listening it reads as a laugh at nothing.
   */
  play: 'wink' | 'smile' | null;
  /** Singing along: the jaw, the lips rounded, the lips spread (added to those weights). */
  mouth: { jaw: number; round: number; wide: number };
  /** Singing along: the brows up, their inner ends up (added to those weights). */
  brows: { up: number; inner: number };
  /** A breath taken between two sung phrases (added to the `breath` weight). */
  breath: number;
  /** Musing: the weights of her thought (added to those weights). */
  face: Partial<Record<FaceShapeId, number>>;
}

/** How long each mood lasts, in seconds. */
export const MOOD_S: Record<MusicMood, [number, number]> = { groove: [8, 16], eyesClosed: [5, 10], carried: [12, 30], sing: [6, 14], muse: [6, 10], breathe: [7, 9], still: [3, 6] };
const MOOD_POOL: ReadonlyArray<[MusicMood, number]> = [['groove', 5], ['eyesClosed', 2], ['carried', 1], ['sing', 2], ['muse', 1.5], ['breathe', 1.5], ['still', 1]];
/** Moods that need a beat: without a tempo there is nothing to nod or sing on. */
const NEEDS_TEMPO: ReadonlySet<MusicMood> = new Set(['groove', 'sing']);
/** A sung syllable: how far the jaw opens (more with louder music), how fast it opens and closes. */
export const SING_JAW: [number, number] = [0.12, 0.3], SYLLABLE_RISE = 0.05, SYLLABLE_FALL = 0.12;
/** A phrase is this many syllables, then a breath of one or two beats. */
const PHRASE: [number, number] = [4, 8];
/** A held note: this often, this many beats long; the brows lift on it. */
export const HELD_SHARE = 0.2, HELD_BEATS: [number, number] = [1.5, 2.5], HELD_BROW = 0.3, HELD_INNER = 0.25;
/** Singing, her eyes half closed, her inner brows a little up, her nod this much of the groove's. */
export const SING_LID = 0.35, SING_INNER = 0.12, SING_NOD = 0.5;
/** A nod: down quick, back slower (a share of the full nod), deeper with the music's loudness. */
export const NOD_DEEP = 0.5, NOD_RISE = 0.07, NOD_FALL = 0.26;
/** The side lean that comes with a nod, alternating (a `headTilt` weight), and a hair of turn with it. */
export const NOD_TILT = 0.28, NOD_YAW = 0.05;
/** With her eyes closed the nod is this much of it. */
const CLOSED_NOD = 0.6;
/** Over this tempo she nods one beat in two. */
export const HALF_TIME_OVER = 130;
/** Her lids with her eyes shut; most of the time they are only low (PEEK_LID), she still glimpses. */
export const CLOSED_LID = 0.88, PEEK_LID: [number, number] = [0.5, 0.72];
/** Eyes low: every few seconds, how low; this share of those moments they shut. */
export const PEEK_GAP: [number, number] = [2, 5], SHUT_SHARE = 0.3;
/** The breath after a phrase: how deep (a `breath` weight). */
export const SING_BREATH = 0.6;
/** A deep breath: the lean (a `headTilt` weight), the lids, how deep (a `breath` weight), the head's lift with it. */
export const BREATHE_TILT = 0.45, BREATHE_LID = 0.85, BREATHE_DEPTH = 1, BREATHE_LIFT = 0.12;
/** It starts after this, breathes in over this, holds, breathes out over this (seconds). */
export const BREATHE_IN: readonly [number, number, number, number] = [0.6, 2.2, 0.7, 3.2];
/** A musing: where her thought turns halfway (the brow, the smile). */
export const MUSE_TURN = 0.45;
const MUSINGS: readonly Musing[] = ['perplexed', 'idea', 'doubt'];
/** Carried: the head back (a share of the full nod), the eight's reach on the turn, the nod and the tilt. */
export const CARRIED_BACK = 0.35, EIGHT_YAW = 0.32, EIGHT_PITCH = 0.18, EIGHT_TILT = 0.3;
/** One loop of the eight every four beats; without a tempo, her own slow pace. */
const EIGHT_FREE_HZ = 0.12;
/** The music builds: its loudness over a second climbs this far over its level of the last few seconds. */
export const BUILD_RATIO = 1.25, BUILD_MIN = 0.03;
/** A build is read only after this long into a listening: the music starting is not a build. */
export const BUILD_AFTER_S = 8;
/** A build carries her at most this often. */
export const CARRIED_REST_S = 40;
/** Between two looks at the window, and how long each one lasts. */
export const GLANCE_GAP: [number, number] = [10, 25], GLANCE_S: [number, number] = [2, 4];
/** Between two smiles or winks. */
export const SMILE_GAP: [number, number] = [25, 50];
/** A wink is the rare one: a share of those moments, and never two closer than this (a repeated wink reads as a tic). */
export const WINK_SHARE = 0.2, WINK_REST_S = 150;
/** Pulled out of the music by a window arriving: this long before she goes back to it. */
export const ROUSE_S: [number, number] = [8, 14];
const EASE_S = 0.8;

const ramp = (p: number, a: number, b: number): number => Math.max(0, Math.min(1, (p - a) / (b - a)));

/**
 * Her thought at `p` (0..1 of the musing), `side` the corner her lips go to, `fade` its ease in
 * and out: the weights, the head's tilt, where her eyes rest.
 */
export function museFrame(kind: Musing, side: number, p: number, fade: number): { weights: Partial<Record<FaceShapeId, number>>; tilt: number; look: { x: number; y: number } } {
  const f = Math.max(0, fade), turn = ramp(p, MUSE_TURN, MUSE_TURN + 0.12);
  const brow: FaceShapeId = side > 0 ? 'browUpL' : 'browUpR';
  if (kind === 'perplexed') {
    return {
      weights: { lipPress: 0.3 * f, mouthSide: 0.35 * side * f, [brow]: 0.55 * turn * f, browFrown: 0.15 * turn * f },
      tilt: 0,
      look: { x: (0.35 - 0.2 * turn) * side, y: -0.15 + 0.2 * turn },
    };
  }
  if (kind === 'idea') {
    return {
      weights: { lipPress: 0.25 * (1 - turn) * f, mouthSide: 0.25 * side * (1 - turn) * f, smileL: 0.25 * turn * f, smileR: 0.25 * turn * f, browUpL: 0.25 * turn * f, browUpR: 0.25 * turn * f },
      tilt: 0,
      look: { x: 0.3 * side * (1 - turn), y: 0.3 * (1 - turn) },
    };
  }
  return {
    weights: { browInnerUp: 0.3 * f, mouthFrown: 0.22 * f, mouthSide: 0.3 * side * turn * f, browFrown: 0.2 * turn * f, lipPress: 0.2 * turn * f },
    tilt: 0.2 * side * f,
    look: { x: 0.2 * side, y: -0.1 },
  };
}

export function createMusicLife(random: Random) {
  let t = 0, listening = 0;
  let mood: MusicMood = 'groove', moodEnd = -1, lastMood: MusicMood | null = null, lastCarried = -Infinity;
  let beatCount = 0, nodAt = -10, nodDepth = 0, nodSide = 1, eightPhase = 0, back = 0;
  let glanceUntil = -1, nextGlance = -1, nextSmile = -1, lastWink = -Infinity;
  let lid = 0, quick = 0, slow = 0, outUntil = -Infinity, listenStart = 0;
  const out: MusicLifeOut = { listening: 0, pitch: 0, yaw: 0, tilt: 0, look: null, lid: 0, play: null, mouth: { jaw: 0, round: 0, wide: 0 }, brows: { up: 0, inner: 0 }, breath: 0, face: {} };
  // Singing: the syllable under way (when, how open, which vowel, how long held), the phrase.
  let sylAt = -10, sylJaw = 0, sylVowel = 0, sylHold = 0, sylHeld = false, sylLeft = 0, restBeats = 0, sing = 0, breathAt = -10;
  // Eyes low: how low now, until when; a musing: which, to which side, since when.
  let lidGoal = CLOSED_LID, nextPeek = -1, musing: Musing = 'perplexed', museSide = 1, museStart = -10, lastMusing: Musing | null = null;
  // A deep breath: to which side her head leans, since when.
  let breatheSide = 1, breatheStart = -10;

  const enter = (next: MusicMood) => {
    mood = next;
    lastMood = next;
    if (next === 'carried') lastCarried = t;
    moodEnd = t + pick(random, ...MOOD_S[next]);
    nextPeek = t;
    if (next === 'muse') {
      const pool = MUSINGS.filter(k => k !== lastMusing);
      musing = pool[Math.floor(random() * pool.length)] ?? 'perplexed';
      lastMusing = musing;
      museSide = random() < 0.5 ? 1 : -1;
      museStart = t;
    }
    if (next === 'breathe') { breatheSide = random() < 0.5 ? 1 : -1; breatheStart = t; }
  };
  const nextMood = (known: boolean) => {
    // No tempo: no groove, there is no beat to nod on.
    const pool = MOOD_POOL.filter(([m]) => m !== lastMood && (known || !NEEDS_TEMPO.has(m)) && (m !== 'carried' || t - lastCarried >= CARRIED_REST_S));
    let r = random() * pool.reduce((n, [, k]) => n + k, 0);
    enter(pool.find(([, k]) => (r -= k) <= 0)?.[0] ?? (known ? 'groove' : 'eyesClosed'));
  };

  return {
    step(dt: number, input: MusicLifeIn): MusicLifeOut {
      t += dt;
      const m = input.free && t >= outUntil ? input.music : null;
      listening = settle(listening, m ? 1 : 0, dt, EASE_S);
      out.play = null;
      if (!m) {
        // Back to her own life: the next listening starts afresh.
        moodEnd = -1; nextGlance = -1; nextSmile = -1; glanceUntil = -1;
        lid = settle(lid, 0, dt, 0.3);
        back = settle(back, 0, dt, 0.5);
        out.listening = listening;
        out.pitch = back * CARRIED_BACK * listening;
        out.yaw *= Math.max(0, 1 - dt / 0.4); out.tilt *= Math.max(0, 1 - dt / 0.4);
        out.look = null; out.lid = lid;
        sing = settle(sing, 0, dt, 0.3);
        out.mouth.jaw = out.mouth.round = out.mouth.wide = 0;
        out.brows.up = 0; out.brows.inner = 0;
        out.breath = 0;
        for (const k of Object.keys(out.face) as FaceShapeId[]) delete out.face[k];
        return out;
      }
      const known = m.bpm !== null;
      // The music building: its loudness over a second against its level of the last few seconds.
      quick += (m.energy - quick) * Math.min(1, dt / 1);
      slow += (m.energy - slow) * Math.min(1, dt / 8);
      if (moodEnd < 0) { quick = slow = m.energy; listenStart = t; }
      const builds = t - listenStart >= BUILD_AFTER_S && quick > slow * BUILD_RATIO + BUILD_MIN;
      if (moodEnd < 0) {
        nextMood(known);
        nextGlance = t + pick(random, 3, GLANCE_GAP[1] / 2);
        nextSmile = t + pick(random, ...SMILE_GAP);
      } else if (builds && mood !== 'carried' && t - lastCarried >= CARRIED_REST_S) enter('carried');
      else if (t >= moodEnd) nextMood(known);

      // The beats she nods on: every one, or one in two on a fast track; only with a known tempo.
      if (m.onset && known) {
        beatCount++;
        const half = (m.bpm as number) > HALF_TIME_OVER;
        if ((mood === 'groove' || mood === 'eyesClosed' || mood === 'sing') && (!half || beatCount % 2 === 0)) {
          nodAt = t;
          nodSide = -nodSide;
          nodDepth = NOD_DEEP * (mood === 'eyesClosed' ? CLOSED_NOD : mood === 'sing' ? SING_NOD : 1) * (0.55 + 0.45 * Math.min(1, m.energy * 2));
        }
        // Singing along: a syllable on the beat, or a breath between two phrases.
        if (mood === 'sing') {
          const period = 60 / (m.bpm as number);
          if (restBeats > 0) restBeats--;
          else if (t - sylAt > sylHold + SYLLABLE_RISE) {
            if (sylLeft <= 0) sylLeft = Math.round(pick(random, ...PHRASE));
            sylAt = t;
            sylJaw = pick(random, ...SING_JAW) * (0.6 + 0.4 * Math.min(1, m.energy * 2));
            sylVowel = pick(random, -1, 1);
            sylHeld = random() < HELD_SHARE;
            sylHold = period * (sylHeld ? pick(random, ...HELD_BEATS) : pick(random, 0.3, 0.7));
            // The phrase sung: a breath before the next.
            if (--sylLeft <= 0) { restBeats = random() < 0.5 ? 1 : 2; breathAt = t + sylHold; }
          }
        }
      }
      const singing = mood === 'sing';
      sing = settle(sing, singing ? 1 : 0, dt, 0.3);
      const sylAge = t - sylAt;
      const syl = singing && sylAge < SYLLABLE_RISE + sylHold + SYLLABLE_FALL ? envelope(sylAge, SYLLABLE_RISE, sylHold, SYLLABLE_FALL) : 0;
      const held = sylHeld ? syl : 0;
      const age = t - nodAt;
      const nod = age < NOD_RISE + NOD_FALL ? envelope(age, NOD_RISE, 0, NOD_FALL) : 0;
      // Carried: the head goes back and traces eights, one loop every four beats.
      const carried = mood === 'carried';
      back = settle(back, carried ? 1 : 0, dt, carried ? 1.5 : 0.8);
      eightPhase += 2 * Math.PI * (known ? (m.bpm as number) / 240 : EIGHT_FREE_HZ) * dt;
      const eye = mood === 'eyesClosed' || carried;
      // Eyes low: mostly she still glimpses, now and then they shut.
      if (eye && t >= nextPeek) {
        lidGoal = random() < SHUT_SHARE ? CLOSED_LID : pick(random, ...PEEK_LID);
        nextPeek = t + pick(random, ...PEEK_GAP);
      }
      const breathing = mood === 'breathe';
      lid = settle(lid, eye ? lidGoal : breathing ? BREATHE_LID : singing ? SING_LID : 0, dt, eye || breathing ? 0.6 : 0.25);
      const musingNow = mood === 'muse';
      // The deep breath: in, held, out; her head leaning meanwhile, easing in and out.
      const [bAt, bIn, bHold, bOut] = BREATHE_IN;
      const bAge = t - breatheStart;
      const inhale = breathing ? envelope(bAge - bAt, bIn, bHold, bOut) : 0;
      const lean = breathing ? Math.max(0, Math.min(1, bAge / 1, (moodEnd - t) / 1)) : 0;

      // A look at the window that plays, when there is one and her eyes are open.
      if (m.at && !eye && !singing && !musingNow && !breathing && t >= nextGlance && glanceUntil < t) {
        glanceUntil = t + pick(random, ...GLANCE_S);
        nextGlance = glanceUntil + pick(random, ...GLANCE_GAP);
      }
      const glancing = m.at !== null && t < glanceUntil && !eye && !singing && !musingNow && !breathing;
      // Looking ahead, eyes open: a closed smile, rarely a wink.
      if (t >= nextSmile && !glancing && !eye && !singing && !musingNow && !breathing && lid < 0.2) {
        const r = random();
        out.play = r < WINK_SHARE && t - lastWink >= WINK_REST_S ? 'wink' : 'smile';
        if (out.play === 'wink') lastWink = t;
        nextSmile = t + pick(random, ...SMILE_GAP);
      }

      const s = Math.sin(eightPhase), s2 = Math.sin(2 * eightPhase);
      out.listening = listening;
      out.pitch = (-nodDepth * nod + back * (CARRIED_BACK + EIGHT_PITCH * s2)) * listening;
      out.yaw = (NOD_YAW * nodSide * nod * (nodDepth / NOD_DEEP) + back * EIGHT_YAW * s) * listening;
      out.tilt = (NOD_TILT * nodSide * nod * (nodDepth / NOD_DEEP) + back * EIGHT_TILT * s) * listening;
      const thought = musingNow ? museFrame(musing, museSide, (t - museStart) / Math.max(0.1, moodEnd - museStart), Math.min(1, (t - museStart) / 0.6, (moodEnd - t) / 0.8)) : null;
      for (const k of Object.keys(out.face) as FaceShapeId[]) delete out.face[k];
      if (thought) for (const [k, v] of Object.entries(thought.weights) as Array<[FaceShapeId, number]>) out.face[k] = v * listening;
      if (thought) out.tilt += thought.tilt * listening;
      out.tilt += BREATHE_TILT * breatheSide * lean * listening;
      out.pitch += BREATHE_LIFT * inhale * listening;
      out.look = glancing ? m.at : thought ? thought.look : null;
      out.lid = lid * listening;
      out.mouth.jaw = sylJaw * syl * listening;
      out.mouth.round = Math.max(0, -sylVowel) * 0.6 * syl * listening;
      out.mouth.wide = Math.max(0, sylVowel) * 0.5 * syl * listening;
      out.brows.up = HELD_BROW * held * listening;
      out.brows.inner = (SING_INNER * sing + HELD_INNER * held) * listening;
      out.breath = (singing ? SING_BREATH * envelope(t - breathAt, 0.25, 0.1, 0.6) : BREATHE_DEPTH * inhale) * listening;
      return out;
    },
    /**
     * A window arrived on the board: listening, she comes out of the music for a few seconds.
     * True when she was in it (the animator then lifts her brows and blinks).
     */
    rouse(): boolean {
      if (listening < 0.3) return false;
      outUntil = t + pick(random, ...ROUSE_S);
      return true;
    },
    /** Tests: the mood she is in, her musing, the side of her deep breath. */
    mood: (): MusicMood => mood,
    breatheSide: (): number => breatheSide,
    musing: (): Musing => musing,
  };
}

export type MusicLife = ReturnType<typeof createMusicLife>;
