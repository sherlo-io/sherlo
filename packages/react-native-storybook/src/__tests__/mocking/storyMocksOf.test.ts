/**
 * ONE STORY'S MOCKS, found through Storybook's own index with no sealed core (../../mocking/
 * storyMocksOf): the cases a person's Storybook meets that the activation tests do not.
 */
import { storyMocksOf } from '../../mocking/storyMocksOf';
import type { StorybookView } from '../../types';

afterEach(() => {
  delete (globalThis as { STORIES?: unknown }).STORIES;
});

/** Storybook's view holding `entries` in its index, and `projectMocks` in its composed preview. */
function storybookView(
  entries: Record<string, { name: string; importPath: string }>,
  projectMocks: Record<string, unknown> = {}
): StorybookView {
  return {
    _storyIndex: { entries },
    _preview: {
      storyStoreValue: { projectAnnotations: { parameters: { sherlo: { mocks: projectMocks } } } },
    },
  } as unknown as StorybookView;
}

/** One folder of story files, "./src", holding `filename` with `fileExports`. */
function storyFiles(filename: string, fileExports: Record<string, unknown>): void {
  const req = Object.assign((_filename: string) => fileExports, { keys: () => [filename] });
  (globalThis as { STORIES?: unknown }).STORIES = [{ directory: './src', req }];
}

describe('storyMocksOf finds the selected story through Storybook’s index', () => {
  it('finds the story of a file with no title of its own (auto-titled)', () => {
    storyFiles('./AutoTitled.stories.tsx', {
      default: {
        component: function AutoTitled() {
          return null;
        },
        parameters: { sherlo: { mocks: { 'pkg/b': { value: 'file-b' } } } },
      },
      Basic: { parameters: { sherlo: { mocks: { 'pkg/c': { value: 'story-c' } } } } },
    });
    const view = storybookView(
      { 'autotitled--basic': { name: 'Basic', importPath: './src/AutoTitled.stories.tsx' } },
      { 'pkg/a': { value: 'project-a' } }
    );

    expect(storyMocksOf(view, 'autotitled--basic')).toEqual({
      'pkg/a': { value: 'project-a' },
      'pkg/b': { value: 'file-b' },
      'pkg/c': { value: 'story-c' },
    });
  });

  it('reads a story written as a function from its `.story` settings', () => {
    const Primary = Object.assign(() => null, {
      story: { parameters: { sherlo: { mocks: { 'pkg/c': { value: 'story-c' } } } } },
    });
    storyFiles('./Button.stories.tsx', { default: { title: 'Components/Button' }, Primary });
    const view = storybookView({
      'components-button--primary': { name: 'Primary', importPath: './src/Button.stories.tsx' },
    });

    expect(storyMocksOf(view, 'components-button--primary')).toEqual({
      'pkg/c': { value: 'story-c' },
    });
  });

  it('gives only the project’s mocks to a story whose file is not among the story files', () => {
    storyFiles('./Other.stories.tsx', { default: { title: 'Other' }, Default: {} });
    const view = storybookView(
      { 'missing--default': { name: 'Default', importPath: './src/Missing.stories.tsx' } },
      { 'pkg/a': { value: 'project-a' } }
    );

    expect(storyMocksOf(view, 'missing--default')).toEqual({ 'pkg/a': { value: 'project-a' } });
  });

  it('gives no mocks to a story id Storybook’s index does not hold', () => {
    storyFiles('./Button.stories.tsx', { default: { title: 'Components/Button' }, Primary: {} });
    const view = storybookView({}, { 'pkg/a': { value: 'project-a' } });

    expect(storyMocksOf(view, 'components-button--primary')).toEqual({});
  });
});
