// The avatar engine a film runs, taken from packages/avatar's source as it is
// TODAY (relative imports into the package, rebuilt when a source changes): a film never carries a
// frozen copy of the engine again. Bundled by lib/bundle.mjs into `Face` (IIFE).
export { createBrainScene } from '../../src/brainScene';
export { createFaceAnimator, EXPRESSIONS, HEAD_YAW, HEAD_PITCH, isMoveId } from '../../src/faceAnimator';
export { createRng } from '../../src/brainCloud';
export { easeOutCubic, AMBIENT_ALL, FORM_SECONDS } from '../../src/brainBackdropModel';
export { SHAPE_VIEWS } from '../../src/brainShapes';
export { WOMAN } from '../../src/womanFigure';
export { loadPortraitMap } from '../../src/portraitMaps';
export { isPortraitShape, PORTRAIT_SHAPES } from '../../src/portraitIds';
export { ROBOT_IDS } from '../../src/robotRecipes';
export { robotFigure } from '../../src/robotSpec';
