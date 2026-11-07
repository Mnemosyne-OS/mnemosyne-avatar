/**
 * faceScenes.test.ts — the small scenes (doc 180 §34), timed on what is
 * measured of them: a laugh's « ha »s at ~4.7 a second, the head back; a long
 * yawn of about six seconds, the eyes shut at its peak; a sneeze's catching
 * breaths then the snap; a wink that shuts one eye only; a yawn when she falls
 * asleep; none of the glad ones at a neutral mood, no daydream mid-sentence.
 */
import { describe, it, expect } from 'vitest';
import { SCENES, type SceneId } from './faceScenes';
import { createFaceAnimator, HEAD_PITCH, SLEEP_AFTER_S, type FaceInput, type MoveId } from './faceAnimator';
import { FS, type FaceFrame } from './faceShapes';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const still: FaceInput = { voice: 0, spectrum: null, lookGoal: { x: 0, y: 0 }, motion: true };
const quiet = { ...still, gestures: false };
const DT = 1 / 60;

/** Plays a scene on a quiet face and keeps every frame. */
function play(id: MoveId, seconds: number, opts: Parameters<typeof createFaceAnimator>[1] = {}) {
  const a = createFaceAnimator(seeded(5), { lifeRandom: seeded(6), ...opts });
  for (let f = 0; f < 30; f++) a.step(DT, quiet);
  a.express(id);
  return Array.from({ length: Math.round(60 * seconds) }, (): FaceFrame => {
    const r = a.step(DT, quiet);
    return { ...r, weights: Float32Array.from(r.weights), head: { ...r.head }, look: { ...r.look }, squint: [r.squint[0], r.squint[1]], wink: [r.wink[0], r.wink[1]] };
  });
}
const peaks = (xs: number[], floor: number) => { let n = 0; for (let i = 1; i < xs.length - 1; i++) if ((xs[i] ?? 0) > floor && (xs[i] ?? 0) >= (xs[i - 1] ?? 0) && (xs[i] ?? 0) > (xs[i + 1] ?? 0)) n++; return n; };

