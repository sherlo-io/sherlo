import sdkClient from '@sherlo/sdk-client';
import handleClientError from '../handleClientError';
import { BuildStatusPoll, BuildStatusSource } from './types';

// The `getBuildStatus` field isn't visible on the sdk-client type from this
// workspace (it's generated in the sibling sherlo-lib repo) - narrowed here
// to the fields this source actually reads. There is no single overall
// status string: `runStatus` says where the run is, and `viewStatusesCount`
// (only meaningful once `runStatus` is `finished`) says whether there's
// anything to review.
type RunStatus = 'canceled' | 'error' | 'finished' | 'inProgress' | 'queued' | 'waiting';

type ViewStatusesCount = {
  approved: number;
  noChanges: number;
  reported: number;
  unreviewed: number;
};

type BuildStatusClient = {
  getBuildStatus: (params: {
    teamId: string;
    projectIndex: number;
    buildIndex: number;
  }) => Promise<{ runStatus: RunStatus; viewStatusesCount: ViewStatusesCount }>;
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
      const { runStatus, viewStatusesCount } = await statusClient
        .getBuildStatus({ teamId, projectIndex, buildIndex })
        .catch(handleClientError);

      return toBuildStatusPoll(runStatus, viewStatusesCount);
    },
  };
}

export default createPollingBuildStatusSource;

/* ========================================================================== */

// `error`/`canceled` is a run that ended without a usable result - surfaced
// as a poll error (same path as a network/client error) rather than a
// terminal outcome. `queued`/`waiting`/`inProgress` keep polling. `finished`
// is terminal; whether there's anything to review comes from
// `viewStatusesCount.reported`, since there's no single overall status
// string in this response.
function toBuildStatusPoll(
  runStatus: RunStatus,
  viewStatusesCount: ViewStatusesCount
): BuildStatusPoll {
  switch (runStatus) {
    case 'finished':
      return { terminal: true, hasChangesToReview: viewStatusesCount.reported > 0 };
    case 'error':
    case 'canceled':
      throw new Error(`Test run ended with status "${runStatus}"`);
    case 'queued':
    case 'waiting':
    case 'inProgress':
      return { terminal: false };
  }
}
