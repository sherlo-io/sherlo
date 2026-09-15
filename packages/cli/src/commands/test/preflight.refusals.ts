/**
 * THE CATALOG for the PREFLIGHT REFUSAL family (F3) - which POSE each
 * `--emit-expectation` scenario answers for.
 *
 * The peer families (`dryRun.transcripts.ts`, `verdict.transcripts.ts`) each carry a
 * catalog of SCRIPTED WIRE STATE plus the fixture it renders. This family's
 * catalog is thinner on purpose, and the reason is the whole argument for why F3
 * was ALIGNED rather than MIGRATED onto the segment/sink layer:
 *
 * A dry-run or push transcript is a whole screen assembled from many decisions,
 * so its scripted state is a wire payload and its producer is a render layer that
 * had to be extracted from a command. A preflight refusal is ONE guard's thrown
 * message. Its "scripted state" is the synthetic input that makes that guard
 * refuse - which already lives in `emitExpectation.ts`, beside the guard call it
 * feeds - and its producer is the shipped guard plus the shipped error formatter,
 * with no second copy of the text anywhere. There is no render layer to extract
 * here because the refusal text never had a parallel print path to begin with.
 *
 * So what this file adds is the ONE thing the family was missing: the binding
 * from a scenario to the screen this repo commits, so the ratchet can require
 * byte-identity against it.
 *
 * A screen holds the WHOLE screen, so it opens with the sherlo intro wherever
 * the live road prints one before the guard refuses; `config-missing` and
 * `project-root-invalid` carry none, because the config file is read before
 * anything is printed (see `emitExpectation.ts`'s `introPrecedes`).
 *
 * ==========================================================================
 * THE SCREENS ARE THE POSE CATALOGUE'S NOW, AND THAT IS A STRONGER RATCHET
 * ==========================================================================
 *
 * This family used to commit five `.txt` files of its own, minted from
 * `renderEmittedStdout` - so the ratchet proved that one producer agreed with
 * its own past output. The screens it compares against now are the pose
 * catalogue's (`packages/cli/poses/test/refusal-*.txt`), which are minted by
 * running the WHOLE command through the shipped routing against a declared
 * world - no guard called by hand, no intro decided by a table.
 *
 * That turns every case below into a claim worth making: the guard-plus-
 * formatter road and the run-the-command road produce THE SAME BYTES. Six of
 * the seven scenarios do, exactly. The seventh is recorded in
 * {@link UNBOUND_SCENARIOS} with what differs and why, rather than excused by
 * a looser comparison.
 *
 * ==========================================================================
 * ONE REPOSITORY, ONE FIXTURE - NO CROSS-REPO PATHS (operator ruling,
 * sherlo#265 review, 2026-09-15)
 * ==========================================================================
 *
 * This catalog used to also carry paths into sherlo-tester's committed
 * baselines, and the ratchet opened them by path to compare against. That is
 * gone: a repository must not read another repository's files by path. The
 * CLI's own committed screen (`posedScreen`, under `packages/cli/poses/`) is
 * this repository's entire ratchet, proven unconditionally - it IS what the
 * shipped command printed for that pose, reviewed into git through the PR that
 * touches it. Sherlo-tester's committed panes are a SEPARATE proof, carried by
 * sherlo-tester's own story run (it mints its baselines from this same CLI and
 * re-runs when the board is quiet - see
 * `packages/cli/src/commands/test/emitExpectation.ts`'s header and the epic's
 * `e2e` note); this repo does not - and must not - reach into that repository
 * to check it.
 *
 * Where a scenario corresponds to a specific sherlo-tester suite, that is
 * named in `description` as PROSE, for a reader's orientation only - never a
 * path any test here opens.
 */

