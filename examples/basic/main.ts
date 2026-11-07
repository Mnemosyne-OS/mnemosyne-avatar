/**
 * The smallest page that runs Mnemosyne Avatar: one face, the pointer for its
 * gaze, a click for an expression, and a button that moves the mouth with a
 * made-up voice. Built into example.js by `npm run example` (see the README).
 */
import {
  AMBIENT_ALL,
  FORM_SECONDS,
  SHAPE_VIEWS,
  WOMAN,
  createBrainScene,
  createFaceAnimator,
  createRng,
  easeOutCubic,
  loadPortraitMap,
  type MoveId,
} from '../../src/index';

const COLORS = {
  ground: '#0d0b16',
  base: '#8f8bb8',
  glow: '#d9d2ff',
  engines: ['#56b6a9', '#e5b567', '#e88a95', '#7bc96f', '#b58ff7'],
};
const CLICK_MOVES: MoveId[] = ['joy', 'surprise', 'wink', 'smile', 'curious', 'browRaise'];

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

async function start(): Promise<void> {
  const canvas = document.getElementById('avatar') as HTMLCanvasElement;
  const status = document.getElementById('status') as HTMLElement;

  // The gallery faces' density maps are fetched when a face is worn.
  await loadPortraitMap('woman');

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const scene = createBrainScene(canvas, {
    shape: 'woman',
    portrait: WOMAN,
    pickTier: () => 'full',
    colors: COLORS,
    motion: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio,
    trueColor: false,
    arcs: true,
  });
  if (!scene) {
    status.textContent = 'This browser has no WebGL: the avatar cannot be drawn.';
    return;
  }
  status.textContent = '';

  const rng = createRng(7);
  const face = createFaceAnimator(() => rng.rand());
  face.wake(FORM_SECONDS);
  const view = SHAPE_VIEWS.woman.front;

  // The pointer, -1..1 on each axis, y up: where she looks.
  const look = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    look.x = clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
    look.y = clamp(1 - (e.clientY / window.innerHeight) * 2, -1, 1);
  });

  // A click on her: one expression, drawn at random.
  let clicked = false;
  canvas.addEventListener('click', () => {
    clicked = true;
    face.express(CLICK_MOVES[Math.floor(Math.random() * CLICK_MOVES.length)]!);
  });

  // A made-up voice for three seconds: the loudness the mouth follows.
  let talkUntil = 0;
  document.getElementById('talk')?.addEventListener('click', () => {
    talkUntil = performance.now() / 1000 + 3;
  });

  window.addEventListener('resize', () => {
    scene.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
  });

  const t0 = performance.now() / 1000;
  let last = t0;
  const frame = (): void => {
    const now = performance.now() / 1000;
    const t = now - t0;
    const dt = clamp(now - last, 0, 0.05);
    last = now;
    const talking = now < talkUntil;
    const voice = talking ? 0.35 + 0.35 * Math.abs(Math.sin(now * 9)) * Math.abs(Math.sin(now * 2.3)) : 0;
    const faceFrame = face.step(dt, {
      voice,
      spectrum: null,
      lookGoal: look,
      motion: true,
      active: clicked || talking,
    });
    clicked = false;
    scene.render({
      ry: view.ry,
      rx: view.rx,
      cam: view.cam,
      act: [0, 0, 0, 0, 0],
      form: easeOutCubic(clamp(t / FORM_SECONDS, 0, 1)),
      all: AMBIENT_ALL,
      face: faceFrame,
    }, t);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start().catch((err: unknown) => {
  const status = document.getElementById('status');
  if (status) status.textContent = `The avatar could not start: ${err instanceof Error ? err.message : String(err)}`;
  console.error('[mnemosyne-avatar example]', err);
});
