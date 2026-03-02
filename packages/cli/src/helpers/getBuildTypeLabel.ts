import { TEST_EAS_UPDATE_COMMAND, TEST_STANDARD_COMMAND } from '../constants';
import { Command } from '../types';

function getBuildTypeLabel(command: Command): string {
  if (command === TEST_STANDARD_COMMAND) {
    return 'preview simulator';
  }
  if (command === TEST_EAS_UPDATE_COMMAND) {
    return 'development simulator';
  }
  return '';
}

export default getBuildTypeLabel;
