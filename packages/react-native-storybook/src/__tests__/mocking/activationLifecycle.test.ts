// 'testing' so the SHERLO-1765 B2 activation mode guard lets these mocks install
// (the guard no-ops in 'default'; activation lifecycle is only exercised under test).
vi.mock('../../SherloModule', () => ({
  default: {
    getMode: vi.fn().mockReturnValue('testing'),
  },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import createMockable from '../../mocking/createMockable';
import { activateStoryMocks } from '../../mocking';
import { UNSHIMMED_KEYS_LOG } from '../../mocking/activateStoryMocks';
import RunnerBridge from '../../helpers/RunnerBridge';
import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';
import { mock } from '../../mocking/mockDeclaration';
import { activateMocksForStory } from '../../getStorybook/storyMockActivation';
import { __resetStorybookFactsForTests } from '../../getStorybook/storybookFacts';
import { startStorybookHolding } from './storybookHolding';

afterEach(() => {
  clearMocks();
  __resetShimmedKeysForTests();
  __resetStorybookFactsForTests();
  delete (globalThis as any).nativeLoggingHook;
  vi.restoreAllMocks();
  // RunnerBridge.log is a module mock (not a spy), so restoreAllMocks does not
  // clear its call history - clear it explicitly so per-test call assertions
  // (e.g. not.toHaveBeenCalled) do not see calls leaked from earlier tests.
  vi.clearAllMocks();
  delete (globalThis as any).STORIES;
});

describe('activateStoryMocks - activation lifecycle (IS-02, IS-07)', () => {
  it('IS-02: activating a second story replaces the first story’s mock for the same module - no bleed', () => {
    const realModule = { greet: () => 'real' };
    const mockable = createMockable('pkg/greet', realModule);

    activateStoryMocks({ 'pkg/greet': { greet: () => 'story-1' } });
    expect(mockable.greet()).toBe('story-1');

    activateStoryMocks({ 'pkg/greet': { greet: () => 'story-2' } });
    expect(mockable.greet()).toBe('story-2');
  });

  it('IS-02: a module mocked in story 1 but left untouched by story 2 falls back to real - not story 1’s mock', () => {
    const realModule = { region: 'real-region' };
    const mockable = createMockable('pkg/region', realModule);

    activateStoryMocks({ 'pkg/region': { region: 'story-1-region' } });
    expect(mockable.region).toBe('story-1-region');

    // Story 2's mock set doesn't mention 'pkg/region' at all.
    activateStoryMocks({ 'pkg/other': { value: 'story-2' } });
    expect(mockable.region).toBe('real-region');
  });

  it('IS-07: after the run ends (clearMocks) every mocked module passes through to real', () => {
    const realModule = { greet: () => 'real' };
    const mockable = createMockable('pkg/greet-2', realModule);

    activateStoryMocks({ 'pkg/greet-2': { greet: () => 'mocked' } });
    expect(mockable.greet()).toBe('mocked');

    clearMocks();

    expect(mockable.greet()).toBe('real');
  });

  it("a library mock whose shim arrives in a lazy bundle is active when the story's component first calls the library", async () => {
    // A small fake of a phone storage library, behind its generated shim.
    const storage = createMockable('fake-storage', {
      default: { getItem: async (_key: string): Promise<string | null> => null },
    });

    // On a dev server every import() of the shim fetches the shim's own lazy bundle. Each fetch
    // here is answered when the test says.
    const lazyBundles: Array<() => void> = [];
    const fetchShimBundle = () =>
      new Promise<typeof storage>((resolve) => lazyBundles.push(() => resolve(storage)));

    const storyId = 'mocking--library';
    startStorybookHolding([
      {
        importPath: './src/Mocking.stories.tsx',
        title: 'Mocking',
        fileExports: {
          default: { title: 'Mocking' },
          Library: {
            parameters: {
              sherlo: {
                mocks: [
                  mock(fetchShimBundle, (original) => ({
                    default: { ...original.default, getItem: async () => 'Hello from the mock' },
                  })),
                ],
              },
            },
          },
        },
        stories: [{ id: storyId, name: 'Library' }],
      },
    ]);

    // Storybook's loader starts installing the story's mocks, and a second install of the same
    // story follows before the first bundle is in: on the phone the capture turns the story's
    // mocks on as well.
    const loaderInstall = activateMocksForStory(storyId);
    activateMocksForStory(storyId);

    // The loader's bundle arrives first, the second one a moment later.
    lazyBundles[0]();
    setTimeout(() => lazyBundles[1](), 10);

    // Storybook renders the story once the loader's promise settles, and the component calls the
    // library as it mounts.
    await loaderInstall;
    expect(await storage.default.getItem('greeting')).toBe('Hello from the mock');
  });
});

describe('activateStoryMocks - declared-but-unshimmed tripwire (FG-03)', () => {
  it('warns exactly once, naming the key and both fixes, when a declared mock has no shim', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    activateStoryMocks({ 'pkg/never-shimmed': { value: 1 } });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('pkg/never-shimmed');
    expect(message.toLowerCase()).toContain('restart');
    expect(message).toContain('mockModules');
  });

  it('names every unshimmed key in a single warning, not one warning per key', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    activateStoryMocks({ 'pkg/missing-a': {}, 'pkg/missing-b': {} });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('pkg/missing-a');
    expect(message).toContain('pkg/missing-b');
  });

  it('does not warn about a key that IS shimmed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createMockable('pkg/shimmed-ok', {});

    activateStoryMocks({ 'pkg/shimmed-ok': { value: 1 } });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('in a mixed activation, only names the unshimmed key - not the correctly-shimmed one', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createMockable('pkg/shimmed', {});

    activateStoryMocks({ 'pkg/shimmed': {}, 'pkg/not-shimmed': {} });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('"pkg/not-shimmed"');
    expect(message).not.toContain('"pkg/shimmed"');
  });

  it('routes the warning to RunnerBridge.log (so it survives console.warn silencing in capture builds)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    activateStoryMocks({ 'pkg/unshimmed-logged': { value: 1 } });

    expect(RunnerBridge.log).toHaveBeenCalledWith(UNSHIMMED_KEYS_LOG, {
      keys: ['pkg/unshimmed-logged'],
    });
  });

  it("a declared mock that reached no shim is printed on the phone's console, naming its key", () => {
    // In testing mode Sherlo silences console.warn, so a phone prints the warning only through
    // React Native's own native log, the one that lands in logcat as ReactNativeJS.
    vi.spyOn(console, 'warn').mockImplementation(() => null);
    const nativeLog = vi.fn();
    (globalThis as any).nativeLoggingHook = nativeLog;

    activateStoryMocks({ 'pkg/reached-no-shim': { value: 1 } });

    expect(nativeLog).toHaveBeenCalledTimes(1);
    const [message, level] = nativeLog.mock.calls[0];
    expect(message).toContain('"pkg/reached-no-shim"');
    expect(level).toBe(2);
  });

  it('does not touch RunnerBridge.log when every declared key is shimmed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    createMockable('pkg/shimmed-no-log', {});

    activateStoryMocks({ 'pkg/shimmed-no-log': { value: 1 } });

    expect(RunnerBridge.log).not.toHaveBeenCalled();
  });

  it('does not warn when no mocks are declared at all', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    activateStoryMocks({});

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("load ordering: a key whose shim was evaluated by the core's walk of every story file is not a false positive", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // In a test run the sealed core lists the stories by requiring every story file through
    // Metro's require.context before any activation, and requiring a file also evaluates its
    // static imports, including any generated shim reachable from it. Activation itself reads only
    // the selected story (storyMocksOf), so with no such walk a shim reached only through another
    // story's file may not have evaluated yet (see the note on warnUnshimmedKeys in
    // activateStoryMocks.ts). The walk is the core's; here it is stood in for by requiring the
    // story file, which runs createMockable exactly like the shim module would.
    const requireStoryFile = (_filename: string) => {
      createMockable('pkg/widget-dep', {});
      return {
        default: { title: 'Components/Widget' },
        Default: { parameters: { sherlo: { mocks: { 'pkg/widget-dep': { value: 'mock' } } } } },
      };
    };
    const storyFile = requireStoryFile('./Widget.stories.tsx');

    activateStoryMocks(storyFile.Default.parameters.sherlo.mocks);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
