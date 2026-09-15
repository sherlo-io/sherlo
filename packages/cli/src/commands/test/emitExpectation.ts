/**
 * `sherlo test --dry-run --emit-expectation <scenario>` - expectation-emit mode.
 *
 * Renders the exact refusal text a LIVE run would print for a named preflight
 * scenario - same guard function, same throwError formatter - so consumers that
 * need an expected fixture for that refusal never hand-author one: they mint it
 * by running the CLI itself. Every volatile value the guard would have embedded
 * (an absolute path, a build's file name) is replaced by a stable placeholder at
 * mint time; the placeholder vocabulary is {@link EXPECTATION_PLACEHOLDERS},
 * published below so a consumer never has to invent its own names.
 *
 * Each scenario calls the SAME guard export the live command path calls, with a
 * synthetic input built to fail in exactly the one way the scenario names. There
 * is no second copy of the error text anywhere in this file - only the input
 * differs, never the formatter. Every guard exercised here (validateToken,
 * validateDevices, parseConfigFile, validatePlatformPaths, validateBinariesInfo)
 * runs entirely against local input and never touches the network, matching
 * every real invocation of these guards elsewhere in the CLI.
 *
 * The rendered text is the WHOLE screen a real refusal puts on a user's
 * terminal, not the guard's message alone: {@link renderEmittedStdout} opens
 * with the sherlo intro for every scenario whose refusal the live road reaches
 * AFTER printing it ({@link ExpectationScenario.introPrecedes}) - `config-missing`
 * and `project-root-invalid` carry none, because the config file is read before
 * the intro is printed - and closes with the same "Need Help?" epilogue
 * `start.ts` prints on every uncaught command error, via the one shared producer
 * in `helpers/needHelpEpilogue`.
 */
import { format } from 'util';
import { TEST_COMMAND } from '../../constants';
import { BinariesInfo, InvalidatedConfig } from '../../types';
import parseConfigFile from '../../helpers/getValidatedCommandParams/getNormalizedConfig/parseConfigFile';
import validateDevices from '../../helpers/getValidatedCommandParams/validateCommandParams/validateDevices';
import validateToken from '../../helpers/getValidatedCommandParams/validateCommandParams/validateToken';
import validateBinariesInfo from '../../helpers/getValidatedBinariesInfoAndNextBuildIndex/validateBinariesInfo';
import { validatePlatformPaths } from '../../helpers/shared';
import { renderNeedHelpEpilogue } from '../../helpers/needHelpEpilogue';
import { renderSegment } from '../../render/renderSegment';

/**
 * Placeholder vocabulary for volatile values a guard's message may embed. Defined
 * ONCE here and reused by every scenario below - a consumer reads these off
 * `--emit-expectation list`, never invents its own names.
 */
export const EXPECTATION_PLACEHOLDERS = {
  CONFIG_PATH: '<SHERLO_CONFIG_PATH>',
  ANDROID_BUILD_PATH: '<SHERLO_ANDROID_BUILD_PATH>',
  ANDROID_BUILD_FILE_NAME: '<SHERLO_ANDROID_BUILD_FILE_NAME>',
} as const;

/** The command context every scenario's guard is evaluated under. */
const SCENARIO_COMMAND = TEST_COMMAND;

type ExpectationScenario = {
  guard: string;
  description: string;
  /**
   * STATES WHERE THIS REFUSAL SITS RELATIVE TO THE SHERLO INTRO on the live
   * road: `true` when the wordmark and tagline are already on screen by the
   * time this scenario's guard refuses, `false` when the process refuses
   * before anything is printed.
   *
   * The road decides it, and there are exactly two shapes:
   *
   *   true  - the guard runs INSIDE `stagedRun` / `standardRun`, both of which
   *           print the intro first and validate command params afterwards.
   *   false - the guard runs in `test.ts`, which resolves the sim world (and so
   *           reads the config file) BEFORE either run function is entered.
   *
   * Each scenario's `description` says which of the two it is and why, so the
   * table below answers the question without opening another file.
   */
  introPrecedes: boolean;
  /** Placeholder names (keys of {@link EXPECTATION_PLACEHOLDERS}) this scenario's rendered text may contain. */
  placeholders: (keyof typeof EXPECTATION_PLACEHOLDERS)[];
  /** Triggers the real guard against a synthetic input and returns its raw thrown message. */
  trigger: () => string;
};

