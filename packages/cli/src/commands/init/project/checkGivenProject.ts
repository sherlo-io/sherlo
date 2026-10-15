/**
 * A `--project` IS CHECKED AGAINST THE PERSON'S OWN TEAMS AND PROJECTS before setup writes it: its
 * team must be one of theirs, and its number one of that team's projects. One they cannot reach is
 * refused, naming the project as they gave it.
 */
import { PROJECT_OPTION } from '../../../constants';
import { throwError } from '../../../helpers';
import type { SavedLogin } from '../../../seams/savedLogins';
import { serverCalls } from '../../../seams/serverCalls';
import type { ProjectAddress } from './projectAddress';
import refuseFailedServiceCall from './refuseFailedServiceCall';

async function checkGivenProject({
  givenProject,
  projectAsGiven,
  login,
}: {
  givenProject: ProjectAddress;
  projectAsGiven: string;
  login: SavedLogin;
}): Promise<void> {
  const { teams } = await serverCalls()
    .listTeams({ personalToken: login.token })
    .catch(refuseFailedServiceCall);

  const isInTheTeam = teams.some((team) => team.id === givenProject.teamId);
  if (!isInTheTeam) refuseUnreachableProject(projectAsGiven);

  const { projects } = await serverCalls()
    .listProjects({ teamId: givenProject.teamId, personalToken: login.token })
    .catch(refuseFailedServiceCall);

  const projectExists = projects.some((project) => project.index === givenProject.projectIndex);
  if (!projectExists) refuseUnreachableProject(projectAsGiven);
}

export default checkGivenProject;

/* ========================================================================== */

function refuseUnreachableProject(projectAsGiven: string): never {
  throwError({
    message:
      `You have no access to the project \`${projectAsGiven}\`.\n` +
      '  Run `npx sherlo project list --team <id>` to see the projects you can reach.\n' +
      `  Or leave out \`--${PROJECT_OPTION}\` and choose one.`,
  });
}
