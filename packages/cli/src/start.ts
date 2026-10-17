import { Command, Option } from 'commander';
import { version } from '../package.json';
import {
  build,
  easBuildOnComplete,
  feedback,
  fingerprint,
  init,
  login,
  logout,
  projectCreate,
  projectList,
  teamCreate,
  teamList,
  capture,
  open,
  test,
  view,
} from './commands';
import {
  BUILD_CACHE_OPTION,
  BUILD_COMMAND,
  PARALLEL_BUILDS_OPTION,
  PLATFORM_OPTION,
  RUN_ID_OPTION,
} from './commands/test/appBuild/buildSettings';
import { CACHE_DIR_ENV_VAR } from './commands/test/appBuild/cacheFolder';
import {
  ANDROID_OPTION,
  BASELINE_OPTION,
  CONFIG_OPTION,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_PROJECT_ROOT,
  DIAGNOSTICS_OPTION,
  BUNDLE_DIR_OPTION,
  EMIT_BUNDLE_DIR_OPTION,
  EAS_BUILD_ON_COMPLETE_COMMAND,
  FINGERPRINT_COMMAND,
  GIT_BRANCH_OPTION,
  INCLUDE_OPTION,
  INIT_COMMAND,
  IOS_OPTION,
  LAYER_OPTION,
  MASK_COMMAND,
  MESSAGE_OPTION,
  POSE_COMMAND,
  PROFILE_OPTION,
  PROJECT_COMMAND,
  PROJECT_CREATE_SUBCOMMAND,
  PROJECT_LIST_SUBCOMMAND,
  PROJECT_OPTION,
  PROJECT_ROOT_OPTION,
  NAME_OPTION,
  TEAM_COMMAND,
  TEAM_CREATE_SUBCOMMAND,
  TEAM_LIST_SUBCOMMAND,
  TEAM_OPTION,
  TEST_COMMAND,
  TOKEN_OPTION,
  VERBOSE_OPTION,
  VIEW_COMMAND,
  OPEN_COMMAND,
  CAPTURE_COMMAND,
  JSON_OPTION,
  LOGS_OPTION,
  STORY_OPTION,
  PORT_OPTION,
  TIMEOUT_OPTION,
  DEFAULT_BUNDLER_PORT,
  WAIT_OPTION,
  WAIT_TIMEOUT_OPTION,
  WRITE_OPTION,
} from './constants';
import { printTheLogoInATerminal } from './commands/shared/terminal';
import { LOGIN_COMMAND } from './commands/login/constants';
import { LOGOUT_COMMAND } from './commands/logout/constants';
import { FEEDBACK_COMMAND } from './commands/feedback/constants';
import { reporting, throwError, withCommandTimeout } from './helpers';
import { hideTokens, recordLastCommand } from './helpers/lastCommandRecord';
import { emit } from './helpers/transcriptSink';
import { renderBinaryPathFlagGone, renderPlatformUnknown } from './render/appBuild';
import type { FeedbackOptions } from './commands/feedback/feedback';
import { renderFeedbackFormat } from './render/feedback';
import { renderHelpBlock } from './render/testSteps';
import { renderTokenGone } from './render/pushCredential';

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

    addLoginCommand(program);

    addLogoutCommand(program);

    addTestCommand(program);

    addBuildCommand(program);

    addViewCommand(program);

    addEasBuildOnCompleteCommand(program);

    addFeedbackCommand(program);

    addFingerprintCommand(program);

    addProjectCommand(program);

    addTeamCommand(program);

    addOpenCommand(program);

    addCaptureCommand(program);

    addPoseCommand(program);

    addMaskCommand(program);

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

      // INIT'S HELP BLOCK ENDS EVERY FAILED COMMAND, in place of the old `══════════ Need Help?` footer, so a failure reads the same everywhere.
      for (const line of renderHelpBlock()) console.log(line);

      // A Node file-system error's `code` is a string (`'ENOENT'`), which `process.exit` refuses.
      process.exit(typeof error.code === 'number' && error.code !== 0 ? error.code : 1);
    });
  }
}

export default start;

/* ========================================================================== */

