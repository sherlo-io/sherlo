import chalk from 'chalk';
import { Command } from 'commander';
import { version } from '../package.json';
import {
  easBuildOnComplete,
  fingerprint,
  init,
  showError,
  test,
  testEasCloudBuild,
  view,
} from './commands';
import {
  ANDROID_FILE_TYPES,
  ANDROID_OPTION,
  BASELINE_OPTION,
  CONFIG_OPTION,
  CONTACT_EMAIL,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_PROJECT_ROOT,
  DIAGNOSTICS_OPTION,
  DISCORD_URL,
  BUNDLE_DIR_OPTION,
  DRY_RUN_OPTION,
  EMIT_BUNDLE_DIR_OPTION,
  EAS_BUILD_ON_COMPLETE_COMMAND,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  EMIT_EXPECTATION_OPTION,
  FINGERPRINT_COMMAND,
  RENDER_TRANSCRIPT_OPTION,
  GIT_BRANCH_OPTION,
  INCLUDE_OPTION,
  INIT_COMMAND,
  IOS_FILE_TYPES,
  IOS_OPTION,
  MESSAGE_OPTION,
  METADATA_OPTION,
  PLATFORM_LABEL,
  PROFILE_OPTION,
  PROJECT_ROOT_OPTION,
  SHOW_ERROR_COMMAND,
  TEST_COMMAND,
  TEST_EAS_CLOUD_BUILD_COMMAND,
  TOKEN_OPTION,
  VERBOSE_OPTION,
  VIEW_COMMAND,
  WAIT_FOR_EAS_BUILD_OPTION,
  WAIT_OPTION,
  WAIT_TIMEOUT_OPTION,
  WRITE_OPTION,
} from './constants';
import { logWarning, reporting, withCommandTimeout } from './helpers';

// Disable all Node.js warnings
process.removeAllListeners('warning');

async function start() {
  try {
    reporting.init();

    const program = new Command();

    program
      .name('sherlo')
      .version(version, '--version', 'Output the version number')
      .description('Sherlo CLI: Visual testing for React Native');

    addInitCommand(program);

    addTestCommand(program);

    addViewCommand(program);

    addTestEasCloudBuildCommand(program);

    addShowErrorCommand(program);

    addFingerprintCommand(program);

    if (process.argv.length === 2) {
      console.log('Choose a Sherlo command. Use --help for more information.');
      process.exit(0);
    }

    await program.parseAsync(process.argv);

    await reporting.flush();
  } catch (error) {
    if (!error.skipReporting) {
      reporting.captureException(error);
    }

    await reporting.flush().finally(() => {
      console.error((error as Error).message);

      console.log(chalk.dim('═'.repeat(10) + '\n'));
      console.log(chalk.dim('Need Help?'));
      console.log(chalk.dim('➜ ') + chalk.dim(DISCORD_URL));
      console.log(chalk.dim('➜ ') + chalk.dim(CONTACT_EMAIL));

      process.exit(error.code || 1);
    });
  }
}

export default start;

/* ========================================================================== */

