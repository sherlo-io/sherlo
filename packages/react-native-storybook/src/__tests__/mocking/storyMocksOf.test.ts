/**
 * ONE STORY'S MOCKS, found through Storybook's own index with no sealed core (../../mocking/
 * storyMocksOf): the cases a person's Storybook meets that the activation tests do not.
 */
import { storyMocksOf } from '../../mocking/storyMocksOf';
import {
  __resetStorybookFactsForTests,
  recordWhatStartWasHanded,
} from '../../getStorybook/storybookFacts';
import { startStorybookHolding } from './storybookHolding';

afterEach(() => {
  __resetStorybookFactsForTests();
});

describe('storyMocksOf finds the selected story through Storybook’s index', () => {
  it('finds the story of a file with no title of its own (auto-titled)', () => {
    startStorybookHolding(
      [
        {
          importPath: './src/AutoTitled.stories.tsx',
          fileExports: {
            default: {
              component: function AutoTitled() {
                return null;
              },
              parameters: { sherlo: { mocks: { 'pkg/b': { value: 'file-b' } } } },
            },
            Basic: { parameters: { sherlo: { mocks: { 'pkg/c': { value: 'story-c' } } } } },
          },
          stories: [{ id: 'autotitled--basic', name: 'Basic' }],
        },
      ],
      { 'pkg/a': { value: 'project-a' } }
    );

    expect(storyMocksOf('autotitled--basic')).toEqual({
      'pkg/a': { value: 'project-a' },
      'pkg/b': { value: 'file-b' },
      'pkg/c': { value: 'story-c' },
    });
  });

  it('reads a story written as a function from its `.story` settings', () => {
    const Primary = Object.assign(() => null, {
      story: { parameters: { sherlo: { mocks: { 'pkg/c': { value: 'story-c' } } } } },
    });
    startStorybookHolding([
      {
        importPath: './src/Button.stories.tsx',
        fileExports: { default: { title: 'Components/Button' }, Primary },
        stories: [{ id: 'components-button--primary', name: 'Primary' }],
      },
    ]);

    expect(storyMocksOf('components-button--primary')).toEqual({
      'pkg/c': { value: 'story-c' },
    });
  });

  it('gives only the project’s mocks to a story whose file is not among the story files', () => {
    startStorybookHolding(
      [
        {
          importPath: './src/Missing.stories.tsx',
          stories: [{ id: 'missing--default', name: 'Default' }],
        },
      ],
      { 'pkg/a': { value: 'project-a' } }
    );

    expect(storyMocksOf('missing--default')).toEqual({ 'pkg/a': { value: 'project-a' } });
  });

  it('gives no mocks to a story id Storybook’s index does not hold', () => {
    startStorybookHolding(
      [
        {
          importPath: './src/Button.stories.tsx',
          fileExports: { default: { title: 'Components/Button' }, Primary: {} },
          stories: [],
        },
      ],
      { 'pkg/a': { value: 'project-a' } }
    );

    expect(storyMocksOf('components-button--primary')).toEqual({});
  });

  it('gives no mocks before Storybook has started', () => {
    expect(storyMocksOf('components-button--primary')).toEqual({});
  });

  it("reads the project's mocks from the preview annotations Storybook's start was handed, with no wait", () => {
    // What Storybook's generated requires file hands start(): one folder of story files, and the
    // project's preview as an ES module, its annotations on its default export.
    const storyFile = {
      default: { title: 'Mocking/Config' },
      Default: { parameters: { sherlo: { mocks: { 'pkg/story': { value: 'story' } } } } },
    };
    const req = Object.assign((_filename: string) => storyFile, {
      keys: () => ['./Config.stories.tsx'],
    });
    const preview = {
      default: { parameters: { sherlo: { mocks: { 'pkg/config': { flag: 'project' } } } } },
    };
    // Storybook's own prepareStories, as much of it as indexes this one story.
    const prepareStories = () => ({
      index: {
        entries: {
          'mocking-config--default': {
            id: 'mocking-config--default',
            title: 'Mocking/Config',
            name: 'Default',
            importPath: './src/Config.stories.tsx',
          },
        },
      },
    });

    recordWhatStartWasHanded(
      { storyEntries: [{ directory: './src', req }], annotations: [preview] },
      prepareStories
    );

    // Read at once, in the same turn start() runs - before any story renders.
    expect(storyMocksOf('mocking-config--default')).toEqual({
      'pkg/config': { flag: 'project' },
      'pkg/story': { value: 'story' },
    });
  });
});
