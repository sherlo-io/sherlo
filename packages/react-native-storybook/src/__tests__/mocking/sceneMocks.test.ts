// The mocks of a scene file, as the early-boot module hands them over (src/sceneBoot.ts calls
// activateSceneMocks with the file's mocks, the scene's own, and the scene file's path): a scene's
// mocks are its file's plus its own, the scene winning; a mock the file shares and the scene never
// imports is no failure; and a second copy of the mock registry fails where it loads.

const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode, getConfigOrDefault: () => ({}) },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import createMockable from '../../mocking/createMockable';
import { mock } from '../../mocking/mockDeclaration';
import { mockFailureOf } from '../../mocking/activateStoryMocks';
import { clearMocks, markStorySettled, __resetShimmedKeysForTests } from '../../mocking/registry';
import { activateSceneMocks } from '../../getStorybook/storyMockActivation';

const SCENE_FILE = './src/chat.scenes.tsx';
const SCENE_ID = 'chat--conversation';

// A declaration as the bundler's transform of a scene file hands it over: the import as written
// rides as the third argument. Its import never settles, so only a mock the bundler's scan named
// can be in effect once activateSceneMocks returns.
const declare = mock as (...args: unknown[]) => ReturnType<typeof mock>;
const declareImporting = (specifier: string, definition: Record<string, unknown>) =>
  declare(() => new Promise(() => {}), definition, specifier);

function bundlerStartedHaving(modules: string[]): void {
  (globalThis as { __sherloDeclaredImports?: unknown }).__sherloDeclaredImports = {
    storyFiles: {
      [SCENE_FILE]: modules.map((key) => ({ specifier: `../${key}`, moduleKey: key })),
    },
    mockedModules: modules,
  };
}

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
});

afterEach(() => {
  clearMocks();
  delete (globalThis as { __sherloDeclaredImports?: unknown }).__sherloDeclaredImports;
  __resetShimmedKeysForTests();
  vi.clearAllMocks();
});

describe('mocks resolve in a scene file', () => {
  it('file-level and scene-level mocks merge, the scene winning on a clash', () => {
    bundlerStartedHaving(['a', 'b']);
    const a = createMockable('a', { label: 'real' });
    const b = createMockable('b', { label: 'real' });

    // The file writes its shared mocks as an object, the scene as a declaration.
    activateSceneMocks(
      SCENE_ID,
      { a: { label: 'file' }, b: { label: 'file' } },
      [declareImporting('../a', { label: 'scene' })],
      SCENE_FILE
    );

    expect(a.label).toBe('scene');
    expect(b.label).toBe('file');
  });

  it('a shared mock a scene never imports is no failure in a scene file', () => {
    bundlerStartedHaving(['shared', 'own']);
    createMockable('shared', { label: 'real' });
    const own = createMockable('own', { label: 'real' });

    activateSceneMocks(
      SCENE_ID,
      { shared: { label: 'file' } },
      { own: { label: 'scene' } },
      SCENE_FILE
    );
    expect(own.label).toBe('scene');

    expect(mockFailureOf(SCENE_ID)).toBeUndefined();
  });

  it('a mock the scene itself declares and never imports still fails the scene', () => {
    bundlerStartedHaving(['shared', 'own']);
    createMockable('shared', { label: 'real' });
    createMockable('own', { label: 'real' });

    // A scene keeps what its reads met across its activations, so this one is another scene.
    const other = 'chat--other';
    activateSceneMocks(
      other,
      { shared: { label: 'file' } },
      { own: { label: 'scene' } },
      SCENE_FILE
    );
    markStorySettled();

    expect(mockFailureOf(other)).toMatchObject({
      name: 'MockedModuleError',
      message: 'the mock of ../own did not apply: nothing in the story imported it',
    });
  });

  it('two copies of the mock registry fail loudly', async () => {
    // The copy the file loaded first has marked the app; another one loads after it.
    vi.resetModules();
    (globalThis as Record<string, unknown>).__sherloMockRegistryLoaded = true;

    await expect(import('../../mocking/registry')).rejects.toThrow(
      /mock registry twice.*unstable_enablePackageExports/
    );
  });
});
