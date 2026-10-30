/**
 * THE BUNDLE THAT DOES NOT BUILD - what the bundler's line says when the app's code never reached
 * the app, read for `sherlo capture`.
 *
 * The SDK keeps the last failure Metro reported and answers a capture with it in place of "no app".
 * This reads that answer, and adds the one fact the bundler cannot know: whether the project's type
 * check resolves the import that failed. A path like `scenes/helpers` passes `tsc` when tsconfig's
 * `baseUrl` or `paths` reach it, and fails in Metro, which reads neither; the screen then says so,
 * because the reader's first thought is that the file is missing.
 */
import fs from 'fs';
import path from 'path';
import type { BundleBuildFailure } from '../render/capturedStory';
import { projectFiles } from './projectFiles';

const SOURCE_ENDINGS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '/index.ts',
  '/index.tsx',
  '/index.js',
];

/** What the line said was wrong with the build, or nothing when it said nothing readable. */
export function readBundleFailure(said: unknown): BundleBuildFailure | undefined {
  const failure = said as Record<string, unknown> | null | undefined;
  if (typeof failure?.message !== 'string') return undefined;

  const kind =
    failure.kind === 'unresolved-import' || failure.kind === 'syntax' ? failure.kind : 'other';
  const importPath = typeof failure.importPath === 'string' ? failure.importPath : undefined;
  const knownToTheTypeCheck =
    kind === 'unresolved-import' && importPath ? whatTheTypeCheckResolves(importPath) : undefined;

  return {
    kind,
    message: failure.message,
    ...(typeof failure.file === 'string' && { file: failure.file }),
    ...(typeof failure.line === 'number' && { line: failure.line }),
    ...(typeof failure.column === 'number' && { column: failure.column }),
    ...(Array.isArray(failure.frame) && {
      frame: failure.frame.filter((line): line is string => typeof line === 'string'),
    }),
    ...(importPath && { importPath }),
    ...(knownToTheTypeCheck && { knownToTheTypeCheck }),
  };
}

/**
 * How the project's tsconfig.json reaches `importPath` - `baseUrl "src"` or `paths "@app/*"` - when
 * it does and the file is there; undefined for a relative path, a package, or no tsconfig.
 */
export function whatTheTypeCheckResolves(importPath: string): string | undefined {
  if (importPath.startsWith('.') || path.isAbsolute(importPath)) return undefined;

  const root = projectFiles().root();
  const options = readCompilerOptions(path.join(root, 'tsconfig.json'));
  if (!options) return undefined;

  const baseUrl = typeof options.baseUrl === 'string' ? options.baseUrl : undefined;
  const baseFolder = path.resolve(root, baseUrl ?? '.');

  const paths = (options.paths ?? {}) as Record<string, unknown>;
  for (const [pattern, targets] of Object.entries(paths)) {
    const star = pattern.indexOf('*');
    const [before, after] =
      star === -1 ? [pattern, ''] : [pattern.slice(0, star), pattern.slice(star + 1)];
    const matches =
      star === -1
        ? importPath === pattern
        : importPath.startsWith(before) &&
          importPath.endsWith(after) &&
          importPath.length >= before.length + after.length;
    if (!matches || !Array.isArray(targets)) continue;

    const filled = importPath.slice(before.length, importPath.length - after.length);
    for (const target of targets) {
      if (
        typeof target === 'string' &&
        isThere(path.resolve(baseFolder, target.replace('*', filled)))
      ) {
        return `paths "${pattern}"`;
      }
    }
  }

  if (baseUrl !== undefined && isThere(path.resolve(baseFolder, importPath))) {
    return `baseUrl "${baseUrl}"`;
  }
  return undefined;
}

function isThere(withoutEnding: string): boolean {
  return SOURCE_ENDINGS.some((ending) => {
    try {
      return fs.statSync(withoutEnding + ending).isFile();
    } catch {
      return false;
    }
  });
}

/** The tsconfig's compilerOptions, read as the editor reads it (comments and trailing commas allowed). */
function readCompilerOptions(file: string): Record<string, unknown> | undefined {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const plain = text
      .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_all, quoted) => quoted ?? '')
      .replace(/,(\s*[}\]])/g, '$1');
    const options = (JSON.parse(plain) as { compilerOptions?: unknown }).compilerOptions;
    return options && typeof options === 'object'
      ? (options as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
