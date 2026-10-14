/**
 * THE APP BUILDER SEAM - everything `sherlo test` and `sherlo build` do to turn the project into an
 * app build on THIS machine.
 *
 *     live   - the operating system the tool runs on, the build tools it finds, the iOS schemes
 *              the workspace lists, the local build cache, `expo prebuild`, Gradle and xcodebuild,
 *              and `eas build` for a project that builds on EAS, with the repository it packs.
 *     posed  - the pose's `appBuild`: which machine it was, which tools were there, and what each
 *              platform's build came to - found in the cache, built, failed, or started on EAS.
 *
 * Building is the slowest thing the tool does and the one that depends most on the machine: a
 * Mac with Xcode, a Linux CI runner with only Java, a laptop whose last build is still in the
 * cache. None of that exists on a machine that only has the pose, so every question of that kind
 * is here, behind one answer, and the shipped code around it - which platforms need a build, the
 * refusals, the order, every printed line - runs unforked over what the pose states.
 *
 * THE POSED HALF NEVER PRINTS. The lines a build prints belong to the render layer; what a pose
 * states is only what happened. A failed build's last log lines are the one exception that is
 * text, and they are the BUILD TOOL's words, not the tool's, exactly as a server's reason is.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Platform } from '@sherlo/api-types';
import { SHERLO_BUILD_FOR_PUSH } from '../commands/test/constants';
import {
  buildLogPath,
  DEFAULT_ANDROID_TASK,
  DEFAULT_EAS_PROFILE,
} from '../commands/test/appBuild/buildSettings';
import { makeProjectSherloFolder } from '../commands/test/appBuild/cacheFolder';
import { hashNativeFolderFiles } from '../helpers/fingerprint/baseFingerprint';
import { withTheMachineEnv } from '../helpers/fingerprint/deterministicEnv';
import { readProjectJson } from '../helpers/projectJson';
import { GRADLE_INIT_SCRIPT, GRADLE_INIT_SCRIPT_PATH } from './gradleInitScript';
import type { NativeFolderFile } from './serverCalls';

/** The build tools a platform needs on the machine, apart from Java, whose version matters too. */
export type BuildTool = 'android-sdk' | 'xcode';

/** The operating systems the tool tells apart for building. */
export type HostSystem = 'macos' | 'linux' | 'windows';

/** What one compile came to. */
export type CompiledApp =
  | {
      ok: true;
      /** Where the app build was written. */
      path: string;
      /** What the build line announces, e.g. `"53.90"`. */
      sizeMb: string;
      /** How long the compile took, in whole seconds. */
      seconds: number;
      /**
       * The files `pod install` changed that git does not hold the change of (`Podfile.lock`,
       * `project.pbxproj`), by path from the project root; empty when there are none, and always
       * on Android. The change moves the base fingerprint, so the render layer tells the person
       * to commit it - the builder only answers.
       */
      podFilesChanged: string[];
    }
  | {
      ok: false;
      /** How long the compile ran before it failed, in whole seconds. */
      seconds: number;
      /** The last lines the build tool wrote, as it wrote them. */
      lastLines: string[];
    };

type CompileParams = Parameters<AppBuilder['compile']>[0];

/** Every act a build performs on the machine, and every question it asks of it. */
export type AppBuilder = {
  /** The operating system the tool runs on. */
  hostSystem(): HostSystem;
  /**
   * Whether a build tool is installed where a build would look for it. The project is asked too:
   * its `android/local.properties` may name the Android SDK.
   */
  hasTool(tool: BuildTool, projectRoot: string): Promise<boolean>;
  /** The major version of the Java a Gradle build would run on, or null when there is none. */
  javaVersion(): Promise<number | null>;
  /** The schemes the iOS workspace lists, apart from the CocoaPods ones. */
  listIosSchemes(projectRoot: string): Promise<string[]>;
  /** The app build the cache holds under a key, or null. */
  findCachedBuild(params: {
    platform: Platform;
    cacheKey: string;
    cacheDir: string;
  }): Promise<string | null>;
  /** Keep a fresh app build in the cache under its key. */
  keepInCache(params: {
    platform: Platform;
    cacheKey: string;
    cacheDir: string;
    path: string;
  }): Promise<void>;
  /** Run `expo prebuild` for one platform, and put the project back as it was afterwards. */
  generateNativeFolder(params: {
    platform: Platform;
    projectRoot: string;
    env: Record<string, string>;
    /** The eas.json profile whose env joins the build's variables (default `sherlo`). */
    easProfile?: string;
  }): Promise<void>;
  /** Compile one platform's app, writing everything the build tool says to `logPath`. */
  compile(params: {
    platform: Platform;
    projectRoot: string;
    env: Record<string, string>;
    /** The eas.json profile whose env joins the build's variables (default `sherlo`). */
    easProfile?: string;
    logPath: string;
    /** The Gradle task for Android, e.g. `:app:assembleRelease`. */
    androidTask?: string;
    /** The scheme and configuration for iOS. */
    ios?: { scheme: string; configuration: string };
    /** The project's own build command, run instead of Sherlo's, and where it writes the app build. */
    custom?: { command: string; output: string };
  }): Promise<CompiledApp>;
  /** Start an EAS build of one platform with one profile, and answer its id without waiting. */
  startEasBuild(params: {
    platform: Platform;
    profile: string;
    projectRoot: string;
  }): Promise<{ buildId: string }>;
  /**
   * The folder EAS packs the project from: the root of the git repository the project sits in, or
   * the project itself outside git.
   */
  easUploadRoot(projectRoot: string): string;
  /**
   * A file of the folder EAS packs - an `.easignore` or a `.gitignore` - by its path from that
   * folder, or undefined when there is none. With `easUploadRoot`, the one look above the project
   * a build takes.
   */
  readEasUploadFile(params: { easUploadRoot: string; fileFromTheRoot: string }): string | undefined;
  /**
   * Every file inside the named native folders (`android`, `ios`), one hash each, for the list of
   * what changed since the stored app build - and for the list a stored app build keeps. Asked
   * only on the way to a build, never by the staged gate: the base fingerprint still hashes each
   * folder as one source, and these hashes never enter it.
   *
   * The live body writes no walk of its own: @expo/fingerprint already
   * hashes each file of a folder source on its way to the folder's hash, and hands them back
   * under the source's `debugInfo` when called with `debug: true`. Calling it with the base
   * fingerprint's own options and deterministic env (helpers/fingerprint/baseFingerprint.ts) and
   * flattening the named folders' `debugInfo.children` gives the files the folder hash was made
   * of: the same ignore list (its DEFAULT_IGNORE_PATHS - build outputs, Pods, `.gradle`, `.cxx`,
   * xcuserdata - plus the project's `.fingerprintignore`), and the same version-stripping
   * transform, so a version bump alone changes no file's hash here either.
   */
  hashNativeFolderFiles(params: {
    projectRoot: string;
    folders: string[];
  }): Promise<NativeFolderFile[]>;
};

