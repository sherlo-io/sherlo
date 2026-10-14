/**
 * THE LOGIN IS THE ONLY CREDENTIAL A PERSON SPENDS (sherlo / Teams, projects and the personal
 * token, The credential and the project of a push).
 *
 * The four management commands, setup and a push take the saved login and nothing else of a
 * person's: no flag and no variable carries a personal token. A personal token handed to a
 * project-token door is refused by name, pointing at `npx sherlo login`. And every command any
 * message of the tool names is written the way a person types it: `npx sherlo <command>`.
 *
 * The commands are called straight, on posed seams; the flags are tried through the tool's own
 * routing, which is where an unknown flag is refused.
 */
import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import { traverseFast } from '@babel/types';
import type * as babel from '@babel/types';
import { describe, expect, it } from 'vitest';
import { NAME_OPTION, TEAM_OPTION, TEST_COMMAND } from '../../../constants';
import resolvePushCredential from '../../../helpers/getValidatedCommandParams/validateCommandParams/resolvePushCredential';
import { captureTranscript } from '../../../helpers/transcriptSink';
import { installBrowser, posedBrowser } from '../../../seams/browser';
import type { CommandPose } from '../../../seams/commandPose';
import { installSavedLogins, posedSavedLogins, type PosedLogins } from '../../../seams/savedLogins';
import {
  installServerCalls,
  posedServerCalls,
  type ScriptedCall,
  type ServerCalls,
} from '../../../seams/serverCalls';
import { installSurroundings, posedSurroundings } from '../../../seams/surroundings';
import type { InvalidatedConfig } from '../../../types';
import resolveSetupLogin from '../../init/project/resolveSetupLogin';
import { runPose } from '../../pose/pose';
import projectCreate from '../../projectCreate/projectCreate';
import projectList from '../../projectList/projectList';
import teamCreate from '../../teamCreate/teamCreate';
import teamList from '../../teamList/teamList';

const SERVICE_ADDRESS = 'https://api.sherlo.io/graphql';
const LOGIN_TOKEN = 'sht_savedlogintoken0000000000000000';
const PERSONAL_TOKEN = 'sht_handmadepersonaltoken000000000';
const LOGGED_IN: PosedLogins = {
  [SERVICE_ADDRESS]: { email: 'anna@example.com', token: LOGIN_TOKEN },
};

const TEAM_ID = 'tm000001';

/** Each management command, and the one call it makes when it has a credential. */
const MANAGEMENT_COMMANDS: Array<{ name: string; run: () => Promise<void>; call: ScriptedCall }> = [
  {
    name: 'team create',
    run: () => teamCreate({ [NAME_OPTION]: 'Acme' }),
    call: { call: 'createTeam', with: { name: 'Acme' }, answer: { id: TEAM_ID, name: 'Acme' } },
  },
  {
    name: 'team list',
    run: () => teamList(),
    call: { call: 'listTeams', with: {}, answer: { teams: [] } },
  },
  {
    name: 'project create',
    run: () => projectCreate({ [NAME_OPTION]: 'Storefront', [TEAM_OPTION]: TEAM_ID }),
    call: {
      call: 'createProject',
      with: { teamId: TEAM_ID, name: 'Storefront' },
      answer: { name: 'Storefront', index: 3, projectToken: `${'p'.repeat(32)}${TEAM_ID}3` },
    },
  },
  {
    name: 'project list',
    run: () => projectList({ [TEAM_OPTION]: TEAM_ID }),
    call: {
      call: 'listProjects',
      with: { teamId: TEAM_ID },
      answer: { team: { id: TEAM_ID, name: 'Acme' }, projects: [] },
    },
  },
];

/** Every command a person runs that spends a credential, as typed after `sherlo`. */
const COMMANDS_THAT_SPEND_A_CREDENTIAL = [
  ['team', 'create', '--name', 'Acme'],
  ['team', 'list'],
  ['project', 'create', '--name', 'Storefront', '--team', TEAM_ID],
  ['project', 'list', '--team', TEAM_ID],
  ['init'],
  ['test'],
  ['view', '7'],
];

