/**
 * Staged gate-refusal parsing for the staged road of `sherlo test` (SHERLO-1707).
 *
 * When a staged openBuild's server-side gate resolves to anything other than
 * "fast" it throws a graphQL error whose MESSAGE carries a machine-parseable
 * payload:
 *
 *   STAGED_GATE_REFUSAL|<outcome>|<platform>|<comma-separated-diff>
 *   e.g. STAGED_GATE_REFUSAL|full-build-needed|android|engineClass,assetInventory
 *
 * The wire format is defined by the openBuild resolver (@sherlo/api-types,
 * `StagedGateRefusal`). This module extracts it back into a typed struct. Keep
 * the prefix + field order in lock-step with the resolver.
 */
import { GateDiffSource, GateOutcome } from '@sherlo/api-types';
import type { StoredBaseSources } from '../../seams/serverCalls';

/** Machine-parseable prefix emitted by the openBuild resolver on refusal. */
export const STAGED_GATE_REFUSAL_PREFIX = 'STAGED_GATE_REFUSAL';

export type StagedGateRefusal = {
  /** Machine-readable gate outcome (never "fast" - that path doesn't refuse). */
  outcome: GateOutcome;
  /** The platform whose gate refused. */
  platform: 'android' | 'ios';
  /** Named diff sources (empty for not-stageable). */
  diff: GateDiffSource[];
  /**
   * The stored app build's source list, when the gate handed one back - only `checkStagedGate`
   * does; the refusal string above never carries it.
   */
  storedBase?: StoredBaseSources;
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
