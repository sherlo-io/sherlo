import { describe, expect, it } from 'vitest';
import { pnpmTakesAllowBuild } from '../storybookUpgrade';

describe('pnpm add takes --allow-build from 10.4.0', () => {
  it.each([
    ['10.4.0', true],
    ['10.10.2', true],
    ['11.0.0', true],
    ['10.3.9', false],
    ['10.2.0', false],
    ['9.15.0', false],
  ])('pnpm %s: %s', (version, takesIt) => {
    expect(pnpmTakesAllowBuild(version)).toBe(takesIt);
  });

  it('adds no flag when pnpm could not say its version', () => {
    expect(pnpmTakesAllowBuild(null)).toBe(false);
  });
});
