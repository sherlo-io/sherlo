/**
 * Tests for addStorybookToDevMenu().
 * Mocks DevSettings + SherloModule, asserts item registration and callback behavior.
 *
 * NOTE: expo-dev-menu is an optional native peer dependency. In this test environment
 * (Vitest 4.x SSR mode), vi.mock() for aliased modules that don't exist in node_modules
 * does not intercept require() calls inside the loaded module. As a result:
 *  - require('expo-dev-menu') inside addStorybookToDevMenu.ts throws → ExpoDevMenu = undefined
 *  - The ExpoDevMenu.registerDevMenuItems() branch is never taken
 *  - Tests for "Open Storybook" Expo registration are skipped (documented below)
 *
 * What IS testable:
 *  - DevSettings.addMenuItem is always called with "Toggle Storybook"
 *  - The registered callback calls SherloModule.toggleStorybook()
 *  - The idempotency guard prevents double-registration
 *
 * The iOS new-arch workaround (expo/expo#36359) is covered by the integration test
 * matrix in sherlo-developer, which runs on real devices with expo-dev-menu installed.
 */

const { mockAddMenuItem, mockGetMode, mockOpenStorybook, mockToggleStorybook } =
  vi.hoisted(() => ({
    mockAddMenuItem: vi.fn(),
    mockGetMode: vi.fn().mockReturnValue('default'),
    mockOpenStorybook: vi.fn(),
    mockToggleStorybook: vi.fn(),
  }));

vi.stubGlobal('__DEV__', true);

vi.mock('react-native', () => ({
  DevSettings: { addMenuItem: mockAddMenuItem },
  Platform: { OS: 'ios' },
}));

vi.mock('../SherloModule', () => ({
  default: {
    getMode: mockGetMode,
    openStorybook: mockOpenStorybook,
    toggleStorybook: mockToggleStorybook,
    isTurboModule: true,
  },
}));

import addStorybookToDevMenu from '../addStorybookToDevMenu';

describe('addStorybookToDevMenu', () => {
  beforeAll(() => {
    mockGetMode.mockReturnValue('default');
    addStorybookToDevMenu();
  });

  it('registers "Toggle Storybook" via DevSettings.addMenuItem', () => {
    expect(mockAddMenuItem).toHaveBeenCalledWith('Toggle Storybook', expect.any(Function));
  });

  it('DevSettings callback calls toggleStorybook()', () => {
    const [[, toggleCallback]] = mockAddMenuItem.mock.calls;
    toggleCallback();
    expect(mockToggleStorybook).toHaveBeenCalledOnce();
  });

  it('is idempotent - second call does not register again', () => {
    vi.clearAllMocks();
    addStorybookToDevMenu(); // devMenuToggleInitialized=true → early return
    expect(mockAddMenuItem).not.toHaveBeenCalled();
  });

  it.skip('iOS new-arch: registers "Open Storybook" via ExpoDevMenu (skipped - expo-dev-menu not interceptable in Vitest SSR)', () => {
    // expo-dev-menu is not in node_modules and vi.mock cannot intercept the aliased require()
    // in Vitest 4.x SSR mode. This behavior is covered by the sherlo-developer integration tests.
  });

  it.skip('iOS new-arch: ExpoDevMenu callback calls openStorybook() (skipped - expo-dev-menu not interceptable in Vitest SSR)', () => {
    // Same limitation as above.
  });
});

describe('addStorybookToDevMenu - storybook mode (after resetModules)', () => {
  it('when mode=storybook, DevSettings.addMenuItem is still called', async () => {
    vi.resetModules();
    vi.doMock('react-native', () => ({
      DevSettings: { addMenuItem: mockAddMenuItem },
      Platform: { OS: 'ios' },
    }));
    vi.doMock('../SherloModule', () => ({
      default: {
        getMode: () => 'storybook',
        openStorybook: mockOpenStorybook,
        toggleStorybook: mockToggleStorybook,
        isTurboModule: true,
      },
    }));
    vi.clearAllMocks();

    const { default: fn } = await import('../addStorybookToDevMenu');
    fn();

    // DevSettings is always registered regardless of mode
    expect(mockAddMenuItem).toHaveBeenCalledWith('Toggle Storybook', expect.any(Function));
  });
});
