/**
 * orbParticles — the particle orb skin's motion, kept pure so it can be pinned:
 * a companion to the backdrop woman, the same stippled particles, driven by the
 * same voice.
 *
 * A shell of points spread evenly over a sphere (a Fibonacci lattice) turns
 * slowly, tilted, around a small swirling core. Her voice makes each shell
 * point flicker outward on its own beat, so the orb bristles while she speaks;
 * while she listens the points are drawn in, as if gathering what is said.
 * Each frame comes out as one SVG path per depth band (back, middle, front,
 * core): four attribute writes instead of hundreds of nodes.
 *
 * @module avatar/orbParticles
 */

/** The orb's points: unit directions on the shell, unit positions in the core, a seed each. */
export interface OrbParticleCloud {
  shell: Float32Array;
  shellSeed: Float32Array;
  core: Float32Array;
  coreSeed: Float32Array;
}

/** Each depth band's dots, as SVG path data. */
export interface OrbParticleFrame { back: string; mid: string; front: string; core: string }

/** The skin's viewBox centre and the shell's radius in it (the clip is 50.5). */
export const ORB_PARTICLE_CENTER = 60;
const C = ORB_PARTICLE_CENTER, R = 38;

/** A small deterministic generator, so every orb draws the same cloud. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeOrbParticles(shellCount = 260, coreCount = 80): OrbParticleCloud {
  const r = rng(7);
  const shell = new Float32Array(shellCount * 3), shellSeed = new Float32Array(shellCount);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < shellCount; i++) {
    const y = 1 - (2 * (i + 0.5)) / shellCount;
    const rad = Math.sqrt(1 - y * y);
    const a = i * golden + (r() - 0.5) * 0.3;
    shell.set([Math.cos(a) * rad, y, Math.sin(a) * rad], i * 3);
    shellSeed[i] = r();
  }
  const core = new Float32Array(coreCount * 3), coreSeed = new Float32Array(coreCount);
  for (let i = 0; i < coreCount; i++) {
    let x: number, y: number, z: number;
    do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1);
    const k = 0.35 * Math.sqrt(x * x + y * y + z * z);
    core.set([x * k, y * k, z * k], i * 3);
    coreSeed[i] = r();
  }
  return { shell, shellSeed, core, coreSeed };
}

/** One dot as path data: two half arcs. */
function dot(x: number, y: number, r: number): string {
  const d = (2 * r).toFixed(2), rs = r.toFixed(2);
  return `M${(x - r).toFixed(1)},${y.toFixed(1)}a${rs},${rs} 0 1,0 ${d},0a${rs},${rs} 0 1,0 -${d},0`;
}

/**
 * The orb at time t. `lvl` is her voice's loudness (0..1), `listen` how much
 * she is listening (0..1).
 */
export function orbParticleFrame(cloud: OrbParticleCloud, t: number, lvl: number, listen: number): OrbParticleFrame {
  const out = { back: [] as string[], mid: [] as string[], front: [] as string[], core: [] as string[] };
  const spin = t * (0.45 + 1.4 * lvl), tilt = 0.38;
  const cs = Math.cos(spin), sn = Math.sin(spin), ct = Math.cos(tilt), st = Math.sin(tilt);
  const breathe = 1 + 0.04 * Math.sin(t * 1.3);
  const n = cloud.shellSeed.length;
  for (let i = 0; i < n; i++) {
    const seed = cloud.shellSeed[i] ?? 0;
    let x = cloud.shell[i * 3] ?? 0, y = cloud.shell[i * 3 + 1] ?? 0, z = cloud.shell[i * 3 + 2] ?? 0;
    // Spin about y, then tilt towards the viewer.
    [x, z] = [x * cs + z * sn, -x * sn + z * cs];
    [y, z] = [y * ct - z * st, y * st + z * ct];
    const beat = 0.5 + 0.5 * Math.sin(seed * 40 + t * 14);
    const spike = lvl * (0.1 + 0.32 * beat);
    const pull = listen * 0.14 * (0.5 + 0.5 * Math.sin(seed * 20 + t * 5));
    const k = R * (breathe + spike - pull);
    const depth = (z + 1) / 2;
    const r = 0.45 + 0.65 * depth + lvl * 0.35;
    const band = z < -0.33 ? out.back : z < 0.33 ? out.mid : out.front;
    band.push(dot(C + x * k, C - y * k, r));
  }
  const m = cloud.coreSeed.length;
  for (let i = 0; i < m; i++) {
    const seed = cloud.coreSeed[i] ?? 0;
    const a = -t * 0.9 + seed * 6.28;
    const x = cloud.core[i * 3] ?? 0, y = cloud.core[i * 3 + 1] ?? 0, z = cloud.core[i * 3 + 2] ?? 0;
    const rx = x * Math.cos(a) + z * Math.sin(a);
    const k = R * (1 + lvl * 0.5);
    out.core.push(dot(C + rx * k, C - y * k, 0.55 + 0.5 * seed + lvl * 0.5));
  }
  return { back: out.back.join(''), mid: out.mid.join(''), front: out.front.join(''), core: out.core.join('') };
}
