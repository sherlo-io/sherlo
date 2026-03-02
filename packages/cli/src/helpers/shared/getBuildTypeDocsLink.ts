import { DOCS_LINK, TEST_EAS_UPDATE_COMMAND, TEST_STANDARD_COMMAND } from '../../constants';
import { Command } from '../../types';

function getBuildTypeDocsLink(command: Command): string | undefined {
  if (command === TEST_STANDARD_COMMAND) {
    return DOCS_LINK.buildPreview;
  }
  if (command === TEST_EAS_UPDATE_COMMAND) {
    return DOCS_LINK.buildDevelopment;
  }
  return undefined;
}

export default getBuildTypeDocsLink;
