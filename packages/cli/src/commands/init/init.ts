/**
 * `sherlo init` - set Sherlo up in a React Native app with no question asked (init-for-agents).
 *
 * The person's one act is clicking Authorize in the browser, so an AI agent can run the whole setup.
 * Each step prints one line, and a step the project already has says so, so a rerun picks up where
 * a failed run stopped. The run ends with the next steps, and the feedback line.
 */
import { getCwd, printSherloIntro } from '../../helpers';
import { renderFeedbackLine, renderNextSteps, renderSetupIntro } from '../../render/initSteps';
import { Options } from '../../types';
import config from './config';
import { THIS_COMMAND } from './constants';
import { printLines, trackProgress } from './helpers';
import metroConfig from './metroConfig';
import checkProject from './steps/checkProject';
import githubWorkflow from './steps/githubWorkflow';
import logIn from './steps/logIn';
import sherloSdk from './steps/sherloSdk';
import storybook from './steps/storybook';
import hasStoriesOfItsOwn from './steps/hasStoriesOfItsOwn';
import storybookSetup from './steps/storybookSetup';
import teamAndProject from './steps/teamAndProject';
import { EXPO_PACKAGE_NAME, PROJECT_OPTION, TEAM_OPTION } from '../../constants';
import getPackageVersion from './requirements/getPackageVersion';
import { readProjectJson } from '../../helpers/projectJson';

async function init(options: Options<THIS_COMMAND>) {
  const { sessionId } = await trackProgress({ event: '0_init', sessionId: null, hasStarted: true });

  printSherloIntro();
  printLines(renderSetupIntro());

  try {
    const project = await checkProject();
    await trackProgress({ event: '1_requirements', sessionId });

    const person = await logIn();
    // BUILD DEBT (init-for-agents): `--team` joins init's options type in ../../types.
    const teamFlag = (options as { [TEAM_OPTION]?: string })[TEAM_OPTION];
    const { projectId } = await teamAndProject(person, {
      teamFlag,
      projectFlag: options[PROJECT_OPTION],
    });
    // Written as soon as the project exists, so a run that fails at any later step leaves the
    // project in the config, and a rerun uses it rather than making a second one.
    await config({ sessionId, project: projectId });

    const { installedNow } = await storybook({ hasStorybook: project.hasStorybook });
    await sherloSdk();
    await trackProgress({ event: '2_dependencies', params: { status: 'success' }, sessionId });

    await metroConfig(sessionId);
    await githubWorkflow();

    // BUILD DEBT (init-for-agents): the shared "is this a person's terminal" check, once it exists.
    const reader = process.stdout.isTTY ? 'person' : 'agent';
    // A PERSON'S FIRST TEST WAITS for the app's own stories: with only Storybook's examples, the
    // next step is to write them.
    const storybookState = installedNow
      ? 'installed'
      : storybookSetup() === 'registers-root'
        ? reader === 'person' && !hasStoriesOfItsOwn()
          ? 'example-stories'
          : 'default-setup'
        : 'old-setup';
    printLines(
      renderNextSteps({
        storybook: storybookState,
        isExpo: !!getPackageVersion(EXPO_PACKAGE_NAME),
        exportsServerRoutes:
          !!getPackageVersion('expo-router') &&
          readProjectJson(getCwd(), 'app.json')?.expo?.web?.output === 'server',
        reader,
      })
    );
    // BUILD DEBT (init-for-agents): on the default setup in a person's terminal, run `sherlo test`
    // here, under the line renderNextSteps printed, and only when the app has stories of its own.
    printLines(renderFeedbackLine({ reader }));

    await trackProgress({ event: '7_testing', sessionId, hasFinished: true });
  } catch (error) {
    // A failed run ends with one block for feedback and help, in place of the usual help footer
    // (../../start prints it).
    Object.assign(error as object, { showFeedbackLine: true });
    throw error;
  }
}

export default init;