const COMMAND_DESCRIPTION = {
  [INIT_COMMAND]: 'Initialize Sherlo',
  [LOGIN_COMMAND]: 'Log in to Sherlo through your browser and save the login on this computer',
  [LOGOUT_COMMAND]: 'Log out of Sherlo and delete the login saved on this computer',
  [FEEDBACK_COMMAND]: 'Send the Sherlo team a report of something broken, missing or unclear',
  [TEST_COMMAND]:
    'Run visual tests.\n' +
    '  Tests JS-only changes against the stored app build, with no build. When native code\n' +
    '  or build settings changed, builds the app first (with Gradle and Xcode, or on EAS in EAS\n' +
    '  mode).',
  [BUILD_COMMAND]:
    'Build the app into the local build cache, and push nothing.\n' +
    '  A later `npx sherlo test` takes the build from the cache instead of compiling, for as long\n' +
    "  as the app's native code and build settings are unchanged.",
  [EAS_BUILD_ON_COMPLETE_COMMAND]:
    'Hand a finished EAS build to its Sherlo test (run by EAS, from package.json, in EAS mode)',
  [VIEW_COMMAND]:
    'Look at a build without touching it: its run status, its review tally, the same\n' +
    '  status sentence the GitHub check posts, and its link. Opens nothing and uploads\n' +
    `  nothing. \`--${WAIT_OPTION}\` blocks until the build is terminal and exits under the\n` +
    `  same contract as \`test --${WAIT_OPTION}\`; without it the exit code is 0 whatever the\n` +
    '  build says.',
  [OPEN_COMMAND]:
    'Put the app you are running on one named Storybook story.\n' +
    '  Talks to your own bundler, never to Sherlo: no token, no upload, nothing leaves\n' +
    `  the machine. \`--${WAIT_OPTION}\` holds until the app reports the story on screen.\n` +
    '  Exit 0 when the story is showing, 1 when it is not.',
  [CAPTURE_COMMAND]:
    'Record one story the way a Sherlo test run does, on the app you are running.\n' +
    '  Testing mode, the same stabilization, the same view tree - printed here, uploaded\n' +
    `  nowhere. \`--${JSON_OPTION}\` prints the whole record for a program to read, which\n` +
    `  includes the app's own log lines; \`--${LOGS_OPTION}\` prints those lines on the screen too.\n` +
    '  Exit 0 when a record came back, 1 when it did not.',
  [`${PROJECT_COMMAND} ${PROJECT_CREATE_SUBCOMMAND}`]:
    'Create a project in a team and print its project token ONCE.\n' +
    `  Authorized by your login (\`npx sherlo ${LOGIN_COMMAND}\`), which is a different credential\n` +
    '  from the project token CI keeps in SHERLO_TOKEN: a login names a person, a project\n' +
    '  token names a project.\n' +
    '  The project token it prints cannot be shown again - store it when you see it.',
  [`${PROJECT_COMMAND} ${PROJECT_LIST_SUBCOMMAND}`]:
    "List a team's projects: index, name, build count and main branch.\n" +
    `  Authorized by your login (\`npx sherlo ${LOGIN_COMMAND}\`), same as\n` +
    `  \`npx sherlo ${PROJECT_COMMAND} ${PROJECT_CREATE_SUBCOMMAND}\`. Uploads nothing, creates nothing.`,
  [`${TEAM_COMMAND} ${TEAM_CREATE_SUBCOMMAND}`]:
    'Create a team and print its id.\n' +
    `  Authorized by your login (\`npx sherlo ${LOGIN_COMMAND}\`), same as\n` +
    `  \`npx sherlo ${PROJECT_COMMAND} ${PROJECT_CREATE_SUBCOMMAND}\`.`,
  [`${TEAM_COMMAND} ${TEAM_LIST_SUBCOMMAND}`]:
    'List every team you belong to: id, name and project count.\n' +
    `  Authorized by your login (\`npx sherlo ${LOGIN_COMMAND}\`).\n` +
    `  Takes no \`--${TEAM_OPTION}\`: it answers for every team you belong to.`,
  [POSE_COMMAND]:
    'Run ONE command against a declared world and print the whole screen it would put\n' +
    '  on a terminal, with the exit code the real run would have had. The world - the\n' +
    "  project folder, the settings, git, the bundler's answer and the server's - is a\n" +
    '  JSON document (contracts/pose.contract.ts); pass `-` to read it from stdin.\n' +
    '  With `--no-terminal`: print what an agent or a CI log receives instead, every\n' +
    '  byte kept. Touches no network and no project. Hidden unless SHERLO_DEVTOOLS=1.',
  [MASK_COMMAND]:
    'Read a screen on stdin and print it with every value only a machine knows folded\n' +
    '  to its placeholder - a token, a build address, a size, a duration, a commit, a\n' +
    '  fingerprint, the progress lines a wait printed. The SAME folding `npx sherlo pose`\n' +
    "  applies to a screen it printed itself, so a live run's screen and a posed one\n" +
    '  can be compared. Hidden unless SHERLO_DEVTOOLS=1.',
  [FINGERPRINT_COMMAND]:
    'Print the fingerprints `test` computes for this project, one line per layer\n' +
    '  (native, dependencies, js, base). Runs entirely locally: no token, no upload.\n' +
    `  With \`--${WRITE_OPTION} <file>\`: also writes the digests and what they were computed\n` +
    '  over (package versions, file digests) to <file>.\n' +
    `  With \`--${BASELINE_OPTION} <file>\`: diffs the current project against a file written by\n` +
    `  \`--${WRITE_OPTION}\` and prints what changed per layer. Exits 1 when any layer changed.\n` +
    `  With \`--${LAYER_OPTION} <layer>\`: prints THAT layer's digest alone, for a shell that\n` +
    '  captures one value instead of parsing a report.',
};

