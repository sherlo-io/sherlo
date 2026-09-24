// GENERATED from the seam types in packages/cli/src/seams by `yarn generate:pose-contract` - do not edit.
/**
 * THE COMMAND POSE CONTRACT - what a caller declares to make a Sherlo command-line tool print one
 * of its own screens, without a project, a token or a network.
 *
 * `sherlo pose <pose.json|->` runs ONE command the way a user would and prints the whole screen:
 * both streams in the order they were written, then the exit code the real run would have had.
 * The command's code is the shipped code, untouched. What the pose replaces is the seams the
 * command reaches the world through, and each field below is one seam's answer.
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
 * consumer's sync refuses a copy that contains an import at all.
 *
 * IT CANNOT DRIFT FROM THE TOOL, because nobody writes it: it is generated from the types the
 * seams themselves declare, and `yarn check:pose-contract` reds a pull request that edits it by
 * hand. ./pose.contract.law.ts asserts it against those same types in both directions as well, so
 * a copy that was never regenerated fails to compile rather than reading plausibly.
 *
 * ------------------------------------------------------------------------
 * WHAT IS REFUSED, AND WHY NOTHING IS GUESSED.
 *
 * Every field below is required save the four a single road reaches. A missing field, an unknown
 * key or a value of the wrong type is refused, and the refusal names EVERY problem in one message,
 * so a hand-written pose is fixed in one pass. A default that quietly filled a gap would let
 * somebody review a state they never asked for. And a call the command makes that the pose did not
 * script is refused too, with the screen so far printed under the refusal: a pose can never pass
 * on a road it did not describe.
 */

/** The whole of what one command run needed in order to print what it printed. */
export type CommandPose = {
  /**
   * The shape's version. Bumped when a field changes meaning; a reader refuses a version it does
   * not know.
   */
  pose: 1;
  /**
   * The command line after the tool's own name, word by word, exactly as a shell would split it:
   * `["view", "3"]`, `["test", "--token", "not-a-real-token", "--android", "builds/app.apk"]`. The
   * tool's own routing decides which command runs and which checks fire, in what order.
   */
  argv: string[];
  /**
   * The project folder the command runs in: relative path -> content. A string is written as is;
   * an object is written as JSON. `{"sherlo.config.json": {"devices": []}}` poses the
   * empty-devices refusal; `{}` poses a folder with no config file. Nothing touches the disk: the
   * tool's file reads answer from this map, and a path outside it does not exist.
   */
  files: PosedFiles;
  /**
   * The settings the command reads from its surroundings, stated instead of inherited. An unstated
   * setting reads as unset - the pose says `SKIP_INTRO: "true"` or the logo prints. The tool's own
   * secret-bearing settings (a token in the environment) are posed here too, and masked on output.
   */
  env: Record<string, string>;
  /**
   * What the git read answers. `"none"` is a folder that is not a repository at all;
   * `"unavailable"` is a read that failed (the tool prints its own warning for it); otherwise the
   * three facts the tool asks for.
   */
  git: PosedGit;
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
   * send. An answer's shape is the wire's own, written out per call; a pose describing a state the
   * backend cannot send does not compile against the contract and is refused at run time.
   */
  api: ScriptedCall[];
  /**
   * PLACEHOLDER -> THE LITERAL THE SCENARIO ITSELF PUT ON THE SCREEN, and nothing else.
   *
   * The tool folds every value only a machine knows on its own, by class and by shape: its
   * temporary project folder to `<PROJECT_ROOT>`, the resolved config path to
   * `<SHERLO_CONFIG_PATH>`, a token to `<MASKED>`, a build address, a size in megabytes, a
   * duration, the time since a build, a commit id, a base fingerprint, and the progress lines a
   * `--wait` printed while it waited (`../commands/pose/maskScreen`). The same folding is
   * reachable from outside as `sherlo mask` (stdin in, folded text out), so a live run's screen is
   * folded by the same rule as a posed one.
   *
   * A pose that hand-types one of those placeholders here is describing the masker rather than its
   * scenario, and the catalogue refuses it: an entry that duplicates the masker buys nothing and
   * rots the day the class moves. What is left for this field is the one thing only a scenario
   * knows: a literal it put on the screen itself, through its own `files`, `env` or `api`, and
   * wants read as a placeholder.
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
   * WHAT THE CLOCK ANSWERS WHILE THE COMMAND WAITS, ISO 8601, in the order the wait reads it. A
   * wait reads the clock once at its start and once before every poll; after the last instant here
   * the clock stands still. Absent, the clock stands at `push.now` (or at the run's start) for the
   * whole wait, so a wait ends only when a scripted `getBuildStatus` answer is terminal. A clock
   * that passes the deadline is how a wait that ran out is posed - the timed-out closer, and exit
   * code 3. A posed wait never sleeps: the instants here are the whole passage of time.
   */
  clock?: string[];
  /**
   * What `sherlo init` did TO the machine: the package the manager answered the install with, and
   * whether anybody pressed Enter at the prompt. THE OTHER OPTIONAL FIELD, because `init` is the
   * only command that ACTS on the machine rather than reading it - it adds a package and it stops
   * for a key, and neither exists on a machine that only has the pose. A pose that states it for a
   * command that does neither is refused; an `init` that reaches either act with no `workstation`
   * is refused at run time, exactly like a call the pose did not script.
   */
  workstation?: PosedWorkstation;
  /**
   * What the bundler's letterbox answered - the road `sherlo open` reaches the developer's running
   * app down. THE THIRD OPTIONAL FIELD, and for the same reason as the other two: no other command
   * has a running app to talk to, and a machine that only has the pose has no bundler and no app.
   * A pose that states it for a command that never posts to the letterbox is refused; a command
   * that reaches the letterbox with no `letterbox` is refused at run time, exactly like a call the
   * pose did not script.
   */
  letterbox?: PosedLetterbox;
  /**
   * What the running app answered down the capture socket - the road `sherlo capture` reaches it
   * down. THE FOURTH OPTIONAL FIELD, for the one command that talks to it: a pose that states it
   * for any other command is refused, and a capture with no `capture` is refused at run time.
   */
  capture?: PosedCapture;
};

