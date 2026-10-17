/**
 * THE CREDENTIAL A PUSH SPENDS, AND THE PROJECT IT GOES TO.
 *
 * Each case states the whole world the resolver reads - the settings, the config, the logins
 * saved on this computer and the server's answers - through the same seams a posed run uses, so
 * nothing on the machine running this suite (a SHERLO_TOKEN of its own, a real saved login) can
 * answer for it.
 */
import { PROJECT_API_TOKEN_LENGTH } from '@sherlo/shared';
import { describe, expect, it } from 'vitest';
import { TEST_COMMAND, TEST_EAS_CLOUD_BUILD_COMMAND, VIEW_COMMAND } from '../../../../constants';
import { installSavedLogins, PosedLogins, posedSavedLogins } from '../../../../seams/savedLogins';
import {
  installServerCalls,
  posedServerCalls,
  PosedServerCalls,
  ScriptedCall,
} from '../../../../seams/serverCalls';
import { installSurroundings, posedSurroundings } from '../../../../seams/surroundings';
import { InvalidatedConfig, PushCredential } from '../../../../types';
import resolvePushCredential from '../resolvePushCredential';

const SERVICE_ADDRESS = 'https://api.sherlo.io/graphql';

/** The project every project token below names, and the config's `project` that agrees with it. */
const TEAM_ID = 'k3j9x2ab';
const PROJECT_INDEX = 4;
const CONFIG_PROJECT = `${TEAM_ID}/${PROJECT_INDEX}`;

/** A project token of the real layout, told apart from the others by its api part. */
function projectToken(apiCharacter: string, teamId = TEAM_ID, projectIndex = PROJECT_INDEX) {
  return `${apiCharacter.repeat(PROJECT_API_TOKEN_LENGTH)}${teamId}${projectIndex}`;
}

const TOKEN_IN_SHERLO_TOKEN = projectToken('b');
const SAVED_LOGIN_TOKEN = 'sht_savedlogintoken0000000000000000';

/** Everything the resolver reads. Unstated means absent. */
type World = {
  command?: string;
  env?: Record<string, string>;
  config?: Record<string, unknown>;
  /** The command line's options; `token` is the Sherlo 2 `--token`. */
  options?: { token?: string };
  loggedIn?: boolean;
  /** The server the resolver may ask; unstated, it answers nothing. */
  server?: PosedServerCalls;
};

/** Resolve the credential in a world, with the settings, saved logins and server it states. */
async function resolveIn(world: World): Promise<PushCredential> {
  const surroundings = posedSurroundings({
    env: { SHERLO_API_URL: SERVICE_ADDRESS, ...world.env },
    git: 'none',
  });
  const logins: PosedLogins = world.loggedIn
    ? { [SERVICE_ADDRESS]: { email: 'anna@example.com', token: SAVED_LOGIN_TOKEN } }
    : {};

  const uninstall = [
    installSavedLogins(posedSavedLogins(logins)),
    installServerCalls(world.server ?? posedServerCalls([])),
    installSurroundings(surroundings),
    surroundings.installSettings(),
  ];

  try {
    return await resolvePushCredential(
      world.command ?? TEST_COMMAND,
      (world.config ?? {}) as InvalidatedConfig,
      world.options
    );
  } finally {
    for (const undo of uninstall.reverse()) undo();
  }
}

