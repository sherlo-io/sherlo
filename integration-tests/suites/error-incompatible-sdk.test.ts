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

describe.each(SB_VERSIONS)('Error: Incompatible SDK - %s', (sbVersion) => {
  if (!isVariantCompatible('error-incompatible-sdk', sbVersion)) {
    test.skip(`error-incompatible-sdk not compatible with ${sbVersion}`, () => {});
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
    const build = buildApp({ appName: APP_NAME, sbVersion, variantName: 'error-incompatible-sdk', platform: PLATFORM });
    artifactPath = build.artifactPath;
    packageName = build.packageName;
  }, 20 * 60_000);

  afterAll(async () => {
    logTailer?.stop();
  }, 60_000);

  test('sdk version mismatch: ERROR_SDK_INCOMPATIBLE in protocol, no START', async () => {
    // Arrange
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });
    await runner.writeConfig();

    // Act - start app; sdk-compatibility.json requires 999.0.0 which no native build satisfies.
    // checkSdkCompatibility() fires ERROR_SDK_COMPATIBILITY synchronously at module load time.
    device.start(packageName, '.MainActivity');

    // Wait for the error to be written (fires synchronously at JS module eval, well within 5s).
    await new Promise(r => setTimeout(r, 5_000));

    // Assert
    const protocol = runner.readProtocol();
    expectNativeError(protocol, { code: 'ERROR_SDK_COMPATIBILITY' });

    // START must never arrive - SDK is incompatible so the testing session never begins.
    expect(protocol.filter(e => e.action === 'START')).toHaveLength(0);
  }, 5 * 60_000);
});
