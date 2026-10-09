/**
 * SETUP'S PROJECT STEP - who is running setup, and which project the app belongs to (sherlo / How
 * setup names the project). It runs right after the checks and before anything is installed, so a
 * run that cannot name a project stops here and changes nothing in the folder.
 *
 *   - `--token`: no login. The project is the one the token names, and the token is never written
 *     into the config: it belongs in CI as SHERLO_TOKEN.
 *   - Otherwise the person is the saved login, and the browser login runs only when there is none.
 *     The project is `--project` (checked against the person's own teams and projects), or the one
 *     the config already names, or the one the person chooses when setup asks.
 *
 * Answers the project as the config writes it: the team id, a slash and the project's number.
 */
import chalk from 'chalk';
import { PROJECT_OPTION } from '../../../constants';
import { getTokenParts, throwError } from '../../../helpers';
import { parseConfigProject } from '../../../helpers/getValidatedCommandParams/validateCommandParams/resolvePushCredential';
import { workstation } from '../../../seams/workstation';
import { Options } from '../../../types';
import hasConfigFile from '../config/hasConfigFile';
import readConfig from '../config/readConfig';
import { THIS_COMMAND } from '../constants';
import { renderCheckLine, renderSectionTitle } from '../../../render/initLines';
import { printLines } from '../helpers';
import askWhichProject from './askWhichProject';
import checkGivenProject from './checkGivenProject';
import resolveSetupLogin from './resolveSetupLogin';
import { ProjectAddress, asConfigProject } from './projectAddress';

async function project({
  token,
  [PROJECT_OPTION]: projectFlag,
}: Options<THIS_COMMAND>): Promise<string> {
  printLines(renderSectionTitle('🎯 Project'));

  console.log('Checking who is setting up and which project this app belongs to.');
  console.log();

  if (token) {
    const { teamId, projectIndex } = getTokenParts(token);
    const projectFromToken = asConfigProject({ teamId, projectIndex });

    printLines([
      renderCheckLine({
        type: 'success',
        // Bold, as the config step's "Added project" line shows it.
        message: `Using the project from your token: ${chalk.bold(projectFromToken)}`,
      }),
    ]);
    console.log('  The token is not written to sherlo.config.json.');
    console.log('  Add it to your CI as the SHERLO_TOKEN secret.');

    return projectFromToken;
  }

  // Both are checked for their shape before anybody is logged in, so a mistyped one costs no login.
  const givenProject = projectFlag === undefined ? undefined : parseConfigProject(projectFlag);
  const configProject = await readProjectFromConfig();

  // Asked before the login too: a run nobody is watching would otherwise wait on a browser login
  // only to find it cannot choose a project at the end of it.
  const mustAskForProject = givenProject === undefined && configProject === undefined;
  if (mustAskForProject && !workstation().somebodyIsAtTheKeyboard()) refuseNobodyAtTheKeyboard();

  const login = await resolveSetupLogin();

  if (projectFlag !== undefined && givenProject) {
    await checkGivenProject({ givenProject, projectAsGiven: projectFlag, login });

    return asConfigProject(givenProject);
  }

  if (configProject) return asConfigProject(configProject);

  return asConfigProject(await askWhichProject(login));
}

export default project;

/* ========================================================================== */

/** The project an existing config already names, which a second run keeps. */
async function readProjectFromConfig(): Promise<ProjectAddress | undefined> {
  if (!hasConfigFile()) return undefined;

  const { project: configProject } = await readConfig();
  if (configProject === undefined) return undefined;

  return parseConfigProject(configProject);
}

function refuseNobodyAtTheKeyboard(): never {
  throwError({
    message:
      'Setup cannot ask which project this app is for, because nobody is at the keyboard.\n' +
      `  Pass \`--${PROJECT_OPTION} <teamId>/<projectIndex>\`, for example \`--${PROJECT_OPTION} k3j9x2ab/4\`.`,
  });
}
