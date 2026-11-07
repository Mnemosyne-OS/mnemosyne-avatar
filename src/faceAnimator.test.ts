/**
 * faceAnimator.test.ts — her face lives on its own (doc 180): blinks, gestures
 * one at a time, a mouth owned by her voice, eyes on the pointer, and nothing
 * at all under reduced motion except speech.
 */
import { describe, it, expect } from 'vitest';
import { createFaceAnimator, envelope, EXPRESSIONS, HEAD_FOLLOW, HEAD_PITCH, HEAD_YAW, SEQUENCES, SLEEP_AFTER_S, THINK_BROW_FLICK, THINK_BROW_LIFT, thinkBrow, WAIT_AFTER_S, WAKE_S, wakeAt, type FaceInput, type MoveId } from './faceAnimator';
import { FACE_SHAPES, FS } from './faceShapes';

/** A small seeded generator, so a run is the same every time. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const still: FaceInput = { voice: 0, spectrum: null, lookGoal: { x: 0, y: 0 }, motion: true };
const DT = 1 / 60;

/** Runs `seconds` of life and reports what was seen. */
function live(seconds: number, input: FaceInput = still, seed = 3) {
  const a = createFaceAnimator(seeded(seed));
  let blinks = 0, wasShut = false, maxAbs = 0;
  const moved = new Set<string>();
  for (let f = 0; f < seconds * 60; f++) {
    const fr = a.step(DT, input);
    const shut = fr.blink > 0.5;
    if (shut && !wasShut) blinks++;
    wasShut = shut;
    fr.weights.forEach((w, i) => { maxAbs = Math.max(maxAbs, Math.abs(w)); if (Math.abs(w) > 0.2) moved.add(FACE_SHAPES[i]!); });
    if (fr.squint[0] > 0.2 || fr.squint[1] > 0.2) moved.add('squint');
  }
  return { blinks, moved, maxAbs };
}

