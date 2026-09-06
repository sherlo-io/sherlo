import { TEST_COMMAND } from '../constants';
import { Command } from '../types';

function getBuildTypeLabel(command: Command): string {
  if (command === TEST_COMMAND) {
    return 'preview simulator';
  }
  return '';
}

export default getBuildTypeLabel;
