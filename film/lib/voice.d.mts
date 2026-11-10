/** Types of voice.mjs, for TypeScript consumers (the Mnemosyne OS app imports the pure half). */
export declare const SR: number;
export declare const N: number;
export declare function cueWav(filmDir: string, lang: string, id: string): string | null;
export declare function fft(re: Float32Array, im: Float32Array): void;
/** Per-frame level (0..1) and 128-bin spectrum of a mono 48 kHz track. */
export declare function featuresOf(track: Float32Array, fps: number, frames: number): { level: number[]; spectrum: Uint8Array };
export declare function writeVoiceFeatures(filmDir: string, film: { fps?: number; total: number; lang?: string; cues?: Array<{ id: string; at: number }> }, opts?: { log?: (s: string) => void }): { frames: number; speaking: number; missing: string[] };
