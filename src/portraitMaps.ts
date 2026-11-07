/**
 * portraitMaps — the free faces' density maps, each fetched only when it is
 * needed (doc 180 §27): ~240 KB of base64 each, twelve of them, ~2.8 MB that
 * were all parsed as soon as any face showed. The rest of a face (its eyes,
 * mouth, brows, the rig the animator moves) is small and stays in the figure
 * modules; only the map waits here.
 *
 * Load a face's map (loadPortraitMap) before a scene builds it: building one
 * whose map is not here throws, it never draws an empty face.
 *
 * @module avatar/portraitMaps
 */
import type { PortraitShape } from './portraitIds';

/** A density map and its colours, as a portrait module carries them. */
export interface PortraitMap { b64: string; rgb?: string; w: number; h: number }

type PortraitModule = { PORTRAIT_B64: string; PORTRAIT_RGB_B64?: string; PORTRAIT_W: number; PORTRAIT_H: number };
/** Each free face's map module: its own chunk, fetched on the first ask. */
const MODULES: Record<PortraitShape, () => Promise<PortraitModule>> = {
  woman: () => import('./womanPortrait'),
  man: () => import('./manPortrait'),
  claire: () => import('./clairePortrait'),
  amara: () => import('./amaraPortrait'),
  kofi: () => import('./kofiPortrait'),
  mei: () => import('./meiPortrait'),
  kenji: () => import('./kenjiPortrait'),
  kitten: () => import('./kittenPortrait'),
  shepherd: () => import('./shepherdPortrait'),
  labrador: () => import('./labradorPortrait'),
  bear: () => import('./bearPortrait'),
  leo: () => import('./leoPortrait'),
};

const loaded = new Map<PortraitShape, PortraitMap>();
const pending = new Map<PortraitShape, Promise<PortraitMap>>();

/** A face's map, fetched once; a failed fetch is forgotten, so the next ask tries again. */
export function loadPortraitMap(shape: PortraitShape): Promise<PortraitMap> {
  const have = loaded.get(shape);
  if (have) return Promise.resolve(have);
  let p = pending.get(shape);
  if (!p) {
    p = MODULES[shape]().then(m => {
      const map: PortraitMap = { b64: m.PORTRAIT_B64, w: m.PORTRAIT_W, h: m.PORTRAIT_H, ...(m.PORTRAIT_RGB_B64 ? { rgb: m.PORTRAIT_RGB_B64 } : {}) };
      loaded.set(shape, map);
      pending.delete(shape);
      return map;
    }, (err: unknown) => {
      pending.delete(shape);
      throw err;
    });
    pending.set(shape, p);
  }
  return p;
}

/** Whether a face's map is here already. */
export function isPortraitMapLoaded(shape: PortraitShape): boolean {
  return loaded.has(shape);
}

/** A face's map, which must have been loaded: building a face without it would draw nothing. */
export function portraitMap(shape: PortraitShape): PortraitMap {
  const map = loaded.get(shape);
  if (!map) throw new Error(`the ${shape} portrait's map was not loaded (loadPortraitMap) before its face was built`);
  return map;
}
