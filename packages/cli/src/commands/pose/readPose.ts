/**
 * THE POSE READER - turns a JSON document into a {@link CommandPose}, or refuses it naming
 * EVERY problem at once.
 *
 * The shape it decodes is `contracts/pose.contract.ts`, which a consumer copies verbatim into a
 * repository that cannot import this one. The types below are this repository's own declaration
 * of that shape, and `contracts/pose.contract.law.ts` pins the two together in both directions -
 * so a field renamed here reds the typecheck there rather than leaving a contract that still
 * reads plausibly and describes a pose the tool refuses.
 *
 * ------------------------------------------------------------------------
 * WHY EVERY PROBLEM AT ONCE, AND WHY NOTHING IS GUESSED.
 *
 * A pose is written by hand. A reader that stopped at the first problem would make fixing one
 * a round trip per mistake, and a reader that filled a gap with a default would let somebody
 * review a state they never asked for. So every field is required, an unknown key is refused by
 * name rather than ignored, and the refusal lists everything it found.
 *
 * The checks here that are about MEANING rather than shape are the three optional-by-command
 * fields: a pose that supplies `bundles` to a command that never bundles, a `push` to a command
 * that never reads a native build, or a `workstation` to a command that never acts on the machine
 * is describing a step that command does not have, and is refused (see {@link commandBundles} and
 * {@link commandActsOnTheMachine}).
 */
import type { BuildStatus } from '../../helpers/waitForBuildResult';

/** The whole of what one command run needed in order to print what it printed. */
export type CommandPose = {
  pose: 1;
  argv: string[];
  files: Record<string, string | Record<string, unknown>>;
  env: Record<string, string>;
  git: PosedGit;
  bundles: Record<string, PosedBundle>;
  api: ScriptedCall[];
  masks: Record<string, string>;
  /**
   * What a real push read off the machine - the binaries it was handed, the base fingerprint,
   * the clock. THE ONE OPTIONAL FIELD: only `sherlo test --android/--ios` reads the machine, and
   * a refusal on that road never reaches it. A command that reaches the machine with no `push`
   * is refused at run time, like a call the pose did not script.
   */
  push?: PosedPush;
  /**
   * What `sherlo init` did TO the machine: the package the manager answered the install with, and
   * whether anybody pressed Enter at the prompt. THE OTHER OPTIONAL FIELD, because `init` is the
   * only command that acts on the machine rather than reading it. A command that acts on the
   * machine with no `workstation` is refused at run time, like a call the pose did not script.
   */
  workstation?: PosedWorkstation;
};

/** The two acts `sherlo init` performs on the machine, as a pose states them. */
export type PosedWorkstation = {
  /** What the package manager answered when asked to add Sherlo: the package it installed. */
  install: { package: string };
  /** Whether a person pressed Enter at the prompt, or the terminal was closed on it. */
  enter: 'pressed' | 'closed';
};

/** What a real push read off the machine, as a pose states it. */
export type PosedPush = {
  /** The instant the run read the clock at, ISO 8601. */
  now: string;
  /** The binaries the command was handed, per platform. */
  binaries: Record<string, PosedBinary>;
  /** The base fingerprint over the project's native inputs, or why there was none. */
  fingerprint: { hash: string } | { unavailable: string };
};

/** One binary as a pose states it - what the reader would have found inside the file. */
export type PosedBinary = {
  /** The file's hash, sent to the server to ask whether it has seen this binary. Never printed. */
  hash: string;
  /** What the upload line announces, e.g. `"48.12"`. */
  sizeMb: string;
  /** The Sherlo SDK version baked into the binary; `null` poses the missing-Sherlo refusal. */
  sdkVersion: string | null;
  /** Whether a JS bundle sits at the platform-default path - a preview build has one, a development build does not. */
  hasEmbeddedBundle: boolean;
  /** The bundle's format, as the gate reads it off the embedded bundle's header. */
  bundleFormat: 'plain-js' | 'hermes-bytecode' | 'ram';
  /** Whether expo-updates is enabled in the binary - an Android binary with it cannot be a base. */
  expoUpdatesEnabled: boolean;
  /** Whether the binary carries expo-dev-client. */
  hasExpoDevClient: boolean;
  /** The Expo SDK the binary was built with, when it was built with Expo. */
  expoSdkVersion?: string;
  /** The ABIs an Android binary carries (`["arm64-v8a"]`); absent for an iOS build. */
  androidAbis?: string[];
};

/**
 * What the git read answers. `'none'` is a folder that is not a repository at all;
 * `'unavailable'` is a read that failed.
 */
export type PosedGit = { branch: string; commit: string; dirty: boolean } | 'none' | 'unavailable';

