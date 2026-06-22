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
    const req = Object.assign(
      (_filename: string) => fileExports,
      { keys: () => ['./Button.stories.tsx'] },
    );
    (globalThis as any).STORIES = [{ directory: './src/components', req }];

    const view = { _storyIndex: { entries: {} } } as unknown as StorybookView;
    const storyMetas = enumerateStories(view);

    expect(storyMetas).toHaveLength(1);
    // importPath is derived as `${directory}/${filename.substring(2)}`
    expect(storyMetas[0].importPath).toBe('./src/components/Button.stories.tsx');
  });

  it('includes importPath for auto-titled stories from _storyIndex.entries', () => {
    const autoTitledExports = {
      default: { component: function AutoBtn() { return null; } },
      Basic: { parameters: {} },
    };
    const req = Object.assign(
      (_filename: string) => autoTitledExports,
      { keys: () => ['./AutoBtn.stories.tsx'] },
    );
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
    const req = Object.assign(
      (_filename: string) => fileExports,
      { keys: () => ['./Badge.stories.tsx'] },
    );
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

describe('enumerateStories – auto-titled stories (component: without title:)', () => {
  it('preserves story-level parameters when the default export has component: but no title:', () => {
    // AUTO-TITLED story: default export uses `component:` with NO `title:`.
    // Storybook infers the title at runtime; the raw export object never has it.
    // This is the modern CSF3 pattern used in real story files like
    // ExcludedStory.stories.tsx and PlatformSpecificComponent.stories.tsx.
    const autoTitledFileExports = {
      default: {
        // NOTE: component: present, title: ABSENT - this is the auto-titled case
        component: function SomeAutoTitledComponent() { return null; },
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
      { keys: () => ['./AutoTitled.stories.tsx'] },
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
