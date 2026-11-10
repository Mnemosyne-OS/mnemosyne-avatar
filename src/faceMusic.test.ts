/**
 * faceMusic.test.ts — she listens to the music (doc 180 §39): the nod on the
 * beat she hears and never on one she does not, the look at the window that
 * plays, the eyes closed, the wink only when she looks ahead; and in the
 * animator, nothing of it while her voice or a thought holds her.
 */
import { describe, it, expect } from 'vitest';
import { createMusicLife, museFrame, CARRIED_REST_S, CLOSED_LID, MOOD_S, MUSE_TURN, ROUSE_S, WINK_REST_S, type MusicHeard, type MusicLifeOut } from './faceMusic';
import { createFaceAnimator, type FaceInput } from './faceAnimator';
import { FS } from './faceShapes';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const DT = 1 / 60;
const WINDOW = { x: -0.8, y: 0.6 };

/** `seconds` of music at `bpm` (null: no tempo heard); every frame's output, copied. */
function listen(seconds: number, bpm: number | null, opts: { at?: MusicHeard['at']; free?: boolean; seed?: number } = {}) {
  const life = createMusicLife(seeded(opts.seed ?? 1));
  const frames: Array<MusicLifeOut & { t: number; mood: string; musing: string; side: number; onset: boolean }> = [];
  const period = bpm ? 60 / bpm : 0;
  let next = 0;
  for (let f = 0; f < seconds / DT; f++) {
    const t = f * DT;
    const onset = bpm !== null && t >= next;
    if (onset) next += period;
    const o = life.step(DT, { music: { onset, energy: 0.4, bpm, at: opts.at === undefined ? WINDOW : opts.at }, free: opts.free ?? true });
    frames.push({ ...o, look: o.look ? { ...o.look } : null, mouth: { ...o.mouth }, brows: { ...o.brows }, face: { ...o.face }, t, mood: life.mood(), musing: life.musing(), side: life.breatheSide(), onset });
  }
  return frames;
}

