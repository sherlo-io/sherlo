import sdkClient from '@sherlo/sdk-client';
import handleClientError from '../handleClientError';
import { BuildStatusPoll, BuildStatusSource } from './types';

// The `getBuildStatus` field isn't visible on the sdk-client type from this
// workspace (it's generated in the sibling sherlo-lib repo) - narrowed here
// to the one field this source actually reads off the build.
type BuildStatusClient = {
  getBuildStatus: (params: {
    teamId: string;
    projectIndex: number;
    buildIndex: number;
  }) => Promise<{ build: { status: string } }>;
};

function createPollingBuildStatusSource({
  client,
  teamId,
  projectIndex,
  buildIndex,
}: {
  client: ReturnType<typeof sdkClient>;
  teamId: string;
  projectIndex: number;
  buildIndex: number;
}): BuildStatusSource {
  const statusClient = client as unknown as BuildStatusClient;

  return {
    poll: async (): Promise<BuildStatusPoll> => {
      const { build } = await statusClient
        .getBuildStatus({ teamId, projectIndex, buildIndex })
        .catch(handleClientError);

      return toBuildStatusPoll(build.status);
    },
  };
}

export default createPollingBuildStatusSource;

/* ========================================================================== */

// Terminal statuses mirror the ones the dashboard renders (see the `COLOR`
// map in constants.ts): `reported` has diffs to review, `approved` and
// `noChanges` don't. Anything else (queued/running) is still in progress.
function toBuildStatusPoll(status: string): BuildStatusPoll {
  switch (status) {
    case 'reported':
      return { terminal: true, hasChangesToReview: true };
    case 'approved':
    case 'noChanges':
      return { terminal: true, hasChangesToReview: false };
    default:
      return { terminal: false };
  }
}
