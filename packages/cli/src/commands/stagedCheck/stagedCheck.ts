/**
 * staged:check command (SHERLO-1692) - a CI routing probe for the staged fast
 * path. Answers mode=fast|full|not-stageable (+ a human reason) WITHOUT
 * bundling, uploading, or opening a build, so it can run right after dependency
 * install with no build artifacts on hand.
 *
 * The outcome is a ROUTING decision, not a pass/fail result: every mode below
 * exits cleanly via reportAndExit's contractual code (see ./constants) rather
 * than throwing, so CI never sees an expected state as a crash. Only a genuine
 * tool error (bad token, network failure) throws and falls through to the CLI's
 * normal error path.
 *
 * The gate check goes through `sdkClient.checkStagedGate` (SHERLO-1718), called
 * once per configured platform. It takes the source-computed base fingerprint
 * and no gate metadata (there is no binary to inspect), so the decision rests on
 * whether that fingerprint still matches a registered base.
 */
import sdkClient from '@sherlo/sdk-client';
import { Platform } from '@sherlo/api-types';
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
import { computeBaseFingerprint } from '../../helpers/fingerprint';
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
  const fpResult = await computeBaseFingerprint(commandParams.projectRoot);
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

  // Ask the gate per platform. checkStagedGate is per-platform; staged:check has
  // no binary, so it sends empty gate metadata and lets the fingerprint match
  // drive the outcome.
  const decisions: PlatformDecision[] = [];
  for (const platform of platforms) {
    const { outcome, diff } = await client.checkStagedGate({
      baseFingerprint,
      gateMetadata: {},
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