/** One platform's bundle as the bundler reports it. */
export type PosedBundle = {
  bundlePath: string;
  bundleSizeMb: number;
  bundleFormat: 'plain-js' | 'hermes-bytecode';
  bundler: 'expo' | 'metro';
  assets: string[];
  storyClosureKeys: string[];
};

/** The error the server sends, as the tool's client surfaces it. */
export type ApiError = { error: string };

/**
 * What `getBuildStatus` answers. THE WIRE'S OWN SHAPE, imported rather than re-typed: a pose
 * describing a build the backend cannot send would let a product design be approved off a state
 * that can never occur.
 */
export type BuildStatusAnswer = BuildStatus;

/** What the dry-run road's one read-only question answers. */
export type DiffScopeDryRunAnswer = {
  platforms: Array<{
    platform: 'android' | 'ios';
    isFullCapture: boolean;
    reason: string;
    capturedStoryFilePaths: string[];
  }>;
};

/** One scripted answer. The `call` names the operation as the tool's own client names it. */
export type ScriptedCall =
  | {
      call: 'getBuildStatus';
      with: { buildIndex: number };
      answer: BuildStatusAnswer | null | ApiError;
    }
  | {
      call: 'createProject';
      with: { teamId: string; name: string };
      answer: { name: string; index: number; projectToken: string } | ApiError;
    }
  | { call: 'createTeam'; with: { name: string }; answer: { id: string; name: string } | ApiError }
  | {
      call: 'listTeams';
      with: Record<string, never>;
      answer:
        | { teams: Array<{ id: string; name: string; projectCount: number; role: string | null }> }
        | ApiError;
    }
  | {
      call: 'listProjects';
      with: { teamId: string };
      answer:
        | {
            team: { name: string; id: string };
            projects: Array<{
              index: number;
              name: string;
              buildCount: number;
              mainBranch: string | null;
            }>;
          }
        | ApiError;
    }
  | {
      call: 'openBuild';
      with: { platforms: string[] };
      answer: { buildIndex: number; url: string } | ApiError;
    }
  | {
      call: 'computeDiffScopeDryRun';
      with: { branch: string; commit: string };
      answer: DiffScopeDryRunAnswer | ApiError;
    }
  | {
      call: 'getNextBuildInfo';
      with: { platforms: string[] };
      answer: NextBuildInfoAnswer | ApiError;
    }
  | {
      call: 'getStagedUploadUrls';
      with: { platforms: string[] };
      answer: Record<string, never> | ApiError;
    }
  | {
      call: 'trackCliInit';
      with: { event: string };
      answer: { sessionId: string } | ApiError;
    };

/**
 * What the push's first question answers: which build comes next and, per binary, whether the
 * server wants it uploaded or already holds it from an earlier build (the reuse line's build
 * number and "N minutes ago" come from `reuse`).
 */
export type NextBuildInfoAnswer = {
  nextBuildIndex: number;
  binaries: Record<string, { upload: true } | { reuse: { buildIndex: number; createdAt: string } }>;
};

/** The operation names a pose may script, in the order the contract declares them. */
export const SCRIPTED_CALL_NAMES = [
  'getBuildStatus',
  'createProject',
  'createTeam',
  'listTeams',
  'listProjects',
  'openBuild',
  'computeDiffScopeDryRun',
  'getNextBuildInfo',
  'getStagedUploadUrls',
  'trackCliInit',
] as const;

export type ScriptedCallName = (typeof SCRIPTED_CALL_NAMES)[number];

