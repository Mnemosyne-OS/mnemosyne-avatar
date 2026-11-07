/**
 * faceSpecies.test.ts — each animal lives and feels its own way (doc 180 §31):
 * nothing of a person's that reads wrong on it (a smile, pressed lips, a
 * frown, a brow flash), its own answers to a caress, a start, a question, the
 * person coming back; a dog's tilt always to its own side; a cat blinking
 * rarely; a bear slower; hanging ears moving less.
 */
import { describe, it, expect } from 'vitest';
import { ANIMAL_MOVES, SPECIES, type AnimalMoveId } from './faceSpecies';
import { createFaceAnimator, isMoveId, WAKE_S, WAIT_AFTER_S, type FaceInput, type MoveId } from './faceAnimator';
import { FS, type AnimalSpecies, type FaceFrame } from './faceShapes';
import { SPECIES_OF } from './portraitIds';
import { BEAR_SPEC, KITTEN_SPEC, LABRADOR_SPEC, LEO_SPEC, SHEPHERD_SPEC } from './galleryFigures';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const still: FaceInput = { voice: 0, spectrum: null, lookGoal: { x: 0, y: 0 }, motion: true };
const DT = 1 / 60;
const ALL: AnimalSpecies[] = ['cat', 'dog', 'bear', 'lion'];
const animal = (species: AnimalSpecies, seed = 7, life = seed + 500) => createFaceAnimator(seeded(seed), { species, ears: species !== 'lion', lifeRandom: seeded(life) });
const awake = (a: ReturnType<typeof animal>, input: FaceInput = still) => { for (let f = 0; f < 60 * (WAKE_S + 1); f++) a.step(DT, input); };
/** The most a movement reached over these frames. */
const top = (frames: FaceFrame[], shape: number) => Math.max(...frames.map(r => r.weights[shape] ?? 0));
/** n frames of life, each one copied (the animator rewrites the same frame in place). */
const steps = (a: ReturnType<typeof animal>, n: number, input: FaceInput | ((f: number) => FaceInput) = still): FaceFrame[] =>
  Array.from({ length: n }, (_, f) => {
    const r = a.step(DT, typeof input === 'function' ? input(f) : input);
    return { ...r, weights: Float32Array.from(r.weights), head: { ...r.head }, look: { ...r.look }, squint: [r.squint[0], r.squint[1]] };
  });

describe('faceSpecies, the tables', () => {
  it('every move an animal names is a real move, and every one that touches the mouth says so', () => {
    for (const ways of Object.values(SPECIES)) {
      const named = [...ways.idle.map(([id]) => id), ...ways.waitIdle.map(([id]) => id), ...Object.values(ways.resolve).filter((v): v is string => v !== null), ways.back, ...ways.own];
      for (const id of named) expect(isMoveId(id), id).toBe(true);
    }
    for (const id of Object.keys(ANIMAL_MOVES) as AnimalMoveId[]) {
      for (const { g } of ANIMAL_MOVES[id](seeded(3), { tilt: 1 })) {
        const touches = ['jawOpen', 'lipsWide', 'lipsRound', 'lipPress', 'mouthFrown', 'chinRaise', 'mouthSide'].some(m => (g.weights as Record<string, number>)[m] || (g.pulse?.weights as Record<string, number> | undefined)?.[m]);
        if (touches) expect(g.mouth, id).toBe(true);
      }
    }
  });

  it('a bear never sways (distress) nor pushes its lips out (fear); no animal plays a person’s smile, smirk or pressed lips on its own', () => {
    const bear = [...SPECIES.bear.idle, ...SPECIES.bear.waitIdle].map(([id]) => id);
    expect(bear).not.toContain('sway');
    for (const species of ALL) {
      for (const [id] of [...SPECIES[species].idle, ...SPECIES[species].waitIdle]) {
        for (const { g } of ANIMAL_MOVES[id as AnimalMoveId]?.(seeded(1), { tilt: 1 }) ?? []) {
          expect(g.weights.lipPress ?? 0, `${species} ${id}`).toBe(0);
          expect(g.weights.smileL ?? 0, `${species} ${id}`).toBe(0);
          if (species === 'bear') expect(g.weights.lipsRound ?? 0, `${species} ${id}`).toBe(0);
        }
        expect(['smile', 'smirk', 'joy', 'pensive', 'concentrate', 'doubt', 'sigh', 'lowerAndLift', 'emphasis'], `${species} ${id}`).not.toContain(id);
      }
    }
  });

  it('each animal face carries its species; the labrador’s hanging ears move less', () => {
    expect([KITTEN_SPEC.species, SHEPHERD_SPEC.species, LABRADOR_SPEC.species, BEAR_SPEC.species, LEO_SPEC.species]).toEqual(['cat', 'dog', 'dog', 'bear', 'lion']);
    expect([SPECIES_OF.kitten, SPECIES_OF.shepherd, SPECIES_OF.labrador, SPECIES_OF.bear, SPECIES_OF.leo]).toEqual(['cat', 'dog', 'dog', 'bear', 'lion']);
    expect(LABRADOR_SPEC.earRange).toEqual([-0.3, 0.6]);
    expect(SHEPHERD_SPEC.earRange).toBeUndefined();
  });
});

