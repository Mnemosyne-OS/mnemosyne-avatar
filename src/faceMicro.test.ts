/**
 * faceMicro.test.ts — the small life under the gestures (doc 180 §30):
 * micro-expressions under half a second, faint, picked by her mood; the head
 * beating with her voice and drifting while she speaks, much less at rest; a
 * blink at the end of a phrase; a breath; and with her gestures off only the
 * breath and the blinks.
 */
import { describe, it, expect } from 'vitest';
import { createMicroLife, type MicroInput } from './faceMicro';
import { createFaceAnimator, WAKE_S, type FaceInput } from './faceAnimator';
import { FACE_SHAPE_COUNT, FS } from './faceShapes';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const DT = 1 / 60;
const REST: MicroInput = { motion: true, gestures: true, mouth: 0, speaking: false, glad: 0, low: 0, sleep: 0, person: true };
/** A voice: syllables (the mouth opening and closing) in phrases, with pauses between. */
const voiceAt = (f: number): Pick<MicroInput, 'mouth' | 'speaking'> => {
  const inPhrase = f % 150 < 110;
  const m = inPhrase ? (f % 12 < 6 ? 0.6 : 0.1) : 0;
  return { mouth: m, speaking: m > 0.05 };
};

/** Runs the small life and reports, per frame, the weights and the head. */
function run(seconds: number, input: (f: number) => MicroInput, seed = 5) {
  const life = createMicroLife(seeded(seed));
  const frames: Array<{ w: Float32Array; yaw: number; pitch: number; blink: boolean }> = [];
  for (let f = 0; f < seconds * 60; f++) {
    const w = new Float32Array(FACE_SHAPE_COUNT);
    const r = life.step(DT, input(f), w);
    frames.push({ w, yaw: r.yaw, pitch: r.pitch, blink: r.blink });
  }
  return frames;
}
/** The flickers of one movement: each time it rose over `on`, how many frames until it fell under `off`. */
function flickers(series: number[], on = 0.08, off = 0.01): number[] {
  const lengths: number[] = [];
  let since = -1;
  series.forEach((v, i) => {
    if (since < 0 && v > on) { let j = i; while (j > 0 && (series[j - 1] ?? 0) > off) j--; since = j; }
    if (since >= 0 && v < off) { lengths.push(i - since); since = -1; }
  });
  return lengths;
}
const spread = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };

