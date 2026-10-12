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
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { APP_DOMAIN, FULL_INIT_COMMAND, TEAM_OPTION } from '../../../constants';
import { getCwd, throwError } from '../../../helpers';
import { renderFailedStepLine, renderStepLine } from '../../../render/initSteps';
import { serverCalls } from '../../../seams/serverCalls';
import type { SavedLogin } from '../../../seams/savedLogins';
import hasConfigFile from '../config/hasConfigFile';
import readConfig from '../config/readConfig';
import { printLines } from '../helpers';
import { asConfigProject, type ProjectAddress } from '../project/projectAddress';
import refuseFailedServiceCall from '../project/refuseFailedServiceCall';

/** The project setup settled, as the config holds it, and its page in the web app. */
export type SettledProject = { projectId: string; projectPageUrl: string };

async function teamAndProject(
  person: SavedLogin,
  { teamFlag, projectFlag }: { teamFlag: string | undefined; projectFlag: string | undefined }
): Promise<SettledProject> {
  // `--project` is how the web app's setup line connects init to a project made there; it wins over
  // a config's, which it then replaces. Either is looked up, never made again.
  const existingProject = (projectFlag ? parseProject(projectFlag) : undefined) ?? (await readProjectFromConfig());
  if (existingProject) {
    await showProjectInConfig(existingProject, person);
    return settled(existingProject);
  }

  const teamId = await chooseTeam(person, teamFlag);
  const project = await createProject(teamId, person);

  return settled(project);
}

export default teamAndProject;

/* ========================================================================== */

/** The team and project a config already names, by name - refused when this person cannot reach them. */
async function showProjectInConfig(
  project: ProjectAddress,
  { token: personalToken }: SavedLogin
): Promise<void> {
  const { team, projects } = await serverCalls()
    .listProjects({ teamId: project.teamId, personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error));

  const projectInTeam = projects.find(({ index }) => index === project.projectIndex);
  if (!projectInTeam) {
    printLines(renderFailedStepLine('Finding the project failed'));
    throwError({
      message: `You have no access to the project ${asConfigProject(project)}`,
      below:
        '\n' +
        chalk.reset('Ask a member of its team to invite you, then re-run setup:\n') +
        chalk.cyan(`  ${FULL_INIT_COMMAND}`),
    });
  }

  printLines([
    renderStepLine({ outcome: 'done', name: 'Using team', detail: team.name }),
    renderStepLine({
      outcome: 'done',
      name: 'Using project',
      detail: projectInTeam.name,
    }),
  ]);
}

/** `--team`, the one team the person is in, or a new one named after them. */
async function chooseTeam(
  { token: personalToken }: SavedLogin,
  teamFlag: string | undefined
): Promise<string> {
  const { teams } = await serverCalls()
    .listTeams({ personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error));

  const namedTeam = teamFlag ? teams.find(({ id }) => id === teamFlag) : undefined;
  const onlyTeam = teams.length === 1 ? teams[0] : undefined;
  const team = namedTeam ?? (teamFlag ? undefined : onlyTeam);

  if (team) {
    printLines([renderStepLine({ outcome: 'done', name: 'Using team', detail: team.name })]);
    return team.id;
  }

  if (teamFlag || teams.length > 1) {
    printLines(renderFailedStepLine('Choosing a team failed'));
    throwError({
      message: teamFlag
        ? `You are not in a team with the id ${teamFlag}`
        : `You are in ${teams.length} teams, so setup cannot choose one for you`,
      below:
        '\n' +
        teams.map(({ id, name }) => `  ${name.padEnd(24)} ${chalk.dim(id)}`).join('\n') +
        '\n\n' +
        chalk.reset('Re-run setup with the team to use:\n') +
        chalk.cyan(`  ${FULL_INIT_COMMAND} --${TEAM_OPTION} <id>`),
    });
  }

  const { name } = await serverCalls()
    .whoAmI({ personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error));

  const newTeam = await serverCalls()
    .createTeam({ name: teamNameFor(name), personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error));

  printLines([renderStepLine({ outcome: 'done', name: 'Created team', detail: newTeam.name })]);
  return newTeam.id;
}

/** A new project in the team, named after the app. */
async function createProject(
  teamId: string,
  { token: personalToken }: SavedLogin
): Promise<ProjectAddress> {
  const newProject = await serverCalls()
    .createProject({ name: appName(), teamId, personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error));

  const project = { teamId, projectIndex: newProject.index };

  // Names only, for the team and the project alike: their ids are the config's business, and a
  // person reads names. The project token the service hands back is never printed: a token for CI
  // is made in the web app, where the next steps point.
  printLines([renderStepLine({ outcome: 'done', name: 'Created project', detail: newProject.name })]);

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

function settled(project: ProjectAddress): SettledProject {
  return {
    projectId: asConfigProject(project),
    projectPageUrl: `${APP_DOMAIN}/project?t=${project.teamId}&p=${project.projectIndex}`,
  };
}
