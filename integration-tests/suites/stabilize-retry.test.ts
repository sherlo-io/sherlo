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
const VARIANT = 'b-render-paths';
const STORY_ID = 'render--async-settle';
const SETTLE_MS = 1500;

describe.each(SB_VERSIONS)('Stabilize: REQUEST_SNAPSHOT waits for async story state to settle - %s', (sbVersion) => {
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

  test(`async-settle story: REQUEST_SNAPSHOT.isStable=true arrives no sooner than ${SETTLE_MS}ms after story-displayed`, async () => {
    // Arrange
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });
    await runner.writeConfig();
    await runner.preInjectStory(STORY_ID);

    // Act
    device.start(packageName, '.MainActivity');
    await runner.waitForStoryDisplayed(STORY_ID, 60_000);
    const startTime = Date.now();
    const req = await runner.expectRequestSnapshot(60_000);
    const elapsedMs = Date.now() - startTime;

    // Assert
    expect(
      elapsedMs,
      `stabilize: expected REQUEST_SNAPSHOT to arrive >= ${SETTLE_MS}ms after story-displayed (giving async update time to apply), got ${elapsedMs}ms`,
    ).toBeGreaterThanOrEqual(SETTLE_MS);
    expect(
      req.isStable,
      `stabilize: expected req.isStable === true, got ${String(req.isStable)}`,
    ).toBe(true);

    await runner.ackRequestSnapshot(null);
  }, 5 * 60_000);
});
