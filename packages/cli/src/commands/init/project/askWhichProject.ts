/**
 * NO `--project` AND NONE IN THE CONFIG: setup asks which team, then which of its projects, with a
 * choice to make a new project. A person in no team is offered to make one first. A project setup
 * makes prints its project token once, as the CI token, through the renderer `project create` uses
 * (../../../render/projectCreated) - alone on its line, under the shown-once warning. The token is
 * never written into the config.
 *
 * Every question goes through the workstation seam (../../../seams/workstation). A question left
 * unanswered - Ctrl+C, or a pose that cannot answer - cancels the setup.
 */
import { throwError } from '../../../helpers';
import { emit } from '../../../helpers/transcriptSink';
import { serverCalls } from '../../../seams/serverCalls';
import { workstation } from '../../../seams/workstation';
import type { ResolvedPersonalToken } from '../../shared/resolvePersonalToken';
import type { ProjectAddress } from './projectAddress';
import refuseFailedServiceCall from './refuseFailedServiceCall';

/** The value of the last choice in the project question, after the team's own projects. */
const MAKE_A_NEW_PROJECT = 'make-a-new-project';

async function askWhichProject(person: ResolvedPersonalToken): Promise<ProjectAddress> {
  const teamId = await askWhichTeam(person);

  return askWhichProjectOfTheTeam(teamId, person);
}

export default askWhichProject;

/* ========================================================================== */

/** The team the person picks, or the one they make when they are in none. */
async function askWhichTeam({
  personalToken,
  fromSavedLogin,
}: ResolvedPersonalToken): Promise<string> {
  const { teams } = await serverCalls()
    .listTeams({ personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error, { fromSavedLogin }));

  if (teams.length > 0) {
    return cancelSetupWhenUnanswered(
      workstation().chooseOne({
        question: 'Which team is this app for?',
        choices: teams.map((team) => ({ name: team.name, value: team.id })),
      })
    );
  }

  const wantsATeam = await cancelSetupWhenUnanswered(
    workstation().askYesOrNo({ question: 'You are not in a team yet. Make one now?' })
  );
  if (!wantsATeam) cancelSetup();

  const teamName = await cancelSetupWhenUnanswered(
    workstation().askForText({ question: 'What should the team be called?' })
  );

  const newTeam = await serverCalls()
    .createTeam({ name: teamName.trim(), personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error, { fromSavedLogin }));

  return newTeam.id;
}

/** The project of this team the person picks, or the one they make. */
async function askWhichProjectOfTheTeam(
  teamId: string,
  { personalToken, fromSavedLogin }: ResolvedPersonalToken
): Promise<ProjectAddress> {
  const { projects } = await serverCalls()
    .listProjects({ teamId, personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error, { fromSavedLogin }));

  const chosenProject = await cancelSetupWhenUnanswered(
    workstation().chooseOne<number | typeof MAKE_A_NEW_PROJECT>({
      question: 'Which project is this app for?',
      choices: [
        ...projects.map((project) => ({ name: project.name, value: project.index })),
        { name: 'Make a new project', value: MAKE_A_NEW_PROJECT },
      ],
    })
  );

  if (chosenProject !== MAKE_A_NEW_PROJECT) return { teamId, projectIndex: chosenProject };

  const projectName = await cancelSetupWhenUnanswered(
    workstation().askForText({ question: 'What should the new project be called?' })
  );

  const newProject = await serverCalls()
    .createProject({ name: projectName.trim(), teamId, personalToken })
    .catch((error: Error) => refuseFailedServiceCall(error, { fromSavedLogin }));

  // Shown once, as `project create` shows it: this is the token CI pushes with.
  emit({ kind: 'project-created', project: newProject });

  return { teamId, projectIndex: newProject.index };
}

/** The answer to a question, or the setup cancelled when nobody answered it. */
async function cancelSetupWhenUnanswered<Answer>(question: Promise<Answer>): Promise<Answer> {
  return question.catch(() => cancelSetup());
}

/** The same ending as a setup cancelled at its Enter prompt. */
function cancelSetup(): never {
  console.log();
  console.log();

  throwError({ message: 'Setup cancelled' });
}
