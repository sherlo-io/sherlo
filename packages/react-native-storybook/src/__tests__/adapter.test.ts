vi.mock('../SherloModule', () => ({
  default: {
    getMode: vi.fn().mockReturnValue('default'),
  },
}));

import { enumerateStories } from '../storybook/adapter';
import prepareSnapshots from '../getStorybook/components/TestingMode/useTestAllStories/prepareSnapshots';
import type { StorybookView } from '../types';

// ---------------------------------------------------------------------------
// importPath emission (TurboSnap bridge)
// ---------------------------------------------------------------------------

describe('enumerateStories – importPath bridge (TurboSnap)', () => {
  it('includes importPath for titled stories (primary require.context path)', () => {
    const fileExports = {
      default: { title: 'Components/Button' },
      Primary: { parameters: { sherlo: { platform: 'ios' as const } } },
    };
    const req = Object.assign((_filename: string) => fileExports, {
      keys: () => ['./Button.stories.tsx'],
    });
    (globalThis as any).STORIES = [{ directory: './src/components', req }];

    const view = { _storyIndex: { entries: {} } } as unknown as StorybookView;
    const storyMetas = enumerateStories(view);

    expect(storyMetas).toHaveLength(1);
    // importPath is derived as `${directory}/${filename.substring(2)}`
    expect(storyMetas[0].importPath).toBe('./src/components/Button.stories.tsx');
  });

  it('includes importPath for auto-titled stories from _storyIndex.entries', () => {
    const autoTitledExports = {
      default: {
        component: function AutoBtn() {
          return null;
        },
      },
      Basic: { parameters: {} },
    };
    const req = Object.assign((_filename: string) => autoTitledExports, {
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
    // importPath comes from _storyIndex.entries[id].importPath for auto-titled stories
    expect(storyMetas[0].importPath).toBe('./src/AutoBtn.stories.tsx');
  });

  it('propagates importPath into the Snapshot sent in the START payload', () => {
    const fileExports = {
      default: { title: 'Components/Badge' },
      Default: {},
    };
    const req = Object.assign((_filename: string) => fileExports, {
      keys: () => ['./Badge.stories.tsx'],
    });
    (globalThis as any).STORIES = [{ directory: './src', req }];

    const view = { _storyIndex: { entries: {} } } as unknown as StorybookView;
    const storyMetas = enumerateStories(view);
    const snapshots = prepareSnapshots({ storyMetas });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].importPath).toBe('./src/Badge.stories.tsx');
  });
});

afterEach(() => {
  delete (globalThis as any).STORIES;
});

// ---------------------------------------------------------------------------
// Explicit-name regression (SHERLO-1491 / SHERLO-1492)
// ---------------------------------------------------------------------------
// Bug: adapter derived the story ID from the explicit `name` field instead of
// the export key. Storybook keys its store by export key, so when the explicit
// name slug differs from the export key slug, the SDK emitted an ID that
// Storybook didn't recognise. The app fell back to the default "Please select
// a story to preview" screen and `hasError: true` was captured.
//
// Fix: always derive the ID via toId(title, storyNameFromExport(exportKey)).
// The explicit name is retained as the display `name` field only.