/** Every problem the reader found, in one error - see this file's header for why all of them. */
export class PoseRefusal extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      'This is not a CommandPose (contracts/pose.contract.ts). ' +
        `${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n')
    );
    this.name = 'PoseRefusal';
    this.problems = problems;
  }
}

/**
 * Read a pose from the text of a JSON document. Invalid JSON is itself one problem, named the
 * same way as every other - a caller never has to tell a parse failure from a shape failure.
 */
export function readPoseDocument(text: string): CommandPose {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new PoseRefusal([`the document is not valid JSON: ${(error as Error).message}`]);
  }

  return readPose(document);
}

/** Read a pose from an already-parsed document. Throws {@link PoseRefusal} naming every problem. */
export function readPose(document: unknown): CommandPose {
  const problems: string[] = [];
  const pose = asObject(document, 'the document', problems);

  if (!pose) throw new PoseRefusal(problems);

  readVersion(pose, problems);
  const argv = readArgv(pose, problems);
  readFiles(pose, problems);
  readStringMap(pose, 'env', problems);
  readGit(pose, problems);
  readBundles(pose, argv, problems);
  readApi(pose, problems);
  readStringMap(pose, 'masks', problems);
  readPush(pose, argv, problems);
  readWorkstation(pose, argv, problems);

  reportUnknownFields(
    pose,
    ['pose', 'argv', 'files', 'env', 'git', 'bundles', 'api', 'masks', 'push', 'workstation'],
    '',
    problems
  );

  if (problems.length > 0) throw new PoseRefusal(problems);

  return pose as unknown as CommandPose;
}

/**
 * Whether a command's road reaches the bundler, decided from the FIRST WORD of the command line
 * and nothing else.
 *
 * `sherlo test` bundles on both its roads; a refusal, a `view`, a `project create` never reaches
 * a bundler, so bundles supplied to one of those describe a step that never runs. The tool's own
 * routing decides which checks fire - this says only which commands HAVE a bundler at all.
 */
function commandBundles(argv: string[]): boolean {
  return argv[0] === 'test';
}

/**
 * Whether a command's road ACTS on the machine - runs its package manager, waits on its keyboard -
 * decided from the FIRST WORD of the command line and nothing else.
 *
 * `sherlo init` is the only one. Every other command reads the machine and reports; none of them
 * installs anything or stops for a key, so a `workstation` supplied to one of those describes two
 * acts that never happen.
 */
function commandActsOnTheMachine(argv: string[]): boolean {
  return argv[0] === 'init';
}

/* ========================================================================== */

function readVersion(pose: Record<string, unknown>, problems: string[]): void {
  if (!('pose' in pose)) {
    problems.push(
      '`pose`: missing - a reader refuses a version it does not know, so it must be stated'
    );
    return;
  }

  if (pose.pose !== 1) {
    problems.push(
      `\`pose\`: this reader knows version 1, and this document says ${describe(pose.pose)}`
    );
  }
}

function readArgv(pose: Record<string, unknown>, problems: string[]): string[] {
  const argv = pose.argv;

  if (!Array.isArray(argv)) {
    problems.push(`\`argv\`: expected an array of strings, got ${describe(argv)}`);
    return [];
  }

  const words = argv.filter((word, index) => {
    if (typeof word === 'string') return true;
    problems.push(`\`argv[${index}]\`: expected a string, got ${describe(word)}`);
    return false;
  }) as string[];

  if (argv.length === 0) {
    problems.push('`argv`: empty - a pose has to say which command it poses, e.g. `["view", "7"]`');
  }

  return words;
}

/** `files` maps a relative path to a string written as is, or an object written as JSON. */
function readFiles(pose: Record<string, unknown>, problems: string[]): void {
  const files = asObject(pose.files, '`files`', problems);
  if (!files) return;

  for (const [path, content] of Object.entries(files)) {
    if (typeof content === 'string') continue;
    if (isPlainObject(content)) continue;
    problems.push(`\`files["${path}"]\`: expected a string or an object, got ${describe(content)}`);
  }
}

function readStringMap(
  pose: Record<string, unknown>,
  field: 'env' | 'masks',
  problems: string[]
): void {
  const map = asObject(pose[field], `\`${field}\``, problems);
  if (!map) return;

  for (const [key, value] of Object.entries(map)) {
    if (typeof value !== 'string') {
      problems.push(`\`${field}["${key}"]\`: expected a string, got ${describe(value)}`);
    }
  }
}

function readGit(pose: Record<string, unknown>, problems: string[]): void {
  const git = pose.git;

  if (git === 'none' || git === 'unavailable') return;

  if (!isPlainObject(git)) {
    problems.push(
      '`git`: expected `"none"`, `"unavailable"`, or `{ branch, commit, dirty }`, got ' +
        describe(git)
    );
    return;
  }

  expectString(git, 'branch', '`git`', problems);
  expectString(git, 'commit', '`git`', problems);
  expectBoolean(git, 'dirty', '`git`', problems);
  reportUnknownFields(git, ['branch', 'commit', 'dirty'], '`git`', problems);
}

function readBundles(pose: Record<string, unknown>, argv: string[], problems: string[]): void {
  const bundles = asObject(pose.bundles, '`bundles`', problems);
  if (!bundles) return;

  const platforms = Object.keys(bundles);

  if (platforms.length > 0 && !commandBundles(argv)) {
    problems.push(
      `\`bundles\`: \`${
        argv[0] ?? ''
      }\` never reaches a bundler, so there is no bundling step for ` +
        `${platforms.map((platform) => `\`${platform}\``).join(', ')} to answer. Use \`{}\`.`
    );
  }

  for (const platform of platforms) {
    const where = `\`bundles["${platform}"]\``;

    if (platform !== 'android' && platform !== 'ios') {
      problems.push(
        `${where}: \`${platform}\` is not a platform - the tool bundles \`android\` and \`ios\``
      );
    }

    const bundle = asObject(bundles[platform], where, problems);
    if (!bundle) continue;

    expectString(bundle, 'bundlePath', where, problems);
    expectNumber(bundle, 'bundleSizeMb', where, problems);
    expectOneOf(bundle, 'bundleFormat', ['plain-js', 'hermes-bytecode'], where, problems);
    expectOneOf(bundle, 'bundler', ['expo', 'metro'], where, problems);
    expectStringArray(bundle, 'assets', where, problems);
    expectStringArray(bundle, 'storyClosureKeys', where, problems);
    reportUnknownFields(
      bundle,
      ['bundlePath', 'bundleSizeMb', 'bundleFormat', 'bundler', 'assets', 'storyClosureKeys'],
      where,
      problems
    );
  }
}