const OPTION_DEFINITION: Record<string, [string, string]> = {
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
    'Diagnostics to collect, comma-separated (e.g. androidWindowDump,stabilizationFrames)',
  ],
  [INCLUDE_OPTION]: [
    `--${INCLUDE_OPTION} <stories>`,
    'List of story names to include in the test (e.g. "My Story","Another Story")',
  ],
  [LAYER_OPTION]: [
    `--${LAYER_OPTION} <layer>`,
    "Print ONE layer's digest on stdout and nothing else: `native`, `dependencies`, `base`, " +
      '`js:android` or `js:ios`. THE BARE DIGEST, deliberately not the `key=value` form ' +
      `\`npx sherlo ${TEST_COMMAND}\` prints for the same numbers: that form serves a reader parsing many ` +
      'keys out of one run, this one serves a shell capturing a single value ' +
      '(`FP=$(npx sherlo fingerprint --layer base)`). A layer that cannot be computed exits ' +
      'non-zero and says why, so silence can never be read as "nothing changed". Cannot be ' +
      `combined with \`--${WRITE_OPTION}\`, \`--${BASELINE_OPTION}\` or \`--${VERBOSE_OPTION}\`, ` +
      'which write to the same stdout.',
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
  [MESSAGE_OPTION]: [`--${MESSAGE_OPTION} <message>`, 'Custom message to label the test'],
  [PROFILE_OPTION]: [
    `--${PROFILE_OPTION} <profile>`,
    'EAS Build profile the finished build was made with',
  ],
  [PROJECT_ROOT_OPTION]: [
    `--${PROJECT_ROOT_OPTION} <path>`,
    `Path to the root directory of your project (default: ${DEFAULT_PROJECT_ROOT})`,
  ],
  [TOKEN_OPTION]: [`--${TOKEN_OPTION} <token>`, 'Authentication token for the project'],
  [NAME_OPTION]: [
    `--${NAME_OPTION} <name>`,
    'The name of the project to create, as the web app will show it. Quote a name with spaces.',
  ],
  [TEAM_OPTION]: [
    `--${TEAM_OPTION} <teamId>`,
    "The team to create the project in - the `t=` value in the web app's URL. Required: " +
      'your login names a person, so there is no team to infer.',
  ],
  [PROJECT_OPTION]: [
    `--${PROJECT_OPTION} <teamId>/<projectIndex>`,
    'The project this app belongs to: the team id, a slash and the project number (e.g. k3j9x2ab/4)',
  ],
  [VERBOSE_OPTION]: [
    `--${VERBOSE_OPTION}`,
    'List every native source, package and file under its layer, with its digest',
  ],
  [STORY_OPTION]: [
    `--${STORY_OPTION} <id>`,
    'The story to put on screen, by the id Storybook gives it (e.g. foundation-typography--scales)',
  ],
  [PORT_OPTION]: [
    `--${PORT_OPTION} <port>`,
    `Where the bundler is listening (default: ${DEFAULT_BUNDLER_PORT})`,
  ],
  [JSON_OPTION]: [`--${JSON_OPTION}`, 'Print the whole record as JSON instead of a screen'],
  [LOGS_OPTION]: [
    `--${LOGS_OPTION}`,
    "Also print the app's own log lines from this capture, after the story",
  ],
  [TIMEOUT_OPTION]: [
    `--${TIMEOUT_OPTION} <seconds>`,
    `How long \`--${WAIT_OPTION}\` waits for the app to report the story (default: 30)`,
  ],
  /*
   * ONE ENTRY FOR ONE FLAG. `--wait` is the same word on `test`, `view` and `open`, so it is one
   * key here whatever each command does with it - the table is keyed by the flag a person types.
   * What each wait waits FOR belongs to that command's own description above, which is where a
   * reader of `sherlo open --help` is already looking.
   */
  [WAIT_OPTION]: [
    `--${WAIT_OPTION}`,
    'Wait for the run to finish rather than returning as soon as it has started.\n' +
      '  On `test` and `view` the exit code then encodes the outcome:\n' +
      '  0 = all stories passed, 1 = stories need review,\n' +
      '  2 = the app build or the test failed, 3 = stopped waiting, 130 = interrupted',
  ],
  [WAIT_TIMEOUT_OPTION]: [
    '--wait-timeout <minutes>',
    'Max minutes to wait for results (default: 45). Exit code 3 on timeout.',
  ],
  [PLATFORM_OPTION]: [
    '--platform <platform>',
    'Build and test one platform only (android or ios) - one job of a CI run split across ' +
      'machines. The two jobs of one CI run join into one test, which starts when both ' +
      'builds are in.',
  ],
  [RUN_ID_OPTION]: [
    '--run-id <id>',
    'The id the two jobs of a split CI run share, for a CI service Sherlo does not ' +
      'recognise. Read from the CI service itself otherwise.',
  ],
  [BUILD_CACHE_OPTION]: [
    '--build-cache <dir>',
    'Where app builds are kept between runs (default: build-cache in ' +
      `${CACHE_DIR_ENV_VAR}, else in the computer's cache folder). A build whose native code and build settings are ` +
      'unchanged is taken from here instead of compiled.',
  ],
  [PARALLEL_BUILDS_OPTION]: [
    '--parallel-builds',
    'Build Android and iOS at the same time instead of one after the other. Needs a ' +
      'machine with the memory for two compilers.',
  ],
  [WRITE_OPTION]: [
    `--${WRITE_OPTION} <file>`,
    'Write the digests and their pre-image (native sources, lockfiles, autolinked modules, ' +
      'installed packages, app source files - identifiers and digests only, never contents) ' +
      `to <file> as JSON, for a later \`--${BASELINE_OPTION}\`.`,
  ],
};

