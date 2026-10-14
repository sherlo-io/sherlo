/**
 * No shipped source of the tool says a build task still owes it something.
 *
 * The repository is public, so a note about work left for a "build task" must not land: a note
 * says what the code does, and work that is left is tracked elsewhere. Reads every non-test `.ts`
 * file under `src` and names the file and line of each match.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.resolve(__dirname, '..');
const FORBIDDEN_NOTE = /PLAN-LAYER STOP|build task/;

function shippedSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : shippedSourceFiles(entryPath);
    }

    const isTest = /\.test\.ts$/.test(entry.name);
    return entry.name.endsWith('.ts') && !isTest ? [entryPath] : [];
  });
}

describe('no shipped source of the tool says a build task still owes it something', () => {
  it('has no "PLAN-LAYER STOP" or "build task" line in any non-test .ts file under src', () => {
    const offendingLines = shippedSourceFiles(SOURCE_ROOT).flatMap((filePath) =>
      fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          FORBIDDEN_NOTE.test(line) ? [`${path.relative(SOURCE_ROOT, filePath)}:${index + 1}`] : []
        )
    );

    expect(offendingLines).toEqual([]);
  });
});
