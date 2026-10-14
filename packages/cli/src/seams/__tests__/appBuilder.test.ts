import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildEnvironment,
  makeLiveAppBuilder,
  posedAppBuilder,
  type AppBuilder,
  type RunProcess,
} from '../appBuilder';
import { GRADLE_INIT_SCRIPT } from '../gradleInitScript';

type ProcessCall = Parameters<RunProcess>[0];

const APK_FILE = 'app-arm64-v8a-release.apk';

let projectRoot: string;
let cacheDir: string;
let calls: ProcessCall[];
/** What the fake Gradle does: write the folder a real build leaves, or fail. */
let gradleOutcome: 'builds' | 'fails';

/** The process runner of these tests: it records every call and plays Gradle and expo prebuild. */
const fakeRunProcess: RunProcess = async (call) => {
  calls.push(call);
  if (call.args[0] === 'expo') {
    // expo prebuild: makes the native folder and adds scripts to package.json.
    fs.mkdirSync(path.join(call.cwd, 'android'), { recursive: true });
    fs.writeFileSync(path.join(call.cwd, 'package.json'), '{"scripts":{"android":"expo run"}}');
    return 0;
  }
  fs.appendFileSync(call.logPath, 'FAILURE: Build failed with an exception.\n');
  if (gradleOutcome === 'fails') return 1;
  const apkFolder = path.join(call.cwd, 'app/build/outputs/apk/release');
  fs.mkdirSync(apkFolder, { recursive: true });
  fs.writeFileSync(path.join(apkFolder, APK_FILE), 'apk bytes');
  fs.writeFileSync(
    path.join(apkFolder, 'output-metadata.json'),
    JSON.stringify({ elements: [{ outputFile: APK_FILE }] })
  );
  return 0;
};

function liveBuilder(): AppBuilder {
  return makeLiveAppBuilder(fakeRunProcess);
}

function compileAndroid(
  builder: AppBuilder,
  extra: Partial<Parameters<AppBuilder['compile']>[0]> = {}
) {
  return builder.compile({
    platform: 'android',
    projectRoot,
    env: {},
    logPath: '.sherlo/build-android.log',
    androidTask: ':app:assembleRelease',
    ...extra,
  });
}

function gradleCall(): ProcessCall {
  const call = calls.find((candidate) => candidate.args[0] !== 'expo');
  if (!call) throw new Error('Gradle never ran');
  return call;
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-app-builder-'));
  cacheDir = path.join(projectRoot, 'cache');
  calls = [];
  gradleOutcome = 'builds';
  fs.mkdirSync(path.join(projectRoot, 'android'));
  fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"app"}');
});