describe('faceSpecies, on the face', () => {
  it('a quarter of an hour on its own: no smile, no pressed lips, no frown, no rounded lips on any animal', () => {
    for (const species of ALL) {
      const a = animal(species, 21);
      let worst = 0;
      for (let f = 0; f < 60 * 900; f++) {
        const r = a.step(DT, { ...still, active: f % 300 === 0 });
        for (const id of ['smileL', 'smileR', 'lipPress', 'browFrown', 'mouthFrown', 'lipsRound'] as const) worst = Math.max(worst, Math.abs(r.weights[FS[id]] ?? 0));
      }
      expect(worst, species).toBe(0);
    }
  });

  it('a person’s move on an animal: joy is a cat’s slow blink and a dog’s open mouth; a smirk on a bear is nothing', () => {
    const play = (species: AnimalSpecies, id: MoveId) => {
      const a = animal(species, 9);
      awake(a, { ...still, gestures: false });
      a.express(id);
      return steps(a, 60 * 4, { ...still, gestures: false });
    };
    const cat = play('cat', 'joy');
    expect(Math.max(...cat.map(r => r.blink))).toBeGreaterThan(0.9);
    expect(top(cat, FS.smileL)).toBe(0);
    const dog = play('dog', 'joy');
    expect(top(dog, FS.jawOpen)).toBeGreaterThan(0.3);
    expect(top(dog, FS.smileL)).toBe(0);
    const bear = play('bear', 'smirk');
    // Nothing but its breath.
    expect(Math.max(...bear.flatMap(r => Array.from(r.weights).filter((_, i) => i !== FS.breath).map(Math.abs)))).toBeLessThan(0.05);
  });

  it('a dog tilts its head always to its own side', () => {
    const sides = (life: number) => {
      const signs = new Set<number>();
      for (let n = 0; n < 6; n++) {
        const a = animal('dog', 30 + n, life);
        awake(a, { ...still, gestures: false });
        a.express('curious');
        const tilt = steps(a, 60 * 2, { ...still, gestures: false }).map(r => r.weights[FS.headTilt] ?? 0);
        const peak = tilt.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);
        expect(Math.abs(peak)).toBeGreaterThan(0.3);
        signs.add(Math.sign(peak));
      }
      return signs;
    };
    // The same dog (its own life) six times: one side. Two dogs may differ.
    expect(sides(101).size).toBe(1);
    expect(sides(102).size).toBe(1);
  });

  it('stroked, a cat purrs with its ears a little forward; a dog’s ears go back and its mouth opens; neither smiles', () => {
    const stroke: FaceInput = { ...still, near: { dist: 0.8, speed: 0.1, approach: 0, dx: 0.5, dy: 0 } };
    const run = (species: AnimalSpecies) => { const a = animal(species, 11); awake(a); return steps(a, 60 * 4, stroke).slice(60 * 2); };
    const cat = run('cat');
    expect(Math.min(...cat.map(r => r.tremble))).toBeGreaterThan(0.1);
    // Its ears forward on the whole (a flick of its own may pass).
    expect(cat.reduce((n, r) => n + (r.weights[FS.earL] ?? 0), 0) / cat.length).toBeLessThan(0);
    expect(top(cat, FS.smileL)).toBe(0);
    const dog = run('dog');
    expect(Math.min(...dog.map(r => r.weights[FS.earL] ?? 0))).toBeGreaterThan(0.3);
    expect(Math.min(...dog.map(r => r.weights[FS.jawOpen] ?? 0))).toBeGreaterThan(0.1);
    expect(top(dog, FS.smileL)).toBe(0);
    expect(Math.max(...dog.map(r => r.tremble))).toBe(0);
  });

  it('glad after a caress, an animal shows it its own way: softer eyes on a cat, ears back on a dog, never a smile', () => {
    const stroke: FaceInput = { ...still, near: { dist: 0.8, speed: 0.1, approach: 0, dx: 0.5, dy: 0 } };
    const after = (species: AnimalSpecies) => {
      const a = animal(species, 19);
      awake(a, { ...still, gestures: false });
      steps(a, 60 * 5, { ...stroke });
      return steps(a, 60 * 3, { ...still, gestures: false }).slice(60);
    };
    const cat = after('cat');
    expect(Math.min(...cat.map(r => r.blink))).toBeGreaterThan(0.03);
    expect(top(cat, FS.smileL)).toBe(0);
    const dog = after('dog');
    expect(Math.min(...dog.map(r => r.weights[FS.earL] ?? 0))).toBeGreaterThan(0.05);
    expect(top(dog, FS.smileL)).toBe(0);
  });

  it('thinking, an animal presses no lips and frowns no brow: its ears go forward, a dog tilts its head', () => {
    for (const species of ['cat', 'dog'] as const) {
      const a = animal(species, 20);
      awake(a);
      const r = steps(a, 60 * 4, { ...still, thinking: true }).slice(60);
      expect(top(r, FS.lipPress), species).toBe(0);
      expect(top(r, FS.browFrown), species).toBe(0);
      expect(r.reduce((n, x) => n + (x.weights[FS.earL] ?? 0), 0) / r.length, species).toBeLessThan(-0.1);
      if (species === 'dog') expect(Math.min(...r.map(x => Math.abs(x.weights[FS.headTilt] ?? 0)))).toBeGreaterThan(0.2);
    }
  });

  it('startled, an animal flattens its ears and lifts no brow; a labrador’s hanging ears stay in their range', () => {
    const start = (species: AnimalSpecies, earRange?: readonly [number, number]) => {
      const a = createFaceAnimator(seeded(12), { species, ears: true, lifeRandom: seeded(13), ...(earRange ? { earRange } : {}) });
      awake(a);
      a.step(DT, { ...still, near: { dist: 1.5, speed: 6, approach: 5, dx: 0.3, dy: 0 } });
      return steps(a, 40);
    };
    const shepherd = start('dog');
    expect(top(shepherd, FS.earL)).toBeGreaterThan(0.7);
    expect(top(shepherd, FS.browUpL)).toBe(0);
    const lab = start('dog', [-0.3, 0.6]);
    expect(top(lab, FS.earL)).toBeCloseTo(0.6, 5);
    expect(Math.min(...lab.map(r => r.weights[FS.earL] ?? 0))).toBeGreaterThanOrEqual(-0.3 - 1e-6);
  });

  it('a question tilts a dog’s head and pricks a cat’s ears, never its brows', () => {
    const ask = (species: AnimalSpecies) => {
      const a = animal(species, 14);
      const talk = { ...still, voice: 0.4 };
      awake(a, talk);
      return steps(a, 90, { ...talk, sentence: { text: 'Tu veux que je continue ?', at: 99 } });
    };
    const dog = ask('dog');
    expect(Math.max(...dog.map(r => Math.abs(r.weights[FS.headTilt] ?? 0)))).toBeGreaterThan(0.3);
    const cat = ask('cat');
    expect(Math.min(...cat.map(r => r.weights[FS.earL] ?? 0))).toBeLessThan(-0.4);
    expect(top(cat, FS.browUpL)).toBe(0);
  });

  it('a cat blinks less often than a person; a bear moves slower than a cat', () => {
    const blinks = (a: ReturnType<typeof createFaceAnimator>) => {
      let n = 0, shut = false;
      for (let f = 0; f < 60 * 300; f++) { const s = a.step(DT, { ...still, active: f % 300 === 0, gestures: false }).blink > 0.5; if (s && !shut) n++; shut = s; }
      return n;
    };
    expect(blinks(animal('cat', 15))).toBeLessThan(blinks(createFaceAnimator(seeded(15))) * 0.75);
    const yawnLength = (species: AnimalSpecies) => {
      const a = animal(species, 16);
      awake(a, { ...still, gestures: false });
      a.express('yawn');
      return steps(a, 60 * 6, { ...still, gestures: false }).filter(r => (r.weights[FS.jawOpen] ?? 0) > 0.3).length;
    };
    expect(yawnLength('bear')).toBeGreaterThan(yawnLength('cat') * 1.2);
  });

  it('the person back after a wait: a dog’s excitement (the mouth open, panting), a person’s brows', () => {
    const back = (species: AnimalSpecies | null, seed = 17) => {
      const a = species ? animal(species, seed) : createFaceAnimator(seeded(seed), { lifeRandom: seeded(517) });
      // Back just after it started waiting: nothing of its wait is playing yet.
      for (let f = 0; f < 60 * (WAIT_AFTER_S + 0.5); f++) a.step(DT, { ...still, gestures: true });
      return steps(a, 60 * 2, f => ({ ...still, lookGoal: { x: 0.3 + f * 0.01, y: 0 } }));
    };
    for (const seed of [17, 18, 19]) {
      const dog = back('dog', seed);
      // Its mouth open and panting the whole second after its ears went up.
      expect(Math.min(...dog.slice(48, 108).map(r => r.weights[FS.jawOpen] ?? 0)), `seed ${seed}`).toBeGreaterThan(0.25);
      expect(top(dog, FS.browUpL)).toBe(0);
    }
    const person = back(null);
    expect(top(person, FS.browUpL)).toBeGreaterThan(0.4);
  });

  it('waking, an animal does not round its lips', () => {
    for (const species of ALL) {
      const a = animal(species, 18);
      a.wake(0);
      expect(top(steps(a, 60 * WAKE_S), FS.lipsRound), species).toBe(0);
    }
  });
});
