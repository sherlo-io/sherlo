/**
 * THE COMMAND POSE CONTRACT - what a caller declares to make a Sherlo command-line tool print one
 * of its own screens, without a project, a token or a network.
 *
 * `sherlo pose <pose.json|->` runs ONE command the way a user would and prints the whole screen:
 * both streams in the order they were written, then the exit code the real run would have had.
 * The command's code is the shipped code, untouched. What the pose replaces is exactly six seams
 * the command reaches through: the project folder it reads, the settings and git it consults,
 * what bundling answers, the client it talks to the server with, what a real push reads off the
 * machine (the binary, the base fingerprint, the clock), and what an `init` DOES to the machine
 * (the package it installs, the key it waits for). Everything between those seams - the routing,
 * the checks, the logo, the wording, the help footer - is the customer's road.
 *
 * A POSE SAYS INPUTS AND ANSWERS, NEVER WORDS. It cannot supply a sentence, a colour or a line of
 * output; the screen is the output. That is what makes a rendered transcript evidence about the
 * tool and not about the caller who posed it.
 *
 * ------------------------------------------------------------------------
 * WHY THIS FILE HAS NO IMPORTS, AND MAY NEVER GROW ONE.
 *
 * A consumer copies this file - sherlo-tester today, sherlo-api's admin tool next - verbatim, into
 * a repository with no access to this one's internals. An import would make the copy unresolvable
 * the moment it landed, so every type is written out to primitives and string literals, and a
 * consumer's sync refuses a copy that contains an import at all. The shapes cannot drift from the
 * types the tool decodes into: ./pose.contract.law.ts asserts them against the live types in both
 * directions, so a field added, removed or retyped in the tool reds the typecheck here.
 *
 * ------------------------------------------------------------------------
 * ONE SHAPE FOR EVERY SHERLO COMMAND-LINE TOOL. `sherlo` and `sherlo-admin` read the same
 * document. A tool declares which seams it has (`sherlo-admin` has no project folder and no git);
 * a pose that names a seam the tool does not have is refused by name, like any unknown field.
 *
 * ------------------------------------------------------------------------
 * WHAT IS REFUSED, AND WHY NOTHING IS GUESSED.
 *
 * Every field below is required, save `push`, which only a real push reads, and `workstation`,
 * which only an `init` acts through. A missing field, an unknown key or a value of the wrong type
 * is refused, and the refusal names EVERY problem in one message, so a hand-written pose is fixed
 * in one pass. A default that quietly filled a gap would let somebody review a state they never
 * asked for. And a call the command makes that the pose did not script is refused too, with the
 * screen so far printed under the refusal: a pose can never pass on a road it did not describe.
 */

/** The whole of what one command run needed in order to print what it printed. */
export type CommandPose = {
  /** The shape's version. Bumped when a field changes meaning; a reader refuses a version it does not know. */
  pose: 1;
  /**
   * The command line after the tool's own name, word by word, exactly as a shell would split it:
   * `["view", "3"]`, `["test", "--token", "not-a-real-token", "--android", "builds/app.apk"]`.
   * The tool's own routing decides which command runs and which checks fire, in what order.
   */
  argv: string[];
  /**
   * The project folder the command runs in: relative path -> content. A string is written as is;
   * an object is written as JSON. `{"sherlo.config.json": {"devices": []}}` poses the empty-devices
   * refusal; `{}` poses a folder with no config file. Nothing touches the disk: the tool's file
   * reads answer from this map, and a path outside it does not exist.
   */
  files: Record<string, string | Record<string, unknown>>;
  /**
   * The settings the command reads from its surroundings, stated instead of inherited. An unstated
   * setting reads as unset - the pose says `SKIP_INTRO: "true"` or the logo prints. The tool's own
   * secret-bearing settings (a token in the environment) are posed here too, and masked on output.
   */
  env: Record<string, string>;
  /**
   * What the git read answers. `"none"` is a folder that is not a repository at all; `"unavailable"`
   * is a read that failed (the tool prints its own warning for it); otherwise the three facts the
   * tool asks for.
   */
  git: { branch: string; commit: string; dirty: boolean } | 'none' | 'unavailable';
  /**
   * What bundling the app answers, per platform, for the commands that bundle (`sherlo test` on
   * the staged road, `--dry-run`). `{}` for a command that never reaches the bundler - a refusal,
   * a `view`, a `project create` - and a pose that supplies bundles to such a command is refused.
   * The story files are the closure keys the bundler reports, which is what Diff Scope diffs.
   */
  bundles: Record<string, PosedBundle>;
  /**
   * The server's answers, one per call the command makes, IN ORDER. Each entry names the call, the
   * arguments the command must make it with (checked, so a pose cannot script an answer to a
   * question the command did not ask), and the answer - which may be the error the server would
   * send. An answer's shape is the wire's own, written out below per call; a pose describing a state
   * the backend cannot send does not compile against this file and is refused at run time.
   */
  api: ScriptedCall[];
  /**
   * Placeholders for the values only a machine knows. The tool always folds its own temporary
   * project folder to `<PROJECT_ROOT>` and the resolved config path to `<SHERLO_CONFIG_PATH>`
   * without being asked. Anything else that must not reach a committed transcript is named here:
   * placeholder -> the literal the pose itself put on the screen (a commit hash, a build file
   * name), so the fold is exact and reviewable.
   */
  masks: Record<string, string>;
  /**
   * What a real push (`sherlo test --android <apk> [--ios <app>]`) read off the machine: the
   * binaries it was handed, the base fingerprint over the project's native inputs, and the clock.
   * THE ONE OPTIONAL FIELD, because only that road reads the machine - a refusal on it never gets
   * that far, and no other command opens a binary. A pose that states it for a command that never
   * reads a native build is refused; a push that reaches the machine with no `push` is refused at
   * run time, exactly like a call the pose did not script.
   */
  push?: PosedPush;
  /**
   * What `sherlo init` did TO the machine: the package the manager answered the install with, and
   * whether anybody pressed Enter at the prompt. THE OTHER OPTIONAL FIELD, because `init` is the
   * only command that ACTS on the machine rather than reading it - it adds a package and it stops
   * for a key, and neither exists on a machine that only has the pose. A pose that states it for a
   * command that does neither is refused; an `init` that reaches either act with no `workstation`
   * is refused at run time, exactly like a call the pose did not script.
   */
  workstation?: PosedWorkstation;
};