const COMMAND_DESCRIPTION = {
  [INIT_COMMAND]: 'Initialize Sherlo',
  [TEST_COMMAND]:
    'Run visual tests.\n' +
    `  Without \`--${ANDROID_OPTION}\`/\`--${IOS_OPTION}\`: tests JS-only changes against the registered\n` +
    '  native base. Prints `native-needed=true` and builds nothing when this commit needs\n' +
    '  a native rebuild first, `native-needed=false` when it ran the test to completion.\n' +
    `  With \`--${ANDROID_OPTION} <path>\` (and optionally \`--${IOS_OPTION} <path>\`): runs a full test on\n` +
    '  those builds and registers them as the new base.',
  [TEST_EAS_CLOUD_BUILD_COMMAND]: 'Test cloud builds created on Expo servers',
  [EAS_BUILD_ON_COMPLETE_COMMAND]: `Process EAS Build (required for \`${TEST_EAS_CLOUD_BUILD_COMMAND}\`)`,
  [SHOW_ERROR_COMMAND]:
    'Decode a minified JS error stack trace using the slug printed on the Sherlo build error page',
  [VIEW_COMMAND]:
    'Look at a build without touching it: its run status, its review tally, the same\n' +
    '  status sentence the GitHub check posts, and its link. Opens nothing and uploads\n' +
    `  nothing. \`--${WAIT_OPTION}\` blocks until the build is terminal and exits under the\n` +
    `  same contract as \`test --${WAIT_OPTION}\`; without it the exit code is 0 whatever the\n` +
    '  build says.',
  [FINGERPRINT_COMMAND]:
    'Print the fingerprints `test` computes for this project, one line per layer\n' +
    '  (native, dependencies, js, base). Runs entirely locally: no token, no upload.\n' +
    `  With \`--${WRITE_OPTION} <file>\`: also writes the digests and what they were computed\n` +
    '  over (package versions, file digests) to <file>.\n' +
    `  With \`--${BASELINE_OPTION} <file>\`: diffs the current project against a file written by\n` +
    `  \`--${WRITE_OPTION}\` and prints what changed per layer. Exits 1 when any layer changed.`,
};