/** A scenario id from `emitExpectation.ts`, bound to the pose whose screen it answers for. */
export type PreflightRefusalScenario = {
  /**
   * Why this refusal exists, what a reader should learn from its screen, and
   * (in prose, not a path) which sherlo-tester suite mints the matching
   * baseline - informational only, never opened by a test in this repo.
   */
  description: string;
  /**
   * The pose in `packages/cli/poses/` whose committed screen these bytes must equal, named the
   * way the catalogue names it (`test/refusal-token-malformed`). The screen beside that pose is
   * the ratchet's entire gate.
   */
  posedScreen: string;
};

export const PREFLIGHT_REFUSALS: Record<string, PreflightRefusalScenario> = {
  'token-missing': {
    description:
      'The `token` option/config property is omitted entirely - the refusal a project with no ' +
      'token at all gets. Unratcheted until the pose catalogue minted a screen for it; ' +
      "sherlo-tester's token chapter captures the MALFORMED token instead.",
    posedScreen: 'test/refusal-token-missing',
  },
  'token-malformed': {
    description:
      'A `token` is present but is not a valid Sherlo token - the refusal a user with a ' +
      "mistyped or expired token actually sees. Minted independently in sherlo-tester's " +
      'token-refusals suite (invalid-token-rejection / empty-token-rejection panes).',
    posedScreen: 'test/refusal-token-malformed',
  },
  'devices-empty': {
    description:
      'Config `devices` is an empty array - nothing to test on. Minted independently in ' +
      "sherlo-tester's config-refusals suite (empty-devices-rejection pane).",
    posedScreen: 'test/refusal-devices-empty',
  },
  'config-missing': {
    description:
      'No config file at the resolved (default project root) path. Minted independently in ' +
      "sherlo-tester's config-refusals suite (missing-config-rejection pane).",
    posedScreen: 'test/refusal-config-missing',
  },
  'project-root-invalid': {
    description:
      '--project-root points at a directory with no config file. Renders byte-identical to ' +
      '`config-missing` - the CLI has ONE message for "no config file at the resolved path", ' +
      "not a second one for a wrong project root. Minted independently in sherlo-tester's " +
      'project-root-refusal suite.',
    posedScreen: 'test/refusal-project-root-invalid',
  },
  'binary-path-missing': {
    description:
      'Neither --android nor the config `android` property was passed. Carries the boxed ' +
      '"Preview Simulator Build" panel and the INFO footer - the family\'s most structured ' +
      "bytes. Minted independently in sherlo-tester's binary-preflight suite " +
      '(missing-android-path-rejection panes).',
    posedScreen: 'test/refusal-binary-path-missing',
  },
};

export const PREFLIGHT_REFUSAL_IDS = Object.keys(PREFLIGHT_REFUSALS);

/**
 * Scenarios in `emitExpectation.ts` that no committed screen answers for, with
 * the reason - the counterpart of the ratchet's totality case, which would
 * otherwise be satisfiable by quietly dropping a scenario from the catalog above.
 */
export const UNBOUND_SCENARIOS: Record<string, string> = {
  'binary-path-nonexistent':
    'an --android path was passed but nothing exists there. Both roads render this refusal; ' +
    'they name the PATH differently, and neither is wrong. The emit road has no project, so it ' +
    'feeds the guard an invented absolute path and folds it to `<SHERLO_ANDROID_BUILD_PATH>`. ' +
    'The pose road has a real project folder, so the tool resolves the path the user typed ' +
    'inside it and the screen says `<PROJECT_ROOT>/builds/app-release.apk` - which is what a ' +
    'user reads. Binding them would demand byte-identity between two different, both-correct ' +
    'maskings; the pose screen is the one that survives when the emit road is removed.',
  'binary-abi-x86-only':
    "the Android ABI refusal. sherlo-tester's two committed panes (04-abi-preflight) are the " +
    'EXPO variant, and the emit scenario renders the BARE-RN fix hint - its synthetic ' +
    'BinariesInfo carries no expoSdkVersion, so it prints the `reactNativeArchitectures` ' +
    'branch where those panes print the `expo-build-properties` one. Binding them here would ' +
    'demand byte-identity between two DIFFERENT branches of a real refusal. Unblocked by an ' +
    'Expo-specific scenario id, not by relaxing the comparison.',
};