/** The refusal a world ends in. */
async function refusalIn(world: World): Promise<string> {
  try {
    await resolveIn(world);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('the resolver answered a credential instead of refusing');
}

describe('which credential a push spends', () => {
  it('spends SHERLO_TOKEN before the saved login', async () => {
    // Both at once, then the project token taken away: the one left is the one spent.
    const bothCredentials: Required<Omit<World, 'command' | 'options' | 'server'>> = {
      env: { SHERLO_TOKEN: TOKEN_IN_SHERLO_TOKEN },
      config: { project: CONFIG_PROJECT },
      loggedIn: true,
    };

    expect(await resolveIn(bothCredentials)).toEqual({
      kind: 'projectToken',
      token: TOKEN_IN_SHERLO_TOKEN,
      apiToken: 'b'.repeat(PROJECT_API_TOKEN_LENGTH),
      teamId: TEAM_ID,
      projectIndex: PROJECT_INDEX,
    });

    const withOnlyTheLogin = { ...bothCredentials, env: {} };
    expect(await resolveIn(withOnlyTheLogin)).toEqual({
      kind: 'person',
      token: SAVED_LOGIN_TOKEN,
      teamId: TEAM_ID,
      projectIndex: PROJECT_INDEX,
    });
  });

  it('treats an empty SHERLO_TOKEN as unset', async () => {
    // GitHub turns a missing secret into an empty string: that job gets the refusal for no
    // credential, never the refusal of a blank token.
    for (const blank of ['', '   ']) {
      const refusal = await refusalIn({ env: { SHERLO_TOKEN: blank } });

      expect(refusal).toContain('No token or login found to run the test with.');
      expect(refusal).not.toContain('Invalid SHERLO_TOKEN value');

      // And the login, next in line, is spent instead of it.
      const credential = await resolveIn({
        env: { SHERLO_TOKEN: blank },
        config: { project: CONFIG_PROJECT },
        loggedIn: true,
      });
      expect(credential.token).toBe(SAVED_LOGIN_TOKEN);
    }
  });
});

describe('what is refused about the credential', () => {
  it('refuses a personal token in SHERLO_TOKEN by name', async () => {
    const personalToken = 'sht_putinthewrongvariable0000000000';
    const refusal = await refusalIn({ env: { SHERLO_TOKEN: personalToken } });

    expect(refusal).toContain(
      'ERROR: SHERLO_TOKEN wants a project token, and this is a personal token.'
    );
    expect(refusal).toContain('To act as yourself, run `npx sherlo login` instead.');
    expect(refusal).not.toContain('SHERLO_PERSONAL_TOKEN');
    expect(refusal).not.toContain(personalToken);
  });

  it('refuses --token on sherlo test and sherlo view before anything runs, naming SHERLO_TOKEN and sherlo login', async () => {
    for (const command of [TEST_COMMAND, VIEW_COMMAND]) {
      const refusal = await refusalIn({
        command,
        options: { token: TOKEN_IN_SHERLO_TOKEN },
        env: { SHERLO_TOKEN: projectToken('c') },
        config: { project: CONFIG_PROJECT },
        loggedIn: true,
      });

      expect(refusal).toContain(`\`npx sherlo ${command}\` no longer takes a token in \`--token\``);
      expect(refusal).toContain('SHERLO_TOKEN');
      expect(refusal).toContain('`npx sherlo login`');
      expect(refusal).not.toContain(TOKEN_IN_SHERLO_TOKEN);
    }
  });

  it('refuses a token in sherlo.config.json with the same words as --token, whatever it holds', async () => {
    const wordsOfTheFlag = await refusalIn({ options: { token: 'anything' } });

    for (const token of [TOKEN_IN_SHERLO_TOKEN, '', 0, null, { a: 1 }]) {
      expect(await refusalIn({ config: { project: CONFIG_PROJECT, token }, loggedIn: true })).toBe(
        wordsOfTheFlag
      );
    }
  });

  it('refuses a push with no credential at all, naming sherlo login and SHERLO_TOKEN', async () => {
    expect(await refusalIn({ config: { project: CONFIG_PROJECT } })).toContain(
      'ERROR: No token or login found to run the test with.\n' +
        '  On your own computer, run `npx sherlo login`.\n' +
        '  In CI, set the project token as SHERLO_TOKEN.'
    );
  });

  it("refuses a person's credential on the EAS road by name, naming SHERLO_TOKEN", async () => {
    const onTheLogin = await refusalIn({
      command: TEST_EAS_CLOUD_BUILD_COMMAND,
      config: { project: CONFIG_PROJECT },
      loggedIn: true,
    });
    expect(onTheLogin).toContain(
      '`npx sherlo test:eas-cloud-build` takes a project token only, and found your login.'
    );
    expect(onTheLogin).toContain('Set the project token as SHERLO_TOKEN.');
    expect(onTheLogin).not.toContain(SAVED_LOGIN_TOKEN);

    // A project token still opens the EAS road.
    const credential = await resolveIn({
      command: TEST_EAS_CLOUD_BUILD_COMMAND,
      env: { SHERLO_TOKEN: TOKEN_IN_SHERLO_TOKEN },
    });
    expect(credential.kind).toBe('projectToken');
  });
});

describe('which project a push goes to', () => {
  it("refuses a push on a person's credential when the config names no project, naming sherlo init", async () => {
    const refusal = await refusalIn({ loggedIn: true });

    expect(refusal).toContain(
      'ERROR: sherlo.config.json names no project, so your login has no project to test against.'
    );
    expect(refusal).toContain('Run `npx sherlo init` to choose one.');
  });

  it('refuses a config project that is not a team id, a slash and a project number', async () => {
    const malformedProjects: unknown[] = [
      'k3j9x2ab',
      'k3j9x2ab/',
      'k3j9x2ab/0',
      'k3j9x2ab/-4',
      'k3j9x2ab/4.5',
      'k3j9/4',
      'k3j9x2abc/4',
      'k3j9x2ab/4/1',
      4,
    ];

    for (const project of malformedProjects) {
      // On a person's credential, where the project decides where the push goes...
      const onTheLogin = await refusalIn({ loggedIn: true, config: { project } });
      expect(onTheLogin, JSON.stringify(project)).toContain(
        'which is not a team id, a slash and a project number.'
      );
      expect(onTheLogin, JSON.stringify(project)).toContain(
        'It looks like `k3j9x2ab/4`. Run `npx sherlo init` to write it.'
      );

      // ...and on a project token, where it is checked against the token.
      const onAProjectToken = await refusalIn({
        env: { SHERLO_TOKEN: TOKEN_IN_SHERLO_TOKEN },
        config: { project },
      });
      expect(onAProjectToken, JSON.stringify(project)).toContain(
        'which is not a team id, a slash and a project number.'
      );
    }

    expect(await refusalIn({ loggedIn: true, config: { project: 'k3j9x2ab' } })).toContain(
      'The `project` in sherlo.config.json is `k3j9x2ab`,'
    );
  });

  it("refuses a project token whose team or project differs from the config's project", async () => {
    const otherProject = projectToken('d', TEAM_ID, 5);
    const otherTeam = projectToken('e', 'zzzzzzzz', PROJECT_INDEX);

    for (const token of [otherProject, otherTeam]) {
      const refusal = await refusalIn({
        env: { SHERLO_TOKEN: token },
        config: { project: CONFIG_PROJECT },
      });

      expect(refusal).toContain(
        'ERROR: SHERLO_TOKEN names a different project than `project` in sherlo.config.json.'
      );
      expect(refusal).toContain('This push would land in a project the config does not name.');
      expect(refusal).not.toContain(token);
    }

    // A token and a config that agree push to the project both name.
    const agreeing = await resolveIn({
      env: { SHERLO_TOKEN: TOKEN_IN_SHERLO_TOKEN },
      config: { project: CONFIG_PROJECT },
    });
    expect(agreeing).toMatchObject({ teamId: TEAM_ID, projectIndex: PROJECT_INDEX });
  });
});

describe('signing in through GitHub', () => {
  const REPOSITORY = 'acme-mobile/shop-app';
  const GITHUB_SESSION = 'sgh_thesessiontheservicetradedfortheidtoken';

  /** A GitHub Actions job granted `id-token: write`, with a config naming the project. */
  const JOB_WITH_THE_PERMISSION: World = {
    env: {
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: REPOSITORY,
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token-requests.example.com/job?version=2',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'job-request-token',
    },
    config: { project: CONFIG_PROJECT },
  };

  const SIGNS_IN: ScriptedCall = {
    call: 'tradeGitHubIdToken',
    with: { repository: REPOSITORY, teamId: TEAM_ID },
    answer: { status: 'signed-in', token: GITHUB_SESSION },
  };

  it("on GitHub Actions with no SHERLO_TOKEN the push spends the session traded for the job's ID token", async () => {
    const server = posedServerCalls([SIGNS_IN]);

    const credential = await resolveIn({ ...JOB_WITH_THE_PERMISSION, server });

    expect(credential).toEqual({
      kind: 'github-session',
      token: GITHUB_SESSION,
      teamId: TEAM_ID,
      projectIndex: PROJECT_INDEX,
      repository: REPOSITORY,
    });
  });

  it("a SHERLO_TOKEN wins over GitHub's ID token", async () => {
    const server = posedServerCalls([SIGNS_IN]);

    const credential = await resolveIn({
      ...JOB_WITH_THE_PERMISSION,
      env: { ...JOB_WITH_THE_PERMISSION.env, SHERLO_TOKEN: TOKEN_IN_SHERLO_TOKEN },
      server,
    });

    expect(credential.kind).toBe('projectToken');
    expect(server.unusedCalls()).toEqual([SIGNS_IN]);
  });

  it('a job without the id-token permission is refused naming it and SHERLO_TOKEN', async () => {
    const withoutThePermission = {
      ...JOB_WITH_THE_PERMISSION.env,
      ACTIONS_ID_TOKEN_REQUEST_URL: '',
    };

    const refusal = await refusalIn({ ...JOB_WITH_THE_PERMISSION, env: withoutThePermission });

    expect(refusal).toContain('add `permissions: id-token: write` to it');
    expect(refusal).toContain('Or set the project token as SHERLO_TOKEN.');
  });

  it('a repository not connected to the team is refused naming both', async () => {
    const server = posedServerCalls([
      { ...SIGNS_IN, answer: { status: 'not-connected', teamName: 'Acme Mobile' } },
    ]);

    const refusal = await refusalIn({ ...JOB_WITH_THE_PERMISSION, server });

    expect(refusal).toContain(`${REPOSITORY} is not connected to the team Acme Mobile.`);
    expect(refusal).toContain('Or set the project token as SHERLO_TOKEN.');
  });

  it('a run trades the ID token once, however many calls it makes', async () => {
    // The script holds one trade and two status reads, so a second trade would be refused as a call
    // the pose never scripted, in the middle of the reads.
    const statusRead: ScriptedCall = {
      call: 'getBuildStatus',
      with: { buildIndex: 1 },
      answer: null,
    };
    const server = posedServerCalls([SIGNS_IN, statusRead, statusRead]);

    const credential = await resolveIn({ ...JOB_WITH_THE_PERMISSION, server });
    const { token, projectIndex, teamId } = credential;
    await server.getBuildStatus({ token, buildIndex: 1, projectIndex, teamId });
    await server.getBuildStatus({ token, buildIndex: 1, projectIndex, teamId });

    expect(credential.token).toBe(GITHUB_SESSION);
    expect(server.unusedCalls()).toEqual([]);
    expect(server.refusals()).toEqual([]);
  });
});