// `sherlo open` is one of the two commands that never leave the machine: no token, no project
// folder, no backend. Its whole world is the bundler's letterbox (../seams/letterbox), and
// `withTimeout: false` because a wait the caller asked for is not a hang.
function addOpenCommand(program: Command) {
  addCommand({
    program,
    command: OPEN_COMMAND,
    options: [STORY_OPTION, WAIT_OPTION, TIMEOUT_OPTION, PORT_OPTION],
    action: open,
    withTimeout: false,
  });
}

// The other command that never leaves the machine. Its world is the capture socket on the bundler
// (../seams/captureSocket); `withTimeout: false` because stabilization is a wait the story sets.
function addCaptureCommand(program: Command) {
  addCommand({
    program,
    command: CAPTURE_COMMAND,
    options: [STORY_OPTION, PORT_OPTION, JSON_OPTION, LOGS_OPTION],
    action: capture,
    withTimeout: false,
  });
}

// `sherlo login` waits for a person in the browser, until the expiry the service gave the pending
// login - a wait the service bounds, so `withTimeout: false`.
function addLoginCommand(program: Command) {
  addCommand({
    program,
    command: LOGIN_COMMAND,
    options: [],
    action: login,
    withTimeout: false,
  });
}

function addLogoutCommand(program: Command) {
  addCommand({
    program,
    command: LOGOUT_COMMAND,
    options: [],
    action: logout,
  });
}

