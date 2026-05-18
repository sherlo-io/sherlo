import { describe, test, beforeAll, afterAll, expect } from 'vitest';
import {
  getGlobalDevice,
  requireDeviceTooling,
  PLATFORM,
  buildApp,
  createRunnerSim,
  SB_VERSIONS,
  isVariantCompatible,
  type Device,
  type LogTailer,
} from '../harness/index.js';
import { expectRequestSnapshotItem, expectProtocolWellFormed } from '../harness/expectations.js';

const APP_NAME = 'integrated-app-bare-rn';
const VARIANT = 'render-scrollable';

describe.each(SB_VERSIONS)('Render: scrollable content sets isScrollable + scrollViewFrame - %s', (sbVersion) => {
  if (!isVariantCompatible(VARIANT, sbVersion)) {
    test.skip(`${VARIANT} not compatible with ${sbVersion}`, () => {});
    return;
  }

  let device: Device;
  let artifactPath: string;
  let packageName: string;
  let logTailer: LogTailer | undefined;

  beforeAll(async () => {
    requireDeviceTooling();
    device = getGlobalDevice();
    logTailer = device.tailLog();
    const build = buildApp({ appName: APP_NAME, sbVersion, variantName: VARIANT, platform: PLATFORM });
    artifactPath = build.artifactPath;
    packageName = build.packageName;
  }, 20 * 60_000);

  afterAll(async () => {
    logTailer?.stop();
  }, 60_000);

  test('tall ScrollView sets req.isScrollable=true and scrollViewFrame', async () => {
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });

    const req = await runner.captureStory('render-scrollable--tall', { timeoutMs: 60_000 });
    expectRequestSnapshotItem(req, { storyId: 'render-scrollable--tall', hasError: false });

    const isScrollable = (req as any).isScrollable;
    expect(isScrollable, 'expected req.isScrollable to be true for tall ScrollView').toBe(true);

    const frame = (req as any).scrollViewFrame;
    expect(
      frame && typeof frame === 'object',
      `expected req.scrollViewFrame to be present, got ${JSON.stringify(frame)}`,
    ).toBe(true);
    expect(typeof frame.x).toBe('number');
    expect(typeof frame.y).toBe('number');
    expect(typeof frame.width).toBe('number');
    expect(typeof frame.height).toBe('number');

    expectProtocolWellFormed(runner.readProtocol());
  }, 5 * 60_000);
});