const OPTION_DEFINITION: Record<string, [string, string]> = {
  [ANDROID_OPTION]: [
    `--${ANDROID_OPTION} <path>`,
    `Path to ${PLATFORM_LABEL.android} build (${ANDROID_FILE_TYPES.join(', ')})`,
  ],
  [GIT_BRANCH_OPTION]: [
    '--git-branch <branch>',
    'Override the git branch name captured for this build (takes precedence over SHERLO_BRANCH and all CI-provider env vars)',
  ],
  [CONFIG_OPTION]: [
    `--${CONFIG_OPTION} <path>`,
    `Path to the config file (default: ${DEFAULT_CONFIG_FILENAME})`,
  ],
  [DIAGNOSTICS_OPTION]: [
    `--${DIAGNOSTICS_OPTION} <names>`,
    'Diagnostics to collect, comma-separated (e.g. androidWindowDump,stabilizationFrames,sherloAtRoot)',
  ],
  [EAS_BUILD_SCRIPT_NAME_OPTION]: [
    `--${EAS_BUILD_SCRIPT_NAME_OPTION} <name>`,
    'Name of the package.json script that triggers EAS Build',
  ],
  [INCLUDE_OPTION]: [
    `--${INCLUDE_OPTION} <stories>`,
    'List of story names to include in the test (e.g. "My Story","Another Story")',
  ],
  [IOS_OPTION]: [
    `--${IOS_OPTION} <path>`,
    `Path to ${PLATFORM_LABEL.ios} build (${IOS_FILE_TYPES.join(', ')})`,
  ],
  [BASELINE_OPTION]: [
    `--${BASELINE_OPTION} <file>`,
    `Diff the current fingerprints against a file written by \`--${WRITE_OPTION}\`. ` +
      'Prints, per layer, unchanged or changed followed by the changed packages and files. ' +
      'Exits 1 when any layer changed, 0 otherwise.',
  ],
  [BUNDLE_DIR_OPTION]: [
    '--bundle-dir <path>',
    'Use a prebuilt bundle from <path> instead of running the bundler. The directory ' +
      'must hold, for each tested platform, the bundle, its assets, its module manifest ' +
      'and the sidecar recording what it was built from - produce one with ' +
      '`--emit-bundle-dir`. Every field of that sidecar is checked against this project ' +
      'first, and a mismatch is refused rather than bundled around. The checks read the ' +
      'checkout and the lockfile only: the accepting machine needs no `node_modules`.',
  ],
  [EMIT_BUNDLE_DIR_OPTION]: [
    '--emit-bundle-dir <path>',
    'Bundle as usual, write the result to <path> in the layout `--bundle-dir` accepts, ' +
      'then exit. Uploads nothing, creates no build, makes no network call. Use it to ' +
      'build the bundle once (in CI, in a monorepo pipeline) and hand it to every run ' +
      'that follows.',
  ],
  [DRY_RUN_OPTION]: [
    '--dry-run',
    'Preview which stories a real run would capture (Diff Scope), then exit. ' +
      'Bundles and produces the manifest locally, asks the server for a read-only ' +
      'decision, and prints the per-platform "would capture" lists with reasons. ' +
      'Creates no build and uploads nothing.',
  ],
  [EMIT_EXPECTATION_OPTION]: [
    '--emit-expectation <scenario>',
    'Expectation-emit mode (requires --dry-run): renders the exact refusal text a real ' +
      'run would print for <scenario> - the same guard, the same formatter - with every ' +
      'volatile value (an absolute path, a build file name) replaced by a stable ' +
      'placeholder (e.g. <SHERLO_CONFIG_PATH>). Pass "list" to print every scenario and ' +
      'the full placeholder vocabulary. Makes no build, no upload, no network call.',
  ],
  [RENDER_TRANSCRIPT_OPTION]: [
    '--render-transcript <scenario>',
    "Transcript-render mode (requires --dry-run): renders the named scenario's scripted " +
      "wire state through the CLI's OWN dry-run code path and writes the transcript it " +
      'printed to stdout, with a JSON envelope (exit code, command, ambient, stderr) on ' +
      'stderr. Pass "list" to print every scenario. Makes no build, no bundle, no network ' +
      'call. Mint captures from a world; render computes from a scenario.',
  ],
  [MESSAGE_OPTION]: [`--${MESSAGE_OPTION} <message>`, 'Custom message to label the test'],
  [METADATA_OPTION]: [
    `--${METADATA_OPTION}`,
    'Print a `\u2500\u2500 details \u2500\u2500` block after the normal output - ONE LINE PER FACT THE API\n' +
      '  PROVIDES, and nothing for one it does not: what the build was judged over, what the\n' +
      '  runner did, the capture accounting, and how many verdicts a human has cast. On\n' +
      `  \`${TEST_COMMAND}\` it also names the branch and commit the run was made from, which that run\n` +
      '  composed itself. Plain aligned text, no colour.',
  ],
  [PROFILE_OPTION]: [
    `--${PROFILE_OPTION} <profile>`,
    `EAS Build profile (must match profile used in \`${TEST_EAS_CLOUD_BUILD_COMMAND}\`)`,
  ],
  [PROJECT_ROOT_OPTION]: [
    `--${PROJECT_ROOT_OPTION} <path>`,
    `Path to the root directory of your project (default: ${DEFAULT_PROJECT_ROOT})`,
  ],
  [TOKEN_OPTION]: [`--${TOKEN_OPTION} <token>`, 'Authentication token for the project'],
  [VERBOSE_OPTION]: [
    `--${VERBOSE_OPTION}`,
    'List every native source, package and file under its layer, with its digest',
  ],
  [WAIT_FOR_EAS_BUILD_OPTION]: [
    `--${WAIT_FOR_EAS_BUILD_OPTION}`,
    'Start waiting for EAS Build to be triggered manually',
  ],
  [WAIT_OPTION]: [
    `--${WAIT_OPTION}`,
    'Wait for test results and exit with a code encoding the outcome:\n' +
      '  0 = GREEN (no changes), 1 = changes require review,\n' +
      '  2 = build/system error, 3 = timeout (block, never pass), 130 = interrupted (Ctrl-C)',
  ],
  [WAIT_TIMEOUT_OPTION]: [
    '--wait-timeout <minutes>',
    'Max minutes to wait for results (default: 45). Exit code 3 on timeout.',
  ],
  [WRITE_OPTION]: [
    `--${WRITE_OPTION} <file>`,
    'Write the digests and their pre-image (native sources, lockfiles, autolinked modules, ' +
      'installed packages, app source files - identifiers and digests only, never contents) ' +
      `to <file> as JSON, for a later \`--${BASELINE_OPTION}\`.`,
  ],
};

