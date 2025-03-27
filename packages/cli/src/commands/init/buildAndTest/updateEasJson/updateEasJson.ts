import chalk from 'chalk';
import { printMessage } from '../../helpers';
import { EAS_JSON_FILENAME } from './constants';
import getBuildProfileName from './getBuildProfileName';
import hasEasJsonFile from './hasEasJsonFile';
import isAlreadyUpdated from './isAlreadyUpdated';
import writeUpdatedEasJson from './writeUpdatedEasJson';

type Status = 'alreadyUpdated' | 'updated' | 'created';

/**
 * Creates or updates the eas.json file with the required simulator preview configuration
 */
async function updateEasJson(): Promise<{ status: Status }> {
  let status: Status;

  if (await isAlreadyUpdated()) {
    status = 'alreadyUpdated';
  } else {
    status = hasEasJsonFile() ? 'updated' : 'created';

    await writeUpdatedEasJson();
  }

  printStatusMessage(status);

  console.log();

  return { status };
}

export default updateEasJson;

/* ========================================================================== */

function printStatusMessage(status: Status): void {
  const profileName = getBuildProfileName();

  switch (status) {
    case 'alreadyUpdated':
      printMessage({
        message:
          `Already updated: ${EAS_JSON_FILENAME}` +
          chalk.dim(` - contains "${profileName}" build profile`),
        type: 'success',
      });

      break;

    case 'updated':
      printMessage({
        message:
          `Updated: ${EAS_JSON_FILENAME}` + chalk.dim(` - added "${profileName}" build profile`),
        type: 'success',
      });

      break;

    case 'created':
      printMessage({
        message:
          `Created: ${EAS_JSON_FILENAME}` + chalk.dim(` - defined "${profileName}" build profile`),
        type: 'success',
      });

      break;
  }
}