/* ========================================================================== */
/* The build environment                                                      */
/* ========================================================================== */

/**
 * The variables a build and the bundler run with, in order: the shell, then the env of the
 * eas.json profile (a profile's `extends` is followed), then `build.env`, then `SHERLO_BUILD`
 * set to storybook last, so no setting of the project can turn Sherlo off. The one place this is
 * composed: the app build and the bundle `sherlo test` builds both call it.
 */
export function buildEnvironment({
  projectRoot,
  easProfile = DEFAULT_EAS_PROFILE,
  buildEnv = {},
  shellEnv = process.env,
}: {
  projectRoot: string;
  /** The eas.json profile whose env is borrowed. */
  easProfile?: string;
  /** The config's `build.env`. */
  buildEnv?: Record<string, string>;
  shellEnv?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  return {
    ...shellEnv,
    ...easProfileEnv(projectRoot, easProfile),
    ...buildEnv,
    SHERLO_BUILD: SHERLO_BUILD_FOR_PUSH,
  };
}

/** The `env` of an eas.json profile, its `extends` chain laid under it. Empty when there is none. */
function easProfileEnv(projectRoot: string, profileName: string): Record<string, string> {
  const profiles = readProjectJson(projectRoot, 'eas.json')?.build ?? {};
  const chain: Record<string, string>[] = [];
  const seen = new Set<string>();
  for (
    let name: string | undefined = profileName;
    name && profiles[name] && !seen.has(name);
    name = profiles[name].extends
  ) {
    seen.add(name);
    chain.unshift(profiles[name].env ?? {});
  }
  return Object.assign({}, ...chain);
}

/* ========================================================================== */
/* The live builder                                                           */
/* ========================================================================== */

/** How many of a failed build's last lines the run shows. */
const LAST_LINES_SHOWN = 30;

/** Gradle's home keeps its own build cache; these flags turn it on and size the daemon. */
const GRADLE_FLAGS = [
  '-PreactNativeArchitectures=arm64-v8a',
  '--build-cache',
  '-Dorg.gradle.jvmargs=-Xmx8192m -XX:MaxMetaspaceSize=2048m',
  '--console=plain',
];

/**
 * Gradle's saved answer to which native modules the app links, from the project's root. Its answer
 * depends on SHERLO_BUILD, so it is removed before every build and decided again.
 */
const AUTOLINKING_ANSWER_PATH = 'android/build/generated/autolinking/autolinking.json';

/** Runs a program with its output appended to a log file, and answers its exit code. */
export type RunProcess = (params: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  logPath: string;
  /** Run `command` as a line of the system shell (`sh`, or `cmd.exe` on Windows), with no args. */
  shell?: boolean;
}) => Promise<number>;

/** The shipped process runner. */
const runProcessForReal: RunProcess = ({ command, args, cwd, env, logPath, shell = false }) =>
  new Promise((resolve) => {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const logFile = fs.openSync(logPath, 'a');
    const child = spawn(command, args, { cwd, env, shell, stdio: ['ignore', logFile, logFile] });
    // A program that cannot start emits `error` and then `close`: the first one answers.
    let answered = false;
    const answer = (exitCode: number) => {
      if (answered) return;
      answered = true;
      fs.closeSync(logFile);
      resolve(exitCode);
    };
    child.on('error', (error) => {
      fs.appendFileSync(logPath, `${error.message}\n`);
      answer(1);
    });
    child.on('close', (exitCode) => answer(exitCode ?? 1));
  });