/**
 * The project folder a pose declares: relative path -> content. A string is written as is; an
 * object is written as JSON. `{"sherlo.config.json": {"devices": []}}` poses the empty-devices
 * refusal; `{}` poses a folder with no config file. Nothing touches the disk outside the temporary
 * root below: the tool's file reads answer from what this map laid down, and a path outside it
 * does not exist.
 */
export type PosedFiles = Record<string, string | Record<string, unknown>>;

/**
 * What the git read answers. `"none"` is a folder that is not a repository at all; `"unavailable"`
 * is a read that failed (the tool prints its own warning for it); otherwise the three facts the
 * tool asks for.
 */
export type PosedGit =
  | 'none'
  | 'unavailable'
  | {
      branch: string;
      commit: string;
      dirty: boolean;
    };

/** One platform's bundle as the bundler reports it - the same fields the dry-run plan prints. */
export type PosedBundle = {
  bundlePath: string;
  bundleSizeMb: number;
  bundleFormat: 'plain-js' | 'hermes-bytecode';
  bundler: 'expo' | 'metro';
  assets: string[];
  /**
   * The story-file source paths the bundler's module manifest closes over - what the dry-run
   * plan's "of N stories" counts. `null` poses a bundle that came with no module map at all, which
   * is what a real bundle is when Metro is configured without Sherlo's wrapper: the plan line then
   * reads "all stories", with no count.
   */
  storyClosureKeys: string[] | null;
};

/**
 * ONE SCRIPTED ANSWER, and the declaration every copy of the pose shape is generated from: the
 * `call` names the operation as the tool's own client names it, `with` names the few arguments a
 * pose can meaningfully state, and `answer` is what the server said - which may be the error it
 * would have sent instead.
 */
