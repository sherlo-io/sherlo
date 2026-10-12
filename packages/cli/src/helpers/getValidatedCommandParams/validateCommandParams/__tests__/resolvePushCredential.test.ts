/**
 * THE CREDENTIAL A PUSH SPENDS, AND THE PROJECT IT GOES TO (sherlo / The credential and the
 * project of a push).
 *
 * Each case states the whole world the resolver reads - the flags, the settings, the config and the
 * logins saved on this computer - through the same seams a posed run uses, so nothing on the
 * machine running this suite (a SHERLO_TOKEN of its own, a real saved login) can answer for it.
 */
import { PROJECT_API_TOKEN_LENGTH } from '@sherlo/shared';
import { describe, expect, it } from 'vitest';
import { TEST_COMMAND, TEST_EAS_CLOUD_BUILD_COMMAND, TOKEN_OPTION } from '../../../../constants';
import { installSavedLogins, PosedLogins, posedSavedLogins } from '../../../../seams/savedLogins';
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

const TOKEN_ON_THE_FLAG = projectToken('a');
const TOKEN_IN_SHERLO_TOKEN = projectToken('b');
const TOKEN_IN_THE_CONFIG = projectToken('c');
const SAVED_LOGIN_TOKEN = 'sht_savedlogintoken0000000000000000';

/** Everything the resolver reads. Unstated means absent. */
type World = {
  command?: string;
  flags?: { [TOKEN_OPTION]?: string };
  env?: Record<string, string>;
  config?: Record<string, unknown>;
  loggedIn?: boolean;
};

/** Resolve the credential in a world, with the settings and the saved logins it states. */
function resolveIn(world: World): PushCredential {
  const surroundings = posedSurroundings({
    env: { SHERLO_API_URL: SERVICE_ADDRESS, ...world.env },
    git: 'none',
  });
  const logins: PosedLogins = world.loggedIn
    ? { [SERVICE_ADDRESS]: { email: 'anna@example.com', token: SAVED_LOGIN_TOKEN } }
    : {};

  const uninstall = [
    installSavedLogins(posedSavedLogins(logins)),
    installSurroundings(surroundings),
    surroundings.installSettings(),
  ];

  try {
    return resolvePushCredential(
      world.command ?? TEST_COMMAND,
      world.flags ?? {},
      (world.config ?? {}) as InvalidatedConfig
    );
  } finally {
    for (const undo of uninstall.reverse()) undo();
  }
}

