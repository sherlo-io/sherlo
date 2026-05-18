import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import {
  getGlobalDevice,
  requireDeviceTooling,
  PLATFORM,
  buildApp,
  createRunnerSim,
  type ProtocolEntry,
  SB_VERSIONS,
  type Device,
  type LogTailer,
} from '../harness/index.js';

const APP_NAME = 'integrated-app-bare-rn';
const VARIANT = 'sanity';

interface NegativeCase {
  name: string;
  setup: (device: Device, packageName: string) => void;
}

const CASES: NegativeCase[] = [
  {
    name: 'no config.sherlo',
    setup: () => { /* nothing - runner-sim does NOT writeConfig */ },
  },
  {
    name: 'empty {} config',
    setup: (d, packageName) => {
      d.writeFile(packageName, 'config.sherlo', '{}\n');
    },
  },
  {
    name: 'malformed JSON config',
    setup: (d, packageName) => {
      d.writeFile(packageName, 'config.sherlo', '{not valid json}');
    },
  },
];

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
const WAIT_AFTER_START_MS = 30_000;

describe.each(SB_VERSIONS)('Config: invalid configs do not start a testing session - %s', (sbVersion) => {
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

  test('no START arrives for invalid configs (no file / empty {} / malformed JSON)', async () => {
    for (const c of CASES) {
      device.install(artifactPath, packageName);
      const runner = await createRunnerSim({ device, packageName, logTailer });
      c.setup(device, packageName);

      device.start(packageName, '.MainActivity');
      await sleep(WAIT_AFTER_START_MS);

      let protocol: ProtocolEntry[] = [];
      try { protocol = runner.readProtocol(); } catch { /* file may not exist; treat as empty */ }
      const startEntries = protocol.filter(e => e.action === 'START');
      expect(
        startEntries.length,
        `case='${c.name}': expected no START entries, got ${JSON.stringify(protocol)}`,
      ).toBe(0);
    }
  }, 10 * 60_000);
});