export type ScriptedCall =
  | {
      call: 'getBuildStatus';
      with: {
        buildIndex: number;
      };
      answer: ApiError | BuildStatusAnswer | null;
    }
  | {
      call: 'createProject';
      with: {
        teamId: string;
        name: string;
      };
      answer:
        | ApiError
        | {
            name: string;
            index: number;
            projectToken: string;
          };
    }
  | {
      call: 'createTeam';
      with: {
        name: string;
      };
      answer:
        | ApiError
        | {
            id: string;
            name: string;
          };
    }
  | {
      call: 'listTeams';
      with: Record<string, never>;
      /** `role` is the caller's membership role, or null when the API does not say. */
      answer:
        | ApiError
        | {
            teams: Array<{
              id: string;
              name: string;
              projectCount: number;
              role: string | null;
            }>;
          };
    }
  | {
      call: 'listProjects';
      with: {
        teamId: string;
      };
      /** `mainBranch` is null while the project has never chosen one. */
      answer:
        | ApiError
        | {
            team: {
              name: string;
              id: string;
            };
            projects: Array<{
              index: number;
              name: string;
              buildCount: number;
              mainBranch: string | null;
            }>;
          };
    }
  | {
      call: 'openBuild';
      with: {
        platforms: string[];
      };
      answer:
        | ApiError
        | {
            buildIndex: number;
            url: string;
            captureDecision?: PosedCaptureDecision;
          };
    }
  | {
      call: 'computeDiffScopeDryRun';
      with: {
        branch: string;
        commit: string;
      };
      answer: ApiError | DiffScopeDryRunAnswer;
    }
  | {
      /** A real push's first question: has the server seen these binaries, and which build is next. */
      call: 'getNextBuildInfo';
      with: {
        platforms: string[];
      };
      answer: ApiError | NextBuildInfoAnswer;
    }
  | {
      /**
       * The staged slots a fresh bundle is uploaded into. Scripted so the pose says the call was made;
       * the answer holds nothing a pose could state, because nothing the tool prints reads it.
       */
      call: 'getStagedUploadUrls';
      with: {
        platforms: string[];
      };
      answer: ApiError | Record<string, never>;
    }
  | {
      /**
       * The staged road's first question, asked once per platform BEFORE anything is bundled: can this
       * commit reuse the base registered under this fingerprint? `fast` takes the road;
       * `full-build-needed` names which layers of the bundle's identity moved (`diff`), and
       * `not-stageable` is a project that can never take it. The post-bundle check asks the same
       * question again with the bundle's real identity, so a bare push scripts it TWICE per platform
       * when the first answer is `fast`.
       */
      call: 'checkStagedGate';
      with: {
        platform: string;
        baseFingerprint: string;
      };
      answer: ApiError | StagedGateAnswer;
    }
  | {
      /**
       * One progress report `sherlo init` sends as it goes, named by the step that sent it
       * (`"0_init"`, `"3_metro_config"`). The answer is the session the whole setup is recorded under,
       * which the command carries into the next report - so a pose of an `init` scripts one of these
       * per step, in order, and a step the pose did not script is refused.
       */
      call: 'trackCliInit';
      with: {
        event: string;
      };
      answer:
        | ApiError
        | {
            sessionId: string;
          };
    };

/** What a real push read off the machine, as a pose states it. */
export type PosedPush = {
  /**
   * The instant the run read the clock at, ISO 8601 - what "7 minutes ago" on a reuse line is
   * measured against.
   */
  now: string;
  /** The binaries the command was handed, per platform (`android`, `ios`). */
  binaries: Record<string, PosedBinary>;
  /**
   * The base fingerprint over the project's native inputs, or why there was none (the tool prints
   * its own warning for it).
   */
  fingerprint:
    | {
        hash: string;
      }
    | {
        unavailable: string;
      };
};

/** The two acts `sherlo init` performs on the machine, as a pose states them. */
export type PosedWorkstation = {
  /**
   * What the package manager answered when asked to add Sherlo: the package it installed, version
   * and all (`"@sherlo/react-native-storybook@2.0.2"`). Checked against the package the command
   * actually asked for, so a pose cannot answer an install the command never made.
   */
  install: {
    package: string;
  };
  /**
   * Whether a person pressed Enter at the prompt, or the terminal was closed on it. `"closed"` is
   * what a run nobody is watching gets, and the tool's own cancel branch prints for it.
   */
  enter: 'pressed' | 'closed';
};