/**
 * `push` is read only when it is there: it is the one optional field, because only a real push
 * reads the machine. Stated for a command that never does, it describes a step that command does
 * not have, and is refused the way `bundles` is.
 */
function readPush(pose: Record<string, unknown>, argv: string[], problems: string[]): void {
  if (!('push' in pose)) return;

  const push = asObject(pose.push, '`push`', problems);
  if (!push) return;

  if (!commandBundles(argv)) {
    problems.push(
      `\`push\`: \`${argv[0] ?? ''}\` never reads a native build, so there is no push for it to ` +
        'describe. Leave the field out.'
    );
  }

  expectString(push, 'now', '`push`', problems);
  if (typeof push.now === 'string' && Number.isNaN(Date.parse(push.now))) {
    problems.push(`\`push\`.now: expected an ISO 8601 instant, got ${describe(push.now)}`);
  }

  const binaries = asObject(push.binaries, '`push.binaries`', problems);
  if (binaries) {
    for (const platform of Object.keys(binaries)) {
      const where = `\`push.binaries["${platform}"]\``;

      if (platform !== 'android' && platform !== 'ios') {
        problems.push(
          `${where}: \`${platform}\` is not a platform - the tool is handed \`android\` and \`ios\` builds`
        );
      }

      const binary = asObject(binaries[platform], where, problems);
      if (!binary) continue;

      expectString(binary, 'hash', where, problems);
      expectString(binary, 'sizeMb', where, problems);
      expectStringOrNull(binary, 'sdkVersion', where, problems);
      expectBoolean(binary, 'hasEmbeddedBundle', where, problems);
      expectOneOf(binary, 'bundleFormat', ['plain-js', 'hermes-bytecode', 'ram'], where, problems);
      expectBoolean(binary, 'expoUpdatesEnabled', where, problems);
      expectBoolean(binary, 'hasExpoDevClient', where, problems);
      if ('expoSdkVersion' in binary) expectString(binary, 'expoSdkVersion', where, problems);
      if ('androidAbis' in binary) expectStringArray(binary, 'androidAbis', where, problems);
      reportUnknownFields(
        binary,
        [
          'hash',
          'sizeMb',
          'sdkVersion',
          'hasEmbeddedBundle',
          'bundleFormat',
          'expoUpdatesEnabled',
          'hasExpoDevClient',
          'expoSdkVersion',
          'androidAbis',
        ],
        where,
        problems
      );
    }
  }

  const fingerprint = asObject(push.fingerprint, '`push.fingerprint`', problems);
  if (fingerprint) {
    if ('hash' in fingerprint) {
      expectString(fingerprint, 'hash', '`push.fingerprint`', problems);
      reportUnknownFields(fingerprint, ['hash'], '`push.fingerprint`', problems);
    } else if ('unavailable' in fingerprint) {
      expectString(fingerprint, 'unavailable', '`push.fingerprint`', problems);
      reportUnknownFields(fingerprint, ['unavailable'], '`push.fingerprint`', problems);
    } else {
      problems.push(
        '`push.fingerprint`: expected `{ hash }` or `{ unavailable }` - the base fingerprint, or ' +
          'why there was none'
      );
    }
  }

  reportUnknownFields(push, ['now', 'binaries', 'fingerprint'], '`push`', problems);
}

/**
 * `workstation` is read only when it is there: it is optional because only `sherlo init` acts on
 * the machine. Stated for a command that does not, it describes two acts that command never
 * performs, and is refused the way `bundles` and `push` are.
 */
