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
import { expectJsError } from '../harness/expectations.js';

const APP_NAME = 'integrated-app-bare-rn';

describe.each(SB_VERSIONS)('Error: JS runtime crash during render - %s', (sbVersion) => {
  if (!isVariantCompatible('js-runtime-crash', sbVersion)) {
    test.skip(`js-runtime-crash not compatible with ${sbVersion}`, () => {});
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
    const build = buildApp({ appName: APP_NAME, sbVersion, variantName: 'js-runtime-crash', platform: PLATFORM });
    artifactPath = build.artifactPath;
    packageName = build.packageName;
  }, 20 * 60_000);

  afterAll(async () => {
    logTailer?.stop();
  }, 60_000);

  test('app crash: JS_ERROR captured during render', async () => {
    // Arrange
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });
    await runner.writeConfig();

    // Act - start app; expect it to crash, so we DON'T await expectStart
    device.start(packageName, '.MainActivity');

    // Wait briefly for protocol entries to accumulate (the SDK polyfill installs an
    // ErrorUtils handler that writes JS_ERROR to protocol.sherlo before the app dies)
    await new Promise(r => setTimeout(r, 5_000));

    // Assert
    const protocol = runner.readProtocol();
    expectJsError(protocol, {
      messageContains: 'Intentional JS runtime crash during render',
    });

    // No START should have arrived - app died before discovery
    expect(protocol.filter(e => e.action === 'START')).toHaveLength(0);
  }, 5 * 60_000);
});
