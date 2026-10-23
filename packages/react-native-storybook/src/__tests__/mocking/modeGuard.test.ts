// SHERLO-1765 B2: activation must no-op outside 'testing' and 'storybook' modes. The guard
// lives in registry.activateMocks (the single choke point); activateStoryMocks delegates to it,
// so both public entry points are covered. This suite drives getMode across all three modes.
const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode },
}));

// RunnerBridge is only reached by activateStoryMocks' unshimmed-key warning; stub it so the
// guard tests don't depend on the native bridge.
vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import createMockable from '../../mocking/createMockable';
import { activateMocks, clearMocks } from '../../mocking/registry';
import { activateStoryMocks } from '../../mocking/activateStoryMocks';

afterEach(() => {
  clearMocks();
  mockGetMode.mockReset();
});

// Returns the value the shim serves for `prop` right now (mock override if active, else real).
function makeMockable(key: string) {
  const real = { greet: () => 'real' };
  const mockable = createMockable(key, real) as typeof real;
  return { mockable, mock: { [key]: { greet: () => 'mocked' } } };
}

describe('activateMocks mode guard (B2)', () => {
  it('no-ops in "default" mode - the mock is never installed', () => {
    mockGetMode.mockReturnValue('default');
    const { mockable, mock } = makeMockable('pkg/guard-default');

    activateMocks(mock);

    expect(mockable.greet()).toBe('real');
  });

  it('installs the mock in "testing" mode', () => {
    mockGetMode.mockReturnValue('testing');
    const { mockable, mock } = makeMockable('pkg/guard-testing');

    activateMocks(mock);

    expect(mockable.greet()).toBe('mocked');
  });

  it('installs the mock in "storybook" mode', () => {
    mockGetMode.mockReturnValue('storybook');
    const { mockable, mock } = makeMockable('pkg/guard-storybook');

    activateMocks(mock);

    expect(mockable.greet()).toBe('mocked');
  });
});

describe('activateStoryMocks mode guard (B2 - direct entry point)', () => {
  it('no-ops in "default" mode', () => {
    mockGetMode.mockReturnValue('default');
    const { mockable, mock } = makeMockable('pkg/story-guard-default');

    activateStoryMocks(mock);

    expect(mockable.greet()).toBe('real');
  });

  it('installs the mock in "testing" mode', () => {
    mockGetMode.mockReturnValue('testing');
    const { mockable, mock } = makeMockable('pkg/story-guard-testing');

    activateStoryMocks(mock);

    expect(mockable.greet()).toBe('mocked');
  });

  it('installs the mock in "storybook" mode', () => {
    mockGetMode.mockReturnValue('storybook');
    const { mockable, mock } = makeMockable('pkg/story-guard-storybook');

    activateStoryMocks(mock);

    expect(mockable.greet()).toBe('mocked');
  });
});
