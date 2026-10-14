/**
 * No file of the public repository speaks the words of how Sherlo plans its own work.
 *
 * The repository is public, so a note about work left for a "build task" must not land: a note
 * says what the code does and why, in words a reader of this repository understands, and work that
 * is left is tracked elsewhere. Each test names the file and line of each match.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.resolve(__dirname, '..');
const REPOSITORY_ROOT = path.resolve(SOURCE_ROOT, '../../..');
const FORBIDDEN_NOTE = /PLAN-LAYER STOP|build task/;

/** The parts of the repository that hold source, tests and fixtures. */
const PUBLIC_SOURCE_PATHS = [
  'packages/cli',
  'packages/react-native-storybook',
  'contracts',
  'actions',
  '.oxlint',
  'action.yml',
];
const GENERATED_FOLDERS = new Set(['node_modules', 'dist', '.gradle', '.cxx', 'Pods']);
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.txt',
  '.cmake',
  '.kt',
  '.java',
  '.swift',
  '.m',
  '.mm',
  '.h',
  '.cpp',
  '.gradle',
  '.podspec',
]);

/** Each internal word, and what it is, for the failure message. */
const INTERNAL_WORDS: { name: string; pattern: RegExp }[] = [
  { name: 'a ruling, decision or note of the operator', pattern: /(?<![.\w])[Oo]perator\b/ },
  { name: 'an epic', pattern: /\b[Ee]pic [a-z][a-z0-9]*(-[a-z0-9]+)+/ },
  { name: 'a plan-layer note', pattern: /PLAN-LAYER|PROTOTYPE/ },
  { name: 'a build item or task', pattern: /\b[Bb]uild (item|task)\b/ },
  { name: 'the content department', pattern: /[Cc]ontent department/ },
  { name: 'a book page', pattern: /\([a-z][a-z0-9-]* \/ [A-Z]/ },
];

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

function publicTextFiles(entryPath: string): string[] {
  if (fs.statSync(entryPath).isDirectory()) {
    return fs
      .readdirSync(entryPath)
      .filter((name) => !GENERATED_FOLDERS.has(name))
      .flatMap((name) => publicTextFiles(path.join(entryPath, name)));
  }

  return TEXT_EXTENSIONS.has(path.extname(entryPath)) && entryPath !== __filename
    ? [entryPath]
    : [];
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

  it('no source file names an internal epic, ruling or department', () => {
    const offendingLines = PUBLIC_SOURCE_PATHS.flatMap((sourcePath) =>
      publicTextFiles(path.join(REPOSITORY_ROOT, sourcePath))
    ).flatMap((filePath) =>
      fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          INTERNAL_WORDS.filter(({ pattern }) => pattern.test(line)).map(
            ({ name }) => `${path.relative(REPOSITORY_ROOT, filePath)}:${index + 1} names ${name}`
          )
        )
    );

    expect(offendingLines).toEqual([]);
  });
});
