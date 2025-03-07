import { runShellCommand, throwError } from '../../../../helpers';
import { CommandParams } from '../../../../types';
import { THIS_COMMAND } from '../../constants';

function getExpoMetadata(commandParams: CommandParams<THIS_COMMAND>): {
  slug: string;
  baseUpdateUrl: string;
} {
  let config;

  try {
    const output = runShellCommand({
      command: 'npx --yes expo config --json',
      projectRoot: commandParams.projectRoot,
    });

    console.log('[DEBUG JSON] Parsing expo config output');
    console.log(`[DEBUG JSON] Expo config output (preview): ${output.substring(0, 100)}...`);

    try {
      config = JSON.parse(output);
      console.log('[DEBUG JSON] Successfully parsed expo config');
    } catch (parseError) {
      console.error(`[DEBUG JSON] Error parsing expo config: ${parseError.message}`);
      throwError({ type: 'unexpected', error: parseError });
    }
  } catch (error) {
    console.error(`[DEBUG JSON] Error getting expo config: ${error.message}`);
    throwError({ type: 'unexpected', error });
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