describe('faceScenes', () => {
  it('every scene that touches the mouth says so (the voice owns it while she speaks)', () => {
    const MOUTH = ['jawOpen', 'lipsWide', 'lipsRound', 'lipPress', 'mouthFrown', 'chinRaise', 'mouthSide'];
    for (const id of Object.keys(SCENES) as SceneId[]) {
      for (const { g } of SCENES[id](seeded(2))) {
        const touches = MOUTH.some(m => (g.weights as Record<string, number>)[m] || (g.pulse?.weights as Record<string, number> | undefined)?.[m]);
        if (touches) expect(g.mouth, id).toBe(true);
      }
    }
  });

  it('a laugh: the « ha »s at about 4.7 a second, the head back, the eyes narrowed, the smile wide', () => {
    const r = play('laugh', 2.2);
    const jaw = r.slice(30, 90).map(x => x.weights[FS.jawOpen] ?? 0);
    const has = peaks(jaw, 0.2);
    expect(has).toBeGreaterThanOrEqual(4);
    expect(has).toBeLessThanOrEqual(6);
    expect(Math.max(...r.map(x => x.head.pitch))).toBeGreaterThan(0.3 * HEAD_PITCH);
    expect(Math.max(...r.map(x => Math.min(x.squint[0], x.squint[1])))).toBeGreaterThan(0.5);
    expect(Math.max(...r.map(x => x.weights[FS.smileL] ?? 0))).toBeGreaterThan(0.8);
  });

  it('a long yawn: about six seconds, the jaw wide, the head back, the eyes shut at its peak', () => {
    const r = play('yawnLong', 7);
    const open = r.filter(x => (x.weights[FS.jawOpen] ?? 0) > 0.3).length * DT;
    expect(open).toBeGreaterThan(3);
    expect(open).toBeLessThan(6.5);
    expect(r.some(x => (x.weights[FS.jawOpen] ?? 0) > 0.8 && x.blink > 0.9)).toBe(true);
    expect(Math.max(...r.map(x => x.head.pitch))).toBeGreaterThan(0.5 * HEAD_PITCH);
  });

  it('a sneeze: catching breaths that lift the head, then the snap, head down, eyes shut, nose wrinkled', () => {
    const r = play('sneeze', 3.5);
    const top = r.reduce((m, x, i) => (x.head.pitch > (r[m]?.head.pitch ?? -1) ? i : m), 0);
    expect(r[top]!.head.pitch).toBeGreaterThan(0.3 * HEAD_PITCH);
    const snap = r.slice(top).find(x => (x.weights[FS.noseWrinkle] ?? 0) > 0.6 && x.blink > 0.9);
    expect(snap).toBeDefined();
    expect(Math.min(...r.slice(top).map(x => x.head.pitch))).toBeLessThan(-0.2 * HEAD_PITCH);
  });

  it('a sigh: a deep breath in, the chest swelling, then the long breath out, the chest sinking under its rest', () => {
    const r = play('sigh', 3.5).map(x => x.weights[FS.breath] ?? 0);
    const top = r.indexOf(Math.max(...r));
    expect(r[top]).toBeGreaterThan(0.9);
    expect(Math.min(...r.slice(top))).toBeLessThan(0);
  });

  it('a wink shuts one eye only', () => {
    const r = play('wink', 1);
    const w = r.find(x => Math.max(x.wink[0], x.wink[1]) > 0.9);
    expect(w).toBeDefined();
    expect(Math.min(w!.wink[0], w!.wink[1])).toBeLessThan(0.1);
    expect(w!.blink).toBeLessThan(0.1);
  });

  it('falling asleep, she yawns: within seconds of dozing off, every time', () => {
    for (const seed of [7, 17, 27]) {
      const a = createFaceAnimator(seeded(seed), { lifeRandom: seeded(seed + 1) });
      let f = 0, dozed = -1;
      const jaws: number[] = [];
      for (; f < 60 * (SLEEP_AFTER_S + 20); f++) {
        const r = a.step(DT, still);
        if (dozed < 0 && r.sleep > 0.005) dozed = f;
        if (dozed >= 0) jaws.push(r.weights[FS.jawOpen] ?? 0);
        if (dozed >= 0 && f - dozed > 60 * 5) break;
      }
      expect(dozed, `seed ${seed}`).toBeGreaterThan(0);
      expect(Math.max(...jaws), `seed ${seed}`).toBeGreaterThan(0.6);
    }
  });

  it('no daydream mid-sentence', () => {
    const seen: MoveId[] = [];
    for (let seed = 30; seed < 40; seed++) {
      const a = createFaceAnimator(seeded(seed), { lifeRandom: seeded(seed + 100), onMove: id => seen.push(id) });
      for (let f = 0; f < 60 * 200; f++) a.step(DT, { ...still, voice: f % 20 < 14 ? 0.5 : 0.05 });
    }
    expect(seen.length).toBeGreaterThan(150);
    expect(seen).not.toContain('daydream');
  });

  it('thinking up to one side: the gaze and the head go up there and stay; the screen side is fixed', () => {
    for (const [id, s] of [['thinkUpRight', 1], ['thinkUpLeft', -1], ['lookUpRight', 1], ['lookUpLeft', -1]] as const) {
      const held = play(id, 1.6).slice(60, 96);
      for (const f of held) {
        expect(f.look.x * s, id).toBeGreaterThan(0.3);
        expect(f.look.y, id).toBeGreaterThan(0.3);
        expect(f.head.yaw * s, id).toBeGreaterThan(0);
      }
    }
  });

  it('the sigh comes while she is still looking up, the gaze holds after it, then it comes back to the centre', () => {
    for (const id of ['thinkUpRight', 'thinkUpLeft'] as const) {
      const r = play(id, 7);
      const breath = r.map(x => x.weights[FS.breath] ?? 0);
      const inAt = breath.indexOf(Math.max(...breath));
      const outAt = breath.indexOf(Math.min(...breath));
      expect(breath[inAt], id).toBeGreaterThan(0.5);
      expect(breath[outAt], id).toBeLessThan(-0.3);
      expect(outAt, id).toBeGreaterThan(inAt);
      // At the deepest of the breath out the eyes are still up, and still up 0.5 s later.
      expect(r[outAt]!.look.y, id).toBeGreaterThan(0.3);
      expect(r[outAt + 30]!.look.y, id).toBeGreaterThan(0.3);
      const end = r[r.length - 1]!;
      expect(Math.abs(end.look.x), id).toBeLessThan(0.1);
      expect(Math.abs(end.look.y), id).toBeLessThan(0.1);
    }
  });

  it('the look up without the sigh never moves the mouth, so it plays while she speaks', () => {
    for (const id of ['lookUpLeft', 'lookUpRight'] as const) {
      expect(SCENES[id](seeded(3)).some(p => p.g.mouth), id).toBe(false);
      const a = createFaceAnimator(seeded(5), { lifeRandom: seeded(6) });
      for (let f = 0; f < 30; f++) a.step(DT, quiet);
      a.express(id);
      let up = 0;
      for (let f = 0; f < 90; f++) up = Math.max(up, a.step(DT, { ...quiet, voice: 0.5 }).look.y);
      expect(up, id).toBeGreaterThan(0.3);
    }
  });

  it('on an animal: a laugh is a dog’s open mouth, a sneeze or a wink is nothing', () => {
    const dog = play('laugh', 2, { species: 'dog', ears: true });
    expect(Math.max(...dog.map(x => x.weights[FS.jawOpen] ?? 0))).toBeGreaterThan(0.3);
    expect(Math.max(...dog.map(x => x.weights[FS.smileL] ?? 0))).toBe(0);
    const cat = play('sneeze', 3, { species: 'cat', ears: true });
    expect(Math.max(...cat.map(x => x.weights[FS.noseWrinkle] ?? 0))).toBe(0);
    expect(Math.max(...play('wink', 1, { species: 'cat', ears: true }).map(x => Math.max(x.wink[0], x.wink[1])))).toBe(0);
  });
});