/** The module and variant a Gradle task such as `:app:assembleRelease` builds. */
function moduleAndVariantOf(task: string): { module: string; variant: string } {
  const match = /^:?(?:(.+):)?assemble(\w+)$/.exec(task);
  if (!match) {
    throw new Error(
      `Cannot tell which app \`${task}\` builds: expected :<module>:assemble<Variant>`
    );
  }
  const [, module = 'app', variantName] = match;
  return { module, variant: variantName.charAt(0).toLowerCase() + variantName.slice(1) };
}

/** The folder Gradle writes a variant's APK to: `release`, or `<flavor>/<buildType>`. */
function apkFolderOf(variant: string): string {
  const flavorAndBuildType = /^(.+?)([A-Z][a-z]+)$/.exec(variant);
  if (!flavorAndBuildType) return variant;
  return path.join(flavorAndBuildType[1], flavorAndBuildType[2].toLowerCase());
}

/** The workspace `xcodebuild` builds from the iOS folder, or else its project. */
function xcodeContainerArguments(iosFolder: string): string[] {
  const names = fs.readdirSync(iosFolder);
  const workspace = names.find((name) => name.endsWith('.xcworkspace'));
  if (workspace) return ['-workspace', workspace];
  const project = names.find((name) => name.endsWith('.xcodeproj'));
  return project ? ['-project', project] : [];
}

/** The `.app` the first app target of an `xcodebuild -showBuildSettings -json` answer builds. */
function appPathFromBuildSettings(settingsPath: string): string | undefined {
  const text = readTextIfThere(settingsPath);
  // xcodebuild may print warnings before the JSON, and a warning may hold a bracket of its own
  // ("variant:Designed for [iPad,iPhone]"), so the JSON starts at a bracket that opens its line and
  // ends it or opens an object.
  const jsonStart = text.search(/^\[\s*(\{|$)/m);
  if (jsonStart === -1) return undefined;
  const targets: { buildSettings: Record<string, string> }[] = JSON.parse(text.slice(jsonStart));
  const app = targets.find((target) => target.buildSettings.WRAPPER_NAME?.endsWith('.app'));
  return app && path.join(app.buildSettings.TARGET_BUILD_DIR, app.buildSettings.WRAPPER_NAME);
}

/** The files `pod install` writes, by path from the project root, with the bytes each holds. */
function readPodTouchedFiles(projectRoot: string): Map<string, Buffer> {
  const iosFolder = path.join(projectRoot, 'ios');
  const files = ['ios/Podfile.lock'];
  if (fs.existsSync(iosFolder)) {
    for (const name of fs.readdirSync(iosFolder)) {
      if (name.endsWith('.xcodeproj')) files.push(`ios/${name}/project.pbxproj`);
    }
  }
  const contents = new Map<string, Buffer>();
  for (const file of files) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) contents.set(file, fs.readFileSync(filePath));
  }
  return contents;
}

/** Where starting one platform's EAS build writes everything `eas build` says. */
function easStartLogPath(platform: Platform): string {
  return `.sherlo/eas-build-${platform}.log`;
}

/**
 * The id of the build `eas build --no-wait --json` started, out of what it wrote: its answer is a
 * JSON list of the builds it started, `[{ "id": ..., "platform": "ANDROID", ... }]`, printed last,
 * after whatever it said on the way. Undefined when no such list is there.
 */
