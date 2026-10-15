/**
 * `sherlo build` fills the local build cache and nothing else: no token, no server, every platform
 * the config tests (or the one `--platform` names), through the same buildApps `sherlo test` uses.
 * The app builder and the machine are fakes, so nothing here compiles; the server is a trap that
 * fails the test on any call.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Platform } from '@sherlo/api-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureTranscript } from '../../../helpers/transcriptSink';
import { type AppBuilder, installAppBuilder } from '../../../seams/appBuilder';
import { installNativeBuild, type NativeBuild } from '../../../seams/nativeBuild';
import { installServerCalls, type ServerCalls } from '../../../seams/serverCalls';
import build from '../build';

const FINGERPRINT = 'a067c443815d678ab7dbd35a9e4e3b62ff6ec2b7eb803af2e09255c94198cc5d';

let projectRoot: string;
let cacheDir: string;
let uninstall: Array<() => void> = [];
let serverCallsMade: string[];

/** A Mac with every tool, nothing in the cache, and a compile that always succeeds. */
function installFakeMachine() {
  const builder = {
    hostSystem: vi.fn(() => 'macos' as const),
    hasTool: vi.fn(async () => true),
    javaVersion: vi.fn(async () => 17),
    listIosSchemes: vi.fn(async () => ['Storefront']),
    findCachedBuild: vi.fn(async (): Promise<string | null> => null),
    keepInCache: vi.fn(async () => undefined),
    generateNativeFolder: vi.fn(async () => undefined),
    compile: vi.fn(async ({ platform }: { platform: Platform }) => ({
      ok: true as const,
      path: `/built/${platform}`,
      sizeMb: '53.90',
      seconds: 88,
      podFilesChanged: [],
    })),
    startEasBuild: vi.fn(async () => {
      throw new Error('no EAS build here');
    }),
    easUploadRoot: vi.fn((root: string) => root),
    readEasUploadFile: vi.fn(() => undefined),
    hashNativeFolderFiles: vi.fn(async () => []),
  };
  uninstall.push(installAppBuilder(builder as unknown as AppBuilder));

  const machine = {
    computeFingerprint: vi.fn(async () => ({
      android: { hash: FINGERPRINT },
      ios: { hash: FINGERPRINT },
    })),
  };
  uninstall.push(installNativeBuild(machine as unknown as NativeBuild));

  // The server is a trap: any operation asked of it is recorded, and fails the call.
  const trap = new Proxy({} as ServerCalls, {
    get: (_, operation) => {
      serverCallsMade.push(String(operation));
      throw new Error(`sherlo build asked the server for ${String(operation)}`);
    },
  });
  uninstall.push(installServerCalls(trap));

  return { builder, machine };
}

function writeConfig() {
  fs.writeFileSync(
    path.join(projectRoot, 'sherlo.config.json'),
    JSON.stringify({ devices: [{ id: 'pixel.7' }, { id: 'iphone.15' }] })
  );
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-build-command-'));
  cacheDir = path.join(projectRoot, 'cache');
  serverCallsMade = [];
  uninstall = [];
  writeConfig();
  vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
    throw new Error(`process.exit(${code})`);
  });
  vi.stubEnv('SHERLO_TOKEN', '');
});

afterEach(() => {
  uninstall.forEach((undo) => undo());
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

function runBuild(options: { platform?: string } = {}) {
  return captureTranscript(() => build({ projectRoot, buildCache: cacheDir, ...options }));
}

describe('sherlo build', () => {
  it('sherlo build needs no token and calls no server', async () => {
    const { builder } = installFakeMachine();

    await runBuild();

    expect(builder.compile).toHaveBeenCalled();
    expect(serverCallsMade).toEqual([]);
  });

  it('sherlo build builds every platform the config tests into the local build cache and pushes nothing', async () => {
    const { builder } = installFakeMachine();

    await runBuild();

    expect(builder.compile.mock.calls.map(([params]) => params.platform).sort()).toEqual([
      'android',
      'ios',
    ]);
    expect(builder.keepInCache).toHaveBeenCalledTimes(2);
    expect(serverCallsMade).toEqual([]);
  });

  it('sherlo build --platform builds that platform only', async () => {
    const { builder } = installFakeMachine();

    await runBuild({ platform: 'ios' });

    expect(builder.compile.mock.calls.map(([params]) => params.platform)).toEqual(['ios']);
  });

  it('sherlo build says it saved the build and that sherlo test uses it until native code or build settings change', async () => {
    installFakeMachine();

    const { stdout } = await runBuild();

    expect(stdout).toMatch(
      /npx sherlo test.*skips building the app until native code or build settings change/
    );
    expect(stdout).toMatch(/Next step/);
  });
});
