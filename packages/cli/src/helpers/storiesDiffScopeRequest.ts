/**
 * THE `getStoriesDiffScope` WIRE READ - one page of the stories of one test on one platform, each
 * with the Diff Scope record the web app shows for it. The seam (../seams/serverCalls) reaches it,
 * so a pose can answer it instead of the network; ./readStoriesDiffScope reads every page.
 *
 * Every field is named as the service names it. The document is the second copy of the service's
 * own query and is kept in step with it by hand, as the one of ./buildStatusRequest is.
 */
import { postGraphql } from './graphqlRequest';

/** One check of a story's record: `name` is wholeTest, changedFiles or quickCheck. */
export type StoryDiffScopeCheck = {
  answer: string;
  name: string;
  tone: string;
  count?: number | null;
  isDeciding?: boolean | null;
};

/** Why a story was captured or reused, with everything the web app shows for it. */
export type StoryDiffScopeRecord = {
  checks: StoryDiffScopeCheck[];
  reason: string;
  test: number;
  changedFiles?: string[] | null;
  comparedWithTest?: number | null;
  /** The lines that differ from the last test: `kind` is same or after. */
  drawnLines?: { kind: string; number: number; text: string }[] | null;
  drawnStoryPastRetention?: boolean | null;
  /** What stood in the way of the quick check. */
  obstacles?: { cause: string; name?: string | null }[] | null;
  /** The chain of files the change reaches the story through. */
  reachedThrough?: string[] | null;
  wholeTestFile?: string | null;
  wholeTestReason?: string | null;
};

/** One story of a test, on one device, with its record. */
export type StoryOfDiffScope = {
  storyId: string;
  deviceId: string;
  hasDiffScopeData: boolean;
  /** `final`, or `quickCheckRunning` while the story's quick check may still move its record. */
  state: string;
  record: StoryDiffScopeRecord | null;
};

/** One page of the list: `isCut` says more stories follow, and `nextAfter` is where they begin. */
export type StoriesDiffScopePage = {
  isCut: boolean;
  nextAfter?: string | null;
  quickCheck?: 'NOT_NEEDED' | 'RUNNING' | 'FINISHED' | 'FAILED' | null;
  stories: StoryOfDiffScope[];
};

export type StoriesDiffScopeVariables = {
  teamId: string;
  projectIndex: number;
  buildIndex: number;
  platform: 'android' | 'ios';
  after?: string;
};

const STORIES_DIFF_SCOPE_QUERY = `
  query getStoriesDiffScope(
    $teamId: String!
    $projectIndex: Int!
    $buildIndex: Int!
    $platform: Platform!
    $after: String
  ) {
    getStoriesDiffScope(
      teamId: $teamId
      projectIndex: $projectIndex
      buildIndex: $buildIndex
      platform: $platform
      after: $after
    ) {
      isCut
      nextAfter
      quickCheck
      stories {
        storyId
        deviceId
        hasDiffScopeData
        state
        record {
          checks {
            answer
            name
            tone
            count
            isDeciding
          }
          reason
          test
          changedFiles
          comparedWithTest
          drawnLines {
            kind
            number
            text
          }
          drawnStoryPastRetention
          obstacles {
            cause
            name
          }
          reachedThrough
          wholeTestFile
          wholeTestReason
        }
      }
    }
  }
`;

/** One page, or `null` when the team has no Diff Scope viewer feature. */
export async function fetchStoriesDiffScopePage(
  endpointUrl: string,
  apiToken: string,
  variables: StoriesDiffScopeVariables,
  timeoutMs?: number
): Promise<StoriesDiffScopePage | null> {
  const data = await postGraphql<{ getStoriesDiffScope: StoriesDiffScopePage | null }>({
    endpointUrl,
    apiToken,
    timeoutMs,
    query: STORIES_DIFF_SCOPE_QUERY,
    variables,
  });

  return data?.getStoriesDiffScope ?? null;
}
