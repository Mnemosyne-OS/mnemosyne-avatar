/**
 * hairModel — hair that moves with the head, not on its own (doc 180 §5).
 *
 * At rest the hair barely breathes. When the head moves (it turns towards the
 * pointer, swings to a region, tilts in a gesture), two things happen, as with
 * real hair:
 *  - the wind's sway grows with how fast the head moves, then settles back;
 *  - the hair LAGS: a spring pulled by the head's change of speed throws it
 *    the other way, and it swings back into place (follow-through).
 *
 * Pure: the scene hands it the head's angles every frame.
 *
 * @module avatar/hairModel
 */

/** The sway at rest, as a share of the full sway: a breath, not a wind. */
export const HAIR_REST = 0.12;
/** The head's angular speed (radians per second) that gives the full sway. */
const FULL_SPEED = 0.6;
/** Seconds for the sway to rise with a movement, and to settle after it. */
const RISE_S = 0.08, SETTLE_S = 0.9;
/** The spring the hair hangs on: its stiffness, its damping, and how hard a change of speed pulls it. */
const STIFF = 40, DAMP = 7, PULL = 0.4;

/** The head's pose: turn (y), nod (x) and tilt, in radians. */
export interface HeadPose { yaw: number; pitch: number; tilt: number }

export interface HairState {
  /** The wind's sway, as a share of the figure's full sway (HAIR_REST at rest, up to 1). */
  amp: number;
  /** The lag, in figure units, at a hair tip: x then y. */
  swing: [number, number];
}

export interface HairFollow {
  /** Advance by dt seconds to the head's new pose; returns the same object every frame. */
  step(dt: number, head: HeadPose): HairState;
}

export function createHairFollow(): HairFollow {
  const state: HairState = { amp: HAIR_REST, swing: [0, 0] };
  let last: HeadPose | null = null;
  let vYaw = 0, vPitch = 0, vTilt = 0, energy = 0;
  let sx = 0, sy = 0, sxv = 0, syv = 0;
  return {
    step(dt, head) {
      if (!last || dt <= 0) { last = { ...head }; return state; }
      const nYaw = (head.yaw - last.yaw) / dt, nPitch = (head.pitch - last.pitch) / dt, nTilt = (head.tilt - last.tilt) / dt;
      last = { ...head };
      // A change of speed pulls the hair the other way: the turn moves the front to +x, the hair lags to -x.
      sxv += (-(nYaw - vYaw) + (nTilt - vTilt)) * PULL;
      syv += (nPitch - vPitch) * PULL;
      vYaw = nYaw; vPitch = nPitch; vTilt = nTilt;
      // The spring brings it back, damped; small steps keep it stable on a slow frame.
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        sxv += (-STIFF * sx - DAMP * sxv) * h; sx += sxv * h;
        syv += (-STIFF * sy - DAMP * syv) * h; sy += syv * h;
      }
      const speed = Math.hypot(nYaw, nPitch, nTilt);
      energy += (speed - energy) * (1 - Math.exp(-dt / (speed > energy ? RISE_S : SETTLE_S)));
      state.amp = HAIR_REST + (1 - HAIR_REST) * Math.min(1, energy / FULL_SPEED);
      state.swing[0] = Math.max(-0.15, Math.min(0.15, sx));
      state.swing[1] = Math.max(-0.15, Math.min(0.15, sy));
      return state;
    },
  };
}
