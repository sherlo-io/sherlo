/**
 * STEPS 3 AND 4 - WHICH TEAM AND PROJECT THIS APP BELONGS TO, with no question asked.
 *
 *   - A config that already names a project keeps it, and nothing is asked of the service.
 *   - Otherwise the team is the one the person owns. A person owns at most one (the service refuses
 *     a second), so there is never a choice to make. A person who owns none gets one, named after
 *     them: "Dawid's team".
 *   - The project is made in that team, named after the app.
 *
 * OPEN DECISION (talk): a person who owns no team but is a member of a coworker's. This draft makes
 * them their own team.
 */
import path from 'path';
import fs from 'fs';
import { APP_DOMAIN } from '../../../constants';
import { getCwd } from '../../../helpers';
import { renderStepLine } from '../../../render/initSteps';
import { serverCalls } from '../../../seams/serverCalls';
import type { ResolvedPersonalToken } from '../../shared/resolvePersonalToken';
import hasConfigFile from '../config/hasConfigFile';
import readConfig from '../config/readConfig';
import { printLines } from '../helpers';
import { asConfigProject, type ProjectAddress } from '../project/projectAddress';
import refuseFailedServiceCall from '../project/refuseFailedServiceCall';

/** The project setup settled, as the config holds it, and its page in the web app. */
export type SettledProject = { projectId: string; projectPageUrl: string };

async function teamAndProject(person: ResolvedPersonalToken): Promise<SettledProject> {
  const projectInConfig = await readProjectFromConfig();
  if (projectInConfig) {
    printLines([
      renderStepLine({ outcome: 'already', name: 'Project', detail: asConfigProject(projectInConfig) }),
    ]);
    return settled(projectInConfig);
  }

  const teamId = await findOrCreateTeam(person);
  const project = await createProject(teamId, person);

  return settled(project);
}

export default teamAndProject;

/* ========================================================================== */

/** The team the person owns, or a new one named after them. */
async function findOrCreateTeam({ personalToken, fromSavedLogin }: ResolvedPersonalToken): Promise<string> {
  const { teams } = await serverCalls()
    .listTeams({ personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error, { fromSavedLogin }));

  const ownTeam = teams.find((team) => team.role === 'owner');
  if (ownTeam) {
    printLines([renderStepLine({ outcome: 'done', name: 'Using team', detail: ownTeam.name })]);
    return ownTeam.id;
  }

  const { name } = await serverCalls()
    .whoAmI({ personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error, { fromSavedLogin }));

  const newTeam = await serverCalls()
    .createTeam({ name: teamNameFor(name), personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error, { fromSavedLogin }));

  printLines([renderStepLine({ outcome: 'done', name: 'Created team', detail: newTeam.name })]);
  return newTeam.id;
}

/** A new project in the team, named after the app. */
async function createProject(
  teamId: string,
  { personalToken, fromSavedLogin }: ResolvedPersonalToken
): Promise<ProjectAddress> {
  const newProject = await serverCalls()
    .createProject({ name: appName(), teamId, personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error, { fromSavedLogin }));

  const project = { teamId, projectIndex: newProject.index };

  // The project token the service hands back is never printed: a token for CI is made in the web
  // app, where the next steps point.
  printLines([
    renderStepLine({
      outcome: 'done',
      name: 'Created project',
      detail: `${newProject.name} (${asConfigProject(project)})`,
    }),
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
  if (typeof project !== 'string') return undefined;

  const [teamId, projectIndex] = project.split('/');
  return teamId && projectIndex ? { teamId, projectIndex: Number(projectIndex) } : undefined;
}

function settled(project: ProjectAddress): SettledProject {
  return {
    projectId: asConfigProject(project),
    projectPageUrl: `${APP_DOMAIN}/project?t=${project.teamId}&p=${project.projectIndex}`,
  };
}
