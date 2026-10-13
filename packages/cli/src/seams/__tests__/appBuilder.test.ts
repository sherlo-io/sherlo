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
      path: path.join(projectRoot, 'android/app/build/outputs/apk/release', APK_FILE),
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

  it('a run that reaches the app builder with no appBuild in the pose is refused before anything on this machine is looked at', async () => {
    const builder = posedAppBuilder(undefined);
    await expect(builder.hasTool('android-sdk')).rejects.toThrow('states no `appBuild`');
    await expect(compileAndroid(builder)).rejects.toThrow('states no `appBuild`');
    expect(builder.refusals().map((refusal) => refusal.call)).toEqual(['hasTool', 'compile']);
    expect(calls).toEqual([]);
  });
});

describe('app builder, iOS', () => {
  it.todo('builds iOS with xcodebuild in Release for the arm64 simulator, with code signing off');
  it.todo("builds iOS with Xcode's compilation cache on in Xcode's own folder, and no dSYM");
  it.todo("finds the iOS app build through xcodebuild's build settings, never by scanning");
  it.todo('runs pod install before every iOS build, with SHERLO_BUILD set to storybook');
  it.todo('warns once when pod install changes files the project does not commit');
  it.todo("switches expo-updates off in the built iOS app's Expo.plist");
});
