import { describe, test, beforeAll, afterAll } from 'vitest';
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
import { expect } from 'vitest';

const APP_NAME = 'integrated-app-bare-rn';
const VARIANT = 'render-network-image';

describe.each(SB_VERSIONS)('Render: network image is detected via fabricMetadata - %s', (sbVersion) => {
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

  test('Image with network uri sets req.hasNetworkImage=true', async () => {
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });

    const req = await runner.captureStory('renderimage--remote', { timeoutMs: 60_000 });
    expectRequestSnapshotItem(req, { storyId: 'renderimage--remote', hasError: false });
    expect((req as any).hasNetworkImage, 'expected req.hasNetworkImage to be true for remote Image').toBe(true);

    expectProtocolWellFormed(runner.readProtocol());
  }, 5 * 60_000);
});
