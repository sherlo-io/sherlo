/**
 * Staged gate-refusal parsing for the test:bundled command (SHERLO-1707).
 *
 * When a staged openBuild's server-side gate resolves to anything other than
 * "fast" it throws a graphQL error whose MESSAGE carries a machine-parseable
 * payload:
 *
 *   STAGED_GATE_REFUSAL|<outcome>|<platform>|<comma-separated-diff>
 *   e.g. STAGED_GATE_REFUSAL|full-build-needed|android|engineClass,assetInventory
 *
 * The wire format is defined by the openBuild resolver (@sherlo/api-types,
 * `StagedGateRefusal`). This module extracts it back into a typed struct and
 * renders the user-facing refusal (named diff sources + the test:standard
 * fallback line). Keep the prefix + field order in lock-step with the resolver.
 */
import { GateDiffSource, GateOutcome } from '@sherlo/api-types';
import { TEST_STANDARD_COMMAND } from '../../constants';

/** Machine-parseable prefix emitted by the openBuild resolver on refusal. */
export const STAGED_GATE_REFUSAL_PREFIX = 'STAGED_GATE_REFUSAL';

/**
 * The test:standard fallback line appended to every refusal. Kept identical to
 * buildBundle's FALLBACK_LINE wording so the "run a full build" guidance is
 * consistent across every test:bundled exit path.
 */
export const FALLBACK_LINE = `Run \`sherlo ${TEST_STANDARD_COMMAND}\` for a full build with the same options.`;

export type StagedGateRefusal = {
  /** Machine-readable gate outcome (never "fast" - that path doesn't refuse). */
  outcome: GateOutcome;
  /** The platform whose gate refused. */
  platform: 'android' | 'ios';
  /** Named diff sources (empty for not-stageable). */
  diff: GateDiffSource[];
};

/**
 * Parse a caught error into a {@link StagedGateRefusal}, or return null when the
 * error is NOT a staged gate refusal (network error, auth error, …).
 *
 * Pinned to the exact wire format
 * `STAGED_GATE_REFUSAL|<outcome>|<platform>|<comma-separated-diff>`. The diff is
 * the final field, so a diff value can never contain a `|`; commas separate the
 * individual diff sources.
 */
export function parseStagedGateRefusal(error: unknown): StagedGateRefusal | null {
  const message = extractMessage(error);
  if (!message) return null;

  const parts = message.split('|');
  if (parts[0] !== STAGED_GATE_REFUSAL_PREFIX) return null;
  // Require at least prefix|outcome|platform. The diff field is optional
  // (empty for not-stageable).
  if (parts.length < 3) return null;

  const outcome = parts[1] as GateOutcome;
  const platform = parts[2] as 'android' | 'ios';
  const diff = (parts[3] ?? '')
    .split(',')
    .map((source) => source.trim())
    .filter(Boolean) as GateDiffSource[];

  return { outcome, platform, diff };
}

/** Best-effort extraction of a string message from any caught value. */
function extractMessage(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

/** Human-readable labels for the machine-readable diff sources. */
const DIFF_LABELS: Record<GateDiffSource, string> = {
  engineClass: 'JS engine (Hermes/JSC)',
  assetInventory: 'bundled assets',
  expoUpdatesEnabled: 'expo-updates configuration',
  sdkProtocolVersion: 'Sherlo SDK protocol version',
  buildMetadata: 'native build metadata',
  bundleFormat: 'JS bundle format (hbc/plain-js/ram)',
};

/** Human-readable reason per non-fast outcome. */
const OUTCOME_REASON: Record<Exclude<GateOutcome, 'fast'>, string> = {
  'full-build-needed': 'the native binary needs to be rebuilt',
  'not-stageable': "this project can't use the staged fast path",
};

/**
 * Render a refusal into the user-facing message: a one-line reason, the named
 * diff sources that changed (when present), and the test:standard fallback line.
 */
export function formatStagedGateRefusal(refusal: StagedGateRefusal): string {
  const platformLabel = refusal.platform === 'android' ? 'Android' : 'iOS';
  const reason =
    refusal.outcome === 'fast'
      ? 'the staged gate refused'
      : OUTCOME_REASON[refusal.outcome] ?? 'the staged gate refused';

  const lines = [`✗ Staged upload not possible for ${platformLabel}: ${reason}.`];

  if (refusal.diff.length > 0) {
    const named = refusal.diff.map((source) => DIFF_LABELS[source] ?? source).join(', ');
    lines.push(`Changed since the base build: ${named}.`);
  }

  lines.push(FALLBACK_LINE);

  return lines.join('\n');
}