const SCENARIOS: Record<string, ExpectationScenario> = {
  'token-missing': {
    guard: 'validateToken',
    description:
      'The `token` option/config property is omitted entirely. The intro precedes it: ' +
      '`stagedRun` prints the intro, then validates command params.',
    introPrecedes: true,
    placeholders: [],
    trigger: () => triggerThrow(() => validateToken({} as InvalidatedConfig)),
  },
  'token-malformed': {
    guard: 'validateToken',
    description:
      'A `token` is present but is not a valid Sherlo token. The intro precedes it: ' +
      '`stagedRun` prints the intro, then validates command params.',
    introPrecedes: true,
    placeholders: [],
    trigger: () =>
      triggerThrow(() => validateToken({ token: 'not-a-real-sherlo-token' } as InvalidatedConfig)),
  },
  'devices-empty': {
    guard: 'validateDevices',
    description:
      'Config `devices` is an empty array. The intro precedes it: `stagedRun` prints the ' +
      'intro, then validates command params.',
    introPrecedes: true,
    placeholders: [],
    trigger: () => triggerThrow(() => validateDevices({ devices: [] } as InvalidatedConfig)),
  },
  'config-missing': {
    guard: 'parseConfigFile',
    description:
      'No config file exists at the resolved (default project root) path. NO intro precedes ' +
      'it: `test.ts` resolves the sim world - which reads the config file - before `stagedRun` ' +
      'is entered, so the process refuses with nothing yet on screen.',
    introPrecedes: false,
    placeholders: ['CONFIG_PATH'],
    trigger: () => {
      const configPath = '/Users/sherlo-user/my-app/sherlo.config.json';
      return maskLiteral(
        triggerThrow(() => parseConfigFile(configPath)),
        configPath,
        EXPECTATION_PLACEHOLDERS.CONFIG_PATH
      );
    },
  },
  'project-root-invalid': {
    guard: 'parseConfigFile',
    description:
      '--project-root points at a directory with no config file. Renders byte-identical to ' +
      '`config-missing` (same guard, same branch) - proof the CLI has exactly one message for ' +
      '"no config file found at the resolved path", not a second one for a wrong project root. ' +
      'NO intro precedes it, for the same reason `config-missing` has none: the config file is ' +
      'read in `test.ts`, before `stagedRun` prints anything.',
    introPrecedes: false,
    placeholders: ['CONFIG_PATH'],
    trigger: () => {
      const configPath = '/Users/sherlo-user/wrong-project-root/sherlo.config.json';
      return maskLiteral(
        triggerThrow(() => parseConfigFile(configPath)),
        configPath,
        EXPECTATION_PLACEHOLDERS.CONFIG_PATH
      );
    },
  },
  'binary-path-missing': {
    guard: 'validatePlatformPaths',
    description:
      'Neither --android nor the config `android` property was passed. The intro precedes it: ' +
      '`standardRun` prints the intro, then validates command params.',
    introPrecedes: true,
    placeholders: [],
    trigger: () =>
      triggerThrow(() =>
        validatePlatformPaths({
          platformsToValidate: ['android'],
          android: undefined,
          command: SCENARIO_COMMAND,
        })
      ),
  },
  'binary-path-nonexistent': {
    guard: 'validatePlatformPaths',
    description:
      'An --android path was passed but nothing exists there. The intro precedes it: ' +
      '`standardRun` prints the intro, then validates command params.',
    introPrecedes: true,
    placeholders: ['ANDROID_BUILD_PATH'],
    trigger: () => {
      const androidPath = '/Users/sherlo-user/my-app/builds/app-release.apk';
      return maskLiteral(
        triggerThrow(() =>
          validatePlatformPaths({
            platformsToValidate: ['android'],
            android: androidPath,
            command: SCENARIO_COMMAND,
          })
        ),
        androidPath,
        EXPECTATION_PLACEHOLDERS.ANDROID_BUILD_PATH
      );
    },
  },
  'binary-abi-x86-only': {
    guard: 'validateBinariesInfo',
    description:
      'An Android build carries native libraries but none for arm64-v8a. The intro precedes ' +
      'it: `standardRun` prints the intro, then uploads and validates the builds.',
    introPrecedes: true,
    placeholders: ['ANDROID_BUILD_FILE_NAME'],
    trigger: () => {
      const fileName = 'app-release.apk';
      const binariesInfo: BinariesInfo = {
        android: {
          hash: 'stand-in-hash',
          buildType: 'preview',
          fileName,
          s3Key: '',
          sdkVersion: '2.0.0',
          androidAbis: ['x86_64'],
        },
      };
      return maskLiteral(
        triggerThrow(() => validateBinariesInfo({ binariesInfo, command: SCENARIO_COMMAND })),
        fileName,
        EXPECTATION_PLACEHOLDERS.ANDROID_BUILD_FILE_NAME
      );
    },
  },
};

export const EXPECTATION_SCENARIO_IDS = Object.keys(SCENARIOS);

/**
 * Renders the named scenario's minted expectation text (pure - no I/O, no
 * process control). Throws for an unknown scenario id; the guard's own throw is
 * caught internally and never propagates - a known scenario id always returns.
 */
export function renderExpectation(scenarioId: string): string {
  return lookUpScenario(scenarioId).trigger();
}

