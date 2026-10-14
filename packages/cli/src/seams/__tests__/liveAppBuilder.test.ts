/**
 * The live app builder's questions about the machine - the build tools, Java, the iOS schemes -
 * its run of a project's own build command, and its per-file hashes of the native folders.
 *
 * Every process goes through a fake runner, so nothing here needs Xcode, Java or an Android SDK.
 * The per-file hashes run the real fingerprint library over a tiny project: a mock could only
 * prove what the mock was told.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeBaseFingerprint } from '../../helpers/fingerprint/baseFingerprint';
import { makeLiveAppBuilder, type RunProcess } from '../appBuilder';

// The base fingerprint also asks React Native which modules the app links; a tiny project has
// none to tell, so only git is answered for real.
vi.mock('../../helpers/runShellCommand', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../helpers/runShellCommand')>();
  return {
    default: (options: { command: string }) =>
      options.command.startsWith('git ')
        ? real.default(options as never)
        : Promise.reject(new Error('not available in test')),
  };
});

type ProcessCall = Parameters<RunProcess>[0];

let projectRoot: string;
let calls: ProcessCall[];

/** A runner that records each call, writes `output` to its log and exits with `exitCode`. */
function answeringRunner(answer: (call: ProcessCall) => { exitCode: number; output?: string }) {
  const runProcess: RunProcess = async (call) => {
    calls.push(call);
    const { exitCode, output = '' } = answer(call);
    fs.mkdirSync(path.dirname(call.logPath), { recursive: true });
    fs.appendFileSync(call.logPath, output);
    return exitCode;
  };
  return runProcess;
}

const runsNothing = answeringRunner(() => {
  throw new Error('nothing should run');
});

function writeFile(relativePath: string, content: string): void {
  const filePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

/** Run `check` with `process.platform` set to `platform`. */
async function onPlatform<T>(platform: NodeJS.Platform, check: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: platform });
  try {
    return await check();
  } finally {
    Object.defineProperty(process, 'platform', original);
  }
}