function addFeedbackCommand(program: Command) {
  // feedback reads its report from --file only - bypass addCommand. Words after the command are taken
  // only so they reach the command and are refused in its own words, rather than silently dropped.
  program
    .command(`${FEEDBACK_COMMAND} [words...]`)
    .description([COMMAND_DESCRIPTION[FEEDBACK_COMMAND], ...renderFeedbackFormat()].join('\n  '))
    .option('--kind <kind>', 'bug, missing, unclear or other')
    .option('--file <path>', 'Read the report from this file, or from a pipe with -')
    .option('--dry-run', 'Print exactly what would be sent, and send nothing')
    .action(async (words: string[], options: FeedbackOptions) => {
      setReportingContext(FEEDBACK_COMMAND, options);
      await feedback(words, options);
    });
}

function addInitCommand(program: Command) {
  addCommand({
    program,
    command: INIT_COMMAND,
    options: [TOKEN_OPTION, PROJECT_OPTION],
    action: init,
    withTimeout: false,
  });
}

// `sherlo test` is the ONE testing command, and it makes every app build it tests: the staged road runs and builds what the gate refuses.
function addTestCommand(program: Command) {
  const devtoolsOptions = process.env.SHERLO_DEVTOOLS === '1' ? [DIAGNOSTICS_OPTION] : [];

  const testCommand = addCommand({
    program,
    command: TEST_COMMAND,
    options: [
      ...getTestCommonOptions(),
      BUNDLE_DIR_OPTION,
      EMIT_BUNDLE_DIR_OPTION,
      WAIT_OPTION,
      WAIT_TIMEOUT_OPTION,
      PLATFORM_OPTION,
      RUN_ID_OPTION,
      BUILD_CACHE_OPTION,
      PARALLEL_BUILDS_OPTION,
      ...devtoolsOptions,
    ],
    // THE INTRO COMES FIRST, as on `sherlo init`: a refused flag or a job with nothing to test is
    // still a `sherlo test` screen, opening with `Testing your app...` - under the logo in a
    // terminal, and on the first line of a log.
    action: (options) => {
      printTheLogoInATerminal();
      emit({ kind: 'command-intro', command: 'test' });
      refuseBinaryPathFlags(options);
      refuseTokenFlag(TEST_COMMAND, options);
      refuseUnknownPlatform(options);
      return test(options);
    },
  });

  // THE SHERLO 2 FLAGS STAY PARSED, OUT OF SIGHT: a CI script that still passes `--android <path>`
  // or `--token <token>` is answered with what to run instead (refuseBinaryPathFlags,
  // refuseTokenFlag), not commander's "unknown option".
  testCommand.addOption(new Option(`--${ANDROID_OPTION} <path>`).hideHelp());
  testCommand.addOption(new Option(`--${IOS_OPTION} <path>`).hideHelp());
  testCommand.addOption(new Option(`--${TOKEN_OPTION} <token>`).hideHelp());
}

/**
 * Sherlo 3 takes a push's credential from SHERLO_TOKEN or the saved login only, so a token on the command line is refused before anything runs - exit 1, naming the
 * two that remain. The same words refuse a `token` in sherlo.config.json (resolvePushCredential).
 *
 * `sherlo init --token` keeps its flag.
 */
function refuseTokenFlag(command: string, options: { [TOKEN_OPTION]?: string }) {
  if (options[TOKEN_OPTION] === undefined) return;

  throwError(renderTokenGone(command));
}

/**
 * `--platform` names one of the two platforms, or is left out for both. Any other value is refused
 * before anything runs - exit 1, naming the two - rather than read as "no platform matched".
 */
