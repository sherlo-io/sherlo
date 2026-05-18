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
import { expectRequestSnapshotItem, expectProtocolWellFormed } from '../harness/expectations.js';

const APP_NAME = 'integrated-app-bare-rn';
const VARIANT = 'sanity';
const STORY_ID = 'sanity--default';

describe.each(SB_VERSIONS)('Protocol: malformed JSON line is skipped without crashing - %s', (sbVersion) => {
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

  test('SDK ignores malformed pre-injected line and produces a normal REQUEST_SNAPSHOT', async () => {
    // Arrange
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });
    await runner.writeConfig();

    // Pre-inject a malformed JSONL line FIRST, then a valid ack story.
    // The SDK must ignore the malformed line and use the valid ack.
    await runner.appendRawToProtocol('{not valid json}\n');
    await runner.preInjectStory(STORY_ID);

    // Act
    device.start(packageName, '.MainActivity');
    const req = await runner.expectRequestSnapshot(120_000);

    // Assert
    expectRequestSnapshotItem(req, { storyId: STORY_ID, hasError: false });
    expectProtocolWellFormed(runner.readProtocol());

    await runner.ackRequestSnapshot(null);
  }, 5 * 60_000);
});
