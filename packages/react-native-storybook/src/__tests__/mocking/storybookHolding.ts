/**
 * A Storybook that has started, as the mocking tests need one: the facts Sherlo's start wrapper
 * records of what Storybook's start() was handed (../../getStorybook/storybookFacts).
 */
import { recordStorybookFacts } from '../../getStorybook/storybookFacts';

/** One story file of the Storybook, at `importPath`, with its exports and the stories it shows. */
export type StoryFileOfTheStorybook = {
  importPath: string;
  /** The file's exports, or nothing for a file the index names that is not among the story files. */
  fileExports?: Record<string, unknown>;
  /** Each story Storybook's index holds for the file: its id, and the name it shows it under. */
  stories: { id: string; name: string }[];
  /** The file's title, as the index names it. */
  title?: string;
};

/**
 * Record a Storybook started with `files`, and a preview file that declares `projectMocks` as the
 * project's mocks (or no preview, when it declares none).
 */
export function startStorybookHolding(
  files: StoryFileOfTheStorybook[],
  projectMocks?: unknown
): void {
  const storyIndex = Object.fromEntries(
    files.flatMap(({ importPath, stories, title = '' }) =>
      stories.map(({ id, name }) => [id, { id, name, title, importPath }])
    )
  );
  const storyFiles = Object.fromEntries(
    files
      .filter(({ fileExports }) => fileExports !== undefined)
      .map(({ importPath, fileExports }) => [importPath, fileExports])
  );
  recordStorybookFacts({
    storyIndex,
    storyFiles: storyFiles as never,
    previewAnnotations:
      projectMocks === undefined ? [] : [{ parameters: { sherlo: { mocks: projectMocks } } }],
  });
}
