// A scene launch is not Storybook's testing mode, so the testing mode's silencing never runs
// there: sceneBoot hides the error overlay itself, through helpers/hideErrorOverlay.
vi.mock('../SherloModule', () => ({
  default: {
    getMode: () => 'testing',
    getLastState: () => ({ requestId: 'r', nextSnapshot: { storyId: 'chat--conversation' } }),
    getConfigOrDefault: () => ({}),
    notifyGetStorybookCalled: () => {},
  },
}));
vi.mock('../connection/appLine', () => ({ send: vi.fn(), logTheLine: () => {} }));
vi.mock('../sealedCore/loadSealedCore', () => ({ getSealedCore: () => null }));
vi.mock('../bundlerOrigin', () => ({ bundlerOrigin: () => null }));

import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__sherloLaunchedSceneSwitchedOn;
  delete (globalThis as Record<string, unknown>).__sherloTestLogBoxIgnored;
  vi.resetModules();
});

it('a scene launch hides the error overlay the same way the testing mode does', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../sceneBoot');

  expect((globalThis as Record<string, unknown>).__sherloTestLogBoxIgnored).toEqual([true]);
  // The errors still reach the console: only the overlay is hidden, and the scene keeps a list.
  console.error('still logged');
  expect(error).toHaveBeenCalledWith('still logged');
  error.mockRestore();
});
