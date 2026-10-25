// The shared signal of src/helpers/announceAppShowsWhatItTests.ts: its two effects are shown again
// in __tests__/sceneBootWatchdog.test.ts, as the scenes-only road meets them.
import announceAppShowsWhatItTests from '../helpers/announceAppShowsWhatItTests';

const notify = vi.hoisted(() => vi.fn());
vi.mock('../SherloModule', () => ({ default: { notifyGetStorybookCalled: notify } }));

it('announcing that the app shows what it tests sets the rendered flag and tells the native side', () => {
  delete (global as any).__sherloStorybookRendered;
  announceAppShowsWhatItTests();

  expect((global as any).__sherloStorybookRendered).toBe(true);
  expect(notify).toHaveBeenCalledTimes(1);
});
