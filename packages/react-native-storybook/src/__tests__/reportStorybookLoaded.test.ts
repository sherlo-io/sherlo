// The shared report of src/helpers/reportStorybookLoaded.ts: shown again, as the scenes-only road
// meets it, in __tests__/sceneBootWatchdog.test.ts.
import reportStorybookLoaded from '../helpers/reportStorybookLoaded';

const mode = vi.hoisted(() => ({ value: 'testing' }));
const sent = vi.hoisted(() => vi.fn());
vi.mock('../SherloModule', () => ({ default: { getMode: () => mode.value } }));
vi.mock('../connection/appLine', () => ({ send: sent }));

beforeEach(() => sent.mockReset());

it('reporting that Storybook loaded in testing mode sends STORYBOOK_LOADED once', () => {
  mode.value = 'testing';
  reportStorybookLoaded();

  expect(sent).toHaveBeenCalledExactlyOnceWith({ action: 'STORYBOOK_LOADED' });
});

it('reporting that Storybook loaded outside testing mode sends nothing', () => {
  mode.value = 'default';
  reportStorybookLoaded();

  expect(sent).not.toHaveBeenCalled();
});
