// A mock that did not take effect fails its story, read the way the core reads what a story threw
// (readStoryError), once the story has rendered. The app is bundled under inlineRequires: a stand-in
// is evaluated by the first thing that requires it, which may be the story's own render.

const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode, getConfigOrDefault: () => ({}) },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import { createLazyMockable } from '../../mocking/createMockable';
import { mock } from '../../mocking/mockDeclaration';
import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';
import { activateMocksForStory } from '../../getStorybook/storyMockActivation';
import { __resetStorybookFactsForTests } from '../../getStorybook/storybookFacts';
import { clearStoryError, readStoryError } from '../../getStorybook/storyErrorRegistry';
import { startStorybookHolding } from './storybookHolding';

const STORY_FILE = './src/Chat.stories.tsx';
const STORY_ID = 'chat--default';

// What the bundler's scan saw when it started (metro/mockShims.js, writeDeclaredImportsPolyfill).
function bundlerStartedHaving(
  mockedModules: string[],
  storyFileImports: { specifier: string; moduleKey: string | null }[] = []
): void {
  (globalThis as { __sherloDeclaredImports?: unknown }).__sherloDeclaredImports = {
    storyFiles: { [STORY_FILE]: storyFileImports },
    mockedModules,
  };
}

// What the other stories in the same file mock: the bundler made each a stand-in when it started.
// Each stand-in is installed under the module's path in the app.
const OTHER_STORIES_IMPORTS = [
  'components/provider/Chat/directory',
  'components/provider/Chat/client',
  '../store/inbox.state',
  'components/provider/Chat/push',
].map((specifier) => ({ specifier, moduleKey: `/app/src/${specifier}.ts` }));
const OTHER_STORIES_STAND_INS = OTHER_STORIES_IMPORTS.map(({ moduleKey }) => moduleKey);

// `mock(importModule, definition)` as the bundler's transform hands it over once the story file
// is saved: with the module the import names, as the story wrote it
// (metro/mockSpecifierTransformer.js).
const mockAsTheBundlerMarksIt = mock as (
  importModule: () => Promise<unknown>,
  definition: Record<string, unknown>,
  specifierAsWritten: string
) => ReturnType<typeof mock>;

// A shim as inlineRequires leaves it: the stand-in is made by the first thing that requires it.
function inlineRequiredShim<T extends Record<string, unknown>>(
  key: string,
  loadReal: () => T
): () => T {
  let standIn: T | undefined;
  return () => (standIn ??= createLazyMockable(key, loadReal));
}

// The story, with `mocks` its own, under a preview file that declares `projectMocks`.
function storyWith(mocks: unknown, projectMocks?: unknown): string {
  startStorybookHolding(
    [
      {
        importPath: STORY_FILE,
        title: 'Chat',
        fileExports: {
          default: { title: 'Chat' },
          Default: { parameters: { sherlo: { mocks } } },
        },
        stories: [{ id: STORY_ID, name: 'Default' }],
      },
    ],
    projectMocks
  );
  return STORY_ID;
}

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
});

