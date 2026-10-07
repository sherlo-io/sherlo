/**
 * THE APP BUILDER SEAM - everything `sherlo test` and `sherlo build` do to turn the project into an
 * app build on THIS machine.
 *
 *     live   - the operating system the tool runs on, the build tools it finds, the iOS schemes
 *              the workspace lists, the local build cache, `expo prebuild`, Gradle and xcodebuild,
 *              and `eas build` for a project that builds on EAS.
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
 *
 * ------------------------------------------------------------------------
 * PLAN-LAYER ONLY, FOR NOW. The live half below refuses every call, naming itself: the epic
 * sherlo-test-builds-apps drew its screens through the posed half in plan, and the real builders
 * (the Gradle init script that forces debug signing and switches expo-updates off, the xcodebuild
 * call, the cache, the EAS start) are build tasks of that epic. A shipped tool that reached this
 * refusal would be a build that never landed - the landing review checks it is gone.
 */
import type { Platform } from '@sherlo/api-types';

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
    }
  | {
      ok: false;
      /** How long the compile ran before it failed, in whole seconds. */
      seconds: number;
      /** The last lines the build tool wrote, as it wrote them. */
      lastLines: string[];
    };

/** Every act a build performs on the machine, and every question it asks of it. */
export type AppBuilder = {
  /** The operating system the tool runs on. */
  hostSystem(): HostSystem;
  /** Whether a build tool is installed where a build would look for it. */
  hasTool(tool: BuildTool): Promise<boolean>;
  /** The major version of the Java a Gradle build would run on, or null when there is none. */
  javaVersion(): Promise<number | null>;
  /** The schemes the iOS workspace lists, apart from the CocoaPods ones. */
  listIosSchemes(projectRoot: string): Promise<string[]>;
  /** The app build the cache holds under a key, or null. */
  findCachedBuild(params: { platform: Platform; cacheKey: string; cacheDir: string }): Promise<string | null>;
  /** Keep a fresh app build in the cache under its key. */
  keepInCache(params: { platform: Platform; cacheKey: string; cacheDir: string; path: string }): Promise<void>;
  /** Run `expo prebuild` for one platform, and put the project back as it was afterwards. */
  generateNativeFolder(params: { platform: Platform; projectRoot: string; env: Record<string, string> }): Promise<void>;
  /** Compile one platform's app, writing everything the build tool says to `logPath`. */
  compile(params: {
    platform: Platform;
    projectRoot: string;
    env: Record<string, string>;
    logPath: string;
    /** The Gradle task for Android, e.g. `:app:assembleRelease`. */
    androidTask?: string;
    /** The scheme and configuration for iOS. */
    ios?: { scheme: string; configuration: string };
    /** The project's own build command, run instead of Sherlo's, and where it writes the app build. */
    custom?: { command: string; output: string };
  }): Promise<CompiledApp>;
  /** Start an EAS build of one platform with one profile, and answer its id without waiting. */
  startEasBuild(params: { platform: Platform; profile: string; projectRoot: string }): Promise<{ buildId: string }>;
};

/** The error the live half throws until the real builders land. */
const NOT_BUILT_YET = 'building apps is drawn in plan and not built yet (epic sherlo-test-builds-apps)';

/** The shipped answers. PLAN-LAYER ONLY: every act refuses until the epic's build tasks land. */
export const liveAppBuilder: AppBuilder = {
  hostSystem: () =>
    process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
  hasTool: async () => {
    throw new Error(NOT_BUILT_YET);
  },
  javaVersion: async () => {
    throw new Error(NOT_BUILT_YET);
  },
  listIosSchemes: async () => {
    throw new Error(NOT_BUILT_YET);
  },
  findCachedBuild: async () => {
    throw new Error(NOT_BUILT_YET);
  },
  keepInCache: async () => {
    throw new Error(NOT_BUILT_YET);
  },
  generateNativeFolder: async () => {
    throw new Error(NOT_BUILT_YET);
  },
  compile: async () => {
    throw new Error(NOT_BUILT_YET);
  },
  startEasBuild: async () => {
    throw new Error(NOT_BUILT_YET);
  },
};

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
        throw refuse('listIosSchemes', 'the run builds iOS - say `iosSchemes` in the `appBuild` of the pose');
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
        return { ok: true, path: build.built, sizeMb: build.sizeMb, seconds: build.seconds };
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
  };
}