function addInitCommand(program: Command) {
  addCommand({
    program,
    command: INIT_COMMAND,
    options: [TOKEN_OPTION],
    action: init,
    withTimeout: false,
  });
}

// `sherlo test` is the ONE testing command: it carries the union of both roads'
// options. The platform paths pick the standard road; without them the staged
// road runs and --dry-run / --emit-expectation preview its bundling decision.
function addTestCommand(program: Command) {
  const devtoolsOptions = process.env.SHERLO_DEVTOOLS === '1' ? [DIAGNOSTICS_OPTION] : [];

  addCommand({
    program,
    command: TEST_COMMAND,
    options: [
      ...getTestCommonOptions('withPlatformPaths'),
      BUNDLE_DIR_OPTION,
      EMIT_BUNDLE_DIR_OPTION,
      DRY_RUN_OPTION,
      EMIT_EXPECTATION_OPTION,
      RENDER_TRANSCRIPT_OPTION,
      WAIT_OPTION,
      WAIT_TIMEOUT_OPTION,
      METADATA_OPTION,
      ...devtoolsOptions,
    ],
    action: test,
  });
}

/**
 * `sherlo view [build]` takes its build as a POSITIONAL argument, so it is
 * registered by hand rather than through `addCommand` - which only knows how to
 * wire options. The argument is OPTIONAL at the parser so the command can refuse
 * in its own words, with the reason there is no default yet (see
 * ./commands/view); commander's bare "missing required argument" would say less.
 */
function addViewCommand(program: Command) {
  const commandInstance = program
    .command(`${VIEW_COMMAND} [build]`)
    .description(COMMAND_DESCRIPTION[VIEW_COMMAND]);

  addOptionsToCommand(commandInstance, [
    TOKEN_OPTION,
    CONFIG_OPTION,
    PROJECT_ROOT_OPTION,
    WAIT_OPTION,
    WAIT_TIMEOUT_OPTION,
    METADATA_OPTION,
  ]);

  commandInstance.action(async (build: string | undefined, actionOptions) => {
    setReportingContext(VIEW_COMMAND, actionOptions);

    // `withCommandTimeout` wraps a one-argument command, and it already skips
    // its own 30-minute race whenever `--wait` is set - which is the case that
    // legitimately runs longer and owns exit code 3.
    await withCommandTimeout(() => view(build, actionOptions))(actionOptions);
  });
}

function addTestEasCloudBuildCommand(program: Command) {
  const devtoolsOptions = process.env.SHERLO_DEVTOOLS === '1' ? [DIAGNOSTICS_OPTION] : [];

  addCommand({
    program,
    command: TEST_EAS_CLOUD_BUILD_COMMAND,
    oldCommand: 'expo-cloud-builds',
    options: [
      EAS_BUILD_SCRIPT_NAME_OPTION,
      WAIT_FOR_EAS_BUILD_OPTION,
      ...getTestCommonOptions('withoutPlatformPaths'),
      ...devtoolsOptions,
    ],
    action: testEasCloudBuild,
  });

  addCommand({
    program,
    command: EAS_BUILD_ON_COMPLETE_COMMAND,
    options: [PROFILE_OPTION],
    action: easBuildOnComplete,
  });
}

function addShowErrorCommand(program: Command) {
  // show-error takes a single positional <slug> arg, no options - bypass addCommand
  program
    .command(`${SHOW_ERROR_COMMAND} <slug>`)
    .description(
      `${COMMAND_DESCRIPTION[SHOW_ERROR_COMMAND]}\n` +
        '  Slug format: <teamId>-<projectIndex>-(ios|android)-<timestamp>\n' +
        '  Example:     PsS5H1B1-30-android-1777491220857'
    )
    .action(async (slug: string) => {
      setReportingContext(SHOW_ERROR_COMMAND, { slug });
      await showError(slug);
    });
}