describe('createMusicLife', () => {
  it('nods on the beats she hears while she grooves, down and back', () => {
    const frames = listen(120, 100, { seed: 4 });
    const groove = frames.filter(f => f.mood === 'groove' && f.listening > 0.9);
    expect(groove.length).toBeGreaterThan(60);
    expect(Math.min(...groove.map(f => f.pitch))).toBeLessThan(-0.2);
    // Between beats the head comes back up.
    expect(groove.some(f => Math.abs(f.pitch) < 0.02)).toBe(true);
  });

  it('with no tempo heard she never nods, and still sways', () => {
    const frames = listen(120, null);
    // A nod is the head going down: never, without a tempo (carried, it goes back, not down).
    expect(Math.min(...frames.map(f => f.pitch))).toBeGreaterThanOrEqual(-1e-9);
    expect(frames.some(f => f.mood === 'groove')).toBe(false);
  });

  it('beats heard that agree on no tempo: still no nod on them', () => {
    const life = createMusicLife(seeded(4));
    const rnd = seeded(11);
    let minPitch = 0;
    for (let f = 0; f < 120 / DT; f++) {
      const o = life.step(DT, { music: { onset: rnd() < 0.04, energy: 0.5, bpm: null, at: WINDOW }, free: true });
      minPitch = Math.min(minPitch, o.pitch);
    }
    // -0 is a head that did not move either.
    expect(Math.abs(minPitch)).toBe(0);
  });

  it('looks at the window that plays now and then, never with her eyes closed', () => {
    const frames = listen(180, 110, { seed: 7 });
    const at = frames.filter(f => f.look !== null && f.mood !== 'muse');
    expect(at.length).toBeGreaterThan(0);
    expect(at.every(f => f.look!.x === WINDOW.x && f.look!.y === WINDOW.y)).toBe(true);
    expect(frames.filter(f => f.mood === 'muse').every(f => f.look === null || f.look.x !== WINDOW.x)).toBe(true);
    expect(at.every(f => f.mood !== 'eyesClosed' && f.mood !== 'carried')).toBe(true);
    // Only now and then: most of the time her eyes are elsewhere.
    expect(at.length / frames.length).toBeLessThan(0.4);
  });

  it('no window known: no look at it', () => {
    expect(listen(120, 110, { at: null }).filter(f => f.mood !== 'muse').every(f => f.look === null)).toBe(true);
  });

  it('closes her eyes in some moods, and opens them after', () => {
    const frames = listen(240, 110, { seed: 2 });
    expect(frames.some(f => f.mood === 'eyesClosed' && f.lid > 0.8)).toBe(true);
    expect(frames.filter(f => f.mood === 'groove').some(f => f.lid < 0.05)).toBe(true);
  });

  it('winks or smiles only looking ahead with her eyes open', () => {
    let plays = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const f of listen(240, 110, { seed })) {
        if (!f.play) continue;
        plays++;
        expect(f.look).toBeNull();
        expect(f.mood).not.toBe('eyesClosed');
        expect(f.lid).toBeLessThan(0.2);
      }
    }
    expect(plays).toBeGreaterThan(5);
  });

  it('never a laugh while listening: only a wink or a closed smile', () => {
    const played = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) for (const f of listen(300, 110, { seed })) if (f.play) played.add(f.play);
    expect([...played].sort()).toEqual(['smile', 'wink']);
  });

  it('a wink is rare: never two within WINK_REST_S, and fewer winks than smiles', () => {
    let winks = 0, smiles = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let last = -Infinity;
      for (const f of listen(900, 110, { seed })) {
        if (f.play === 'smile') smiles++;
        if (f.play !== 'wink') continue;
        winks++;
        expect(f.t - last).toBeGreaterThanOrEqual(WINK_REST_S);
        last = f.t;
      }
    }
    expect(winks).toBeGreaterThan(0);
    expect(winks * 3).toBeLessThan(smiles);
    // Eight seeds of 900 s of music: 3.5 to 4.6 s on GitHub's runners, 5.3 s once, past the 5 s default.
  }, 20_000);

  it('never two moods the same in a row', () => {
    const moods = listen(600, 110, { seed: 9 }).map(f => f.mood).filter((m, i, a) => i === 0 || m !== a[i - 1]);
    expect(moods.length).toBeGreaterThan(20);
    for (let i = 1; i < moods.length; i++) expect(moods[i]).not.toBe(moods[i - 1]);
  });

  it('held by something else (not free), she does nothing of it', () => {
    const frames = listen(60, 110, { free: false });
    expect(frames.every(f => f.listening < 0.01 && f.pitch === 0 && f.look === null && f.play === null)).toBe(true);
  });
});

