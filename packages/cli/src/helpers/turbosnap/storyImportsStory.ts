import fs from 'fs';
import path from 'path';
import type { ChangedFilesResult } from './computeChangedFiles';

const STORY_FILE_RE = /\.stories\.[jt]sx?$/;
const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

/**
 * Checks whether any changed story file is imported (directly or transitively
 * via other story files) by another story file in the project.
 *
 * Covers three import forms:
 *   - Static:        import { X } from '<spec>'
 *   - Dynamic:       import('<spec>')
 *   - CommonJS:      require('<spec>')
 *
 * If so, returns { fullRun, reason } because the API only receives file paths -
 * it cannot see that StoryA.stories.tsx re-uses Button's render by importing
 * from Button.stories.tsx. Skipping StoryA would produce a false-green.
 *
 * BAIL-OPEN: any condition that prevents a reliable graph (can't enumerate
 * story files, can't read a story file, can't resolve a story-looking specifier)
 * returns fullRun. This includes path-aliased imports (e.g. '@/X.stories') that
 * look like story files but cannot be resolved on disk - we cannot rule out a
 * hidden story->story edge, so we force full rather than silently skip.
 *
 * Precondition: called only after computeChangedFiles would return { changedFiles }
 * (i.e. the partial-eligible path). The common fast path where no story imports
 * another story is not affected (returns { changedFiles } unchanged).
 */
export function checkStoryImportsStory(
  projectRoot: string,
  changedFiles: string[]
): ChangedFilesResult {
  // Fast path: if no changed story files, no cross-story composition to worry about.
  const changedStories = changedFiles.filter((f) => STORY_FILE_RE.test(f));
  if (changedStories.length === 0) {
    return { changedFiles };
  }

  // Enumerate all story files in the project (absolute paths, excluding node_modules/.git).
  let allStoryFiles: string[];
  try {
    allStoryFiles = findStoryFiles(projectRoot);
  } catch {
    return {
      fullRun: true,
      reason: 'story-imports-story: failed to enumerate story files, forcing full',
    };
  }

  const storyFileSet = new Set(allStoryFiles);

  // Absolute paths of changed story files for comparison with the resolved graph paths.
  const changedStoryAbsPaths = new Set(
    changedStories.map((f) => path.resolve(projectRoot, f))
  );

  // Build reverse-import graph: importee (abs) -> Set<importer (abs)>.
  // Only story->story edges are tracked.
  const reverseEdges = new Map<string, Set<string>>();

  for (const storyFile of allStoryFiles) {
    let content: string;
    try {
      content = fs.readFileSync(storyFile, 'utf8');
    } catch {
      return {
        fullRun: true,
        reason: 'story-imports-story: failed to read story file, forcing full',
      };
    }

    for (const spec of extractSpecifiers(content)) {
      const resolved = resolveSpecifier(storyFile, spec, storyFileSet);

      if (resolved === 'bail') {
        return {
          fullRun: true,
          reason: 'story-imports-story: unresolved import, forcing full',
        };
      }

      if (resolved === null) continue; // resolves to non-story or safely unresolvable

      // storyFile imports resolved (another story): record reverse edge.
      const importers = reverseEdges.get(resolved);
      if (importers) {
        importers.add(storyFile);
      } else {
        reverseEdges.set(resolved, new Set([storyFile]));
      }
    }
  }

  // For each changed story file, check whether any other story imports it.
  for (const changedAbs of changedStoryAbsPaths) {
    const importer = findImporter(changedAbs, reverseEdges);
    if (importer !== null) {
      return {
        fullRun: true,
        reason: `story-imports-story: ${path.relative(projectRoot, changedAbs)} reused by ${path.relative(projectRoot, importer)}`,
      };
    }
  }

  return { changedFiles };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Recursively finds all *.stories.{js,jsx,ts,tsx} files under dir. */
function findStoryFiles(dir: string): string[] {
  const results: string[] = [];
  scanDir(dir, results);
  return results;
}

function scanDir(dir: string, out: string[]): void {
  // Throws on permission errors - caught by checkStoryImportsStory for bail-open.
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full, out);
    } else if (entry.isFile() && STORY_FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
}

/**
 * Extracts all import/require specifiers from source text.
 *
 * Covers three forms:
 *   - Static / re-export:  from '<spec>'
 *   - Dynamic import:      import('<spec>')
 *   - CommonJS:            require('<spec>')
 *
 * Returns specifiers verbatim (relative, aliased, bare package - all included).
 * Uses a simple regex; may match strings inside comments, which is intentional
 * (over-detection is safe for bail-open; we never under-detect).
 */
function extractSpecifiers(content: string): string[] {
  const out: string[] = [];
  const re =
    /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) out.push(spec);
  }
  return out;
}

/**
 * Resolves an import specifier from a story file.
 *
 * Returns:
 *   absolute path - specifier resolves to a story file on disk
 *   null          - specifier resolves to a non-story file, or is unresolvable
 *                   but cannot possibly match the story-file pattern (e.g. bare
 *                   npm packages like 'react', aliased non-story components like
 *                   '@/components/SharedButton') - safe to skip
 *   'bail'        - specifier looks like a story file (its path matches
 *                   STORY_FILE_RE with or without an extension suffix) but cannot
 *                   be resolved on disk; we cannot rule out a hidden story->story
 *                   edge (e.g. a path alias '@/X.stories' or a dynamic import of
 *                   a story that was moved), so we force full rather than skip
 */
function resolveSpecifier(
  fromFile: string,
  spec: string,
  storyFileSet: Set<string>
): string | null | 'bail' {
  const base = path.resolve(path.dirname(fromFile), spec);

  // Try the exact path first (covers specs that already carry an extension).
  if (isFile(base)) {
    return storyFileSet.has(base) ? base : null;
  }

  // Try appending each known source extension (covers extension-less specs like
  // './Button.stories' resolving to './Button.stories.tsx').
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (isFile(candidate)) {
      return storyFileSet.has(candidate) ? candidate : null;
    }
  }

  // Cannot resolve - check whether the spec could represent a story file.
  // If the exact path or any extension-added path matches the story pattern,
  // we cannot rule out a hidden story->story edge: bail.
  if (STORY_FILE_RE.test(base)) return 'bail';
  for (const ext of EXTENSIONS) {
    if (STORY_FILE_RE.test(base + ext)) return 'bail';
  }

  // Definitely not a story file path - safe to skip.
  return null;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Returns any story file that directly imports changedAbs, or null if none.
 *
 * Note: a direct check is sufficient because any transitive story->story chain
 * A→B→C always implies that B directly imports C, so C's direct importers set
 * is never empty when C is transitively reachable from another story.
 */
function findImporter(
  changedAbs: string,
  reverseEdges: Map<string, Set<string>>
): string | null {
  const importers = reverseEdges.get(changedAbs);
  if (!importers) return null;
  for (const imp of importers) {
    if (imp !== changedAbs) return imp;
  }
  return null;
}
