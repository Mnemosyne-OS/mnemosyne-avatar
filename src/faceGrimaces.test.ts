/**
 * faceGrimaces.test.ts — a double click on her face pulls a funny face (doc
 * 180 §36): each grimace does what its name says; never the same twice in a
 * row; an animal clowns its own way. What a click on the app's board does is
 * pinned in the app (planeClick.test).
 */
import { describe, it, expect } from 'vitest';
import { ANIMAL_FED_UP, FED_UP, GRIMACE_IDS, GRIMACE_ROW_S, GRIMACES } from './faceScenes';
import { SPECIES } from './faceSpecies';
import { createFaceAnimator, type FaceInput, type MoveId } from './faceAnimator';
import { FS, type FaceFrame } from './faceShapes';
import { MOOD_REST } from './faceMood';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const still: FaceInput = { voice: 0, spectrum: null, lookGoal: { x: 0, y: 0 }, motion: true };
const quiet = { ...still, gestures: false };
const DT = 1 / 60;

function play(id: MoveId, seconds = 3) {
  const a = createFaceAnimator(seeded(3), { lifeRandom: seeded(4) });
  for (let f = 0; f < 30; f++) a.step(DT, quiet);
  a.express(id);
  return Array.from({ length: Math.round(60 * seconds) }, (): FaceFrame => {
    const r = a.step(DT, quiet);
    return { ...r, weights: Float32Array.from(r.weights), squint: [r.squint[0], r.squint[1]], head: { ...r.head }, look: { ...r.look } };
  });
}
/** The next double click she takes: the ones while a funny face still plays are ignored. */
function pullNext(a: ReturnType<typeof createFaceAnimator>): MoveId {
  for (let f = 0; f < 60 * 15; f++) {
    const id = a.grimace();
    if (id) return id;
    a.step(DT, quiet);
  }
  throw new Error('no grimace taken in 15 s');
}
const top = (r: FaceFrame[], id: number) => Math.max(...r.map(x => x.weights[id] ?? 0));
const low = (r: FaceFrame[], id: number) => Math.min(...r.map(x => x.weights[id] ?? 0));

