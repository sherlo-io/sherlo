/**
 * `sherlo test` and `sherlo build` build the app on this machine (../buildApps): the machine checks,
 * the local build cache, `expo prebuild`, the order of the builds and a failed one - over a fake
 * app builder seam, so nothing here compiles, and every answer the machine could give is the
 * test's own.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Platform } from '@sherlo/api-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureTranscript } from '../../../../helpers/transcriptSink';
import { type AppBuilder, installAppBuilder } from '../../../../seams/appBuilder';
import { buildApps, cacheKeyOf, type PlatformToBuild } from '../buildApps';
import { type BuildSettings, buildSettingsDigest } from '../buildSettings';
import { localBuildCacheFolder, makeProjectSherloFolder } from '../cacheFolder';

const FINGERPRINT = 'a067c443815d678ab7dbd35a9e4e3b62ff6ec2b7eb803af2e09255c94198cc5d';

/** A Mac with every tool, an iOS workspace with one scheme, and nothing in the cache. */
function fakeBuilder(answers: Partial<AppBuilder> = {}) {
  const builder = {
    hostSystem: vi.fn(() => 'macos' as const),
    hasTool: vi.fn(async () => true),
    javaVersion: vi.fn(async () => 17),
    listIosSchemes: vi.fn(async () => ['Storefront']),
    findCachedBuild: vi.fn(
      async (_: Parameters<AppBuilder['findCachedBuild']>[0]): Promise<string | null> => null
    ),
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
    easUploadRoot: vi.fn((projectRoot: string) => projectRoot),
    readEasUploadFile: vi.fn(() => undefined),
    hashNativeFolderFiles: vi.fn(async () => []),
    // A test's own answers are spied on too, so it can ask what was called.
    ...Object.fromEntries(Object.entries(answers).map(([name, answer]) => [name, vi.fn(answer)])),
  };
  uninstallBuilder = installAppBuilder(builder as AppBuilder);
  return builder;
}

let uninstallBuilder: () => void = () => undefined;
let projectRoot: string;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-build-apps-'));
  vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  uninstallBuilder();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

function build({
  toBuild,
  settings = {},
  command = 'test',
  cacheDirFlag,
  parallelBuildsFlag,
}: {
  toBuild: PlatformToBuild[];
  settings?: BuildSettings;
  command?: 'test' | 'build';
  cacheDirFlag?: string;
  parallelBuildsFlag?: boolean;
}) {
  return buildApps({
    projectRoot,
    toBuild,
    settings,
    fingerprints: { android: { hash: FINGERPRINT }, ios: { hash: FINGERPRINT } },
    command,
    storedPlatformRows: [],
    ...(cacheDirFlag ? { cacheDirFlag } : {}),
    ...(parallelBuildsFlag ? { parallelBuildsFlag } : {}),
  });
}

const ANDROID: PlatformToBuild[] = [{ platform: 'android' }];
const IOS: PlatformToBuild[] = [{ platform: 'ios' }];
const BOTH: PlatformToBuild[] = [{ platform: 'android' }, { platform: 'ios' }];

