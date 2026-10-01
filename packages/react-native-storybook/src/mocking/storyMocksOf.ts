/**
 * ONE STORY'S MOCKS, found the way Storybook finds the story: by its id in Storybook's own index.
 *
 * Mocking stays open, so this works with no sealed core: a person's Storybook turns on the mocks
 * of the story they select in Expo Go too. The core lists every story for a run, with Sherlo's own
 * way of choosing ids; this reads only the one story Storybook already knows by id.
 *
 * The story's index entry names its file and its display name. The file is found among the story
 * files Storybook's generated requires file hands over (the global `STORIES`), and the story among
 * its exports by that display name. Its mocks are the project's, the file's and its own, merged by
 * the precedence mergeStoryMocks keeps.
 */
import type { StorybookView } from '../types';
import { mergeStoryMocks } from './mergeMocks';
import type { StoryMocks } from './mockDeclaration';

/** The parts of Storybook's view this reads. None of them are on the public type. */
type StorybookInternals = {
  _storyIndex?: {
    entries?: Record<string, { name: string; importPath: string } | undefined>;
  };
  _preview?: {
    storyStoreValue?: { projectAnnotations?: { parameters?: Record<string, any> } };
  };
};

/** One folder of story files, as Storybook's generated requires file lists it. */
type StoryFolder = {
  directory?: string;
  req?: { keys(): string[]; (filename: string): Record<string, any> };
};

type StoryLevelParameters = { parameters?: Record<string, any> };

/**
 * The merged mocks of the story Storybook knows as `storyId`. A story its index does not hold has
 * none, and a story whose file is not among the story files has only the project's.
 *
 * The project's mocks are read from Storybook's preview, which is composed only once it is ready:
 * read earlier, the project has none yet (storyMockActivation reads again once it is ready).
 */
export function storyMocksOf(view: StorybookView, storyId: string): StoryMocks {
  const storybook = view as unknown as StorybookInternals;
  const indexEntry = storybook._storyIndex?.entries?.[storyId];
  if (!indexEntry) return {};

  const projectParameters = storybook._preview?.storyStoreValue?.projectAnnotations?.parameters;
  const projectMocks: StoryMocks = projectParameters?.sherlo?.mocks ?? {};

  const fileExports = storyFileExports(indexEntry.importPath);
  if (!fileExports) return projectMocks;

  const meta: StoryLevelParameters = fileExports.default ?? {};
  const story = storyExportNamed(fileExports, indexEntry.name) ?? {};
  return mergeStoryMocks(
    projectMocks,
    meta.parameters?.sherlo?.mocks ?? {},
    story.parameters?.sherlo?.mocks ?? {}
  );
}

/* ========================================================================== */

/** The exports of the story file at `importPath` ("./src/Button.stories.tsx"), or nothing. */
function storyFileExports(importPath: string): Record<string, any> | undefined {
  const folders = (globalThis as { STORIES?: unknown }).STORIES;
  if (!Array.isArray(folders)) return undefined;

  for (const folder of folders as StoryFolder[]) {
    if (!folder.req || !folder.directory) continue;
    // A folder's keys are relative to the folder ("./Button.stories.tsx"), an index entry's
    // importPath to the app's root.
    const filename = folder.req
      .keys()
      .find((key) => `${folder.directory}/${key.slice(2)}` === importPath);
    if (filename === undefined) continue;
    try {
      return folder.req(filename);
    } catch (_) {
      return undefined;
    }
  }
  return undefined;
}

/**
 * The story export Storybook shows under `displayName`: the one whose own `name` is it, or whose
 * export name Storybook turns into it. A story written as a function keeps its settings on `.story`.
 */
function storyExportNamed(
  fileExports: Record<string, any>,
  displayName: string
): StoryLevelParameters | undefined {
  for (const exportName of Object.keys(fileExports)) {
    if (exportName === 'default' || exportName.startsWith('_')) continue;
    const storyExport = fileExports[exportName];
    if (!storyExport) continue;

    const story = typeof storyExport === 'function' ? storyExport.story ?? {} : storyExport;
    const storyName = typeof story.name === 'string' ? story.name : nameOfExport(exportName);
    if (storyName === displayName) return story;
  }
  return undefined;
}

/** The display name Storybook gives a story by its export name: `PrimaryButton` -> "Primary Button". */
function nameOfExport(exportName: string): string {
  return exportName
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/^[a-z]/, (letter) => letter.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}
