/**
 * staged:check command (SHERLO-1692) - a CI routing probe for the staged fast
 * path. Answers mode=fast|full|not-stageable (+ a human reason) WITHOUT
 * building anything, so it can run right after dependency install with no build
 * artifacts - and no bundler run - on hand.
 *
 * The outcome is a ROUTING decision, not a pass/fail result: every mode below
 * exits cleanly via reportAndExit's contractual code (see ./constants) rather
 * than throwing, so CI never sees an expected state as a crash. Only a genuine
 * tool error (bad token, network failure) throws and falls through to the CLI's
 * normal error path.
 *
 * The gate check goes through `sdkClient.checkStagedGate` (SHERLO-1718), called
 * once per configured platform. It sends the source-computed base fingerprint
 * and gate metadata marked `derivedFrom: 'none'` carrying NO binary-identity
 * dimensions. A no-build probe cannot open an APK, so it must not fabricate
 * APK-derived facts; SHERLO-1761 excludes none/source-marked dimensions from the
 * identity diff and rests the decision on the fingerprint match alone. On a
 * match the deployed gate returns `fast` from the fingerprint; otherwise it
 * returns `full-build-needed` (a real native change) or `not-stageable` (no base
 * registered for this fingerprint yet).
 *
 * staged:check does NOT bundle: real bundling (and the Hermes/RAM/version-floor
 * stageability checks that come with it) is deferred to `test:bundled`, which
 * re-validates by actually building and falls back to `test:standard` if the
 * project turns out not to be bundle-stageable. A probe that optimistically
 * routes `fast` therefore never leaks a broken run - test:bundled is the gate
 * that catches it.
 */
import sdkClient from '@sherlo/sdk-client';
import { GateMetadata, Platform } from '@sherlo/api-types';
import {
  describeDiffSources,
  getPlatformsToTest,
  getTokenParts,
  getValidatedCommandParams,
  outcomeToMode,
  reporting,
  resolveOverallMode,
  type StagedMode,
} from '../../helpers';
import { computeBaseFingerprint, type GateMetadataInput } from '../../helpers/fingerprint';
import { Options } from '../../types';
import { JSON_OPTION } from '../../constants';
import reportAndExit, { type PlatformDecision } from './output';
import { THIS_COMMAND } from './constants';

async function stagedCheck(passedOptions: Options<THIS_COMMAND>): Promise<void> {
  const jsonOutput = Boolean(passedOptions[JSON_OPTION]);

  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: false }
  );

  const platforms = getPlatformsToTest(commandParams.devices);

  if (platforms.length === 0) {
    return reportAndExit({
      jsonOutput,
      mode: 'not-stageable',
      reason: 'No devices configured. Add devices in sherlo.config.json to determine platforms.',
      baseFingerprint: null,
      platforms: [],
    });
  }

  // Compute the base fingerprint from source (no binary required). A null hash
  // means the staged flow is unavailable for this project.
  const fpResult = await computeBaseFingerprint(commandParams.projectRoot, {
    command: THIS_COMMAND,
  });
  if (!fpResult.hash) {
    return reportAndExit({
      jsonOutput,
      mode: 'not-stageable',
      reason: `Base fingerprint unavailable - ${
        fpResult.debugMessage ?? 'fingerprint computation failed'
      }`,
      baseFingerprint: null,
      platforms: [],
    });
  }
  const baseFingerprint = fpResult.hash;

  const { apiToken, projectIndex, teamId } = getTokenParts(commandParams.token);
  const client = sdkClient({ authToken: apiToken });

  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling checkStagedGate API',
    data: { teamId, projectIndex, platforms },
    level: 'info',
  });

  // A no-build probe carries NO binary-identity dimensions - only the `none`
  // derivation marker. The deployed gate excludes none-marked dimensions from
  // the identity diff and answers `fast` on a fingerprint match alone.
  const gateMetadata: GateMetadataInput = { derivedFrom: 'none' };

  // Ask the gate per platform. checkStagedGate is per-platform.
  const decisions: PlatformDecision[] = [];
  for (const platform of platforms) {
    const { outcome, diff } = await client.checkStagedGate({
      baseFingerprint,
      gateMetadata: gateMetadata as GateMetadata,
      platform,
      projectIndex,
      teamId,
    });

    const mode = outcomeToMode(outcome);
    decisions.push({ platform, mode, diff, reason: platformReason(platform, mode, diff) });
  }

  const overallMode = resolveOverallMode(decisions.map((decision) => decision.mode));

  return reportAndExit({
    jsonOutput,
    mode: overallMode,
    reason: decisions.map((decision) => decision.reason).join('; '),
    baseFingerprint,
    platforms: decisions,
  });
}

export default stagedCheck;

/* ========================================================================== */

/** A platform-prefixed, human-readable reason for one platform's gate mode. */
function platformReason(
  platform: Platform,
  mode: StagedMode,
  diff: PlatformDecision['diff']
): string {
  if (mode === 'fast') {
    return `${platform}: fingerprint matches the registered base`;
  }

  if (mode === 'full') {
    const named = describeDiffSources(diff);
    return named
      ? `${platform}: changed since the base build: ${named}`
      : `${platform}: native inputs changed since the base build`;
  }

  return `${platform}: this project can't use the staged fast path`;
}
