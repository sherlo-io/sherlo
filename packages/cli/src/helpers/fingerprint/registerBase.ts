/**
 * Base registration - computes the baseFingerprint + gate metadata and
 * registers the already-uploaded binary as the stageable base.
 *
 * Registration is FAIL-SOFT: if anything goes wrong (not-stageable artifact,
 * fingerprint computation failure, API error), a diagnostic message is printed
 * and the test run proceeds UNCHANGED.
 *
 * Registration adds ZERO extra binary upload - the binary is already uploaded
 * by the existing flow; only metadata is attached.
 */
import { Platform } from '@sherlo/api-types';
import { computeBaseFingerprint } from './baseFingerprint';
import { extractGateMetadata, type GateMetadataInput } from './gateMetadata';
import { checkStageable } from './notStageable';
import logWarning from '../logWarning';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RegisterBaseParams = {
  /** Absolute path to the binary file (.apk, .app, .tar, .tar.gz). */
  binaryPath: string;
  /** Platform of this binary. */
  platform: Platform;
  /** Project root directory. */
  projectRoot: string;
  /** Path to the JS bundle within the binary (e.g. "assets/index.android.bundle"). */
  bundlePath: string;
  /** 'preview' when the binary has an embedded bundle, 'development' otherwise. */
  buildType: 'preview' | 'development';
  /**
   * Pre-computed base fingerprint hash.  When omitted the fingerprint is
   * computed internally.  Callers that register multiple platforms pass a
   * single project-level hash computed once.
   */
  baseFingerprintHash?: string | null;
  /**
   * CLI command that triggered registration - passed through to the fingerprint
   * computation when it runs internally, for its reporting breadcrumb. No
   * effect on the hash.
   */
  command?: string;
};

/**
 * The one effect base registration performs that reaches the filesystem: reading
 * the binary to derive its gate metadata.
 *
 * A parameter so an expectation producer runs THIS function - `checkStageable`
 * is pure and stays real, so the not-stageable REASON a transcript prints comes
 * from the shipped rule set, never from a scenario. A scenario supplies the
 * metadata a binary would have had; the sentence about it is the CLI's.
 */
export type BaseRegistrationEffects = {
  extractGateMetadataFor: (params: {
    binaryPath: string;
    platform: Platform;
    projectRoot: string;
    bundlePath: string;
  }) => Promise<GateMetadataInput>;
};

export type RegisterBaseResult = {
  /** The computed base fingerprint hash, if stageable. */
  baseFingerprint?: string;
  /** Gate metadata extracted from the binary (per-platform). */
  gateMetadata?: GateMetadataInput;
  /** When not stageable, a human-readable reason (already printed). */
  notStageableReason?: string;
  /** Whether the base was successfully registered and is stageable. */
  registered: boolean;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute base fingerprint + gate metadata, validate stageability, and
 * register the uploaded binary as the stageable base.
 *
 * Fail-soft: NEVER throws.  Errors are printed and the caller proceeds.
 */
export const REAL_BASE_REGISTRATION_EFFECTS: BaseRegistrationEffects = {
  extractGateMetadataFor: (params) => extractGateMetadata(params),
};

export async function registerBase(
  params: RegisterBaseParams,
  effects: BaseRegistrationEffects = REAL_BASE_REGISTRATION_EFFECTS
): Promise<RegisterBaseResult> {
  const { binaryPath, platform, projectRoot, bundlePath, buildType, baseFingerprintHash, command } =
    params;

  // ------------------------------------------------------------------
  // 1. Compute baseFingerprint (Layer 1-3), unless pre-computed.
  // ------------------------------------------------------------------
  let fpHash: string | null;

  if (baseFingerprintHash !== undefined) {
    fpHash = baseFingerprintHash;
  } else {
    const fpResult = await computeBaseFingerprint(projectRoot, { command });
    if (fpResult.hash === null) {
      logWarning({
        message: `Staged uploads unavailable - ${
          fpResult.debugMessage ?? 'fingerprint computation failed'
        }`,
      });
      return { registered: false, notStageableReason: fpResult.debugMessage };
    }
    fpHash = fpResult.hash;
  }

  if (fpHash === null) {
    logWarning({
      message: 'Staged uploads unavailable - fingerprint computation returned null',
    });
    return { registered: false };
  }

  // ------------------------------------------------------------------
  // 2. Extract gate metadata from the binary.
  // ------------------------------------------------------------------
  let gateMetadata: GateMetadataInput;
  try {
    gateMetadata = await effects.extractGateMetadataFor({
      binaryPath,
      platform,
      projectRoot,
      bundlePath,
    });
  } catch (err) {
    logWarning({
      message: `Staged uploads unavailable - gate metadata extraction failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    return { registered: false };
  }

  // ------------------------------------------------------------------
  // 3. Check stageability (aligned with API failReason derivation).
  // ------------------------------------------------------------------
  const stageableCheck = await checkStageable({
    platform,
    gateMetadata,
    buildType,
  });

  if (!stageableCheck.stageable) {
    // Loud, but still fail-soft: registration is refused as INELIGIBLE, so make
    // it visible in CLI output instead of a silent no-op (SHERLO-1744). The test
    // run itself proceeds unchanged.
    logWarning({
      message: `Staged uploads unavailable - ${
        stageableCheck.reason ?? 'artifact is not stageable'
      }`,
    });
    return {
      registered: false,
      baseFingerprint: fpHash,
      gateMetadata,
      notStageableReason: stageableCheck.reason,
    };
  }

  return {
    registered: true,
    baseFingerprint: fpHash,
    gateMetadata,
  };
}