function refuseUnknownPlatform(options: { [PLATFORM_OPTION]?: string }) {
  const givenPlatform = options[PLATFORM_OPTION];
  if (givenPlatform === undefined || givenPlatform === 'android' || givenPlatform === 'ios') return;

  throwError(renderPlatformUnknown(givenPlatform));
}

/**
 * Sherlo 3 tests only app builds it made itself, so a path handed in is refused before anything
 * runs - exit 1, like every other refused argument. The `android` and `ios` keys of
 * sherlo.config.json are refused with the same words (validateConfigProperties).
 */
function refuseBinaryPathFlags(options: { [ANDROID_OPTION]?: string; [IOS_OPTION]?: string }) {
  if (options[ANDROID_OPTION] === undefined && options[IOS_OPTION] === undefined) return;

  throwError(renderBinaryPathFlagGone());
}

// `sherlo build` builds the app into the local build cache and pushes nothing, so a later
// `sherlo test` - in this job or a later one that restores the cache - compiles nothing.
// `withTimeout: false`: a release build is the slowest thing the tool does, and it ends on its own.
// Hidden from `--help`: kept for Sherlo's own end-to-end tests, not offered to customers -
// Sherlo's servers already keep each project's app builds.
function addBuildCommand(program: Command) {
  addCommand({
    program,
    command: BUILD_COMMAND,
    options: [
      CONFIG_OPTION,
      PROJECT_ROOT_OPTION,
      PLATFORM_OPTION,
      BUILD_CACHE_OPTION,
      PARALLEL_BUILDS_OPTION,
    ],
    // The intro comes first, as on `sherlo test`.
    action: (options) => {
      printTheLogoInATerminal();
      emit({ kind: 'command-intro', command: 'build' });
      refuseUnknownPlatform(options);
      return build(options);
    },
    withTimeout: false,
    hidden: true,
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
    CONFIG_OPTION,
    PROJECT_ROOT_OPTION,
    WAIT_OPTION,
    WAIT_TIMEOUT_OPTION,
  ]);

  // `--json` prints one read as a record for a program. With `--wait` it waits first and prints the
  // record once the wait ends, the way `eas build --json --wait` does (./commands/view).
  commandInstance.addOption(
    new Option(
      `--${JSON_OPTION}`,
      'Print the whole record as JSON, for scripts; with --wait, after the test finishes'
    )
  );

  // Parsed out of sight and refused, as on `sherlo test` (refuseTokenFlag).
  commandInstance.addOption(new Option(`--${TOKEN_OPTION} <token>`).hideHelp());

  commandInstance.action(async (build: string | undefined, actionOptions) => {
    setReportingContext(VIEW_COMMAND, actionOptions);

    refuseTokenFlag(VIEW_COMMAND, actionOptions);

    // `withCommandTimeout` wraps a one-argument command, and it already skips
    // its own 30-minute race whenever `--wait` is set - which is the case that
    // legitimately runs longer and owns exit code 3.
    await withCommandTimeout(() => view(build, actionOptions))(actionOptions);
  });
}

function addEasBuildOnCompleteCommand(program: Command) {
  addCommand({
    program,
    command: EAS_BUILD_ON_COMPLETE_COMMAND,
    options: [PROFILE_OPTION],
    action: easBuildOnComplete,
  });
}

// `sherlo fingerprint` reuses `--bundle-dir` with its own meaning: the directory is
// READ for its module manifests (the js layer's file list), never checked or run.
// Hidden from `--help`: it serves Sherlo's own end-to-end tests, and `sherlo test` computes the
// fingerprints itself.
function addFingerprintCommand(program: Command) {
  const commandInstance = program
    .command(FINGERPRINT_COMMAND, { hidden: true })
    .description(COMMAND_DESCRIPTION[FINGERPRINT_COMMAND]);
  addOptionsToCommand(commandInstance, [
    PROJECT_ROOT_OPTION,
    LAYER_OPTION,
    WRITE_OPTION,
    BASELINE_OPTION,
    VERBOSE_OPTION,
  ]);
  commandInstance.option(
    '--bundle-dir <path>',
    'Compute the js layer from the module manifests in a directory written by ' +
      '`npx sherlo test --emit-bundle-dir`. Without it the js layer is not computed.'
  );
  commandInstance.action(async (actionOptions) => {
    setReportingContext(FINGERPRINT_COMMAND, actionOptions);
    await fingerprint(actionOptions);
  });
}

