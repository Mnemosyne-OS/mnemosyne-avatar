/**
 * faceEmotions.test.ts — the emotions as recipes (doc 180 §29): each one shows
 * where the research puts it, never fights the voice for the mouth, lingers in
 * her mood once played, and the strong ones never come on their own.
 */
import { describe, it, expect } from 'vitest';
import { EMOTIONS, type EmotionId } from './faceEmotions';
import { createFaceAnimator, EXPRESSIONS, HEAD_PITCH, SEQUENCES, WAKE_S, type FaceInput, type MoveId } from './faceAnimator';
import type { Phase } from './faceGesture';
import { FS, type FaceFrame } from './faceShapes';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const still: FaceInput = { voice: 0, spectrum: null, lookGoal: { x: 0, y: 0 }, motion: true };
const DT = 1 / 60;
const MOUTH = ['jawOpen', 'lipsWide', 'lipsRound', 'lipPress', 'mouthFrown', 'chinRaise', 'mouthSide'] as const;

/** Plays `id` on a face that has woken and is quiet (her own gestures off), and gathers what it did. */
function played(id: MoveId, seconds = 3, seed = 7) {
  const a = createFaceAnimator(seeded(seed));
  const quiet = { ...still, gestures: false };
  for (let f = 0; f < 60 * (WAKE_S + 1); f++) a.step(DT, quiet);
  a.express(id);
  const top = new Map<number, number>(), low = new Map<number, number>();
  let pitchUp = 0, pitchDown = 0, lookDown = 0, lid = 0, squint = 0;
  const jaw: number[] = [];
  for (let f = 0; f < 60 * seconds; f++) {
    const r: FaceFrame = a.step(DT, quiet);
    r.weights.forEach((w, i) => { top.set(i, Math.max(top.get(i) ?? 0, w)); low.set(i, Math.min(low.get(i) ?? 0, w)); });
    pitchUp = Math.max(pitchUp, r.head.pitch); pitchDown = Math.min(pitchDown, r.head.pitch);
    lookDown = Math.min(lookDown, r.look.y); lid = Math.max(lid, r.blink); squint = Math.max(squint, r.squint[0], r.squint[1]);
    jaw.push(r.weights[FS.jawOpen] ?? 0);
  }
  return { a, top: (s: number) => top.get(s) ?? 0, low: (s: number) => low.get(s) ?? 0, pitchUp, pitchDown, lookDown, lid, squint, jaw };
}

