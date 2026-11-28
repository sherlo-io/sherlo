/**
 * STEPS 3 AND 4 - WHICH TEAM AND PROJECT THIS APP BELONGS TO, with no question asked.
 *
 *   - A config that already names a project keeps it. Its team and project are looked up by name,
 *     which also checks early that this person can reach them (a teammate who cloned the repo).
 *   - Otherwise the team is `--team`, or the one team the person is in, or a new one named after
 *     them ("Anna's team") when they are in none. A person in several teams is stopped and told how
 *     to name one: a guess could put the project where its team cannot see it, and a rerun costs
 *     one command.
 *   - The project is made in that team, named after the app.
 */
import fs from 'fs';
import path from 'path';
import { getCwd, throwError } from '../../../helpers';
import getAppDomain from '../../../helpers/getAppDomain';
import {
  renderNoAccessToCreateProject,
  renderNoAccessToProject,
  renderNotInAnyTeam,
  renderTeamNotChosen,
} from '../../../render/initFixes';
import { renderFailedInitStepLine, renderInitStepLine } from '../../../render/initSteps';
import type { TeamFeatureFlags } from '../../../render/teamList';
import { serverCalls } from '../../../seams/serverCalls';
import type { SavedLogin } from '../../../seams/savedLogins';
import hasConfigFile from '../config/hasConfigFile';
import readConfig from '../config/readConfig';
import { printLines } from '../helpers';
import { asConfigProject, type ProjectAddress } from '../project/projectAddress';
import refuseFailedServiceCall, { whyRefused } from '../project/refuseFailedServiceCall';
import { TeamNotFoundError } from '../../projectList/listProjectsRequest';
import { ListTeamsAuthError } from '../../teamList/listTeamsRequest';
import { spendTheLogin, type Person } from './logIn';

/**
 * The project setup settled, as the config holds it, and its page in the web app. `listedFlags`
 * are its team's flags when setup listed the teams (a team it made has none on); undefined when
 * the project was looked up by name, which lists no team.
 */
export type SettledProject = {
  projectId: string;
  projectPageUrl: string;
  listedFlags?: TeamFeatureFlags;
  /** The login the service took for these calls: a saved one, or the one setup logged in again for. */
  personalToken: string;
};

async function teamAndProject(
  person: Person,
  { teamFlag, projectFlag }: { teamFlag: string | undefined; projectFlag: string | undefined }
): Promise<SettledProject> {
  // `--project` is how the web app's setup line connects init to a project made there; it wins over
  // a config's, which it then replaces. Either is looked up, never made again. A typed `--team` wins
  // over a config's project the same way: the project is made in that team, and replaces it.
  const flagProject = projectFlag ? parseProject(projectFlag) : undefined;
  const existingProject = flagProject ?? (teamFlag ? undefined : await readProjectFromConfig());
  if (existingProject) {
    const login = await showProjectInConfig(existingProject, person);
    return { ...settled(existingProject), personalToken: login.token };
  }

  // The first call of either path goes through `spendTheLogin`: a saved login the service refuses
  // is not a stop, setup logs in again and goes on with the new login.
  const { team, login } = await chooseTeam(person, teamFlag);
  const project = await createProject(team, login);

  return {
    ...settled(project),
    listedFlags: team.featureFlags ?? {},
    personalToken: login.token,
  };
}

export default teamAndProject;

/* ========================================================================== */

/**
 * The team and project a config already names, by name - refused when this person cannot reach them.
 * Answers the login the service took, so a later call spends that one, not the saved one it replaced.
 */
async function showProjectInConfig(project: ProjectAddress, person: Person): Promise<SavedLogin> {
  // A team the person is not in and a project its team does not hold are one answer: no access.
  // The service refuses a team out of reach the way it refuses a dead login, so the team list,
  // which names no team, tells the two apart.
  const { answer: teamProjects, login } = await spendTheLogin(
    person,
    ({ token }) =>
      serverCalls()
        .listProjects({ teamId: project.teamId, personalToken: token })
        .catch(async (error: Error) => {
          if (error instanceof TeamNotFoundError) return null;
          const refusal = await whyRefused(error, token);
          if (refusal === 'no-access') return null;
          // Already told apart: spendTheLogin reads this one as dead without asking again.
          if (refusal === 'dead-login') throw new ListTeamsAuthError(error.message);
          throw error;
        }),
    'finding-the-project'
  );
  const personalToken = login.token;

  const projectInTeam = teamProjects?.projects.find(({ index }) => index === project.projectIndex);
  if (!teamProjects || !projectInTeam) {
    // The account is named: a person signed in with another account fixes it by signing out.
    const { email } = await serverCalls()
      .whoAmI({ personalToken })
      .catch((error: Error) =>
        refuseFailedServiceCall(error, 'finding-the-project', personalToken)
      );

    printLines(renderFailedInitStepLine('finding-the-project'));
    return throwError(renderNoAccessToProject({ project: asConfigProject(project), email }));
  }
  const { team } = teamProjects;

  printLines([
    renderInitStepLine({ step: 'using-team', outcome: 'done', detail: team.name }),
    renderInitStepLine({ step: 'using-project', outcome: 'done', detail: projectInTeam.name }),
  ]);
  return login;
}

