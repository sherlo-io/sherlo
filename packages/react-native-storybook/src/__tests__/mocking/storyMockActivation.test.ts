const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: {
    getMode: mockGetMode,
    getConfigOrDefault: () => ({}),
  },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

// No React is installed beside this package. Rendering here is calling each component at once with
// its props, which is enough to run a story's render inside Sherlo's decorator and see what it read.
const { renderAtOnce } = vi.hoisted(() => ({
  renderAtOnce: (type: unknown, props: Record<string, unknown>) =>
    typeof type === 'function' ? type(props) : null,
}));
vi.mock('react', () => ({ default: {} }));
vi.mock('react/jsx-dev-runtime', () => ({ jsxDEV: renderAtOnce, Fragment: Symbol('Fragment') }));
vi.mock('react/jsx-runtime', () => ({ jsx: renderAtOnce, jsxs: renderAtOnce, Fragment: Symbol() }));
vi.mock('../../getStorybook/components/SherloStoryErrorBoundary', () => ({
  default: ({ children }: { children: unknown }) => children,
}));
vi.mock('../../storyOfTheApp', () => ({
  StoryOfTheApp: ({ children }: { children: unknown }) => children,
}));

import createMockable from '../../mocking/createMockable';
import { mock } from '../../mocking/mockDeclaration';
import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';
import { activateMocksForStory } from '../../getStorybook/storyMockActivation';
import {
  __resetStorybookFactsForTests,
  recordWhatStartWasHanded,
} from '../../getStorybook/storybookFacts';
import { keepStartedStorybook } from '../../getStorybook/storybookReads';
import sherloAnnotation from '../../getStorybook/sherloAnnotation';
import { loadStartWrapper, storyFolder, writtenStartWrapper } from '../sherlosStartWrapper';
import { startStorybookHolding } from './storybookHolding';
import { storyAsStorybookComposesIt, storyComposedFrom } from './storyComposedByStorybook';

// SHERLO-1749: global-level mocks (declared in .rnstorybook/preview.ts) used to be read from
// Storybook's preview, which composes them ASYNCHRONOUSLY - so on a fresh boot they resolved to {}
// while meta/story mocks worked, and a second pass had to fold them in once the preview was ready.
// They are now read from the preview annotations Storybook's start() was handed, which are there
// before any story renders, so every level applies on the first pass.

/**
 * Start a Storybook holding one titled story, "Default", whose file declares `storyMocks` for it
 * and whose preview declares `globalMocks`. Answers the story's id.
 */