function readWorkstation(pose: Record<string, unknown>, argv: string[], problems: string[]): void {
  if (!('workstation' in pose)) return;

  const workstation = asObject(pose.workstation, '`workstation`', problems);
  if (!workstation) return;

  if (!commandActsOnTheMachine(argv)) {
    problems.push(
      `\`workstation\`: \`${argv[0] ?? ''}\` never installs a package or waits for a key, so ` +
        'there is no workstation for it to describe. Leave the field out.'
    );
  }

  const install = asObject(workstation.install, '`workstation.install`', problems);
  if (install) {
    expectString(install, 'package', '`workstation.install`', problems);
    reportUnknownFields(install, ['package'], '`workstation.install`', problems);
  }

  expectOneOf(workstation, 'enter', ['pressed', 'closed'], '`workstation`', problems);
  reportUnknownFields(workstation, ['install', 'enter'], '`workstation`', problems);
}

function readApi(pose: Record<string, unknown>, problems: string[]): void {
  const api = pose.api;

  if (!Array.isArray(api)) {
    problems.push(`\`api\`: expected an array of scripted calls, got ${describe(api)}`);
    return;
  }

  api.forEach((entry, index) => readScriptedCall(entry, `\`api[${index}]\``, problems));
}

function readScriptedCall(entry: unknown, where: string, problems: string[]): void {
  const call = asObject(entry, where, problems);
  if (!call) return;

  const name = call.call;

  if (typeof name !== 'string' || !SCRIPTED_CALL_NAMES.includes(name as ScriptedCallName)) {
    problems.push(
      `${where}.call: ${describe(name)} is not an operation a pose may script - ` +
        `the contract names ${SCRIPTED_CALL_NAMES.map((operation) => `\`${operation}\``).join(
          ', '
        )}`
    );
    return;
  }

  reportUnknownFields(call, ['call', 'with', 'answer'], where, problems);
  readCallArguments(name as ScriptedCallName, call.with, `${where}.with`, problems);

  if (!('answer' in call)) {
    problems.push(`${where}.answer: missing - every scripted call states what the server answered`);
    return;
  }

  readCallAnswer(name as ScriptedCallName, call.answer, `${where}.answer`, problems);
}

/** The arguments the command must have made the call with - checked, never guessed. */
function readCallArguments(
  name: ScriptedCallName,
  callArguments: unknown,
  where: string,
  problems: string[]
): void {
  const args = asObject(callArguments, where, problems);
  if (!args) return;

  switch (name) {
    case 'getBuildStatus':
      expectNumber(args, 'buildIndex', where, problems);
      reportUnknownFields(args, ['buildIndex'], where, problems);
      return;
    case 'createProject':
      expectString(args, 'teamId', where, problems);
      expectString(args, 'name', where, problems);
      reportUnknownFields(args, ['teamId', 'name'], where, problems);
      return;
    case 'createTeam':
      expectString(args, 'name', where, problems);
      reportUnknownFields(args, ['name'], where, problems);
      return;
    case 'listTeams':
      reportUnknownFields(args, [], where, problems);
      return;
    case 'listProjects':
      expectString(args, 'teamId', where, problems);
      reportUnknownFields(args, ['teamId'], where, problems);
      return;
    case 'openBuild':
      expectStringArray(args, 'platforms', where, problems);
      reportUnknownFields(args, ['platforms'], where, problems);
      return;
    case 'computeDiffScopeDryRun':
      expectString(args, 'branch', where, problems);
      expectString(args, 'commit', where, problems);
      reportUnknownFields(args, ['branch', 'commit'], where, problems);
      return;
    case 'getNextBuildInfo':
    case 'getStagedUploadUrls':
      expectStringArray(args, 'platforms', where, problems);
      reportUnknownFields(args, ['platforms'], where, problems);
      return;
    case 'trackCliInit':
      expectString(args, 'event', where, problems);
      reportUnknownFields(args, ['event'], where, problems);
      return;
  }
}

function readCallAnswer(
  name: ScriptedCallName,
  answer: unknown,
  where: string,
  problems: string[]
): void {
  // `getBuildStatus` is the one call whose "the build is not there" answer is null, and the
  // build-not-found screen is posed with it.
  if (answer === null) {
    if (name !== 'getBuildStatus') {
      problems.push(
        `${where}: only \`getBuildStatus\` answers \`null\` (the build does not exist)`
      );
    }
    return;
  }

  const body = asObject(answer, where, problems);
  if (!body) return;

  // An error the server sent, for any call: the one answer shape they share.
  if (isApiError(body)) {
    expectString(body, 'error', where, problems);
    return;
  }

  switch (name) {
    case 'getBuildStatus':
      readBuildStatusAnswer(body, where, problems);
      return;
    case 'createProject':
      expectString(body, 'name', where, problems);
      expectNumber(body, 'index', where, problems);
      expectString(body, 'projectToken', where, problems);
      reportUnknownFields(body, ['name', 'index', 'projectToken'], where, problems);
      return;
    case 'createTeam':
      expectString(body, 'id', where, problems);
      expectString(body, 'name', where, problems);
      reportUnknownFields(body, ['id', 'name'], where, problems);
      return;
    case 'listTeams':
      eachEntryOf(body, 'teams', where, problems, (team, teamWhere) => {
        expectString(team, 'id', teamWhere, problems);
        expectString(team, 'name', teamWhere, problems);
        expectNumber(team, 'projectCount', teamWhere, problems);
        expectStringOrNull(team, 'role', teamWhere, problems);
        reportUnknownFields(team, ['id', 'name', 'projectCount', 'role'], teamWhere, problems);
      });
      reportUnknownFields(body, ['teams'], where, problems);
      return;
    case 'listProjects': {
      const team = asObject(body.team, `${where}.team`, problems);
      if (team) {
        expectString(team, 'name', `${where}.team`, problems);
        expectString(team, 'id', `${where}.team`, problems);
        reportUnknownFields(team, ['name', 'id'], `${where}.team`, problems);
      }
      eachEntryOf(body, 'projects', where, problems, (project, projectWhere) => {
        expectNumber(project, 'index', projectWhere, problems);
        expectString(project, 'name', projectWhere, problems);
        expectNumber(project, 'buildCount', projectWhere, problems);
        expectStringOrNull(project, 'mainBranch', projectWhere, problems);
        reportUnknownFields(
          project,
          ['index', 'name', 'buildCount', 'mainBranch'],
          projectWhere,
          problems
        );
      });
      reportUnknownFields(body, ['team', 'projects'], where, problems);
      return;
    }
    case 'openBuild':
      expectNumber(body, 'buildIndex', where, problems);
      expectString(body, 'url', where, problems);
      reportUnknownFields(body, ['buildIndex', 'url'], where, problems);
      return;
    case 'computeDiffScopeDryRun':
      eachEntryOf(body, 'platforms', where, problems, (platform, platformWhere) => {
        expectOneOf(platform, 'platform', ['android', 'ios'], platformWhere, problems);
        expectBoolean(platform, 'isFullCapture', platformWhere, problems);
        expectString(platform, 'reason', platformWhere, problems);
        expectStringArray(platform, 'capturedStoryFilePaths', platformWhere, problems);
        reportUnknownFields(
          platform,
          ['platform', 'isFullCapture', 'reason', 'capturedStoryFilePaths'],
          platformWhere,
          problems
        );
      });
      reportUnknownFields(body, ['platforms'], where, problems);
      return;
    case 'getNextBuildInfo': {
      expectNumber(body, 'nextBuildIndex', where, problems);
      const binaries = asObject(body.binaries, `${where}.binaries`, problems);
      if (binaries) {
        for (const platform of Object.keys(binaries)) {
          const binaryWhere = `${where}.binaries["${platform}"]`;
          const decision = asObject(binaries[platform], binaryWhere, problems);
          if (!decision) continue;
          if ('upload' in decision) {
            if (decision.upload !== true) {
              problems.push(
                `${binaryWhere}.upload: expected \`true\`, got ${describe(decision.upload)}`
              );
            }
            reportUnknownFields(decision, ['upload'], binaryWhere, problems);
          } else if ('reuse' in decision) {
            const reuse = asObject(decision.reuse, `${binaryWhere}.reuse`, problems);
            if (reuse) {
              expectNumber(reuse, 'buildIndex', `${binaryWhere}.reuse`, problems);
              expectString(reuse, 'createdAt', `${binaryWhere}.reuse`, problems);
              reportUnknownFields(
                reuse,
                ['buildIndex', 'createdAt'],
                `${binaryWhere}.reuse`,
                problems
              );
            }
            reportUnknownFields(decision, ['reuse'], binaryWhere, problems);
          } else {
            problems.push(
              `${binaryWhere}: expected \`{ upload: true }\` or \`{ reuse: { buildIndex, createdAt } }\``
            );
          }
        }
      }
      reportUnknownFields(body, ['nextBuildIndex', 'binaries'], where, problems);
      return;
    }
    case 'getStagedUploadUrls':
      // The call is scripted so the pose says it was made; there is nothing in the answer a pose
      // could meaningfully state (see ../../seams/serverCalls, `stagedUploadUrlsAnswerOf`).
      reportUnknownFields(body, [], where, problems);
      return;
    case 'trackCliInit':
      // The one thing the backend answers a progress report with, and the one thing the command
      // carries into the next report: the session the whole setup is recorded under.
      expectString(body, 'sessionId', where, problems);
      reportUnknownFields(body, ['sessionId'], where, problems);
      return;
  }
}

