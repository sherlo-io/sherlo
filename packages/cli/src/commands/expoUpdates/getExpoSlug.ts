import { execSync } from 'child_process';
import { throwError } from '../../helpers';

const LEAR_MORE_LINK = 'https://docs.expo.dev/workflow/configuration/';

function getExpoSlug(projectRoot: string): string {
  let config;

  try {
    const output = execSync('npx --yes expo config --json', {
      encoding: 'utf-8',
      cwd: projectRoot,
    });

    config = JSON.parse(output);
  } catch (error) {
    throwError({
      type: 'unexpected',
      message: 'Failed to get or parse expo config output',
      learnMoreLink: LEAR_MORE_LINK,
    });
  }

  if (!config.slug) {
    throwError({
      message: 'slug not found in app config, please add a "slug" property',
      learnMoreLink: LEAR_MORE_LINK,
    });
  }

  return config.slug;
}

export default getExpoSlug;