describe('the login as the only credential a person spends', () => {
  it('spends the saved login and takes no personal token from a flag or the environment', async () => {
    // A personal token in the environment is passed over: the login is what is spent.
    for (const command of MANAGEMENT_COMMANDS) {
      const run = await runOnSeams(command.run, {
        api: [command.call],
        logins: LOGGED_IN,
        env: { SHERLO_PERSONAL_TOKEN: PERSONAL_TOKEN },
      });

      expect(run.refusal, command.name).toBeUndefined();
      expect(run.tokensSpent, command.name).toEqual([LOGIN_TOKEN]);
    }

    const pushCredential = withSeams(
      { logins: LOGGED_IN, env: { SHERLO_PERSONAL_TOKEN: PERSONAL_TOKEN } },
      () => resolvePushCredential(TEST_COMMAND, { project: `${TEAM_ID}/3` } as InvalidatedConfig)
    );
    expect(pushCredential).toMatchObject({ kind: 'person', token: LOGIN_TOKEN });

    // And no command takes a flag for one: the routing refuses it before the command runs.
    for (const argv of COMMANDS_THAT_SPEND_A_CREDENTIAL) {
      const { screen, exitCode } = await runPose(
        routingPose([...argv, '--personal-token', PERSONAL_TOKEN])
      );

      expect(exitCode, argv.join(' ')).toBe(1);
      expect(plain(screen), argv.join(' ')).toContain("unknown option '--personal-token'");
      expect(screen, argv.join(' ')).not.toContain(PERSONAL_TOKEN);
    }
  });

  it('refuses with no saved login, naming npx sherlo login and no personal token', async () => {
    for (const command of MANAGEMENT_COMMANDS) {
      const run = await runOnSeams(command.run, { api: [], logins: {} });

      expect(run.refusal, command.name).toBe(
        `ERROR: \`npx sherlo ${command.name}\` needs you to be logged in. Run \`npx sherlo login\`.`
      );
      expect(run.unansweredCalls, command.name).toEqual([]);
    }

    const pushRefusal = refusalOf(() =>
      withSeams({ logins: {} }, () =>
        resolvePushCredential(TEST_COMMAND, { project: `${TEAM_ID}/3` } as InvalidatedConfig)
      )
    );
    expect(pushRefusal).toContain('On your own computer, run `npx sherlo login`.');
    expect(pushRefusal).not.toMatch(/personal/i);
  });

  it('refuses a personal token in SHERLO_TOKEN by naming npx sherlo login, never a personal-token flag', () => {
    const refusal = refusalOf(() =>
      withSeams({ logins: {}, env: { SHERLO_TOKEN: PERSONAL_TOKEN } }, () =>
        resolvePushCredential(TEST_COMMAND, {} as InvalidatedConfig)
      )
    );

    expect(refusal).toContain('SHERLO_TOKEN wants a project token, and this is a personal token.');
    expect(refusal).toContain('`npx sherlo login`');
    expect(refusal).not.toContain('--personal-token');
    expect(refusal).not.toContain('SHERLO_PERSONAL_TOKEN');
    expect(refusal).not.toContain(PERSONAL_TOKEN);
  });

  it('every command the tool names in its messages is written as npx sherlo', () => {
    // Every string the shipped source holds - refusals, hints, next steps, help - read off the
    // syntax tree, so a comment naming `sherlo login` is not a message and is not read.
    const unprefixedMentions = shippedSourceFiles()
      .filter((file) => !isSourceForAnotherTool(file))
      .flatMap((file) =>
        stringsIn(file)
          .filter(({ text }) => namesACommandWithoutNpx(text))
          .map(({ line, text }) => `${path.relative(CLI_SRC, file)}:${line}: ${text}`)
      );

    expect(unprefixedMentions).toEqual([]);

    // A command named through its constant - `${TEST_COMMAND}` - is a mention too, and the text
    // in front of it must be the `npx sherlo ` a person types.
    const unprefixedSubstitutions = shippedSourceFiles().flatMap((file) =>
      commandSubstitutionsWithoutNpx(file).map(
        ({ line, text }) => `${path.relative(CLI_SRC, file)}:${line}: ${text}`
      )
    );

    expect(unprefixedSubstitutions).toEqual([]);
  });

  it('a login made inside npx sherlo init never tells the person to run npx sherlo init next', async () => {
    const login = await runSetupLoginOnSeams([
      {
        call: 'startCliLogin',
        with: {},
        answer: {
          loginId: 'lg7Qm2Xa',
          authorizeUrl: 'https://app.sherlo.io/cli-login/lg7Qm2Xa',
          expiresAt: '2030-01-01T00:15:00.000Z',
        },
      },
      {
        call: 'pollCliLogin',
        with: { loginId: 'lg7Qm2Xa' },
        answer: { status: 'approved', email: 'anna@example.com', token: LOGIN_TOKEN },
      },
    ]);

    expect(login.printed).toContain('Logged in as anna@example.com');
    expect(login.printed).not.toContain('npx sherlo init');
    expect(login.printed).not.toContain('Next:');
  });
});

/* ========================================================================== */

/** Run `body` with the settings and the saved logins a case states, and nothing of this machine's. */
function withSeams<Answer>(
  world: { logins: PosedLogins; env?: Record<string, string> },
  body: () => Answer
): Answer {
  const uninstall = installTheWorld(world);

  try {
    return body();
  } finally {
    uninstall();
  }
}

