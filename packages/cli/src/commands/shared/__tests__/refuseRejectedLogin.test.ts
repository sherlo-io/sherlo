/**
 * A REFUSED SAVED LOGIN (sherlo / Logging in from the terminal, "When does a login stop working?").
 *
 * The four management commands answer a token the service refused. When that token came from the
 * saved login, the answer is to log in again; a token somebody gave keeps the command's own
 * refusal. Each command is called straight, on posed seams, with a service that refuses every
 * token the way the real request does.
 */
import { describe, expect, it } from 'vitest';
import { NAME_OPTION, PERSONAL_TOKEN_OPTION, TEAM_OPTION } from '../../../constants';
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
import refuseRejectedLogin from '../refuseRejectedLogin';

const SERVICE_ADDRESS = 'https://api.sherlo.io/graphql';
const SAVED_LOGIN = { email: 'anna@example.com', token: 'sht_savedlogintoken0000000000000000' };
const GIVEN_TOKEN = 'sht_giventoken000000000000000000000';

/** Each management command, run with the personal token it is given (or none, to spend the login). */
const MANAGEMENT_COMMANDS: Array<{
  name: string;
  run: (personalToken: string | undefined) => Promise<void>;
}> = [
  {
    name: 'team create',
    run: (personalToken) =>
      teamCreate({ [NAME_OPTION]: 'Acme', [PERSONAL_TOKEN_OPTION]: personalToken }),
  },
  {
    name: 'team list',
    run: (personalToken) => teamList({ [PERSONAL_TOKEN_OPTION]: personalToken }),
  },
  {
    name: 'project create',
    run: (personalToken) =>
      projectCreate({
        [NAME_OPTION]: 'Storefront',
        [TEAM_OPTION]: 'tm000001',
        [PERSONAL_TOKEN_OPTION]: personalToken,
      }),
  },
  {
    name: 'project list',
    run: (personalToken) =>
      projectList({ [TEAM_OPTION]: 'tm000001', [PERSONAL_TOKEN_OPTION]: personalToken }),
  },
];

describe('a refused saved login', () => {
  it('answers a refused login by naming sherlo login', async () => {
    expect(() => refuseRejectedLogin()).toThrow(/AUTH ERROR: .*\n.*\n.*Run `sherlo login`/);

    for (const command of MANAGEMENT_COMMANDS) {
      const onTheLogin = await refusalOf(() => command.run(undefined));
      const onAGivenToken = await refusalOf(() => command.run(GIVEN_TOKEN));

      expect(onTheLogin, command.name).toContain(
        'Sherlo no longer accepts the login saved on this computer.'
      );
      expect(onTheLogin, command.name).toContain('Run `sherlo login` to log in again.');
      // A token somebody gave on purpose is not a login, and keeps the command's own refusal.
      expect(onAGivenToken, command.name).toContain('The API refused this personal token');
      expect(onAGivenToken, command.name).not.toContain('sherlo login');
    }
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