/**
 * The build the read answered with. Optional fields are optional ON THE WIRE - an older backend
 * does not send them, and the tool's behaviour for an absent field differs from its behaviour
 * for a zero or an empty list - so an absent one is never filled in here.
 */
function readBuildStatusAnswer(
  build: Record<string, unknown>,
  where: string,
  problems: string[]
): void {
  expectOneOf(
    build,
    'runStatus',
    ['canceled', 'error', 'finished', 'inProgress', 'queued', 'waiting'],
    where,
    problems
  );

  if ('showsOnlyBranchChanges' in build) {
    expectBoolean(build, 'showsOnlyBranchChanges', where, problems);
  }
  if ('status' in build) {
    expectOneOf(
      build,
      'status',
      ['approved', 'noChanges', 'reported', 'unreviewed'],
      where,
      problems
    );
  }

  if ('viewStatusesCount' in build) {
    const counts = asObject(build.viewStatusesCount, `${where}.viewStatusesCount`, problems);
    if (counts) {
      for (const verdict of ['approved', 'noChanges', 'reported', 'unreviewed']) {
        expectNumber(counts, verdict, `${where}.viewStatusesCount`, problems);
      }
      reportUnknownFields(
        counts,
        ['approved', 'noChanges', 'reported', 'unreviewed'],
        `${where}.viewStatusesCount`,
        problems
      );
    }
  }

  // `runError` is whatever the backend recorded about a failed run - its shape is the backend's,
  // so anything at all passes here, and that is the contract, not a gap.

  if ('diffScopeInfo' in build) {
    readDiffScopeInfo(build.diffScopeInfo, `${where}.diffScopeInfo`, problems);
  }

  if ('gitInfo' in build) {
    const gitInfo = asObject(build.gitInfo, `${where}.gitInfo`, problems);
    if (gitInfo) {
      expectString(gitInfo, 'branchName', `${where}.gitInfo`, problems);
      expectString(gitInfo, 'commitHash', `${where}.gitInfo`, problems);
      reportUnknownFields(gitInfo, ['branchName', 'commitHash'], `${where}.gitInfo`, problems);
    }
  }

  if ('stories' in build) {
    eachEntryOf(build, 'stories', where, problems, (story, storyWhere) => {
      expectString(story, 'name', storyWhere, problems);
      // `status` is the plain string the wire sends, so a value the tool has not learned yet
      // still passes through.
      expectString(story, 'status', storyWhere, problems);
      if (story.baseline !== null) {
        const baseline = asObject(story.baseline, `${storyWhere}.baseline`, problems);
        if (baseline) {
          expectNumber(baseline, 'buildIndex', `${storyWhere}.baseline`, problems);
          reportUnknownFields(baseline, ['buildIndex'], `${storyWhere}.baseline`, problems);
        }
      }
      if ('reason' in story) expectString(story, 'reason', storyWhere, problems);
      if ('candidates' in story) {
        eachEntryOf(story, 'candidates', storyWhere, problems, (candidate, candidateWhere) => {
          expectNumber(candidate, 'buildIndex', candidateWhere, problems);
          reportUnknownFields(candidate, ['buildIndex'], candidateWhere, problems);
        });
      }
      if (!('baseline' in story)) {
        problems.push(
          `${storyWhere}.baseline: missing - state the build it was judged against, or \`null\``
        );
      }
      reportUnknownFields(
        story,
        ['name', 'status', 'baseline', 'reason', 'candidates'],
        storyWhere,
        problems
      );
    });
  }

  if ('diffScope' in build) {
    const diffScope = asObject(build.diffScope, `${where}.diffScope`, problems);
    if (diffScope) {
      expectString(diffScope, 'reason', `${where}.diffScope`, problems);
      expectStringArray(diffScope, 'captured', `${where}.diffScope`, problems);
      expectStringArray(diffScope, 'inherited', `${where}.diffScope`, problems);
      if (diffScope.ancestorBuildIndex !== null) {
        expectNumber(diffScope, 'ancestorBuildIndex', `${where}.diffScope`, problems);
      }
      reportUnknownFields(
        diffScope,
        ['reason', 'captured', 'inherited', 'ancestorBuildIndex'],
        `${where}.diffScope`,
        problems
      );
    }
  }

  reportUnknownFields(
    build,
    [
      'runStatus',
      'showsOnlyBranchChanges',
      'status',
      'viewStatusesCount',
      'runError',
      'diffScopeInfo',
      'gitInfo',
      'stories',
      'diffScope',
    ],
    where,
    problems
  );
}

