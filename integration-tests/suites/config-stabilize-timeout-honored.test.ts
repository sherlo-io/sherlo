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
const VARIANT = 'd7-never-stable';
const STORY_ID = 'unstable--always';
const STABILIZE_TIMEOUT_MS = 2000;
const ASSERT_UPPER_BOUND_MS = 5000;  // timeout + ~3s tolerance (boot variance, render-then-stabilize start)

describe.each(SB_VERSIONS)('Config: stabilization.timeoutMs is honored for never-stable stories - %s', (sbVersion) => {
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

  test(`never-stable story emits REQUEST_SNAPSHOT.isStable=false within ${ASSERT_UPPER_BOUND_MS}ms of story-displayed`, async () => {
    // Arrange
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });
    await runner.writeConfig({ stabilization: { timeoutMs: STABILIZE_TIMEOUT_MS } });
    await runner.preInjectStory(STORY_ID);

    // Act
    device.start(packageName, '.MainActivity');
    await runner.waitForStoryDisplayed(STORY_ID, 60_000);

    const startTime = Date.now();
    const req = await runner.expectRequestSnapshot(10_000);
    const elapsedMs = Date.now() - startTime;

    // Assert
    expect(
      elapsedMs,
      `expected REQUEST_SNAPSHOT within ${ASSERT_UPPER_BOUND_MS}ms after story-displayed (timeoutMs=${STABILIZE_TIMEOUT_MS} + buffer), got ${elapsedMs}ms`,
    ).toBeLessThanOrEqual(ASSERT_UPPER_BOUND_MS);

    expect(
      req.isStable,
      `expected isStable=false for never-stable story, got ${String(req.isStable)}`,
    ).toBe(false);

    await runner.ackRequestSnapshot(null);
  }, 5 * 60_000);
});
