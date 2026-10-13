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
  recordStorybookFacts({
    storyIndex: storyIndexOf(handed, previewAnnotations, prepareStories),
    storyFiles: storyFilesOf(handed.storyEntries ?? []),
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
 * Every story file's exports, by the import path Storybook's index names it with: the folder, and
 * the file's key in it without its leading "./" ("./src" and "./Button.stories.tsx" make
 * "./src/Button.stories.tsx").
 */
function storyFilesOf(storyEntries: StoryEntry[]): Record<string, StoryFileExports> {
  const storyFiles: Record<string, StoryFileExports> = {};
  for (const entry of storyEntries) {
    if (typeof entry?.req?.keys !== 'function') continue;
    for (const filename of entry.req.keys()) {
      try {
        storyFiles[`${entry.directory}/${filename.substring(2)}`] = entry.req(filename);
      } catch (_) {
        // A file that throws as it loads is Storybook's to report, as it loads it too.
      }
    }
  }
  return storyFiles;
}
