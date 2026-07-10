/**
 * Shared vocabulary for the staged fast-path gate (SHERLO-1692).
 *
 * The server's `checkStagedGate` query answers per platform with a
 * `GateOutcome` ("fast" | "full-build-needed" | "not-stageable") plus the named
 * `GateDiffSource`s that moved. This module turns those raw server values into
 * the CLI-facing vocabulary that BOTH `staged:check` and `test:bundled` speak,
 * so the routing decision reads the same everywhere:
 *
 *   - `StagedMode`         - the three routing outcomes (fast / full / not-stageable).
 *   - `outcomeToMode`      - maps one server GateOutcome to its StagedMode.
 *   - `resolveOverallMode` - worst-outcome-wins across the tested platforms.
 *   - `describeDiffSources`- human-readable names for the changed gate fields.
 *
 * This is pure mapping and wording. It performs NO gate check itself - the gate
 * check is `sdkClient.checkStagedGate`.
 */
import { GateDiffSource, GateOutcome } from '@sherlo/api-types';

/**
 * The three routing outcomes surfaced to CI. Mirrors the server's GateOutcome
 * but uses the shorter `full` label the CLI and its exit-code contract use.
 */
export type StagedMode = 'fast' | 'full' | 'not-stageable';

/** Map a single server GateOutcome to its CLI StagedMode. */
export function outcomeToMode(outcome: GateOutcome): StagedMode {
  switch (outcome) {
    case 'fast':
      return 'fast';
    case 'full-build-needed':
      return 'full';
    case 'not-stageable':
      return 'not-stageable';
  }
}

/**
 * Severity of each mode for the "worst outcome wins" rule. A staged run can
 * only take the fast path when EVERY tested platform is fast; a single
 * not-stageable platform forces the whole run off the staged path.
 */
const MODE_SEVERITY: Record<StagedMode, number> = {
  fast: 0,
  full: 1,
  'not-stageable': 2,
};

/**
 * Collapse per-platform modes into one routing decision: the most severe mode
 * wins (not-stageable > full > fast). An empty list is treated as
 * not-stageable - there is nothing to stage against.
 */
export function resolveOverallMode(modes: StagedMode[]): StagedMode {
  let worst: StagedMode = 'fast';

  if (modes.length === 0) return 'not-stageable';

  for (const mode of modes) {
    if (MODE_SEVERITY[mode] > MODE_SEVERITY[worst]) {
      worst = mode;
    }
  }

  return worst;
}

/** Human-readable labels for the machine-readable gate diff sources. */
export const GATE_DIFF_LABELS: Record<GateDiffSource, string> = {
  engineClass: 'JS engine (Hermes/JSC)',
  assetInventory: 'bundled assets',
  expoUpdatesEnabled: 'expo-updates configuration',
  sdkProtocolVersion: 'Sherlo SDK protocol version',
  buildMetadata: 'native build metadata',
  bundleFormat: 'JS bundle format (HBC/plain JS/RAM)',
};

/**
 * Render a list of changed gate diff sources into a comma-separated,
 * human-readable string (e.g. "JS engine (Hermes/JSC), bundled assets").
 * Returns an empty string when nothing changed.
 */
export function describeDiffSources(diff: GateDiffSource[]): string {
  return diff.map((source) => GATE_DIFF_LABELS[source] ?? source).join(', ');
}