describe('sherlo test builds the app on this machine', () => {
  it('refuses iOS on a machine that is not a Mac, naming --platform android here and --platform ios on a Mac', async () => {
    const builder = fakeBuilder({ hostSystem: () => 'linux' });

    await expect(build({ toBuild: IOS })).rejects.toThrow(
      /iOS builds need macOS[\s\S]*`npx sherlo test --platform android` here and `npx sherlo test --platform ios` on a Mac/
    );
    expect(builder.compile).not.toHaveBeenCalled();
  });

  it('refuses iOS when Xcode is not found, naming xcode-select', async () => {
    const builder = fakeBuilder({ hasTool: async (tool) => tool !== 'xcode' });

    await expect(build({ toBuild: IOS })).rejects.toThrow(
      /Xcode was not found[\s\S]*sudo xcode-select -s \/Applications\/Xcode\.app/
    );
    expect(builder.compile).not.toHaveBeenCalled();
  });

  it('refuses a workspace with several iOS schemes and none named, listing them and the config line that names one', async () => {
    fakeBuilder({ listIosSchemes: async () => ['Storefront', 'StorefrontStaging'] });

    await expect(build({ toBuild: IOS })).rejects.toThrow(
      /the workspace has Storefront and StorefrontStaging\.\nName one in sherlo\.config\.json: "build": \{ "ios": \{ "scheme": "Storefront" \} \}/
    );
  });

  it('refuses Android when no Java is found, naming JDK 17 and JAVA_HOME', async () => {
    fakeBuilder({ javaVersion: async () => null });

    await expect(build({ toBuild: ANDROID })).rejects.toThrow(
      /no Java was found\.\nInstall JDK 17 or newer, or point JAVA_HOME at one\./
    );
  });

  it('refuses Android on a Java older than 17, naming the version it found', async () => {
    fakeBuilder({ javaVersion: async () => 11 });

    await expect(build({ toBuild: ANDROID })).rejects.toThrow(
      /Java 11 was found, and the build needs 17 or newer/
    );
  });

  it('refuses Android when no Android SDK is found, naming ANDROID_HOME and sdk.dir', async () => {
    fakeBuilder({ hasTool: async (tool) => tool !== 'android-sdk' });

    await expect(build({ toBuild: ANDROID })).rejects.toThrow(
      /no Android SDK was found\.\nSet ANDROID_HOME, or add sdk\.dir to android\/local\.properties\./
    );
  });

  it('checks the machine for every platform before the first build starts', async () => {
    // Android could build; iOS cannot. Android, first in line, must not be compiled.
    const builder = fakeBuilder({ hasTool: async (tool) => tool !== 'xcode' });

    await expect(build({ toBuild: BOTH })).rejects.toThrow(/Xcode was not found/);
    expect(builder.findCachedBuild).not.toHaveBeenCalled();
    expect(builder.compile).not.toHaveBeenCalled();
  });

  it('keys the local build cache by the platform, the base fingerprint and the build settings', async () => {
    const settings: BuildSettings = { env: { STORYBOOK: '1' } };
    const builder = fakeBuilder();

    await build({ toBuild: BOTH, settings });

    const keys = builder.findCachedBuild.mock.calls.map(([{ cacheKey }]) => cacheKey);
    expect(keys).toEqual([
      `android-${FINGERPRINT}-${buildSettingsDigest(settings, 'android').slice(0, 12)}`,
      `ios-${FINGERPRINT}-${buildSettingsDigest(settings, 'ios').slice(0, 12)}`,
    ]);
    expect(keys[0]).toMatch(/^android-[0-9a-f]{64}-[0-9a-f]{12}$/);
    expect(builder.keepInCache).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'android', cacheKey: keys[0], path: '/built/android' })
    );
  });

  it('takes an app build from the local build cache and compiles nothing', async () => {
    const builder = fakeBuilder({
      findCachedBuild: async () => '/cache/build-cache/android-key/app-release.apk',
    });

    const { appBuildPaths } = await build({ toBuild: ANDROID, command: 'build' });

    expect(appBuildPaths).toEqual({ android: '/cache/build-cache/android-key/app-release.apk' });
    expect(builder.compile).not.toHaveBeenCalled();
    expect(builder.generateNativeFolder).not.toHaveBeenCalled();
    expect(builder.keepInCache).not.toHaveBeenCalled();
  });

  it('a changed build setting misses the local build cache', () => {
    const keyOf = (settings: BuildSettings) =>
      cacheKeyOf({ baseFingerprint: FINGERPRINT, platform: 'android', settings });

    const base: BuildSettings = {
      env: { STORYBOOK: '1' },
      android: { task: ':app:assembleRelease' },
    };
    expect(keyOf(base)).not.toEqual(keyOf({ ...base, env: { STORYBOOK: '0' } }));
    expect(keyOf(base)).not.toEqual(keyOf({ ...base, android: { task: ':app:assembleStaging' } }));
    expect(keyOf(base)).not.toEqual(keyOf({ ...base, easProfile: 'preview' }));
    // The same settings, written in another order, are the same build.
    expect(keyOf({ env: { A: '1', B: '2' } })).toEqual(keyOf({ env: { B: '2', A: '1' } }));
    // Neither `tool` nor `parallel` shapes the app build, and nor do the other platform's keys.
    expect(keyOf(base)).toEqual(keyOf({ ...base, parallel: true, ios: { scheme: 'Other' } }));
  });

  it("keeps the local build cache in --build-cache, else build-cache in SHERLO_CACHE_DIR, else in the computer's cache folder", async () => {
    vi.stubEnv('HOME', '/home/dev');
    vi.stubEnv('XDG_CACHE_HOME', '/xdg');

    fakeBuilder({ hostSystem: () => 'macos' });
    vi.stubEnv('SHERLO_CACHE_DIR', '/ci/cache');
    expect(localBuildCacheFolder('/flag/cache')).toBe('/flag/cache');
    expect(localBuildCacheFolder(undefined)).toBe('/ci/cache/build-cache');

    // A Mac keeps it in its own cache folder, whatever XDG_CACHE_HOME says.
    vi.stubEnv('SHERLO_CACHE_DIR', '');
    expect(localBuildCacheFolder(undefined)).toBe('/home/dev/Library/Caches/sherlo/build-cache');

    uninstallBuilder();
    fakeBuilder({ hostSystem: () => 'linux' });
    expect(localBuildCacheFolder(undefined)).toBe('/xdg/sherlo/build-cache');
    vi.stubEnv('XDG_CACHE_HOME', '');
    expect(localBuildCacheFolder(undefined)).toBe('/home/dev/.cache/sherlo/build-cache');

    // The build asks the cache in that folder, never in the project.
    uninstallBuilder();
    const builder = fakeBuilder();
    vi.stubEnv('SHERLO_CACHE_DIR', '/ci/cache');
    await build({ toBuild: ANDROID });
    expect(builder.findCachedBuild).toHaveBeenCalledWith(
      expect.objectContaining({ cacheDir: '/ci/cache/build-cache' })
    );
  });

  it('writes .sherlo/.gitignore ignoring everything but data.json the first time it writes the folder', async () => {
    fakeBuilder();
    const gitignore = path.join(projectRoot, '.sherlo', '.gitignore');

    await build({ toBuild: ANDROID });

    expect(fs.readFileSync(gitignore, 'utf8')).toBe('*\n!.gitignore\n!data.json\n');

    // A .gitignore that is there is the developer's: it is never written over.
    fs.writeFileSync(gitignore, '*\n');
    expect(makeProjectSherloFolder(projectRoot)).toBe(path.join(projectRoot, '.sherlo'));
    expect(fs.readFileSync(gitignore, 'utf8')).toBe('*\n');
  });

  it('a cache hit in sherlo test compiles nothing and its row says it came from the local build cache', async () => {
    const builder = fakeBuilder({ findCachedBuild: async () => '/cache/app-release.apk' });

    let platformRows: unknown[] = [];
    const { stdout } = await captureTranscript(async () => {
      ({ platformRows } = await build({ toBuild: ANDROID, command: 'test' }));
    });

    expect(builder.compile).not.toHaveBeenCalled();
    expect(platformRows).toEqual([
      { platform: 'android', appBuild: 'reused-from-local-build-cache' },
    ]);
    expect(stdout).toContain('Reused from the local build cache');
  });

  it('generates the native folder with expo prebuild only when it is missing in an Expo app', async () => {
    const builder = fakeBuilder();
    fs.writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({ dependencies: { expo: '54.0.0' } })
    );

    await build({ toBuild: ANDROID, settings: { env: { STORYBOOK: '1' } } });
    expect(builder.generateNativeFolder).toHaveBeenCalledWith({
      platform: 'android',
      projectRoot,
      env: { STORYBOOK: '1' },
    });

    // A React Native app with no Expo has no prebuild to run.
    builder.generateNativeFolder.mockClear();
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ dependencies: {} }));
    await build({ toBuild: ANDROID });
    expect(builder.generateNativeFolder).not.toHaveBeenCalled();
  });

  it('never runs expo prebuild over a native folder that is there', async () => {
    const builder = fakeBuilder();
    fs.writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({ dependencies: { expo: '54.0.0' } })
    );
    fs.mkdirSync(path.join(projectRoot, 'android'));

    await build({ toBuild: ANDROID });

    expect(builder.generateNativeFolder).not.toHaveBeenCalled();
    expect(builder.compile).toHaveBeenCalledTimes(1);
  });

  it('builds the platforms one after the other unless parallel builds are asked for', async () => {
    let compiling = 0;
    let mostAtOnce = 0;
    const builder = fakeBuilder({
      compile: async ({ platform }) => {
        compiling += 1;
        mostAtOnce = Math.max(mostAtOnce, compiling);
        await new Promise((resolve) => setImmediate(resolve));
        compiling -= 1;
        return {
          ok: true,
          path: `/built/${platform}`,
          sizeMb: '1',
          seconds: 1,
          podFilesChanged: [],
        };
      },
    });

    await build({ toBuild: BOTH });
    expect(mostAtOnce).toBe(1);

    mostAtOnce = 0;
    await build({ toBuild: BOTH, settings: { parallel: true } });
    expect(mostAtOnce).toBe(2);

    mostAtOnce = 0;
    await build({ toBuild: BOTH, parallelBuildsFlag: true });
    expect(mostAtOnce).toBe(2);

    expect(builder.hostSystem).toHaveBeenCalled();
  });

  it("a failed build prints the log's last lines, uploads nothing and exits 2", async () => {
    const builder = fakeBuilder({
      compile: async () => ({
        ok: false,
        seconds: 72,
        lastLines: ['FAILURE: Build failed with an exception.'],
      }),
    });

    const { stdout } = await captureTranscript(async () => {
      await expect(build({ toBuild: BOTH })).rejects.toThrow('process.exit(2)');
    });

    expect(process.exit).toHaveBeenCalledWith(2);
    expect(stdout).toContain('FAILURE: Build failed with an exception.');
    expect(stdout).toContain('.sherlo/build-android.log');
    // Nothing is kept, and the second platform is never built: the run ends on the first failure.
    expect(builder.keepInCache).not.toHaveBeenCalled();
    expect(builder.compile).toHaveBeenCalledTimes(1);
  });

  it("on a failed build, the list of native changes sits above the log's last lines", async () => {
    fakeBuilder({
      compile: async () => ({
        ok: false,
        seconds: 72,
        lastLines: ['> Task :app:compileReleaseKotlin FAILED'],
      }),
    });

    const { stdout } = await captureTranscript(async () => {
      await expect(
        build({
          toBuild: [
            {
              platform: 'android',
              why: {
                reason: 'native-changed',
                storedBuildIndex: 12,
                changesSince: {
                  storedBuildIndex: 12,
                  changes: [{ change: 'changed', file: 'android/app/build.gradle' }],
                },
              },
            },
          ],
        })
      ).rejects.toThrow('process.exit(2)');
    });

    const changeAt = stdout.indexOf('android/app/build.gradle');
    const lastLineAt = stdout.indexOf('> Task :app:compileReleaseKotlin FAILED');
    expect(changeAt).toBeGreaterThan(-1);
    expect(lastLineAt).toBeGreaterThan(changeAt);
  });

  it("a project's own build command replaces Sherlo's and skips the machine checks", async () => {
    // A Linux machine with no Java and no tools: Sherlo's own builds could not run here.
    const builder = fakeBuilder({
      hostSystem: () => 'linux',
      hasTool: async () => false,
      javaVersion: async () => null,
    });

    const { appBuildPaths } = await build({
      toBuild: BOTH,
      settings: {
        android: { command: './scripts/build-android.sh', output: 'out/app.apk' },
        ios: { command: 'fastlane sherlo', output: 'out/App.tar.gz' },
      },
    });

    expect(builder.hasTool).not.toHaveBeenCalled();
    expect(builder.javaVersion).not.toHaveBeenCalled();
    expect(builder.listIosSchemes).not.toHaveBeenCalled();
    expect(builder.compile).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'android',
        custom: { command: './scripts/build-android.sh', output: 'out/app.apk' },
      })
    );
    expect(builder.compile).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'ios',
        custom: { command: 'fastlane sherlo', output: 'out/App.tar.gz' },
      })
    );
    expect(appBuildPaths).toEqual({ android: '/built/android', ios: '/built/ios' });
  });

  it("a project's own build command runs with the variables Sherlo's own build sets", async () => {
    const builder = fakeBuilder();
    const env = { STORYBOOK_ENABLED: 'true', NEW_ARCH_ENABLED: '1' };

    await build({
      toBuild: BOTH,
      settings: {
        env,
        easProfile: 'sherlo',
        android: { command: './scripts/build-android.sh', output: 'out/app.apk' },
      },
    });

    // Android runs the project's own command, iOS Sherlo's: the seam is handed the same variables
    // for both, and composes the build's environment from them the one way it always does.
    const [ownCommand, sherlosOwn] = builder.compile.mock.calls.map(([params]) => params);
    expect(ownCommand).toMatchObject({ platform: 'android', custom: expect.anything() });
    expect(sherlosOwn).not.toHaveProperty('custom');
    expect(ownCommand).toMatchObject({ env, easProfile: 'sherlo' });
    expect(sherlosOwn).toMatchObject({ env, easProfile: 'sherlo' });
  });
});