/**
 * What the letterbox on the bundler answered, as a pose states it.
 *
 * A pose never supplies the words the screen shows. It says which stories the running app has,
 * whether an app was listening at all, and - for a command that waited - what the app reported
 * back about the story it was asked for. The tool prints whatever it prints for that.
 */
export type PosedLetterbox =
  | 'no-bundler'
  | 'no-app'
  | {
      /** Every story the running app's Storybook knows, by id, in the order it lists them. */
      stories: string[];
      /**
       * What the app reported for the story it was asked for: that it is on screen, or that it never
       * got there before the wait ran out. Absent for a post that did not ask to wait.
       */
      rendered?: 'yes' | 'timed-out';
      /**
       * What the story the app was asked for threw while rendering, in the story's own words. A story
       * only reports its own breakage once it has painted, so this is stated alongside `rendered:
       * 'yes'` and nowhere else. Absent poses a story that drew cleanly.
       */
      threw?: {
        name: string;
        message: string;
      };
    };

/**
 * What the running app answered for a capture, as a pose states it.
 *
 * As with the letterbox, a pose never supplies the words the screen shows: it states what the app
 * recorded - how the stabilization ended, what the story threw, the view tree - and the tool
 * prints whatever it prints for that.
 */
export type PosedCapture =
  | 'no-bundler'
  | 'no-app'
  | {
      /** Every story the running app's Storybook knows, by id. */
      stories: string[];
      /**
       * The app stopped answering mid-capture - a fatal error or a native crash - and what it said
       * before it died, when it said anything. An empty object is a crash that said nothing.
       */
      crashed: {
        name?: string;
        message?: string;
      };
    }
  | {
      /** Every story the running app's Storybook knows, by id. */
      stories: string[];
      /** How the stabilization ended: settled after so long over so many frames, or gave up. */
      settled:
        | 'timed-out'
        | {
            ms: number;
            frames: number;
          };
      /** What the story threw while rendering, in its own words. Absent for a clean story. */
      threw?: {
        name: string;
        message: string;
      };
      /**
       * How many screenfuls the story was captured in. Absent says as little as an app that never
       * mentioned it, which prints the same as `1`: a story that fits the screen.
       */
      parts?: number;
      /** Whether any view in the story loads an image over the network. Absent prints nothing. */
      hasNetworkImage?: boolean;
      /** The view tree the app read, from the story's own root. */
      tree: PosedView;
    };

/** The error the server sends, as the tool's client surfaces it. */
export type ApiError = {
  error: string;
};

/**
 * What `getBuildStatus` answers. THE WIRE'S OWN SHAPE, aliased rather than re-typed: a pose
 * describing a build the backend cannot send would let a product design be approved off a state
 * that can never occur.
 */
