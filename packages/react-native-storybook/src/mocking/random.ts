import { MockDeclaration } from './mockDeclaration';
import { MockDefinition } from './types';

// No real module is ever imported under this key, so a random declaration can never collide
// with a module mock - it rides the same declaration channel `mock` uses, then activateStoryMocks
// reads it back off that channel and installs the random generator instead of a module.
export const RANDOM_MOCK_KEY = '__sherlo_random__';

export interface RandomDefinition {
  seed: number;
}

/**
 * Declares the seed a story's random numbers should follow.
 *
 *   mocks: [mockRandom(42)]
 */
export function mockRandom(seed: number): MockDeclaration {
  return {
    moduleKey: () => Promise.resolve(RANDOM_MOCK_KEY),
    definition: { seed } as MockDefinition,
  };
}

let realRandom: (() => number) | undefined;

// mulberry32 - a small, fast seeded generator. Re-seeding it from the same seed always
// reproduces the same sequence, which is the whole point of naming one.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Replaces Math.random with a generator seeded from `seed`, re-seeding it on every activation.
export function installRandom(seed: number): void {
  realRandom = realRandom ?? Math.random;
  Math.random = mulberry32(seed);
}

// Restores the real Math.random, if a seed was ever installed.
export function restoreRandom(): void {
  if (!realRandom) return;
  Math.random = realRandom;
  realRandom = undefined;
}
