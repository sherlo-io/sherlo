/** bundleFailure.ts reads the bundler's does-not-build answer off the line for `sherlo capture`. */
import { describe, expect, it } from 'vitest';
import { readBundleFailure } from '../bundleFailure';

describe('a bundle that fails to build is reported', () => {
  it("a bundle that does not build is reported with its file, line and the bundler's message", () => {
    expect(
      readBundleFailure({
        kind: 'syntax',
        message: 'Unexpected token',
        file: 'src/App.tsx',
        line: 12,
        column: 3,
      })
    ).toEqual({
      kind: 'syntax',
      message: 'Unexpected token',
      file: 'src/App.tsx',
      line: 12,
      column: 3,
    });
  });
});
