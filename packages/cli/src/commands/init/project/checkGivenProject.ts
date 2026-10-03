/**
 * A `--project` IS CHECKED AGAINST THE PERSON'S OWN TEAMS AND PROJECTS before setup writes it: its
 * team must be one of theirs, and its number one of that team's projects. One they cannot reach is
 * refused, naming the project as they gave it.
 */
import { PROJECT_OPTION } from '../../../constants';
import { throwError } from '../../../helpers';
import { serverCalls } from '../../../seams/serverCalls';
import type { ResolvedPersonalToken } from '../../shared/resolvePersonalToken';
import type { ProjectAddress } from './projectAddress';
import refuseFailedServiceCall from './refuseFailedServiceCall';

async function checkGivenProject({
  givenProject,
  projectAsGiven,
  person: { personalToken, fromSavedLogin },
}: {
  givenProject: ProjectAddress;
  projectAsGiven: string;
  person: ResolvedPersonalToken;
}): Promise<void> {
  const { teams } = await serverCalls()
    .listTeams({ personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error, { fromSavedLogin }));

  const isInTheTeam = teams.some((team) => team.id === givenProject.teamId);
  if (!isInTheTeam) refuseUnreachableProject(projectAsGiven);

  const { projects } = await serverCalls()
    .listProjects({ teamId: givenProject.teamId, personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error, { fromSavedLogin }));

  const projectExists = projects.some((project) => project.index === givenProject.projectIndex);
  if (!projectExists) refuseUnreachableProject(projectAsGiven);
}

export default checkGivenProject;

/* ========================================================================== */

function refuseUnreachableProject(projectAsGiven: string): never {
  throwError({
    message:
      `You have no access to the project \`${projectAsGiven}\`.\n` +
      '  Run `sherlo project list --team <id>` to see the projects you can reach.\n' +
      `  Or leave out \`--${PROJECT_OPTION}\` and choose one.`,
  });
}
