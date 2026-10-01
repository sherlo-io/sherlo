import chalk from 'chalk';
import { DEFAULT_CONFIG_FILENAME } from '../../../constants';
import { printMessage } from '../helpers';

function printProjectAddedMessage(project: string): void {
  printMessage({
    type: 'success',
    message: `Added project ${chalk.bold(project)} to ${DEFAULT_CONFIG_FILENAME}`,
  });
}

export default printProjectAddedMessage;
