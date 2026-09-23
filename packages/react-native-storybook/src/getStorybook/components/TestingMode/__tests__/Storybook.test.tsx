/**
 * getStorybookComponent() builds a BRAND NEW closure component every call - it calls
 * view.getStorybookUI(params), which kicks off a fresh story-selection cycle
 * (this._getInitialStory(params), addons.loadAddons(...)) rather than updating a running one (see
 * @storybook/react-native's dist/index.js). Storybook.tsx used to call it inline in its render
 * body, so ANY re-render of this component - react-native-safe-area-context's insets settling
 * asynchronously after the first native layout, or a fresh `uiSettings`/`params` object from
 * TestingMode - handed React a changed element type at the same position and made it unmount
 * whatever Storybook had already mounted (dropping its `ready` state and any story context
 * already selected) and remount from scratch, restarting createPreparedStoryMapping() - which
 * reloads EVERY story in the index - and the whole initial-selection dance.
 *
 * This proves the fix: StorybookComponent is built once per boot, behind a ref, regardless of how
 * many times Storybook.tsx itself re-renders.
 *
 * This package's tests never render a real component tree (no react-test-renderer dependency -
 * see getStorybook/__tests__/getStorybook.test.tsx's own note on this), so this calls the plain
 * Storybook() function directly, simulating React re-rendering the SAME component instance by
 * keeping useRef's slots across calls and resetting only the per-render read cursor between them
 * - the same trick a real re-render plays: the same Ref objects, read in the same order, again.
 */

const { useRefMock, resetReactHookInstance, startReactRender } = vi.hoisted(() => {
  let slots: { current: unknown }[] = [];
  let cursor = 0;
  return {
    useRefMock: (initial: unknown) => {
      if (!(cursor in slots)) slots[cursor] = { current: initial };
      return slots[cursor++];
    },
    resetReactHookInstance: () => {
      slots = [];
      cursor = 0;
    },
    startReactRender: () => {
      cursor = 0;
    },
  };
});

const { mockGetStorybookComponent, mockGetLastState, mockAppendFile } = vi.hoisted(() => ({
  mockGetStorybookComponent: vi.fn(() => () => null),
  mockGetLastState: vi.fn(),
  mockAppendFile: vi.fn(),
}));

vi.mock('react', () => ({ useRef: useRefMock, default: { useRef: useRefMock } }));
vi.mock('react/jsx-dev-runtime', () => ({ jsxDEV: () => null, Fragment: Symbol('Fragment') }));
vi.mock('react/jsx-runtime', () => ({
  jsx: () => null,
  jsxs: () => null,
  Fragment: Symbol('Fragment'),
}));
vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../../../helpers', () => ({ getStorybookComponent: mockGetStorybookComponent }));
vi.mock('../../../../helpers', () => ({ RunnerBridge: { log: vi.fn() } }));
vi.mock('../../../../SherloModule', () => ({
  default: { getLastState: mockGetLastState, appendFile: mockAppendFile },
}));

import Storybook from '../Storybook';

const VIEW = {} as never;
const UI_SETTINGS = {
  theme: { background: { content: '#fff' } },
  shouldAddSafeArea: false,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  resetReactHookInstance();
  mockGetLastState.mockReturnValue(undefined);
});

describe('Storybook.tsx builds one StorybookComponent per boot', () => {
  it('does not call getStorybookComponent again on a later render of the same instance', () => {
    startReactRender();
    Storybook({ view: VIEW, uiSettings: UI_SETTINGS });

    // A later render of the SAME component instance - the exact shape insets settling, or a fresh
    // uiSettings object from TestingMode, produces. Twice, for good measure.
    startReactRender();
    Storybook({ view: VIEW, uiSettings: UI_SETTINGS });
    startReactRender();
    Storybook({ view: VIEW, uiSettings: UI_SETTINGS });

    expect(mockGetStorybookComponent).toHaveBeenCalledTimes(1);
  });

  it('still builds a fresh StorybookComponent for a genuinely different component instance', () => {
    // A brand new instance (a real unmount/remount, not merely a re-render) gets its own ref slots
    // - so it is not this test's job to prove it never rebuilds, only that a RE-RENDER of the SAME
    // instance does not.
    startReactRender();
    Storybook({ view: VIEW, uiSettings: UI_SETTINGS });

    resetReactHookInstance();
    startReactRender();
    Storybook({ view: VIEW, uiSettings: UI_SETTINGS });

    expect(mockGetStorybookComponent).toHaveBeenCalledTimes(2);
  });
});
