/**
 * The read-only Diff Scope decision query for `test:bundled --dry-run`
 * (SHERLO-1895 Diff Scope v2 Phase C).
 *
 * THIS FILE IS THE CONTRACT SEAM. It is the ONE place that binds to the
 * server-side `computeDiffScopeDryRun` query (query name, input SDL, output
 * SDL). Everything else in the dry-run path - flag plumbing, manifest
 * production, formatting, bail-open handling - is contract-independent and talks
 * to this module through the typed {@link DryRunPlatformDecision}s it returns.
 *
 * The query is READ-ONLY: it opens no build, advances no ancestry, and the
 * dry-run manifest it carries is NOT persisted durably server-side. It works
 * even when the project's Diff Scope v2 feature flag is OFF - a dry run is a
 * PREVIEW, never enablement.
 *
 * ONE CALL, ALL PLATFORMS: the contract takes a `platforms` array and returns a
 * per-platform result array, so this seam issues a SINGLE request for every
 * platform under test (not one call each).
 *
 * BAIL-OPEN: this function throws on ANY uncertainty (the query method not
 * present at runtime, a null/malformed response, a network error).
 * {@link runDryRunPreview} treats every throw as a bail-open that previews
 * "would capture EVERY story" for every platform, never a confident wrong
 * partial. Note the server ALSO bails open on its OWN errors, but does so
 * IN-BAND: it returns a normal 200 with `isFullCapture: true` and
 * `reason: "dry-run-error: <message>"` per platform. That path is a decided
 * result here (keyed off `isFullCapture`), not a throw - both render as
 * "capture everything", so both are safe.
 */
import sdkClient from '@sherlo/sdk-client';
import { Platform } from '@sherlo/api-types';
import reporting from '../../helpers/reporting';
import type { GitInfo } from '../../helpers/getGitInfo';
import { countBundleStories, type ValidatedModuleManifest } from './readModuleManifest';

// ---------------------------------------------------------------------------
// Contract-mirrored wire types (SHERLO-1895 Phase C)
//
// These mirror the `computeDiffScopeDryRun` SDL. They live here, not in
// @sherlo/api-types, for the same reason the manifestS3Key upload slot does:
// the published sdk-client / api-types this repo typechecks against does not
// carry the query yet. Drop them once sdk-client republishes with the method.
// ---------------------------------------------------------------------------

/** One platform entry in the request. Mirrors `DiffScopeDryRunPlatformInput`. */
export type DiffScopeDryRunPlatformInput = {
  platform: Platform;
  /**
   * Whether this platform is a bundled (staged) upload. test:bundled sets true;
   * a standard upload (false) previews as full (standard-upload).
   */
  bundled: boolean;
  /** This platform's base identity; absent -> native-changed (full). */
  baseReference?: string;
  /**
   * The locally-produced module manifest as a JSON STRING (the exact object the
   * CLI would upload). Absent / unparseable server-side -> manifest-missing (full).
   */
  manifest?: string;
};

/** The `computeDiffScopeDryRun` query variables. Mirrors the query arg SDL. */
export type ComputeDiffScopeDryRunRequest = {
  projectIndex: number;
  teamId: string;
  gitInfo: GitInfo;
  platforms: DiffScopeDryRunPlatformInput[];
};

/** One platform's server result. Mirrors `DiffScopeDryRunPlatformResult`. */
export type DiffScopeDryRunPlatformResult = {
  platform: Platform;
  /**
   * true -> a real run would capture EVERYTHING for this platform;
   * `capturedStoryFilePaths` is EMPTY in that case (that means "everything",
   * NOT "nothing"). false -> the partial closure-diff below.
   */
  isFullCapture: boolean;
  /** Full -> the rung code; partial -> the path-legible closure-diff summary. */
  reason: string;
  /** Story-file source paths that would be captured. Empty on a full capture. */
  capturedStoryFilePaths: string[];
};

/** The query result. Mirrors `DiffScopeDryRunResult` (nullable in the SDL). */
export type ComputeDiffScopeDryRunResult = {
  platforms: DiffScopeDryRunPlatformResult[];
} | null;

/**
 * The SDK client the decision query is issued through, extended with the
 * read-only `computeDiffScopeDryRun` query the api department is adding to
 * sdk-client in parallel (SHERLO-1895 Phase C). The method is declared OPTIONAL:
 * the sdk-client this repo builds against does not expose it yet, so at runtime
 * it may be absent - {@link requestDryRunDecision} guards for that and bails
 * open. This is the same local forward-compat extension pattern the
 * manifestS3Key upload slot uses in this command; drop the intersection once
 * sdk-client republishes with the method.
 */
export type DryRunDecisionClient = ReturnType<typeof sdkClient> & {
  computeDiffScopeDryRun?: (
    request: ComputeDiffScopeDryRunRequest
  ) => Promise<ComputeDiffScopeDryRunResult>;
};

// ---------------------------------------------------------------------------
// CLI-internal model
// ---------------------------------------------------------------------------

/**
 * One platform's decision, as consumed by the formatter. This is the CLI's
 * internal model; {@link requestDryRunDecision} maps the server's response SDL
 * into it.
 */