describe('the groove and being carried (§40)', () => {
  it('each nod leans to the other side: forward and back, alternating, never a plain left-right', () => {
    const frames = listen(120, 100, { seed: 4 });
    // The lean at each nod's deepest point.
    const leans: number[] = [];
    for (let i = 1; i < frames.length - 1; i++) {
      const f = frames[i]!;
      if (f.mood !== 'groove' || f.pitch > -0.15) continue;
      if (f.pitch <= frames[i - 1]!.pitch && f.pitch <= frames[i + 1]!.pitch) leans.push(Math.sign(f.tilt));
    }
    expect(leans.length).toBeGreaterThan(20);
    let flips = 0;
    for (let i = 1; i < leans.length; i++) if (leans[i] !== leans[i - 1]) flips++;
    expect(flips / (leans.length - 1)).toBeGreaterThan(0.8);
    // Between nods the head does not lean on its own.
    // (the first 2 s of a groove still ease out of the mood before it).
    const since = frames.map((f, i) => { let j = i; while (j > 0 && frames[j - 1]!.mood === f.mood) j--; return f.t - frames[j]!.t; });
    expect(frames.filter((f, i) => f.mood === 'groove' && since[i]! > 2 && Math.abs(f.pitch) < 0.01).every(f => Math.abs(f.tilt) < 0.05)).toBe(true);
  });

  it('the music building carries her: eyes closed, the head back, eights, for a long while', () => {
    const life = createMusicLife(seeded(6));
    const seen: Array<{ mood: string; pitch: number; yaw: number; lid: number; t: number }> = [];
    let next = 0;
    for (let f = 0; f < 60 / DT; f++) {
      const t = f * DT;
      const onset = t >= next;
      if (onset) next += 0.5;
      // Quiet for 20 s, then a build.
      const energy = t < 20 ? 0.15 : Math.min(0.6, 0.15 + (t - 20) * 0.08);
      const o = life.step(DT, { music: { onset, energy, bpm: 120, at: WINDOW }, free: true });
      seen.push({ mood: life.mood(), pitch: o.pitch, yaw: o.yaw, lid: o.lid, t });
    }
    const carried = seen.filter(f => f.mood === 'carried' && f.t > 20);
    expect(carried.length).toBeGreaterThan(0);
    // It came with the build, within a few seconds of it.
    expect(carried[0]!.t).toBeLessThan(26);
    expect(carried.length * DT).toBeGreaterThanOrEqual(MOOD_S.carried[0] - 0.1);
    const deep = carried.filter(f => f.t > carried[0]!.t + 4);
    // Low, not shut all the time: she glimpses (§42).
    expect(deep.every(f => f.lid > 0.4 && f.pitch > 0)).toBe(true);
    expect(Math.min(...deep.map(f => f.yaw))).toBeLessThan(-0.15);
    expect(Math.max(...deep.map(f => f.yaw))).toBeGreaterThan(0.15);
  });

  it('the music starting is not a build: an intro fading in leaves the first mood alone', () => {
    // Every mood lasts 3 s at least: a change before that can only be a build.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const life = createMusicLife(seeded(seed));
      const moods = new Set<string>();
      for (let f = 0; f < 2.9 / DT; f++) {
        // An intro fading in: its loudness climbs, as a build's does.
        life.step(DT, { music: { onset: false, energy: Math.min(0.6, 0.05 + f * DT * 0.2), bpm: null, at: null }, free: true });
        moods.add(life.mood());
      }
      expect(moods.size).toBe(1);
    }
  });

  it('a build carries her at most once in CARRIED_REST_S', () => {
    const life = createMusicLife(seeded(6));
    const starts: number[] = [];
    let was = false, next = 0;
    for (let f = 0; f < 120 / DT; f++) {
      const t = f * DT;
      const onset = t >= next;
      if (onset) next += 0.5;
      // A build every 10 s.
      const energy = 0.15 + 0.45 * ((t % 10) / 10);
      life.step(DT, { music: { onset, energy, bpm: 120, at: null }, free: true });
      const now = life.mood() === 'carried';
      if (now && !was) starts.push(t);
      was = now;
    }
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(CARRIED_REST_S - 1e-6);
  });

  it('roused, she comes out of the music for a few seconds, then goes back to it', () => {
    const life = createMusicLife(seeded(2));
    const step = () => life.step(DT, { music: { onset: false, energy: 0.4, bpm: null, at: null }, free: true });
    for (let f = 0; f < 5 / DT; f++) step();
    expect(life.rouse()).toBe(true);
    let low = 1;
    for (let f = 0; f < 3 / DT; f++) low = step().listening;
    expect(low).toBeLessThan(0.1);
    let back = 0;
    for (let f = 0; f < (ROUSE_S[1] + 3) / DT; f++) back = step().listening;
    expect(back).toBeGreaterThan(0.9);
  });

  it('not listening, a window arriving changes nothing', () => {
    const life = createMusicLife(seeded(2));
    life.step(DT, { music: null, free: true });
    expect(life.rouse()).toBe(false);
  });
});

