import { getErrorWithCustomMessage, runShellCommand, throwError } from '../../../../helpers';
import { CommandParams, EasUpdateInfo } from '../../../../types';
import { THIS_COMMAND } from '../../constants';

async function getEasUpdateInfo(
  commandParams: CommandParams<THIS_COMMAND>
): Promise<EasUpdateInfo> {
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
      error: getErrorWithCustomMessage(error, `Invalid \`${command}\` output`),
    });
  }

  const easUpdateInfo = result.currentPage?.[0];

  if (
    !easUpdateInfo ||
    !easUpdateInfo.branch ||
    !easUpdateInfo.group ||
    !easUpdateInfo.message ||
    !easUpdateInfo.platforms
  ) {
    throwError({
      type: 'unexpected',
      error: new Error('Invalid EAS Update info:\n' + JSON.stringify(result, null, 2)),
    });
  }

  return easUpdateInfo;
}

export default getEasUpdateInfo;
