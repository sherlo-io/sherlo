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
  expectProtocolWellFormed,
} from '../harness/expectations.js';

const APP_NAME = 'integrated-app-bare-rn';

describe.each(SB_VERSIONS)('Multi-file pickup - story enumeration across files - %s', (sbVersion) => {
  if (!isVariantCompatible('multi-file-pickup', sbVersion)) {
    test.skip(`multi-file-pickup not compatible with ${sbVersion}`, () => {});
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
    const build = buildApp({ appName: APP_NAME, sbVersion, variantName: 'multi-file-pickup', platform: PLATFORM });
    artifactPath = build.artifactPath;
    packageName = build.packageName;
  }, 20 * 60_000);

  afterAll(async () => {
    logTailer?.stop();
  }, 60_000);

  test('discovery: 3 snapshots from 3 separate story files', async () => {
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
        { storyId: 'page1--default', viewId: 'page1--default-deviceHeight', mode: 'deviceHeight' },
        { storyId: 'page2--default', viewId: 'page2--default-deviceHeight', mode: 'deviceHeight' },
        { storyId: 'page3--default', viewId: 'page3--default-deviceHeight', mode: 'deviceHeight' },
      ],
    });
    expectNoErrors(protocol);
    expectSdkLog(log, 'start testing session', { storiesCount: 3 });
    expectProtocolWellFormed(protocol);
  }, 5 * 60_000);
});
