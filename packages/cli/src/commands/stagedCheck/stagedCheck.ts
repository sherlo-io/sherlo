/**
 * staged:check command (SHERLO-1692) - a CI routing probe for the staged fast
 * path. Answers mode=fast|full|not-stageable (+ a human reason) WITHOUT
 * uploading or opening a build, so it can run right after dependency install
 * with no build artifacts on hand.
 *
 * The outcome is a ROUTING decision, not a pass/fail result: every mode below
 * exits cleanly via reportAndExit's contractual code (see ./constants) rather
 * than throwing, so CI never sees an expected state as a crash. Only a genuine
 * tool error (bad token, network failure) throws and falls through to the CLI's
 * normal error path.
 *
 * The gate check goes through `sdkClient.checkStagedGate` (SHERLO-1718), called
 * once per configured platform. It sends the source-computed base fingerprint
 * AND real per-platform gate metadata: staged:check builds a production plain-JS
 * bundle and derives gate metadata via the SAME `buildBundleForPlatform` +
 * `buildGateMetadata` path test:bundled uses, so the two commands construct
 * identical metadata and cannot drift. The gate's comparators treat a
 * one-side-undefined field as a mismatch, so sending empty metadata would force
 * `full` even on a perfect fingerprint match - real metadata is what lets a
 * genuinely matching base answer `fast`.
 *
 * Building a plain-JS bundle is NOT a native build artifact - it is exactly what
 * test:bundled already does post-install, so the "runnable without build
 * artifacts" property is preserved; only a NATIVE binary is disallowed. If
 * bundling fails (e.g. not a stageable project), the command still exits cleanly
 * as not-stageable rather than throwing into the CLI error path.
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
import { computeBaseFingerprint } from '../../helpers/fingerprint';
import { Options } from '../../types';
import { JSON_OPTION } from '../../constants';
import { buildBundleForPlatform, buildGateMetadata } from '../testBundled/buildBundle';
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

  // Ask the gate per platform. checkStagedGate is per-platform. staged:check
  // builds a plain-JS bundle and derives REAL gate metadata via the same path
  // test:bundled uses, then sends it so a genuinely matching base can answer
  // `fast` (empty metadata would force `full` on every field comparison).
  const decisions: PlatformDecision[] = [];
  for (const platform of platforms) {
    let gateMetadata: GateMetadata;
    try {
      const bundleResult = await buildBundleForPlatform({
        projectRoot: commandParams.projectRoot,
        platform,
      });
      gateMetadata = (await buildGateMetadata({
        projectRoot: commandParams.projectRoot,
        platform,
        bundleResult,
      })) as GateMetadata;
    } catch (err) {
      // Bundling failed (not a stageable project, Hermes bytecode, version floor,
      // ...). Preserve the no-crash contract: exit cleanly as not-stageable rather
      // than throwing into the CLI error path.
      const message = err instanceof Error ? err.message : String(err);
      return reportAndExit({
        jsonOutput,
        mode: 'not-stageable',
        reason: `${platform}: cannot build a stageable bundle - ${firstLine(message)}`,
        baseFingerprint,
        platforms: [],
      });
    }

    const { outcome, diff } = await client.checkStagedGate({
      baseFingerprint,
      gateMetadata,
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

/**
 * Collapse a multi-line, user-facing bundler error down to its first non-empty
 * line so the routing `reason` stays single-line for GITHUB_OUTPUT / --json.
 */
function firstLine(message: string): string {
  const line = message
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? message.trim();
}