/** The two acts `sherlo init` performs on the machine, as a pose states them. */
export type PosedWorkstation = {
  /**
   * What the package manager answered when asked to add Sherlo: the package it installed, version
   * and all (`"@sherlo/react-native-storybook@2.0.2"`). Checked against the package the command
   * actually asked for, so a pose cannot answer an install the command never made.
   */
  install: { package: string };
  /**
   * Whether a person pressed Enter at the prompt, or the terminal was closed on it. `"closed"` is
   * what a run nobody is watching gets, and the tool's own cancel branch prints for it.
   */
  enter: 'pressed' | 'closed';
};

/** What a real push read off the machine, as a pose states it. */
export type PosedPush = {
  /** The instant the run read the clock at, ISO 8601 - what "7 minutes ago" on a reuse line is measured against. */
  now: string;
  /** The binaries the command was handed, per platform (`android`, `ios`). */
  binaries: Record<string, PosedBinary>;
  /** The base fingerprint over the project's native inputs, or why there was none (the tool prints its own warning for it). */
  fingerprint: { hash: string } | { unavailable: string };
};

/**
 * One binary as a pose states it - what the tool would have read out of the file. A pose states
 * no `buildType`: the tool derives preview-or-development from `hasEmbeddedBundle` by its own
 * rule, and whether the binary can be a base from the three gate facts by its own rule too.
 */
export type PosedBinary = {
  /** The file's hash, sent to the server to ask whether it has seen this binary. Never printed. */
  hash: string;
  /** What the upload line announces, e.g. `"48.12"`. */
  sizeMb: string;
  /** The Sherlo SDK version baked into the binary; `null` poses the missing-Sherlo refusal. */
  sdkVersion: string | null;
  /** Whether a JS bundle sits at the platform-default path - a preview build has one, a development build does not. */
  hasEmbeddedBundle: boolean;
  /** The bundle's format, as the gate reads it off the embedded bundle's header. */
  bundleFormat: 'plain-js' | 'hermes-bytecode' | 'ram';
  /** Whether expo-updates is enabled in the binary - an Android binary with it cannot be a base. */
  expoUpdatesEnabled: boolean;
  /** Whether the binary carries expo-dev-client. */
  hasExpoDevClient: boolean;
  /** The Expo SDK the binary was built with, when it was built with Expo. */
  expoSdkVersion?: string;
  /** The ABIs an Android binary carries (`["arm64-v8a"]`); absent for an iOS build. */
  androidAbis?: string[];
};

