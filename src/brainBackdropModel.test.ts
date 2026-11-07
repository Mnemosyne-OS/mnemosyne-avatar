/**
 * brainBackdropModel.test.ts — the tour and the tier.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyGpu, resolveTier, shouldStepDown, tourView, stillView, formation, groundMode, pointLook,
  TOUR_STEP_S, STEP_DOWN_FPS, STEP_DOWN_WINDOWS, FORM_SECONDS,
} from './brainBackdropModel';
import { ENGINE_COUNT, REGION_VIEWS } from './brainCloud';

describe('classifyGpu', () => {
  // Real ANGLE strings, the way Chromium on Windows reports them.
  it.each([
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 4050 Laptop GPU (0x000028A1) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
    ['ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
    ['ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
    // Built from ANGLE's pattern, not read on a machine: the B series and the Pro cards are dedicated.
    ['ANGLE (Intel, Intel(R) Arc(TM) B580 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
    ['ANGLE (Intel, Intel(R) Arc(TM) Pro A60 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
    ['ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'software'],
    ['ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', 'software'],
    ['Apple M2', 'discrete'],
  ])('%s → %s', (name, kind) => {
    expect(classifyGpu(name)).toBe(kind);
  });

  it('says nothing about a name it does not know, or no name', () => {
    expect(classifyGpu('Mali-G78')).toBeNull();
    expect(classifyGpu(null)).toBeNull();
  });
});

describe('resolveTier', () => {
  it('obeys an explicit choice whatever the GPU', () => {
    expect(resolveTier('full', 'ANGLE (Intel, Intel(R) UHD Graphics 620)')).toEqual({ tier: 'full', reason: 'chosen' });
    expect(resolveTier('lite', 'NVIDIA GeForce RTX 4090')).toEqual({ tier: 'lite', reason: 'chosen' });
  });

  it('auto goes lite on integrated and software, full on discrete', () => {
    expect(resolveTier('auto', 'ANGLE (Intel, Intel(R) UHD Graphics 620)').tier).toBe('lite');
    expect(resolveTier('auto', 'SwiftShader').tier).toBe('lite');
    expect(resolveTier('auto', 'NVIDIA GeForce RTX 4050')).toEqual({ tier: 'full', reason: 'discrete' });
  });

  it('an unknown GPU is not a weak one: full, and the measure decides', () => {
    expect(resolveTier('auto', null)).toEqual({ tier: 'full', reason: 'unknown' });
  });
});

describe('shouldStepDown', () => {
  const slow = STEP_DOWN_FPS - 1;
  const slowRun = new Array<number>(STEP_DOWN_WINDOWS).fill(slow);

  it('steps down auto from full when the last windows were all slow', () => {
    expect(shouldStepDown('auto', 'full', slowRun)).toBe(true);
    expect(shouldStepDown('auto', 'full', [60, ...slowRun])).toBe(true);
  });

  it('one slow window is a freeze, not a slow GPU', () => {
    expect(shouldStepDown('auto', 'full', [slow])).toBe(false);
    expect(shouldStepDown('auto', 'full', [slow, 60])).toBe(false);
    expect(shouldStepDown('auto', 'full', [60, slow])).toBe(false);
  });

  it('the threshold itself is not slow, and nothing measured is nothing', () => {
    expect(shouldStepDown('auto', 'full', new Array<number>(STEP_DOWN_WINDOWS).fill(STEP_DOWN_FPS))).toBe(false);
    expect(shouldStepDown('auto', 'full', [])).toBe(false);
  });

  it('never moves a reduced brain or an explicit choice', () => {
    expect(shouldStepDown('auto', 'lite', slowRun)).toBe(false);
    expect(shouldStepDown('full', 'full', slowRun)).toBe(false);
  });
});

describe('tourView', () => {
  it('holds on each region in turn, the site framing, lit', () => {
    for (let k = 0; k < ENGINE_COUNT; k++) {
      const v = tourView(k * TOUR_STEP_S + TOUR_STEP_S * 0.4);
      expect(v.rx).toBeCloseTo(REGION_VIEWS[k]!.rx, 6);
      expect(v.act[k]).toBe(1);
      expect(v.act.filter((a, i) => i !== k && a > 0)).toEqual([]);
    }
  });

  it('never turns back, across stops and across a whole lap', () => {
    let prev = tourView(0).ry;
    for (let t = 0.05; t < TOUR_STEP_S * ENGINE_COUNT * 2; t += 0.05) {
      const ry = tourView(t).ry;
      expect(ry).toBeLessThanOrEqual(prev + 1e-9);
      prev = ry;
    }
  });

  it('has no jump in rotation or light at a stop boundary', () => {
    for (let k = 1; k <= ENGINE_COUNT + 1; k++) {
      const a = tourView(k * TOUR_STEP_S - 1e-6), b = tourView(k * TOUR_STEP_S + 1e-6);
      expect(Math.abs(a.ry - b.ry)).toBeLessThan(1e-3);
      expect(Math.abs(a.rx - b.rx)).toBeLessThan(1e-3);
      for (let i = 0; i < ENGINE_COUNT; i++) expect(Math.abs(a.act[i]! - b.act[i]!)).toBeLessThan(1e-3);
    }
  });

  it('the still picture lights no region on its own', () => {
    expect(stillView().act.every(a => a === 0)).toBe(true);
  });
});

describe('formation', () => {
  it('goes from scattered to formed in FORM_SECONDS', () => {
    expect(formation(0)).toBe(0);
    expect(formation(FORM_SECONDS / 2)).toBeGreaterThan(0.5);
    expect(formation(FORM_SECONDS)).toBe(1);
    expect(formation(100)).toBe(1);
  });
});

describe('groundMode and pointLook', () => {
  // The scene hands over LINEAR rgb (three's colour management).
  const linear = (hex: string): [number, number, number] => {
    const c = (i: number) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return [c(0), c(2), c(4)];
  };

  it('the site night ground is night, the light theme ground is day', () => {
    expect(groundMode(...linear('0e0f13'))).toBe('night');
    expect(groundMode(...linear('e9ebf1'))).toBe('day');
    expect(groundMode(...linear('ffffff'))).toBe('day');
  });

  it('decides on luminance, not on one channel: a saturated blue stays night', () => {
    expect(groundMode(...linear('1020ff'))).toBe('night');
  });

  it('the day look never depends on the bloom, and no bloom lifts the points at night', () => {
    expect(pointLook('day', true)).toEqual(pointLook('day', false));
    expect(pointLook('night', false).gain).toBeGreaterThan(pointLook('night', true).gain);
  });
});