/** Install the settings and the saved logins a case states; the returned function undoes it. */
function installTheWorld(world: { logins: PosedLogins; env?: Record<string, string> }) {
  const surroundings = posedSurroundings({
    env: { SKIP_INTRO: 'true', SHERLO_API_URL: SERVICE_ADDRESS, ...world.env },
    git: 'none',
  });
  const uninstall = [
    installSavedLogins(posedSavedLogins(world.logins)),
    installSurroundings(surroundings),
    surroundings.installSettings(),
  ];

  return () => {
    for (const undo of uninstall.reverse()) undo();
  };
}

/**
 * Run a management command on posed seams, and answer how it ended and every token it sent to the
 * service.
 */
async function runOnSeams(
  runCommand: () => Promise<void>,
  world: { api: ScriptedCall[]; logins: PosedLogins; env?: Record<string, string> }
) {
  const posedCalls = posedServerCalls(world.api);
  const tokensSpent: string[] = [];
  const recordingCalls: ServerCalls = {
    ...posedCalls,
    createTeam: (request) => {
      tokensSpent.push(request.personalToken);
      return posedCalls.createTeam(request);
    },
    listTeams: (request) => {
      tokensSpent.push(request.personalToken);
      return posedCalls.listTeams(request);
    },
    createProject: (request) => {
      tokensSpent.push(request.personalToken);
      return posedCalls.createProject(request);
    },
    listProjects: (request) => {
      tokensSpent.push(request.personalToken);
      return posedCalls.listProjects(request);
    },
  };

  const uninstallServer = installServerCalls(recordingCalls);
  const uninstallTheWorld = installTheWorld(world);
  try {
    const refusal = await runCommand().then(
      () => undefined,
      (error: Error) => plain(error.message).trimEnd()
    );

    return { refusal, tokensSpent, unansweredCalls: posedCalls.refusals() };
  } finally {
    uninstallTheWorld();
    uninstallServer();
  }
}

/** Run setup's own login on posed seams, with no saved login, and answer what it printed. */
async function runSetupLoginOnSeams(api: ScriptedCall[]) {
  const uninstallServer = installServerCalls(posedServerCalls(api));
  const uninstallBrowser = installBrowser(posedBrowser({ opened: true }));
  const uninstallTheWorld = installTheWorld({ logins: {} });
  try {
    const transcript = await captureTranscript(async () => {
      await resolveSetupLogin();
    });

    return { printed: plain(`${transcript.stdout}${transcript.stderr}`) };
  } finally {
    uninstallTheWorld();
    uninstallBrowser();
    uninstallServer();
  }
}

/** The refusal `body` throws, colour off. */
function refusalOf(body: () => unknown): string {
  try {
    body();
  } catch (error) {
    return plain((error as Error).message);
  }
  throw new Error('it answered instead of refusing');
}

/** A pose that only routes a command line: an empty folder, no saved login, no server. */
function routingPose(argv: string[]): CommandPose {
  return {
    pose: 1,
    argv,
    files: {},
    env: { SKIP_INTRO: 'true', SHERLO_API_URL: SERVICE_ADDRESS },
    git: 'none',
    bundles: {},
    api: [],
    masks: {},
  };
}

/* ========================================================================== */
/* The sweep                                                                  */
/* ========================================================================== */

const CLI_SRC = path.resolve(__dirname, '../../..');

/**
 * Templates that name a command without `npx` on purpose, each one named by its file and its
 * source text. Never a pattern: a real message cannot slip through by matching one.
 */
const UNPREFIXED_ON_PURPOSE: Array<{ file: string; text: string; reason: string }> = [
  {
    file: 'commands/test/appBuild/easRun.ts',
    text: '`sherlo ${EAS_BUILD_ON_COMPLETE_COMMAND}`',
    reason:
      'The VALUE of the package.json script the refusal shows ("eas-build-on-complete": "sherlo eas-build-on-complete"). A package.json script runs with node_modules/.bin on its path, so it needs no npx; it is not a command a person types.',
  },
  {
    file: 'commands/test/appBuild/easRun.ts',
    text: '`"${script}": "${EAS_HOOK_COMMAND}"`',
    reason:
      'The same package.json script line, shown whole in the refusal: EAS_HOOK_COMMAND is the script value above, not a command a person types.',
  },
];

/**
 * Files whose strings are source code for another tool, not messages a person reads: no string in
 * them names a command to type.
 */
const SOURCE_FOR_ANOTHER_TOOL: Array<{ file: string; reason: string }> = [
  {
    file: 'seams/gradleInitScript.ts',
    reason:
      "The Gradle init script the Android build runs, held as one string; its comments say 'Written by sherlo', which names no command.",
  },
];

/** Is this file one whose strings are another tool's source? */
function isSourceForAnotherTool(file: string): boolean {
  const relativeFile = path.relative(CLI_SRC, file);

  return SOURCE_FOR_ANOTHER_TOOL.some((exception) => exception.file === relativeFile);
}

