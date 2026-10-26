// src/sceneBoot.ts and the scene calls (src/sealedCore/sceneCalls.ts): a scene that never shows is
// told from the phone's log by the last stage it logged. Each line holds the scene's id and a
// stage, never a request body, a mock's data or a step's words.
const launch = vi.hoisted(() => ({ storyId: 'inbox--full' as string | undefined }));
const core = vi.hoisted(() => ({
  startTestSession: vi.fn(),
  testStory: vi.fn(async (_story: unknown) => {}),
}));
const native = vi.hoisted(() => ({ sendMessage: vi.fn() }));
const scene = vi.hoisted(() => ({
  file: {
    mocks: undefined as unknown,
    scenes: { Full: { play: [{ ready: 'secret-testid' }], ready: 'inbox-list' } },
  },
}));

vi.mock('../SherloModule', () => ({
  default: {
    getMode: () => 'testing',
    getLastState: () => ({ requestId: 'r', nextSnapshot: { storyId: launch.storyId } }),
    getConfigOrDefault: () => ({}),
    notifyGetStorybookCalled: () => {},
  },
}));
vi.mock('../specs/NativeSherloModule', () => ({ default: native }));
vi.mock('../connection/appLine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../connection/appLine')>()),
  send: vi.fn(),
}));
vi.mock('../sealedCore/loadSealedCore', () => ({ getSealedCore: () => core }));
vi.mock('../bundlerOrigin', () => ({ bundlerOrigin: () => null, isBundlerAssetUrl: () => false }));
vi.mock('react-native-safe-area-context', () => ({
  initialWindowMetrics: { insets: { top: 0, bottom: 0, left: 0, right: 0 } },
}));
vi.mock('../bundledScenes', () => ({
  default: {
    'inbox--full': {
      filePath: './Inbox.scenes.tsx',
      sceneName: 'Full',
      loadFile: () => ({ default: scene.file }),
    },
  },
}));
vi.mock('../storyReady', () => ({
  mocksInstalled: async () => {},
  sceneOf: () => scene.file.scenes.Full,
  asRule: (rule: unknown) => (typeof rule === 'string' ? { testID: rule } : rule),
  awaitReady: async () => ({ outcome: 'shown' }),
}));

import { sceneCallsForTheCore } from '../sealedCore/sceneCalls';

const PREFIX = '@sherlo/react-native-storybook';

beforeEach(() => {
  native.sendMessage.mockClear();
  vi.resetModules();
  delete (globalThis as Record<string, unknown>).__sherloLaunchedSceneSwitchedOn;
});

it('a scene launch writes one log line as it loads the scene, applies its mocks, plays its steps and waits for ready', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await import('../sceneBoot');
  for (let turn = 0; turn < 6; turn++) await Promise.resolve();
  const calls = sceneCallsForTheCore();
  await calls.playSteps!('inbox--full');
  await calls.awaitReady!('inbox--full');

  const lines = log.mock.calls.map(([line]) => String(line)).filter((l) => l.startsWith(PREFIX));
  log.mockRestore();
  const stages = [
    'found in the bundle',
    'mocks applied',
    'capture asked for',
    'step 1 of 1 started',
    'step 1 of 1 done',
    'ready rule waited',
    'ready rule met',
  ];
  const places = stages.map((stage) =>
    lines.findIndex((line) => line.includes(`scene inbox--full ${stage}`))
  );
  expect(places).not.toContain(-1);
  expect(places).toEqual([...places].sort((a, b) => a - b));
  expect(lines.join('\n')).not.toContain('secret-testid');
});

it("each stage line of a scene boot goes onto the line's log feed", async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await import('../sceneBoot');
  for (let turn = 0; turn < 6; turn++) await Promise.resolve();
  const calls = sceneCallsForTheCore();
  await calls.playSteps!('inbox--full');
  await calls.awaitReady!('inbox--full');

  const consoleLines = log.mock.calls
    .map(([line]) => String(line))
    .filter((l) => l.startsWith(PREFIX));
  log.mockRestore();
  const fed = native.sendMessage.mock.calls
    .map(([json]) => JSON.parse(String(json)) as { action: string; line: string })
    .filter((message) => message.action === 'log')
    .map((message) => message.line);

  expect(consoleLines.length).toBeGreaterThan(0);
  expect(fed).toEqual(expect.arrayContaining(consoleLines));
  expect(fed.join('\n')).not.toContain('secret-testid');
});
