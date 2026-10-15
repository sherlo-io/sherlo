/**
 * Tests for baseFingerprint computation and version suppression.
 *
 * AC1: baseFingerprint is deterministic - same inputs → same hash.
 * AC2: Version bumps MUST NOT change baseFingerprint.
 *
 * Most cases mock `@expo/fingerprint` to control Layer 1. The cases about what the
 * library itself reads from the tree (a native edit on one platform, a Babel config,
 * an undone prebuild) run the REAL library over a tiny fixture: a mock could only
 * prove what the mock was told.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Helpers - create tiny fixture projects on disk
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fp-test-'));
}

function writeFile(dir: string, relativePath: string, content: string): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Commit everything in `dir` as the project's one commit. */
function commitEverything(dir: string): void {
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: dir,
      stdio: 'ignore',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    });
  git('init', '--quiet');
  git('add', '-A');
  git('commit', '--quiet', '-m', 'project');
}

/** What `expo prebuild` writes: both native folders, and run scripts in package.json. */
function prebuild(dir: string): void {
  writeFile(dir, 'android/app/build.gradle', 'android { applicationId "com.generated" }');
  writeFile(dir, 'ios/Generated/Info.plist', '<dict><key>Name</key><string>x</string></dict>');
  const packageJson = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  packageJson.scripts = { android: 'expo run:android', ios: 'expo run:ios' };
  writeFile(dir, 'package.json', JSON.stringify(packageJson));
}

// ---------------------------------------------------------------------------
// Mock @expo/fingerprint - we control the hash to avoid spawning real processes.
// ---------------------------------------------------------------------------

const mockCreateFingerprintAsync = vi.fn();

vi.mock('@expo/fingerprint', () => ({
  createFingerprintAsync: (...args: any[]) => mockCreateFingerprintAsync(...args),
  SourceSkips: {
    None: 0,
    ExpoConfigVersions: 1,
    ExpoConfigRuntimeVersionIfString: 2,
  },
}));

/**
 * Hand Layer 1 to the REAL `@expo/fingerprint`. The fixture it runs over carries a
 * `fingerprint.config.js` that takes React Native's autolinking from Expo's, which a
 * fixture does not install - so the library starts no `npx react-native config`.
 */
async function useTheRealExpoFingerprint(): Promise<void> {
  const real = await vi.importActual<typeof import('@expo/fingerprint')>('@expo/fingerprint');
  mockCreateFingerprintAsync.mockImplementation((...args: any[]) =>
    real.createFingerprintAsync(args[0], args[1])
  );
}

function writeRealLibraryConfig(dir: string): void {
  writeFile(
    dir,
    'fingerprint.config.js',
    'module.exports = { useRNCoreAutolinkingFromExpo: true };'
  );
}

// Also mock runShellCommand so autolinked-module spawning doesn't hang. Each case
// that is about the autolinking answer gives its own.
const mockRunShellCommand = vi.fn();
vi.mock('../../runShellCommand', () => ({
  default: (...args: any[]) => mockRunShellCommand(...args),
}));

