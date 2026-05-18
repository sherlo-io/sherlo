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

describe.each(SB_VERSIONS)('CSF mixed - CSF1 + CSF3 in one file - %s', (sbVersion) => {
  if (!isVariantCompatible('format-csf-mixed', sbVersion)) {
    test.skip(`format-csf-mixed not compatible with ${sbVersion}`, () => {});
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
    const build = buildApp({ appName: APP_NAME, sbVersion, variantName: 'format-csf-mixed', platform: PLATFORM });
    artifactPath = build.artifactPath;
    packageName = build.packageName;
  }, 20 * 60_000);

  afterAll(async () => {
    logTailer?.stop();
  }, 60_000);

  test('discovery: 3 snapshots spanning CSF1 and CSF3 in one file', async () => {
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
        { storyId: 'mixed--legacy',        viewId: 'mixed--legacy-deviceHeight',        mode: 'deviceHeight' },
        { storyId: 'mixed--modern',        viewId: 'mixed--modern-deviceHeight',        mode: 'deviceHeight' },
        { storyId: 'mixed--modern-render', viewId: 'mixed--modern-render-deviceHeight', mode: 'deviceHeight' },
      ],
    });
    expectNoErrors(protocol);
    expectSdkLog(log, 'start testing session', { storiesCount: 3 });
  }, 5 * 60_000);
});