/** One scripted answer. The `call` names the operation as the tool's own client names it. */
export type ScriptedCall =
  | {
      call: 'getBuildStatus';
      with: { buildIndex: number };
      answer: BuildStatusAnswer | null | ApiError;
    }
  | {
      call: 'createProject';
      with: { teamId: string; name: string };
      answer: { name: string; index: number; projectToken: string } | ApiError;
    }
  | {
      call: 'createTeam';
      with: { name: string };
      answer: { id: string; name: string } | ApiError;
    }
  | {
      call: 'listTeams';
      with: Record<string, never>;
      /** `role` is the caller's membership role, or null when the API does not say. */
      answer: { teams: Array<{ id: string; name: string; projectCount: number; role: string | null }> } | ApiError;
    }
  | {
      call: 'listProjects';
      with: { teamId: string };
      /** `mainBranch` is null while the project has never chosen one. */
      answer:
        | { team: { name: string; id: string }; projects: Array<{ index: number; name: string; buildCount: number; mainBranch: string | null }> }
        | ApiError;
    }
  | {
      call: 'openBuild';
      with: { platforms: string[] };
      answer: { buildIndex: number; url: string } | ApiError;
    }
  | {
      call: 'computeDiffScopeDryRun';
      with: { branch: string; commit: string };
      answer: DiffScopeDryRunAnswer | ApiError;
    }
  | {
      /** A real push's first question: has the server seen these binaries, and which build is next. */
      call: 'getNextBuildInfo';
      with: { platforms: string[] };
      answer: NextBuildInfoAnswer | ApiError;
    }
  | {
      /**
       * The staged slots a fresh bundle is uploaded into. Scripted so the pose says the call was
       * made; the answer holds nothing a pose could state, because nothing the tool prints reads it.
       */
      call: 'getStagedUploadUrls';
      with: { platforms: string[] };
      answer: Record<string, never> | ApiError;
    }
  | {
      /**
       * One progress report `sherlo init` sends as it goes, named by the step that sent it
       * (`"0_init"`, `"3_metro_config"`). The answer is the session the whole setup is recorded
       * under, which the command carries into the next report - so a pose of an `init` scripts one
       * of these per step, in order, and a step the pose did not script is refused.
       */
      call: 'trackCliInit';
      with: { event: string };
      answer: { sessionId: string } | ApiError;
    };

/**
 * What `getNextBuildInfo` answers: which build comes next and, per binary, whether the server
 * wants it uploaded or already holds it from an earlier build - `reuse` is what the
 * `reusing unchanged build (Test 1, 7 minutes ago)` line is printed from.
 */
export type NextBuildInfoAnswer = {
  nextBuildIndex: number;
  binaries: Record<string, { upload: true } | { reuse: { buildIndex: number; createdAt: string } }>;
};

/** The error the server sends, as the tool's client surfaces it. */
export type ApiError = { error: string };

/** One platform's bundle as the bundler reports it - the same fields the dry-run plan prints. */
export type PosedBundle = {
  bundlePath: string;
  bundleSizeMb: number;
  bundleFormat: 'plain-js' | 'hermes-bytecode';
  bundler: 'expo' | 'metro';
  assets: string[];
  /**
   * The story-file source paths the bundler's module manifest closes over - what the dry-run
   * plan's "of N stories" counts. `null` poses a bundle that came with no module map at all,
   * which is what a real bundle is when Metro is configured without Sherlo's wrapper: the plan
   * line then reads "all stories", with no count.
   */
  storyClosureKeys: string[] | null;
};

/**
 * What `getBuildStatus` answers, exactly as the tool's query selects it. Optional fields are
 * optional ON THE WIRE - an older backend does not send them, and the tool's behaviour for an
 * absent field differs from its behaviour for a zero or an empty list. Omit what the backend would.
 */
export type BuildStatusAnswer = {
  runStatus: 'canceled' | 'error' | 'finished' | 'inProgress' | 'queued' | 'waiting';
  /** The sparse-build gate, decided by the backend and frozen onto the build. Absent or false is off. */
  showsOnlyBranchChanges?: boolean;
  /** The backend's own review verdict for the build. Absent on an older backend. */
  status?: 'approved' | 'noChanges' | 'reported' | 'unreviewed';
  /** The four review counts. Absent until the build has written them. */
  viewStatusesCount?: { approved: number; noChanges: number; reported: number; unreviewed: number };
  /** Whatever the backend recorded about a failed run. Shape is the backend's. */
  runError?: unknown;
  /** Build-wide capture accounting. Absent on an older backend. */
  diffScopeInfo?: {
    capturedSnapshotCount?: number;
    inheritedSnapshotCount?: number;
    platforms?: { android?: { reason?: string }; ios?: { reason?: string } };
  };
  /** The build's frozen git identity. Absent on an older backend. */
  gitInfo?: { branchName: string; commitHash: string };
  /**
   * Per-story rows. `status` is the plain string the wire sends (including the hyphenated
   * `review-required`), so a value the tool has not learned yet still passes through.
   */
  stories?: Array<{
    name: string;
    status: string;
    baseline: { buildIndex: number } | null;
    reason?: string;
    candidates?: Array<{ buildIndex: number }>;
  }>;
  /** The build's Diff Scope block. Absent on an older backend. */
  diffScope?: { reason: string; captured: string[]; inherited: string[]; ancestorBuildIndex: number | null };
};

/** What the dry-run road's one read-only question answers: per platform, full capture or the story files reached. */
export type DiffScopeDryRunAnswer = {
  platforms: Array<{
    platform: 'android' | 'ios';
    isFullCapture: boolean;
    reason: string;
    capturedStoryFilePaths: string[];
  }>;
};