export type BuildStatusAnswer = {
  runStatus: 'canceled' | 'error' | 'finished' | 'inProgress' | 'queued' | 'waiting';
  /**
   * THE GATE, and the CLI does not decide it - the server does.
   *
   * `true` means this build is one the sparse-build redesign governs: the project opted in AND the
   * build is on a non-main branch. Both halves are folded in server-side and frozen onto the build
   * record at openBuild, so the CLI never has to know the branch axis and a build cannot change
   * its mind halfway through a poll loop.
   *
   * ABSENT OR `false` MEANS OFF, and off means byte-identical to what this loop has always
   * printed. Absent is the older-API case and must never be read as opt-in - every project that
   * has not opted in is on that path.
   *
   * There is exactly ONE such switch. The GitHub check reads this same boolean off the same build
   * record (`Build.showsOnlyBranchChanges`), which is the whole point: two surfaces reading two
   * flags is how the drift this redesign repairs would come back. The per-project opt-in
   * (`Project.shouldShowOnlyBranchChanges`) is deliberately NOT on the wire - it has no branch
   * axis applied, so a CLI reading it would gate builds the check does not.
   */
  showsOnlyBranchChanges?: boolean;
  /**
   * The build's review status, EXACTLY as the server's own `getBuildStatus` util computes it - the
   * same value `deriveBuildCheckState` hands the GitHub check for a finished build.
   *
   * WHY THE CLI READS THIS RATHER THAN COMPUTING GREENNESS ITSELF. The defect the sparse redesign
   * repairs is two surfaces deriving one build's verdict from the same tally by two different
   * formulas. Adding a third formula here - however carefully written - would be the same mistake
   * one layer further out. So on the gated path the CLI stops deciding greenness and mirrors the
   * server's answer, and the two cannot drift by construction.
   *
   * Spelled inline rather than imported from `@sherlo/api-types`'s `Status` for the same reason
   * every other field of this wire shape is: this type describes what THIS query selects. It is
   * the same four values.
   *
   * Absent on an older API -> the gated path degrades to today's count-based logic rather than
   * inventing a verdict from a field nobody sent.
   */
  status?: 'approved' | 'noChanges' | 'reported' | 'unreviewed';
  viewStatusesCount?: {
    approved: number;
    noChanges: number;
    reported: number;
    unreviewed: number;
  };
  runError?: unknown;
  /**
   * Build-wide Diff Scope capture accounting, mirrored off Build.diffScopeInfo (same shape already
   * used by BuildFragment/CloseBuildFragment elsewhere in the API). Absent on older API responses
   * -> the closing message degrades to the generic "All stories passed" line (SHERLO-1962). A
   * server-bypassed build (SHERLO-1959: the runner never ran because the server already knew every
   * story's screenshot could be inherited) reports capturedSnapshotCount 0, inheritedSnapshotCount
   * equal to the whole suite, and a per-platform `platforms.<platform>.reason` carrying the
   * server's plain-prose explanation.
   *
   * We read `platforms.<platform>.reason`, NOT `fullCaptureTriggerReason`. Per the API schema
   * (build.graphql) `reason` is the operator-approved prose the CLI prints verbatim, while
   * `fullCaptureTriggerReason` is a machine enum code that (a) is only set for FULL captures and
   * so is always absent on a bypassed build - which is a partial capture by definition - and (b)
   * would print a raw machine code if it ever were surfaced (SHERLO-1919/1963).
   */
  diffScopeInfo?: {
    capturedSnapshotCount?: number;
    inheritedSnapshotCount?: number;
    platforms?: {
      android?: {
        reason?: string;
      };
      ios?: {
        reason?: string;
      };
    };
  };
  /**
   * The build's frozen git identity (view-metadata, operator ruling 2026-09-03) - only the two
   * fields `getBuildStatus` sends. Absent on an older API.
   */
  gitInfo?: {
    branchName: string;
    commitHash: string;
  };
  /**
   * Per-story rows (view-metadata, operator ruling 2026-09-03): what `sherlo view --metadata`
   * prints as `stories[]`. `status` is spelled as the plain string the wire sends (including the
   * hyphenated `"review-required"`) rather than a narrowed union, because `@sherlo/api-types` is
   * not the source of this hand-written wire shape (see this file's module doc) and a value this
   * CLI has not learned yet must still pass through rather than fail to parse. Absent for a build
   * with no view rows yet.
   */
  stories?: Array<{
    name: string;
    status: string;
    baseline: {
      buildIndex: number;
    } | null;
    /** `null` is a row the wire sent with nothing to say - distinct from absent (an older API). */
    reason?: string | null;
    /** `null` is a row the wire sent with nothing to say - distinct from absent (an older API). */
    candidates?: Array<{
      buildIndex: number;
    }> | null;
  }>;
  /**
   * The Diff Scope block (view-metadata, operator ruling 2026-09-03): what `sherlo view
   * --metadata` prints as `diffScope`. Hand-typed rather than imported from `@sherlo/api-types`
   * for the same reason every other field of this wire shape is (see this file's module doc) -
   * server commit e7c7d5a (sherlo-api `feature/sherlo-3`) added it and the portal tarball this
   * repo builds against may not carry it yet. Absent on an older API.
   */
  diffScope?: {
    reason: string;
    captured: string[];
    inherited: string[];
    ancestorBuildIndex: number | null;
  };
};

