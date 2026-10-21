/**
 * The fingerprint hides the machine's environment while `@expo/fingerprint` runs, and nothing else
 * may see the hidden one: a push that asks why each platform needs a new app build hashes the
 * native folders of both platforms at once, then asks whether the machine has an Android SDK.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLiveAppBuilder } from '../../../seams/appBuilder';
import { hashNativeFolderFiles } from '../baseFingerprint';

/** Every `@expo/fingerprint` call says it started, then waits until the test lets it finish. */
let sayTheLibraryStarted: () => void = () => {};
let libraryStarted: Promise<void> = Promise.resolve();
let letTheLibraryFinish: () => void = () => {};
let libraryMayFinish: Promise<void> = Promise.resolve();

vi.mock('@expo/fingerprint', () => ({
  createFingerprintAsync: async () => {
    sayTheLibraryStarted();
    await libraryMayFinish;
    return { hash: 'layer-1', sources: [] };
  },
  SourceSkips: { None: 0, ExpoConfigVersions: 1, ExpoConfigRuntimeVersionIfString: 2 },
}));

/** How many times a hash has asked for the environment lock, counted where it asks. */
let swapsAsked = 0;

vi.mock('../deterministicEnv', async (importOriginal) => {
  const original = await importOriginal<typeof import('../deterministicEnv')>();

  return {
    ...original,
    withDeterministicEnv: <T>(fn: () => Promise<T>) => {
      swapsAsked += 1;
      return original.withDeterministicEnv(fn);
    },
  };
});

let projectRoot: string;
let sdkFolder: string;

beforeEach(() => {
  swapsAsked = 0;
  projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-env-swap-')));
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'app' }));
  sdkFolder = path.join(projectRoot, 'android-sdk');
  fs.mkdirSync(sdkFolder);
  vi.stubEnv('ANDROID_HOME', sdkFolder);
  vi.stubEnv('ANDROID_SDK_ROOT', '');

  libraryStarted = new Promise((resolve) => {
    sayTheLibraryStarted = resolve;
  });
  libraryMayFinish = new Promise((resolve) => {
    letTheLibraryFinish = resolve;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe('the deterministic environment of the fingerprint', () => {
  it('nothing outside the fingerprint reads the environment while the fingerprint swaps it', async () => {
    const machine = makeLiveAppBuilder(async () => {
      throw new Error('nothing should run');
    });

    // As a push does for two refused platforms: both native folders hashed at once, the second one
    // asked for a tick later. Asked in the very same tick, the second dynamic import of the mocked
    // library loads the REAL library (4 seconds hashing a project this test never reads); warming
    // the module first does not prevent it.
    const androidHash = hashNativeFolderFiles({ projectRoot, folders: ['android'] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const hashes = Promise.all([
      androidHash,
      hashNativeFolderFiles({ projectRoot, folders: ['ios'] }),
    ]);
    // ...and the machine check asked while the library still runs.
    await libraryStarted;
    // The android hash holds the lock now. Go on only once the ios hash is queued behind it, by
    // ticks and not a fixed sleep, so the two swaps are really there to overlap.
    while (swapsAsked < 2) await new Promise((resolve) => setTimeout(resolve, 0));
    const hasAndroidSdk = machine.hasTool('android-sdk', projectRoot);

    letTheLibraryFinish();
    await hashes;

    expect(await hasAndroidSdk).toBe(true);
    expect(process.env.ANDROID_HOME).toBe(sdkFolder);
  });
});
