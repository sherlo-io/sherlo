import { Platform } from '@sherlo/api-types';

export const APP_DOMAIN = 'https://app.sherlo.io';
const DOCS_BASE_URL = 'https://sherlo.io/docs';

export const CONTACT_EMAIL = 'contact@sherlo.io';
export const DISCORD_URL = 'https://discord.gg/G7eqTBkWZt';

export const DOCS_LINK = {
  setupMetroConfig: `${DOCS_BASE_URL}/setup#metro-config`,
  setupStorybookAccess: `${DOCS_BASE_URL}/setup#storybook-access`,

  config: `${DOCS_BASE_URL}/config`,
  configProperties: `${DOCS_BASE_URL}/config#properties`,
  configToken: `${DOCS_BASE_URL}/config#token`,
  configDevices: `${DOCS_BASE_URL}/config#devices`,

  buildPreview: `${DOCS_BASE_URL}/builds?type=preview-simulator#build-types`,
  buildAndroidAbiRequirements: `${DOCS_BASE_URL}/builds#android-abi-requirements`,

  integrationsGithub: `${DOCS_BASE_URL}/integrations/github`,

  testing: `${DOCS_BASE_URL}/testing`,
  testEasCloudBuild: `${DOCS_BASE_URL}/testing?method=eas-cloud-build#testing-methods`,

  devices: `${DOCS_BASE_URL}/devices`,
};

export const PLATFORMS: readonly Platform[] = ['android', 'ios'];

export const PLATFORM_LABEL: { [platform in Platform]: string } = {
  android: 'Android',
  ios: 'iOS',
};

export const IOS_FILE_TYPES = ['.app', '.tar.gz', '.tar'] as const;

// Mirrors sherlo-runner src/executor/android/constants.ts
export const ANDROID_ARM64_ABI = 'arm64-v8a';

export const DEFAULT_CONFIG_FILENAME = 'sherlo.config.json';
export const DEFAULT_PROJECT_ROOT = '.';

export const SHERLO_TEMP_DIRECTORY = '.sherlo';
export const SHERLO_TEMP_DATA_FILENAME = 'data.json';

/* PACKAGES */

export const EXPO_PACKAGE_NAME = 'expo';
export const REACT_NATIVE_PACKAGE_NAME = 'react-native';
export const SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME = '@sherlo/react-native-storybook';
export const STORYBOOK_REACT_NATIVE_PACKAGE_NAME = '@storybook/react-native';

export const MIN_REACT_NATIVE_VERSION = '0.81.0';
export const MIN_STORYBOOK_REACT_NATIVE_VERSION = '8.0.0';

/* COMMANDS */

/*
 * HOW A SHERLO COMMAND IS NAMED, decided 2026-09-06 and applied from
 * `project create` onwards. Read this before adding the next one, because
 * otherwise the next one is named by whoever types first.
 *
 *   A PRIMARY FLOW IS A VERB.       `sherlo test`, `sherlo view`, `sherlo init`
 *   A MANAGEMENT OPERATION IS       `sherlo project create`, `sherlo project list`,
 *   NOUN-VERB.                      `sherlo team create`, `sherlo team list`
 *                                    (and later `sherlo project delete`, ...)
 *
 * The split is about what a reader is doing, not about how much the command
 * does. A primary flow is the daily loop - you run tests, you look at a build -
 * and it reads as an instruction. A management operation acts ON a Sherlo
 * RESOURCE, and there will eventually be several verbs per resource, so the
 * resource has to come first or the command list sorts into nonsense
 * (`create-project` and `delete-project` land pages apart from each other).
 *
 * Consequence worth stating: `sherlo test` will never become `sherlo build
 * run`. The existing verbs are the product's front door and renaming them
 * costs every customer's CI a change for no gain.
 */

export const INIT_COMMAND = 'init';
export const TEST_COMMAND = 'test';
export const TEST_EAS_CLOUD_BUILD_COMMAND = 'test:eas-cloud-build';
export const EAS_BUILD_ON_COMPLETE_COMMAND = 'eas-build-on-complete';
/**
 * The package.json script Expo runs when an EAS build is cancelled. It runs
 * `sherlo eas-build-on-complete` too, which tells the two apart by the script it was run as.
 */
export const EAS_BUILD_ON_CANCEL_SCRIPT = 'eas-build-on-cancel';
export const FINGERPRINT_COMMAND = 'fingerprint';
export const VIEW_COMMAND = 'view';
/** The `project` resource group. It does nothing on its own - see the subcommands below. */
export const PROJECT_COMMAND = 'project';
/** `sherlo project create --name <name>` - the first management operation (see the note above). */
export const PROJECT_CREATE_SUBCOMMAND = 'create';
/** `sherlo project list --team <teamId>` - one row per project of a team. */
export const PROJECT_LIST_SUBCOMMAND = 'list';
/** The `team` resource group. It does nothing on its own - see the subcommands below. */
export const TEAM_COMMAND = 'team';
/** `sherlo team create --name <name>`. */
export const TEAM_CREATE_SUBCOMMAND = 'create';
/** `sherlo team list` - one row per team the caller belongs to. */
export const TEAM_LIST_SUBCOMMAND = 'list';
/**
 * `sherlo pose <pose.json|->` - run one command against a declared world and print its screen.
 * Hidden unless SHERLO_DEVTOOLS=1: a tool for the people who work on the tool.
 */
export const POSE_COMMAND = 'pose';
/**
 * `sherlo mask` - read a screen on stdin, print it with every volatile class folded to its
 * placeholder, exit 0. The same folding `sherlo pose` applies to a screen it printed itself, on a
 * screen a live run printed. Hidden behind the same gate, for the same reason.
 */
