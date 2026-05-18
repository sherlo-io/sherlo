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
  expectBootSequence,
  expectStartItem,
  expectNoErrors,
  expectSdkLog,
} from '../harness/expectations.js';

const APP_NAME = 'integrated-app-bare-rn';

describe.each(SB_VERSIONS)('CSF1 - function exports - %s', (sbVersion) => {
  if (!isVariantCompatible('format-csf1', sbVersion)) {
    test.skip(`format-csf1 not compatible with ${sbVersion}`, () => {});
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
    const build = buildApp({ appName: APP_NAME, sbVersion, variantName: 'format-csf1', platform: PLATFORM });
    artifactPath = build.artifactPath;
    packageName = build.packageName;
  }, 20 * 60_000);

  afterAll(async () => {
    logTailer?.stop();
  }, 60_000);

  test('discovery: exactly 2 snapshots for legacy--{alpha, beta}', async () => {
    // Arrange
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });
    await runner.writeConfig();

    // Act
    device.start(packageName, '.MainActivity');
    const start = await runner.expectStart(120_000);

    // Assert
    const protocol = runner.readProtocol();
    const log = runner.readLog();

    expectBootSequence(protocol);
    expectStartItem(start, {
      snapshots: [
        { storyId: 'legacy--alpha', viewId: 'legacy--alpha-deviceHeight', mode: 'deviceHeight' },
        { storyId: 'legacy--beta',  viewId: 'legacy--beta-deviceHeight',  mode: 'deviceHeight' },
      ],
    });
    expectNoErrors(protocol);
    expectSdkLog(log, 'start testing session', { storiesCount: 2 });
  }, 5 * 60_000);
});
