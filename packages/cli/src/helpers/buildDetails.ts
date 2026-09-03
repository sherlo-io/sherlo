import type { BuildDetails, BuildDetailsGitFacts, ViewMetadataJson } from '../render/buildView';
import type { BuildStatus } from './waitForBuildResult';

/**
 * The `sherlo test --wait` `--metadata` facts, lifted off the one build read a
 * project token can make.
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
 * `git` is passed in rather than read off `build` here, because ONLY a command
 * that OPENED the build can honestly claim it: `sherlo test`'s `--wait` roads
 * composed and sent their own git facts at `openBuild` time and pass them
 * through unchanged, so a reader of this block sees the run's own working tree
 * (`isDirty` included), not a re-derivation. `getBuildStatus` NOW also carries a
 * frozen `gitInfo` on the build itself (view-metadata, operator ruling
 * 2026-09-03) - that is what {@link buildViewMetadataJson} below reads, for
 * `sherlo view`, which opened nothing and has only the wire's word for it.
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

/**
 * `sherlo view --metadata`'s whole JSON payload (view-metadata, operator ruling
 * 2026-09-03). A field lift like {@link buildDetailsOf}, but reading `commit`
 * off `build.gitInfo` itself - `sherlo view` opened nothing, so the build's own
 * frozen `gitInfo` (not a command-composed one) is the only git fact it can
 * honestly print. `stories` passes through verbatim; the API decides the
 * per-story status/baseline/reason, this function never re-derives them.
 */
export function buildViewMetadataJson(build: BuildStatus, buildIndex: number): ViewMetadataJson {
  return {
    runStatus: build.runStatus,
    buildIndex,
    commit: build.gitInfo
      ? { sha: build.gitInfo.commitHash, branch: build.gitInfo.branchName }
      : undefined,
    viewStatusesCount: build.viewStatusesCount,
    stories: build.stories,
  };
}
