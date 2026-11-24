import { PLATFORMS } from '../constants';
import { serverCalls } from '../seams/serverCalls';
import { AuthError, type BuildStatus } from './buildStatusRequest';
import { CodedRequestError } from './graphqlRequest';
import type { StoryOfDiffScope } from './storiesDiffScopeRequest';

/**
 * What `sherlo view --json` carries per platform beside `capture`, under these names:
 * - `diffScopeStories`: every story of the test on the platform, each with its record as the
 *   service names it;
 * - `diffScopeStoriesIncomplete`: present when a page failed to read - the cause as a short code
 *   (`authRefused`, `http<status>`, the service's own error type, `noNextPage`, `requestFailed`);
 *   the stories read before it stay listed, and the list is NOT whole;
 * - `diffScopeStoriesNotAvailable`: present when the team has no Diff Scope viewer - its value is
 *   the code `noDiffScopeViewer` - and the list is absent: it is no error.
 */
export type StoriesOfDiffScopeOfPlatform = {
  diffScopeStories?: StoryOfDiffScope[];
  diffScopeStoriesIncomplete?: string;
  diffScopeStoriesNotAvailable?: string;
};

/** The code of {@link StoriesOfDiffScopeOfPlatform}'s `diffScopeStoriesNotAvailable`. */
export const STORIES_NOT_AVAILABLE_CODE = 'noDiffScopeViewer';

/** The code of a list the service cut without saying where it goes on. */
const NO_NEXT_PAGE_CODE = 'noNextPage';

/** The code a failed page is reported by: the service's own where it gave one. */
function causeCodeOf(error: unknown): string {
  if (error instanceof AuthError) return 'authRefused';
  if (error instanceof CodedRequestError) return error.code;
  return 'requestFailed';
}

/** The stories of each platform the test ran on. */
export type StoriesOfDiffScopeByPlatform = Partial<
  Record<(typeof PLATFORMS)[number], StoriesOfDiffScopeOfPlatform>
>;

/** Whether any platform's list is not whole - the command's exit says so. */
export function isAnyListIncomplete(lists: StoriesOfDiffScopeByPlatform): boolean {
  return Object.values(lists).some((list) => list.diffScopeStoriesIncomplete !== undefined);
}

/**
 * Read the whole list of stories of each platform of a test, page after page until the service
 * says the list is no longer cut. A page that fails ends that platform's list as incomplete; it
 * never leaves a short list that looks whole.
 */
export async function readStoriesDiffScope(
  test: { token: string; buildIndex: number; projectIndex: number; teamId: string },
  build: BuildStatus
): Promise<StoriesOfDiffScopeByPlatform> {
  const lists: StoriesOfDiffScopeByPlatform = {};

  for (const platform of PLATFORMS) {
    if (!build.platforms?.[platform]) continue;

    const stories: StoryOfDiffScope[] = [];
    let after: string | undefined;

    try {
      for (;;) {
        const page = await serverCalls().getStoriesDiffScope({
          ...test,
          platform,
          ...(after !== undefined ? { after } : {}),
        });

        if (page === null) {
          lists[platform] = { diffScopeStoriesNotAvailable: STORIES_NOT_AVAILABLE_CODE };
          break;
        }

        stories.push(...page.stories);

        if (!page.isCut) {
          lists[platform] = { diffScopeStories: stories };
          break;
        }

        if (!page.nextAfter || page.nextAfter === after) {
          throw new CodedRequestError(
            'the service cut the list and did not say where it goes on',
            NO_NEXT_PAGE_CODE
          );
        }
        after = page.nextAfter;
      }
    } catch (error) {
      lists[platform] = {
        diffScopeStories: stories,
        diffScopeStoriesIncomplete: causeCodeOf(error),
      };
    }
  }

  return lists;
}
