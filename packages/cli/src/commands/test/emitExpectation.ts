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
 */
import { TEST_STANDARD_COMMAND } from '../../constants';
import { BinariesInfo, InvalidatedConfig } from '../../types';
import parseConfigFile from '../../helpers/getValidatedCommandParams/getNormalizedConfig/parseConfigFile';
import validateDevices from '../../helpers/getValidatedCommandParams/validateCommandParams/validateDevices';
import validateToken from '../../helpers/getValidatedCommandParams/validateCommandParams/validateToken';
import validateBinariesInfo from '../../helpers/getValidatedBinariesInfoAndNextBuildIndex/validateBinariesInfo';
import { validatePlatformPaths } from '../../helpers/shared';

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
const SCENARIO_COMMAND = TEST_STANDARD_COMMAND;

type ExpectationScenario = {
  guard: string;
  description: string;
  /** Placeholder names (keys of {@link EXPECTATION_PLACEHOLDERS}) this scenario's rendered text may contain. */
  placeholders: (keyof typeof EXPECTATION_PLACEHOLDERS)[];
  /** Triggers the real guard against a synthetic input and returns its raw thrown message. */
  trigger: () => string;
};

const SCENARIOS: Record<string, ExpectationScenario> = {
  'token-missing': {
    guard: 'validateToken',
    description: 'The `token` option/config property is omitted entirely.',
    placeholders: [],
    trigger: () => triggerThrow(() => validateToken({} as InvalidatedConfig)),
  },
  'token-malformed': {
    guard: 'validateToken',
    description: 'A `token` is present but is not a valid Sherlo token.',
    placeholders: [],
    trigger: () =>
      triggerThrow(() => validateToken({ token: 'not-a-real-sherlo-token' } as InvalidatedConfig)),
  },
  'devices-empty': {
    guard: 'validateDevices',
    description: 'Config `devices` is an empty array.',
    placeholders: [],
    trigger: () => triggerThrow(() => validateDevices({ devices: [] } as InvalidatedConfig)),
  },
  'config-missing': {
    guard: 'parseConfigFile',
    description: 'No config file exists at the resolved (default project root) path.',
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
      '"no config file found at the resolved path", not a second one for a wrong project root.',
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
    description: 'Neither --android nor the config `android` property was passed.',
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
    description: 'An --android path was passed but nothing exists there.',
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
    description: 'An Android build carries native libraries but none for arm64-v8a.',
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
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) {
    throw new Error(
      `Unknown --emit-expectation scenario: "${scenarioId}"\n\n${formatScenarioCatalogue()}`
    );
  }

  return scenario.trigger();
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

  let rendered: string;
  try {
    rendered = renderExpectation(scenarioId);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }

  console.log(rendered);
  process.exit(0);
}

/* ========================================================================== */

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
