/**
 * THE BUNDLER LINE'S BUILD - `bundlerLine.ts` reaches into the SDK for the line's types, and the
 * build's declaration step walks into the SDK's source with it. A build must leave that source as
 * it found it: whatever it writes, it writes inside `packages/cli/`.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const cliFolder = path.resolve(__dirname, '../../..');
const sdkSourceFolder = path.resolve(cliFolder, '../react-native-storybook/src');

describe('building the CLI', () => {
  it("writes no file into the SDK's source folder", () => {
    // The build's declaration step (`tsc --emitDeclarationOnly`) on the one file that reaches the
    // SDK, under the CLI's own tsconfig: the same options, so the same places written.
    const bundlerLineOnlyConfig = path.join(cliFolder, `tsconfig.bundlerLine-${process.pid}.json`);
    fs.writeFileSync(
      bundlerLineOnlyConfig,
      JSON.stringify({ extends: './tsconfig.json', include: ['src/seams/bundlerLine.ts'] })
    );
    const filesBefore = listFiles(sdkSourceFolder);

    try {
      execFileSync(
        process.execPath,
        [
          require.resolve('typescript/bin/tsc'),
          '--project',
          bundlerLineOnlyConfig,
          '--emitDeclarationOnly',
        ],
        { cwd: cliFolder, stdio: 'pipe' }
      );
    } finally {
      fs.rmSync(bundlerLineOnlyConfig);
    }

    const filesWritten = listFiles(sdkSourceFolder).filter((file) => !filesBefore.includes(file));
    // Put the folder back as it was, so a red run does not leave the stray file behind.
    filesWritten.forEach((file) => fs.rmSync(file));

    expect(filesWritten).toEqual([]);
  });
});

function listFiles(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(folder, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}
