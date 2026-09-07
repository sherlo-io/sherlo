import { Platform } from '@sherlo/api-types';

export const APP_DOMAIN = 'https://app.sherlo.io';
const DOCS_BASE_URL = 'https://sherlo.io/docs';

export const CONTACT_EMAIL = 'contact@sherlo.io';
export const DISCORD_URL = 'https://discord.gg/G7eqTBkWZt';

export const DOCS_LINK = {
  setupMetroConfig: `${DOCS_BASE_URL}/setup#metro-config`,
  setupStorybookComponent: `${DOCS_BASE_URL}/setup#storybook-component`,
  setupStorybookAccess: `${DOCS_BASE_URL}/setup#storybook-access`,

  config: `${DOCS_BASE_URL}/config`,
  configProperties: `${DOCS_BASE_URL}/config#properties`,
  configToken: `${DOCS_BASE_URL}/config#token`,
  configAndroid: `${DOCS_BASE_URL}/config#android`,
  configIos: `${DOCS_BASE_URL}/config#ios`,
  configDevices: `${DOCS_BASE_URL}/config#devices`,

  builds: `${DOCS_BASE_URL}/builds`,
  buildPreview: `${DOCS_BASE_URL}/builds?type=preview-simulator#build-types`,
  buildDevelopment: `${DOCS_BASE_URL}/builds?type=development-simulator#build-types`,
  buildAndroidAbiRequirements: `${DOCS_BASE_URL}/builds#android-abi-requirements`,

  testing: `${DOCS_BASE_URL}/testing`,
  testingMethods: `${DOCS_BASE_URL}/testing#testing-methods`,
  testEasCloudBuild: `${DOCS_BASE_URL}/testing?method=eas-cloud-build#testing-methods`,

  devices: `${DOCS_BASE_URL}/devices`,
};

export const PLATFORMS: readonly Platform[] = ['android', 'ios'];

export const PLATFORM_LABEL: { [platform in Platform]: string } = {
  android: 'Android',
  ios: 'iOS',
};

export const ANDROID_FILE_TYPES = ['.apk'] as const;
export const IOS_FILE_TYPES = ['.app', '.tar.gz', '.tar'] as const;

// Mirrors sherlo-runner src/executor/android/constants.ts
export const ANDROID_ARM64_ABI = 'arm64-v8a';

export const DEFAULT_CONFIG_FILENAME = 'sherlo.config.json';
export const DEFAULT_PROJECT_ROOT = '.';

export const SHERLO_TEMP_DIRECTORY = '.sherlo';
export const SHERLO_TEMP_DATA_FILENAME = 'data.json';

/* PACKAGES */

export const EXPO_PACKAGE_NAME = 'expo';
export const EXPO_DEV_CLIENT_PACKAGE_NAME = 'expo-dev-client';
export const REACT_NATIVE_PACKAGE_NAME = 'react-native';
export const SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME = '@sherlo/react-native-storybook';
export const STORYBOOK_REACT_NATIVE_PACKAGE_NAME = '@storybook/react-native';

export const MIN_REACT_NATIVE_VERSION = '0.74.0';
export const MIN_STORYBOOK_REACT_NATIVE_VERSION = '8.0.0';

/* COMMANDS */

/*
 * HOW A SHERLO COMMAND IS NAMED, decided 2026-09-06 and applied from
 * `project create` onwards. Read this before adding the next one, because
 * otherwise the next one is named by whoever types first.
 *
 *   A PRIMARY FLOW IS A VERB.       `sherlo test`, `sherlo view`, `sherlo init`
 *   A MANAGEMENT OPERATION IS       `sherlo project create`
 *   NOUN-VERB.                      (and later `sherlo team list`, `sherlo
 *                                    project delete`, ...)
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
export const SHOW_ERROR_COMMAND = 'show-error';
export const FINGERPRINT_COMMAND = 'fingerprint';
export const VIEW_COMMAND = 'view';
/** The `project` resource group. It does nothing on its own - see PROJECT_CREATE_SUBCOMMAND. */
export const PROJECT_COMMAND = 'project';
/** `sherlo project create --name <name>` - the first management operation (see the note above). */
export const PROJECT_CREATE_SUBCOMMAND = 'create';
export const FULL_INIT_COMMAND = 'npx sherlo init';

/* OPTIONS */

