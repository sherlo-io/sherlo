import { describe, test, expect, beforeAll, afterAll } from 'vitest';
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
import { expectNativeError } from '../harness/expectations.js';

const APP_NAME = 'integrated-app-bare-rn';

describe.each(SB_VERSIONS)('Error: Storybook not displayed - %s', (sbVersion) => {
  if (!isVariantCompatible('error-storybook-not-displayed', sbVersion)) {
    test.skip(`error-storybook-not-displayed not compatible with ${sbVersion}`, () => {});
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
    const build = buildApp({ appName: APP_NAME, sbVersion, variantName: 'error-storybook-not-displayed', platform: PLATFORM });
    artifactPath = build.artifactPath;
    packageName = build.packageName;
  }, 20 * 60_000);

  afterAll(async () => {
    logTailer?.stop();
  }, 60_000);

  test('storybook never rendered: ERROR_STORYBOOK_NOT_DISPLAYED in protocol after 10s', async () => {
    // Arrange
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });
    await runner.writeConfig();

    // Act - start app; SDK evaluates (JS_EVAL_COMPLETE) but Storybook is never rendered.
    // The SDK's 10s timer in getStorybook fires ERROR_STORYBOOK_NOT_DISPLAYED.
    device.start(packageName, '.MainActivity');

    // Wait beyond the 10s SDK timer to give the error time to be written.
    await new Promise(r => setTimeout(r, 12_000));

    // Assert
    const protocol = runner.readProtocol();
    expectNativeError(protocol, { code: 'ERROR_STORYBOOK_NOT_DISPLAYED' });

    // START must never arrive - Storybook never renders so the testing session never begins.
    expect(protocol.filter(e => e.action === 'START')).toHaveLength(0);
  }, 5 * 60_000);
});
