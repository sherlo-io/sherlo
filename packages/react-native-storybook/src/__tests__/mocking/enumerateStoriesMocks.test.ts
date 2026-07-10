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

// Global-level merging is covered exhaustively by mergeMocks.test.ts (CP-01, CP-04,
// CP-07) against the pure mergeMockSet function. These tests instead exercise the
// wiring in enumerateStories itself: proving that meta- and story-level mocks merge
// per key even though the collapsed `parameters.sherlo` field (the shallow spread at
// the top of enumerateStories) has already lost that precedence by the time it lands
// on StoryMeta.parameters - see the CRITICAL PITFALL note on StoryMeta.mocks.
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
