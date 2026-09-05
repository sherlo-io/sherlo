/**
 * THE TRANSCRIPT POSE CONTRACT - the state a caller declares to make the Sherlo
 * CLI render one of its own transcripts, without a build, a token or a network.
 *
 * `sherlo test --dry-run --render-transcript <id>` renders a transcript the CLI
 * ships a name for. That is enough to review the CLI's own catalog and nothing
 * else: a caller who wants to see what `sherlo view` would print for a build
 * shape the catalog does not contain has no way to ask. This file is the answer.
 * It declares a POSE - the whole of the state one command needed to print what it
 * printed - and `sherlo test --dry-run --render-transcript-state <path|->` reads
 * one and renders it through the very same code the named road runs.
 *
 * ------------------------------------------------------------------------
 * WHY THIS FILE HAS NO IMPORTS, AND MAY NEVER GROW ONE.
 *
 * A consumer copies this file. Not a package, not a generated client - the file,
 * verbatim, into a repository that has no access to the CLI's internals and must
 * still describe a pose the CLI will accept. An import would make the copy
 * unresolvable the moment it landed, so every type below is written out to its
 * primitives and string literals, and a consumer's sync refuses a copy that
 * contains an import at all.
 *
 * The cost of writing the shapes out is that they could DRIFT from the types the
 * CLI actually decodes into. They cannot, and the mechanism is next door:
 * ./transcript.contract.law.ts asserts these declarations against the live CLI
 * types in both directions, so a field added, removed or retyped in the CLI reds
 * the typecheck here rather than surfacing as a refused pose months later. That
 * law is NOT part of the contract and is not copied - it is the pin that holds
 * the contract to the code.
 *
 * ------------------------------------------------------------------------
 * WHAT A POSE MAY AND MAY NOT SAY.
 *
 * A pose declares WIRE STATE and AMBIENT, and nothing else. It cannot supply a
 * sentence, a colour or a line of output: those live in the CLI's render layer,
 * which is why a rendered transcript is evidence about the CLI and not about the
 * caller who posed it.
 *
 * Every field below is REQUIRED unless the wire itself makes it optional, and
 * `ambient` is required even though the CLI has a default for it. A default that
 * silently matches today is how an expectation drifts from the product: the pose
 * says what it wants, or it is refused. Unknown fields are refused too, by name -
 * a typo in a pose must never be read as "not asking for that".
 */

/**
 * Everything `sherlo view <build>` needed in order to print what it printed.
 *
 * `family` exists so the file can grow the CLI's other transcript families
 * (`dry-run`, `verdict`) as further members of a union without any consumer
 * having to guess which command a pose belongs to.
 */
export type ViewTranscriptPose = {
  family: 'view';
  /** The build the command was pointed at - the `b=` value of a build URL. */
  buildIndex: number;
  /** `--metadata`: print the JSON contract INSTEAD of the human view. */
  showDetails: boolean;
  /**
   * The environment the run actually had, declared rather than inherited.
   * `skipIntro` true suppresses the gradient wordmark the CLI opens with.
   */
  ambient: { skipIntro: boolean };
  /** The one effect a `view` run performs: it asks the backend about one build. */
  api: {
    /**
     * The read's answer. `null` is a real answer, not a missing field: it is what
     * the backend sends for a build index that does not exist, and a pose that
     * states it renders the CLI's own refusal.
     */
    getBuildStatus: PosedBuildStatus | null;
  };
};

/**
 * The `getBuildStatus` answer, exactly as the CLI's query selects it.
 *
 * Optional fields here are optional ON THE WIRE - an older backend simply does
 * not send them, and the CLI's behaviour for an absent field differs from its
 * behaviour for a zero or an empty list. Omit what the backend would omit.
 */
export type PosedBuildStatus = {
  runStatus: 'canceled' | 'error' | 'finished' | 'inProgress' | 'queued' | 'waiting';
  /**
   * The sparse-build gate, decided by the backend and frozen onto the build.
   * Absent or `false` means off.
   */
  showsOnlyBranchChanges?: boolean;
  /** The backend's own review verdict for the build. Absent on an older backend. */
  status?: 'approved' | 'noChanges' | 'reported' | 'unreviewed';
  /** The four review counts. Absent until the build has written them. */
  viewStatusesCount?: {
    approved: number;
    noChanges: number;
    reported: number;
    unreviewed: number;
  };
  /** Whatever the backend recorded about a failed run. Shape is the backend's. */
  runError?: unknown;
  /** Build-wide capture accounting. Absent on an older backend. */
  diffScopeInfo?: {
    capturedSnapshotCount?: number;
    inheritedSnapshotCount?: number;
    platforms?: {
      android?: { reason?: string };
      ios?: { reason?: string };
    };
  };
  /** The build's frozen git identity. Absent on an older backend. */
  gitInfo?: {
    branchName: string;
    commitHash: string;
  };
  /**
   * Per-story rows. `status` is the plain string the wire sends (including the
   * hyphenated `"review-required"`) rather than a narrowed union, so a value the
   * CLI has not learned yet still passes through instead of failing to parse.
   */
  stories?: {
    name: string;
    status: string;
    baseline: { buildIndex: number } | null;
    reason?: string;
    candidates?: { buildIndex: number }[];
  }[];
  /** The build's Diff Scope block. Absent on an older backend. */
  diffScope?: {
    reason: string;
    captured: string[];
    inherited: string[];
    ancestorBuildIndex: number | null;
  };
};
