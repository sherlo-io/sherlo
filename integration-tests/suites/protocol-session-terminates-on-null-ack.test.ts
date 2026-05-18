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

const APP_NAME = 'integrated-app-bare-rn';
const VARIANT = 'sanity';
const STORY_ID = 'sanity--default';
const POST_ACK_QUIET_MS = 5_000;

describe.each(SB_VERSIONS)('Protocol: session terminates cleanly on ACK { nextSnapshot: null } - %s', (sbVersion) => {
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

  test('SDK stops emitting REQUEST_SNAPSHOT after a null-ack', async () => {
    // Arrange
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });
    await runner.writeConfig();
    await runner.preInjectStory(STORY_ID);

    // Act
    device.start(packageName, '.MainActivity');
    await runner.expectRequestSnapshot(120_000);
    await runner.ackRequestSnapshot(null);

    // Assert: no further REQUEST_SNAPSHOT within the quiet window.
    let secondArrived = false;
    try {
      await runner.expectRequestSnapshot(POST_ACK_QUIET_MS);
      secondArrived = true;
    } catch {
      // expected timeout
    }
    expect(
      secondArrived,
      `expected no further REQUEST_SNAPSHOT within ${POST_ACK_QUIET_MS}ms after null-ack, but one arrived`,
    ).toBe(false);
  }, 5 * 60_000);
});
