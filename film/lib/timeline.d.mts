/** Types of timeline.mjs, for TypeScript consumers (the Mnemosyne OS app imports the pure half). */
export interface ScriptLine { id: string; text: string; move?: string; pauseAfter?: number }
export interface FilmScript {
  shape?: string;
  width?: number;
  height?: number;
  fps?: number;
  seed?: number;
  colors?: Record<string, unknown>;
  lines: ScriptLine[];
  options?: Partial<typeof DEFAULTS>;
}
export interface FilmCue { id: string; at: number; ms: number; offsetMs: number }
export interface FilmLine { id: string; at: number; end: number; text: string; shape: string; sub: boolean }
export interface FilmMove { at: number; id: string; shape?: string }
export interface FilmShot { id?: string; shape: string; at: number; until?: number; fadeIn?: number; fadeOut?: number }
export interface Film {
  fps: number;
  total: number;
  seed: number;
  width: number;
  height: number;
  lang: string;
  arcs: boolean;
  trueColor: boolean;
  version: number;
  gestures: boolean;
  colors: Record<string, unknown>;
  shots: FilmShot[];
  lines: FilmLine[];
  cues: FilmCue[];
  moves: FilmMove[];
  music: { outroAt: number; cutAt: number; beatAt: number[] };
  [key: string]: unknown;
}
export declare const DEFAULTS: { brainOpen: number; form: number; breath: number; holdEnd: number; gapMove: number };
/** The film from a script and each line's duration (seconds). Throws on a line without a duration. */
export declare function buildFilm(script: FilmScript, lang: string, durations: Record<string, number>): Film;
export declare function writeTimeline(filmDir: string, lang: string, opts?: { log?: (s: string) => void }): Film;
