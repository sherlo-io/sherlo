/**
 * A REFUSED SAVED LOGIN (sherlo / Logging in from the terminal, "When does a login stop working?").
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
    expect(() => refuseRejectedLogin()).toThrow(/AUTH ERROR: .*\n.*\n.*Run `npx sherlo login`/);

    for (const command of MANAGEMENT_COMMANDS) {
      const refusal = await refusalOf(command.run);

      expect(refusal, command.name).toContain(
        'Sherlo no longer accepts the login saved on this computer.'
      );
      expect(refusal, command.name).toContain('Run `npx sherlo login` to log in again.');
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
