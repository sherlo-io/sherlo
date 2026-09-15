/**
 * THE CATALOG for the PREFLIGHT REFUSAL family (F3) - which committed fixture in
 * sherlo-tester each `--emit-expectation` scenario answers for.
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
 * from a scenario to the bytes already committed in git, so the ratchet can
 * require byte-identity against them. Provenance (the `.minted.json` sidecars)
 * says a fixture WAS minted; only this binding proves it STILL renders.
 *
 * ==========================================================================
 * WHY EVERY SCENARIO NOW ALSO CARRIES A `localFixture`
 * ==========================================================================
 *
 * cli-emit-expectation-whole-screen taught `renderEmittedStdout` to render the
 * WHOLE refusal screen (the guard's message plus the "Need Help?" epilogue),
 * not the guard's message alone - see `emitExpectation.ts`. Every `fixtures`
 * path below still holds the OLD, message-only bytes: sherlo-tester re-mints
 * them from this new road only after this change lands (the architect's own
 * capture/story loop, not a step this PR can reach into another repository to
 * perform). Byte-identity against `fixtures` is therefore EXPECTED to be red
 * until that re-mint, and `preflightRefusals.test.ts` no longer asserts it -
 * `fixtures` is still checked for EXISTENCE (so a path drift like the beats
 * port below still reds immediately), just not for content, until the re-mint
 * lands and that assertion is restored.
 *
 * `localFixture` - a file this repo commits under
 * `__tests__/preflightRefusals.fixtures/` - is what the ratchet instead proves
 * byte-identity against, unconditionally (no sherlo-tester checkout needed).
 * It is not a weaker proof of a DIFFERENT thing: it is `renderEmittedStdout`'s
 * OWN output, reviewed into git through this very PR, so the "a person
 * reviewed these bytes" property the family's fixtures are supposed to carry
 * still holds - just reviewed here instead of over in sherlo-tester.
 *
 * ==========================================================================
 * THE BEATS PORT (2026-09-15) - WHY FOUR SCENARIOS' `fixtures` PATHS MOVED
 * ==========================================================================
 *
 * sherlo-tester's `epic/cli-refusals-to-beats` branch already migrated the
 * token/config/project-root refusal suites onto its "beats" framework: the old
 * `e2e/helpers/cli-*-refusals/fixtures/*.txt` fixtures were archived (still on
 * disk under `e2e/suites-archived/`, not deleted) and the live baselines moved
 * to `e2e-beats/suites/cli/.../*.spec.ts-snapshots/*.txt`. `token-malformed`
 * now answers for TWO baselines there (`invalid-token-rejection...` and
 * `empty-token-rejection...` - same bytes, two Playwright specs). The two
 * binary-preflight fixtures were not part of that port and keep their
 * original path. See CI run 34917459522 on sherlo#265 for the failure this
 * caused (`fixtureExists` false at the old paths) and the architect's digest
 * that named the new ones.
 */

/** A scenario id from `emitExpectation.ts`, bound to the fixtures it answers for. */
export type PreflightRefusalScenario = {
  /** Why this refusal exists and what a reader should learn from its fixture. */
  description: string;
  /**
   * Every committed fixture, relative to the sherlo-tester repo root, whose
   * PATH this scenario answers for. Checked for existence (catches a path
   * drift like the beats port above); not yet checked for content - see
   * `localFixture` above for why.
   *
   * A LIST, not a single path, because Playwright writes one baseline per PROJECT
   * name: `...-CLI-Errors-darwin.txt` and `...-CLI-Errors-Smokes-darwin.txt` are
   * the same refusal captured under two project names. Both are committed, so both
   * are proved - listing only one would leave a real committed baseline unproven
   * while the counts still looked complete.
   */
  fixtures: readonly string[];
  /**
   * Filename under `__tests__/preflightRefusals.fixtures/` holding the bytes
   * THIS repo commits and re-mints from `renderEmittedStdout` - the ratchet's
   * actual byte-identity gate, independent of the sherlo-tester checkout.
   */
  localFixture: string;
};