/** `--team`, the one team the person is in, or a new one named after them. */
async function chooseTeam(
  person: Person,
  teamFlag: string | undefined
): Promise<{
  team: { id: string; name: string; featureFlags?: TeamFeatureFlags };
  login: SavedLogin;
}> {
  const {
    answer: { teams },
    login,
  } = await spendTheLogin(
    person,
    ({ token }) => serverCalls().listTeams({ personalToken: token }),
    'choosing-a-team'
  );
  const personalToken = login.token;

  const namedTeam = teamFlag ? teams.find(({ id }) => id === teamFlag) : undefined;
  const onlyTeam = teams.length === 1 ? teams[0] : undefined;
  const team = namedTeam ?? (teamFlag ? undefined : onlyTeam);

  if (team) {
    printLines([renderInitStepLine({ step: 'using-team', outcome: 'done', detail: team.name })]);
    return { team, login };
  }

  // IN NO TEAM, A TEAM ID CAN'T BE RIGHT: there is no list to pick from, and setup without `--team`
  // makes the person's first team itself.
  if (teamFlag && teams.length === 0) {
    printLines(renderFailedInitStepLine('choosing-a-team'));
    throwError(renderNotInAnyTeam());
  }

  if (teamFlag || teams.length > 1) {
    printLines(renderFailedInitStepLine('choosing-a-team'));
    throwError(renderTeamNotChosen({ teamFlag, teams }));
  }

  const { name } = await serverCalls()
    .whoAmI({ personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error, 'creating-a-team', personalToken));

  const newTeam = await serverCalls()
    .createTeam({ name: teamNameFor(name), personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error, 'creating-a-team', personalToken));

  printLines([renderInitStepLine({ step: 'created-team', outcome: 'done', detail: newTeam.name })]);
  return { team: newTeam, login };
}

/**
 * A new project in the team, named after the app. A refusal while the login works is the person's
 * role in the team, named with the account it is for.
 */
async function createProject(
  team: { id: string; name: string },
  { token: personalToken }: SavedLogin
): Promise<ProjectAddress> {
  const newProject = await serverCalls()
    .createProject({ name: appName(), teamId: team.id, personalToken })
    .catch((error: Error) =>
      refuseFailedServiceCall(error, 'creating-the-project', personalToken, async () => {
        const { email } = await serverCalls()
          .whoAmI({ personalToken })
          .catch((whoAmIError: Error) =>
            refuseFailedServiceCall(whoAmIError, 'creating-the-project', null)
          );
        return renderNoAccessToCreateProject({ team: team.name, teamId: team.id, email });
      })
    );

  const project = { teamId: team.id, projectIndex: newProject.index };

  // Names only, for the team and the project alike: their ids are the config's business, and a
  // person reads names. The project token the service hands back is never printed: a token for CI
  // is made in the web app, where the next steps point.
  printLines([
    renderInitStepLine({ step: 'created-project', outcome: 'done', detail: newProject.name }),
  ]);

  return project;
}

/**
 * The team's name, from the person's: their first name and "'s team". The name is one string as
 * they signed up with it, so its first word stands for the first name.
 */
function teamNameFor(personName: string): string {
  const firstName = personName.trim().split(/\s+/)[0];

  return firstName ? `${firstName}'s team` : 'My team';
}

/**
 * The app's name as the project shows it, written as the project spells it: Expo's display name in
 * app.json, then the package name, then the folder's.
 *
 * BUILD DEBT: an app.config.js (code, not JSON) is read through Expo's own config reader.
 */
function appName(): string {
  const projectRoot = getCwd();

  const expoName = readJson(path.join(projectRoot, 'app.json'))?.expo?.name;
  if (typeof expoName === 'string' && expoName.trim()) return expoName.trim();

  const packageName = readJson(path.join(projectRoot, 'package.json'))?.name;
  if (typeof packageName === 'string' && packageName.trim()) return packageName.trim();

  return path.basename(projectRoot);
}

function readJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

/** The project a config already names, which a rerun keeps. */
async function readProjectFromConfig(): Promise<ProjectAddress | undefined> {
  if (!hasConfigFile()) return undefined;

  const { project } = await readConfig();
  return typeof project === 'string' ? parseProject(project) : undefined;
}

/**
 * `<teamId>/<projectIndex>`, as the config and `--project` write it.
 *
 * BUILD DEBT (init-for-agents): a malformed `--project` is refused by name, in the first step,
 * through the push's own reader (`parseConfigProject`).
 */
function parseProject(project: string): ProjectAddress | undefined {
  const [teamId, projectIndex] = project.split('/');
  return teamId && projectIndex ? { teamId, projectIndex: Number(projectIndex) } : undefined;
}

function settled(project: ProjectAddress): Omit<SettledProject, 'personalToken'> {
  return {
    projectId: asConfigProject(project),
    projectPageUrl: `${getAppDomain()}/project?t=${project.teamId}&p=${project.projectIndex}`,
  };
}
