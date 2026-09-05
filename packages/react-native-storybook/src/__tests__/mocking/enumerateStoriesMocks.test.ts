vi.mock('../../SherloModule', () => ({
  default: {
    getMode: vi.fn().mockReturnValue('default'),
  },
}));

import { enumerateStories } from '../../storybook/adapter';
import type { StorybookView } from '../../types';

afterEach(() => {
  delete (globalThis as any).STORIES;
});

// These tests exercise the wiring in enumerateStories itself: proving that meta-,
// story- AND global-level mocks merge per key even though the collapsed
// `parameters.sherlo` field (the shallow spread at the top of enumerateStories) has
// already lost that precedence by the time it lands on StoryMeta.parameters - see the
// CRITICAL PITFALL note on StoryMeta.mocks.
//
// The global level is sourced from Storybook's live preview object
// (view._preview.storyStoreValue.projectAnnotations.parameters) - the merged
// preview-level annotations declared in the app's .rnstorybook/preview.ts. The
// dedicated describe block below pins that source: before SHERLO-1743, readGlobalParameters
// require()'d @storybook/react-native/preview (an internal stub carrying no project
// annotations), so global-level mocks were silently dropped on device and this
// end-to-end path was never exercised.
describe('enumerateStories – StoryMeta.mocks merged from the raw parameter levels (SHERLO-1735)', () => {
  it('merges meta and story mocks per key even though `parameters.sherlo` itself is collapsed wholesale', () => {
    const fileExports = {
      default: {
        title: 'Components/Button',
        parameters: {
          sherlo: { mocks: { 'pkg/b': { value: 'meta-b' }, 'pkg/c': { value: 'meta-c' } } },
        },
      },
      Primary: {
        parameters: { sherlo: { mocks: { 'pkg/c': { value: 'story-c' } } } },
      },
    };
    const req = Object.assign((_filename: string) => fileExports, {
      keys: () => ['./Button.stories.tsx'],
    });
    (globalThis as any).STORIES = [{ directory: './src', req }];

    const view = { _storyIndex: { entries: {} } } as unknown as StorybookView;
    const storyMetas = enumerateStories(view);

    expect(storyMetas).toHaveLength(1);
    const meta = storyMetas[0];

    // Per-key merge: story overrides meta ('pkg/c'); 'pkg/b' (meta-only) survives untouched.
    expect(meta.mocks).toEqual({
      'pkg/b': { value: 'meta-b' },
      'pkg/c': { value: 'story-c' },
    });

    // The collapsed `parameters.sherlo` is a WHOLESALE spread - the story's `sherlo`
    // object replaces meta's entirely, so it does NOT contain 'pkg/b' at all. This is
    // exactly why `.mocks` must be computed from the raw levels separately.
    expect(meta.parameters.sherlo.mocks).toEqual({ 'pkg/c': { value: 'story-c' } });
  });

  it('auto-titled fallback pass also merges meta and story mocks from the raw levels', () => {
    const autoTitledFileExports = {
      default: {
        component: function AutoBtn() {
          return null;
        },
        parameters: { sherlo: { mocks: { 'pkg/b': { value: 'meta-b' } } } },
      },
      Basic: {
        parameters: { sherlo: { mocks: { 'pkg/c': { value: 'story-c' } } } },
      },
    };
    const req = Object.assign((_filename: string) => autoTitledFileExports, {
      keys: () => ['./AutoBtn.stories.tsx'],
    });
    (globalThis as any).STORIES = [{ directory: './src', req }];

    const view = {
      _storyIndex: {
        entries: {
          'autobtn--basic': {
            id: 'autobtn--basic',
            title: 'AutoBtn',
            name: 'Basic',
            importPath: './src/AutoBtn.stories.tsx',
          },
        },
      },
    } as unknown as StorybookView;

    const storyMetas = enumerateStories(view);

    expect(storyMetas).toHaveLength(1);
    expect(storyMetas[0].mocks).toEqual({
      'pkg/b': { value: 'meta-b' },
      'pkg/c': { value: 'story-c' },
    });
  });

  it('a story that declares no mocks of its own still inherits the meta-level mock untouched', () => {
    const fileExports = {
      default: {
        title: 'Components/Plain',
        parameters: { sherlo: { mocks: { 'pkg/a': { value: 'meta-a' } } } },
      },
      Default: {},
    };
    const req = Object.assign((_filename: string) => fileExports, {
      keys: () => ['./Plain.stories.tsx'],
    });
    (globalThis as any).STORIES = [{ directory: './src', req }];

    const view = { _storyIndex: { entries: {} } } as unknown as StorybookView;
    const storyMetas = enumerateStories(view);

    expect(storyMetas[0].mocks).toEqual({ 'pkg/a': { value: 'meta-a' } });
  });

  it('a story with no sherlo parameters at any level gets an empty mock set, not undefined', () => {
    const fileExports = {
      default: { title: 'Components/NoMocks' },
      Default: {},
    };
    const req = Object.assign((_filename: string) => fileExports, {
      keys: () => ['./NoMocks.stories.tsx'],
    });
    (globalThis as any).STORIES = [{ directory: './src', req }];

    const view = { _storyIndex: { entries: {} } } as unknown as StorybookView;
    const storyMetas = enumerateStories(view);

    expect(storyMetas[0].mocks).toEqual({});
  });
});

