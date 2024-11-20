import { runShellCommand, throwError } from '../../helpers';

function getPlatformUpdateUrls({
  channel,
  // easUpdateJsonOutput,
  projectRoot,
}: {
  channel?: string;
  // easUpdateJsonOutput?: string;
  projectRoot: string;
}) {
  if (channel) return getByChannel({ channel, projectRoot });

  // if (easUpdateJsonOutput) return getByEasUpdateJsonOutput(easUpdateJsonOutput);

  throwError({
    message: 'No channel or EAS update JSON output provided',
    learnMoreLink: 'TODO: add link to docs',
  });
}

export default getPlatformUpdateUrls;

/* ========================================================================== */

function getByChannel({ channel, projectRoot }: { channel: string; projectRoot: string }) {
  const urls: { android?: string; ios?: string } = {};

  try {
    // Run EAS channel view command and capture output
    const result = runShellCommand({
      command: `npx --yes eas-cli channel:view ${channel} --json --non-interactive`,
      projectRoot,
    });

    const data = JSON.parse(result);
    const updateGroups = data.currentPage?.updateBranches?.[0]?.updateGroups?.[0];

    console.log('getByChannel:data', data);

    if (!updateGroups) {
      throwError({
        message: `No updates found for channel "${channel}"`,
        learnMoreLink: 'TODO: add link to docs',
      });
    }

    // Extract URLs from update groups
    updateGroups.forEach((update: { platform: 'android' | 'ios'; manifestPermalink: string }) => {
      // TODO: oprocz `manifestPermalink` wyciagac tez `createdAt`

      if (update.platform === 'android') {
        urls.android = update.manifestPermalink;
      } else if (update.platform === 'ios') {
        urls.ios = update.manifestPermalink;
      }
    });

    if (!urls.android && !urls.ios) {
      throwError({
        message: 'No manifest permalinks found for either Android or iOS platforms',
        learnMoreLink: 'TODO: add link to docs',
      });
    }

    return urls;
  } catch (error) {
    console.log('getByChannel:error', error);

    throwError({
      message: `Failed to get update URLs for channel "${channel}"`,
      learnMoreLink: 'TODO: add link to docs',
    });
  }
}

/* function getByEasUpdateJsonOutput(easUpdateJsonOutput: string) {
  const urls: { android?: string; ios?: string } = {};

  try {
    // Find the first '[' and last ']' to extract JSON array
    const start = easUpdateJsonOutput.indexOf('[');
    const end = easUpdateJsonOutput.lastIndexOf(']') + 1;

    if (start === -1 || end === 0) {
      throwError({
        message: 'Could not find JSON array in EAS update output',
        learnMoreLink: 'TODO: add link to docs',
      });
    }

    const jsonStr = easUpdateJsonOutput.slice(start, end);
    const easUpdateJson = JSON.parse(jsonStr);

    easUpdateJson.forEach((update: { platform: 'android' | 'ios'; manifestPermalink: string }) => {
      if (update.platform === 'android') {
        urls.android = update.manifestPermalink;
      } else if (update.platform === 'ios') {
        urls.ios = update.manifestPermalink;
      }
    });

    if (!urls.android && !urls.ios) {
      throwError({
        message:
          'No manifest permalinks found for either Android or iOS platforms in EAS update output',
        learnMoreLink: 'TODO: add link to docs',
      });
    }
  } catch (error) {
    throwError({
      message: 'Failed to parse EAS update output',
      learnMoreLink: 'TODO: add link to docs',
    });
  }

  return urls;
} */
