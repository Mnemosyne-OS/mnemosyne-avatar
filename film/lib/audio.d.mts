/** Types of audio.mjs, for TypeScript consumers (the Mnemosyne OS app imports the pure half). */
export declare const TRIM_FILTER: string;
export declare function durationOf(file: string): number;
export declare function trimVoice(filmDir: string, lang: string, opts?: { log?: (s: string) => void }): string[];
/** The ffmpeg filter graph that lays each cue at its time, over an optional bed (input 0 when `music`). */
export declare function mixGraph(
  film: { total: number; music?: { cutAt?: number } },
  cueFiles: Array<{ at: number; offsetMs?: number; stack?: boolean }>,
  opts?: { music?: boolean; voiceVol?: number; musicVol?: number },
): string;
export declare function mixAudio(filmDir: string, film: unknown, opts?: { music?: string; log?: (s: string) => void }): string;
export declare function mux(filmDir: string, name: string, film: unknown): string;
export declare function share(filmDir: string, name: string): string;
