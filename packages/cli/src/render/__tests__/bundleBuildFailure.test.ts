/**
 * The screen for an app whose code the bundler cannot build: where, what, and the one case where
 * the type check and the bundler disagree. Colour is off.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { bundleBuildFailureLines } from '../bundleBuildFailure';

beforeAll(() => {
  (chalk as unknown as { level: number }).level = 0;
});

describe('the screen for code the bundler cannot build', () => {
  it('names the file, line and column, then the bundler words and its code frame', () => {
    const lines = bundleBuildFailureLines({
      kind: 'syntax',
      message: 'Unexpected token',
      file: 'src/App.tsx',
      line: 4,
      column: 9,
      frame: ['> 4 | const = 1'],
    });

    expect(lines).toContain('  src/App.tsx:4:9');
    expect(lines).toContain('  Unexpected token');
    expect(lines).toContain('    > 4 | const = 1');
  });

  it('says why the type check passes when it resolves an import the bundler does not', () => {
    const text = bundleBuildFailureLines({
      kind: 'unresolved-import',
      message: 'Unable to resolve "scenes/helpers"',
      importPath: 'scenes/helpers',
      knownToTheTypeCheck: 'baseUrl "src"',
    }).join('\n');

    expect(text).toContain('tsconfig.json resolves scenes/helpers (baseUrl "src")');
  });

  it('prints no place line when the bundler names no file', () => {
    const lines = bundleBuildFailureLines({ kind: 'other', message: 'Something broke' });

    expect(lines[2]).toBe('  Something broke');
  });
});