function easBuildIdIn(output: string): string | undefined {
  // The list starts on a line of its own; the last one that reads as a list of builds is the answer.
  const listStarts = [...output.matchAll(/^\[/gm)].map((match) => match.index ?? 0).reverse();
  for (const start of listStarts) {
    try {
      const builds: unknown = JSON.parse(output.slice(start, output.lastIndexOf(']') + 1));
      const id = Array.isArray(builds) ? (builds[0] as { id?: unknown })?.id : undefined;
      if (typeof id === 'string') return id;
    } catch {
      // Not the answer: a line of its log that happened to start with a bracket.
    }
  }
  return undefined;
}

function readTextIfThere(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

/** The bytes of every file under a folder. */
function folderSizeBytes(folder: string): number {
  return fs.readdirSync(folder, { withFileTypes: true }).reduce((total, entry) => {
    const entryPath = path.join(folder, entry.name);
    return (
      total + (entry.isDirectory() ? folderSizeBytes(entryPath) : fs.lstatSync(entryPath).size)
    );
  }, 0);
}

function isFolder(folderPath: string | undefined): boolean {
  if (!folderPath || !fs.existsSync(folderPath)) return false;
  return fs.statSync(folderPath).isDirectory();
}

/**
 * The folder the `sdk.dir` line of the project's `android/local.properties` names, or undefined.
 * The file is in Java's properties format, which escapes `:` and `\` with a backslash, and a
 * relative folder is read from the `android` folder, as Gradle reads it.
 */
function sdkDirOfLocalProperties(projectRoot: string): string | undefined {
  const androidFolder = path.join(projectRoot, 'android');
  const properties = readTextIfThere(path.join(androidFolder, 'local.properties'));
  const sdkDirLine = /^\s*sdk\.dir\s*[=:]\s*(.*?)\s*$/m.exec(properties);
  if (!sdkDirLine) return undefined;
  const sdkDir = sdkDirLine[1].replace(/\\(.)/g, '$1');
  return path.resolve(androidFolder, sdkDir);
}

/**
 * The major version `java -version` reports: `"17.0.2"` is 17, `"21"` is 21, and the old
 * `"1.8.0_292"` is 8. Null when it reports none.
 */
function javaMajorVersionIn(output: string): number | null {
  const version = /version "(\d+)(?:\.(\d+))?/.exec(output);
  if (!version) return null;
  const [, first, second] = version;
  return Number(first === '1' && second ? second : first);
}

/**
 * The schemes an `xcodebuild -list -json` answer lists, for a workspace or a project. xcodebuild
 * may print warnings before the JSON, and a destination warning's line opens with a brace of its
 * own (`{ platform:macOS, ... }`), so the JSON starts at a brace that ends its line or opens a key.
 */
function schemesInXcodeList(output: string): string[] {
  const jsonStart = output.search(/^\{\s*("|$)/m);
  if (jsonStart === -1) return [];
  const list: { workspace?: { schemes?: string[] }; project?: { schemes?: string[] } } = JSON.parse(
    output.slice(jsonStart, output.lastIndexOf('}') + 1)
  );
  return (list.workspace ?? list.project)?.schemes ?? [];
}

/** The CocoaPods project `pod install` writes into the iOS folder, from that folder. */
const PODS_PROJECT = 'Pods/Pods.xcodeproj';

/** The size of an app build, file (`.apk`) or folder (`.app`), as the build line announces it. */
function appBuildSizeMb(appPath: string): string {
  const bytes = fs.statSync(appPath).isDirectory()
    ? folderSizeBytes(appPath)
    : fs.statSync(appPath).size;
  return (bytes / (1024 * 1024)).toFixed(2);
}

/** The shipped answers, over a process runner (a test hands in its own). */
export function makeLiveAppBuilder(runProcess: RunProcess): AppBuilder {
  /** The package.json of each project `expo prebuild` ran in, as it was, until its build ends. */
  const packageJsonBeforePrebuild = new Map<string, Buffer>();

  /** Take away the native folder `expo prebuild` made and put package.json back as it was. */
  function undoPrebuild(projectRoot: string, platform: Platform): void {
    const key = `${projectRoot}\0${platform}`;
    const original = packageJsonBeforePrebuild.get(key);
    if (!original) return;
    packageJsonBeforePrebuild.delete(key);
    fs.rmSync(path.join(projectRoot, platform), { recursive: true, force: true });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), original);
  }

  /** The last lines of a build's log, as the build tool wrote them. */
  function lastLinesOf(logPath: string): string[] {
    if (!fs.existsSync(logPath)) return [];
    return fs.readFileSync(logPath, 'utf8').trimEnd().split('\n').slice(-LAST_LINES_SHOWN);
  }

  async function compileAndroid(params: CompileParams): Promise<CompiledApp> {
    const { projectRoot, env, easProfile, androidTask = DEFAULT_ANDROID_TASK } = params;
    const logPath = path.resolve(projectRoot, params.logPath);
    const startedAt = Date.now();
    const secondsSince = () => Math.round((Date.now() - startedAt) / 1000);

    const initScriptPath = path.join(projectRoot, GRADLE_INIT_SCRIPT_PATH);
    fs.mkdirSync(path.dirname(initScriptPath), { recursive: true });
    fs.writeFileSync(initScriptPath, GRADLE_INIT_SCRIPT);
    fs.rmSync(path.join(projectRoot, AUTOLINKING_ANSWER_PATH), { force: true });

    const androidFolder = path.join(projectRoot, 'android');
    const exitCode = await runProcess({
      command: path.join(androidFolder, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'),
      args: ['-I', initScriptPath, androidTask, ...GRADLE_FLAGS],
      cwd: androidFolder,
      env: buildEnvironment({ projectRoot, easProfile, buildEnv: env }),
      logPath,
    });
    if (exitCode !== 0) {
      return { ok: false, seconds: secondsSince(), lastLines: lastLinesOf(logPath) };
    }

    const { module, variant } = moduleAndVariantOf(androidTask);
    const apkFolder = path.join(androidFolder, module, 'build/outputs/apk', apkFolderOf(variant));
    const metadataPath = path.join(apkFolder, 'output-metadata.json');
    if (!fs.existsSync(metadataPath)) {
      return {
        ok: false,
        seconds: secondsSince(),
        lastLines: [`Gradle finished, and wrote no ${metadataPath}`],
      };
    }
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    // Gradle wrote the apk inside the android folder, which an Expo project's prebuild undo
    // deletes; the apk is copied out first, so the answered path outlives the folder.
    const builtApkPath = path.join(apkFolder, metadata.elements[0].outputFile);
    const keptApkFolder = path.join(makeProjectSherloFolder(projectRoot), 'build', 'android');
    fs.mkdirSync(keptApkFolder, { recursive: true });
    const apkPath = path.join(keptApkFolder, path.basename(builtApkPath));
    fs.copyFileSync(builtApkPath, apkPath);
    return {
      ok: true,
      path: apkPath,
      sizeMb: appBuildSizeMb(apkPath),
      seconds: secondsSince(),
      podFilesChanged: [],
    };
  }

  /** Whether git holds the file as it is now: tracked, and the same as the last commit. */
  async function gitHoldsFileAsItIs(projectRoot: string, file: string, logPath: string) {
    const git = (args: string[]) =>
      runProcess({ command: 'git', args, cwd: projectRoot, env: process.env, logPath });
    const isTracked = (await git(['ls-files', '--error-unmatch', '--', file])) === 0;
    return isTracked && (await git(['diff', '--quiet', 'HEAD', '--', file])) === 0;
  }

  /** `pod install` before the build, and the files it changed that git does not hold. */
  async function installPods(params: {
    projectRoot: string;
    iosFolder: string;
    env: NodeJS.ProcessEnv;
    logPath: string;
  }): Promise<string[] | 'failed'> {
    const { projectRoot, iosFolder, env, logPath } = params;
    const filesBefore = readPodTouchedFiles(projectRoot);
    const usesBundler = [projectRoot, iosFolder].some((folder) =>
      /cocoapods/i.test(readTextIfThere(path.join(folder, 'Gemfile')))
    );
    // CocoaPods fails with `Unicode Normalization not appropriate for ASCII-8BIT` with no locale.
    const hasLocale = Boolean(env.LANG || env.LC_ALL);
    const exitCode = await runProcess({
      command: usesBundler ? 'bundle' : 'pod',
      args: usesBundler ? ['exec', 'pod', 'install'] : ['install'],
      cwd: iosFolder,
      env: hasLocale ? env : { ...env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
      logPath,
    });
    if (exitCode !== 0) return 'failed';

    const filesAfter = readPodTouchedFiles(projectRoot);
    const changedFiles = [...filesAfter.keys()].filter(
      (file) => !filesAfter.get(file)!.equals(filesBefore.get(file) ?? Buffer.alloc(0))
    );
    const notHeld: string[] = [];
    for (const file of changedFiles) {
      if (!(await gitHoldsFileAsItIs(projectRoot, file, logPath))) notHeld.push(file);
    }
    return notHeld;
  }

  async function compileIos(params: CompileParams): Promise<CompiledApp> {
    const { projectRoot, env, easProfile, ios } = params;
    if (!ios) throw new Error('Cannot build iOS without a scheme');
    const logPath = path.resolve(projectRoot, params.logPath);
    const startedAt = Date.now();
    const secondsSince = () => Math.round((Date.now() - startedAt) / 1000);
    const failed = (lastLines = lastLinesOf(logPath)): CompiledApp => ({
      ok: false,
      seconds: secondsSince(),
      lastLines,
    });

    const iosFolder = path.join(projectRoot, 'ios');
    const buildEnv = buildEnvironment({ projectRoot, easProfile, buildEnv: env });

    const podFilesChanged = await installPods({ projectRoot, iosFolder, env: buildEnv, logPath });
    if (podFilesChanged === 'failed') return failed();

    // No -derivedDataPath: Xcode keeps its derived data, and the compilation cache, in its own folder.
    const xcodebuildArguments = [
      ...xcodeContainerArguments(iosFolder),
      '-scheme',
      ios.scheme,
      '-configuration',
      ios.configuration,
      '-sdk',
      'iphonesimulator',
      'ARCHS=arm64',
      'CODE_SIGNING_ALLOWED=NO',
      'COMPILATION_CACHE_ENABLE_CACHING=YES',
      'DEBUG_INFORMATION_FORMAT=dwarf',
    ];
    const exitCode = await runProcess({
      command: 'xcodebuild',
      args: [...xcodebuildArguments, 'build'],
      cwd: iosFolder,
      env: buildEnv,
      logPath,
    });
    if (exitCode !== 0) return failed();

    // Where the app is written is asked of xcodebuild with the build's own arguments.
    const settingsPath = `${logPath}.build-settings.json`;
    fs.rmSync(settingsPath, { force: true });
    const settingsExitCode = await runProcess({
      command: 'xcodebuild',
      args: [...xcodebuildArguments, '-showBuildSettings', '-json'],
      cwd: iosFolder,
      env: buildEnv,
      logPath: settingsPath,
    });
    const appPath = settingsExitCode === 0 ? appPathFromBuildSettings(settingsPath) : undefined;
    if (!appPath || !fs.existsSync(appPath)) {
      return failed([`xcodebuild finished, and its build settings name no app in ${settingsPath}`]);
    }

    const expoPlistPath = path.join(appPath, 'Expo.plist');
    if (fs.existsSync(expoPlistPath)) {
      // plutil reads and writes both plist formats; EXUpdatesEnabled false switches expo-updates off.
      const plistExitCode = await runProcess({
        command: 'plutil',
        args: ['-replace', 'EXUpdatesEnabled', '-bool', 'NO', expoPlistPath],
        cwd: iosFolder,
        env: buildEnv,
        logPath,
      });
      if (plistExitCode !== 0) return failed();
    }

    return {
      ok: true,
      path: appPath,
      sizeMb: appBuildSizeMb(appPath),
      seconds: secondsSince(),
      podFilesChanged,
    };
  }

  /** The project's own build command, run through the shell instead of Sherlo's build. */
  async function compileWithOwnCommand(
    params: CompileParams & { custom: { command: string; output: string } }
  ): Promise<CompiledApp> {
    const { projectRoot, env, easProfile, custom } = params;
    const logPath = path.resolve(projectRoot, params.logPath);
    const startedAt = Date.now();
    const secondsSince = () => Math.round((Date.now() - startedAt) / 1000);
    const failed = (lastLines = lastLinesOf(logPath)): CompiledApp => ({
      ok: false,
      seconds: secondsSince(),
      lastLines,
    });

    const exitCode = await runProcess({
      command: custom.command,
      args: [],
      shell: true,
      cwd: projectRoot,
      env: buildEnvironment({ projectRoot, easProfile, buildEnv: env }),
      logPath,
    });
    if (exitCode !== 0) return failed();

    const appPath = path.resolve(projectRoot, custom.output);
    if (!fs.existsSync(appPath)) {
      return failed([`The build command finished, and wrote no ${custom.output}`]);
    }
    return {
      ok: true,
      path: appPath,
      sizeMb: appBuildSizeMb(appPath),
      seconds: secondsSince(),
      podFilesChanged: [],
    };
  }

  /**
   * Run a program only to read its answer: its exit code, and everything it wrote to stdout and
   * stderr, kept in a log of its own that is removed afterwards.
   */
  async function askProgram(params: {
    command: string;
    args: string[];
    cwd?: string;
  }): Promise<{ exitCode: number; output: string }> {
    const answerFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-answer-'));
    const logPath = path.join(answerFolder, 'answer.log');
    try {
      const exitCode = await runProcess({
        command: params.command,
        args: params.args,
        cwd: params.cwd ?? process.cwd(),
        env: process.env,
        logPath,
      });
      return { exitCode, output: readTextIfThere(logPath) };
    } finally {
      fs.rmSync(answerFolder, { recursive: true, force: true });
    }
  }

  /** The schemes `xcodebuild -list` reads in one workspace or project of the iOS folder. */
  async function listSchemes(iosFolder: string, containerArguments: string[]): Promise<string[]> {
    const { exitCode, output } = await askProgram({
      command: 'xcodebuild',
      args: ['-list', '-json', ...containerArguments],
      cwd: iosFolder,
    });
    if (exitCode !== 0) {
      throw new Error(`\`xcodebuild -list\` could not list the iOS schemes:\n${output.trimEnd()}`);
    }
    return schemesInXcodeList(output);
  }

  return {
    hostSystem: () =>
      process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
    hasTool: (tool, projectRoot) =>
      withTheMachineEnv(async () => {
        if (tool === 'android-sdk') {
          // Where Gradle looks: the project's sdk.dir line, or the environment.
          return [
            sdkDirOfLocalProperties(projectRoot),
            process.env.ANDROID_HOME,
            process.env.ANDROID_SDK_ROOT,
          ].some(isFolder);
        }
        if (process.platform !== 'darwin') return false;
        const { exitCode } = await askProgram({ command: 'xcodebuild', args: ['-version'] });
        return exitCode === 0;
      }),
    javaVersion: () =>
      withTheMachineEnv(async () => {
        // Gradle runs on JAVA_HOME's Java when it is set, and on the one on PATH otherwise.
        const javaHome = process.env.JAVA_HOME;
        const { exitCode, output } = await askProgram({
          command: javaHome ? path.join(javaHome, 'bin', 'java') : 'java',
          args: ['-version'],
        });
        if (exitCode !== 0) return null;
        return javaMajorVersionIn(output);
      }),
    listIosSchemes: async (projectRoot) => {
      const iosFolder = path.join(projectRoot, 'ios');
      const schemes = await listSchemes(iosFolder, xcodeContainerArguments(iosFolder));
      // A workspace lists the schemes of the CocoaPods project beside the app's own.
      const podSchemes = fs.existsSync(path.join(iosFolder, PODS_PROJECT))
        ? await listSchemes(iosFolder, ['-project', PODS_PROJECT])
        : [];
      return schemes.filter((scheme) => !podSchemes.includes(scheme));
    },
    findCachedBuild: async ({ cacheKey, cacheDir }) => {
      const buildFolder = path.join(cacheDir, cacheKey);
      if (!fs.existsSync(buildFolder)) return null;
      const [appFile] = fs.readdirSync(buildFolder).filter((name) => !name.startsWith('.'));
      if (!appFile) return null;
      // A hit marks the folder as just used, so whoever prunes the cache by age keeps it.
      const now = new Date();
      fs.utimesSync(buildFolder, now, now);
      return path.join(buildFolder, appFile);
    },
    keepInCache: async ({ cacheKey, cacheDir, path: appPath }) => {
      const buildFolder = path.join(cacheDir, cacheKey);
      // A build is written under its key once; a second job that built the same one leaves it be.
      if (fs.existsSync(buildFolder)) return;
      // Copied beside the final folder and renamed into place, so a job reading the cache never
      // sees half a build.
      const unfinishedFolder = path.join(cacheDir, `.${cacheKey}-${process.pid}`);
      fs.mkdirSync(unfinishedFolder, { recursive: true });
      // One copy for both: an Android `.apk` is a file, an iOS `.app` is a folder, and `cpSync`
      // with `recursive` copies either whole.
      fs.cpSync(appPath, path.join(unfinishedFolder, path.basename(appPath)), { recursive: true });
      fs.renameSync(unfinishedFolder, buildFolder);
    },
    generateNativeFolder: async ({ platform, projectRoot, env, easProfile }) => {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      packageJsonBeforePrebuild.set(
        `${projectRoot}\0${platform}`,
        fs.readFileSync(packageJsonPath)
      );
      const exitCode = await runProcess({
        command: 'npx',
        args: ['expo', 'prebuild', '--platform', platform, '--no-install'],
        cwd: projectRoot,
        env: buildEnvironment({ projectRoot, easProfile, buildEnv: env }),
        logPath: path.join(projectRoot, buildLogPath(platform)),
      });
      if (exitCode !== 0) {
        undoPrebuild(projectRoot, platform);
        throw new Error(`\`expo prebuild\` failed - see ${buildLogPath(platform)}`);
      }
    },
    compile: async (params) => {
      const { custom } = params;
      try {
        if (custom) return await compileWithOwnCommand({ ...params, custom });
        return await (params.platform === 'ios' ? compileIos(params) : compileAndroid(params));
      } finally {
        undoPrebuild(params.projectRoot, params.platform);
      }
    },
    // Expo's own command, asked to start the build and answer at once, as JSON, with no question
    // for a person. It packs the project from git as it always does, so nothing here sets
    // EAS_NO_VCS.
    startEasBuild: async ({ platform, profile, projectRoot }) => {
      const logPath = path.join(projectRoot, easStartLogPath(platform));
      fs.rmSync(logPath, { force: true });
      const exitCode = await runProcess({
        command: 'eas',
        args: [
          'build',
          '--platform',
          platform,
          '--profile',
          profile,
          '--no-wait',
          '--json',
          '--non-interactive',
        ],
        cwd: projectRoot,
        env: process.env,
        logPath,
      });
      const buildId = exitCode === 0 ? easBuildIdIn(readTextIfThere(logPath)) : undefined;
      if (!buildId) {
        throw new Error(
          `\`eas build\` could not start the ${platform} build - see ${easStartLogPath(platform)}`
        );
      }
      return { buildId };
    },
    easUploadRoot: (projectRoot) => {
      let folder = path.resolve(projectRoot);
      while (true) {
        if (fs.existsSync(path.join(folder, '.git'))) return folder;
        const parent = path.dirname(folder);
        if (parent === folder) return path.resolve(projectRoot);
        folder = parent;
      }
    },
    readEasUploadFile: readFileOfTheEasUpload,
    hashNativeFolderFiles,
  };
}

/** The shipped builder: the machine, for real. */
export const liveAppBuilder: AppBuilder = makeLiveAppBuilder(runProcessForReal);

/** A file of the folder EAS packs, by its path from that folder, or undefined when there is none. */
function readFileOfTheEasUpload({
  easUploadRoot,
  fileFromTheRoot,
}: {
  easUploadRoot: string;
  fileFromTheRoot: string;
}): string | undefined {
  const filePath = path.join(easUploadRoot, fileFromTheRoot);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : undefined;
}

let installed: AppBuilder = liveAppBuilder;

/** The builder in force. */
export function appBuilder(): AppBuilder {
  return installed;
}

/** Install a builder for the duration of one posed run; the returned function undoes it. */
export function installAppBuilder(next: AppBuilder): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/* ========================================================================== */
/* The posed builder                                                          */
/* ========================================================================== */

/** What building on the machine came to, as a pose states it. */
export type PosedAppBuild = {
  /** The operating system the run was on. */
  host: 'macos' | 'linux';
  /** The build tools the machine had (`android-sdk`, `xcode`). A tool not listed is missing. */
  tools: BuildTool[];
  /** The major version of the machine's Java, or null for a machine with none. */
  java: number | null;
  /** The schemes the iOS workspace lists, for a project that builds iOS. */
  iosSchemes?: string[];
  /** What each platform's build came to, per platform (`android`, `ios`). */
  platforms: Record<string, PosedPlatformBuild>;
  /**
   * The files inside the project's native folders, path -> hash, as this run hashed them for the
   * list of what changed since the stored app build (`"android/app/build.gradle": "<hash>"`).
   * Needed only when the stored app build's list keeps a folder's files; a hash is never printed.
   */
  nativeFolderFiles?: Record<string, string>;
};

/**
 * One platform's build as a pose states it: found in the cache, compiled, failed, or started on
 * EAS. Which of them the run reaches is the shipped code's decision; a pose that states a build
 * the run never asked for is reported, and one the run asked for and the pose left out is refused.
 */
export type PosedPlatformBuild =
  | {
      /** The cache held this platform's app build: the path it answered with. */
      cached: string;
    }
  | {
      /** The compile wrote the app build here. */
      built: string;
      /** What the build line announces, e.g. `"53.90"`. */
      sizeMb: string;
      /** How long the compile took, in whole seconds. */
      seconds: number;
      /** An iOS build's files that pod install changed and git does not track; none when absent. */
      podFilesChanged?: string[];
    }
  | {
      /** The compile failed. */
      failed: {
        /** How long it ran, in whole seconds. */
        seconds: number;
        /** The last lines the build tool wrote. */
        lastLines: string[];
      };
    }
  | {
      /** The EAS build this platform started, by its id. */
      easBuild: string;
    };

/** A question the pose could not answer, and the reason - recorded the way an unscripted call is. */
export type UnansweredBuild = { call: string; problem: string };

export type PosedAppBuilder = AppBuilder & {
  /** Every question the pose could not answer, in the order they were asked. */
  refusals(): UnansweredBuild[];
};

/**
 * The builder a pose declares. A run that reaches the builder with no `appBuild` is refused before
 * anything on this machine is looked at: a posed run that quietly ran a real Gradle would be
 * reporting on this machine, not on the pose.
 */
export function posedAppBuilder(posed: PosedAppBuild | undefined): PosedAppBuilder {
  const refusals: UnansweredBuild[] = [];

  function refuse(call: string, problem: string): Error {
    refusals.push({ call, problem });
    return new Error(`the pose cannot answer \`${call}\`: ${problem}`);
  }

  function stated(call: string): PosedAppBuild {
    if (!posed) {
      throw refuse(call, 'the pose states no `appBuild`, and the command reached the builder');
    }
    return posed;
  }

  function platformOf(call: string, platform: Platform): PosedPlatformBuild {
    const build = stated(call).platforms[platform];
    if (!build) {
      throw refuse(call, `the pose's \`appBuild.platforms\` says nothing about \`${platform}\``);
    }
    return build;
  }

  return {
    refusals: () => refusals,

    hostSystem: () => stated('hostSystem').host,

    hasTool: async (tool) => stated('hasTool').tools.includes(tool),

    javaVersion: async () => stated('javaVersion').java,

    listIosSchemes: async () => {
      const schemes = stated('listIosSchemes').iosSchemes;
      if (!schemes) {
        throw refuse(
          'listIosSchemes',
          'the run builds iOS - say `iosSchemes` in the `appBuild` of the pose'
        );
      }
      return schemes;
    },

    findCachedBuild: async ({ platform }) => {
      const build = platformOf('findCachedBuild', platform);
      return 'cached' in build ? build.cached : null;
    },

    // Nothing is kept: a posed run writes no cache on this machine.
    keepInCache: async () => undefined,

    // Nothing is generated: a posed run runs no `expo prebuild` on this machine.
    generateNativeFolder: async () => undefined,

    compile: async ({ platform }) => {
      const build = platformOf('compile', platform);
      if ('built' in build) {
        return {
          ok: true,
          path: build.built,
          sizeMb: build.sizeMb,
          seconds: build.seconds,
          podFilesChanged: build.podFilesChanged ?? [],
        };
      }
      if ('failed' in build) {
        return { ok: false, seconds: build.failed.seconds, lastLines: build.failed.lastLines };
      }
      throw refuse(
        'compile',
        `the run compiled \`${platform}\`, and the pose answers it with ` +
          `${'cached' in build ? 'a cached build' : 'an EAS build'} - say \`built\` or \`failed\``
      );
    },

    startEasBuild: async ({ platform }) => {
      const build = platformOf('startEasBuild', platform);
      if ('easBuild' in build) return { buildId: build.easBuild };
      throw refuse(
        'startEasBuild',
        `the run started an EAS build of \`${platform}\`, and the pose answers it with a local ` +
          'build - say `easBuild`'
      );
    },

    // A posed project is a folder of its own, with no repository around it: EAS would pack it
    // whole, and its own ignore files are the ones read. Nothing above it on this machine is
    // looked at, so no pose has to state it.
    easUploadRoot: (projectRoot) => projectRoot,
    readEasUploadFile: readFileOfTheEasUpload,

    hashNativeFolderFiles: async ({ folders }) => {
      const files = stated('hashNativeFolderFiles').nativeFolderFiles;
      if (!files) {
        throw refuse(
          'hashNativeFolderFiles',
          `the stored app build keeps the files of ${folders
            .map((folder) => `\`${folder}\``)
            .join(', ')} ` + '- say `nativeFolderFiles` in the `appBuild` of the pose'
        );
      }
      return Object.entries(files)
        .filter(([filePath]) => folders.some((folder) => filePath.startsWith(`${folder}/`)))
        .map(([filePath, hash]) => ({ path: filePath, hash }));
    },
  };
}
