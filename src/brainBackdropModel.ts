/**
 * brainBackdropModel — what the brain backdrop shows, and how heavy it is.
 *
 * Three decisions live here, pure so the tests can read them:
 *  - the TOUR: the brain turns to face one engine region after another (the
 *    site's REGION_VIEWS), lights that region while the camera holds on it,
 *    and lets it go as it turns to the next;
 *  - the TIER: full (36 000 points + bloom, the site's desktop) or lite
 *    (14 000 points, no bloom, the site's phone), chosen from the GPU's own
 *    name and stepped down when the frame rate MEASURED on this machine is low;
 *  - the STATUS a backdrop reports, so a quality control can say what is
 *    actually running instead of what was asked for (the app turns it into
 *    its settings line).
 *
 * @module avatar/brainBackdropModel
 */
import { ENGINE_COUNT, REGION_VIEWS } from './brainCloud';

/** What the settings ask for: auto (the GPU and the measure decide), or a tier imposed. */
export type BrainQuality = 'auto' | 'full' | 'lite';
/** What actually runs. `lite` is shown as « réduite » / « reduced ». */
export type BrainTier = 'full' | 'lite';

/** Why a tier was picked. Shown, so a lite brain is never a mystery. */
export type TierReason = 'chosen' | 'discrete' | 'integrated' | 'software' | 'unknown' | 'measured';

/**
 * The weight of each tier. The point counts and the bloom are the site's
 * (desktop and phone); the pixel-ratio caps are this backdrop's own (the site
 * keeps 1.75 on a phone), lower for lite because it is the integrated-GPU tier.
 */
export const TIER_SPECS: Record<BrainTier, { points: number; dust: number; bloom: boolean; maxPixelRatio: number }> = {
  full: { points: 36000, dust: 1600, bloom: true, maxPixelRatio: 1.75 },
  lite: { points: 14000, dust: 700, bloom: false, maxPixelRatio: 1.25 },
};

/**
 * What the GPU's name says about it, or `null` when the name says nothing.
 *
 * The strings are ANGLE's (« ANGLE (Intel, Intel(R) UHD Graphics 620
 * Direct3D11 …) »). An unknown name is NOT a weak GPU: it starts full and the
 * measured frame rate decides.
 */
export function classifyGpu(name: string | null): Exclude<TierReason, 'chosen' | 'unknown' | 'measured'> | null {
  if (!name) return null;
  if (/swiftshader|llvmpipe|basic render|software/i.test(name)) return 'software';
  // Intel's dedicated cards carry a model letter (Arc A770, Arc B580) or « Pro »;
  // the integrated Arc of a Core Ultra is plain « Arc(TM) Graphics ».
  if (/nvidia|geforce|quadro|radeon\s*(\(tm\)\s*)?(rx|pro)\b|arc\s*(\(tm\)\s*)?([ab]\d|pro\b)/i.test(name)) return 'discrete';
  if (/apple\s*m\d/i.test(name)) return 'discrete';
  if (/intel|radeon/i.test(name)) return 'integrated';
  return null;
}

/**
 * The tier a new brain starts with, and why. An explicit choice is obeyed;
 * auto goes reduced on integrated and software rendering, full otherwise.
 */
export function resolveTier(quality: BrainQuality, gpu: string | null): { tier: BrainTier; reason: TierReason } {
  if (quality !== 'auto') return { tier: quality, reason: 'chosen' };
  const kind = classifyGpu(gpu);
  if (kind === 'software' || kind === 'integrated') return { tier: 'lite', reason: kind };
  return { tier: 'full', reason: kind ?? 'unknown' };
}

/** Below this, measured over {@link FPS_WINDOW_S}, a window counts as slow. */
export const STEP_DOWN_FPS = 45;
/** Seconds the brain takes to form; nothing is measured before it is done. */
export const FORM_SECONDS = 2.4;
/** Seconds of frames in one measured window. */
export const FPS_WINDOW_S = 4;
/**
 * Slow windows in a row before auto steps down. One is not enough: a single
 * 1.3 s freeze (a PDF rendering, a heavy window mounting) brings one window of
 * 60 fps down to 41, and the brain would go reduced for a GPU that is fine.
 */
export const STEP_DOWN_WINDOWS = 2;

/**
 * Only auto steps down, only from full, only on rates that were measured, and
 * only when the last {@link STEP_DOWN_WINDOWS} windows were ALL slow.
 * `windows` holds the measured rates, most recent last.
 */
export function shouldStepDown(quality: BrainQuality, tier: BrainTier, windows: readonly number[]): boolean {
  if (quality !== 'auto' || tier !== 'full' || windows.length < STEP_DOWN_WINDOWS) return false;
  return windows.slice(-STEP_DOWN_WINDOWS).every(fps => fps < STEP_DOWN_FPS);
}