function readDiffScopeInfo(value: unknown, where: string, problems: string[]): void {
  const info = asObject(value, where, problems);
  if (!info) return;

  if ('capturedSnapshotCount' in info) expectNumber(info, 'capturedSnapshotCount', where, problems);
  if ('inheritedSnapshotCount' in info) {
    expectNumber(info, 'inheritedSnapshotCount', where, problems);
  }

  if ('platforms' in info) {
    const platforms = asObject(info.platforms, `${where}.platforms`, problems);
    if (platforms) {
      for (const platform of Object.keys(platforms)) {
        const platformWhere = `${where}.platforms.${platform}`;
        const entry = asObject(platforms[platform], platformWhere, problems);
        if (!entry) continue;
        if ('reason' in entry) expectString(entry, 'reason', platformWhere, problems);
        reportUnknownFields(entry, ['reason'], platformWhere, problems);
      }
      reportUnknownFields(platforms, ['android', 'ios'], `${where}.platforms`, problems);
    }
  }

  reportUnknownFields(
    info,
    ['capturedSnapshotCount', 'inheritedSnapshotCount', 'platforms'],
    where,
    problems
  );
}

/* -------------------------------------------------------------------------- *
 * The small checks every rule above is written out of.                        *
 * -------------------------------------------------------------------------- */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An answer whose only field is `error` is the error the server sent, whatever call it was. */