/**
 * The server's capture decision at `openBuild`, per platform - what the "📸 Capture plan" block
 * and the one-line "Diff Scope:" summary print (SHERLO-1919). THE ONE OPTIONAL FIELD ON
 * `openBuild`'s answer: absent means the server made no decision (an older API, or Diff Scope off)
 * - the tool prints no plan block and closes straight to the Review link, exactly as it does
 * today. A platform absent from `platforms` gets the same silent treatment, one platform at a
 * time.
 */
export type PosedCaptureDecision = {
  /**
   * Per platform (`android`, `ios`): whether every story was captured, and which weren't, when
   * not.
   */
  platforms: Record<string, PosedPlatformCaptureDecision>;
  /**
   * The build-wide reason a FULL capture prints when the platform has none of its own - the "why:"
   * row under "capturing all N stories" (absent -> the "! couldn't compute what changed" safety
   * row instead).
   */
  fullCaptureTriggerReason?: string;
  /** The build this decision diffed against - the "inheriting N from build #A" clause. */
  ancestorBuildIndex?: number;
};

/** What the dry-run road's one read-only question answers. */
export type DiffScopeDryRunAnswer = {
  platforms: Array<{
    platform: 'android' | 'ios';
    isFullCapture: boolean;
    reason: string;
    capturedStoryFilePaths: string[];
  }>;
};

/**
 * What the push's first question answers: which build comes next and, per binary, whether the
 * server wants it uploaded or already holds it from an earlier build - `reuse` is what the
 * `reusing unchanged build (Test 1, 7 minutes ago)` line is printed from.
 */
export type NextBuildInfoAnswer = {
  nextBuildIndex: number;
  binaries: Record<
    string,
    | {
        upload: true;
      }
    | {
        reuse: {
          buildIndex: number;
          createdAt: string;
        };
      }
  >;
};

/** What the staged gate answers, exactly as the tool's client surfaces it. */
export type StagedGateAnswer = {
  outcome: 'fast' | 'full-build-needed' | 'not-stageable';
  /** The layers of the bundle's identity that moved - named on a refusal, empty otherwise. */
  diff: Array<
    | 'engineClass'
    | 'assetInventory'
    | 'expoUpdatesEnabled'
    | 'sdkProtocolVersion'
    | 'buildMetadata'
    | 'bundleFormat'
  >;
};

/**
 * One binary as a pose states it - what the tool would have read out of the file. A pose states no
 * `buildType`: the tool derives preview-or-development from `hasEmbeddedBundle` by its own rule,
 * and whether the binary can be a base from the three gate facts by its own rule too.
 */
export type PosedBinary = {
  /** The file's hash, sent to the server to ask whether it has seen this binary. Never printed. */
  hash: string;
  /** What the upload line announces, e.g. `"48.12"`. */
  sizeMb: string;
  /** The Sherlo SDK version baked into the binary; `null` poses the missing-Sherlo refusal. */
  sdkVersion: string | null;
  /**
   * Whether a JS bundle sits at the platform-default path - a preview build has one, a development
   * build does not.
   */
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

/**
 * One view in a posed tree. Only what the view has is stated: `components` are the app's own
 * components that render it, outermost first; `text` is what a text view says.
 */
export type PosedView = {
  primitive: string;
  components?: string[];
  text?: string;
  /** The view's box in points, as the inspector reports it. */
  size?: {
    width: number;
    height: number;
  };
  /** The React style matched to the view, one object, with the keys the source wrote. */
  style?: Record<string, unknown>;
  /** The other props the screen prints beside the style: a placeholder, a testID, numberOfLines. */
  props?: Record<string, string | number | boolean>;
  children?: PosedView[];
};

/** One platform's capture decision, as a pose states it. */
export type PosedPlatformCaptureDecision = {
  /**
   * `true` prints "capturing all N stories in this bundle"; `false` prints the partial
   * closure-diff.
   */
  full: boolean;
  /**
   * The story files captured, when `full` is `false`. Ignored (the block reads "all N") when
   * `full` is `true`.
   */
  storyFilePaths?: string[];
  /**
   * The server's per-platform reason, printed verbatim after "why: " (or before the summary's
   * colon).
   */
  reason?: string;
};
