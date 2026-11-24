/**
 * A command that printed never ends the process bare.
 *
 * On a pipe, a bare exit right after a print can cut the output in the middle, so every exit of the
 * shipped source goes through `exitAfterOutput`. The only files that may call it bare are the ones
 * below, each with the reason its exit cannot cut anything.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.resolve(__dirname, '..');

const BARE_EXIT = /\bprocess\.exit\(/;

/** Files allowed a bare exit, and why. */
const PRINTS_NOTHING_BEFORE_ITS_EXIT = new Map([
  ['helpers/exitAfterOutput.ts', 'it is the exit that waits'],
  ['seams/deviceState.ts', 'it ends on a signal after cleanup and prints nothing'],
  ['seams/localCaptures.ts', 'it ends on a signal after cleanup and prints nothing'],
]);

function shippedSourceFiles(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : shippedSourceFiles(full);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : [];
  });
}

describe('the exits of the shipped source', () => {
  it('no file calls process.exit bare unless it prints nothing before its exit', () => {
    const bare = shippedSourceFiles(SOURCE_ROOT)
      .map((file) => path.relative(SOURCE_ROOT, file).split(path.sep).join('/'))
      .filter((file) => !PRINTS_NOTHING_BEFORE_ITS_EXIT.has(file))
      .flatMap((file) =>
        fs
          .readFileSync(path.join(SOURCE_ROOT, file), 'utf8')
          .split('\n')
          .flatMap((line, index) => (BARE_EXIT.test(line) ? [`${file}:${index + 1}`] : []))
      );

    expect(bare, 'route each of these through exitAfterOutput').toEqual([]);
  });
});