describe('faceMicro', () => {
  it('micro-expressions: every few seconds a faint flicker, each under half a second', () => {
    const frames = run(120, () => REST);
    const brows = flickers(frames.map(fr => Math.max(fr.w[FS.browUpL] ?? 0, fr.w[FS.browUpR] ?? 0, fr.w[FS.browInnerUp] ?? 0, fr.w[FS.browFrown] ?? 0, fr.w[FS.smileL] ?? 0, fr.w[FS.smileR] ?? 0, fr.w[FS.lipPress] ?? 0, fr.w[FS.mouthFrown] ?? 0)));
    expect(brows.length).toBeGreaterThan(25);
    for (const n of brows) expect(n * DT).toBeLessThan(0.5);
    const peak = Math.max(...frames.flatMap(fr => [FS.browUpL, FS.smileL, FS.lipPress, FS.browInnerUp].map(i => fr.w[i] ?? 0)));
    expect(peak).toBeLessThan(0.35);
  });

  it('her mood picks them: glad, the corners of the mouth flicker; low, the inner brows', () => {
    const count = (glad: number, low: number, shapes: number[]) =>
      flickers(run(300, () => ({ ...REST, glad, low })).map(fr => Math.max(...shapes.map(i => fr.w[i] ?? 0)))).length;
    const corners = [FS.smileL, FS.smileR];
    expect(count(0.6, 0, corners)).toBeGreaterThan(count(0, 0.6, corners) * 1.5);
    expect(count(0, 0.6, [FS.browInnerUp])).toBeGreaterThan(count(0.6, 0, [FS.browInnerUp]) * 1.5);
  });

  it('speaking, the head nods quickly on her stressed syllables, small', () => {
    const talk = run(30, f => ({ ...REST, ...voiceAt(f) }));
    // A beat is quick (a nod in a third of a second); the drift and the breath are slow.
    let quick = 0, was = false;
    for (let i = 1; i < talk.length; i++) {
      const fast = ((talk[i - 1]?.pitch ?? 0) - (talk[i]?.pitch ?? 0)) / DT > 0.8;
      if (fast && !was) quick++;
      was = fast;
    }
    expect(quick).toBeGreaterThan(30);
    expect(Math.max(...talk.map(fr => Math.abs(fr.pitch)))).toBeLessThan(0.45);
    const rest = run(30, () => REST);
    expect(rest.some((fr, i) => i > 0 && ((rest[i - 1]?.pitch ?? 0) - fr.pitch) / DT > 0.8)).toBe(false);
  });

  it('speaking, the head drifts with her voice; listening, it barely moves', () => {
    // A steady voice: no stressed syllable after the first, so no beats, only the drift.
    const talk = run(40, () => ({ ...REST, mouth: 0.5, speaking: true })).slice(60);
    const rest = run(40, () => REST).slice(60);
    expect(spread(talk.map(fr => fr.yaw))).toBeGreaterThan(3 * spread(rest.map(fr => fr.yaw)));
    expect(Math.max(...talk.map(fr => Math.abs(fr.yaw)))).toBeLessThan(0.2);
  });

  it('a phrase ended: often a blink', () => {
    const talk = run(60, f => ({ ...REST, ...voiceAt(f) }));
    const blinks = talk.filter(fr => fr.blink).length;
    // 24 phrases in a minute: about 60 % of them.
    expect(blinks).toBeGreaterThan(8);
    expect(blinks).toBeLessThan(22);
    expect(run(60, () => REST).filter(fr => fr.blink)).toHaveLength(0);
  });

  it('she breathes, the head nodding a hair, 12 to 20 times a minute', () => {
    const frames = run(60, () => ({ ...REST, gestures: false }));
    const pitch = frames.map(fr => fr.pitch);
    let tops = 0;
    for (let i = 1; i < pitch.length - 1; i++) if ((pitch[i] ?? 0) > (pitch[i - 1] ?? 0) && (pitch[i] ?? 0) >= (pitch[i + 1] ?? 0) && (pitch[i] ?? 0) > 0.01) tops++;
    expect(tops).toBeGreaterThanOrEqual(12);
    expect(tops).toBeLessThanOrEqual(20);
    expect(Math.max(...pitch.map(Math.abs))).toBeLessThan(0.04);
  });

  it('her gestures off: no flicker, no drift, no beat; an animal has no person’s micro-expressions', () => {
    const off = run(60, f => ({ ...REST, gestures: false, ...voiceAt(f) }));
    expect(Math.max(...off.flatMap(fr => Array.from(fr.w).map(Math.abs)))).toBe(0);
    expect(Math.max(...off.map(fr => Math.abs(fr.yaw)))).toBe(0);
    const animal = run(60, () => ({ ...REST, person: false }));
    expect(Math.max(...animal.flatMap(fr => [FS.browUpL, FS.smileL, FS.lipPress, FS.browInnerUp, FS.mouthFrown].map(i => fr.w[i] ?? 0)))).toBe(0);
  });
});