/**
 * THE BYTES A MINT COMMITS - the sherlo intro where the live road prints one,
 * the guard's message, the blank line that follows it live, and the "Need Help?"
 * epilogue every uncaught command error prints - the WHOLE screen a real refusal
 * puts on a user's terminal, not the guard's message alone.
 *
 * THE INTRO IS CONDITIONAL, and the scenario states the condition rather than
 * this function guessing at it: a refusal the live road reaches after
 * `stagedRun` / `standardRun` has printed the wordmark shows it
 * ({@link ExpectationScenario.introPrecedes}), and one raised while the config
 * file is still being read - `config-missing`, `project-root-invalid` - shows
 * nothing before `ERROR:`.
 *
 * Its bytes come from the ONE producer the live road uses: the `intro` segment
 * through {@link renderSegment}. There is no second copy of the wordmark, the
 * gradient or the dim-italic tagline anywhere - see {@link renderIntro} for why
 * the print calls turn into these exact bytes.
 *
 * The blank line is not added here: `throwError` already terminates every
 * guard message with its own trailing newline, and the live path's
 * `console.error(message)` appends another - the pair is what turns into a
 * blank line on screen. Reproducing that means adding exactly one more `\n`
 * before the epilogue, which is what happens below.
 *
 * The epilogue itself has ONE producer, {@link renderNeedHelpEpilogue} - the
 * same text `printNeedHelpEpilogue` prints from `start.ts`'s catch block, so
 * this can never drift from what a real run shows.
 *
 * Named and exported rather than left implicit inside {@link runEmitExpectation}
 * because the ratchet (preflightRefusals.test.ts) compares against committed
 * fixtures that CONTAIN these bytes. Without this, the ratchet would have to
 * re-derive the closer itself - a second, private copy of a formatting decision
 * this file owns, and one that would silently stop matching the day the emit
 * road changed how it terminates its output. One producer, two callers: the
 * command prints it, the ratchet compares it.
 */
export function renderEmittedStdout(scenarioId: string): string {
  const intro = lookUpScenario(scenarioId).introPrecedes ? renderIntro() : '';

  return `${intro}${renderExpectation(scenarioId)}\n${renderNeedHelpEpilogue()}`;
}

/**
 * Runs the named scenario and prints its minted expectation to stdout, or prints
 * the scenario catalogue (`list`). Exits the process: 0 on success (including
 * `list`), 1 for an unknown scenario id.
 */
export function runEmitExpectation(scenarioId: string): void {
  if (scenarioId === 'list') {
    console.log(formatScenarioCatalogue());
    process.exit(0);
  }

  let emitted: string;
  try {
    emitted = renderEmittedStdout(scenarioId);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }

  // `process.stdout.write`, not `console.log`, because every newline the live
  // screen shows - inside the intro, after the message and inside the epilogue -
  // is already part of what renderEmittedStdout returns.
  process.stdout.write(emitted);
  process.exit(0);
}

/* ========================================================================== */

/** Finds a scenario by id, or throws with the catalogue an unknown id should read. */
function lookUpScenario(scenarioId: string): ExpectationScenario {
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) {
    throw new Error(
      `Unknown --emit-expectation scenario: "${scenarioId}"\n\n${formatScenarioCatalogue()}`
    );
  }

  return scenario;
}

/**
 * The sherlo intro's bytes, from the same `intro` segment `printSherloIntro`
 * emits - the wordmark in its gradient, the dim-italic tagline, and the blank
 * line the segment's third, argument-less print call makes.
 *
 * The rendered segment is a list of print calls, one entry per `console.log`
 * the live path makes, each entry being that call's arguments verbatim. Turning
 * them into bytes is what a sink does: `util.format` is node's own console
 * formatter and `console.log` appends one `\n` per call, so `format(...args)`
 * plus a newline per entry IS what the process wrote - and `format()` with no
 * arguments is the empty string, which is how the bare `console.log()` becomes
 * a blank line.
 *
 * Done here rather than through `helpers/transcriptSink`'s buffering sink
 * because that sink is async and everything on this road is pure and
 * synchronous. The shared thing - every literal, the gradient, the styling -
 * still has exactly one home in `renderSegment`; only the byte assembly is
 * repeated, and the two agree by construction because they run the same formula
 * over the same print calls.
 */
function renderIntro(): string {
  const { prints } = renderSegment({ kind: 'intro' });

  return prints.map((args) => `${format(...args)}\n`).join('');
}

/** Calls a guard that is expected to throw and returns the thrown error's message. */
function triggerThrow(runGuard: () => void): string {
  try {
    runGuard();
  } catch (error) {
    return (error as Error).message;
  }

  throw new Error(
    'Expectation-emit scenario did not throw - the guard now accepts input it used to refuse.'
  );
}

/** Replaces every occurrence of a known literal (a value we fed in) with its placeholder. */
function maskLiteral(message: string, literal: string, placeholder: string): string {
  return message.split(literal).join(placeholder);
}

function formatScenarioCatalogue(): string {
  const scenarioLines = Object.entries(SCENARIOS).map(
    ([id, { guard, description }]) => `  ${id} (${guard})\n    ${description}`
  );

  const placeholderLines = Object.values(EXPECTATION_PLACEHOLDERS).map((token) => `  ${token}`);

  return [
    'Available --emit-expectation scenarios:',
    '',
    ...scenarioLines,
    '',
    'Placeholder vocabulary (volatile values substituted at mint time):',
    '',
    ...placeholderLines,
  ].join('\n');
}
