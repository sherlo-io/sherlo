import { getEnhancedError, runShellCommand, throwError } from '../../../../helpers';
import { CommandParams, ExpoUpdateInfo } from '../../../../types';
import { THIS_COMMAND } from '../../constants';

async function getExpoUpdateInfo(
  commandParams: CommandParams<THIS_COMMAND>
): Promise<ExpoUpdateInfo> {
  const command = `npx --yes eas-cli branch:view ${commandParams.branch} --limit 1 --json --non-interactive`;

  let output;
  try {
    output = await runShellCommand({
      command,
      projectRoot: commandParams.projectRoot,
    });
  } catch (error) {
    throwError({ type: 'unexpected', error });
  }

  let result;
  try {
    result = JSON.parse(output);
  } catch (error) {
    throwError({
      type: 'unexpected',
      error: getEnhancedError(`Invalid \`${command}\` output`, error),
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
      error: new Error('Invalid expo update info:\n' + JSON.stringify(result, null, 2)),
    });
  }

  return expoUpdateInfo;
}

export default getExpoUpdateInfo;