export const MASK_COMMAND = 'mask';
/** `sherlo open --story <id>` - put the running app on one named story. A primary flow, so a verb. */
export const OPEN_COMMAND = 'open';
/** `sherlo capture --story <id>` - record one story the way a test run does, on the running app. */
export const CAPTURE_COMMAND = 'capture';
/** `sherlo coverage` - list the components no story draws. Hidden from `--help`. */
export const COVERAGE_COMMAND = 'coverage';
export const FULL_INIT_COMMAND = 'npx sherlo init';

/** The port a React Native bundler serves on unless somebody moved it. */
export const DEFAULT_BUNDLER_PORT = 8081;

/* OPTIONS */

export const ANDROID_OPTION = 'android';
/** `sherlo fingerprint`: the file to diff the current fingerprints against. */
export const BASELINE_OPTION = 'baseline';
/** Accept a prebuilt bundle directory instead of bundling (see commands/test/suppliedBundle). */
export const BUNDLE_DIR_OPTION = 'bundleDir';
/** Produce a bundle directory `--bundle-dir` will accept (see commands/test/emitBundleDir). */
export const EMIT_BUNDLE_DIR_OPTION = 'emitBundleDir';
export const GIT_BRANCH_OPTION = 'gitBranch';
export const CONFIG_OPTION = 'config';
export const DIAGNOSTICS_OPTION = 'diagnostics';
export const EAS_BUILD_SCRIPT_NAME_OPTION = 'easBuildScriptName';
export const IOS_OPTION = 'ios';
/**
 * `sherlo fingerprint`: print ONE layer's digest on stdout and nothing else, for
 * a shell that captures a single value (see commands/fingerprint/fingerprint).
 */
export const LAYER_OPTION = 'layer';
export const MESSAGE_OPTION = 'message';
export const PROFILE_OPTION = 'profile';
export const PROJECT_ROOT_OPTION = 'projectRoot';
export const TOKEN_OPTION = 'token';
/** `sherlo project create`: which team the new project belongs to. */
export const TEAM_OPTION = 'team';
/**
 * `sherlo init --project <teamId>/<projectIndex>`: the project the app belongs to, the same line
 * setup writes into the config's `project`.
 */
export const PROJECT_OPTION = 'project';
/**
 * `sherlo project create`: the name of the thing being created. A NAMED FLAG RATHER THAN A
 * POSITIONAL, so a name is never whatever happened to follow the verb (decided 2026-09-07):
 * `sherlo project create --name "Design System"`, and the same flag on every create that follows.
 */
export const NAME_OPTION = 'name';
/** `sherlo fingerprint`: print every source, package and file under its layer. */
export const VERBOSE_OPTION = 'verbose';
/** `sherlo fingerprint`: the file to write the fingerprint document to. */
export const WRITE_OPTION = 'write';
export const INCLUDE_OPTION = 'include';
export const WAIT_FOR_EAS_BUILD_OPTION = 'waitForEasBuild';
export const WAIT_OPTION = 'wait';
/** `sherlo open --story <id>` - which story to put on screen. */
export const STORY_OPTION = 'story';
/**
 * `sherlo open --scene <id>`, `sherlo capture --scene <id>` - one variant of one screen, by the id
 * Storybook's id style gives it (`chat--conversation`). Booted fresh each time, with no Storybook.
 */
export const SCENE_OPTION = 'scene';
/** Where the bundler is, for the rare project that moved it off {@link DEFAULT_BUNDLER_PORT}. */
export const PORT_OPTION = 'port';
/**
 * How long `sherlo open --wait` waits, in SECONDS - deliberately not `--wait-timeout`, which is
 * the one `test` and `view` take and is counted in minutes. Two flags that sound alike and count
 * differently is one flag too many.
 */
export const TIMEOUT_OPTION = 'timeout';
export const WAIT_TIMEOUT_OPTION = 'waitTimeout';
/** `sherlo capture --json`, `sherlo view --json` - print the whole record as JSON instead of a screen. */
export const JSON_OPTION = 'json';
/**
 * `sherlo capture --logs` - print the app's own log lines after the story. The record already
 * carries them (see `--json`); this is the one flag that puts them on the screen too.
 */
export const LOGS_OPTION = 'logs';
/** `sherlo coverage --props` - also list the prop values no story file sets. */
export const PROPS_OPTION = 'props';

/* TOKENS */

/**
 * How a BUILD TICKET starts: the credential `openBuild` answers when it opens a run that waits for
 * EAS builds, good only for filling that one run's slots and closing it, for about a day.
 * `sherlo test` writes it into `.sherlo/data.json` in place of any token, and the EAS hook spends
 * it whole. Must match the prefix the service issues it with.
 */
export const BUILD_TICKET_PREFIX = 'sbt_';

/**
 * How a GITHUB SESSION starts: the three-hour credential the service trades for a GitHub Actions
 * job's ID token. Opaque like a personal token, and sent whole. Must match the prefix the service
 * issues it with.
 */
export const GITHUB_SESSION_PREFIX = 'sgh_';

/** The audience a GitHub ID token is requested for: the one the service checks it against. */
export const GITHUB_ID_TOKEN_AUDIENCE = 'https://api.sherlo.io';

/** Refused locally, so an over-long name costs no round trip. Mirrors the API's own limit. */
export const MAX_PROJECT_NAME_LENGTH = 64;
/** Refused locally, so an over-long name costs no round trip. Mirrors the API's own limit. */
export const MAX_TEAM_NAME_LENGTH = 32;

export const COLOR = {
  reported: 'FFB36C',
  approved: '79E8A5',
  noChanges: '64B5F6',
};
