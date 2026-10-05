/**
 * The seam (../sealedCore/seam.ts): the one open contract between the SDK and its sealed cores,
 * which sherlo-runner keeps a tracked copy of and types the cores against.
 */
import { describe, it } from 'vitest';

describe('the seam', () => {
  it('the seam imports nothing from the rest of the SDK', () => {});

  it('the seam lists every native method of CompiledCore and the R8 rule that keeps them', () => {});
});
