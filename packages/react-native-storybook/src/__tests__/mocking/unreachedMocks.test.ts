// Spike resolve-like-metro: the moment the SDK can tell for certain that a story's mock reached
// nothing, with the app bundled under inlineRequires (a module is required where it is first used).

const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode, getConfigOrDefault: () => ({}) },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import createMockable from '../../mocking/createMockable';
import activateStoryMocks from '../../mocking/activateStoryMocks';
import { mock } from '../../mocking/mockDeclaration';
import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';
import { activateMocksForStory, storyFailureOf } from '../../getStorybook/storyMockActivation';
import { __resetStorybookFactsForTests } from '../../getStorybook/storybookFacts';
import { clearStoryError, recordStoryError } from '../../getStorybook/storyErrorRegistry';
import { startStorybookHolding } from './storybookHolding';

// A shim as inlineRequires leaves it: the module is evaluated by the first thing that requires it.
function inlineRequiredShim<T extends object>(key: string, real: T): () => T {
  let shim: T | undefined;
  return () => (shim ??= createMockable(key, real));
}

function storyWith(mocks: unknown): string {
  startStorybookHolding([
    {
      importPath: './src/Chat.stories.tsx',
      title: 'Chat',
      fileExports: {
        default: { title: 'Chat' },
        Default: { parameters: { sherlo: { mocks } } },
      },
      stories: [{ id: 'chat--default', name: 'Default' }],
    },
  ]);
  return 'chat--default';
}

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
});

afterEach(() => {
  clearMocks();
  __resetShimmedKeysForTests();
  __resetStorybookFactsForTests();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('a mock that reached nothing, under inlineRequires', () => {
  it('TODAY: the registry check at activation warns about a mock whose shim is merely not required yet', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chat = inlineRequiredShim('pkg/chat', { label: 'real' });

    // The component under test requires the module only as it renders, after the mocks install.
    activateStoryMocks({ 'pkg/chat': { label: 'mocked' } });
    const labelSeenWhenRendered = chat().label;

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('mock declared but unshimmed');
    // ...yet the mock applied: the warning was false.
    expect(labelSeenWhenRendered).toBe('mocked');
  });

  it('installing a story prints no warning for a shim that is only required later, and the story does not fail once it used the mock', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chat = inlineRequiredShim('pkg/chat', { label: 'real' });
    const storyId = storyWith({ 'pkg/chat': { label: 'mocked' } });

    activateMocksForStory(storyId);
    expect(warn).not.toHaveBeenCalled();

    // The story renders; the component requires the module and reads it.
    expect(chat().label).toBe('mocked');

    expect(storyFailureOf(storyId)).toBeUndefined();
  });

  it('a story that rendered without reading the mocked module fails, naming the module', () => {
    inlineRequiredShim('pkg/never-used', { label: 'real' });
    const storyId = storyWith({ 'pkg/never-used': { label: 'mocked' } });

    activateMocksForStory(storyId);
    const failure = storyFailureOf(storyId);

    expect(failure?.name).toBe('UnreachedMockError');
    expect(failure?.message).toContain('"pkg/never-used"');
  });

  it('a shim an earlier story evaluated does not count as this story reaching its mock', () => {
    const chat = inlineRequiredShim('pkg/chat', { label: 'real' });
    chat();
    const storyId = storyWith({ 'pkg/chat': { label: 'mocked' } });

    activateMocksForStory(storyId);

    // The module is evaluated and registered, but this story's render never read it.
    expect(storyFailureOf(storyId)?.message).toContain('"pkg/chat"');
    expect(chat().label).toBe('mocked');
    expect(storyFailureOf(storyId)).toBeUndefined();
  });

  it('names only the mock that was not reached when the story reached another', () => {
    const used = inlineRequiredShim('pkg/used', { a: 1 });
    const storyId = storyWith({ 'pkg/used': { a: 2 }, 'pkg/skipped': { b: 2 } });

    activateMocksForStory(storyId);
    expect(used().a).toBe(2);
    const failure = storyFailureOf(storyId);

    expect(failure?.message).toContain('"pkg/skipped"');
    expect(failure?.message).not.toContain('"pkg/used"');
  });

  it('a declared import is awaited and its stand-in asked before the story renders; reading it afterwards still counts as reaching it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chat = inlineRequiredShim('pkg/chat', { label: 'real' });
    const storyId = storyWith([mock(() => Promise.resolve(chat()), { label: 'mocked' })]);

    await activateMocksForStory(storyId);

    // The awaited import evaluated the shim and the shim named itself: nothing to warn about, and
    // the declaration asking its name is not a use.
    expect(warn).not.toHaveBeenCalled();
    expect(storyFailureOf(storyId)?.message).toContain('"pkg/chat"');
    expect(chat().label).toBe('mocked');
    expect(storyFailureOf(storyId)).toBeUndefined();
  });

  it('a declared import that settled on a module no stand-in made warns at activation, naming what it declared', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storyId = storyWith([mock(() => Promise.resolve({ whoAmI: () => 'real' }), { whoAmI: () => 'mocked' })]);

    await activateMocksForStory(storyId);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('declaring whoAmI');
  });

  it('a story that threw reports its own error, not the unreached mock', () => {
    inlineRequiredShim('pkg/never-used', {});
    const storyId = storyWith({ 'pkg/never-used': {} });
    activateMocksForStory(storyId);

    recordStoryError(storyId, { name: 'Boom', message: 'threw', stack: '', componentStack: '' });

    expect(storyFailureOf(storyId)?.name).toBe('Boom');
    clearStoryError(storyId);
  });
});
