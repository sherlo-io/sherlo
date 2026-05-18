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

const APP_NAME = 'integrated-app-bare-rn';
const VARIANT = 'b-render-paths';

const ERROR_STORIES: ReadonlyArray<{ storyId: string; errorMessageContains: string }> = [
  { storyId: 'render--throw-on-render',         errorMessageContains: 'B4 intentional render-time throw' },
  { storyId: 'render--throw-in-effect',         errorMessageContains: 'B5 intentional useEffect throw' },
  { storyId: 'render--decorator-render-throw',  errorMessageContains: 'B-dec-render' },
  { storyId: 'render--decorator-effect-throw',  errorMessageContains: 'B-dec-effect' },
];

describe.each(SB_VERSIONS)('Render: throwing stories produce snapshots with hasError=true and error.message - %s', (sbVersion) => {
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

  test.each(ERROR_STORIES)('$storyId throws and surfaces error.message', async ({ storyId, errorMessageContains }) => {
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });

    const req = await runner.captureStory(storyId, { timeoutMs: 60_000 });
    expectRequestSnapshotItem(req, { storyId, hasError: true, errorMessageContains });

    expectProtocolWellFormed(runner.readProtocol());
  }, 5 * 60_000);
});