describe('the small life on her face (faceAnimator)', () => {
  const still: FaceInput = { voice: 0, spectrum: null, lookGoal: { x: 0, y: 0 }, motion: true };
  it('at rest her chest breathes (the breath movement rises and falls); asleep, her lowered head rises and falls with it', () => {
    const a = createFaceAnimator(seeded(3), { lifeRandom: seeded(4) });
    const quiet = { ...still, gestures: false };
    for (let f = 0; f < 60 * 3; f++) a.step(DT, quiet);
    const chest: number[] = [];
    for (let f = 0; f < 60 * 10; f++) chest.push(a.step(DT, quiet).weights[FS.breath] ?? 0);
    expect(Math.min(...chest)).toBeLessThan(0.15);
    expect(Math.max(...chest)).toBeGreaterThan(0.4);
    const s = createFaceAnimator(seeded(5), { lifeRandom: seeded(6) });
    for (let f = 0; f < 60 * 360; f++) s.step(DT, still);
    const pitch: number[] = [];
    for (let f = 0; f < 60 * 20; f++) { const r = s.step(DT, still); if (r.sleep > 0.95) pitch.push(r.head.pitch); }
    expect(pitch.length).toBeGreaterThan(600);
    expect(Math.max(...pitch) - Math.min(...pitch)).toBeGreaterThan(0.008);
  });
  it('starting to speak, she mostly looks away first and is back on the person within two seconds', () => {
    // A glance of her own started while she speaks is her own business, not the look-away's: that seed is not counted for « back ».
    const OWN_LOOKS = new Set(['glance', 'shyGlance', 'lookAround']);
    let away = 0, back = 0, counted = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let ownLook = false, speaking = false;
      const a = createFaceAnimator(seeded(seed), { lifeRandom: seeded(seed + 1000), onMove: id => { if (speaking && OWN_LOOKS.has(id)) ownLook = true; } });
      // Nothing of her own playing when she starts: only the look-away can lead her eyes then.
      for (let f = 0; f < 60 * (WAKE_S + 1); f++) a.step(DT, { ...still, gestures: false });
      let far = 0, last = 1;
      speaking = true;
      for (let f = 0; f < 60 * 2.5; f++) {
        const r = a.step(DT, { ...still, voice: f % 12 < 6 ? 0.6 : 0.1 });
        if (f < 60) far = Math.max(far, Math.hypot(r.look.x, r.look.y));
        if (f === 60 * 2.5 - 1) last = Math.hypot(r.look.x, r.look.y);
      }
      if (far > 0.25) away++;
      if (ownLook) continue;
      counted++;
      if (last < 0.3) back++;
    }
    expect(away).toBeGreaterThanOrEqual(9);
    expect(counted).toBeGreaterThanOrEqual(12);
    expect(back).toBeGreaterThanOrEqual(Math.ceil(0.9 * counted));
  });
});

describe('the breath on her chest (faceMicro)', () => {
  const tops = (xs: number[]) => { let n = 0; for (let i = 1; i < xs.length - 1; i++) if ((xs[i] ?? 0) > (xs[i - 1] ?? 0) && (xs[i] ?? 0) >= (xs[i + 1] ?? 0) && (xs[i] ?? 0) > 0.3) n++; return n; };
  const breaths = (input: (f: number) => MicroInput, seconds = 60) => {
    const life = createMicroLife(seeded(11));
    const out: Array<{ breath: number; chest: number }> = [];
    for (let f = 0; f < 60 * seconds; f++) { const r = life.step(DT, input(f), new Float32Array(FACE_SHAPE_COUNT)); out.push({ breath: r.breath, chest: r.chest }); }
    return out;
  };
  it('awake, 12 to 20 breaths a minute on the chest; asleep, slower and deeper', () => {
    const awake = breaths(() => ({ ...REST, gestures: false })).slice(60);
    const n = tops(awake.map(b => b.chest));
    expect(n).toBeGreaterThanOrEqual(12);
    expect(n).toBeLessThanOrEqual(20);
    const asleep = breaths(() => ({ ...REST, sleep: 1 })).slice(60);
    expect(tops(asleep.map(b => b.chest))).toBeLessThan(n);
    expect(Math.max(...asleep.map(b => b.breath))).toBeGreaterThan(Math.max(...awake.map(b => b.breath)) + 0.2);
  });
  it('speaking, the air goes out over a phrase and comes back in at each pause', () => {
    const talk = breaths(f => ({ ...REST, ...voiceAt(f) }), 20);
    // Phrases of 110 frames, pauses of 40: the chest at a phrase's end, then at its pause's end.
    let rose = 0, phrases = 0;
    for (let k = 2; k < 7; k++) {
      const endPhrase = talk[k * 150 + 108]?.chest ?? 0, endPause = talk[k * 150 + 148]?.chest ?? 0, startPhrase = talk[k * 150 + 2]?.chest ?? 0;
      phrases++;
      if (endPause > endPhrase + 0.3 && endPhrase < startPhrase) rose++;
    }
    expect(rose).toBe(phrases);
  });
});

