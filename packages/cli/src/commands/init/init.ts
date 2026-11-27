/**
 * `sherlo init` - set Sherlo up in a React Native app with no question asked (init-for-agents).
 *
 * The person's one act is clicking Authorize in the browser, so an AI agent can run the whole setup.
 * Each step prints one line, and a step the project already has says so, so a rerun picks up where
 * a failed run stopped. The run ends with the next steps, and the feedback line.
 */
import path from 'path';
import { getCwd, printSherloIntro, throwError } from '../../helpers';
import { renderInstalledPackageUnreadable } from '../../render/initFixes';
import { renderFeedbackLine, renderNextSteps, renderSetupIntro } from '../../render/initSteps';
import { Options } from '../../types';
import config from './config';
import { THIS_COMMAND } from './constants';
import { packageManagerCommand, printLines, trackProgress } from './helpers';
import metroConfig from './metroConfig';
import checkProject from './steps/checkProject';
import githubWorkflow from './steps/githubWorkflow';
import logIn from './steps/logIn';
import rootComponentFile from './steps/rootComponentFile';
import rootRegistration from './steps/rootRegistration';
import sherloSdk from './steps/sherloSdk';
import storybook from './steps/storybook';
import hasStoriesOfItsOwn from './steps/hasStoriesOfItsOwn';
import storybookFolder, { storybookFile } from './steps/storybookFolder';
import storybookSetup from './steps/storybookSetup';
import teamAndProject from './steps/teamAndProject';
import { EXPO_ROUTER_PACKAGE_NAME, PROJECT_OPTION, TEAM_OPTION } from '../../constants';
import getDeclaredPackageVersion from './requirements/getDeclaredPackageVersion';
import { InstalledPackageUnreadableError } from './requirements/getPackageVersion';
import { setupReader } from '../feedback/runningAgent';

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

    const reader = setupReader();
    // THE FIRST TEST WAITS for the app's own stories, for a person and an agent alike, on every
    // setup: with only Storybook's examples, the next step is to write them. An app whose code
    // already asks Sherlo's isStorybookMode (way b) is as ready as Storybook's default setup.
    // No folder found is named as none: a default name would send the reader to a folder the app
    // does not have.
    const folder = storybookFolder();
    const ownStories = installedNow || !folder ? null : await hasStoriesOfItsOwn(folder);
    // A story list that could not be read says nothing of examples: the line naming why stands in.
    const examplesOnly = !!ownStories && 'found' in ownStories && !ownStories.found;
    const setup = installedNow ? null : storybookSetup();
    const storybookState =
      setup === null
        ? 'installed'
        : setup === 'renders-in-app'
          ? examplesOnly
            ? 'old-setup-example-stories'
            : 'old-setup'
          : setup === 'not-started'
            ? examplesOnly
              ? 'not-started-example-stories'
              : 'not-started'
            : examplesOnly
              ? 'example-stories'
              : 'default-setup';
    printLines(
      renderNextSteps({
        storybook: storybookState,
        storyListUnreadable:
          ownStories && 'unreadable' in ownStories ? ownStories.unreadable : null,
        leftOutStory: ownStories && 'leftOut' in ownStories ? ownStories.leftOut : null,
        storybookFolder: folder,
        storybookIndexFile: folder && storybookFile(folder, 'index'),
        storybookMainFile: folder && storybookFile(folder, 'main'),
        rootRegistration: rootRegistration(),
        rootComponent: rootComponentFile(
          !!(await getDeclaredPackageVersion(EXPO_ROUTER_PACKAGE_NAME))
        ),
        reader,
      })
    );
    // BUILD DEBT (init-for-agents): on the default setup in a person's terminal, run `sherlo test`
    // here, under the line renderNextSteps printed, and only when the app has stories of its own.
    printLines(renderFeedbackLine({ reader }));

    await trackProgress({ event: '7_testing', sessionId, hasFinished: true });
  } catch (error) {
    const shown = await refusalForUnreadableInstalledPackage(error);
    // A failed run ends with one block for feedback and help, in place of the usual help footer
    // (../../start prints it).
    Object.assign(shown as object, { showFeedbackLine: true });
    throw shown;
  }
}

export default init;

/* ========================================================================== */

/**
 * AN INSTALLED PACKAGE.JSON SETUP COULD NOT READ is the person's to fix, so it is refused with the
 * app's own install command; the shared read (getPackageVersion) names no package manager, as other
 * commands have none to name. Any other error is shown as it was thrown.
 */
async function refusalForUnreadableInstalledPackage(error: unknown): Promise<unknown> {
  const cause = (error as { cause?: unknown }).cause;
  if (!(cause instanceof InstalledPackageUnreadableError)) return error;

  const refusal = renderInstalledPackageUnreadable({
    file: path.relative(getCwd(), cause.packageJsonPath),
    reason: cause.reason,
    installCommand: await packageManagerCommand('install'),
  });
  try {
    return throwError(refusal);
  } catch (thrown) {
    return thrown;
  }
}