function isApiError(body: Record<string, unknown>): boolean {
  const fields = Object.keys(body);
  return fields.length === 1 && fields[0] === 'error';
}

function asObject(
  value: unknown,
  where: string,
  problems: string[]
): Record<string, unknown> | undefined {
  if (isPlainObject(value)) return value;
  problems.push(`${where}: expected an object, got ${describe(value)}`);
  return undefined;
}

function expectString(
  host: Record<string, unknown>,
  field: string,
  where: string,
  problems: string[]
): void {
  if (typeof host[field] !== 'string') {
    problems.push(`${where}.${field}: expected a string, got ${describe(host[field])}`);
  }
}

function expectStringOrNull(
  host: Record<string, unknown>,
  field: string,
  where: string,
  problems: string[]
): void {
  if (host[field] !== null && typeof host[field] !== 'string') {
    problems.push(`${where}.${field}: expected a string or \`null\`, got ${describe(host[field])}`);
  }
}

function expectNumber(
  host: Record<string, unknown>,
  field: string,
  where: string,
  problems: string[]
): void {
  if (typeof host[field] !== 'number' || !Number.isFinite(host[field])) {
    problems.push(`${where}.${field}: expected a number, got ${describe(host[field])}`);
  }
}

function expectBoolean(
  host: Record<string, unknown>,
  field: string,
  where: string,
  problems: string[]
): void {
  if (typeof host[field] !== 'boolean') {
    problems.push(`${where}.${field}: expected true or false, got ${describe(host[field])}`);
  }
}

function expectOneOf(
  host: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
  where: string,
  problems: string[]
): void {
  if (typeof host[field] !== 'string' || !allowed.includes(host[field] as string)) {
    problems.push(
      `${where}.${field}: expected one of ${allowed.map((value) => `\`${value}\``).join(', ')}, ` +
        `got ${describe(host[field])}`
    );
  }
}

function expectStringArray(
  host: Record<string, unknown>,
  field: string,
  where: string,
  problems: string[]
): void {
  const value = host[field];
  if (!Array.isArray(value)) {
    problems.push(`${where}.${field}: expected an array of strings, got ${describe(value)}`);
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== 'string') {
      problems.push(`${where}.${field}[${index}]: expected a string, got ${describe(entry)}`);
    }
  });
}

/** Runs `readEntry` over every entry of an array-valued field, naming each entry's position. */
function eachEntryOf(
  host: Record<string, unknown>,
  field: string,
  where: string,
  problems: string[],
  readEntry: (entry: Record<string, unknown>, entryWhere: string) => void
): void {
  const value = host[field];
  if (!Array.isArray(value)) {
    problems.push(`${where}.${field}: expected an array, got ${describe(value)}`);
    return;
  }
  value.forEach((entry, index) => {
    const entryWhere = `${where}.${field}[${index}]`;
    const object = asObject(entry, entryWhere, problems);
    if (object) readEntry(object, entryWhere);
  });
}

/** An unknown key is refused BY NAME - a pose never has a field quietly ignored. */
function reportUnknownFields(
  host: Record<string, unknown>,
  known: readonly string[],
  where: string,
  problems: string[]
): void {
  for (const field of Object.keys(host)) {
    if (known.includes(field)) continue;
    problems.push(`${where ? `${where}.` : '`'}${field}${where ? '' : '`'}: unknown field`);
  }
}

/** How a wrong value is named back to the person who wrote it. */
function describe(value: unknown): string {
  if (value === undefined) return 'nothing (the field is missing)';
  if (value === null) return '`null`';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') return 'an object';
  return `\`${JSON.stringify(value)}\``;
}
