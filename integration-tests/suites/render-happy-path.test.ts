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
import {
  expectRequestSnapshotItem,
  expectSnapshotMatch,
  expectNoErrors,
  expectProtocolWellFormed,
} from '../harness/expectations.js';

const APP_NAME = 'integrated-app-bare-rn';
const VARIANT = 'b-render-paths';

const HAPPY_STORIES = [
  'render--static',
  'render--stateful',
  'render--async-settle',
] as const;

describe.each(SB_VERSIONS)('Render: happy paths produce snapshots with hasError=false - %s', (sbVersion) => {
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

  test.each(HAPPY_STORIES)('%s renders successfully', async (storyId) => {
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });

    const req = await runner.captureStory(storyId, { timeoutMs: 60_000 });
    expectRequestSnapshotItem(req, { storyId, hasError: false });
    expectSnapshotMatch(req, `${storyId}-hierarchy`);

    const protocol = runner.readProtocol();
    expectNoErrors(protocol);
    expectProtocolWellFormed(protocol);
  }, 5 * 60_000);
});
