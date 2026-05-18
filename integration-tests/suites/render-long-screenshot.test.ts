import { describe, test, beforeAll, afterAll, expect } from 'vitest';
import {
  getGlobalDevice,
  requireDeviceTooling,
  PLATFORM,
  buildApp,
  createRunnerSim,
  SB_VERSIONS,
  isVariantCompatible,
  type ProtocolEntry,
  type Device,
  type LogTailer,
} from '../harness/index.js';
import { expectRequestSnapshotItem, expectProtocolWellFormed } from '../harness/expectations.js';

const APP_NAME = 'integrated-app-bare-rn';
const VARIANT = 'render-scrollable';
const STORY_ID = 'render-scrollable--tall';

describe.each(SB_VERSIONS)('Render: long-screenshot multi-chunk capture - %s', (sbVersion) => {
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

  test('tall ScrollView produces ≥2 chunks, ends with isAtEnd, scroll offsets strictly increase', async () => {
    device.install(artifactPath, packageName);
    const runner = await createRunnerSim({ device, packageName, logTailer });

    const chunks: ProtocolEntry[] = await runner.captureLongScreenshot(STORY_ID, { timeoutMs: 60_000 });

    // ≥2 chunks - otherwise this test isn't testing the multi-chunk path
    expect(
      chunks.length,
      `expected ≥2 chunks for a tall ScrollView story, got ${chunks.length}`,
    ).toBeGreaterThanOrEqual(2);

    // Per-chunk invariants
    chunks.forEach((req, i) => {
      expectRequestSnapshotItem(req, { storyId: STORY_ID, hasError: false });
      const r = req as any;
      expect(r.isScrollable, `chunk[${i}].isScrollable must be true`).toBe(true);
      const isLast = i === chunks.length - 1;
      expect(
        r.isAtEnd,
        `chunk[${i}].isAtEnd must be ${isLast} (i=${i}, total=${chunks.length})`,
      ).toBe(isLast);
    });

    // scrollOffset strictly increasing (first chunk is 0, each subsequent > previous)
    const offsets = chunks.map(c => Number((c as any).scrollOffset ?? 0));
    for (let i = 1; i < offsets.length; i++) {
      expect(
        offsets[i] > offsets[i - 1],
        `chunk[${i}].scrollOffset (${offsets[i]}) must be > chunk[${i - 1}].scrollOffset (${offsets[i - 1]}). Offsets: [${offsets.join(', ')}]`,
      ).toBe(true);
    }

    expectProtocolWellFormed(runner.readProtocol());
  }, 5 * 60_000);
});