describe('enumerateStories – explicit name regression (SHERLO-1491)', () => {
  afterEach(() => {
    delete (globalThis as any).STORIES;
  });

  it('derives story ID from export key, not explicit name', () => {
    // Story: export const Foo = { name: 'Bar' } under title: 'Explicit Name'
    // Correct ID (Storybook): 'explicit-name--foo'  (export key 'Foo')
    // Buggy ID (pre-fix):     'explicit-name--bar'  (explicit name 'Bar')
    const fileExports = {
      default: { title: 'Explicit Name' },
      Foo: { name: 'Bar', render: (): null => null },
    };
    const req = Object.assign((_filename: string) => fileExports, {
      keys: () => ['./ExplicitName.stories.tsx'],
    });
    (globalThis as any).STORIES = [{ directory: './src', req }];

    const view = {
      _storyIndex: {
        entries: {
          'explicit-name--foo': {
            id: 'explicit-name--foo',
            title: 'Explicit Name',
            name: 'Bar', // Storybook stores the display name here
            importPath: './src/ExplicitName.stories.tsx',
          },
        },
      },
    } as unknown as StorybookView;

    const storyMetas = enumerateStories(view);

    expect(storyMetas).toHaveLength(1);
    // ID must be export-key-based (not explicit-name-based)
    expect(storyMetas[0]!.id).toBe('explicit-name--foo');
    // Display name must still be the explicit name
    expect(storyMetas[0]!.name).toBe('Bar');
    // The emitted ID must be a key in _storyIndex.entries
    const indexIds = Object.keys((view as any)._storyIndex.entries);
    expect(indexIds).toContain(storyMetas[0]!.id);
  });

  it('every emitted StoryMeta.id is a member of _storyIndex.entries when present in index', () => {
    // Two stories: one with explicit name (FooBar → 'Custom Display'),
    // one without (AnotherOne). Both must emit export-key-based IDs.
    const fileExports = {
      default: { title: 'My Title' },
      FooBar: { name: 'Custom Display', render: (): null => null },
      AnotherOne: {},
    };
    const req = Object.assign((_filename: string) => fileExports, {
      keys: () => ['./MyTitle.stories.tsx'],
    });
    (globalThis as any).STORIES = [{ directory: './src', req }];

    const view = {
      _storyIndex: {
        entries: {
          'my-title--foo-bar': {
            id: 'my-title--foo-bar',
            title: 'My Title',
            name: 'Custom Display',
            importPath: './src/MyTitle.stories.tsx',
          },
          'my-title--another-one': {
            id: 'my-title--another-one',
            title: 'My Title',
            name: 'Another One',
            importPath: './src/MyTitle.stories.tsx',
          },
        },
      },
    } as unknown as StorybookView;

    const storyMetas = enumerateStories(view);

    expect(storyMetas).toHaveLength(2);
    const indexIds = new Set(Object.keys((view as any)._storyIndex.entries));
    for (const meta of storyMetas) {
      expect(indexIds.has(meta.id)).toBe(true);
    }
    const emittedIds = storyMetas.map((m) => m.id).sort();
    expect(emittedIds).toEqual(['my-title--another-one', 'my-title--foo-bar']);
  });

  it('resolves to the real Storybook index id when slug diverges (importPath+name fallback)', () => {
    // Simulates a divergent-slug scenario: the SDK computes 'my-title--foo'
    // from the export key via toId('My Title', storyNameFromExport('Foo')),
    // but the real Storybook index has a different id 'my-title--foo-x'.
    // The layered resolution must fall back to the importPath+displayName match
    // to return Storybook's own id. This test FAILS on the no-op one-liner
    // `indexEntries[exportKeyId]?.id ?? exportKeyId` because that key is absent.
    const fileExports = {
      default: { title: 'My Title' },
      Foo: {}, // no explicit name
    };
    const req = Object.assign((_filename: string) => fileExports, {
      keys: () => ['./MyTitle.stories.tsx'],
    });
    (globalThis as any).STORIES = [{ directory: './src', req }];

    const view = {
      _storyIndex: {
        entries: {
          'my-title--foo-x': {
            id: 'my-title--foo-x', // Storybook's real id (differs from SDK-computed 'my-title--foo')
            title: 'My Title',
            name: 'Foo', // = storyNameFromExport('Foo')
            importPath: './src/MyTitle.stories.tsx',
          },
        },
      },
    } as unknown as StorybookView;

    const storyMetas = enumerateStories(view);

    expect(storyMetas).toHaveLength(1);
    // Must resolve to Storybook's real id, not the SDK-computed 'my-title--foo'
    expect(storyMetas[0]!.id).toBe('my-title--foo-x');
  });

  it('does not emit a duplicate entry when explicit name slug differs from export key slug', () => {
    // Pre-fix: primary pass emitted 'sometitle--bar' (from explicit name),
    // then fallback pass found 'sometitle--foo' in indexEntries and emitted it
    // too → two entries for the same story.
    // Post-fix: primary pass emits 'sometitle--foo', fallback skips it → one entry.
    const fileExports = {
      default: { title: 'SomeTitle' },
      Foo: { name: 'Bar', render: (): null => null },
    };
    const req = Object.assign((_filename: string) => fileExports, {
      keys: () => ['./SomeTitle.stories.tsx'],
    });
    (globalThis as any).STORIES = [{ directory: './src', req }];

    const view = {
      _storyIndex: {
        entries: {
          'sometitle--foo': {
            id: 'sometitle--foo',
            title: 'SomeTitle',
            name: 'Bar',
            importPath: './src/SomeTitle.stories.tsx',
          },
        },
      },
    } as unknown as StorybookView;

    const storyMetas = enumerateStories(view);

    // Exactly one entry - no duplicate from the fallback pass
    expect(storyMetas).toHaveLength(1);
    expect(storyMetas[0]!.id).toBe('sometitle--foo');
  });
});

