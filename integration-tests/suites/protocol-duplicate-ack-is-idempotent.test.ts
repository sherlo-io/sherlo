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

describe.each(SB_VERSIONS)('Protocol: duplicate null-ack is idempotent - %s', (sbVersion) => {
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

  test('two consecutive null-acks produce exactly one REQUEST_SNAPSHOT and do not crash', async () => {
    // Arrange
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });
    await runner.writeConfig();
    await runner.preInjectStory(STORY_ID);

    // Act
    device.start(packageName, '.MainActivity');
    await runner.expectRequestSnapshot(120_000);
    await runner.ackRequestSnapshot(null);
    await runner.ackRequestSnapshot(null); // duplicate

    // Wait the quiet window then inspect protocol state.
    await new Promise(r => setTimeout(r, POST_ACK_QUIET_MS));

    // Assert: protocol still readable (SDK didn't crash) and exactly ONE REQUEST_SNAPSHOT.
    let protocol: ReturnType<typeof runner.readProtocol> = [];
    let readOk = false;
    try {
      protocol = runner.readProtocol();
      readOk = true;
    } catch (err) {
      console.log(`protocol read failed: ${String(err)}`);
    }

    expect(
      readOk,
      'SDK appears to have crashed - protocol.sherlo could not be read after duplicate null-ack',
    ).toBe(true);

    const reqs = protocol.filter(e => e.action === 'REQUEST_SNAPSHOT');
    expect(
      reqs.length,
      `expected exactly 1 REQUEST_SNAPSHOT after duplicate null-ack, got ${reqs.length}. Protocol: ${JSON.stringify(protocol)}`,
    ).toBe(1);
  }, 5 * 60_000);
});
