import { DOCS_LINK } from '../../../constants';
import { logWarning } from '../../../helpers';
import { printMessage, waitForKeyPress, trackProgress } from '../helpers';
import { EVENT } from './constants';
import getStorybookFiles from './getStorybookFiles';
import updateStorybookFiles from './updateStorybookFiles';

async function updateStorybookComponent(
  sessionId: string
): Promise<{ hasUpdatedStorybookComponent: boolean }> {
  const storybookFiles = await getStorybookFiles();

  const alreadyUpdatedFilePaths = storybookFiles
    .filter(({ isUpdated }) => isUpdated)
    .map(({ filePath }) => filePath);

  alreadyUpdatedFilePaths.forEach((filePath) => {
    printMessage({
      type: 'success',
      message: `Already updated: ${filePath}`,
    });
  });

  const notUpdatedFilePaths = storybookFiles
    .filter(({ isUpdated }) => !isUpdated)
    .map(({ filePath }) => filePath);

  if (notUpdatedFilePaths.length > 0) {
    await updateStorybookFiles(notUpdatedFilePaths);

    notUpdatedFilePaths.forEach((filePath) => {
      printMessage({
        type: 'success',
        message: `Updated: ${filePath}`,
      });
    });
  }

  let hasUpdatedStorybookComponent;

  if (storybookFiles.length > 0) {
    hasUpdatedStorybookComponent = true;

    let params: Record<string, any> = {};
    if (notUpdatedFilePaths.length > 0) {
      params = { updatedFilePaths: notUpdatedFilePaths };
    }
    if (alreadyUpdatedFilePaths.length > 0) {
      params = { ...params, alreadyUpdatedFilePaths };
    }

    await trackProgress({
      event: EVENT,
      params,
      sessionId,
    });
  } else {
    hasUpdatedStorybookComponent = false;

    printMessage({
      type: 'fail',
      message: 'Automatic update failed',
      endsWithNewLine: true,
    });

    logWarning({
      message: 'Storybook component not found - update manually',
      learnMoreLink: DOCS_LINK.setupStorybookComponent,
    });

    await trackProgress({
      event: EVENT,
      params: { status: 'failed:storybook_component_not_found' },
      sessionId,
    });

    await waitForKeyPress();
  }

  return { hasUpdatedStorybookComponent };
}

export default updateStorybookComponent;