/**
 * `sherlo project create --name <name>` / `sherlo project list --team <id>` -
 * the `project` MANAGEMENT group, registered as noun-verb pairs (see the
 * COMMANDS block in ./constants for that convention).
 *
 * Wired by hand rather than through `addCommand` because it hangs off a GROUP:
 * `project` itself has no action, so running it bare prints commander's own help
 * for the group. Every value either subcommand takes is a named flag - the
 * name included - so nothing is read off its position after the verb.
 */
function addProjectCommand(program: Command) {
  // Hidden from `--help`: a customer makes a project through `sherlo init` or the web app; this
  // group serves Sherlo's own end-to-end tests.
  const projectGroup = program
    .command(PROJECT_COMMAND, { hidden: true })
    .description('Manage Sherlo projects');

  const createInstance = projectGroup
    .command(PROJECT_CREATE_SUBCOMMAND)
    .description(COMMAND_DESCRIPTION[`${PROJECT_COMMAND} ${PROJECT_CREATE_SUBCOMMAND}`]);

  addOptionsToCommand(createInstance, [NAME_OPTION, TEAM_OPTION]);

  createInstance.action(async (actionOptions) => {
    setReportingContext(`${PROJECT_COMMAND} ${PROJECT_CREATE_SUBCOMMAND}`, actionOptions);

    await projectCreate(actionOptions);
  });

  const listInstance = projectGroup
    .command(PROJECT_LIST_SUBCOMMAND)
    .description(COMMAND_DESCRIPTION[`${PROJECT_COMMAND} ${PROJECT_LIST_SUBCOMMAND}`]);

  addOptionsToCommand(listInstance, [TEAM_OPTION]);

  listInstance.action(async (actionOptions) => {
    setReportingContext(`${PROJECT_COMMAND} ${PROJECT_LIST_SUBCOMMAND}`, actionOptions);

    await projectList(actionOptions);
  });
}

/**
 * `sherlo team create --name <name>` / `sherlo team list` - the `team`
 * MANAGEMENT group, the sibling of `addProjectCommand` above. `team list`
 * takes no `--team`: the login names a person, not a team, so it answers for
 * every team that person belongs to rather than one named team.
 */
function addTeamCommand(program: Command) {
  // Hidden from `--help`, like the project group.
  const teamGroup = program
    .command(TEAM_COMMAND, { hidden: true })
    .description('Manage Sherlo teams');

  const createInstance = teamGroup
    .command(TEAM_CREATE_SUBCOMMAND)
    .description(COMMAND_DESCRIPTION[`${TEAM_COMMAND} ${TEAM_CREATE_SUBCOMMAND}`]);

  addOptionsToCommand(createInstance, [NAME_OPTION]);

  createInstance.action(async (actionOptions) => {
    setReportingContext(`${TEAM_COMMAND} ${TEAM_CREATE_SUBCOMMAND}`, actionOptions);

    await teamCreate(actionOptions);
  });

  const listInstance = teamGroup
    .command(TEAM_LIST_SUBCOMMAND)
    .description(COMMAND_DESCRIPTION[`${TEAM_COMMAND} ${TEAM_LIST_SUBCOMMAND}`]);

  listInstance.action(async (actionOptions) => {
    setReportingContext(`${TEAM_COMMAND} ${TEAM_LIST_SUBCOMMAND}`, actionOptions);

    await teamList();
  });
}

/**
 * `sherlo pose <pose.json|->` - run one command against a declared world and print the whole
 * screen it put on a terminal (see ./commands/pose/pose).
 *
 * HIDDEN UNLESS `SHERLO_DEVTOOLS=1`, the same gate `--diagnostics` sits behind: this is a tool
 * for the people who work on the tool, and a user who runs `sherlo --help` has no use for a verb
 * that takes a JSON document describing a run they are not making.
 *
 * The command is loaded only when it runs. It reaches back into THIS module - the routing it
 * exists to exercise is `start` itself - so a static import here would be a load-time cycle.
 */