describe('faceAnimator', () => {
  it('blinks every several seconds, never on a beat', () => {
    const { blinks } = live(120);
    expect(blinks).toBeGreaterThan(5);
    expect(blinks).toBeLessThan(20);
  });

  it('plays her repertoire on her own, many different gestures over a few minutes, every weight within -1..1', () => {
    const { moved, maxAbs } = live(240);
    expect(moved.size).toBeGreaterThanOrEqual(6);
    expect(maxAbs).toBeLessThanOrEqual(1);
  });

  it('her voice owns the mouth: shut in silence, open while she speaks, shut again after', () => {
    const a = createFaceAnimator(seeded(1));
    for (let f = 0; f < 30; f++) a.step(DT, still);
    expect(a.step(DT, still).weights[FS.jawOpen]).toBeLessThan(0.01);
    let open = 0;
    for (let f = 0; f < 20; f++) open = a.step(DT, { ...still, voice: 0.8 }).weights[FS.jawOpen]!;
    expect(open).toBeGreaterThan(0.7);
    let shut = 1;
    for (let f = 0; f < 40; f++) shut = a.step(DT, still).weights[FS.jawOpen]!;
    expect(shut).toBeLessThan(0.05);
  });

  it('under reduced motion: no blink, no gesture, no saccade; the mouth still follows her voice', () => {
    const quiet = live(60, { ...still, motion: false });
    expect(quiet.blinks).toBe(0);
    expect([...quiet.moved]).toEqual([]);
    const a = createFaceAnimator(seeded(2));
    let fr = a.step(DT, { ...still, motion: false });
    for (let f = 0; f < 30; f++) fr = a.step(DT, { ...still, voice: 0.8, motion: false });
    expect(fr.weights[FS.jawOpen]).toBeGreaterThan(0.7);
    expect(fr.look).toEqual({ x: 0, y: 0 });
  });

  it('the eyes lead towards the pointer, the head follows only part of the way, smoothly, and the eyes do the rest', () => {
    const a = createFaceAnimator(seeded(4));
    a.step(DT, still);
    const goal = { ...still, lookGoal: { x: 1, y: 0 } };
    let early = 0, earlyHead = 0, prevYaw = 0, maxJump = 0;
    for (let f = 0; f < 15; f++) { const fr = a.step(DT, goal); early = fr.look.x; earlyHead = fr.head.yaw; }
    // A quarter of a second in: the eyes are well on their way, the head has barely started.
    expect(early).toBeGreaterThan(0.3);
    expect(earlyHead).toBeLessThan(HEAD_YAW * 0.5);
    let fr = a.step(DT, goal);
    prevYaw = fr.head.yaw;
    for (let f = 0; f < 120; f++) {
      fr = a.step(DT, goal);
      maxJump = Math.max(maxJump, Math.abs(fr.head.yaw - prevYaw));
      prevYaw = fr.head.yaw;
    }
    expect(fr.head.yaw).toBeGreaterThan(HEAD_YAW * HEAD_FOLLOW * 0.95);
    expect(fr.head.yaw).toBeLessThanOrEqual(HEAD_YAW * HEAD_FOLLOW * 1.01);
    // Fluid: never more than a few hundredths of a radian from one frame to the next.
    expect(maxJump).toBeLessThan(0.03);
    // The head took only its share: the eyes still carry most of the look.
    expect(fr.look.x).toBeGreaterThan(0.6);
  });

  it('a glance turns the head no further than the pointer can', () => {
    const a = createFaceAnimator(seeded(5));
    let maxYaw = 0;
    a.express('glance');
    for (let f = 0; f < 300; f++) maxYaw = Math.max(maxYaw, Math.abs(a.step(DT, { ...still, lookGoal: { x: 1, y: 0 } }).head.yaw));
    expect(maxYaw).toBeLessThanOrEqual(HEAD_YAW * HEAD_FOLLOW * 1.01);
  });

  it('a pointer resting between her eyes crosses them a little, then she smiles at it, once per visit', () => {
    const a = createFaceAnimator(seeded(6));
    const between = { ...still, gestures: false, between: true };
    let fr = a.step(DT, still);
    for (let f = 0; f < 6; f++) fr = a.step(DT, between);
    // Not at once: a pointer passing through crosses nothing.
    expect(fr.cross).toBeLessThan(0.05);
    for (let f = 0; f < 40; f++) fr = a.step(DT, between);
    expect(fr.cross).toBeGreaterThan(0.3);
    // Gestures off: no smile.
    expect(fr.weights[FS.smileL]).toBe(0);
    const b = createFaceAnimator(seeded(6));
    let smiled = 0;
    for (let f = 0; f < 60 * 4; f++) { const r = b.step(DT, { ...still, between: true }); smiled = Math.max(smiled, r.weights[FS.smileL] ?? 0); }
    expect(smiled).toBeGreaterThan(0.4);
    // The pointer leaves: the eyes uncross.
    for (let f = 0; f < 60; f++) fr = b.step(DT, still);
    expect(fr.cross).toBeLessThan(0.02);
  });

  it('wakes: eyes shut, the lids flutter while the points tremble (the head barely), the eyes open, then a long « ooh »', () => {
    const a = createFaceAnimator(seeded(7));
    a.wake(1);
    const seen: Array<{ t: number; blink: number; yaw: number; round: number; tremble: number }> = [];
    for (let f = 0; f < 60 * (1 + WAKE_S + 0.5); f++) {
      const r = a.step(DT, still);
      seen.push({ t: f * DT, blink: r.blink, yaw: r.head.yaw, round: r.weights[FS.lipsRound] ?? 0, tremble: r.tremble });
    }
    const at = (t: number) => seen[Math.round(t * 60)]!;
    // Shut while her points gather, and at the start of the waking.
    expect(at(0.5).blink).toBe(1);
    expect(at(1.5).blink).toBe(1);
    // The flutter: the lids part and close again more than once, and the head shivers.
    const flutter = seen.filter(s => s.t > 1.75 && s.t < 2.7);
    expect(Math.min(...flutter.map(s => s.blink))).toBeLessThan(0.75);
    expect(Math.max(...flutter.map(s => s.blink))).toBeGreaterThan(0.85);
    expect(Math.max(...flutter.map(s => s.tremble))).toBeGreaterThan(0.9);
    // The head itself only sways a hair: a shaking head read as a seizure.
    expect(Math.max(...seen.map(s => Math.abs(s.yaw)))).toBeLessThan(0.01);
    // Open after it, then the « ooh ».
    expect(at(3.2).blink).toBeLessThan(0.05);
    expect(Math.max(...seen.map(s => s.round))).toBeGreaterThan(0.5);
    // Awake: the face is back at rest.
    expect(at(1 + WAKE_S + 0.3).round).toBeLessThan(0.05);
    expect(at(1 + WAKE_S + 0.3).tremble).toBe(0);
    expect(wakeAt(WAKE_S)).toBeNull();
  });

  it('speaks with a marked mouth: a middling voice opens the jaw further than its own measure', () => {
    const a = createFaceAnimator(seeded(8));
    let fr = a.step(DT, still);
    for (let f = 0; f < 30; f++) fr = a.step(DT, { ...still, voice: 0.3 });
    // 0.3 measures as an opening of about 0.5; the face opens it a third more.
    expect(fr.weights[FS.jawOpen]).toBeGreaterThan(0.6);
    expect(fr.weights[FS.jawOpen]).toBeLessThanOrEqual(1);
  });

  it('a pointer still for a while: her gaze wanders all over and her head goes with it, then « there you are »', () => {
    const a = createFaceAnimator(seeded(9));
    const looks: number[] = [], heads: number[] = [];
    for (let f = 0; f < 60 * (WAIT_AFTER_S + 15); f++) {
      const r = a.step(DT, still);
      if (f > 60 * (WAIT_AFTER_S + 1)) { looks.push(r.look.x); heads.push(r.head.yaw); }
      // Before the wait, the eyes stay near the pointer (saccades and gestures aside).
    }
    expect(Math.max(...looks) - Math.min(...looks)).toBeGreaterThan(0.8);
    expect(Math.max(...heads.map(Math.abs))).toBeGreaterThan(0.05);
    // The pointer moves again: the brows lift.
    let brows = 0;
    for (let f = 0; f < 60; f++) brows = Math.max(brows, a.step(DT, { ...still, lookGoal: { x: 0.1 + f * 0.001, y: 0 } }).weights[FS.browUpL] ?? 0);
    expect(brows).toBeGreaterThan(0.4);
  });

  it('no wandering before the wait, nor with her gaze or her gestures off', () => {
    const spread = (input: FaceInput, from: number, to: number) => {
      const a = createFaceAnimator(seeded(9));
      const xs: number[] = [];
      for (let f = 0; f < 60 * to; f++) { const r = a.step(DT, input); if (f > 60 * from) xs.push(r.look.x); }
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread({ ...still, gestures: false }, 5, WAIT_AFTER_S - 1)).toBeLessThan(0.3);
    expect(spread({ ...still, gaze: false, gestures: false }, WAIT_AFTER_S + 1, WAIT_AFTER_S + 15)).toBeLessThan(0.3);
    expect(spread({ ...still, gestures: false }, WAIT_AFTER_S + 1, WAIT_AFTER_S + 15)).toBeLessThan(0.3);
  });

  it('smiles at the pointer between her eyes once per visit, not again while it stays', () => {
    // Every draw at its top: her own gestures never smile, so each smile seen is the pointer's.
    const c = createFaceAnimator(() => 0.999);
    let only = 0, was = false;
    for (let f = 0; f < 60 * 12; f++) {
      const on = (c.step(DT, { ...still, between: true }).weights[FS.smileL] ?? 0) > 0.3;
      if (on && !was) only++;
      was = on;
    }
    expect(only).toBe(1);
    // …and it ends: twelve seconds in, the pointer still there, the smile is gone.
    expect(c.step(DT, { ...still, between: true }).weights[FS.smileL] ?? 0).toBeLessThan(0.05);
  });

  it('while she wakes: no gesture of her own and no blink, only the waking itself', () => {
    const a = createFaceAnimator(seeded(12));
    a.wake(0);
    for (let f = 0; f < 60 * WAKE_S; f++) {
      const r = a.step(DT, still);
      const t = f * DT;
      for (const id of ['browUpL', 'browUpR', 'smileL', 'smileR', 'headTilt', 'lipPress', 'mouthFrown', 'browFrown'] as const) expect(r.weights[FS[id]]).toBe(0);
      // Open after 2.1 s: no blink until the end.
      if (t > 2.15) expect(r.blink).toBe(0);
    }
  });

  it('her gaze off, she never starts waiting, even with her gestures on', () => {
    // Waiting shows in its quicker cadence of moves (and in the wandering gaze): count the moves after the threshold.
    const movesAfterWait = (gaze: boolean) => {
      let n = 0, f = 0;
      const a = createFaceAnimator(seeded(9), { onMove: () => { if (f > 60 * WAIT_AFTER_S) n++; } });
      for (f = 0; f < 60 * (WAIT_AFTER_S + 120); f++) a.step(DT, { ...still, gaze });
      return n;
    };
    const on = movesAfterWait(true), off = movesAfterWait(false);
    expect(off).toBeLessThan(on * 0.7);
  });

  it('a waking stops the wait: her gaze comes back to the middle while she wakes', () => {
    const a = createFaceAnimator(seeded(9));
    for (let f = 0; f < 60 * (WAIT_AFTER_S + 6); f++) a.step(DT, still);
    a.wake(0);
    const late: number[] = [];
    for (let f = 0; f < 60 * WAKE_S; f++) { const r = a.step(DT, still); if (f > 60 * 1.5) late.push(Math.abs(r.look.x)); }
    expect(Math.max(...late)).toBeLessThan(0.2);
  });

  it('while she speaks, none of her gestures moves her mouth: the voice owns it', () => {
    const a = createFaceAnimator(seeded(13));
    for (let f = 0; f < 60 * 90; f++) {
      const r = a.step(DT, { ...still, voice: 0.6 });
      expect(r.weights[FS.lipPress]).toBe(0);
      expect(r.weights[FS.mouthFrown]).toBe(0);
    }
  });

  it('an animal’s ears flick on their own now and then; a face without ears never moves them', () => {
    const count = (ears: boolean) => {
      const a = createFaceAnimator(seeded(14), { ears });
      let flicks = 0, was = false, maxAbs = 0;
      for (let f = 0; f < 60 * 60; f++) {
        const r = a.step(DT, { ...still, lookGoal: { x: Math.sin(f / 200) * 0.3, y: 0 } });
        const v = Math.max(Math.abs(r.weights[FS.earL] ?? 0), Math.abs(r.weights[FS.earR] ?? 0));
        maxAbs = Math.max(maxAbs, v);
        if (v > 0.3 && !was) flicks++;
        was = v > 0.3;
      }
      return { flicks, maxAbs };
    };
    const kitten = count(true);
    expect(kitten.flicks).toBeGreaterThan(4);
    expect(kitten.flicks).toBeLessThan(40);
    expect(kitten.maxAbs).toBeLessThanOrEqual(1);
    expect(count(false).maxAbs).toBe(0);
  });

  it('an animal pricks its ears up as its eyes open on waking', () => {
    const a = createFaceAnimator(seeded(15), { ears: true });
    a.wake(0);
    let perk = 0;
    for (let f = 0; f < 60 * WAKE_S; f++) perk = Math.min(perk, a.step(DT, still).weights[FS.earL] ?? 0);
    expect(perk).toBeLessThan(-0.4);
  });

  it('while she speaks she faces the person, not the pointer; a breath after, the pointer leads again', () => {
    const a = createFaceAnimator(seeded(16));
    const edge = { ...still, lookGoal: { x: 1, y: 0.6 } };
    let fr = a.step(DT, edge);
    for (let f = 0; f < 120; f++) fr = a.step(DT, edge);
    expect(fr.look.x).toBeGreaterThan(0.5);
    expect(fr.talking).toBe(false);
    // She speaks, the pointer still at the edge: eyes and head come back to the middle. (Her own
    // gestures off: a pensive look up and aside while she speaks is hers, not the pointer's.)
    for (let f = 0; f < 150; f++) fr = a.step(DT, { ...edge, voice: 0.5, gestures: false });
    expect(fr.talking).toBe(true);
    expect(Math.abs(fr.look.x)).toBeLessThan(0.2);
    expect(Math.abs(fr.head.yaw)).toBeLessThan(0.02);
    // A pause between words keeps her facing the person.
    for (let f = 0; f < 40; f++) fr = a.step(DT, edge);
    expect(fr.talking).toBe(true);
    // Silent a while: she follows the pointer again.
    for (let f = 0; f < 150; f++) fr = a.step(DT, edge);
    expect(fr.talking).toBe(false);
    expect(fr.look.x).toBeGreaterThan(0.5);
  });

  it('every sequence names real movements, within full strength, and each phase starts before the last one ends', () => {
    for (const [id, make] of Object.entries(SEQUENCES)) {
      const phases = make(seeded(1));
      expect(phases.length, id).toBeGreaterThanOrEqual(2);
      phases.forEach((p, i) => {
        for (const [k, v] of Object.entries(p.g.weights)) { expect(FACE_SHAPES, `${id}.${k}`).toContain(k); expect(Math.abs(v as number)).toBeLessThanOrEqual(1); }
        const prev = phases[i - 1];
        // Flowing, not following: the next phase begins while the one before is still there.
        if (prev) expect(p.at, `${id} phase ${i}`).toBeLessThan(prev.at + prev.g.rise + prev.g.hold + prev.g.fall);
      });
    }
  });

  it('pondering tilts the head, lowers it past the pointer’s reach and drops the gaze, then comes back up', () => {
    const a = createFaceAnimator(seeded(17));
    a.step(DT, { ...still, gestures: false });
    a.express('ponder');
    let minPitch = 0, minLook = 0, tilt = 0, lastPitch = 0;
    for (let f = 0; f < 60 * 7; f++) {
      const r = a.step(DT, { ...still, gestures: false });
      minPitch = Math.min(minPitch, r.head.pitch); minLook = Math.min(minLook, r.look.y);
      tilt = Math.max(tilt, Math.abs(r.weights[FS.headTilt] ?? 0)); lastPitch = r.head.pitch;
    }
    expect(minPitch).toBeLessThan(-HEAD_PITCH * HEAD_FOLLOW * 1.5);
    expect(minLook).toBeLessThan(-0.4);
    expect(tilt).toBeGreaterThan(0.4);
    expect(Math.abs(lastPitch)).toBeLessThan(0.02);
  });

  it('never plays the same move twice in a row, and plays many over a few minutes', () => {
    const played: MoveId[] = [];
    const a = createFaceAnimator(seeded(18), { onMove: id => played.push(id) });
    for (let f = 0; f < 60 * 300; f++) a.step(DT, { ...still, lookGoal: { x: Math.sin(f / 300) * 0.3, y: 0 } });
    expect(played.length).toBeGreaterThan(15);
    for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
    expect(new Set(played).size).toBeGreaterThan(8);
    expect(played.some(id => id in SEQUENCES)).toBe(true);
  });

  it('swaying, the head tilts shoulder to shoulder like a pendulum, lightly, for a few seconds, and never turns', () => {
    const a = createFaceAnimator(seeded(19));
    a.step(DT, { ...still, gestures: false });
    a.express('sway');
    const tilts: number[] = [];
    let maxYaw = 0;
    for (let f = 0; f < 60 * 7; f++) {
      const r = a.step(DT, { ...still, gestures: false });
      tilts.push(r.weights[FS.headTilt] ?? 0);
      maxYaw = Math.max(maxYaw, Math.abs(r.head.yaw));
    }
    // Both ways, more than once, and lightly.
    expect(Math.max(...tilts)).toBeGreaterThan(0.3);
    expect(Math.min(...tilts)).toBeLessThan(-0.3);
    expect(Math.max(...tilts.map(Math.abs))).toBeLessThanOrEqual(0.7);
    let crossings = 0;
    for (let i = 1; i < tilts.length; i++) if (Math.sign(tilts[i]!) !== Math.sign(tilts[i - 1]!) && Math.abs(tilts[i]!) > 0.01) crossings++;
    expect(crossings).toBeGreaterThanOrEqual(3);
    // Never a turn: a head turning side to side reads as « no ».
    expect(maxYaw).toBeLessThan(0.005);
  });

  it('she never blinks mid-wink: both eyes shut at once read as two winks', () => {
    let both = 0, winks = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const a = createFaceAnimator(seeded(seed));
      for (let f = 0; f < 60 * 2; f++) a.step(DT, { ...still, gestures: false });
      // A wink every second for half a minute: her own blinks (every few seconds) fall on some of them.
      for (let round = 0; round < 30; round++) {
        // A blink already running when the wink is asked would finish on its own; ask it with the lids open.
        // A blink is 0 on its first frame, so the lids must stay open for several frames in a row.
        let fr = a.step(DT, { ...still, gestures: false });
        for (let open = 0; open < 10;) { fr = a.step(DT, { ...still, gestures: false }); open = fr.blink > 0.01 ? 0 : open + 1; }
        a.express('wink');
        for (let f = 0; f < 60; f++) {
          fr = a.step(DT, { ...still, voice: f % 20 < 14 ? 0.5 : 0.05, gestures: false });
          const wink = Math.max(fr.wink[0], fr.wink[1]);
          if (wink > 0.5) { winks++; if (fr.blink > 0.5) both++; }
        }
      }
    }
    expect(winks).toBeGreaterThan(0);
    expect(both).toBe(0);
  });

  it('a pointer coming slowly to her cheek is a caress: her eyes close, her head leans into it; leaving, she opens them', () => {
    const a = createFaceAnimator(seeded(20));
    const cheek = { ...still, lookGoal: { x: 0.3, y: -0.1 }, near: { dist: 0.9, speed: 0.2, approach: 0.1, dx: 0.8, dy: 0.3 } };
    let fr = a.step(DT, still);
    for (let f = 0; f < 20; f++) fr = a.step(DT, cheek);
    // Not at once: a pointer passing by is not a caress.
    expect(fr.blink).toBeLessThan(0.3);
    for (let f = 0; f < 120; f++) fr = a.step(DT, cheek);
    expect(fr.blink).toBeGreaterThan(0.75);
    // The pointer on the viewer's right: the head leans to the right (a negative tilt).
    expect(fr.weights[FS.headTilt]).toBeLessThan(-0.3);
    expect(fr.weights[FS.smileL]).toBeGreaterThan(0.2);
    // Two seconds into it she opens her eyes again, on a wider smile, the head still leaning.
    for (let f = 0; f < 120; f++) fr = a.step(DT, cheek);
    expect(fr.blink).toBeLessThan(0.15);
    expect(fr.weights[FS.smileL]).toBeGreaterThan(0.5);
    expect(fr.weights[FS.headTilt]).toBeLessThan(-0.3);
    for (let f = 0; f < 90; f++) fr = a.step(DT, still);
    expect(fr.blink).toBeLessThan(0.1);
    // Moving fast near her face is no caress.
    const b = createFaceAnimator(seeded(20));
    let fb = b.step(DT, still);
    for (let f = 0; f < 140; f++) fb = b.step(DT, { ...cheek, near: { ...cheek.near, speed: 3 } });
    expect(fb.blink).toBeLessThan(0.75);
  });

  it('a pointer rushing at her face: she dodges, her head alone away and back; her eyes stay on it', () => {
    const a = createFaceAnimator(seeded(21));
    a.step(DT, still);
    // The pointer comes fast from the viewer's right.
    const rush = { ...still, lookGoal: { x: 0.4, y: 0 }, near: { dist: 1.2, speed: 6, approach: 5, dx: 0.9, dy: 0 } };
    let minYaw = 0, look = 0;
    for (let f = 0; f < 60; f++) {
      const r = a.step(DT, f < 3 ? rush : { ...rush, near: { ...rush.near, approach: 0, speed: 0.1 } });
      minYaw = Math.min(minYaw, r.head.yaw); look = r.look.x;
    }
    // Away from it: to the viewer's left.
    expect(minYaw).toBeLessThan(-0.05);
    // Her eyes stay on the pointer, on the right.
    expect(look).toBeGreaterThan(0.2);
    // Then she settles back.
    let r = a.step(DT, still);
    for (let f = 0; f < 120; f++) r = a.step(DT, still);
    expect(Math.abs(r.head.yaw)).toBeLessThan(0.02);
  });

  it('under reduced motion she is simply awake', () => {
    const a = createFaceAnimator(seeded(7));
    a.wake(0);
    expect(a.step(DT, { ...still, motion: false }).blink).toBe(0);
  });

  it('under reduced motion the head stays facing', () => {
    const a = createFaceAnimator(seeded(4));
    let fr = a.step(DT, still);
    for (let f = 0; f < 120; f++) fr = a.step(DT, { ...still, motion: false, lookGoal: { x: 1, y: 1 } });
    expect(fr.head).toEqual({ yaw: 0, pitch: 0 });
  });

  it('an expression played on purpose shows at once: surprise lifts both brows', () => {
    const a = createFaceAnimator(seeded(5));
    a.express('surprise');
    let fr = a.step(DT, still);
    for (let f = 0; f < 20; f++) fr = a.step(DT, still);
    expect(fr.weights[FS.browUpL]).toBeGreaterThan(0.8);
    expect(fr.weights[FS.browUpR]).toBeGreaterThan(0.8);
  });

  it('a smile narrows the eyes a little and lifts the cheeks, as a real one does', () => {
    const a = createFaceAnimator(() => 0.99);
    a.express('smile');
    let fr = a.step(DT, still);
    for (let f = 0; f < 60; f++) fr = a.step(DT, still);
    expect(fr.squint[0]).toBeGreaterThan(0.2);
    expect(fr.weights[FS.cheekRaise]).toBeGreaterThan(0.05);
  });

  it('every recipe names only real movements, and never asks for more than full strength', () => {
    const r = seeded(9);
    for (const make of Object.values(EXPRESSIONS)) {
      const g = make(r);
      for (const [id, v] of Object.entries(g.weights)) {
        expect(FACE_SHAPES).toContain(id);
        expect(Math.abs(v as number)).toBeLessThanOrEqual(1);
      }
      expect(g.rise + g.hold + g.fall).toBeGreaterThan(0);
    }
  });

  it('an envelope rises, holds, then falls back to rest', () => {
    expect(envelope(-1, 0.25, 0.5, 0.5)).toBe(0);
    expect(envelope(0.125, 0.25, 0.5, 0.5)).toBeCloseTo(0.5);
    expect(envelope(0.5, 0.25, 0.5, 0.5)).toBe(1);
    expect(envelope(1, 0.25, 0.5, 0.5)).toBeCloseTo(0.5);
    expect(envelope(1.3, 0.25, 0.5, 0.5)).toBe(0);
  });

  it('each new sentence she says shows its tone on her brows: a question lifts them, an apology saddens them', () => {
    const run = (text: string | null, shape: number) => {
      const a = createFaceAnimator(seeded(11));
      const talk = { ...still, voice: 0.4 };
      for (let f = 0; f < 60 * (WAKE_S + 2); f++) a.step(DT, talk);
      let peak = 0;
      const sentence = text ? { text, at: 1234 } : null;
      for (let f = 0; f < 90; f++) peak = Math.max(peak, a.step(DT, { ...talk, sentence }).weights[shape] ?? 0);
      return peak;
    };
    expect(run('Tu veux que je continue ?', FS.browUpL)).toBeGreaterThan(run(null, FS.browUpL) + 0.3);
    expect(run('Désolée, le fichier est introuvable.', FS.browInnerUp)).toBeGreaterThan(run(null, FS.browInnerUp) + 0.3);
  });

  it('while she speaks she now and then looks up and aside, thinking; not with her gestures off', () => {
    const lookUps = (gestures: boolean) => {
      const a = createFaceAnimator(seeded(31));
      for (let f = 0; f < 60 * (WAKE_S + 1); f++) a.step(DT, still);
      let ups = 0, up = false, liftedHead = 0;
      for (let f = 0; f < 60 * 30; f++) {
        // A voice that never stops for long: syllables and short pauses.
        const r = a.step(DT, { ...still, voice: f % 20 < 14 ? 0.5 : 0.05, gestures });
        if (r.look.y > 0.35 && !up) { ups++; liftedHead = Math.max(liftedHead, r.head.pitch); }
        up = r.look.y > 0.35;
      }
      return { ups, liftedHead };
    };
    const on = lookUps(true);
    expect(on.ups).toBeGreaterThanOrEqual(3);
    expect(on.liftedHead).toBeGreaterThan(0);
    expect(lookUps(false).ups).toBe(0);
  });

  it('nothing from the person for five minutes: she falls asleep, eyes shut, head down; a move wakes her', () => {
    const a = createFaceAnimator(seeded(32));
    let r = a.step(DT, still);
    for (let f = 0; f < 60 * (SLEEP_AFTER_S - 5); f++) r = a.step(DT, still);
    expect(r.sleep).toBeLessThan(0.01);
    for (let f = 0; f < 60 * 45; f++) r = a.step(DT, still);
    expect(r.sleep).toBeGreaterThan(0.9);
    expect(r.blink).toBeGreaterThan(0.9);
    expect(r.head.pitch).toBeLessThan(-0.4 * HEAD_PITCH);
    // The person is back: she wakes with her waking, the eyes still shut a moment while the
    // sleep itself lets go, the points shivering, then open.
    const back = { ...still, lookGoal: { x: 0.4, y: 0 } };
    let shiver = 0;
    for (let f = 0; f < 20; f++) { r = a.step(DT, back); shiver = Math.max(shiver, r.tremble); }
    expect(r.blink).toBeGreaterThan(0.8);
    for (let f = 0; f < 40; f++) { r = a.step(DT, back); shiver = Math.max(shiver, r.tremble); }
    expect(r.sleep).toBeLessThan(0.2);
    for (let f = 0; f < 60 * (WAKE_S + 2); f++) { r = a.step(DT, back); shiver = Math.max(shiver, r.tremble); }
    expect(shiver).toBeGreaterThan(0.1);
    expect(r.blink).toBeLessThan(0.5);
  });

  it('a key now and then, or her own voice, keeps her awake; with her gestures off she never sleeps', () => {
    const run = (input: (f: number) => FaceInput) => {
      const a = createFaceAnimator(seeded(33));
      let r = a.step(DT, still);
      for (let f = 0; f < 60 * (SLEEP_AFTER_S + 60); f++) r = a.step(DT, input(f));
      return r.sleep;
    };
    expect(run(f => ({ ...still, active: f % (60 * 120) === 0 }))).toBeLessThan(0.01);
    expect(run(f => ({ ...still, voice: f % (60 * 120) < 30 ? 0.6 : 0 }))).toBeLessThan(0.01);
    expect(run(() => ({ ...still, gestures: false }))).toBe(0);
  });

  it('an answer being written: she thinks, her eyes away from the person, lips pressed; the answer come, her brows lift', () => {
    const a = createFaceAnimator(seeded(40));
    for (let f = 0; f < 60 * (WAKE_S + 1); f++) a.step(DT, still);
    let away = 0, across = 0, press = 1, n = 0;
    for (let f = 0; f < 60 * 5; f++) {
      const r = a.step(DT, { ...still, thinking: true });
      if (f < 60 * 2) continue;
      away += Math.hypot(r.look.x, r.look.y); across += r.look.x; n++;
      press = Math.min(press, r.weights[FS.lipPress] ?? 0);
    }
    // Up, down or aside (Andrist et al. 2013), always to one side, never on the person.
    expect(away / n).toBeGreaterThan(0.3);
    expect(Math.abs(across / n)).toBeGreaterThan(0.1);
    expect(press).toBeGreaterThan(0.18);
    let lift = 0;
    for (let f = 0; f < 40; f++) { const r = a.step(DT, still); lift = Math.max(lift, Math.min(r.weights[FS.browUpL] ?? 0, r.weights[FS.browUpR] ?? 0)); }
    expect(lift).toBeGreaterThan(0.25);
  });

  it('the thought come shows once, after a real thought: not after a blip, not again at the next pause of a long answer', () => {
    // The « aha »: both brows up AND a smile at once (a brow raise of her own has no smile).
    const lifts = () => {
      let n = 0, up = false;
      return (r: { weights: Float32Array }) => {
        const w = r.weights, l = Math.min(w[FS.browUpL] ?? 0, w[FS.browUpR] ?? 0) > 0.25 && Math.min(w[FS.smileL] ?? 0, w[FS.smileR] ?? 0) > 0.15;
        if (l && !up) n++;
        up = l;
        return n;
      };
    };
    const quiet = { ...still, gestures: false };
    const a = createFaceAnimator(seeded(40));
    for (let f = 0; f < 60 * (WAKE_S + 1); f++) a.step(DT, still);
    // A blip: half a second of « thinking » brings nothing.
    const blip = lifts();
    let n = 0;
    for (let f = 0; f < 30; f++) n = blip(a.step(DT, { ...still, thinking: true }));
    for (let f = 0; f < 60; f++) n = blip(a.step(DT, still));
    expect(n).toBe(0);
    // A real thought: one « aha ».
    const count = lifts();
    for (let f = 0; f < 60 * 3; f++) a.step(DT, { ...still, thinking: true });
    for (let f = 0; f < 60; f++) n = count(a.step(DT, still));
    expect(n).toBe(1);
    // Thinking again two seconds (the stream still open between two sentences), then done: no second one.
    for (let f = 0; f < 120; f++) n = count(a.step(DT, { ...still, thinking: true }));
    // The frame it ends with her gestures on (the « aha » could start there), then nothing new of hers.
    n = count(a.step(DT, still));
    for (let f = 0; f < 60; f++) n = count(a.step(DT, quiet));
    expect(n).toBe(1);
  });

  it('a long thought checks in: now and then her eyes come back to the person', () => {
    const a = createFaceAnimator(seeded(43), { lifeRandom: seeded(44) });
    for (let f = 0; f < 60 * (WAKE_S + 1); f++) a.step(DT, still);
    let near = 0;
    for (let f = 0; f < 60 * 30; f++) { const r = a.step(DT, { ...still, thinking: true }); if (f > 60 * 4 && Math.hypot(r.look.x, r.look.y) < 0.2) near++; }
    expect(near).toBeGreaterThan(60 * 2);
  });

  it('she does not think over her own voice, nor with her gestures off', () => {
    const run = (input: FaceInput) => {
      const a = createFaceAnimator(seeded(40));
      for (let f = 0; f < 60 * (WAKE_S + 1); f++) a.step(DT, still);
      let press = 0;
      for (let f = 0; f < 60 * 3; f++) press = Math.max(press, a.step(DT, { ...input, thinking: true }).weights[FS.lipPress] ?? 0);
      return press;
    };
    expect(run({ ...still, gestures: false })).toBe(0);
    // Speaking: the voice owns the mouth, no pressed lips over it.
    expect(run({ ...still, voice: 0.5 })).toBeLessThan(0.05);
  });

  // Searching her memory before she speaks (§44): the voice orb's wait.
  const recall = (seed: number, kind: true | 'recall' = 'recall') => {
    const a = createFaceAnimator(seeded(seed), { lifeRandom: seeded(seed + 1) });
    for (let f = 0; f < 60 * (WAKE_S + 1); f++) a.step(DT, still);
    const raw: Array<{ t: number; x: number; y: number; L: number; R: number; thinking: boolean }> = [];
    const take = (n: number, thinking: boolean) => {
      for (let f = 0; f < n; f++) {
        const r = a.step(DT, { ...still, ...(thinking ? { thinking: kind } : {}) });
        raw.push({ t: raw.length * DT, x: r.look.x, y: r.look.y, L: r.weights[FS.browUpL] ?? 0, R: r.weights[FS.browUpR] ?? 0, thinking });
      }
    };
    take(60 * 3, true);
    take(60 * 3, false);
    // The side her eyes went (the viewer's right: her left brow, browUpL), once they are there.
    const right = raw.filter(f => f.t > 1 && f.thinking).reduce((s, f) => s + f.x, 0) > 0;
    return raw.map(f => ({ ...f, brow: right ? f.L : f.R, other: right ? f.R : f.L }));
  };

  it('waiting to say an answer, her eyes go up and to one side, every time', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const held = recall(seed).filter(f => f.t > 1 && f.t < 3);
      const y = held.reduce((s, f) => s + f.y, 0) / held.length, x = held.reduce((s, f) => s + f.x, 0) / held.length;
      expect(y).toBeGreaterThan(0.3);
      expect(Math.abs(x)).toBeGreaterThan(0.12);
    }
  });

  it('the brow of a thought: a flicker first, back down, then it lifts and stays', () => {
    expect(thinkBrow(0)).toBe(0);
    const flick = Math.max(...Array.from({ length: 45 }, (_, i) => thinkBrow(0.25 + i / 100)));
    expect(flick).toBeCloseTo(THINK_BROW_FLICK, 2);
    expect(thinkBrow(0.78)).toBeLessThan(0.01);
    expect(thinkBrow(1.4)).toBeCloseTo(THINK_BROW_LIFT, 5);
    expect(thinkBrow(9)).toBeCloseTo(THINK_BROW_LIFT, 5);
  });

  it('on her face, the brow on the side of her eyes lifts and stays up while she thinks; the other one does not', () => {
    for (const seed of [1, 2, 3, 4]) {
      const fr = recall(seed);
      const at = (s: number) => fr[Math.round(s / DT)]!;
      // Nothing lifted at the very start: it moves before it lifts.
      expect(Math.max(...fr.filter(f => f.t < 0.2).map(f => f.brow))).toBeLessThan(0.1);
      for (const s of [1.6, 2.2, 2.9]) expect(at(s).brow).toBeGreaterThan(0.33);
      const held = fr.filter(f => f.t > 1.4 && f.thinking);
      expect(held.reduce((s, f) => s + f.other, 0) / held.length).toBeLessThan(0.12);
    }
  });

  it('a written answer keeps the brow of §28: barely up, no lift', () => {
    for (const seed of [1, 2, 3, 4]) {
      const fr = recall(seed, true).filter(f => f.thinking && f.t > 1.4);
      expect(Math.max(...fr.map(f => Math.max(f.L, f.R)))).toBeLessThan(0.3);
    }
  });

  it('the answer spoken, the lift eases out: no drop at once, gone a moment later', () => {
    for (const seed of [1, 2, 3, 4]) {
      const after = recall(seed).filter(f => !f.thinking);
      for (let i = 1; i < after.length; i++) expect(after[i - 1]!.brow - after[i]!.brow).toBeLessThan(0.04);
      expect(after[after.length - 1]!.brow).toBeLessThan(0.03);
    }
  });
});
