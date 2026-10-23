/**
 * A person's Storybook (Storybook mode): every story they open has its mocks installed by Sherlo's
 * one loader (../../getStorybook/sherloAnnotation), the story Storybook opens on as much as each
 * one they pick after it. No story-changed event is listened to.
 */
vi.mock('../../SherloModule', () => ({
  default: {
    getMode: vi.fn().mockReturnValue('storybook'),
  },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

// No React is installed beside this package: rendering here is calling each component at once.
const { renderAtOnce } = vi.hoisted(() => ({
  renderAtOnce: (type: unknown, props: Record<string, unknown>) =>
    typeof type === 'function' ? type(props) : null,
}));
vi.mock('react', () => ({ default: {} }));
vi.mock('react/jsx-dev-runtime', () => ({ jsxDEV: renderAtOnce, Fragment: Symbol('Fragment') }));
vi.mock('react/jsx-runtime', () => ({ jsx: renderAtOnce, jsxs: renderAtOnce, Fragment: Symbol() }));
vi.mock('../../getStorybook/components/SherloStoryErrorBoundary', () => ({
  default: ({ children }: { children: unknown }) => children,
}));
vi.mock('../../storyOfTheApp', () => ({
  StoryOfTheApp: ({ children }: { children: unknown }) => children,
}));

import createMockable from '../../mocking/createMockable';
import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';
import { __resetStorybookFactsForTests } from '../../getStorybook/storybookFacts';
import { startStorybookHolding } from './storybookHolding';
import { storyAsStorybookComposesIt } from './storyComposedByStorybook';

const TITLE = 'Mocking/Switch';

// A Storybook holding two stories, each declaring a distinct story-level mock for the same module.
function startStorybookWithTwoStories(): void {
  startStorybookHolding([
    {
      importPath: './src/Switch.stories.tsx',
      title: TITLE,
      fileExports: {
        default: { title: TITLE },
        Interactive: {
          parameters: { sherlo: { mocks: { 'pkg/switch': { label: 'interactive-mock' } } } },
        },
        Other: {
          parameters: { sherlo: { mocks: { 'pkg/switch': { label: 'other-mock' } } } },
        },
      },
      stories: [
        { id: 'mocking-switch--interactive', name: 'Interactive' },
        { id: 'mocking-switch--other', name: 'Other' },
      ],
    },
  ]);
}

/** Open the story `exportName` as Storybook does: load it, then render it. */
async function openStory(exportName: string, mockable: { label: string }): Promise<string[]> {
  const labelsRendered: string[] = [];
  const story = storyAsStorybookComposesIt(TITLE, exportName, mockable, labelsRendered);
  await story.load();
  story();
  return labelsRendered;
}

afterEach(() => {
  clearMocks();
  __resetShimmedKeysForTests();
  __resetStorybookFactsForTests();
  vi.clearAllMocks();
});

describe('Storybook mode - the initial story and every story after it (EB-06, IS-05)', () => {
  it('activates the initial story’s mocks immediately, WITHOUT any storyChanged event', async () => {
    const mockable = createMockable('pkg/switch', { label: 'real-switch' });
    startStorybookWithTwoStories();

    // Before Storybook opens a story the module passes through to the real value.
    expect(mockable.label).toBe('real-switch');

    // The session lands directly on its initial story, and Storybook never fires storyChanged for
    // that first selection: its loader is what installs the mocks (the defect behind EB-06 / IS-05).
    expect(await openStory('Interactive', mockable)).toEqual(['interactive-mock']);
  });

  it('a later selection is mocked through the same loader', async () => {
    const mockable = createMockable('pkg/switch', { label: 'real-switch' });
    startStorybookWithTwoStories();

    expect(await openStory('Interactive', mockable)).toEqual(['interactive-mock']);
    // Navigating to another story replaces the first story's mocks, with no event listened to.
    expect(await openStory('Other', mockable)).toEqual(['other-mock']);
  });

  it('with no story named, the story Storybook opens on is mocked too', async () => {
    const mockable = createMockable('pkg/switch', { label: 'real-switch' });
    startStorybookWithTwoStories();

    // Opened from the developer menu: nobody named a story, and Storybook opens on its own pick.
    expect(await openStory('Other', mockable)).toEqual(['other-mock']);
  });
});