// Builds a fake StorybookView whose _preview carries preview-level parameters
// exactly where Storybook stores the composed project annotations on device:
// view._preview.storyStoreValue.projectAnnotations.parameters. This is the source
// readGlobalParameters must read from (SHERLO-1743, Defect 1).
function viewWithGlobalMocks(
  globalMocks: Record<string, unknown>,
  entries: Record<string, { id: string; title: string; name: string; importPath: string }> = {}
): StorybookView {
  return {
    _storyIndex: { entries },
    _preview: {
      storyStoreValue: {
        projectAnnotations: {
          parameters: { sherlo: { mocks: globalMocks } },
        },
      },
    },
  } as unknown as StorybookView;
}

describe('enumerateStories – global (preview-level) mocks flow from view._preview (SHERLO-1743, Defect 1)', () => {
  it('merges global, meta and story mocks per key with story > meta > global precedence', () => {
    // Mirrors the Precedence.stories contract: alpha is global-only, beta is
    // overridden at meta, gamma is overridden all the way to story.
    const fileExports = {
      default: {
        title: 'Mocking/Precedence',
        parameters: {
          sherlo: { mocks: { beta: { origin: 'meta' }, gamma: { origin: 'meta' } } },
        },
      },
      Overrides: {
        parameters: { sherlo: { mocks: { gamma: { origin: 'story' } } } },
      },
    };
    const req = Object.assign((_filename: string) => fileExports, {
      keys: () => ['./Precedence.stories.tsx'],
    });
    (globalThis as any).STORIES = [{ directory: './src', req }];

    const view = viewWithGlobalMocks({
      alpha: { origin: 'global' },
      beta: { origin: 'global' },
      gamma: { origin: 'global' },
    });

    const storyMetas = enumerateStories(view);

    expect(storyMetas).toHaveLength(1);
    // alpha survives from global; beta wins at meta; gamma wins at story. Before the
    // fix globalMocks was always {} (the @storybook/react-native/preview require
    // stub), so `alpha` would be absent entirely and this assertion would fail.
    expect(storyMetas[0].mocks).toEqual({
      alpha: { origin: 'global' },
      beta: { origin: 'meta' },
      gamma: { origin: 'story' },
    });
  });

  it('a story with no meta/story mocks still inherits the global mock (CP-07 inheritance)', () => {
    const fileExports = {
      default: { title: 'Mocking/Precedence' },
      Inherited: {},
    };
    const req = Object.assign((_filename: string) => fileExports, {
      keys: () => ['./Precedence.stories.tsx'],
    });
    (globalThis as any).STORIES = [{ directory: './src', req }];

    const view = viewWithGlobalMocks({ alpha: { origin: 'global' } });
    const storyMetas = enumerateStories(view);

    expect(storyMetas[0].mocks).toEqual({ alpha: { origin: 'global' } });
  });

  it('global mocks also reach the _storyIndex fallback pass (auto-titled / index-only stories)', () => {
    // No STORIES require.context entry emits this id, so it is recovered only by the
    // fallback loop - which must still layer in the global mocks.
    (globalThis as any).STORIES = [];

    const view = viewWithGlobalMocks(
      { alpha: { origin: 'global' } },
      {
        'mocking-precedence--inherited': {
          id: 'mocking-precedence--inherited',
          title: 'Mocking/Precedence',
          name: 'Inherited',
          importPath: './src/Precedence.stories.tsx',
        },
      }
    );
    const storyMetas = enumerateStories(view);

    expect(storyMetas).toHaveLength(1);
    expect(storyMetas[0].mocks).toEqual({ alpha: { origin: 'global' } });
  });
});