export const PREFLIGHT_REFUSALS: Record<string, PreflightRefusalScenario> = {
  'token-malformed': {
    description:
      'A `token` is present but is not a valid Sherlo token - the refusal a user with a ' +
      'mistyped or expired token actually sees.',
    fixtures: [
      'e2e-beats/suites/cli/token-refusals/01-token-errors.spec.ts-snapshots/invalid-token-rejection-CLI-Token-Refusals-darwin.txt',
      'e2e-beats/suites/cli/token-refusals/01-token-errors.spec.ts-snapshots/empty-token-rejection-CLI-Token-Refusals-darwin.txt',
    ],
    localFixture: 'token-malformed.txt',
  },
  'devices-empty': {
    description: 'Config `devices` is an empty array - nothing to test on.',
    fixtures: [
      'e2e-beats/suites/cli/config-refusals/01-config-errors.spec.ts-snapshots/empty-devices-rejection-CLI-Config-Refusals-darwin.txt',
    ],
    localFixture: 'devices-empty.txt',
  },
  'config-missing': {
    description: 'No config file at the resolved (default project root) path.',
    fixtures: [
      'e2e-beats/suites/cli/config-refusals/01-config-errors.spec.ts-snapshots/missing-config-rejection-CLI-Config-Refusals-darwin.txt',
    ],
    localFixture: 'config-missing.txt',
  },
  'project-root-invalid': {
    description:
      '--project-root points at a directory with no config file. Renders byte-identical to ' +
      '`config-missing`, and the two fixtures below are separately committed proof of that: ' +
      'the CLI has ONE message for "no config file at the resolved path", not a second one for ' +
      'a wrong project root.',
    fixtures: [
      'e2e-beats/suites/cli/project-root-refusal/01-project-root-errors.spec.ts-snapshots/project-root-rejection-CLI-Project-Root-Refusal-darwin.txt',
    ],
    localFixture: 'config-missing.txt',
  },
  'binary-path-missing': {
    description:
      'Neither --android nor the config `android` property was passed. Carries the boxed ' +
      '"Preview Simulator Build" panel and the INFO footer - the family\'s most structured bytes.',
    fixtures: [
      'e2e/suites/cli/binary-preflight/03-path-errors.spec.ts-snapshots/missing-android-path-rejection-CLI-Errors-darwin.txt',
      'e2e/suites/cli/binary-preflight/03-path-errors.spec.ts-snapshots/missing-android-path-rejection-CLI-Errors-Smokes-darwin.txt',
    ],
    localFixture: 'binary-path-missing.txt',
  },
  'binary-path-nonexistent': {
    description: 'An --android path was passed but nothing exists there.',
    fixtures: [
      'e2e/suites/cli/binary-preflight/03-path-errors.spec.ts-snapshots/nonexistent-binary-path-rejection-CLI-Errors-darwin.txt',
      'e2e/suites/cli/binary-preflight/03-path-errors.spec.ts-snapshots/nonexistent-binary-path-rejection-CLI-Errors-Smokes-darwin.txt',
    ],
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
    'scenario, but no suite in sherlo-tester commits a baseline for it - the token chapter ' +
    'captures the MALFORMED token instead. Nothing to ratchet against until a suite mints one; ' +
    'listing it here keeps that gap visible rather than letting the catalog look complete.',
  'binary-abi-x86-only':
    'the Android ABI refusal. Its two committed fixtures (04-abi-preflight) are the EXPO ' +
    'variant, and the emit scenario renders the BARE-RN fix hint - its synthetic BinariesInfo ' +
    'carries no expoSdkVersion, so it prints the `reactNativeArchitectures` branch where the ' +
    'fixtures print the `expo-build-properties` one. Those two fixtures are already named in ' +
    "sherlo-tester's EXEMPT_FIXTURES for exactly this reason. Binding them here would demand " +
    'byte-identity between two DIFFERENT branches of a real refusal. Unblocked by an ' +
    'Expo-specific scenario id, not by relaxing the comparison.',
};
