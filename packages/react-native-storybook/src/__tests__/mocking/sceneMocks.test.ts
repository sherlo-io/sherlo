// The mocks of a scene's `given` list, as the early-boot module hands them over (src/sceneBoot.ts
// calls activateSceneMocks with the list's parts in order and the scene file's path): the parts
// apply in list order, a later one winning; a mock a shared precondition brings and the scene never
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
import type { StoryMocks } from '../../mocking/mockDeclaration';
import { given, partsOf } from '../../preconditions';
import type { PreconditionParts } from '../../preconditions';
import { mockClock } from '../../mocking/clock';
import { mockRandom } from '../../mocking/random';

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

// A precondition as a shared file hands it over, and as the scene file lists it itself.
const shared = (mocks: StoryMocks): PreconditionParts => ({ mocks, origin: 'shared' });
const inScene = (mocks: StoryMocks): PreconditionParts => ({ mocks, origin: 'scene file' });

describe('mocks resolve in a scene file', () => {
  it('shared and scene-file preconditions merge, the later one winning on a clash', () => {
    bundlerStartedHaving(['a', 'b']);
    const a = createMockable('a', { label: 'real' });
    const b = createMockable('b', { label: 'real' });

    // A shared precondition writes its fakes as an object, the scene as a declaration.
    activateSceneMocks(
      SCENE_ID,
      [
        shared({ a: { label: 'file' }, b: { label: 'file' } }),
        inScene([declareImporting('../a', { label: 'scene' })]),
      ],
      SCENE_FILE
    );

    expect(a.label).toBe('scene');
    expect(b.label).toBe('file');
  });

  it("fakes from a scene's preconditions are applied in list order, later winning", () => {
    bundlerStartedHaving(['a']);
    const a = createMockable('a', { client: { get: () => 'real get', list: () => 'real list' } });

    // The scene file's own entry comes FIRST, so the shared one after it wins what both name.
    activateSceneMocks(
      SCENE_ID,
      [
        inScene([
          declareImporting('../a', {
            client: { get: () => 'first get', list: () => 'first list' },
          }),
        ]),
        shared([declareImporting('../a', { client: { list: () => 'second list' } })]),
      ],
      SCENE_FILE
    );

    expect(a.client.list()).toBe('second list');
    expect(a.client.get()).toBe('first get');
  });

  it("a scene's fake laid over the file's fake of one module keeps the file's other parts at boot", () => {
    bundlerStartedHaving(['a']);
    const a = createMockable('a', { client: { get: () => 'real get', list: () => 'real list' } });

    activateSceneMocks(
      SCENE_ID,
      [
        shared({ a: { client: { list: () => 'file list' }, label: 'file' } }),
        inScene([declareImporting('../a', { client: { get: () => 'scene get' } })]),
      ],
      SCENE_FILE
    );

    expect(a.client.get()).toBe('scene get');
    expect(a.client.list()).toBe('file list');
    expect(a.label).toBe('file');
  });

  it('a shared mock a scene never imports is no failure in a scene file', () => {
    bundlerStartedHaving(['shared', 'own']);
    createMockable('shared', { label: 'real' });
    const own = createMockable('own', { label: 'real' });

    activateSceneMocks(
      SCENE_ID,
      [shared({ shared: { label: 'file' } }), inScene({ own: { label: 'scene' } })],
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
      [shared({ shared: { label: 'file' } }), inScene({ own: { label: 'scene' } })],
      SCENE_FILE
    );
    markStorySettled();

    expect(mockFailureOf(other)).toMatchObject({
      name: 'MockedModuleError',
      message: 'the mock of ../own did not apply: nothing in the story imported it',
    });
  });

  it('an entry a shared file built is shared, wrapped in given or not, and a scene file entry is not', () => {
    const fake = declareImporting('../a', { label: 'fake' });
    const list = [
      { mocks: [fake] },
      { mocks: [fake] },
      [{ mocks: [fake] }, given({ mocks: [fake] })],
    ];

    const origins = partsOf(list, 'scene file', [false, true, [false, false]]).map(
      (part) => part.origin
    );

    expect(origins).toEqual(['scene file', 'shared', 'scene file', 'shared']);
  });

  it("a scene's clock and random numbers are fixed the moment its mocks go on, before the app's first module", () => {
    bundlerStartedHaving([]);
    const moment = '2020-01-02T03:04:05.000Z';

    // A loop the app starts on its first frame reads the clock straight after this call, with no
    // import awaited: a clock that only arrived later gave each capture its own angle.
    activateSceneMocks(SCENE_ID, [inScene([mockClock(moment), mockRandom(42)])], SCENE_FILE);
    const firstRandom = Math.random();

    expect(Date.now()).toBe(Date.parse(moment));
    activateSceneMocks(SCENE_ID, [inScene([mockClock(moment), mockRandom(42)])], SCENE_FILE);
    expect(Math.random()).toBe(firstRandom);
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
