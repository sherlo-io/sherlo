/**
 * A REFUSED SAVED LOGIN.
 *
 * The four management commands spend the saved login alone, so a token the service refused is a
 * refused login, and the answer is to log in again. Each command is called straight, on posed
 * seams, with a service that refuses every token the way the real request does.
 */
import { describe, expect, it } from 'vitest';
import { NAME_OPTION, TEAM_OPTION } from '../../../constants';
import { installSavedLogins, posedSavedLogins } from '../../../seams/savedLogins';
import { installServerCalls, posedServerCalls } from '../../../seams/serverCalls';
import { installSurroundings, posedSurroundings } from '../../../seams/surroundings';
import projectCreate from '../../projectCreate/projectCreate';
import { CreateProjectAuthError } from '../../projectCreate/createProjectRequest';
import projectList from '../../projectList/projectList';
import { ListProjectsAuthError } from '../../projectList/listProjectsRequest';
import teamCreate from '../../teamCreate/teamCreate';
import { CreateTeamAuthError } from '../../teamCreate/createTeamRequest';
import teamList from '../../teamList/teamList';
import { ListTeamsAuthError } from '../../teamList/listTeamsRequest';
import handleClientError from '../../../helpers/handleClientError';
import { checkGate } from '../../test/askTheStagedGate';
import refuseRejectedLogin from '../refuseRejectedLogin';

const SERVICE_ADDRESS = 'https://api.sherlo.io/graphql';
const SAVED_LOGIN = { email: 'anna@example.com', token: 'sht_savedlogintoken0000000000000000' };

/** Each management command, run on the saved login. */
const MANAGEMENT_COMMANDS: Array<{ name: string; run: () => Promise<void> }> = [
  { name: 'team create', run: () => teamCreate({ [NAME_OPTION]: 'Acme' }) },
  { name: 'team list', run: () => teamList() },
  {
    name: 'project create',
    run: () => projectCreate({ [NAME_OPTION]: 'Storefront', [TEAM_OPTION]: 'tm000001' }),
  },
  { name: 'project list', run: () => projectList({ [TEAM_OPTION]: 'tm000001' }) },
];

describe('a refused saved login', () => {
  it('answers a refused login by naming sherlo login', async () => {
    expect(() => refuseRejectedLogin()).toThrow(/ERROR: .*\n.*\n.*Run `npx sherlo login`/);

    for (const command of MANAGEMENT_COMMANDS) {
      const refusal = await refusalOf(command.run);

      expect(refusal, command.name).toContain(
        'Sherlo no longer accepts the login saved on this computer.'
      );
      expect(refusal, command.name).toContain('Run `npx sherlo login` to log in again.');
    }
  });
});

describe('a push the service answered with a 401', () => {
  const REFUSED = { networkError: { statusCode: 401 } };

  /**
   * What the push ends with when the saved login's request is refused with a 401 and `listTeams`
   * answers as the login's teams (`listed`) or refuses as a dead login does (`refused`).
   */
  async function refusalWhileTeamsAre(
    teams: 'listed' | 'refused',
    run: () => Promise<unknown>
  ): Promise<string> {
    const surroundings = posedSurroundings({
      env: { SKIP_INTRO: 'true', SHERLO_API_URL: SERVICE_ADDRESS },
      git: 'none',
    });
    const uninstall = [
      installServerCalls({
        ...posedServerCalls([]),
        // The staged gate refuses the login's request with the 401 the authorizer answers.
        checkStagedGate: async () => {
          throw REFUSED;
        },
        listTeams: async () => {
          if (teams === 'refused') throw new ListTeamsAuthError('HTTP 401');
          return { teams: [] };
        },
      }),
      installSavedLogins(posedSavedLogins({ [SERVICE_ADDRESS]: SAVED_LOGIN })),
      installSurroundings(surroundings),
      surroundings.installSettings(),
    ];

    try {
      await run();
      throw new Error('the push ended without a refusal');
    } catch (error) {
      return (error as Error).message;
    } finally {
      for (const undo of uninstall.reverse()) undo();
    }
  }

  const askTheGate = () =>
    checkGate({
      token: SAVED_LOGIN.token,
      platformsToTest: ['android'],
      baseFingerprints: { android: 'abc' },
      buildSettings: {} as never,
      gateMetadata: () => ({ derivedFrom: 'none' }),
      projectIndex: 7,
      teamId: 'tm000001',
    });

  it('a token that still lists its teams but not this project is told the project is wrong, not to log in again', async () => {
    const told = await refusalWhileTeamsAre('listed', () =>
      handleClientError(REFUSED, SAVED_LOGIN.token)
    );

    expect(told).toContain('This project is not in your teams.');
    expect(told).not.toContain('npx sherlo login');
  });

  it('a refusal at the staged gate of a login whose teams still list is told the project is wrong', async () => {
    const told = await refusalWhileTeamsAre('listed', askTheGate);

    expect(told).toContain('This project is not in your teams.');
    expect(told).not.toContain('npx sherlo login');
  });

  it('a token that lists no teams is told to log in again', async () => {
    const told = await refusalWhileTeamsAre('refused', () =>
      handleClientError(REFUSED, SAVED_LOGIN.token)
    );

    expect(told).toContain('Run `npx sherlo login` to log in again.');
  });
});

/* ========================================================================== */

/**
 * The refusal a command ends with, run where a login is saved and the service refuses every
 * token - with the error class the real request raises for a refused token.
 */
async function refusalOf(runCommand: () => Promise<void>): Promise<string> {
  const refusingServer = posedServerCalls([]);
  const surroundings = posedSurroundings({
    env: { SKIP_INTRO: 'true', SHERLO_API_URL: SERVICE_ADDRESS },
    git: 'none',
  });

  const uninstall = [
    installServerCalls({
      ...refusingServer,
      createTeam: async () => {
        throw new CreateTeamAuthError('HTTP 401');
      },
      listTeams: async () => {
        throw new ListTeamsAuthError('HTTP 401');
      },
      createProject: async () => {
        throw new CreateProjectAuthError('HTTP 401');
      },
      listProjects: async () => {
        throw new ListProjectsAuthError('HTTP 401');
      },
    }),
    installSavedLogins(posedSavedLogins({ [SERVICE_ADDRESS]: SAVED_LOGIN })),
    installSurroundings(surroundings),
    surroundings.installSettings(),
  ];

  try {
    await runCommand();
    throw new Error('the command ended without a refusal');
  } catch (error) {
    return (error as Error).message;
  } finally {
    for (const undo of uninstall.reverse()) undo();
  }
}
