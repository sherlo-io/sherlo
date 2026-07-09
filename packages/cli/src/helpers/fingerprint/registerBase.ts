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
export async function registerBase(params: RegisterBaseParams): Promise<RegisterBaseResult> {
  const { binaryPath, platform, projectRoot, bundlePath, buildType, baseFingerprintHash } = params;

  // ------------------------------------------------------------------
  // 1. Compute baseFingerprint (Layer 1-3), unless pre-computed.
  // ------------------------------------------------------------------
  let fpHash: string | null;

  if (baseFingerprintHash !== undefined) {
    fpHash = baseFingerprintHash;
  } else {
    const fpResult = await computeBaseFingerprint(projectRoot);
    if (fpResult.hash === null) {
      console.log(
        `[Sherlo] Staged uploads unavailable - ${
          fpResult.debugMessage ?? 'fingerprint computation failed'
        }`
      );
      return { registered: false, notStageableReason: fpResult.debugMessage };
    }
    fpHash = fpResult.hash;
  }

  if (fpHash === null) {
    console.log('[Sherlo] Staged uploads unavailable - fingerprint computation returned null');
    return { registered: false };
  }

  console.log(`[Sherlo] baseFingerprint: ${fpHash}`);

  // ------------------------------------------------------------------
  // 2. Extract gate metadata from the binary.
  // ------------------------------------------------------------------
  let gateMetadata: GateMetadataInput;
  try {
    gateMetadata = await extractGateMetadata({
      binaryPath,
      platform,
      projectRoot,
      bundlePath,
    });
  } catch (err) {
    console.log(
      `[Sherlo] Staged uploads unavailable - gate metadata extraction failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
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
    console.log(
      `[Sherlo] Staged uploads unavailable - ${
        stageableCheck.reason ?? 'artifact is not stageable'
      }`
    );
    return {
      registered: false,
      baseFingerprint: fpHash,
      gateMetadata,
      notStageableReason: stageableCheck.reason,
    };
  }

  // ------------------------------------------------------------------
  // 4. Print registration metadata summary.
  // ------------------------------------------------------------------
  console.log(
    '[Sherlo] Staged registration metadata computed:\n' +
      `  baseFingerprint: ${fpHash}\n` +
      `  engineClass: ${gateMetadata.engineClass}\n` +
      `  bundleFormat: ${gateMetadata.bundleFormat}\n` +
      `  hasEmbeddedBundle: ${gateMetadata.hasEmbeddedBundle}\n` +
      `  expoUpdatesEnabled: ${gateMetadata.expoUpdatesEnabled}\n` +
      `  sdkProtocolVersion: ${gateMetadata.sdkProtocolVersion ?? 'unknown'}\n` +
      `  assets: ${gateMetadata.assetInventory.length} items`
  );

  return {
    registered: true,
    baseFingerprint: fpHash,
    gateMetadata,
  };
}