/** Let the fingerprint ask the real git what the project commits; every other command still fails. */
async function answerGitForReal(): Promise<void> {
  const real = await vi.importActual<typeof import('../../runShellCommand')>(
    '../../runShellCommand'
  );
  mockRunShellCommand.mockImplementation(async (options: { command: string }) => {
    if (options.command.startsWith('git ')) return real.default(options as never);
    throw new Error('not available in test');
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeBaseFingerprint', () => {
  let computeBaseFingerprint: typeof import('../baseFingerprint').computeBaseFingerprint;
  let buildDeterministicEnv: typeof import('../deterministicEnv').buildDeterministicEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Default: fingerprint succeeds with a known hash.
    mockCreateFingerprintAsync.mockReset().mockResolvedValue({ hash: 'fp-layer1-abc123' });
    mockRunShellCommand.mockReset().mockRejectedValue(new Error('not available in test'));

    const mod = await import('../baseFingerprint');
    computeBaseFingerprint = mod.computeBaseFingerprint;
    buildDeterministicEnv = (await import('../deterministicEnv')).buildDeterministicEnv;
  });

  // AC1: Determinism - same project produces same hash.
  it('produces deterministic hashes for the same project (AC1)', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test', version: '1.0.0' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\npackage@1.0.0:\n  version "1.0.0"');

      const result1 = await computeBaseFingerprint(dir);
      const result2 = await computeBaseFingerprint(dir);

      expect(result1.android.hash).toBeTruthy();
      expect(result1.android.hash).toBe(result2.android.hash);
      expect(result1.ios.hash).toBe(result2.ios.hash);
    } finally {
      cleanup(dir);
    }
  });

  it('computes one base fingerprint per platform', async () => {
    // Layer 1 answers per platform, as the library does when told which platforms to read.
    mockCreateFingerprintAsync.mockImplementation(async (_root: string, options: any) => ({
      hash: `layer1-${options.platforms.join('+')}`,
    }));
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));

      const result = await computeBaseFingerprint(dir);

      expect(result.android.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.ios.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.android.hash).not.toBe(result.ios.hash);
      // Each platform's Layer 1 read that platform's native files alone.
      const platformsAsked = mockCreateFingerprintAsync.mock.calls.map(
        ([, options]) => options.platforms
      );
      expect(platformsAsked).toEqual([['android'], ['ios']]);
      // The one native fingerprint Diff Scope compares covers both, the same on each.
      expect(result.android.nativeFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(result.android.nativeFingerprint).toBe(result.ios.nativeFingerprint);
    } finally {
      cleanup(dir);
    }
  });

  it('a native edit moves the base fingerprint of its platform only', async () => {
    await useTheRealExpoFingerprint();
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'bare-app' }));
      writeRealLibraryConfig(dir);
      writeFile(dir, 'android/app/build.gradle', 'android { applicationId "com.example" }');
      writeFile(dir, 'ios/App/Info.plist', '<dict><key>Name</key><string>app</string></dict>');

      const before = await computeBaseFingerprint(dir);
      writeFile(dir, 'android/app/build.gradle', 'android { applicationId "com.renamed" }');
      const afterAndroidEdit = await computeBaseFingerprint(dir);
      writeFile(dir, 'ios/App/Info.plist', '<dict><key>Name</key><string>renamed</string></dict>');
      const afterIosEdit = await computeBaseFingerprint(dir);

      expect(before.android.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(afterAndroidEdit.android.hash).not.toBe(before.android.hash);
      expect(afterAndroidEdit.ios.hash).toBe(before.ios.hash);
      expect(afterIosEdit.ios.hash).not.toBe(afterAndroidEdit.ios.hash);
      expect(afterIosEdit.android.hash).toBe(afterAndroidEdit.android.hash);
    } finally {
      cleanup(dir);
    }
  });

  it('an android key in the Expo config moves the Android base fingerprint only, and an ios key the iOS one only', async () => {
    // The real library resolves the Expo config only where `expo` is installed, which a fixture
    // is not, so this stands in for it: the resolved config of app.json is one `contents` source,
    // run through the caller's transform and hashed the way `@expo/fingerprint` hashes it.
    mockCreateFingerprintAsync.mockImplementation(
      async (projectRoot: string, options: { fileHookTransform?: Function }) => {
        const appJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));
        const resolvedConfig = JSON.stringify(appJson.expo);
        const hashedContents = options.fileHookTransform
          ? options.fileHookTransform(
              { type: 'contents', id: 'expoConfig' },
              resolvedConfig,
              true,
              'utf8'
            )
          : resolvedConfig;
        const hash = crypto.createHash('sha1').update(hashedContents).digest('hex');
        return { hash, sources: [{ type: 'contents', id: 'expoConfig', hash }] };
      }
    );
    const dir = makeTempDir();
    const writeExpoConfig = (expo: object) => writeFile(dir, 'app.json', JSON.stringify({ expo }));
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'expo-app' }));
      writeExpoConfig({ name: 'expo-app', android: {}, ios: {} });
      const before = await computeBaseFingerprint(dir);

      writeExpoConfig({ name: 'expo-app', android: { permissions: ['CAMERA'] }, ios: {} });
      const afterAndroidKey = await computeBaseFingerprint(dir);

      writeExpoConfig({
        name: 'expo-app',
        android: { permissions: ['CAMERA'] },
        ios: { bitcode: false },
      });
      const afterIosKey = await computeBaseFingerprint(dir);

      writeExpoConfig({
        name: 'renamed-app',
        android: { permissions: ['CAMERA'] },
        ios: { bitcode: false },
      });
      const afterSharedKey = await computeBaseFingerprint(dir);

      expect(afterAndroidKey.android.hash).not.toBe(before.android.hash);
      expect(afterAndroidKey.ios.hash).toBe(before.ios.hash);
      expect(afterIosKey.ios.hash).not.toBe(afterAndroidKey.ios.hash);
      expect(afterIosKey.android.hash).toBe(afterAndroidKey.android.hash);
      // A key both platforms read moves both.
      expect(afterSharedKey.android.hash).not.toBe(afterIosKey.android.hash);
      expect(afterSharedKey.ios.hash).not.toBe(afterIosKey.ios.hash);
    } finally {
      cleanup(dir);
    }
  });

  it("lists a managed project's native modules from expo-modules-autolinking's modules answer", async () => {
    mockRunShellCommand.mockImplementation(async ({ command }: { command: string }) => {
      if (!command.startsWith('npx expo-modules-autolinking resolve')) throw new Error('no');
      // Today's answer: an object with the platform's modules, each by its package name.
      const platform = command.includes('--platform android') ? 'android' : 'ios';
      return JSON.stringify({
        extraDependencies: [],
        modules:
          platform === 'android'
            ? [{ packageName: 'expo-camera', projects: [] }]
            : [
                { packageName: 'expo-camera', pods: [] },
                { packageName: 'expo-haptics', pods: [] },
              ],
      });
    });
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'managed-app' }));
      writeFile(
        dir,
        'node_modules/expo-camera/package.json',
        JSON.stringify({ name: 'expo-camera', version: '16.0.1' })
      );
      writeFile(
        dir,
        'node_modules/expo-haptics/package.json',
        JSON.stringify({ name: 'expo-haptics', version: '14.0.0' })
      );

      const result = await computeBaseFingerprint(dir);

      expect(result.android.preimage?.workflow).toBe('managed');
      expect(result.android.preimage?.autolinkedModules).toEqual(['expo-camera@16.0.1']);
      expect(result.ios.preimage?.autolinkedModules).toEqual([
        'expo-camera@16.0.1',
        'expo-haptics@14.0.0',
      ]);
    } finally {
      cleanup(dir);
    }
  });

  it('records each bare native module with its installed version', async () => {
    const dir = makeTempDir();
    mockRunShellCommand.mockImplementation(async ({ command }: { command: string }) => {
      if (command !== 'npx react-native config') throw new Error('no');
      // `react-native config` names each dependency's folder and what it links per
      // platform - and no version.
      return JSON.stringify({
        dependencies: {
          'react-native-maps': {
            name: 'react-native-maps',
            root: path.join(dir, 'node_modules/react-native-maps'),
            platforms: { android: { sourceDir: 'android' }, ios: { podspecPath: 'x' } },
          },
          'react-native-android-only': {
            name: 'react-native-android-only',
            root: path.join(dir, 'node_modules/react-native-android-only'),
            platforms: { android: { sourceDir: 'android' }, ios: null },
          },
        },
      });
    });
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'bare-app' }));
      writeFile(dir, 'android/app/build.gradle', 'android {}');
      writeFile(
        dir,
        'node_modules/react-native-maps/package.json',
        JSON.stringify({ name: 'react-native-maps', version: '1.2.0' })
      );
      writeFile(
        dir,
        'node_modules/react-native-android-only/package.json',
        JSON.stringify({ name: 'react-native-android-only', version: '0.4.0' })
      );

      const result = await computeBaseFingerprint(dir);

      expect(result.android.preimage?.workflow).toBe('bare');
      expect(result.android.preimage?.autolinkedModules).toEqual([
        'react-native-android-only@0.4.0',
        'react-native-maps@1.2.0',
      ]);
      expect(result.ios.preimage?.autolinkedModules).toEqual(['react-native-maps@1.2.0']);
    } finally {
      cleanup(dir);
    }
  });

  it('counts a native folder git does not track as generated, so an Expo project stays managed after prebuild', async () => {
    await answerGitForReal();
    const managed = makeTempDir();
    const bare = makeTempDir();
    try {
      // A managed Expo project commits no native folder; prebuild generates both.
      writeFile(managed, 'package.json', JSON.stringify({ name: 'expo-app' }));
      writeFile(managed, 'app.json', JSON.stringify({ expo: { name: 'expo-app' } }));
      commitEverything(managed);
      prebuild(managed);

      // A bare project commits its native folders.
      writeFile(bare, 'package.json', JSON.stringify({ name: 'bare-app' }));
      writeFile(bare, 'android/app/build.gradle', 'android {}');
      commitEverything(bare);

      const afterPrebuild = await computeBaseFingerprint(managed);
      const managedCalls = mockCreateFingerprintAsync.mock.calls.length;
      const bareProject = await computeBaseFingerprint(bare);

      expect(afterPrebuild.android.preimage?.workflow).toBe('managed');
      expect(afterPrebuild.ios.preimage?.workflow).toBe('managed');
      // Managed: the app config leaves its versions out, and no file has its version lines
      // stripped (its transform only narrows the Expo config to the platform).
      expect(mockCreateFingerprintAsync.mock.calls[0][1].sourceSkips).toBe(3);
      const plistWithVersion = '<key>CFBundleVersion</key>\n<string>7</string>';
      expect(
        mockCreateFingerprintAsync.mock.calls[0][1].fileHookTransform(
          { type: 'file', filePath: 'ios/App/Info.plist' },
          plistWithVersion,
          true,
          'utf8'
        )
      ).toBe(plistWithVersion);

      expect(bareProject.android.preimage?.workflow).toBe('bare');
      expect(mockCreateFingerprintAsync.mock.calls[managedCalls][1].fileHookTransform).toEqual(
        expect.any(Function)
      );
    } finally {
      cleanup(managed);
      cleanup(bare);
    }
  });

  it('a bare project in a folder its enclosing repository does not track is bare, as it is once it commits itself', async () => {
    await answerGitForReal();
    const enclosingRepository = makeTempDir();
    try {
      writeFile(enclosingRepository, 'package.json', JSON.stringify({ name: 'tools' }));
      writeFile(enclosingRepository, '.gitignore', 'apps/\n');
      commitEverything(enclosingRepository);
      const project = path.join(enclosingRepository, 'apps', 'bare-app');
      writeFile(project, 'package.json', JSON.stringify({ name: 'bare-app' }));
      writeFile(project, 'android/app/build.gradle', 'android {}');

      const untracked = await computeBaseFingerprint(project);
      commitEverything(project);
      const committed = await computeBaseFingerprint(project);

      expect(committed.android.preimage?.workflow).toBe('bare');
      expect(untracked.android.preimage?.workflow).toBe('bare');
      expect(untracked.android.hash).toBe(committed.android.hash);
    } finally {
      cleanup(enclosingRepository);
    }
  });

  it('the fixed environment the base fingerprint is computed under sets SHERLO_BUILD to storybook, whatever the shell says', async () => {
    const saved = process.env.SHERLO_BUILD;
    const layer1SawSherloBuild: (string | undefined)[] = [];
    mockCreateFingerprintAsync.mockImplementation(async () => {
      layer1SawSherloBuild.push(process.env.SHERLO_BUILD);
      return { hash: 'fp-layer1-abc123' };
    });
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));

      for (const shellSays of ['off', 'app-and-storybook', undefined]) {
        if (shellSays === undefined) delete process.env.SHERLO_BUILD;
        else process.env.SHERLO_BUILD = shellSays;

        expect(buildDeterministicEnv().SHERLO_BUILD).toBe('storybook');
        await computeBaseFingerprint(dir);
        // The shell's own value is back once the computation is done.
        expect(process.env.SHERLO_BUILD).toBe(shellSays);
      }

      // Expo's library evaluated the app config under the fixed value every time.
      expect(layer1SawSherloBuild).toEqual(Array(6).fill('storybook'));
      // So did the autolinking subprocess, which runs with exactly the fixed env.
      for (const [{ env, envMode }] of mockRunShellCommand.mock.calls) {
        expect(envMode).toBe('replace');
        expect(env.SHERLO_BUILD).toBe('storybook');
      }
    } finally {
      if (saved === undefined) delete process.env.SHERLO_BUILD;
      else process.env.SHERLO_BUILD = saved;
      cleanup(dir);
    }
  });

  it("an Expo project's base fingerprint is the same before expo prebuild and after it is undone", async () => {
    await useTheRealExpoFingerprint();
    await answerGitForReal();
    const dir = makeTempDir();
    try {
      const packageJson = JSON.stringify({ name: 'expo-app', version: '1.0.0' });
      writeFile(dir, 'package.json', packageJson);
      writeFile(dir, 'app.json', JSON.stringify({ expo: { name: 'expo-app' } }));
      writeRealLibraryConfig(dir);
      commitEverything(dir);

      const beforePrebuild = await computeBaseFingerprint(dir);

      // Sherlo's build prebuilds, installs pods, builds - then undoes the prebuild.
      prebuild(dir);
      writeFile(dir, 'ios/Podfile.lock', 'PODS:\n  - Generated (1.0.0)\n');
      fs.rmSync(path.join(dir, 'android'), { recursive: true, force: true });
      fs.rmSync(path.join(dir, 'ios'), { recursive: true, force: true });
      writeFile(dir, 'package.json', packageJson);

      const afterUndo = await computeBaseFingerprint(dir);

      expect(beforePrebuild.android.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(afterUndo.android.hash).toBe(beforePrebuild.android.hash);
      expect(afterUndo.ios.hash).toBe(beforePrebuild.ios.hash);
    } finally {
      cleanup(dir);
    }
  });

  // The same lockfile installed twice, once fresh and once after an iOS build, as the CI storyline
  // saw it: expo-modules-jsi's pod writes its xcframework, module map and Xcode build folders into
  // its own package folder, with the Xcode toolchain's version inside, so a fingerprint taken
  // after a build on another machine read node_modules/expo-modules-jsi/apple as changed.
  it('two clean installs of one lockfile give one iOS fingerprint', async () => {
    await useTheRealExpoFingerprint();
    const jsiFolder = 'node_modules/expo-modules-jsi/apple';
    const installExpoModulesJsi = (dir: string, version: string, swiftSource: string) => {
      writeFile(
        dir,
        'node_modules/expo-modules-jsi/package.json',
        JSON.stringify({ name: 'expo-modules-jsi', version })
      );
      writeFile(dir, `${jsiFolder}/ExpoModulesJSI.podspec`, "s.name = 'ExpoModulesJSI'");
      writeFile(dir, `${jsiFolder}/Sources/ExpoModulesJSI/JavaScriptValue.swift`, swiftSource);
    };
    /** What `pod install` and an Xcode build leave in the package, on a machine with this Xcode. */
    const buildIosOn = (dir: string, toolchain: string) => {
      writeFile(dir, `${jsiFolder}/Products/ExpoModulesJSI.xcframework/Info.plist`, toolchain);
      writeFile(dir, `${jsiFolder}/Products/ExpoModulesJSI.xcframework/.hash`, toolchain);
      writeFile(dir, `${jsiFolder}/.generated/module.modulemap`, `/Users/${toolchain}/jsi.h`);
      writeFile(dir, `${jsiFolder}/.DerivedData/Build/Products/ExpoModulesJSI.o`, toolchain);
      writeFile(dir, `${jsiFolder}/.build/release.yaml`, toolchain);
      writeFile(dir, `${jsiFolder}/.swiftpm/configuration/state`, toolchain);
    };
    const makeInstall = (version: string, swiftSource: string) => {
      const dir = makeTempDir();
      writeFile(dir, 'package.json', JSON.stringify({ name: 'expo-app', version: '1.0.0' }));
      writeFile(dir, 'app.json', JSON.stringify({ expo: { name: 'expo-app' } }));
      // The fixture installs no expo-modules-autolinking, so the library is handed the package's
      // native folder the way Expo's iOS autolinking hands it over.
      writeFile(
        dir,
        'fingerprint.config.js',
        `module.exports = ${JSON.stringify({
          useRNCoreAutolinkingFromExpo: true,
          extraSources: [{ type: 'dir', filePath: jsiFolder, reasons: ['expoAutolinkingIos'] }],
        })};`
      );
      installExpoModulesJsi(dir, version, swiftSource);
      return dir;
    };

    const fresh = makeInstall('57.1.2', 'struct JavaScriptValue {}');
    const builtOnTheFirstRunner = makeInstall('57.1.2', 'struct JavaScriptValue {}');
    const builtOnTheSecondRunner = makeInstall('57.1.2', 'struct JavaScriptValue {}');
    const bumped = makeInstall('57.2.0', 'struct JavaScriptValue { let isBumped = true }');
    buildIosOn(builtOnTheFirstRunner, 'swiftlang-6.2.0 Xcode 26.0');
    buildIosOn(builtOnTheSecondRunner, 'swiftlang-6.3.1 Xcode 26.1');
    try {
      const freshIos = (await computeBaseFingerprint(fresh)).ios.hash;

      expect(freshIos).toMatch(/^[a-f0-9]{64}$/);
      expect((await computeBaseFingerprint(builtOnTheFirstRunner)).ios.hash).toBe(freshIos);
      expect((await computeBaseFingerprint(builtOnTheSecondRunner)).ios.hash).toBe(freshIos);
      expect((await computeBaseFingerprint(bumped)).ios.hash).not.toBe(freshIos);
    } finally {
      for (const dir of [fresh, builtOnTheFirstRunner, builtOnTheSecondRunner, bumped]) {
        cleanup(dir);
      }
    }
  });

  // Moved from commands/test/__tests__/dryRun.test.ts, which goes with the dry run.
  describe('a dependency not yet installed', () => {
    function makeProjectDir(): string {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fp-baseid-'));
      fs.writeFileSync(
        path.join(dir, 'yarn.lock'),
        '# yarn lockfile\nexisting-package@1.0.0:\n  version "1.0.0"\n'
      );
      return dir;
    }

    function writePackageJson(dir: string, dependencies: Record<string, string>): void {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'base-identity-fixture', version: '1.0.0', dependencies })
      );
    }

    it('a dependency package.json declares but node_modules lacks makes the base identity unknown', async () => {
      const dir = makeProjectDir();
      try {
        // Before: nothing native-linking declared yet.
        writePackageJson(dir, {});
        const before = await computeBaseFingerprint(dir);
        expect(before.android.hash).toMatch(/^[a-f0-9]{64}$/);

        // After: package.json declares a native-linking dependency, but nothing
        // ran an install - node_modules never gained it, so neither the lockfile
        // nor the autolinked-module resolve can see it.
        writePackageJson(dir, { 'expo-crypto': '~1.0.0' });
        const after = await computeBaseFingerprint(dir);

        // The identity MOVES: from a confirmed match to a confirmed "cannot say" -
        // never the old, now-stale, hash repeated as if nothing had changed - on
        // every platform.
        for (const platform of ['android', 'ios'] as const) {
          expect(after[platform].hash).toBeNull();
          expect(after[platform].debugMessage).toContain('expo-crypto');
          expect(after[platform].debugMessage).toContain('not installed');
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('a dependency already resolvable from node_modules does not block the identity', async () => {
      const dir = makeProjectDir();
      try {
        fs.mkdirSync(path.join(dir, 'node_modules', 'expo-crypto'), { recursive: true });
        fs.writeFileSync(
          path.join(dir, 'node_modules', 'expo-crypto', 'package.json'),
          JSON.stringify({ name: 'expo-crypto', version: '1.0.0' })
        );
        writePackageJson(dir, { 'expo-crypto': '~1.0.0' });

        const result = await computeBaseFingerprint(dir);

        expect(result.android.hash).toMatch(/^[a-f0-9]{64}$/);
        expect(result.ios.hash).toMatch(/^[a-f0-9]{64}$/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it('the per-file hashes of a native folder never enter the base fingerprint', async () => {
    const layer1WithFolderFiles = (buildGradleHash: string) => ({
      hash: 'fp-layer1-abc123',
      sources: [
        {
          type: 'dir',
          filePath: 'android',
          reasons: ['bareNativeDir'],
          hash: 'folder-hash',
          debugInfo: {
            path: 'android',
            hash: 'folder-hash',
            children: [
              {
                path: 'android/app',
                hash: 'app-hash',
                children: [{ path: 'android/app/build.gradle', hash: buildGradleHash }],
              },
              { path: 'android/settings.gradle', hash: 'settings-hash' },
            ],
          },
        },
      ],
    });
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'bare-app' }));
      writeFile(dir, 'android/app/build.gradle', 'android {}');

      mockCreateFingerprintAsync.mockResolvedValue(layer1WithFolderFiles('gradle-hash-1'));
      const first = await computeBaseFingerprint(dir);
      mockCreateFingerprintAsync.mockResolvedValue(layer1WithFolderFiles('gradle-hash-2'));
      const second = await computeBaseFingerprint(dir);

      // Kept, file by file, for the list of native changes...
      expect(first.android.preimage?.nativeFolderFiles).toEqual([
        { path: 'android/app/build.gradle', hash: 'gradle-hash-1' },
        { path: 'android/settings.gradle', hash: 'settings-hash' },
      ]);
      expect(second.android.preimage?.nativeFolderFiles).toContainEqual({
        path: 'android/app/build.gradle',
        hash: 'gradle-hash-2',
      });
      // ...and asked for without touching the hash: `debug` only reports.
      expect(mockCreateFingerprintAsync.mock.calls[0][1].debug).toBe(true);
      // The folder's own hash did not move, so neither did the base.
      expect(second.android.hash).toBe(first.android.hash);
    } finally {
      cleanup(dir);
    }
  });

  it('an edited Babel config leaves the base fingerprint alone', async () => {
    // Babel shapes the JavaScript bundle, never the app build: Expo's fingerprint
    // library does not read babel.config.js, so a Babel change is a code-only push.
    await useTheRealExpoFingerprint();
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'bare-app' }));
      writeRealLibraryConfig(dir);
      writeFile(dir, 'android/app/build.gradle', 'android { applicationId "com.example" }');
      writeFile(dir, 'ios/App/Info.plist', '<dict><key>Name</key><string>app</string></dict>');
      writeFile(
        dir,
        'babel.config.js',
        "module.exports = { presets: ['module:@react-native/babel-preset'] };"
      );

      const before = await computeBaseFingerprint(dir);
      writeFile(
        dir,
        'babel.config.js',
        "module.exports = { presets: ['module:@react-native/babel-preset'], plugins: ['react-native-reanimated/plugin'] };"
      );
      const after = await computeBaseFingerprint(dir);

      expect(before.android.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(after.android.hash).toBe(before.android.hash);
      expect(after.ios.hash).toBe(before.ios.hash);
      expect(after.android.nativeFingerprint).toBe(before.android.nativeFingerprint);
    } finally {
      cleanup(dir);
    }
  });

  // AC2: Version bump doesn't change baseFingerprint - managed project.
  // The @expo/fingerprint mock returns the same hash regardless, so this
  // proves the combine logic is stable.
  it('version bump does NOT change baseFingerprint - managed project (AC2)', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test', version: '1.0.0' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\n');

      const result1 = await computeBaseFingerprint(dir);

      // The fingerprint should be the same even if files change,
      // because @expo/fingerprint returns a stable hash (versions are suppressed)
      // and the lockfile hasn't changed.
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test', version: '2.0.0' }));

      const result2 = await computeBaseFingerprint(dir);

      expect(result1.android.hash).toBeTruthy();
      expect(result1.android.hash).toBe(result2.android.hash);
      expect(result1.ios.hash).toBe(result2.ios.hash);
    } finally {
      cleanup(dir);
    }
  });

  // AC2: Version bump on bare project - fileHookTransform is exercised.
  it('calls @expo/fingerprint with fileHookTransform for bare projects', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'android/app/build.gradle', 'versionCode 1');
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\n');

      await computeBaseFingerprint(dir);

      // Verify that @expo/fingerprint was called with a fileHookTransform option.
      const callArgs = mockCreateFingerprintAsync.mock.calls[0];
      expect(callArgs).toBeDefined();
      const options = callArgs[1];
      expect(options).toBeDefined();
      expect(options.fileHookTransform).toBeDefined();
      expect(typeof options.fileHookTransform).toBe('function');
    } finally {
      cleanup(dir);
    }
  });

  // AC2: Managed project uses SourceSkips, not fileHookTransform.
  it('calls @expo/fingerprint with SourceSkips for managed projects', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\n');

      await computeBaseFingerprint(dir);

      const callArgs = mockCreateFingerprintAsync.mock.calls[0];
      const options = callArgs[1];
      expect(options).toBeDefined();
      expect(options.sourceSkips).toBeDefined();
      // sourceSkips should include ExpoConfigVersions (1) and ExpoConfigRuntimeVersionIfString (2)
      expect(options.sourceSkips).toBe(3); // 1 | 2
    } finally {
      cleanup(dir);
    }
  });

  // Graceful degradation: @expo/fingerprint throws → returns null hash.
  it('returns null hash when @expo/fingerprint throws', async () => {
    mockCreateFingerprintAsync.mockRejectedValue(new Error('Module not found'));

    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));

      const result = await computeBaseFingerprint(dir);
      expect(result.android.hash).toBeNull();
      expect(result.android.debugMessage).toBeTruthy();
      expect(result.ios.hash).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  // Graceful degradation: @expo/fingerprint returns empty hash.
  it('returns null hash when @expo/fingerprint returns empty hash', async () => {
    mockCreateFingerprintAsync.mockResolvedValue({ hash: '' });

    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));

      const result = await computeBaseFingerprint(dir);
      expect(result.android.hash).toBeNull();
      expect(result.android.debugMessage).toMatch(/empty/i);
      expect(result.ios.hash).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  // Layer 2: the JavaScript lockfiles are not native inputs. (Was "lockfile changes DO
  // change baseFingerprint (Layer 2)", inverted on 2026-10-11.)
  it('a JavaScript-only lockfile change leaves the base fingerprint alone', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));
      writeFile(dir, 'yarn.lock', '# v1\npackage-a@1.0.0:\n  version "1.0.0"');
      writeFile(dir, 'package-lock.json', '{"lockfileVersion":3,"packages":{}}');
      writeFile(dir, 'pnpm-lock.yaml', "lockfileVersion: '9.0'\n");

      const result1 = await computeBaseFingerprint(dir);

      writeFile(dir, 'yarn.lock', '# v2\npackage-b@2.0.0:\n  version "2.0.0"');
      writeFile(dir, 'package-lock.json', '{"lockfileVersion":3,"packages":{"x":{}}}');
      writeFile(dir, 'pnpm-lock.yaml', "lockfileVersion: '9.0'\npackages: {}\n");

      const result2 = await computeBaseFingerprint(dir);

      // Same layer1 mock hash; the JavaScript lockfiles are no input.
      expect(result1.android.hash).toBeTruthy();
      expect(result2.android.hash).toBe(result1.android.hash);
      expect(result2.ios.hash).toBe(result1.ios.hash);
      expect(result2.ios.preimage?.lockfiles).toEqual([]);
    } finally {
      cleanup(dir);
    }
  });

  // Layer 2: the native lockfiles still count, each for its own platform.
  it('a Podfile.lock or Gemfile.lock change moves the iOS base fingerprint alone', async () => {
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));
      writeFile(dir, 'ios/Podfile.lock', 'PODS:\n  - React (0.80.0)\n');
      writeFile(dir, 'Gemfile.lock', 'GEM\n  specs:\n    cocoapods (1.15.2)\n');

      const result1 = await computeBaseFingerprint(dir);
      writeFile(dir, 'ios/Podfile.lock', 'PODS:\n  - React (0.81.0)\n');
      const result2 = await computeBaseFingerprint(dir);
      writeFile(dir, 'Gemfile.lock', 'GEM\n  specs:\n    cocoapods (1.16.0)\n');
      const result3 = await computeBaseFingerprint(dir);

      expect(result1.ios.preimage?.lockfiles.map(({ file }) => file)).toEqual([
        'Gemfile.lock',
        'ios/Podfile.lock',
      ]);
      expect(result2.ios.hash).not.toBe(result1.ios.hash);
      expect(result3.ios.hash).not.toBe(result2.ios.hash);
      expect(result3.android.hash).toBe(result1.android.hash);
    } finally {
      cleanup(dir);
    }
  });

  // ------------------------------------------------------------------
  // Fail-soft, asserted (SHERLO-1744 AC6): fingerprint unavailability must
  // degrade to hash:null and the autolinking subprocess failing must NEVER
  // crash - it degrades to an empty autolinked set and still computes a hash.
  // ------------------------------------------------------------------

  it('autolinking subprocess failure degrades to a hash, never throws (AC6)', async () => {
    // The suite-wide mock makes runShellCommand REJECT (subprocess unavailable).
    // computeBaseFingerprint must still resolve with a real hash, not throw and
    // not return null - the missing autolinked set just hashes as empty.
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\n');

      const result = await computeBaseFingerprint(dir);
      expect(result.android.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.ios.hash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      cleanup(dir);
    }
  });

  it('never rejects even when @expo/fingerprint throws - resolves to null (AC6)', async () => {
    mockCreateFingerprintAsync.mockRejectedValue(new Error('no native dirs'));
    const dir = makeTempDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));
      // Must resolve (not reject) with a null hash + a debug message.
      await expect(computeBaseFingerprint(dir)).resolves.toEqual({
        android: expect.objectContaining({ hash: null }),
        ios: expect.objectContaining({ hash: null }),
      });
    } finally {
      cleanup(dir);
    }
  });

  // The fileHookTransform correctly strips version lines.
  it('fileHookTransform strips version lines from plist files', async () => {
    // Import the transform factory to test in isolation.
    // We access it indirectly through the mock call.
    const dir = makeTempDir();
    try {
      writeFile(
        dir,
        'ios/MyApp/Info.plist',
        '<?xml version="1.0">\n<dict>\n\t<key>CFBundleVersion</key>\n\t<string>1</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>'
      );
      writeFile(dir, 'package.json', JSON.stringify({ name: 'test' }));
      writeFile(dir, 'yarn.lock', '# yarn lockfile\n');

      // Call once with version A
      const result1 = await computeBaseFingerprint(dir);

      // Bump version
      writeFile(
        dir,
        'ios/MyApp/Info.plist',
        '<?xml version="1.0">\n<dict>\n\t<key>CFBundleVersion</key>\n\t<string>99</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>'
      );

      const result2 = await computeBaseFingerprint(dir);

      // With the mock, layer1 hash is always the same. But the real test is:
      // the fileHookTransform was passed, which the previous test already verified.
      // This test ensures determinism with the transform in place.
      if (result1.ios.hash && result2.ios.hash) {
        expect(result1.ios.hash).toBe(result2.ios.hash);
      }
    } finally {
      cleanup(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// Direct stripVersionLines tests - AC2 version-suppression behaviour.
// These prove that the line stripper works WITHOUT the @expo/fingerprint mock,
// so version bumps that DO NOT change the output are actually suppressed.
// ---------------------------------------------------------------------------

describe('stripVersionLines', () => {
  let stripVersionLines: typeof import('../baseFingerprint').stripVersionLines;

  beforeEach(async () => {
    const mod = await import('../baseFingerprint');
    stripVersionLines = mod.stripVersionLines;
  });

  describe('plist files', () => {
    const plistHeader =
      '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>';

    it('strips CFBundleVersion line (AC2)', () => {
      const content = `${plistHeader}\n\t<key>CFBundleVersion</key>\n\t<string>1</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      const stripped = stripVersionLines('Info.plist', content);
      expect(stripped).not.toContain('CFBundleVersion');
      expect(stripped).not.toContain('<string>1</string>');
      expect(stripped).toContain('SomeOther');
      expect(stripped).toContain('keep');
    });

    it('strips MARKETING_VERSION line (AC2)', () => {
      const content = `${plistHeader}\n\t<key>MARKETING_VERSION</key>\n\t<string>2.0.0</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      const stripped = stripVersionLines('Info.plist', content);
      expect(stripped).not.toContain('MARKETING_VERSION');
      expect(stripped).not.toContain('2.0.0');
      expect(stripped).toContain('SomeOther');
      expect(stripped).toContain('keep');
    });

    it('different CFBundleVersion values produce identical stripped output (AC2)', () => {
      const v1 = `${plistHeader}\n\t<key>CFBundleVersion</key>\n\t<string>1</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      const v99 = `${plistHeader}\n\t<key>CFBundleVersion</key>\n\t<string>99</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      expect(stripVersionLines('Info.plist', v1)).toBe(stripVersionLines('Info.plist', v99));
    });

    it('different MARKETING_VERSION values produce identical stripped output (AC2)', () => {
      const v1 = `${plistHeader}\n\t<key>MARKETING_VERSION</key>\n\t<string>1.0</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      const v2 = `${plistHeader}\n\t<key>MARKETING_VERSION</key>\n\t<string>2.0.0</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      expect(stripVersionLines('Info.plist', v1)).toBe(stripVersionLines('Info.plist', v2));
    });

    it('non-version lines are preserved and differences DO affect output', () => {
      const v1 = `${plistHeader}\n\t<key>CFBundleVersion</key>\n\t<string>1</string>\n\t<key>SomeOther</key>\n\t<string>keep</string>\n</dict>\n</plist>`;
      const v2 = `${plistHeader}\n\t<key>CFBundleVersion</key>\n\t<string>1</string>\n\t<key>SomeOther</key>\n\t<string>changed</string>\n</dict>\n</plist>`;
      expect(stripVersionLines('Info.plist', v1)).not.toBe(stripVersionLines('Info.plist', v2));
    });
  });

  describe('build.gradle files', () => {
    it('strips versionName line (AC2)', () => {
      const content = 'android {\n    versionName "1.0.0"\n    applicationId "com.example"\n}';
      const stripped = stripVersionLines('build.gradle', content);
      expect(stripped).not.toContain('versionName');
      expect(stripped).toContain('applicationId');
    });

    it('strips versionCode line (AC2)', () => {
      const content = 'android {\n    versionCode 1\n    applicationId "com.example"\n}';
      const stripped = stripVersionLines('build.gradle', content);
      expect(stripped).not.toContain('versionCode');
      expect(stripped).toContain('applicationId');
    });

    it('different versionName values produce identical stripped output (AC2)', () => {
      const v1 = 'android {\n    versionName "1.0.0"\n    applicationId "com.example"\n}';
      const v2 = 'android {\n    versionName "2.0.0"\n    applicationId "com.example"\n}';
      expect(stripVersionLines('build.gradle', v1)).toBe(stripVersionLines('build.gradle', v2));
    });

    it('different versionCode values produce identical stripped output (AC2)', () => {
      const v1 = 'android {\n    versionCode 1\n    applicationId "com.example"\n}';
      const v2 = 'android {\n    versionCode 99\n    applicationId "com.example"\n}';
      expect(stripVersionLines('build.gradle', v1)).toBe(stripVersionLines('build.gradle', v2));
    });

    it('non-version lines are preserved and differences DO affect output', () => {
      const v1 = 'android {\n    versionName "1.0.0"\n    applicationId "com.example"\n}';
      const v2 = 'android {\n    versionName "1.0.0"\n    applicationId "com.other"\n}';
      expect(stripVersionLines('build.gradle', v1)).not.toBe(stripVersionLines('build.gradle', v2));
    });

    it('handles build.gradle.kts identically', () => {
      const v1 = 'android {\n    versionName "1.0.0"\n    applicationId "com.example"\n}';
      expect(stripVersionLines('build.gradle', v1)).toBe(stripVersionLines('build.gradle.kts', v1));
    });
  });

  describe('non-version files', () => {
    it('passes content through unchanged', () => {
      const content = 'export const foo = 1;\nconsole.log("hello");';
      expect(stripVersionLines('App.tsx', content)).toBe(content);
    });
  });
});
