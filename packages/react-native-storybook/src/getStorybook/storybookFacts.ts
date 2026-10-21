/**
 * STORYBOOK'S FACTS: what Storybook's start() was handed, kept as plain data (../sealedCore/seam).
 *
 * Sherlo's start wrapper (metro/applySherloTransforms.js) records them as Storybook starts, and
 * afresh on each hot update (updateView, which is handed the same arguments), and the
 * host hands them to the sealed core (../sealedCore/loadSealedCore), so the core reads the stories,
 * their parameters and their mocks without ever reaching Storybook's view. Mocking reads them too
 * (../mocking/storyMocksOf). A launch where Storybook has not started has none.
 */
import type {
  StorybookAnnotations,
  StorybookFacts,
  StorybookIndexEntry,
  StoryFileExports,
} from '../sealedCore/seam';

let recordedFacts: StorybookFacts | null = null;

/** Keep what Storybook's start() was handed in this launch. */
export function recordStorybookFacts(facts: StorybookFacts): void {
  recordedFacts = facts;
}

/** What Storybook's start() was handed in this launch, or null when it has not started. */
export function readStorybookFacts(): StorybookFacts | null {
  return recordedFacts;
}

/** Test-only: forget the recorded facts between tests. */
export function __resetStorybookFactsForTests(): void {
  recordedFacts = null;
}

/** One folder of story files, as Storybook's generated requires file hands it to start(). */
type StoryEntry = {
  directory: string;
  req: { keys(): string[]; (filename: string): StoryFileExports };
  [other: string]: unknown;
};

/** What Storybook's start() is handed: its arguments, all public. */
export type StorybookStartArguments = {
  storyEntries: StoryEntry[];
  annotations?: unknown[];
  options?: unknown;
};

/** Storybook's exported prepareStories, which start() itself indexes the story files with. */
type PrepareStories = (args: {
  storyEntries: StoryEntry[];
  options?: unknown;
  storySort?: unknown;
}) => { index: { entries: Record<string, StorybookIndexEntry> } };

/**
 * Record the facts of what start() was handed: the story index Storybook's own prepareStories
 * builds from the story entries, every story file's exports, and the preview annotations. Never
 * throws: a part that cannot be read is left empty, with a warning, and Storybook starts as ever.
 */
export function recordWhatStartWasHanded(
  handed: StorybookStartArguments,
  prepareStories: PrepareStories | undefined
): void {
  const previewAnnotations = (handed.annotations ?? []).map(annotationsOf);
  const storyFiles: Record<string, StoryFileExports> = {};
  const storyLoadErrors: Record<string, string> = {};
  loadStoryFiles(handed.storyEntries ?? [], storyFiles, storyLoadErrors);
  recordStorybookFacts({
    storyIndex: storyIndexOf(handed, previewAnnotations, prepareStories),
    storyFiles,
    storyLoadErrors,
    previewAnnotations,
  });
}

/* ========================================================================== */

/** A preview file's annotations: its default export when it has one, else the module itself. */
function annotationsOf(previewModule: unknown): StorybookAnnotations {
  const annotations = previewModule as { default?: StorybookAnnotations } | null | undefined;
  return annotations?.default ?? (annotations as StorybookAnnotations) ?? {};
}

function storyIndexOf(
  handed: StorybookStartArguments,
  previewAnnotations: StorybookAnnotations[],
  prepareStories: PrepareStories | undefined
): Record<string, StorybookIndexEntry> {
  if (typeof prepareStories !== 'function') {
    console.warn('@sherlo/react-native-storybook: this Storybook exports no prepareStories.');
    return {};
  }
  try {
    return prepareStories({
      storyEntries: handed.storyEntries,
      options: handed.options,
      // The order start() itself sorts by: the last preview that names one wins, as it composes.
      storySort: previewAnnotations
        .map((annotations) => annotations.parameters?.options?.storySort)
        .filter((storySort) => storySort !== undefined)
        .pop(),
    }).index.entries;
  } catch (error) {
    console.warn(
      "@sherlo/react-native-storybook: Storybook's stories could not be indexed.",
      error
    );
    return {};
  }
}

/**
 * Every story file's exports into storyFiles, by the import path Storybook's index names it with:
 * the folder, and the file's key in it without its leading "./" ("./src" and "./Button.stories.tsx"
 * make "./src/Button.stories.tsx"). A file that throws as it loads is Storybook's to report, as it
 * loads it too; its import path and error message go into storyLoadErrors, so capture can name the
 * file instead of saying the story is unknown.
 */
function loadStoryFiles(
  storyEntries: StoryEntry[],
  storyFiles: Record<string, StoryFileExports>,
  storyLoadErrors: Record<string, string>
): void {
  for (const entry of storyEntries) {
    if (typeof entry?.req?.keys !== 'function') continue;
    for (const filename of entry.req.keys()) {
      const importPath = `${entry.directory}/${filename.substring(2)}`;
      try {
        storyFiles[importPath] = entry.req(filename);
      } catch (error) {
        storyLoadErrors[importPath] = error instanceof Error ? error.message : String(error);
      }
    }
  }
}

const slugOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * What capture can answer for a story id that is not in the index, when a story file failed to
 * load: "the story file <path> failed to load: <error>", or null when no failed file could hold
 * it (capture then keeps its own "No story <id> in this app"). A failed file's stories are not
 * known (it threw), so a file is matched by its path: the id's title part must end the file's
 * path without its extension and ".stories" (Storybook's auto-title, "src/Button" gives
 * "src-button"). A story with a title of its own in a failed file cannot be matched this way.
 */
export function storyLoadErrorAnswer(
  storyId: string,
  storyLoadErrors: Record<string, string>
): string | null {
  const titlePart = slugOf(storyId.split('--')[0]);
  for (const [importPath, message] of Object.entries(storyLoadErrors)) {
    const pathPart = slugOf(importPath.replace(/(\.stories)?\.[a-z]+$/i, ''));
    if (titlePart !== '' && pathPart.endsWith(titlePart)) {
      return `the story file ${importPath} failed to load: ${message}`;
    }
  }
  return null;
}