afterEach(() => {
  clearMocks();
  clearStoryError(STORY_ID);
  delete (globalThis as { __sherloDeclaredImports?: unknown }).__sherloDeclaredImports;
  __resetShimmedKeysForTests();
  __resetStorybookFactsForTests();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('a mock that reached nothing', () => {
  it('a mock that reached nothing fails its story with MockedModuleError naming the module', () => {
    bundlerStartedHaving(['pkg/never-used']);
    inlineRequiredShim('pkg/never-used', () => ({ label: 'real' }));
    const storyId = storyWith({ 'pkg/never-used': { label: 'mocked' } });

    activateMocksForStory(storyId);

    expect(readStoryError(storyId)).toEqual({
      name: 'MockedModuleError',
      message: 'the mock of pkg/never-used did not apply: nothing in the story imported it',
      stack: '',
      componentStack: '',
    });
  });

  it('a mock the bundler never saw says to restart the bundler', async () => {
    bundlerStartedHaving([], [{ specifier: 'components/provider/Chat/receipts', moduleKey: null }]);
    // The module was added after the bundler started: its import reaches the real module.
    const storyId = storyWith([
      mock(() => Promise.resolve({ markRead: () => 'real' }), { markRead: () => 'mocked' }),
    ]);

    await activateMocksForStory(storyId);

    expect(readStoryError(storyId)).toMatchObject({
      name: 'MockedModuleError',
      message:
        'the mock of components/provider/Chat/receipts did not apply: the bundler had not seen this module when it started - restart the bundler',
    });
  });

  it('a mock of a module added after the bundler started names that module alone', async () => {
    bundlerStartedHaving(OTHER_STORIES_STAND_INS, OTHER_STORIES_IMPORTS);
    // Both the module and its mock were added after the bundler started: the bundler's record of
    // the story file is older than the import, and the import reaches the real module.
    const storyId = storyWith([
      mockAsTheBundlerMarksIt(
        () => Promise.resolve({ receiptCount: () => 0 }),
        { receiptCount: () => 5 },
        'components/provider/Chat/receipts'
      ),
    ]);

    await activateMocksForStory(storyId);

    expect(readStoryError(storyId)).toMatchObject({
      name: 'MockedModuleError',
      message:
        'the mock of components/provider/Chat/receipts did not apply: the bundler had not seen this module when it started - restart the bundler',
    });
  });

  it("the other stories' imports in the same file are never named", async () => {
    bundlerStartedHaving(OTHER_STORIES_STAND_INS, OTHER_STORIES_IMPORTS);
    // A declaration the bundler did not mark names no module of its own.
    const storyId = storyWith([
      mock(() => Promise.resolve({ receiptCount: () => 0 }), { receiptCount: () => 5 }),
    ]);

    await activateMocksForStory(storyId);

    const { message } = readStoryError(storyId) ?? { message: '' };
    expect(message).toContain(
      'did not apply: the bundler had not seen this module when it started - restart the bundler'
    );
    for (const { specifier } of OTHER_STORIES_IMPORTS) expect(message).not.toContain(specifier);
  });

  it('a mocked module whose real import threw fails the story with MockedModuleError naming the module and the error it threw', () => {
    const pushModule = 'components/provider/Chat/push';
    bundlerStartedHaving([pushModule]);
    const push = inlineRequiredShim<Record<string, unknown>>(pushModule, () => {
      throw new Error('push native module is not linked');
    });
    const storyId = storyWith({ [pushModule]: { send: () => 'mocked' } });
    const expectedMessage = `${pushModule} could not be mocked: its real import threw "push native module is not linked"`;

    activateMocksForStory(storyId);
    // The story reads an export the mock does not answer, so the real module loads - and the app
    // catches what it throws.
    let thrown: unknown;
    try {
      push().register;
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ name: 'MockedModuleError', message: expectedMessage });
    expect(readStoryError(storyId)).toMatchObject({
      name: 'MockedModuleError',
      message: expectedMessage,
    });
  });

  it('a mock that applies under inlineRequires never fails its story', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bundlerStartedHaving(['pkg/chat']);
    const chat = inlineRequiredShim('pkg/chat', () => ({ label: 'real' }));
    const storyId = storyWith({ 'pkg/chat': { label: 'mocked' } });

    activateMocksForStory(storyId);
    // The stand-in is not made yet, and nothing says the mock will not apply.
    expect(warn).not.toHaveBeenCalled();
    // The story renders: its component requires the module for the first time, and reads it.
    const labelSeenWhenRendered = chat().label;

    expect(labelSeenWhenRendered).toBe('mocked');
    expect(readStoryError(storyId)).toBeUndefined();
  });

  it('capturing the same story twice in a row fails neither time when its mock applies', () => {
    bundlerStartedHaving(['pkg/chat']);
    const chat = inlineRequiredShim('pkg/chat', () => ({ label: 'real' }));
    const storyId = storyWith({ 'pkg/chat': { label: 'mocked' } });

    // The first capture: the story renders and reads its mock; the capture ends its mocks.
    activateMocksForStory(storyId);
    expect(chat().label).toBe('mocked');
    expect(readStoryError(storyId)).toBeUndefined();
    clearMocks();

    // The second capture selects the story already on screen: Storybook answers STORY_UNCHANGED
    // and does not render it again, so nothing reads the mock this time.
    activateMocksForStory(storyId);

    expect(readStoryError(storyId)).toBeUndefined();
  });
});

describe("a project's mock that reached nothing", () => {
  it('a project mock the story never reads leaves the story passing', () => {
    bundlerStartedHaving(['pkg/analytics']);
    inlineRequiredShim('pkg/analytics', () => ({ track: () => 'real' }));
    const storyId = storyWith({}, { 'pkg/analytics': { track: () => 'mocked' } });

    activateMocksForStory(storyId);

    expect(readStoryError(storyId)).toBeUndefined();
  });

  it('a project mock declared as a list that the story never reads leaves the story passing', async () => {
    bundlerStartedHaving(['pkg/analytics']);
    const analytics = inlineRequiredShim('pkg/analytics', () => ({ track: () => 'real' }));
    const storyId = storyWith(
      [],
      [mock(() => Promise.resolve(analytics()), { track: () => 'mocked' })]
    );

    await activateMocksForStory(storyId);

    expect(readStoryError(storyId)).toBeUndefined();
  });

  it('the same mock declared by the story fails it when nothing in the story imports it', () => {
    bundlerStartedHaving(['pkg/analytics']);
    inlineRequiredShim('pkg/analytics', () => ({ track: () => 'real' }));
    const storyId = storyWith(
      { 'pkg/analytics': { track: () => 'story' } },
      { 'pkg/analytics': { track: () => 'project' } }
    );

    activateMocksForStory(storyId);

    expect(readStoryError(storyId)).toMatchObject({
      name: 'MockedModuleError',
      message: 'the mock of pkg/analytics did not apply: nothing in the story imported it',
    });
  });

  it('a project mock the bundler never saw still fails the story saying to restart the bundler', () => {
    bundlerStartedHaving([]);
    const storyId = storyWith({}, { 'pkg/analytics': { track: () => 'mocked' } });

    activateMocksForStory(storyId);

    expect(readStoryError(storyId)).toMatchObject({
      name: 'MockedModuleError',
      message:
        'the mock of pkg/analytics did not apply: the bundler had not seen this module when it started - restart the bundler',
    });
  });
});

describe('mocks resolve in a scene file', () => {
  it.todo('a mock that missed an instance built at module load says so');
  it.todo("a library's private copy of a mocked package is named");
});