describe('singing along (§41)', () => {
  const runs = [1, 2, 3, 4, 5, 6].map(seed => listen(300, 110, { seed }));
  const singing = runs.flat().filter(f => f.mood === 'sing' && f.listening > 0.9);

  it('she sings along sometimes, her lips moving on the beat', () => {
    expect(singing.length).toBeGreaterThan(300);
    expect(Math.max(...singing.map(f => f.mouth.jaw))).toBeGreaterThan(0.1);
    // Each syllable opens on a beat: the jaw leaves closed on the beat's frame or the next (its envelope starts at 0).
    for (const frames of runs) {
      for (let i = 1; i < frames.length; i++) {
        const f = frames[i]!, prev = frames[i - 1]!;
        if (f.mood === 'sing' && prev.mouth.jaw === 0 && f.mouth.jaw > 0) expect(f.onset || prev.onset).toBe(true);
      }
    }
  });

  it('a breath taken between phrases, on her chest', () => {
    expect(singing.some(f => f.breath > 0.3)).toBe(true);
    expect(runs.flat().filter(f => f.mood !== 'sing' && f.mood !== 'breathe').every(f => f.breath === 0)).toBe(true);
  });

  it('her brows lift on a held note only', () => {
    expect(singing.some(f => f.brows.up > 0.15)).toBe(true);
    // A sung syllable is a stretch of open jaw; one with her brows up lasts longer than a beat.
    const beat = 60 / 110;
    for (const frames of runs) {
      let start = -1, raised = false;
      for (const f of frames) {
        if (f.mood === 'sing' && f.mouth.jaw > 0) {
          if (start < 0) { start = f.t; raised = false; }
          if (f.brows.up > 0.05) raised = true;
        } else if (start >= 0) {
          // A syllable cut short by the end of the singing says nothing of its length.
          if (raised && f.mood === 'sing') expect(f.t - start).toBeGreaterThan(beat);
          start = -1;
        }
      }
    }
    expect(runs.flat().filter(f => f.mood !== 'sing').every(f => f.brows.up < 0.01)).toBe(true);
  });

  it('singing, no smile, no wink, no look away: the mouth is busy, the song held', () => {
    for (const frames of runs) for (const f of frames) if (f.mood === 'sing') { expect(f.play).toBeNull(); expect(f.look).toBeNull(); }
  });

  it('no tempo heard: she never sings, her mouth stays still', () => {
    const frames = listen(300, null, { seed: 3 });
    expect(frames.some(f => f.mood === 'sing')).toBe(false);
    expect(frames.every(f => f.mouth.jaw === 0)).toBe(true);
  });
});

describe('eyes low, not shut (§42)', () => {
  it('in her eyes-low moods she mostly glimpses, and shuts them now and then', () => {
    const low = [1, 2, 3, 4, 5, 6].flatMap(seed => listen(300, 110, { seed })).filter(f => (f.mood === 'eyesClosed' || f.mood === 'carried') && f.listening > 0.95);
    expect(low.length).toBeGreaterThan(600);
    const glimpse = low.filter(f => f.lid < 0.8).length / low.length;
    expect(glimpse).toBeGreaterThan(0.5);
    expect(low.some(f => f.lid > CLOSED_LID - 0.05)).toBe(true);
  });
});

