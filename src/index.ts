/**
 * Mnemosyne Avatar — the public door.
 *
 * Everything a page needs to draw the particle face and keep it alive:
 *  - the scene (`createBrainScene`): three.js points, links, bloom, the figure
 *    morphing from one shape to another;
 *  - the figures: the brain, the gallery faces, the animals and the robots;
 *  - the life of a face (`createFaceAnimator`): gaze, blinks, breathing, mouth
 *    on the voice, expressions, micro-reactions, music, sleep;
 *  - the particle orb (`makeOrbParticles`).
 *
 * The gallery faces' density maps are large, so they are never imported here:
 * `loadPortraitMap(id)` fetches one when it is worn. Each module is also its own
 * door (`@mnemosyne_os/avatar/faceAnimator`), for a page that needs only one.
 *
 * @module avatar
 */
export * from './brainScene';
export * from './brainCloud';
export * from './brainShapes';
export * from './brainBackdropModel';
export * from './shapeKit';
export * from './motion';
export * from './faceShapes';
export * from './faceAnimator';
export * from './faceEmotions';
export * from './faceGesture';
export * from './faceMicro';
export * from './faceMood';
export * from './faceMusic';
export * from './faceScenes';
export * from './faceSpecies';
export * from './mouthModel';
export * from './hairModel';
export * from './speechTone';
export * from './pointerNear';
export * from './musicBeat';
export * from './portraitFigure';
export * from './portraitBuild';
export * from './portraitMaps';
export * from './portraitIds';
export * from './womanFigure';
export * from './manFigure';
export * from './galleryFigures';
export * from './robotRecipes';
export * from './robotSpec';
export * from './orbParticles';
