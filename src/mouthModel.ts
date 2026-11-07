/**
 * mouthModel — how a face's mouth shapes a sound, as a human mouth does.
 *
 * Two numbers per frame, from what the voice's analyser already gives:
 *  - `open`: how far the jaw drops. The loudness is lifted (a power under 1),
 *    so a quiet syllable still opens the mouth: a mouth that only moves on the
 *    loud ones reads as a puppet.
 *  - `spread`: the lips' width, from where the voice's energy sits. Low, dark
 *    vowels (o, ou) round the lips (-1, narrower); bright ones (i, é) stretch
 *    them (+1, wider). The spectral centroid is the measure: the bin the energy
 *    balances on.
 *
 * Pure: the caller reads the analyser and hands the bytes over.
 *
 * @module avatar/mouthModel
 */

/** The analyser bins the centroid is measured over: speech, not the hum or the hiss. */
const BIN_LO = 2, BIN_HI = 60;
/** The centroid (in bins) of a neutral vowel, and how far either side reaches a full shape. */
const NEUTRAL_BIN = 12, SHAPE_SPAN = 6;
/** Under this loudness there is no vowel to shape. */
const SILENT = 0.04;

/** How far the jaw drops (0..1), and the lips' width for the vowel (-1 rounded .. 1 stretched). */
export interface MouthShape { open: number; spread: number }

/** The spectral centroid of `bins` over speech, in bins; NaN when they are silent. */
export function spectralCentroid(bins: Uint8Array): number {
  let sum = 0, weighted = 0;
  for (let i = BIN_LO; i < Math.min(BIN_HI, bins.length); i++) {
    const v = bins[i] ?? 0;
    sum += v; weighted += v * i;
  }
  return sum > 0 ? weighted / sum : NaN;
}

/** The mouth for a loudness (0..1) and, when one was read, the voice's spectrum. */
export function mouthShape(level: number, bins: Uint8Array | null): MouthShape {
  const l = Math.min(1, Math.max(0, level));
  if (l < SILENT) return { open: 0, spread: 0 };
  const open = Math.min(1, 1.15 * l ** 0.7);
  const c = bins ? spectralCentroid(bins) : NaN;
  const spread = Number.isFinite(c) ? Math.max(-1, Math.min(1, (c - NEUTRAL_BIN) / SHAPE_SPAN)) : 0;
  return { open, spread };
}