beforeEach(() => {
  projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-live-builder-')));
  calls = [];
  vi.stubEnv('ANDROID_HOME', '');
  vi.stubEnv('ANDROID_SDK_ROOT', '');
  vi.stubEnv('JAVA_HOME', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe('live app builder, the machine', () => {
  it("finds the Android SDK where ANDROID_HOME, ANDROID_SDK_ROOT or the project's sdk.dir line names it, and nowhere else", async () => {
    const sdkFolder = path.join(projectRoot, 'sdk');
    fs.mkdirSync(sdkFolder);
    const builder = makeLiveAppBuilder(runsNothing);
    const hasSdk = () => builder.hasTool('android-sdk', projectRoot);

    // Nothing names one.
    expect(await hasSdk()).toBe(false);

    vi.stubEnv('ANDROID_HOME', sdkFolder);
    expect(await hasSdk()).toBe(true);
    vi.stubEnv('ANDROID_HOME', path.join(projectRoot, 'missing'));
    expect(await hasSdk()).toBe(false);

    vi.stubEnv('ANDROID_SDK_ROOT', sdkFolder);
    expect(await hasSdk()).toBe(true);
    vi.stubEnv('ANDROID_SDK_ROOT', '');

    // local.properties escapes the characters Java's properties format reserves.
    writeFile('android/local.properties', `# written by Android Studio\nsdk.dir=${sdkFolder}\n`);
    expect(await hasSdk()).toBe(true);
    writeFile('android/local.properties', `sdk.dir=${sdkFolder.replace(/[:\\]/g, '\\$&')}\n`);
    expect(await hasSdk()).toBe(true);
    writeFile('android/local.properties', `sdk.dir=${path.join(projectRoot, 'missing')}\n`);
    expect(await hasSdk()).toBe(false);

    expect(calls).toEqual([]);
  });

  it('finds Xcode only on a Mac where xcodebuild answers', async () => {
    const xcodeAnswers = makeLiveAppBuilder(
      answeringRunner(() => ({ exitCode: 0, output: 'Xcode 16.2\nBuild version 16C5032a\n' }))
    );
    const xcodeMissing = makeLiveAppBuilder(
      answeringRunner(() => ({ exitCode: 1, output: 'xcode-select: error\n' }))
    );

    expect(await onPlatform('darwin', () => xcodeAnswers.hasTool('xcode', projectRoot))).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ command: 'xcodebuild', args: ['-version'] });

    expect(await onPlatform('darwin', () => xcodeMissing.hasTool('xcode', projectRoot))).toBe(
      false
    );

    calls = [];
    expect(await onPlatform('linux', () => xcodeAnswers.hasTool('xcode', projectRoot))).toBe(false);
    expect(calls).toEqual([]);
  });

  it('reads the major Java version a Gradle build would run on, JAVA_HOME first, and answers null with no Java', async () => {
    // `java -version` writes to stderr, which the runner keeps in the same log.
    const javaSays = (output: string) =>
      makeLiveAppBuilder(answeringRunner(() => ({ exitCode: 0, output })));

    const modern = 'openjdk version "17.0.2" 2022-01-18\nOpenJDK Runtime Environment\n';
    expect(await javaSays(modern).javaVersion()).toBe(17);
    expect(calls[0]).toMatchObject({ command: 'java', args: ['-version'] });

    const legacy = 'Picked up JAVA_TOOL_OPTIONS: -Xmx1g\njava version "1.8.0_292"\n';
    expect(await javaSays(legacy).javaVersion()).toBe(8);
    expect(await javaSays('openjdk version "21" 2023-09-19\n').javaVersion()).toBe(21);

    calls = [];
    const javaHome = path.join(projectRoot, 'jdk');
    vi.stubEnv('JAVA_HOME', javaHome);
    expect(await javaSays(modern).javaVersion()).toBe(17);
    expect(calls[0].command).toBe(path.join(javaHome, 'bin', 'java'));

    // No Java: the runner could not start it, or it said it has none.
    const noJava = makeLiveAppBuilder(
      answeringRunner(() => ({ exitCode: 1, output: 'spawn java ENOENT\n' }))
    );
    expect(await noJava.javaVersion()).toBeNull();
    expect(await javaSays('Unable to locate a Java Runtime.\n').javaVersion()).toBeNull();
  });

  it("lists the iOS workspace's schemes without the CocoaPods ones", async () => {
    fs.mkdirSync(path.join(projectRoot, 'ios/Storefront.xcworkspace'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'ios/Storefront.xcodeproj'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'ios/Pods/Pods.xcodeproj'), { recursive: true });
    const podSchemes = ['Pods-Storefront', 'React-Core', 'Yoga'];
    const xcodebuild = answeringRunner((call) => {
      if (call.args.includes('Pods/Pods.xcodeproj')) {
        return { exitCode: 0, output: JSON.stringify({ project: { schemes: podSchemes } }) };
      }
      const workspace = { schemes: ['Storefront', 'StorefrontStaging', ...podSchemes] };
      // xcodebuild may warn before the JSON.
      return { exitCode: 0, output: `warning: stale\n${JSON.stringify({ workspace })}\n` };
    });

    const schemes = await makeLiveAppBuilder(xcodebuild).listIosSchemes(projectRoot);

    expect(schemes).toEqual(['Storefront', 'StorefrontStaging']);
    expect(calls[0]).toMatchObject({
      command: 'xcodebuild',
      args: ['-list', '-json', '-workspace', 'Storefront.xcworkspace'],
      cwd: path.join(projectRoot, 'ios'),
    });

    // With no workspace, the project's own schemes are listed.
    fs.rmSync(path.join(projectRoot, 'ios/Storefront.xcworkspace'), { recursive: true });
    fs.rmSync(path.join(projectRoot, 'ios/Pods'), { recursive: true });
    calls = [];
    const projectOnly = answeringRunner(() => ({
      exitCode: 0,
      output: JSON.stringify({ project: { schemes: ['Storefront'] } }),
    }));
    expect(await makeLiveAppBuilder(projectOnly).listIosSchemes(projectRoot)).toEqual([
      'Storefront',
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(['-list', '-json', '-project', 'Storefront.xcodeproj']);
  });
});

describe('live app builder, the build', () => {
  it("runs a project's own build command with the build's variables and answers the app build at its output path", async () => {
    writeFile('eas.json', JSON.stringify({ build: { sherlo: { env: { FROM_PROFILE: 'yes' } } } }));
    const custom = { command: 'make app && echo done', output: 'out/app.apk' };
    const ownCommand = answeringRunner((call) => {
      writeFile(custom.output, 'apk bytes');
      return { exitCode: 0, output: `building in ${call.cwd}\n` };
    });

    const compiled = await makeLiveAppBuilder(ownCommand).compile({
      platform: 'android',
      projectRoot,
      env: { FROM_CONFIG: 'yes' },
      logPath: '.sherlo/build-android.log',
      androidTask: ':app:assembleRelease',
      custom,
    });

    expect(compiled).toEqual({
      ok: true,
      path: path.join(projectRoot, 'out/app.apk'),
      sizeMb: '0.00',
      seconds: 0,
      podFilesChanged: [],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      command: custom.command,
      args: [],
      shell: true,
      cwd: projectRoot,
      logPath: path.join(projectRoot, '.sherlo/build-android.log'),
    });
    expect(calls[0].env).toMatchObject({
      FROM_PROFILE: 'yes',
      FROM_CONFIG: 'yes',
      SHERLO_BUILD: 'storybook',
    });

    // A command that fails, or finishes without writing the app build, is a failed build.
    const failing = answeringRunner(() => ({ exitCode: 2, output: 'make: *** Error 2\n' }));
    expect(
      await makeLiveAppBuilder(failing).compile({
        platform: 'ios',
        projectRoot,
        env: {},
        logPath: '.sherlo/build-ios.log',
        custom: { command: 'make', output: 'out/App.app' },
      })
    ).toMatchObject({ ok: false, lastLines: ['make: *** Error 2'] });
    const writesNothing = answeringRunner(() => ({ exitCode: 0 }));
    expect(
      await makeLiveAppBuilder(writesNothing).compile({
        platform: 'ios',
        projectRoot,
        env: {},
        logPath: '.sherlo/build-ios.log',
        custom: { command: 'make', output: 'out/App.app' },
      })
    ).toMatchObject({ ok: false });
  });

  it('hashes each file of the named native folders the way the base fingerprint hashes the folder', async () => {
    writeFile('package.json', JSON.stringify({ name: 'bare-app' }));
    // Takes React Native's autolinking from Expo's, which the project does not install.
    writeFile('fingerprint.config.js', 'module.exports = { useRNCoreAutolinkingFromExpo: true };');
    writeFile('android/app/build.gradle', 'android {\n  versionCode 1\n}\n');
    writeFile('android/settings.gradle', "include ':app'\n");
    writeFile('ios/App/Info.plist', '<dict><key>Name</key><string>App</string></dict>');
    const builder = makeLiveAppBuilder(runsNothing);

    const androidFiles = await builder.hashNativeFolderFiles({ projectRoot, folders: ['android'] });

    expect(androidFiles.map((file) => file.path).sort()).toEqual([
      'android/app/build.gradle',
      'android/settings.gradle',
    ]);
    const baseFingerprint = await computeBaseFingerprint(projectRoot);
    expect(androidFiles).toEqual(baseFingerprint.android.preimage?.nativeFolderFiles);

    // The same version-stripping: a version bump alone changes no file's hash.
    writeFile('android/app/build.gradle', 'android {\n  versionCode 2\n}\n');
    expect(await builder.hashNativeFolderFiles({ projectRoot, folders: ['android'] })).toEqual(
      androidFiles
    );
    expect(calls).toEqual([]);
  });
});