function startStorybookWithOneStory({
  storyMocks,
  globalMocks,
  title = 'Mocking/Config',
}: {
  storyMocks?: unknown;
  globalMocks?: unknown;
  title?: string;
}): string {
  // toId(title, 'Default') - kebab-cases the title the same way Storybook does for
  // the simple ASCII titles these tests use.
  const storyId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}--default`;
  startStorybookHolding(
    [
      {
        importPath: './src/Config.stories.tsx',
        title,
        fileExports: {
          default: { title },
          Default: storyMocks ? { parameters: { sherlo: { mocks: storyMocks } } } : {},
        },
        stories: [{ id: storyId, name: 'Default' }],
      },
    ],
    globalMocks
  );
  return storyId;
}

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
});

afterEach(() => {
  clearMocks();
  __resetShimmedKeysForTests();
  __resetStorybookFactsForTests();
  vi.clearAllMocks();
});

describe('activateMocksForStory - global mocks need no wait for the preview (SHERLO-1749)', () => {
  it('applies a global-level mock on the first pass (release-capture regression)', () => {
    const mockable = createMockable('pkg/config', { flag: 'real' });
    const storyId = startStorybookWithOneStory({
      globalMocks: { 'pkg/config': { flag: 'global' } },
    });

    activateMocksForStory(storyId);

    // No preview to wait for: the project's mocks came with what start() was handed.
    expect(mockable.flag).toBe('global');
  });

  it('applies meta/story-level mocks synchronously', () => {
    const mockable = createMockable('pkg/switch', { label: 'real' });
    const storyId = startStorybookWithOneStory({
      storyMocks: { 'pkg/switch': { label: 'story' } },
      globalMocks: { 'pkg/other': {} },
    });

    activateMocksForStory(storyId);

    expect(mockable.label).toBe('story');
  });

  it('keeps story-level precedence over global-level for the same key', () => {
    const mockable = createMockable('pkg/switch', { label: 'real' });
    const storyId = startStorybookWithOneStory({
      storyMocks: { 'pkg/switch': { label: 'story' } },
      globalMocks: { 'pkg/switch': { label: 'global' } },
    });

    activateMocksForStory(storyId);

    expect(mockable.label).toBe('story');
  });

  it('is a no-op when storyId is undefined', () => {
    const mockable = createMockable('pkg/config', { flag: 'real' });
    startStorybookWithOneStory({ globalMocks: { 'pkg/config': { flag: 'global' } } });

    activateMocksForStory(undefined);

    expect(mockable.flag).toBe('real');
  });
});

describe('activateMocksForStory - stale install guard (SHERLO-1765 B3)', () => {
  it('a superseded activation’s late import does not install its mocks', async () => {
    const mockable = createMockable('pkg/stale', { v: 'real' }) as { v: string };

    // Story A declares its mock by an import that has not resolved yet.
    let finishAsImport: (module: unknown) => void = () => {};
    const asImport = new Promise((resolve) => {
      finishAsImport = resolve;
    });
    const a = startStorybookWithOneStory({
      title: 'Mocking/Stale-A',
      storyMocks: [mock(() => asImport as never, { v: 'A' } as never)],
    });
    const installingA = activateMocksForStory(a);
    expect(mockable.v).toBe('real');

    // Before A's import resolves, story B supersedes it with a mock that applies at once - this is
    // the current, on-screen story.
    const b = startStorybookWithOneStory({
      title: 'Mocking/Stale-B',
      storyMocks: { 'pkg/stale': { v: 'B' } },
    });
    activateMocksForStory(b);
    expect(mockable.v).toBe('B');

    // A's import finally resolves. Its install must bail (A was superseded); if it installed it
    // would clobber B (wrong-screenshot risk).
    finishAsImport(mockable);
    await installingA;

    expect(mockable.v).toBe('B');
  });
});

describe("Sherlo's Storybook loader", () => {
  it("one Storybook loader installs a story's mocks before it renders, in testing mode and Storybook mode alike", async () => {
    for (const mode of ['testing', 'storybook']) {
      mockGetMode.mockReturnValue(mode);
      const mockable = createMockable(`pkg/${mode}`, { label: 'real' });

      // A mock declared by an import that resolves only later: the one sort of mock that is not
      // in at once, and so the one a story could render before.
      let finishImport: (module: unknown) => void = () => {};
      const lateImport = new Promise((resolve) => {
        finishImport = resolve;
      });
      const storyId = startStorybookWithOneStory({
        storyMocks: [mock(() => lateImport as never, { label: 'mocked' } as never)],
      });
      const labelsRendered: string[] = [];
      const story = storyAsStorybookComposesIt(
        'Mocking/Config',
        'Default',
        mockable,
        labelsRendered
      );
      expect(story.id).toBe(storyId);

      const loading = story.load();
      expect(mockable.label).toBe('real');

      finishImport(mockable);
      await loading;
      // Storybook renders a story only once its loaders are done.
      story();

      expect(labelsRendered).toEqual(['mocked']);
      clearMocks();
    }
  });

  it('the first story Storybook picks by itself has its mocks installed before it renders', async () => {
    mockGetMode.mockReturnValue('storybook');
    const mockable = createMockable('pkg/first', { label: 'real' });
    startStorybookHolding([
      {
        importPath: './src/First.stories.tsx',
        title: 'Mocking/First',
        fileExports: {
          default: { title: 'Mocking/First' },
          Opening: { parameters: { sherlo: { mocks: { 'pkg/first': { label: 'opening' } } } } },
        },
        stories: [{ id: 'mocking-first--opening', name: 'Opening' }],
      },
    ]);

    // Nobody named a story: no initial selection, no story-changed event. Storybook loads the one
    // it picks, and its loaders run with that story's own context, before it renders it.
    const labelsRendered: string[] = [];
    const story = storyAsStorybookComposesIt('Mocking/First', 'Opening', mockable, labelsRendered);
    await story.load();
    story();

    expect(labelsRendered).toEqual(['opening']);
  });

  it("a story's mocks still apply after a hot update", async () => {
    mockGetMode.mockReturnValue('storybook');
    const mockable = createMockable('pkg/edited', { label: 'real' });
    const editedFile = (label: string) => ({
      default: { title: 'Mocking/Edited' },
      Default: { parameters: { sherlo: { mocks: { 'pkg/edited': { label } } } } },
    });

    // The project's Storybook, started and then updated through Sherlo's own start wrapper: it
    // keeps the annotations it was last handed, which are all it loads and renders a story with.
    let annotationsStorybookHas: unknown[] = [];
    const storybook = {
      start: ({ annotations }: { annotations: unknown[] }) => {
        annotationsStorybookHas = annotations;
        return { getStorybookUI: () => null };
      },
      updateView: (_view: unknown, annotations: unknown[]) => {
        annotationsStorybookHas = annotations;
      },
      prepareStories: () => ({
        index: {
          entries: {
            'mocking-edited--default': {
              id: 'mocking-edited--default',
              title: 'Mocking/Edited',
              name: 'Default',
              importPath: './src/Edited.stories.tsx',
            },
          },
        },
      }),
    };
    const wrapper = loadStartWrapper(writtenStartWrapper(), {
      '@storybook/react-native': storybook,
      '@sherlo/react-native-storybook/dist/getStorybook/index.js': {
        default: () => null,
        sherloAnnotation,
        recordWhatStartWasHanded,
        keepStartedStorybook,
      },
      '@sherlo/react-native-storybook/dist/addStorybookToDevMenu.js': { default: () => {} },
    });
    const view = wrapper.exports.start({
      storyEntries: [storyFolder('./src', { './Edited.stories.tsx': editedFile('before') })],
      annotations: [],
    });

    // The developer edits the story's mocks, and the generated requires file updates the view.
    wrapper.exports.updateView(
      view,
      [],
      [storyFolder('./src', { './Edited.stories.tsx': editedFile('after') })]
    );

    const labelsRendered: string[] = [];
    const story = storyComposedFrom(
      annotationsStorybookHas,
      'Mocking/Edited',
      'Default',
      mockable,
      labelsRendered
    );
    await story.load();
    story();

    expect(labelsRendered).toEqual(['after']);
  });
});
