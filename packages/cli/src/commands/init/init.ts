/**
 * `sherlo init` - set Sherlo up in a React Native app with no question asked (init-for-agents).
 *
 * The person's one act is clicking Authorize in the browser, so an AI agent can run the whole setup.
 * Each step prints one line, and a step the project already has says so, so a rerun picks up where
 * a failed run stopped. The run ends with the next steps, and the feedback line.
 */
import { printSherloIntro } from '../../helpers';
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
import storybookSetup from './steps/storybookSetup';
import teamAndProject from './steps/teamAndProject';
import { PROJECT_OPTION, TEAM_OPTION } from '../../constants';

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
    const { projectId, projectPageUrl } = await teamAndProject(person, {
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

    printLines(
      renderNextSteps({ installedStorybook: installedNow, storybookSetup: storybookSetup(), projectPageUrl })
    );
    printLines(renderFeedbackLine({ under: 'next-steps' }));

    await trackProgress({ event: '7_testing', sessionId, hasFinished: true });
  } catch (error) {
    // The feedback line goes under the error too, between it and the help footer
    // (../../start prints both).
    Object.assign(error as object, { showFeedbackLine: true });
    throw error;
  }
}

export default init;