describe('faceEmotions', () => {
  it('joy is not a bigger smile: the mouth opens, the cheeks rise, the head lifts; a smile keeps its lips closed', () => {
    const joy = played('joy'), smile = played('smile');
    expect(joy.top(FS.jawOpen)).toBeGreaterThan(0.15);
    expect(joy.top(FS.cheekRaise)).toBeGreaterThan(0.6);
    expect(joy.top(FS.browUpL)).toBeGreaterThan(0.15);
    expect(joy.pitchUp).toBeGreaterThan(0.2 * HEAD_PITCH);
    // Her breath moves the jaw a little: a smile adds nothing to it, nor to the cheeks.
    expect(joy.top(FS.jawOpen)).toBeGreaterThan(smile.top(FS.jawOpen) + 0.1);
    expect(joy.top(FS.cheekRaise)).toBeGreaterThan(smile.top(FS.cheekRaise) + 0.5);
  });

  it('every move that moves the mouth says so (the voice owns it while she speaks), and stays within -1..1', () => {
    const all: Array<[string, (rnd: () => number) => Phase[]]> = [
      ...(Object.keys(EMOTIONS) as EmotionId[]).map((id): [string, (rnd: () => number) => Phase[]] => [id, EMOTIONS[id]]),
      ...Object.entries(SEQUENCES),
      ...Object.entries(EXPRESSIONS).map(([id, make]): [string, (rnd: () => number) => Phase[]] => [id, rnd => [{ at: 0, g: make(rnd) }]]),
    ];
    for (const [id, phases] of all) {
      for (let seed = 1; seed < 6; seed++) {
        for (const { g } of phases(seeded(seed))) {
          const touches = MOUTH.some(m => Math.abs(g.weights[m] ?? 0) > 0) || Object.keys(g.pulse?.weights ?? {}).some(m => (MOUTH as readonly string[]).includes(m));
          if (touches) expect(g.mouth, id).toBe(true);
          for (const v of Object.values(g.weights)) expect(Math.abs(v ?? 0)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('fear: the worried brow and the head drawn back; anger: brows down, lids tight', () => {
    const fear = played('fear');
    expect(fear.top(FS.browInnerUp)).toBeGreaterThan(0.6);
    expect(fear.pitchUp).toBeGreaterThan(0.15 * HEAD_PITCH);
    const anger = played('anger');
    expect(anger.top(FS.browFrown)).toBeGreaterThan(0.7);
    expect(anger.squint).toBeGreaterThan(0.4);
    expect(anger.pitchDown).toBeLessThan(-0.15 * HEAD_PITCH);
  });

  it('sadness lowers the eyes, the head and the lids a little; tenderness lowers the lids, never shuts them', () => {
    const sad = played('sad', 4);
    expect(sad.lookDown).toBeLessThan(-0.25);
    expect(sad.pitchDown).toBeLessThan(-0.15 * HEAD_PITCH);
    expect(sad.lid).toBeGreaterThan(0.1);
    const tender = played('tender', 4);
    expect(tender.lid).toBeGreaterThan(0.2);
    expect(tender.lid).toBeLessThan(0.5);
  });

  it('amusement chuckles: the jaw opens and closes several times while the smile holds', () => {
    const { jaw, top } = played('amused', 3);
    let beats = 0;
    for (let i = 1; i < jaw.length - 1; i++) if ((jaw[i] ?? 0) > 0.1 && (jaw[i] ?? 0) >= (jaw[i - 1] ?? 0) && (jaw[i] ?? 0) > (jaw[i + 1] ?? 0)) beats++;
    expect(beats).toBeGreaterThanOrEqual(3);
    expect(top(FS.smileL)).toBeGreaterThan(0.6);
  });

  it('an emotion played on purpose lingers in her mood after her face lets it go', () => {
    const glad = played('joy', 8).a.mood();
    const sad = played('sad', 8).a.mood();
    expect(glad.valence).toBeGreaterThan(0.15);
    expect(sad.valence).toBeLessThan(-0.15);
  });

  it('the strong emotions never come on their own, nor amusement at a neutral mood', () => {
    const seen = new Set<MoveId>();
    let n = 0;
    // Three faces, a quarter of an hour each, the person there (a key every few seconds): never waiting, never asleep.
    for (const seed of [77, 78, 79]) {
      const a = createFaceAnimator(seeded(seed), { onMove: id => { seen.add(id); n++; } });
      for (let f = 0; f < 60 * 900; f++) a.step(DT, { ...still, active: f % 300 === 0 });
    }
    expect(n).toBeGreaterThan(200);
    expect(seen.size).toBeGreaterThan(15);
    // Nor a chuckle at nothing: amusement comes only as she is glad.
    for (const id of ['fear', 'anger', 'disgust', 'contempt', 'shame', 'sad', 'surprise', 'amused', 'laugh', 'giggle', 'wink', 'sneeze', 'kiss'] as MoveId[]) expect(seen.has(id), id).toBe(false);
  });

  it('never a laugh on her own, even glad: a giggle or a wink, the laugh waits for something truly funny', () => {
    const seen = new Set<MoveId>();
    for (const seed of [81, 82, 83]) {
      const a = createFaceAnimator(seeded(seed), { onMove: id => { seen.add(id); } });
      for (let f = 0; f < 60 * 900; f++) {
        // Kept glad: joy played on purpose every twenty seconds.
        if (f % (60 * 20) === 0) a.express('joy');
        a.step(DT, { ...still, active: f % 300 === 0 });
      }
    }
    expect(seen.has('giggle') || seen.has('wink')).toBe(true);
    expect(seen.has('laugh')).toBe(false);
  });
});