// `sherlo fingerprint` reuses `--bundle-dir` with its own meaning: the directory is
// READ for its module manifests (the js layer's file list), never checked or run.
function addFingerprintCommand(program: Command) {
  const commandInstance = program
    .command(FINGERPRINT_COMMAND)
    .description(COMMAND_DESCRIPTION[FINGERPRINT_COMMAND]);
  addOptionsToCommand(commandInstance, [
    PROJECT_ROOT_OPTION,
    WRITE_OPTION,
    BASELINE_OPTION,
    VERBOSE_OPTION,
  ]);
  commandInstance.option(
    '--bundle-dir <path>',
    'Compute the js layer from the module manifests in a directory written by ' +
      '`sherlo test --emit-bundle-dir`. Without it the js layer is not computed.'
  );
  commandInstance.action(async (actionOptions) => {
    setReportingContext(FINGERPRINT_COMMAND, actionOptions);
    await fingerprint(actionOptions);
  });
}

function addCommand({
  program,
  command,
  oldCommand,
  options,
  action: handler,
  withTimeout = true,
}: {
  program: Command;
  command: keyof typeof COMMAND_DESCRIPTION;
  oldCommand?: string;
  options: (keyof typeof OPTION_DEFINITION)[];
  action: (options: any) => Promise<any>;
  withTimeout?: boolean;
}) {
  const action = async (actionOptions: any, commandInstance: Command) => {
    if (oldCommand && commandInstance.name() === oldCommand) {
      showDeprecationWarning({ oldCommand, newCommand: command });
    }

    setReportingContext(command, actionOptions);

    if (withTimeout) {
      await withCommandTimeout(handler)(actionOptions);
    } else {
      await handler(actionOptions);
    }
  };

  if (oldCommand) {
    const deprecatedCommand = program.command(oldCommand, { hidden: true });
    addOptionsToCommand(deprecatedCommand, options);
    deprecatedCommand.action(action);
  }

  const commandInstance = program.command(command).description(COMMAND_DESCRIPTION[command]);
  addOptionsToCommand(commandInstance, options);
  commandInstance.action(action);
}

function showDeprecationWarning({
  oldCommand,
  newCommand,
}: {
  oldCommand: string;
  newCommand: string;
}) {
  console.log();
  logWarning({
    message: `"${oldCommand}" command is deprecated and will be removed in a future version`,
  });
  console.warn(chalk.yellow(`  Please use "${newCommand}" instead`));
  console.log();

  process.env.SKIP_INTRO = 'true';
}

function setReportingContext(command: string, options: any) {
  const optionsWithHiddenToken = options[TOKEN_OPTION]
    ? { ...options, [TOKEN_OPTION]: '[hidden]' }
    : options;

  reporting.setContext('Command', { command, commandOptions: optionsWithHiddenToken });
}

function addOptionsToCommand(command: Command, optionKeys: (keyof typeof OPTION_DEFINITION)[]) {
  optionKeys.forEach((optionKey) => {
    command.option(...OPTION_DEFINITION[optionKey]);
  });
}

function getTestCommonOptions(variant: 'withPlatformPaths' | 'withoutPlatformPaths') {
  return [
    ...(variant === 'withPlatformPaths' ? [ANDROID_OPTION] : []),
    ...(variant === 'withPlatformPaths' ? [IOS_OPTION] : []),
    TOKEN_OPTION,
    MESSAGE_OPTION,
    GIT_BRANCH_OPTION,
    INCLUDE_OPTION,
    CONFIG_OPTION,
    PROJECT_ROOT_OPTION,
  ];
}
