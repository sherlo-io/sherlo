/**
 * What is left of useSetInitialTestingData in the SDK: it starts the sealed core's test session
 * (startTestSession, tested in packages/sherlo-core/js/__tests__) with the Storybook view, and only
 * for a launch a runner drives. The core is the one built from its source
 * (./__mocks__/sealedCoreFromSource), its session start stood in for.
 */
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: (fn: () => void | (() => void), _deps?: any[]) => {
      fn();
    },
  };
});

import useSetInitialTestingData from '../getStorybook/components/TestingMode/useTestAllStories/useSetInitialTestingData';
import { getSealedCore } from '../sealedCore/loadSealedCore';

const startTestSession = vi.spyOn(getSealedCore()!, 'startTestSession');

beforeEach(() => {
  vi.clearAllMocks();
  startTestSession.mockResolvedValue(undefined);
});

describe('useSetInitialTestingData', () => {
  it("starts the core's test session with the Storybook view", () => {
    const view = {} as any;
    useSetInitialTestingData({ view });

    expect(startTestSession).toHaveBeenCalledTimes(1);
    expect(startTestSession).toHaveBeenCalledWith(view);
  });

  it('returns early and does NOT send START when enabled is false, even with no lastState', () => {
    // The state a capture with no storyId handed over is in: no lastState to stop the session on
    // its own, so `enabled` (driven by SherloModule.getDriver() in useTestAllStories) is the one
    // thing standing between this and writing protocol.sherlo for a runner that was never there to
    // answer it.
    useSetInitialTestingData({ view: {} as any, enabled: false });

    expect(startTestSession).not.toHaveBeenCalled();
  });
});
