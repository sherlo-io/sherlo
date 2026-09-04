vi.mock('../../SherloModule', () => ({
  default: {
    getMode: vi.fn().mockReturnValue('testing'),
  },
}));

import createMockable from '../../mocking/createMockable';
import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';
import { activateMocksForStory } from '../../getStorybook/storyMockActivation';
import type { StorybookView } from '../../types';

// SHERLO-1749: global-level mocks (declared in .rnstorybook/preview.ts) live only in
// view._preview.storyStoreValue.projectAnnotations, which Storybook composes
// ASYNCHRONOUSLY during preview init. On a fresh boot (the single-story release capture,
// or an interactive session that lands directly on a mocked story) the activation used
// to read those params synchronously - before the preview was ready - so global mocks
// resolved to {} while meta/story mocks (from the synchronously-loaded story exports)
// worked. activateMocksForStory now applies meta/story mocks immediately and re-applies
// once view._preview.ready() resolves, folding in global mocks before the story renders.

// Builds a STORIES require.context with a single titled story plus a controllable
// preview whose project (global) params only become readable once it is "ready" -
// exactly Storybook's async preview-init timing.
function setupView({
  storyMocks,
  globalMocks,
  readyUpfront,
  title = 'Mocking/Config',
}: {
  storyMocks?: Record<string, unknown>;
  globalMocks?: Record<string, unknown>;
  readyUpfront?: boolean;
  title?: string;
}): { view: StorybookView; storyId: string; becomeReady: () => Promise<void> } {
  const fileExports = {
    default: { title },
    Default: storyMocks ? { parameters: { sherlo: { mocks: storyMocks } } } : {},
  };
  const req = Object.assign((_filename: string) => fileExports, {
    keys: () => ['./Config.stories.tsx'],
  });
  (globalThis as any).STORIES = [{ directory: './src', req }];

  // The composed project annotations Storybook makes available only once ready.
  const projectAnnotations = {
    parameters: globalMocks ? { sherlo: { mocks: globalMocks } } : {},
  };

  let resolveReady: () => void = () => {};
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const preview: {
    storyStoreValue: unknown;
    ready: () => Promise<void>;
  } = {
    // Populated once the preview is ready - undefined before then (fresh boot).
    storyStoreValue: readyUpfront ? { projectAnnotations } : undefined,
    ready: () => readyPromise,
  };
  if (readyUpfront) resolveReady();

  const view = {
    _storyIndex: { entries: {} },
    _preview: preview,
  } as unknown as StorybookView;

  const becomeReady = async (): Promise<void> => {
    preview.storyStoreValue = { projectAnnotations };
    resolveReady();
    await readyPromise; // flush the ready() .then re-apply before the test asserts
  };

  // toId(title, 'Default') - kebab-cases the title the same way Storybook does for
  // the simple ASCII titles these tests use.
  const storyId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}--default`;
  return { view, storyId, becomeReady };
}

afterEach(() => {
  clearMocks();
  __resetShimmedKeysForTests();
  vi.clearAllMocks();
  delete (globalThis as any).STORIES;
});

describe('activateMocksForStory - global mocks are robust to preview readiness (SHERLO-1749)', () => {
  it('folds in a global-level mock once the preview becomes ready (release-capture regression)', async () => {
    const mockable = createMockable('pkg/config', { flag: 'real' });
    const { view, storyId, becomeReady } = setupView({
      globalMocks: { 'pkg/config': { flag: 'global' } },
    });

    activateMocksForStory(view, storyId);

    // Preview not ready yet: project params are unreadable, so the global mock has NOT
    // applied - this is the exact state that used to leak into the story render (CP-01
    // reading `real`).
    expect(mockable.flag).toBe('real');

    await becomeReady();

    // Once the preview composes project annotations, the re-apply folds the global mock in.
    expect(mockable.flag).toBe('global');
  });

  it('applies meta/story-level mocks synchronously, before the preview is ready', () => {
    const mockable = createMockable('pkg/switch', { label: 'real' });
    const { view, storyId } = setupView({
      storyMocks: { 'pkg/switch': { label: 'story' } },
      globalMocks: { 'pkg/other': {} },
    });

    activateMocksForStory(view, storyId);

    // No await: story-level mocks come from the synchronously-loaded exports and must
    // apply on the first pass, independent of preview readiness.
    expect(mockable.label).toBe('story');
  });

  it('keeps story-level precedence over global-level for the same key after the re-apply', async () => {
    const mockable = createMockable('pkg/switch', { label: 'real' });
    const { view, storyId, becomeReady } = setupView({
      storyMocks: { 'pkg/switch': { label: 'story' } },
      globalMocks: { 'pkg/switch': { label: 'global' } },
    });

    activateMocksForStory(view, storyId);
    expect(mockable.label).toBe('story');

    await becomeReady();

    // The ready re-apply must not let global clobber the story-level value: story > global.
    expect(mockable.label).toBe('story');
  });

  it('applies global-level mocks on the first pass when the preview is already ready', () => {
    // The interactive storyChanged case (and any post-ready activation): storyStoreValue
    // already exists, so no wait is scheduled and the global mock applies immediately.
    const mockable = createMockable('pkg/config', { flag: 'real' });
    const { view, storyId } = setupView({
      globalMocks: { 'pkg/config': { flag: 'global' } },
      readyUpfront: true,
    });

    activateMocksForStory(view, storyId);

    expect(mockable.flag).toBe('global');
  });

  it('is a no-op when storyId is undefined', () => {
    const mockable = createMockable('pkg/config', { flag: 'real' });
    const { view } = setupView({ globalMocks: { 'pkg/config': { flag: 'global' } } });

    activateMocksForStory(view, undefined);

    expect(mockable.flag).toBe('real');
  });
});

describe('activateMocksForStory - stale re-apply guard (SHERLO-1765 B3)', () => {
  it('a superseded activation’s late ready() continuation does not install its mocks', async () => {
    const mockable = createMockable('pkg/stale', { v: 'real' }) as { v: string };

    // Story A boots with a GLOBAL-level mock, preview NOT ready yet. Its meta/story pass sees
    // no readable global params, so it schedules a ready() re-apply that would fold in v:'A'.
    const a = setupView({
      title: 'Mocking/Stale-A',
      globalMocks: { 'pkg/stale': { v: 'A' } },
    });
    activateMocksForStory(a.view, a.storyId);
    expect(mockable.v).toBe('real'); // A's global not applied yet (preview not ready)

    // Before A's preview resolves, story B supersedes it with a STORY-level mock that applies
    // synchronously - this is the current, on-screen story.
    const b = setupView({
      title: 'Mocking/Stale-B',
      storyMocks: { 'pkg/stale': { v: 'B' } },
    });
    activateMocksForStory(b.view, b.storyId);
    expect(mockable.v).toBe('B'); // B is now active

    // A's preview finally becomes ready. Its deferred continuation must bail (A was superseded);
    // if it re-applied it would clobber B (wrong-screenshot risk) or, worse, reset to real.
    await a.becomeReady();

    expect(mockable.v).toBe('B'); // still B - the stale continuation was ignored
  });
});
