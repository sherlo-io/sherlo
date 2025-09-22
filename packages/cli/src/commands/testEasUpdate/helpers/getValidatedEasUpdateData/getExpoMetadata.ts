import { getErrorWithCustomMessage, runShellCommand, throwError } from '../../../../helpers';
import { CommandParams } from '../../../../types';
import { THIS_COMMAND } from '../../constants';

async function getExpoMetadata(commandParams: CommandParams<THIS_COMMAND>): Promise<{
  slug: string;
  baseUpdateUrl: string;
}> {
  const command = 'npx --yes expo config --json';

  let output;
  try {
    output = await runShellCommand({
      command,
      projectRoot: commandParams.projectRoot,
    });
  } catch (error) {
    throwError({ type: 'unexpected', error });
  }

  let config;
  try {
    config = JSON.parse(output);
  } catch (error) {
    throwError({
      type: 'unexpected',
      error: getErrorWithCustomMessage(error, `Invalid \`${command}\` output`),
    });
  }

  if (!config.slug) {
    throwError(getError({ type: 'missing_slug' }));
  }

  if (!config.updates?.url) {
    throwError(getError({ type: 'missing_updates_url' }));
  }

  return { slug: config.slug, baseUpdateUrl: config.updates.url };
}

export default getExpoMetadata;

/* ========================================================================== */

type ExpoMetadataError = { type: 'missing_slug' } | { type: 'missing_updates_url' };

function getError(error: ExpoMetadataError) {
  switch (error.type) {
    case 'missing_slug':
      return {
        message: 'Invalid app config - `slug` property is missing',
        learnMoreLink: 'https://docs.expo.dev/workflow/configuration/',
      };

    case 'missing_updates_url':
      return {
        message: 'Invalid app config - `updates.url` property is missing',
        learnMoreLink: 'https://docs.expo.dev/versions/latest/config/app/#updates',
      };
  }
}
