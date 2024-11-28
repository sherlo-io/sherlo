import { throwError } from '../../../../helpers';
import { runShellCommand } from '../../../../helpers';
import { CommandParams, ExpoUpdateInfo } from '../../../../types';
import { THIS_COMMAND } from '../../constants';

function getExpoUpdateInfo(commandParams: CommandParams<THIS_COMMAND>): ExpoUpdateInfo {
  let result;

  try {
    const output = runShellCommand({
      command: `npx --yes eas-cli branch:view ${commandParams.branch} --limit 1 --json --non-interactive`,
      projectRoot: commandParams.projectRoot,
    });

    result = JSON.parse(output);
  } catch (error) {
    throwError({
      type: 'unexpected',
      message: error.message,
    });
  }

  const expoUpdateInfo = result.currentPage?.[0];

  if (
    !expoUpdateInfo ||
    !expoUpdateInfo.branch ||
    !expoUpdateInfo.group ||
    !expoUpdateInfo.message ||
    !expoUpdateInfo.platforms
  ) {
    throwError({
      type: 'unexpected',
      message: 'Invalid expo update info:\n' + JSON.stringify(result, null, 2),
    });
  }

  return expoUpdateInfo;
}

export default getExpoUpdateInfo;