/** Cubic ease out: fast, then settling. The formation's curve and the comets'. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** The points gather from their scatter into the brain, eased. */
export function formation(lifeSeconds: number): number {
  return easeOutCubic(Math.min(1, Math.max(0, lifeSeconds / FORM_SECONDS)));
}

export interface TourView {
  ry: number;
  rx: number;
  cam: number;
  /** Light of each engine region, 0..1. */
  act: number[];
}

/** Seconds per region: the camera holds, then turns to the next. */
export const TOUR_STEP_S = 10;
const HOLD = 0.65;
/** Share of a stop over which its region lights up (a cue lands past it, lit). */
export const TOUR_LIGHT_RAMP = 0.12;
const RAMP = TOUR_LIGHT_RAMP;
const TAU = Math.PI * 2;

/** a to b by t. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => t * t * (3 - 2 * t);

/** The rotation of region k on the k-th stop, unwrapped so the turn never goes back. */
function stop(k: number): { ry: number; rx: number; cam: number } {
  // The index is taken modulo the table, so the fallbacks never run: they only
  // answer the compiler's « possibly undefined » without a non-null assertion.
  const v = REGION_VIEWS[((k % ENGINE_COUNT) + ENGINE_COUNT) % ENGINE_COUNT] ?? REGION_VIEWS[0] ?? { ry: 0, rx: 0, cam: 5.3 };
  return { ry: v.ry - TAU * Math.floor(k / ENGINE_COUNT), rx: v.rx, cam: v.cam };
}

/**
 * Where the brain looks at `t` seconds of tour, and which region is lit.
 *
 * The region the camera holds on lights up as the camera arrives and goes out
 * as it leaves, so the light is continuous across stops (no region switches on
 * at full strength).
 */
export function tourView(t: number): TourView {
  const seg = Math.max(0, t) / TOUR_STEP_S;
  const k = Math.floor(seg);
  const u = seg - k;
  const e = u < HOLD ? 0 : ease((u - HOLD) / (1 - HOLD));
  const a = stop(k), b = stop(k + 1);
  const act = new Array<number>(ENGINE_COUNT).fill(0);
  act[k % ENGINE_COUNT] = Math.min(1, u / RAMP) * (1 - e);
  return { ry: lerp(a.ry, b.ry, e), rx: lerp(a.rx, b.rx, e), cam: lerp(a.cam, b.cam, e), act };
}

/**
 * With reduced motion: one still picture, framed on the first region. No
 * region is lit on its own; the caller lights them all the same with
 * {@link STILL_ALL}.
 */
export function stillView(): TourView {
  const v = stop(0);
  return { ...v, act: new Array<number>(ENGINE_COUNT).fill(0) };
}

/**
 * How the points meet the ground. `night`: added as light on a dark ground,
 * with the bloom (the site's look). `day`: laid as ink on a light ground —
 * light added to a light ground washes out, and a bloom there is only haze.
 */
export type GroundMode = 'night' | 'day';

/** Relative luminance (of LINEAR rgb) from which a ground counts as light. */
export const DAY_GROUND_LUMINANCE = 0.18;

/**
 * Read from the ground colour itself, never from a theme's name: a theme
 * added later, or a ground set by hand, gets the right blending without
 * anyone remembering this rule.
 */
export function groundMode(r: number, g: number, b: number): GroundMode {
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance >= DAY_GROUND_LUMINANCE ? 'day' : 'night';
}

/**
 * The points' gain and size per look. Without bloom the site lifts the points
 * so the brain does not read dimmer. As ink there is no bloom either, and a
 * dark dot on a light ground needs a little more weight to read: at 0.55
 * (tried first, headless, 2026-10-23) the brain was a pale grey fog.
 */
export function pointLook(mode: GroundMode, bloom: boolean): { gain: number; size: number } {
  if (mode === 'day') return { gain: 1.25, size: 0.017 };
  return bloom ? { gain: 1, size: 0.016 } : { gain: 1.7, size: 0.019 };
}

/** The faint light every region keeps while another one is lit. */
export const AMBIENT_ALL = 0.12;
/** The still picture lights every region the same, since none is visited. */
export const STILL_ALL = 0.55;

/**
 * What the backdrop is doing: not mounted (`off`), no WebGL or a lost context
 * (`no-webgl`), or a brain on screen with what it measured.
 */
export type BrainBackdropStatus =
  | { state: 'off' }
  | { state: 'no-webgl' }
  | {
      state: 'running';
      tier: BrainTier;
      reason: TierReason;
      gpu: string | null;
      /** Frames per second over the last window, or null before one was measured. */
      fps: number | null;
      still: boolean;
      paused: boolean;
    };
