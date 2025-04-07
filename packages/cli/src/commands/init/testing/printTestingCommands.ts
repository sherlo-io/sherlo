import chalk from 'chalk';
import {
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATE_COMMAND,
  LOCAL_BUILDS_COMMAND,
} from '../../../constants';

function printTestingCommands(): void {
  console.log('Testing commands:');

  printTestingCommand({
    command: LOCAL_BUILDS_COMMAND,
    description: 'tests builds stored locally',
  });

  printTestingCommand({
    command: EXPO_CLOUD_BUILDS_COMMAND,
    description: 'tests builds after completion on EAS servers',
  });

  printTestingCommand({
    command: EXPO_UPDATE_COMMAND,
    description: 'tests builds stored locally with EAS Update',
  });
}

export default printTestingCommands;

/* ========================================================================== */

function printTestingCommand({
  command,
  description,
}: {
  command: string;
  description: string;
}): void {
  console.log('- ' + chalk.green(`npx sherlo ${command}`) + chalk.dim(` - ${description}`));
}