describe('the grimaces', () => {
  it('every grimace that touches the mouth says so', () => {
    const MOUTH = ['jawOpen', 'lipsWide', 'lipsRound', 'lipPress', 'mouthFrown', 'chinRaise', 'mouthSide', 'cheekPuff'];
    for (const id of GRIMACE_IDS) {
      for (const { g } of GRIMACES[id](seeded(2))) {
        const touches = MOUTH.some(m => (g.weights as Record<string, number>)[m] || (g.pulse?.weights as Record<string, number> | undefined)?.[m]);
        if (touches) expect(g.mouth, id).toBe(true);
      }
    }
  });

  it('each does what its name says', () => {
    expect(Math.max(...play('crossEyes').map(r => r.cross))).toBeGreaterThan(0.8);
    expect(top(play('puffCheeks'), FS.cheekPuff)).toBeGreaterThan(0.8);
    const fish = play('fishFace');
    expect(low(fish, FS.cheekPuff)).toBeLessThan(-0.8);
    expect(top(fish, FS.lipsRound)).toBeGreaterThan(0.8);
    const dizzy = play('dizzy').map(r => r.weights[FS.headTilt] ?? 0);
    expect(Math.max(...dizzy)).toBeGreaterThan(0.5);
    expect(Math.min(...dizzy)).toBeLessThan(-0.5);
    expect(Math.max(...play('wonky').map(r => Math.abs(r.weights[FS.mouthSide] ?? 0)))).toBeGreaterThan(0.8);
    const scrunch = play('scrunch');
    expect(top(scrunch, FS.noseWrinkle)).toBeGreaterThan(0.9);
    expect(Math.max(...scrunch.map(r => Math.min(r.squint[0], r.squint[1])))).toBeGreaterThan(0.9);
    const big = play('bigEyes');
    expect(top(big, FS.jawOpen)).toBeGreaterThan(0.6);
    expect(top(big, FS.browUpL)).toBeGreaterThan(0.9);
    let buzz = 0;
    const lips = play('raspberry', 1.5).map(r => r.weights[FS.lipsRound] ?? 0);
    for (let i = 1; i < lips.length - 1; i++) if ((lips[i] ?? 0) > (lips[i - 1] ?? 0) && (lips[i] ?? 0) >= (lips[i + 1] ?? 0)) buzz++;
    expect(buzz).toBeGreaterThan(10);
  });

  it('a double click never pulls the same face twice in a row, and it amuses her', () => {
    const a = createFaceAnimator(seeded(5), { lifeRandom: seeded(6) });
    const seen: MoveId[] = [];
    for (let i = 0; i < 200; i++) seen.push(pullNext(a));
    // Every fourth in a quick row is a fed-up face: the grimaces are the others.
    const grimaces = seen.filter((_, i) => i % 4 !== 3);
    for (let i = 1; i < grimaces.length; i++) expect(grimaces[i]).not.toBe(grimaces[i - 1]);
    expect(new Set(grimaces).size).toBeGreaterThanOrEqual(6);
    for (const id of grimaces) expect(GRIMACE_IDS as readonly string[]).toContain(id);
    const b = createFaceAnimator(seeded(7), { lifeRandom: seeded(8) });
    b.grimace();
    for (let f = 0; f < 60 * 2; f++) b.step(DT, quiet);
    expect(b.mood().arousal).toBeGreaterThan(MOOD_REST.arousal + 0.1);
  });

  it('after three grimaces in a quick row the fourth is a fed-up face, and the row starts again; a pause starts it again too', () => {
    const a = createFaceAnimator(seeded(13), { lifeRandom: seeded(14) });
    const row = () => Array.from({ length: 4 }, () => pullNext(a));
    for (let n = 0; n < 6; n++) {
      const [g1, g2, g3, fed] = row();
      for (const id of [g1, g2, g3]) expect(GRIMACE_IDS as readonly string[]).toContain(id);
      expect(FED_UP as readonly string[]).toContain(fed);
    }
    const b = createFaceAnimator(seeded(15), { lifeRandom: seeded(16) });
    for (let i = 0; i < 3; i++) pullNext(b);
    for (let f = 0; f < 60 * (GRIMACE_ROW_S + 1); f++) b.step(DT, quiet);
    expect(GRIMACE_IDS as readonly string[]).toContain(pullNext(b));
  });

  it('a double click while she still pulls a face is ignored; once it is over, she takes the next', () => {
    const a = createFaceAnimator(seeded(17), { lifeRandom: seeded(18) });
    expect(a.grimace()).not.toBeNull();
    a.step(DT, quiet);
    expect(a.grimace()).toBeNull();
    for (let f = 0; f < 60 * 0.5; f++) a.step(DT, quiet);
    expect(a.grimace()).toBeNull();
    for (let f = 0; f < 60 * 8; f++) a.step(DT, quiet);
    expect(a.grimace()).not.toBeNull();
  });

  it('the eye roll rolls the eyes up under heavy lids', () => {
    const r = play('eyeRoll');
    expect(Math.max(...r.map(x => x.look.y))).toBeGreaterThan(0.5);
    expect(Math.max(...r.map(x => Math.abs(x.weights[FS.mouthSide] ?? 0)))).toBeGreaterThan(0.3);
  });

  it('an animal clowns its own way: never a person’s grimace', () => {
    for (const species of ['cat', 'dog', 'bear', 'lion'] as const) {
      const a = createFaceAnimator(seeded(9), { species, ears: species !== 'lion', lifeRandom: seeded(10) });
      for (let i = 0; i < 8; i++) expect(i % 4 === 3 ? ANIMAL_FED_UP : SPECIES[species].funny, species).toContain(pullNext(a));
    }
    const dog = createFaceAnimator(seeded(11), { species: 'dog', ears: true, lifeRandom: seeded(12) });
    for (let f = 0; f < 30; f++) dog.step(DT, quiet);
    dog.express('puffCheeks');
    let puff = 0;
    for (let f = 0; f < 60 * 2; f++) puff = Math.max(puff, Math.abs(dog.step(DT, quiet).weights[FS.cheekPuff] ?? 0));
    expect(puff).toBe(0);
  });
});
