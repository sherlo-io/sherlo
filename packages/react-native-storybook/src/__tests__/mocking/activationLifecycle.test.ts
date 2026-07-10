vi.mock('../../SherloModule', () => ({
  default: {
    getMode: vi.fn().mockReturnValue('default'),
  },
}));

import createMockable from '../../mocking/createMockable';
import { activateStoryMocks } from '../../mocking';
import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';
import { enumerateStories } from '../../storybook/adapter';
import type { StorybookView } from '../../types';

afterEach(() => {
  clearMocks();
  __resetShimmedKeysForTests();
  vi.restoreAllMocks();
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

  it('does not warn when no mocks are declared at all', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    activateStoryMocks({});

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('load ordering: a key whose shim was evaluated via enumerateStories’ require.context walk is not a false positive', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fileExports = {
      default: { title: 'Components/Widget' },
      Default: { parameters: { sherlo: { mocks: { 'pkg/widget-dep': { value: 'mock' } } } } },
    };
    // Requiring a story file also evaluates its static imports, including any
    // generated shim reachable from it - mirror that by having req() itself run
    // createMockable, exactly like a shim module would when Metro's require.context
    // eagerly requires every story file.
    const req = Object.assign(
      (_filename: string) => {
        createMockable('pkg/widget-dep', {});
        return fileExports;
      },
      { keys: () => ['./Widget.stories.tsx'] }
    );
    (globalThis as any).STORIES = [{ directory: './src', req }];

    const view = { _storyIndex: { entries: {} } } as unknown as StorybookView;
    // enumerateStories eagerly requires every story file - by the time it returns,
    // every reachable shim (including pkg/widget-dep's) has already registered.
    const storyMetas = enumerateStories(view);

    activateStoryMocks(storyMetas[0].mocks);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