/** The refusal a world ends in. */
function refusalIn(world: World): string {
  try {
    resolveIn(world);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('the resolver answered a credential instead of refusing');
}

describe('which credential a push spends', () => {
  it('spends the first of --token, SHERLO_TOKEN, the config token and the saved login', () => {
    // All four at once, then each taken away in turn: the first one left is the one spent.
    const everyCredential: Required<Omit<World, 'command'>> = {
      flags: { [TOKEN_OPTION]: TOKEN_ON_THE_FLAG },
      env: { SHERLO_TOKEN: TOKEN_IN_SHERLO_TOKEN },
      config: { token: TOKEN_IN_THE_CONFIG, project: CONFIG_PROJECT },
      loggedIn: true,
    };

    expect(resolveIn(everyCredential)).toEqual({
      kind: 'projectToken',
      token: TOKEN_ON_THE_FLAG,
      apiToken: 'a'.repeat(PROJECT_API_TOKEN_LENGTH),
      teamId: TEAM_ID,
      projectIndex: PROJECT_INDEX,
      fromSavedLogin: false,
    });

    const withoutTokenFlag = { ...everyCredential, flags: {} };
    expect(resolveIn(withoutTokenFlag).token).toBe(TOKEN_IN_SHERLO_TOKEN);

    const withoutSherloToken = { ...withoutTokenFlag, env: {} };
    expect(resolveIn(withoutSherloToken).token).toBe(TOKEN_IN_THE_CONFIG);

    const withOnlyTheLogin = { ...withoutSherloToken, config: { project: CONFIG_PROJECT } };
    expect(resolveIn(withOnlyTheLogin)).toEqual({
      kind: 'person',
      token: SAVED_LOGIN_TOKEN,
      teamId: TEAM_ID,
      projectIndex: PROJECT_INDEX,
      fromSavedLogin: true,
    });
  });

  it('treats an empty SHERLO_TOKEN as unset', () => {
    // GitHub turns a missing secret into an empty string: that job gets the refusal for no
    // credential, never the refusal of a blank token.
    for (const blank of ['', '   ']) {
      const refusal = refusalIn({ env: { SHERLO_TOKEN: blank } });

      expect(refusal).toContain('There is no credential to push with.');
      expect(refusal).not.toContain('Invalid `token` value');

      // And the next credential in line is spent instead of it.
      const credential = resolveIn({
        env: { SHERLO_TOKEN: blank },
        config: { token: TOKEN_IN_THE_CONFIG },
      });
      expect(credential.token).toBe(TOKEN_IN_THE_CONFIG);
    }
  });
});

describe('what is refused about the credential', () => {
  it('refuses a personal token in SHERLO_TOKEN by name, as on --token', () => {
    const personalToken = 'sht_putinthewrongvariable0000000000';
    const refusal = refusalIn({ env: { SHERLO_TOKEN: personalToken } });

    expect(refusal).toContain(
      'AUTH ERROR: SHERLO_TOKEN wants a project token, and this is a personal token.'
    );
    expect(refusal).toContain('To act as yourself, run `npx sherlo login` instead.');
    expect(refusal).not.toContain('SHERLO_PERSONAL_TOKEN');
    expect(refusal).not.toContain(personalToken);

    // The same mistake on `--token` gets the same kind of refusal.
    const onTheFlag = refusalIn({ flags: { [TOKEN_OPTION]: personalToken } });
    expect(onTheFlag).toContain('`--token` wants a project token, and this is a personal token.');
    expect(onTheFlag).not.toContain(personalToken);
  });

  it('refuses a push with no credential at all, naming sherlo login and SHERLO_TOKEN', () => {
    expect(refusalIn({ config: { project: CONFIG_PROJECT } })).toContain(
      'AUTH ERROR: There is no credential to push with.\n' +
        '  On your own computer, run `npx sherlo login`.\n' +
        '  In CI, set the project token as SHERLO_TOKEN.'
    );
  });

  it("refuses a person's credential on the EAS road by name, naming SHERLO_TOKEN", () => {
    const onTheLogin = refusalIn({
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
    const credential = resolveIn({
      command: TEST_EAS_CLOUD_BUILD_COMMAND,
      env: { SHERLO_TOKEN: TOKEN_IN_SHERLO_TOKEN },
    });
    expect(credential.kind).toBe('projectToken');
  });
});

describe('which project a push goes to', () => {
  it("refuses a push on a person's credential when the config names no project, naming sherlo init", () => {
    const refusal = refusalIn({ loggedIn: true });

    expect(refusal).toContain(
      'ERROR: sherlo.config.json names no project, so your login has nowhere to push.'
    );
    expect(refusal).toContain('Run `npx sherlo init` to choose one.');
  });

  it('refuses a config project that is not a team id, a slash and a project number', () => {
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
      const onTheLogin = refusalIn({ loggedIn: true, config: { project } });
      expect(onTheLogin, JSON.stringify(project)).toContain(
        'which is not a team id, a slash and a project number.'
      );
      expect(onTheLogin, JSON.stringify(project)).toContain(
        'It looks like `k3j9x2ab/4`. Run `npx sherlo init` to write it.'
      );

      // ...and on a project token, where it is checked against the token.
      const onAProjectToken = refusalIn({
        env: { SHERLO_TOKEN: TOKEN_IN_SHERLO_TOKEN },
        config: { project },
      });
      expect(onAProjectToken, JSON.stringify(project)).toContain(
        'which is not a team id, a slash and a project number.'
      );
    }

    expect(refusalIn({ loggedIn: true, config: { project: 'k3j9x2ab' } })).toContain(
      'The `project` in sherlo.config.json is `k3j9x2ab`,'
    );
  });

  it("refuses a project token whose team or project differs from the config's project", () => {
    const otherProject = projectToken('d', TEAM_ID, 5);
    const otherTeam = projectToken('e', 'zzzzzzzz', PROJECT_INDEX);

    for (const token of [otherProject, otherTeam]) {
      const refusal = refusalIn({
        env: { SHERLO_TOKEN: token },
        config: { project: CONFIG_PROJECT },
      });

      expect(refusal).toContain(
        'AUTH ERROR: SHERLO_TOKEN or `--token` names a different project than `project` in sherlo.config.json.'
      );
      expect(refusal).toContain('This push would land in a project the config does not name.');
      expect(refusal).not.toContain(token);
    }

    // A token and a config that agree push to the project both name.
    const agreeing = resolveIn({
      env: { SHERLO_TOKEN: TOKEN_IN_SHERLO_TOKEN },
      config: { project: CONFIG_PROJECT },
    });
    expect(agreeing).toMatchObject({ teamId: TEAM_ID, projectIndex: PROJECT_INDEX });
  });
});