function addPoseCommand(program: Command) {
  if (process.env.SHERLO_DEVTOOLS !== '1') return;

  program
    .command(`${POSE_COMMAND} <pose>`)
    .description(COMMAND_DESCRIPTION[POSE_COMMAND])
    .option('--no-terminal', 'Print what an agent or a CI log receives, with no terminal attached')
    .action(async (documentPath: string, actionOptions: { terminal: boolean }) => {
      const { pose } = await import('./commands/pose/pose');

      await pose(documentPath, { terminal: actionOptions.terminal });
    });
}

/**
 * `sherlo mask` - fold a screen this tool did not print itself (see ./commands/pose/maskScreen).
 *
 * HIDDEN BEHIND THE SAME GATE AS `sherlo pose`, and for the same reason: it is a tool for the
 * people who work on the tool. The test repository pipes a real run's screen through it and
 * compares the result against a posed screen, which only works while both go through one masker.
 *
 * The two flags are the two paths a run knew that nobody else can: a live run has its own project
 * folder and its own resolved config file, and neither can be guessed from the screen.
 */
function addMaskCommand(program: Command) {
  if (process.env.SHERLO_DEVTOOLS !== '1') return;

  program
    .command(MASK_COMMAND)
    .description(COMMAND_DESCRIPTION[MASK_COMMAND])
    .option('--project-root <dir>', 'The project folder the run read')
    .option('--config-path <file>', 'The config file path the run resolved')
    .action(async (actionOptions: { projectRoot?: string; configPath?: string }) => {
      const { mask } = await import('./commands/pose/maskScreen');

      mask(actionOptions);
    });
}

function addCommand({
  program,
  command,
  options,
  action: handler,
  withTimeout = true,
  hidden = false,
}: {
  program: Command;
  command: keyof typeof COMMAND_DESCRIPTION;
  options: (keyof typeof OPTION_DEFINITION)[];
  action: (options: any) => Promise<any>;
  withTimeout?: boolean;
  /** Runs, but is not listed in `--help`. */
  hidden?: boolean;
}) {
  const action = async (actionOptions: any) => {
    setReportingContext(command, actionOptions);

    if (withTimeout) {
      await withCommandTimeout(handler)(actionOptions);
    } else {
      await handler(actionOptions);
    }
  };

  const commandInstance = program
    .command(command, { hidden })
    .description(COMMAND_DESCRIPTION[command]);
  addOptionsToCommand(commandInstance, options);
  commandInstance.action(action);
  return commandInstance;
}

/**
 * Names the command and its flags (tokens hidden) to the error reporter, and starts the record of
 * how the command ends, which `sherlo feedback` attaches. `feedback` itself leaves no record, so
 * it never replaces the one it reports. `pose` and `mask` never come here.
 */
function setReportingContext(command: string, options: any) {
  reporting.setContext('Command', { command, commandOptions: hideTokens(options) });

  if (command !== FEEDBACK_COMMAND) recordLastCommand(command, options);
}

/**
 * Options that work but are not listed in `--help`: the local build cache is kept quietly, for
 * Sherlo's own end-to-end tests and the rebuild a failed run would otherwise cost.
 */
const OPTIONS_HIDDEN_FROM_HELP = new Set<keyof typeof OPTION_DEFINITION>([BUILD_CACHE_OPTION]);

function addOptionsToCommand(command: Command, optionKeys: (keyof typeof OPTION_DEFINITION)[]) {
  optionKeys.forEach((optionKey) => {
    if (!OPTIONS_HIDDEN_FROM_HELP.has(optionKey)) {
      command.option(...OPTION_DEFINITION[optionKey]);
      return;
    }
    const [flags, description] = OPTION_DEFINITION[optionKey];
    command.addOption(new Option(flags, description).hideHelp());
  });
}

function getTestCommonOptions() {
  return [MESSAGE_OPTION, GIT_BRANCH_OPTION, INCLUDE_OPTION, CONFIG_OPTION, PROJECT_ROOT_OPTION];
}
