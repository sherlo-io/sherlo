/**
 * The seeded generator behind mockRandom is pinned to its exact values: a story that names seed 42
 * must see the same numbers on every release, so a change to the generator's arithmetic (including
 * a lint-driven rewrite of its bitwise operators) fails here instead of silently shifting every
 * screenshot that shows a random value.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { installRandom, restoreRandom } from '../../mocking/random';

describe('the seeded generator', () => {
  afterEach(() => {
    restoreRandom();
  });

  it('gives these exact first values for seed 42', () => {
    installRandom(42);

    expect([Math.random(), Math.random(), Math.random(), Math.random(), Math.random()]).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693,
      0.17481389874592423,
    ]);
  });
});
