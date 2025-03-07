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

    console.log('[DEBUG JSON] Parsing eas-cli branch output');
    console.log(`[DEBUG JSON] eas-cli output (preview): ${output.substring(0, 100)}...`);

    try {
      result = JSON.parse(output);
      console.log('[DEBUG JSON] Successfully parsed eas-cli output');
    } catch (parseError) {
      console.error(`[DEBUG JSON] Error parsing eas-cli output: ${parseError.message}`);
      throwError({ type: 'unexpected', error: parseError });
    }
  } catch (error) {
    console.error(`[DEBUG JSON] Error getting eas-cli branch info: ${error.message}`);
    throwError({ type: 'unexpected', error });
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