export const ANDROID_OPTION = 'android';
/** `sherlo fingerprint`: the file to diff the current fingerprints against. */
export const BASELINE_OPTION = 'baseline';
/** Accept a prebuilt bundle directory instead of bundling (see commands/test/suppliedBundle). */
export const BUNDLE_DIR_OPTION = 'bundleDir';
/** Produce a bundle directory `--bundle-dir` will accept (see commands/test/emitBundleDir). */
export const EMIT_BUNDLE_DIR_OPTION = 'emitBundleDir';
export const DRY_RUN_OPTION = 'dryRun';
export const EMIT_EXPECTATION_OPTION = 'emitExpectation';
export const RENDER_TRANSCRIPT_OPTION = 'renderTranscript';
/** Render a transcript from a caller-declared pose (see commands/view/viewPose). */
export const RENDER_TRANSCRIPT_STATE_OPTION = 'renderTranscriptState';
export const GIT_BRANCH_OPTION = 'gitBranch';
export const CONFIG_OPTION = 'config';
export const DIAGNOSTICS_OPTION = 'diagnostics';
export const EAS_BUILD_SCRIPT_NAME_OPTION = 'easBuildScriptName';
export const IOS_OPTION = 'ios';
/** `sherlo view` / `sherlo test --wait`: print the `-- details --` block. */
export const METADATA_OPTION = 'metadata';
export const MESSAGE_OPTION = 'message';
export const PROFILE_OPTION = 'profile';
export const PROJECT_ROOT_OPTION = 'projectRoot';
export const TOKEN_OPTION = 'token';
/**
 * `sherlo project create`: the PERSONAL token, and it is a different credential
 * from `--token` - see PERSONAL_TOKEN_PREFIX below for the whole distinction.
 * It gets its own flag rather than a second meaning for `--token`, because a
 * flag that accepts either kind is a flag nobody can read an error message for.
 */
export const PERSONAL_TOKEN_OPTION = 'personalToken';
/**
 * What the user TYPES for the option above. It needs its own constant because
 * the two differ: every other option in this file is a single word, so its
 * commander property and its flag are the same string and prose can interpolate
 * either. This one is two words, and prose that interpolated the property would
 * tell a person to type `--personalToken`, which does nothing.
 */
export const PERSONAL_TOKEN_FLAG = 'personal-token';
/** `sherlo project create`: which team the new project belongs to. */
export const TEAM_OPTION = 'team';
/**
 * `sherlo project create`: the name of the thing being created. A NAMED FLAG RATHER THAN A
 * POSITIONAL, so a name is never whatever happened to follow the verb (operator ruling 2026-09-07):
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
export const WAIT_TIMEOUT_OPTION = 'waitTimeout';

/* TOKENS - there are two kinds and they must never be confusable */

/**
 * THE PREFIX THAT TELLS THE TWO CREDENTIALS APART, and the reason the CLI can
 * refuse the wrong one BY NAME instead of sending it and letting the backend
 * say no.
 *
 *   A PROJECT TOKEN is a composite the CLI parses locally: 32 random chars,
 *   then an 8-char teamId, then the project index (helpers/getTokenParts). It
 *   carries NO prefix, it names one project, and it is what `--token` /
 *   `SHERLO_TOKEN` / `sherlo.config.json` mean everywhere in this CLI. It runs
 *   tests and reads builds.
 *
 *   A PERSONAL TOKEN is `sht_` + 32 opaque chars. It carries NO team and NO
 *   project - it is resolved server-side to the PERSON who minted it, and what
 *   it may do is its scopes intersected with that person's current role on the
 *   team the request names. It is what `--personal-token` /
 *   SHERLO_PERSONAL_TOKEN mean, and today it does exactly one thing: create a
 *   project.
 *
 * SLICING A PERSONAL TOKEN THE WAY A PROJECT TOKEN IS SLICED WOULD PRODUCE A
 * PLAUSIBLE-LOOKING TEAM ID out of eight characters of random. That is the
 * failure this constant exists to make impossible: every place that used to
 * assume the composite layout now checks the prefix first and refuses.
 *
 * Source of truth: sherlo-api `packages/types/src/model/personalToken.ts`
 * (PERSONAL_TOKEN_PREFIX). Copied rather than imported because the published
 * `@sherlo/api-types` this repo builds against does not carry it yet; drop the
 * copy once it does.
 */
export const PERSONAL_TOKEN_PREFIX = 'sht_';

/**
 * Where `sherlo project create` reads its personal token when the flag is
 * absent. Deliberately NOT `SHERLO_TOKEN`, which already means the project
 * token: overloading it would put a credential with a different reach behind a
 * name whose meaning a customer's CI already relies on.
 */
export const PERSONAL_TOKEN_ENV_VAR = 'SHERLO_PERSONAL_TOKEN';

/** Refused locally, so an over-long name costs no round trip. Mirrors the API's own limit. */
export const MAX_PROJECT_NAME_LENGTH = 64;

export const COLOR = {
  reported: 'FFB36C',
  approved: '79E8A5',
  noChanges: '64B5F6',
};
