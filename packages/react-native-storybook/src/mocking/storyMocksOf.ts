/**
 * ONE STORY'S MOCKS, found the way Storybook finds the story: by its id in Storybook's own index.
 *
 * Everything here comes from what Storybook's public start() was handed, as Sherlo's start wrapper
 * recorded it (../getStorybook/storybookFacts): the index Storybook's exported prepareStories built,
 * every story file's exports, and the preview annotations. All of it is there before the first
 * story renders, so nothing here waits.
 *
 * Mocking stays open, so this works with no sealed core: a person's Storybook turns on the mocks
 * of the story they select in Expo Go too. The core lists every story for a run, with Sherlo's own
 * way of choosing ids; this reads only the one story Storybook already knows by id.
 *
 * The story's index entry names its file and its display name. The story is found among its file's
 * exports by that display name. Its mocks are the project's, the file's and its own, merged by the
 * precedence mergeStoryMocks keeps.
 */
import { readStorybookFacts } from '../getStorybook/storybookFacts';
import type { StorybookAnnotations } from '../sealedCore/seam';
import { mergeStoryMocks } from './mergeMocks';
import type { StoryMocks } from './mockDeclaration';

type StoryLevelParameters = { parameters?: Record<string, any> };

/**
 * The merged mocks of the story Storybook knows as `storyId`. A story its index does not hold has
 * none, and a story whose file is not among the story files has only the project's.
 */
export function storyMocksOf(storyId: string): StoryMocks {
  const facts = readStorybookFacts();
  const indexEntry = facts?.storyIndex[storyId];
  if (!facts || !indexEntry) return {};

  const projectMocks = projectMocksOf(facts.previewAnnotations);

  const fileExports = facts.storyFiles[indexEntry.importPath] as Record<string, any> | undefined;
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

/**
 * The project's mocks: those its preview file declares. When more than one preview annotation
 * declares mocks, the later one wins, as the later file wins when Storybook composes them.
 */
function projectMocksOf(previewAnnotations: StorybookAnnotations[]): StoryMocks {
  const declaredMocks = previewAnnotations
    .map((annotations) => annotations.parameters?.sherlo?.mocks as StoryMocks | undefined)
    .filter((mocks) => mocks !== undefined);
  return declaredMocks.pop() ?? {};
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