afterEach(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe('app builder, Android', () => {
  it('builds Android with :app:assembleRelease for arm64-v8a only', async () => {
    await compileAndroid(liveBuilder());
    expect(gradleCall().args).toContain(':app:assembleRelease');
    expect(gradleCall().args).toContain('-PreactNativeArchitectures=arm64-v8a');
    expect(gradleCall().args).not.toContain('assembleRelease');
  });

  it('runs Gradle with an 8 GB heap and 2 GB of metaspace', async () => {
    await compileAndroid(liveBuilder());
    expect(gradleCall().args).toContain(
      '-Dorg.gradle.jvmargs=-Xmx8192m -XX:MaxMetaspaceSize=2048m'
    );
  });

  it('runs Gradle with its build cache on', async () => {
    await compileAndroid(liveBuilder());
    expect(gradleCall().args).toContain('--build-cache');
    expect(gradleCall().args).not.toContain('--configuration-cache');
  });

  it('the Gradle init script forces the debug signing key on the release build', async () => {
    await compileAndroid(liveBuilder());
    const flagIndex = gradleCall().args.indexOf('-I');
    const written = fs.readFileSync(gradleCall().args[flagIndex + 1], 'utf8');
    expect(written).toBe(GRADLE_INIT_SCRIPT);
    expect(written).toContain('finalizeDsl');
    expect(written).toContain("signingConfigs.getByName('debug')");
    expect(written).toContain('buildType.signingConfig = debugSigning');
  });

  it('the Gradle init script ships inside the compiled CLI as text, never as a file read beside it', () => {
    const source = fs.readFileSync(path.join(__dirname, '../appBuilder.ts'), 'utf8');
    expect(typeof GRADLE_INIT_SCRIPT).toBe('string');
    expect(GRADLE_INIT_SCRIPT.length).toBeGreaterThan(0);
    // The builder writes the text it holds and reads no script file from beside its own code.
    expect(source).not.toMatch(/__dirname|import\.meta|\.init\.gradle'\)/);
  });

  it('the Gradle init script switches expo-updates off in the merged manifest and edits no file of the app', () => {
    expect(GRADLE_INIT_SCRIPT).toContain('MERGED_MANIFEST');
    expect(GRADLE_INIT_SCRIPT).toContain('expo\\.modules\\.updates\\.ENABLED');
    expect(GRADLE_INIT_SCRIPT).toContain('android:value="false"');
    // It reads and writes the task's own manifest files only, never a path of the project.
    expect(GRADLE_INIT_SCRIPT).not.toMatch(/projectDir|rootDir|AndroidManifest\.xml/);
  });

  it("removes Gradle's saved autolinking answer before every Android build", async () => {
    const answer = path.join(projectRoot, 'android/build/generated/autolinking/autolinking.json');
    fs.mkdirSync(path.dirname(answer), { recursive: true });
    fs.writeFileSync(answer, '{}');
    let answerWhenGradleRan: boolean | undefined;
    const builder = makeLiveAppBuilder(async (call) => {
      answerWhenGradleRan = fs.existsSync(answer);
      return fakeRunProcess(call);
    });
    await compileAndroid(builder);
    expect(answerWhenGradleRan).toBe(false);
  });

  it('finds the Android app build through output-metadata.json', async () => {
    const result = await compileAndroid(liveBuilder());
    expect(result).toMatchObject({
      ok: true,
      path: path.join(projectRoot, '.sherlo/build/android', APK_FILE),
    });
  });

  it('removes the native folder expo prebuild made and puts package.json back', async () => {
    fs.rmSync(path.join(projectRoot, 'android'), { recursive: true });
    const original = '{"name":"app",\n  "version":"1.0.0"}\n';
    fs.writeFileSync(path.join(projectRoot, 'package.json'), original);
    const builder = liveBuilder();
    await builder.generateNativeFolder({ platform: 'android', projectRoot, env: {} });
    // The compile needs the folder prebuild made, so it is still there until the build ends.
    expect(fs.existsSync(path.join(projectRoot, 'android'))).toBe(true);
    await compileAndroid(builder);
    expect(fs.existsSync(path.join(projectRoot, 'android'))).toBe(false);
    expect(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).toBe(original);
  });

  it("runs expo prebuild with the build's variables", async () => {
    fs.rmSync(path.join(projectRoot, 'android'), { recursive: true });
    await liveBuilder().generateNativeFolder({
      platform: 'android',
      projectRoot,
      env: { USE_NEW_ARCH: '1' },
    });
    const prebuild = calls[0];
    expect(prebuild.args).toEqual(['expo', 'prebuild', '--platform', 'android', '--no-install']);
    expect(prebuild.env.USE_NEW_ARCH).toBe('1');
    expect(prebuild.env.SHERLO_BUILD).toBe('storybook');
  });

  it("passes build.env and the eas.json profile's env to the build and to the bundler", async () => {
    fs.writeFileSync(
      path.join(projectRoot, 'eas.json'),
      JSON.stringify({
        build: {
          base: { env: { FROM_BASE: 'base', SHARED: 'base' } },
          sherlo: { extends: 'base', env: { FROM_PROFILE: 'profile', SHARED: 'profile' } },
        },
      })
    );
    await compileAndroid(liveBuilder(), { env: { FROM_CONFIG: 'config' } });
    const expected = { FROM_BASE: 'base', FROM_PROFILE: 'profile', FROM_CONFIG: 'config' };
    expect(gradleCall().env).toMatchObject({ ...expected, SHARED: 'profile' });
    // The bundler asks the same function.
    expect(
      buildEnvironment({ projectRoot, buildEnv: { FROM_CONFIG: 'config' }, shellEnv: {} })
    ).toMatchObject({ ...expected, SHARED: 'profile' });
  });

  it('sets SHERLO_BUILD to storybook last, over the shell, the eas.json profile env and build.env', () => {
    fs.writeFileSync(
      path.join(projectRoot, 'eas.json'),
      JSON.stringify({ build: { sherlo: { env: { SHERLO_BUILD: 'profile', ORDER: 'profile' } } } })
    );
    const env = buildEnvironment({
      projectRoot,
      buildEnv: { SHERLO_BUILD: 'config', ORDER: 'config' },
      shellEnv: { SHERLO_BUILD: 'shell', ORDER: 'shell', ONLY_SHELL: 'yes' },
    });
    expect(env.SHERLO_BUILD).toBe('storybook');
    expect(env.ORDER).toBe('config');
    expect(env.ONLY_SHELL).toBe('yes');
  });

  it('keeps an app build in a folder named by its cache key, directly inside the local build cache', async () => {
    const apk = path.join(projectRoot, 'built.apk');
    fs.writeFileSync(apk, 'apk bytes');
    const builder = liveBuilder();
    await builder.keepInCache({
      platform: 'android',
      cacheKey: 'android-fp-abc',
      cacheDir,
      path: apk,
    });
    expect(fs.readdirSync(cacheDir)).toEqual(['android-fp-abc']);
    expect(fs.readdirSync(path.join(cacheDir, 'android-fp-abc'))).toEqual(['built.apk']);
    expect(
      await builder.findCachedBuild({ platform: 'android', cacheKey: 'android-fp-abc', cacheDir })
    ).toBe(path.join(cacheDir, 'android-fp-abc', 'built.apk'));
  });

  it('keeps an iOS app build, a folder, in the local build cache and finds it again', async () => {
    const app = path.join(projectRoot, 'Built.app');
    fs.mkdirSync(path.join(app, 'Frameworks'), { recursive: true });
    fs.writeFileSync(path.join(app, 'Info.plist'), 'plist bytes');
    fs.writeFileSync(path.join(app, 'Frameworks', 'inner.bin'), 'inner bytes');
    const builder = liveBuilder();
    await builder.keepInCache({ platform: 'ios', cacheKey: 'ios-fp-abc', cacheDir, path: app });
    const cachedApp = await builder.findCachedBuild({
      platform: 'ios',
      cacheKey: 'ios-fp-abc',
      cacheDir,
    });
    expect(cachedApp).toBe(path.join(cacheDir, 'ios-fp-abc', 'Built.app'));
    expect(fs.readFileSync(path.join(cachedApp!, 'Info.plist'), 'utf8')).toBe('plist bytes');
    expect(fs.readFileSync(path.join(cachedApp!, 'Frameworks', 'inner.bin'), 'utf8')).toBe(
      'inner bytes'
    );
  });

  it('keeping an app build in the local build cache removes nothing from it', async () => {
    const apk = path.join(projectRoot, 'second.apk');
    fs.writeFileSync(apk, 'apk bytes');
    const earlier = path.join(cacheDir, 'android-other-key');
    fs.mkdirSync(earlier, { recursive: true });
    fs.writeFileSync(path.join(earlier, 'first.apk'), 'earlier');
    await liveBuilder().keepInCache({
      platform: 'android',
      cacheKey: 'android-new-key',
      cacheDir,
      path: apk,
    });
    expect(fs.readdirSync(cacheDir).sort()).toEqual(['android-new-key', 'android-other-key']);
    expect(fs.readFileSync(path.join(earlier, 'first.apk'), 'utf8')).toBe('earlier');
  });

  it("a cache hit marks the build's folder as just used", async () => {
    const buildFolder = path.join(cacheDir, 'android-old-key');
    fs.mkdirSync(buildFolder, { recursive: true });
    fs.writeFileSync(path.join(buildFolder, 'old.apk'), 'apk bytes');
    const longAgo = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(buildFolder, longAgo, longAgo);
    await liveBuilder().findCachedBuild({
      platform: 'android',
      cacheKey: 'android-old-key',
      cacheDir,
    });
    expect(fs.statSync(buildFolder).mtimeMs).toBeGreaterThan(Date.now() - 60_000);
  });

  it('a run that reaches the app builder with no appBuild in the pose is refused before anything on this machine is looked at', async () => {
    const builder = posedAppBuilder(undefined);
    await expect(builder.hasTool('android-sdk', projectRoot)).rejects.toThrow(
      'states no `appBuild`'
    );
    await expect(compileAndroid(builder)).rejects.toThrow('states no `appBuild`');
    expect(builder.refusals().map((refusal) => refusal.call)).toEqual(['hasTool', 'compile']);
    expect(calls).toEqual([]);
  });
});

describe('app builder, iOS', () => {
  /** Where the fake Xcode says it builds the app: outside the project, in Xcode's own folder. */
  let xcodeProductsDir: string;
  /** Whether git tracks and holds the files pod install writes. */
  let gitHoldsPodFiles: boolean;
  /** What the fake `pod install` writes to Podfile.lock. */
  let podfileLockAfterInstall: string;

  /** The process runner of the iOS tests: it plays pod install, git, xcodebuild and plutil. */
  const iosRunProcess: RunProcess = async (call) => {
    calls.push(call);
    // The shipped runner makes the log's folder.
    fs.mkdirSync(path.dirname(call.logPath), { recursive: true });
    const lockPath = path.join(call.cwd, 'Podfile.lock');
    if (call.command === 'pod' || call.args[0] === 'exec') {
      fs.writeFileSync(lockPath, podfileLockAfterInstall);
      return 0;
    }
    if (call.command === 'git') return gitHoldsPodFiles ? 0 : 1;
    if (call.command === 'xcodebuild' && call.args.includes('-showBuildSettings')) {
      fs.writeFileSync(
        call.logPath,
        `warning: something\n${JSON.stringify([
          { target: 'Pods', buildSettings: { WRAPPER_NAME: 'Pods.framework' } },
          {
            target: 'App',
            buildSettings: { TARGET_BUILD_DIR: xcodeProductsDir, WRAPPER_NAME: 'App.app' },
          },
        ])}`
      );
      return 0;
    }
    if (call.command === 'xcodebuild') {
      fs.mkdirSync(path.join(xcodeProductsDir, 'App.app'), { recursive: true });
      fs.writeFileSync(path.join(xcodeProductsDir, 'App.app/Expo.plist'), 'plist');
      fs.writeFileSync(path.join(xcodeProductsDir, 'App.app/App'), 'binary bytes');
    }
    return 0;
  };

  function compileIos(
    extra: Partial<Parameters<AppBuilder['compile']>[0]> = {},
    runProcess: RunProcess = iosRunProcess
  ) {
    return makeLiveAppBuilder(runProcess).compile({
      platform: 'ios',
      projectRoot,
      env: {},
      logPath: '.sherlo/build-ios.log',
      ios: { scheme: 'App', configuration: 'Release' },
      ...extra,
    });
  }

  function callsOf(command: string): ProcessCall[] {
    return calls.filter((call) => call.command === command);
  }

  /** The build, as opposed to the question about its settings. */
  function xcodebuildBuildCall(): ProcessCall {
    const call = callsOf('xcodebuild').find((candidate) => candidate.args.includes('build'));
    if (!call) throw new Error('xcodebuild never built');
    return call;
  }

  beforeEach(() => {
    fs.rmSync(path.join(projectRoot, 'android'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'ios/App.xcworkspace'), { recursive: true });
    xcodeProductsDir = path.join(projectRoot, 'xcode-products');
    gitHoldsPodFiles = false;
    podfileLockAfterInstall = 'PODS: one';
  });

  it('builds iOS with xcodebuild in Release for the arm64 simulator, with code signing off', async () => {
    await compileIos();
    const { args, cwd } = xcodebuildBuildCall();
    expect(cwd).toBe(path.join(projectRoot, 'ios'));
    expect(args).toEqual(expect.arrayContaining(['-workspace', 'App.xcworkspace']));
    expect(args).toEqual(expect.arrayContaining(['-scheme', 'App']));
    expect(args).toEqual(expect.arrayContaining(['-configuration', 'Release']));
    expect(args).toEqual(expect.arrayContaining(['-sdk', 'iphonesimulator']));
    expect(args).toContain('ARCHS=arm64');
    expect(args).toContain('CODE_SIGNING_ALLOWED=NO');
    // A derived data path would move Xcode's compilation cache out of its own folder.
    expect(args).not.toContain('-derivedDataPath');
  });

  it("builds iOS with Xcode's compilation cache on in Xcode's own folder, and no dSYM", async () => {
    await compileIos();
    const { args } = xcodebuildBuildCall();
    expect(args).toContain('COMPILATION_CACHE_ENABLE_CACHING=YES');
    expect(args).toContain('DEBUG_INFORMATION_FORMAT=dwarf');
    expect(args.join(' ')).not.toMatch(/COMPILATION_CACHE_CAS_PATH|SWIFT_ENABLE_EXPLICIT_MODULES/);
  });

  it("finds the iOS app build through xcodebuild's build settings, never by scanning", async () => {
    const result = await compileIos();
    const settingsCall = callsOf('xcodebuild').find((call) =>
      call.args.includes('-showBuildSettings')
    );
    expect(settingsCall?.args).toContain('-json');
    // Asked with the arguments of the build, so it answers for the same build.
    for (const argument of xcodebuildBuildCall().args.filter((arg) => arg !== 'build')) {
      expect(settingsCall?.args).toContain(argument);
    }
    expect(result).toMatchObject({ ok: true, path: path.join(xcodeProductsDir, 'App.app') });
  });

  it('runs pod install before every iOS build, with SHERLO_BUILD set to storybook', async () => {
    fs.writeFileSync(path.join(projectRoot, 'Gemfile'), "gem 'cocoapods', '~> 1.15'\n");
    await compileIos({ env: { FROM_CONFIG: 'config' } });
    await compileIos();
    const installs = calls.filter((call) => call.args.includes('install'));
    expect(installs).toHaveLength(2);
    // The Gemfile names cocoapods, so it runs through bundler.
    expect(installs[0]).toMatchObject({ command: 'bundle', args: ['exec', 'pod', 'install'] });
    expect(installs[0].cwd).toBe(path.join(projectRoot, 'ios'));
    expect(installs[0].env).toMatchObject({ SHERLO_BUILD: 'storybook', FROM_CONFIG: 'config' });
    // With no locale in the environment, CocoaPods gets a UTF-8 one.
    const withoutLocale = installs[0].env;
    if (!process.env.LANG && !process.env.LC_ALL) expect(withoutLocale.LANG).toBe('en_US.UTF-8');
    expect(calls.indexOf(installs[0])).toBeLessThan(calls.indexOf(xcodebuildBuildCall()));
  });

  it('runs plain pod install when no Gemfile names cocoapods', async () => {
    await compileIos();
    expect(callsOf('pod')).toHaveLength(1);
    expect(callsOf('bundle')).toHaveLength(0);
  });

  it('warns once when pod install changes files the project does not commit', async () => {
    const builder = makeLiveAppBuilder(iosRunProcess);
    const compile = () =>
      builder.compile({
        platform: 'ios',
        projectRoot,
        env: {},
        logPath: '.sherlo/build-ios.log',
        ios: { scheme: 'App', configuration: 'Release' },
      });
    // The first build writes a Podfile.lock git does not hold: the seam names it.
    expect(await compile()).toMatchObject({ ok: true, podFilesChanged: ['ios/Podfile.lock'] });
    // The next install changes nothing, so it names nothing.
    expect(await compile()).toMatchObject({ ok: true, podFilesChanged: [] });
    // A change git holds is named by nobody.
    podfileLockAfterInstall = 'PODS: two';
    gitHoldsPodFiles = true;
    expect(await compile()).toMatchObject({ ok: true, podFilesChanged: [] });
  });

  it("switches expo-updates off in the built iOS app's Expo.plist", async () => {
    await compileIos();
    const plutil = callsOf('plutil');
    expect(plutil).toHaveLength(1);
    expect(plutil[0].args).toEqual([
      '-replace',
      'EXUpdatesEnabled',
      '-bool',
      'NO',
      path.join(xcodeProductsDir, 'App.app/Expo.plist'),
    ]);
  });

  it('leaves an app with no Expo.plist as it is', async () => {
    const withoutPlist: RunProcess = async (call) => {
      const exitCode = await iosRunProcess(call);
      fs.rmSync(path.join(xcodeProductsDir, 'App.app/Expo.plist'), { force: true });
      return exitCode;
    };
    expect(await compileIos({}, withoutPlist)).toMatchObject({ ok: true });
    expect(callsOf('plutil')).toHaveLength(0);
  });

  it('answers a failed build with the last lines xcodebuild wrote', async () => {
    const failing: RunProcess = async (call) => {
      if (call.command !== 'xcodebuild') return iosRunProcess(call);
      calls.push(call);
      fs.mkdirSync(path.dirname(call.logPath), { recursive: true });
      fs.appendFileSync(call.logPath, '** BUILD FAILED **\n');
      return 65;
    };
    expect(await compileIos({}, failing)).toMatchObject({
      ok: false,
      lastLines: ['** BUILD FAILED **'],
    });
  });
});

describe('app builder, EAS', () => {
  /** A stand-in `eas` that answers the way Expo's does: its log lines, then the JSON list of builds. */
  const easRunProcess: RunProcess = async (call) => {
    calls.push(call);
    fs.mkdirSync(path.dirname(call.logPath), { recursive: true });
    fs.appendFileSync(
      call.logPath,
      '[expo-cli] Resolved "sherlo" environment\n' +
        JSON.stringify(
          [{ id: '6c1f2a9e-build', platform: 'ANDROID', status: 'IN_QUEUE' }],
          null,
          2
        ) +
        '\n'
    );
    return 0;
  };

  it("starts an EAS build with Expo's own command, without waiting, and answers its id", async () => {
    const builder = makeLiveAppBuilder(easRunProcess);

    const started = await builder.startEasBuild({
      platform: 'android',
      profile: 'sherlo',
      projectRoot,
    });

    expect(started).toEqual({ buildId: '6c1f2a9e-build' });
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('eas');
    expect(calls[0].args).toEqual([
      'build',
      '--platform',
      'android',
      '--profile',
      'sherlo',
      '--no-wait',
      '--json',
      '--non-interactive',
    ]);
    expect(calls[0].cwd).toBe(projectRoot);
    // EAS packs the project from git, as it always does.
    expect(calls[0].env.EAS_NO_VCS).toBeUndefined();
  });

  it('refuses when eas build could not start the build, naming its log', async () => {
    const failing: RunProcess = async (call) => {
      calls.push(call);
      return 1;
    };

    await expect(
      makeLiveAppBuilder(failing).startEasBuild({ platform: 'ios', profile: 'sherlo', projectRoot })
    ).rejects.toThrow('`eas build` could not start the ios build - see .sherlo/eas-build-ios.log');
  });
});
