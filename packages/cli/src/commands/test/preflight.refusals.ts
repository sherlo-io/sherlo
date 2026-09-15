/**
 * THE CATALOG for the PREFLIGHT REFUSAL family (F3) - which fixture this repo
 * commits each `--emit-expectation` scenario answers for.
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
 * from a scenario to the fixture this repo commits, so the ratchet can require
 * byte-identity against it.
 *
 * ==========================================================================
 * ONE REPOSITORY, ONE FIXTURE - NO CROSS-REPO PATHS (operator ruling,
 * sherlo#265 review, 2026-09-15)
 * ==========================================================================
 *
 * This catalog used to also carry paths into sherlo-tester's committed
 * baselines, and the ratchet opened them by path to compare against. That is
 * gone: a repository must not read another repository's files by path. The
 * CLI's own local fixture (`localFixture`, under
 * `__tests__/preflightRefusals.fixtures/`) is this repository's entire
 * ratchet, proven unconditionally - it IS `renderEmittedStdout`'s output,
 * reviewed into git through the PR that touches it. Sherlo-tester's committed
 * panes are a SEPARATE proof, carried by sherlo-tester's own story run (it
 * mints its baselines from this same CLI and re-runs when the board is quiet -
 * see `packages/cli/src/commands/test/emitExpectation.ts`'s header and the
 * epic's `e2e` note); this repo does not - and must not - reach into that
 * repository to check it.
 *
 * Where a scenario corresponds to a specific sherlo-tester suite, that is
 * named in `description` as PROSE, for a reader's orientation only - never a
 * path any test here opens.
 */

/** A scenario id from `emitExpectation.ts`, bound to the fixture it answers for. */
export type PreflightRefusalScenario = {
  /**
   * Why this refusal exists, what a reader should learn from its fixture, and
   * (in prose, not a path) which sherlo-tester suite mints the matching
   * baseline - informational only, never opened by a test in this repo.
   */
  description: string;
  /**
   * Filename under `__tests__/preflightRefusals.fixtures/` holding the bytes
   * THIS repo commits and re-mints from `renderEmittedStdout` - the ratchet's
   * entire gate.
   */
  localFixture: string;
};

export const PREFLIGHT_REFUSALS: Record<string, PreflightRefusalScenario> = {
  'token-malformed': {
    description:
      'A `token` is present but is not a valid Sherlo token - the refusal a user with a ' +
      "mistyped or expired token actually sees. Minted independently in sherlo-tester's " +
      'token-refusals suite (invalid-token-rejection / empty-token-rejection panes).',
    localFixture: 'token-malformed.txt',
  },
  'devices-empty': {
    description:
      'Config `devices` is an empty array - nothing to test on. Minted independently in ' +
      "sherlo-tester's config-refusals suite (empty-devices-rejection pane).",
    localFixture: 'devices-empty.txt',
  },
  'config-missing': {
    description:
      'No config file at the resolved (default project root) path. Minted independently in ' +
      "sherlo-tester's config-refusals suite (missing-config-rejection pane).",
    localFixture: 'config-missing.txt',
  },
  'project-root-invalid': {
    description:
      '--project-root points at a directory with no config file. Renders byte-identical to ' +
      '`config-missing` - the CLI has ONE message for "no config file at the resolved path", ' +
      "not a second one for a wrong project root. Minted independently in sherlo-tester's " +
      'project-root-refusal suite.',
    localFixture: 'config-missing.txt',
  },
  'binary-path-missing': {
    description:
      'Neither --android nor the config `android` property was passed. Carries the boxed ' +
      '"Preview Simulator Build" panel and the INFO footer - the family\'s most structured ' +
      "bytes. Minted independently in sherlo-tester's binary-preflight suite " +
      '(missing-android-path-rejection panes).',
    localFixture: 'binary-path-missing.txt',
  },
  'binary-path-nonexistent': {
    description:
      'An --android path was passed but nothing exists there. Minted independently in ' +
      "sherlo-tester's binary-preflight suite (nonexistent-binary-path-rejection panes).",
    localFixture: 'binary-path-nonexistent.txt',
  },
};

export const PREFLIGHT_REFUSAL_IDS = Object.keys(PREFLIGHT_REFUSALS);

/**
 * Scenarios in `emitExpectation.ts` that no committed fixture answers for, with
 * the reason - the counterpart of the ratchet's totality case, which would
 * otherwise be satisfiable by quietly dropping a scenario from the catalog above.
 */
export const UNBOUND_SCENARIOS: Record<string, string> = {
  'token-missing':
    'the `token` option/config property omitted entirely. A real refusal with a real emit ' +
    'scenario, but no suite mints a baseline for it - the token chapter captures the ' +
    'MALFORMED token instead. Nothing to ratchet against until a suite mints one; listing it ' +
    'here keeps that gap visible rather than letting the catalog look complete.',
  'binary-abi-x86-only':
    "the Android ABI refusal. sherlo-tester's two committed panes (04-abi-preflight) are the " +
    'EXPO variant, and the emit scenario renders the BARE-RN fix hint - its synthetic ' +
    'BinariesInfo carries no expoSdkVersion, so it prints the `reactNativeArchitectures` ' +
    'branch where those panes print the `expo-build-properties` one. Binding them here would ' +
    'demand byte-identity between two DIFFERENT branches of a real refusal. Unblocked by an ' +
    'Expo-specific scenario id, not by relaxing the comparison.',
};