/** Is this template, in this file, one of the named exceptions? */
function isUnprefixedOnPurpose(file: string, templateText: string): boolean {
  const relativeFile = path.relative(CLI_SRC, file);

  return UNPREFIXED_ON_PURPOSE.some(
    (exception) => exception.file === relativeFile && exception.text === templateText
  );
}

/** Every `.ts` file the tool ships: everything under src but the tests. */
function shippedSourceFiles(folder = CLI_SRC): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : shippedSourceFiles(entryPath);

    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [entryPath] : [];
  });
}

/**
 * Every piece of string text in a file, with its line: plain strings, and each literal part of a
 * template between its substitutions. Import paths are not text a person reads, and are left out.
 */
function stringsIn(file: string): Array<{ line: number; text: string }> {
  const pieces: Array<{ line: number; text: string }> = [];
  const sourceText = fs.readFileSync(file, 'utf8');
  const textOf = (node: babel.Node) => sourceText.slice(node.start ?? 0, node.end ?? 0);

  const keep = (node: babel.Node, text: string) => {
    pieces.push({ line: node.loc?.start.line ?? 0, text });
  };

  traverseFast(parseTypeScript(file).program, (node) => {
    if (isImportOrReExport(node)) return traverseFast.skip;

    if (node.type === 'StringLiteral' || node.type === 'DirectiveLiteral') keep(node, node.value);

    if (node.type === 'TemplateLiteral' && !isUnprefixedOnPurpose(file, textOf(node))) {
      for (const piece of node.quasis) keep(piece, piece.value.cooked ?? piece.value.raw);
    }
  });

  return pieces;
}

/** A file's syntax tree, read the way the compiler reads a `.ts` file. */
function parseTypeScript(file: string): babel.File {
  return parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['typescript'] });
}

/** `import ... from`, `export ... from` and `export { ... }`: module plumbing, not text. */
function isImportOrReExport(node: babel.Node): boolean {
  return (
    node.type === 'ImportDeclaration' ||
    node.type === 'ExportAllDeclaration' ||
    (node.type === 'ExportNamedDeclaration' && !node.declaration)
  );
}

/**
 * Does this text name a command as `sherlo <command>` - or end on `sherlo ` with the command
 * filled in after it - without the `npx ` a person types in front?
 */
function namesACommandWithoutNpx(text: string): boolean {
  const commandMentions = text.matchAll(/\bsherlo (?=[a-z]|$)/g);

  for (const mention of commandMentions) {
    const before = text.slice(0, mention.index);
    if (!before.endsWith('npx ')) return true;
  }

  return false;
}

/**
 * Every `${...COMMAND}` substitution in a file's templates that the text in front of it does not
 * end on `npx sherlo `, with its line.
 *
 * Not a mention, and not read: `FULL_INIT_COMMAND`, which is a whole command line already;
 * a `...SUBCOMMAND`, which follows its command; and a template that is only commands joined by
 * spaces, with at most one `<arg>` or `[arg]` - a commander registration (`${VIEW_COMMAND} [build]`)
 * or a command's name put together (`${PROJECT_COMMAND} ${PROJECT_CREATE_SUBCOMMAND}`).
 */
function commandSubstitutionsWithoutNpx(file: string): Array<{ line: number; text: string }> {
  const sourceText = fs.readFileSync(file, 'utf8');
  const textOf = (node: babel.Node) => sourceText.slice(node.start ?? 0, node.end ?? 0);
  const offenders: Array<{ line: number; text: string }> = [];

  traverseFast(parseTypeScript(file).program, (node) => {
    if (node.type !== 'TemplateLiteral' || node.expressions.length === 0) return;
    if (isOnlyACommandName(node)) return;
    if (isUnprefixedOnPurpose(file, textOf(node))) return;

    node.expressions.forEach((expression, index) => {
      const textInFront = node.quasis[index].value.cooked ?? '';
      const constantName = textOf(expression).split('.').pop() ?? '';
      const namesACommand =
        constantName.endsWith('COMMAND') &&
        !constantName.endsWith('SUBCOMMAND') &&
        constantName !== 'FULL_INIT_COMMAND';

      if (namesACommand && !textInFront.endsWith('npx sherlo ')) {
        offenders.push({ line: expression.loc?.start.line ?? 0, text: textOf(node) });
      }
    });
  });

  return offenders;
}

/** Is a template's own text only spaces, and at most one `<arg>` or `[arg]` placeholder? */
function isOnlyACommandName(template: babel.TemplateLiteral): boolean {
  const literalText = template.quasis
    .map((piece) => piece.value.cooked ?? '')
    .join('')
    .trim();

  return /^(<[^<>]*>|\[[^[\]]*\])?$/.test(literalText);
}

/** Text with its colour taken off. */
function plain(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}
