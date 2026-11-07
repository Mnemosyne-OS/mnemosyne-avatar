/**
 * No `vitest/config` import on purpose, like the other workspace packages:
 * `defineConfig` is an identity function, and importing it makes this file
 * unloadable from any runner that is not this package's own installed vitest.
 *
 * Node environment: the engine is pure arithmetic over typed arrays; only
 * `createBrainScene` touches WebGL, and no test builds a scene.
 */
export default {
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
};
