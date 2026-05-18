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

describe.each(SB_VERSIONS)('Error: Storybook disabled - %s', (sbVersion) => {
  if (!isVariantCompatible('error-storybook-disabled', sbVersion)) {
    test.skip(`error-storybook-disabled not compatible with ${sbVersion}`, () => {});
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
    const build = buildApp({ appName: APP_NAME, sbVersion, variantName: 'error-storybook-disabled', platform: PLATFORM });
    artifactPath = build.artifactPath;
    packageName = build.packageName;
  }, 20 * 60_000);

  afterAll(async () => {
    logTailer?.stop();
  }, 60_000);

  test('storybook disabled: ERROR_STORYBOOK_DISABLED in protocol, no START', async () => {
    // Arrange
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });
    await runner.writeConfig();

    // Act - start app; it emits ERROR_STORYBOOK_DISABLED and does not proceed to START
    device.start(packageName, '.MainActivity');

    // Wait for protocol to populate (native error is written synchronously in patchedStart)
    await new Promise(r => setTimeout(r, 5_000));

    // Assert
    const protocol = runner.readProtocol();
    expectNativeError(protocol, { code: 'ERROR_STORYBOOK_DISABLED' });

    // No START should arrive - Storybook is disabled and the SDK never starts the session
    expect(protocol.filter(e => e.action === 'START')).toHaveLength(0);
  }, 5 * 60_000);
});