describe('enumerateStories – auto-titled stories (component: without title:)', () => {
  it('preserves story-level parameters when the default export has component: but no title:', () => {
    // AUTO-TITLED story: default export uses `component:` with NO `title:`.
    // Storybook infers the title at runtime; the raw export object never has it.
    // This is the modern CSF3 pattern used in real story files like
    // ExcludedStory.stories.tsx and PlatformSpecificComponent.stories.tsx.
    const autoTitledFileExports = {
      default: {
        // NOTE: component: present, title: ABSENT - this is the auto-titled case
        component: function SomeAutoTitledComponent() {
          return null;
        },
      },
      Basic: {
        parameters: {
          sherlo: {
            platform: 'android' as const,
            exclude: true,
            disableScrollCapture: true,
          },
          noSafeArea: true,
        },
      },
    };

    const req = Object.assign(
      (_filename: string) => autoTitledFileExports,
      // require.context keys are relative to the context root (directory),
      // NOT to the project root.  Real example from testing/expo:
      //   directory: "./src"  +  req.keys() → ["./AutoTitled.stories.tsx"]
      //   → importPath built by @storybook/react-native: "./src/AutoTitled.stories.tsx"
      { keys: () => ['./AutoTitled.stories.tsx'] }
    );

    (globalThis as any).STORIES = [{ directory: './src', req }];

    // _storyIndex.entries is populated by Storybook after it resolves the
    // auto-inferred title from the component displayName / file path.
    // importPath is `${directory}/${contextKey.substring(2)}` = "./src/AutoTitled.stories.tsx"
    // (mirrors @storybook/react-native/dist/index.js ~line 1224).
    const view = {
      _storyIndex: {
        entries: {
          'someauto-titled-component--basic': {
            id: 'someauto-titled-component--basic',
            title: 'SomeAutoTitledComponent',
            name: 'Basic',
            importPath: './src/AutoTitled.stories.tsx',
          },
        },
      },
    } as unknown as StorybookView;

    const storyMetas = enumerateStories(view);

    // Contract: every enumerated story must carry its story-level parameters
    expect(storyMetas).toHaveLength(1);
    const meta = storyMetas[0];

    // Story-level sherlo params must survive - the runner reads these to apply
    // platform filtering, exclusion, and scroll-capture suppression
    expect(meta.parameters.sherlo).toEqual({
      platform: 'android',
      exclude: true,
      disableScrollCapture: true,
    });

    // Non-sherlo story-level params must also survive - consumed inside the
    // SDK (TestingMode.tsx, useTestStory.tsx) to suppress SafeAreaProvider
    expect(meta.parameters.noSafeArea).toBe(true);

    // Verify the full-pipeline artifact (prepareSnapshots) also carries them
    const snapshots = prepareSnapshots({ storyMetas });
    expect(snapshots).toHaveLength(1);
    const snap = snapshots[0];

    // sherloParameters is what the runner directly consumes
    expect(snap.sherloParameters).toMatchObject({
      platform: 'android',
      exclude: true,
      disableScrollCapture: true,
    });

    // parameters.noSafeArea is consumed in-SDK
    expect(snap.parameters.noSafeArea).toBe(true);
  });
});