export type DryRunPlatformDecision = {
  platform: Platform;
  /**
   * The server's verdict: would a real run capture EVERYTHING for this platform?
   * When true, {@link capturedStoryFilePaths} is empty and MUST be rendered as
   * "capture everything", never "capture nothing".
   */
  isFullCapture: boolean;
  /**
   * Repo-relative `*.stories.*` SOURCE paths a real run would capture. Empty on
   * a full capture (that means "everything"); may also be empty on a partial
   * capture that reaches no story (that genuinely means "nothing").
   */
  capturedStoryFilePaths: string[];
  /**
   * Total number of stories THIS build produced, from the local manifest's
   * story-closure count - NOT a server field (the contract has none). Rendered
   * as "N of M" on a partial capture; absent when there is no manifest to count.
   */
  totalStories?: number;
  /**
   * The reason string EXACTLY as the server returned it - a full-capture rung
   * code (main-branch, native-changed, manifest-missing, dry-run-error: ..., …)
   * or a path-legible partial summary (`captured 2 - closure changed via
   * src/components/Storefront/SharedButton.tsx`). Printed VERBATIM - never
   * re-rendered into module numbers or reworded.
   */
  reason: string;
};

/** One platform's inputs for the dry-run request (before it is mapped to wire form). */
export type DryRunPlatformRequest = {
  platform: Platform;
  /** test:bundled is a bundled (staged) upload. */
  bundled: boolean;
  /** This platform's base identity (the base fingerprint), or undefined if none. */
  baseReference?: string;
  /** The validated module manifest this build produced, or undefined if none. */
  manifest?: ValidatedModuleManifest;
};

export type DryRunDecisionInput = {
  client: DryRunDecisionClient;
  /** The SAME git info openBuild is given - reuse it, do not build a second one. */
  gitInfo: GitInfo;
  projectIndex: number;
  teamId: string;
  platforms: DryRunPlatformRequest[];
};

/**
 * Thrown when the `computeDiffScopeDryRun` query method is not present on the
 * sdk-client at runtime (the api-side method has not been republished into this
 * repo's sdk-client yet). runDryRunPreview catches it and bails open.
 */
export const DRY_RUN_DECISION_UNAVAILABLE =
  'The Diff Scope dry-run decision query (computeDiffScopeDryRun) is not available on this sdk-client build.';

// ---------------------------------------------------------------------------
// Public API - the contract seam
// ---------------------------------------------------------------------------

/**
 * Ask the server which stories a real run would capture, for ALL platforms at
 * once, given each build's module manifest. Read-only: creates nothing.
 *
 * Returns one {@link DryRunPlatformDecision} per platform the server answered
 * for. Throws on any transport/parse uncertainty (or a null result) so the
 * caller bails open for every platform rather than showing a confident wrong
 * partial. An in-band server bail-open (`isFullCapture: true` +
 * `reason: "dry-run-error: ..."`) is a normal decided result, NOT a throw.
 */
export async function requestDryRunDecision(
  input: DryRunDecisionInput
): Promise<DryRunPlatformDecision[]> {
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Requesting dry-run Diff Scope decision',
    data: {
      projectIndex: input.projectIndex,
      teamId: input.teamId,
      platforms: input.platforms.map((p) => p.platform),
    },
    level: 'info',
  });

  const query = input.client.computeDiffScopeDryRun;
  if (typeof query !== 'function') {
    // The api-side method is not wired into this sdk-client build yet -> bail open.
    throw new Error(DRY_RUN_DECISION_UNAVAILABLE);
  }

  // Local "M" for each platform's "N of M" line: the story-closure count in the
  // manifest THIS build just produced. There is no server total field.
  const totalByPlatform = new Map<Platform, number>();
  for (const p of input.platforms) {
    if (p.manifest) {
      totalByPlatform.set(p.platform, countBundleStories(p.manifest));
    }
  }

  const platforms: DiffScopeDryRunPlatformInput[] = input.platforms.map((p) => ({
    platform: p.platform,
    bundled: p.bundled,
    // Omit rather than send empty - an absent base is the "native-changed" signal.
    ...(p.baseReference ? { baseReference: p.baseReference } : {}),
    // Upload the serializer's EXACT bytes as the JSON string; absent -> the
    // server previews manifest-missing (full) for this platform.
    ...(p.manifest ? { manifest: p.manifest.raw.toString('utf8') } : {}),
  }));

  const result = await query({
    projectIndex: input.projectIndex,
    teamId: input.teamId,
    gitInfo: input.gitInfo,
    platforms,
  });

  if (!result || !Array.isArray(result.platforms)) {
    // A null / malformed result is uncertainty -> bail open for every platform.
    throw new Error('The Diff Scope dry-run decision returned no platform results.');
  }

  return result.platforms.map((r: DiffScopeDryRunPlatformResult) => ({
    platform: r.platform,
    isFullCapture: r.isFullCapture,
    // Defensive: the SDL guarantees a list, but never render undefined as a list.
    capturedStoryFilePaths: Array.isArray(r.capturedStoryFilePaths) ? r.capturedStoryFilePaths : [],
    reason: r.reason,
    totalStories: totalByPlatform.get(r.platform),
  }));
}

export default requestDryRunDecision;
