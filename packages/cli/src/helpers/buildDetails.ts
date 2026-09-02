import type { BuildDetails, BuildDetailsGitFacts } from '../render/buildView';
import type { BuildStatus } from './waitForBuildResult';

/**
 * The `--metadata` facts, lifted off the one build read a project token can make.
 *
 * A FIELD LIFT, NEVER A TRANSLATION. Every value below is copied from the poll
 * answer as it arrived; nothing is defaulted, derived or filled in. The details
 * renderer decides which rows those facts earn (render/buildView), so an absent
 * field stays absent all the way to the block instead of becoming a zero here.
 *
 * It is written out rather than spread so a reader can see exactly which of
 * `getBuildStatus`'s fields the block is allowed to speak about - and so a field
 * added to the poll for some other purpose does not silently join the block.
 *
 * `git` is the ONE fact that does not come from the wire, because
 * `getBuildStatus` does not carry the build's git info. Only a command that
 * OPENED the build can supply it (the `sherlo test` roads composed and sent it
 * themselves); `sherlo view` passes nothing, since this checkout's git describes
 * a different commit than the build being looked at.
 */
export function buildDetailsOf(build: BuildStatus, git?: BuildDetailsGitFacts): BuildDetails {
  return {
    git,
    runStatus: build.runStatus,
    runError: build.runError,
    showsOnlyBranchChanges: build.showsOnlyBranchChanges,
    viewStatusesCount: build.viewStatusesCount,
    diffScopeInfo: build.diffScopeInfo,
  };
}
