/**
 * portraitIds — the ids of the faces drawn from a portrait photo (doc 180),
 * apart from brainShapes so the settings and the board can name them without
 * loading every portrait's maps.
 *
 * @module avatar/portraitIds
 */

/** The figures that are faces drawn from a portrait photo, free for everyone. */
export const PORTRAIT_SHAPES = ['woman', 'man', 'claire', 'amara', 'kofi', 'mei', 'kenji', 'kitten', 'shepherd', 'labrador', 'bear', 'leo'] as const;
export type PortraitShape = (typeof PORTRAIT_SHAPES)[number];
/** The faces that are animals: Profile shows them in their own card. */
export const ANIMAL_SHAPES: readonly PortraitShape[] = ['kitten', 'shepherd', 'labrador', 'bear', 'leo'];
/** Which animal each animal face is (its rig says the same: galleryFigures). */
export const SPECIES_OF: Readonly<Partial<Record<PortraitShape, 'cat' | 'dog' | 'bear' | 'lion'>>> = { kitten: 'cat', shepherd: 'dog', labrador: 'dog', bear: 'bear', leo: 'lion' };
export const isPortraitShape = (v: unknown): v is PortraitShape => typeof v === 'string' && (PORTRAIT_SHAPES as readonly string[]).includes(v);