describe('musing (§42)', () => {
  const runs = [1, 2, 3, 4, 5, 6, 7, 8].map(seed => listen(400, 110, { seed }));
  const musing = runs.flat().filter(f => f.mood === 'muse');
  // Half a second into a musing: a nod begun just before it has ended.
  const settled = runs.flatMap(frames => frames.filter((f, i) => {
    if (f.mood !== 'muse') return false;
    let j = i;
    while (j > 0 && frames[j - 1]!.mood === 'muse') j--;
    return f.t - frames[j]!.t > 0.5;
  }));

  it('a thought comes to her now and then, each of the three ways', () => {
    expect(musing.length).toBeGreaterThan(300);
    expect(new Set(musing.map(f => f.musing))).toEqual(new Set(['perplexed', 'idea', 'doubt']));
  });

  it('musing, she neither nods, smiles, winks nor looks at the window', () => {
    for (const f of settled) {
      expect(f.play).toBeNull();
      if (f.look) expect(f.look.x).not.toBe(WINDOW.x);
      expect(f.pitch).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('perplexed: the lips pressed into a corner from the start, one brow only after the turn', () => {
    const early = museFrame('perplexed', 1, MUSE_TURN - 0.1, 1);
    const late = museFrame('perplexed', 1, MUSE_TURN + 0.2, 1);
    expect(early.weights.mouthSide).toBeGreaterThan(0.2);
    expect(early.weights.lipPress).toBeGreaterThan(0.2);
    expect(early.weights.browUpL ?? 0).toBe(0);
    expect(late.weights.browUpL).toBeGreaterThan(0.4);
    // One brow, the side of the corner: the other stays.
    expect(late.weights.browUpR ?? 0).toBe(0);
    expect(museFrame('perplexed', -1, MUSE_TURN + 0.2, 1).weights.browUpR).toBeGreaterThan(0.4);
  });

  it('an idea: pressed lips first, a closed smile after the turn, the mouth never open', () => {
    const early = museFrame('idea', 1, 0.2, 1), late = museFrame('idea', 1, 0.9, 1);
    expect(early.weights.smileL ?? 0).toBe(0);
    expect(late.weights.smileL).toBeGreaterThan(0.2);
    expect(late.weights.jawOpen ?? 0).toBe(0);
  });

  it('never two musings the same in a row', () => {
    for (const frames of runs) {
      // The musing drawn at each entry into the mood.
      const kinds = frames.filter((f, i) => f.mood === 'muse' && (i === 0 || frames[i - 1]!.mood !== 'muse')).map(f => f.musing);
      for (let i = 1; i < kinds.length; i++) expect(kinds[i]).not.toBe(kinds[i - 1]);
    }
  });
});

describe('a deep breath (§43)', () => {
  const runs = [1, 2, 3, 4, 5, 6, 7, 8].map(seed => listen(400, 110, { seed }));
  // Each deep breath, its frames from start to end.
  const breaths = runs.flatMap(frames => {
    const out: Array<typeof frames> = [];
    frames.forEach((f, i) => {
      if (f.mood !== 'breathe' || f.listening < 0.95) return;
      if (i === 0 || frames[i - 1]!.mood !== 'breathe') out.push([]);
      out[out.length - 1]!.push(f);
    });
    return out.filter(b => b.length > 6 / DT);
  });

  it('she takes a deep breath now and then, her head leaning to one side or the other', () => {
    expect(breaths.length).toBeGreaterThan(3);
    const sides = new Set(breaths.map(b => b[0]!.side));
    expect(sides).toEqual(new Set([1, -1]));
    for (const b of breaths) {
      const mid = b[Math.floor(b.length / 2)]!;
      // The lean to her side (nothing else leans her head then: no nod, no sway).
      expect(Math.sign(mid.tilt)).toBe(mid.side);
      expect(Math.abs(mid.tilt)).toBeGreaterThan(0.35);
    }
  });

  it('her eyes close to 85 %, never shut', () => {
    for (const b of breaths) {
      const mid = b[Math.floor(b.length / 2)]!;
      expect(mid.lid).toBeGreaterThan(0.8);
      // Once settled (it may come from eyes shut lower, at 0.88).
      expect(Math.max(...b.slice(Math.round(2 / DT)).map(f => f.lid))).toBeLessThan(0.86);
    }
  });

  it('a deep breath in, held, then out slowly, her head lifting a hair with it', () => {
    for (const b of breaths) {
      const peak = b.reduce((x, f) => (f.breath > x.breath ? f : x));
      expect(peak.breath).toBeGreaterThan(0.85);
      expect(peak.pitch).toBeGreaterThan(0.08);
      // Out slower than in: the breath peaks in the first half of it.
      expect(peak.t - b[0]!.t).toBeLessThan((b[b.length - 1]!.t - b[0]!.t) / 2);
    }
  });

  it('meanwhile no nod, no smile, no look at the window', () => {
    for (const b of breaths) for (const f of b.slice(Math.round(0.5 / DT))) {
      expect(f.play).toBeNull();
      expect(f.look).toBeNull();
      expect(f.pitch).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});

describe('the face listening to music', () => {
  const quiet: FaceInput = { voice: 0, spectrum: null, lookGoal: { x: 0, y: 0 }, motion: true };
  const music = (t: number): MusicHeard => ({ onset: Math.abs((t % 0.5)) < DT / 2, energy: 0.5, bpm: 120, at: WINDOW });

  it('her head moves with the music where it would be still', () => {
    const run = (withMusic: boolean) => {
      const a = createFaceAnimator(seeded(3));
      let moved = 0, last = 0;
      for (let f = 0; f < 60 / DT; f++) {
        const t = f * DT;
        const fr = a.step(DT, { ...quiet, gestures: true, ...(withMusic ? { music: music(t) } : {}) });
        if (t > 5) moved += Math.abs(fr.head.pitch - last);
        last = fr.head.pitch;
      }
      return moved;
    };
    expect(run(true)).toBeGreaterThan(run(false) * 1.5);
  });

  it('nothing of it while she speaks: her face is the same as without the music', () => {
    const run = (withMusic: boolean) => {
      const a = createFaceAnimator(seeded(3));
      const out: string[] = [];
      for (let f = 0; f < 60 / DT; f++) {
        const fr = a.step(DT, { ...quiet, voice: 0.6, ...(withMusic ? { music: music(f * DT) } : {}) });
        out.push(`${fr.look.x.toFixed(4)} ${fr.head.pitch.toFixed(4)} ${(fr.weights[FS.headTilt] ?? 0).toFixed(4)} ${fr.blink.toFixed(3)} ${(fr.weights[FS.jawOpen] ?? 0).toFixed(4)} ${(fr.weights[FS.browInnerUp] ?? 0).toFixed(4)}`);
      }
      return out;
    };
    expect(run(true)).toEqual(run(false));
  });

  it('with her gestures off, the music changes nothing', () => {
    const run = (withMusic: boolean) => {
      const a = createFaceAnimator(seeded(8));
      const out: number[] = [];
      for (let f = 0; f < 30 / DT; f++) out.push(a.step(DT, { ...quiet, gestures: false, ...(withMusic ? { music: music(f * DT) } : {}) }).weights[FS.headTilt] ?? 0);
      return out;
    };
    expect(run(true)).toEqual(run(false));
  });

  it('in the music the pointer does not pull her gaze', () => {
    const run = (withMusic: boolean) => {
      const a = createFaceAnimator(seeded(5));
      let far = 0;
      for (let f = 0; f < 40 / DT; f++) {
        const t = f * DT;
        const fr = a.step(DT, { ...quiet, lookGoal: { x: 0.9, y: 0 }, ...(withMusic ? { music: { ...music(t), at: null } } : {}) });
        if (t > 5 && fr.look.x > 0.5) far++;
      }
      return far;
    };
    expect(run(false)).toBeGreaterThan(100);
    expect(run(true)).toBe(0);
  });

  it('a window arriving while she listens: her brows lift', () => {
    const run = (roused: boolean) => {
      const a = createFaceAnimator(seeded(5));
      let brow = 0;
      for (let f = 0; f < 12 / DT; f++) {
        const t = f * DT;
        const fr = a.step(DT, { ...quiet, music: music(t), roused: roused && f === Math.round(8 / DT) });
        if (t > 8 && t < 9.5) brow = Math.max(brow, fr.weights[FS.browUpL] ?? 0);
      }
      return brow;
    };
    expect(run(true)).toBeGreaterThan(run(false) + 0.2);
  });

  it('singing along moves her mouth while her voice is silent', () => {
    const a = createFaceAnimator(seeded(4));
    let jaw = 0;
    for (let f = 0; f < 300 / DT; f++) jaw = Math.max(jaw, a.step(DT, { ...quiet, music: music(f * DT) }).weights[FS.jawOpen] ?? 0);
    expect(jaw).toBeGreaterThan(0.08);
  });

  it('does not fall asleep while the music plays', () => {
    const a = createFaceAnimator(seeded(5));
    let sleep = 0;
    for (let f = 0; f < 340 / DT; f++) sleep = a.step(DT, { ...quiet, music: music(f * DT) }).sleep;
    expect(sleep).toBeLessThan(0.05);
  });
});
