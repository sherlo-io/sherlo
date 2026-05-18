import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import {
  getGlobalDevice,
  requireDeviceTooling,
  PLATFORM,
  buildApp,
  createRunnerSim,
  type ProtocolEntry,
  SB_VERSIONS,
  isVariantCompatible,
  type Device,
  type LogTailer,
} from '../harness/index.js';

const APP_NAME = 'integrated-app-bare-rn';
const VARIANT = 'sanity';
const WAIT_MS = 15_000;

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

describe.each(SB_VERSIONS)('Inspect: inspect={} launches the app in storybook mode - %s', (sbVersion) => {
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

  test('SDK reports storybook mode and emits no testing-mode protocol items', async () => {
    // Arrange
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });
    await runner.writeConfig({ inspect: {} });

    // Act
    device.start(packageName, '.MainActivity');
    await sleep(WAIT_MS);

    // Assert: native log signals storybook mode
    const logcatContents = logTailer?.snapshot().join('\n') ?? '';
    expect(
      logcatContents,
      `expected logcat to contain "Running in storybook mode" indicating native ConfigHelper detected inspect`,
    ).toContain('Running in storybook mode');

    // Assert: no testing-session items in protocol
    let protocol: ProtocolEntry[] = [];
    try { protocol = runner.readProtocol(); } catch { /* file absent */ }
    const testingItems = protocol.filter(e =>
      e.action === 'START' ||
      e.action === 'REQUEST_SNAPSHOT' ||
      e.action === 'NATIVE_ERROR'
    );
    expect(
      testingItems.length,
      `expected no testing-mode protocol items in storybook mode, got: ${JSON.stringify(testingItems)}`,
    ).toBe(0);
  }, 5 * 60_000);
});
