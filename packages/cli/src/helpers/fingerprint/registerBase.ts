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
import { extractGateMetadata, type GateMetadata } from './gateMetadata';
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
  // TODO(SHERLO-1688): re-add buildIndex, projectIndex, teamId, apiToken
  // once they are wired onto openBuild/asyncUpload.
};

export type RegisterBaseResult = {
  /** The computed base fingerprint hash, if stageable. */
  baseFingerprint?: string;
  /** Gate metadata extracted from the binary. */
  gateMetadata?: GateMetadata;
  /** When not stageable, a human-readable reason (already printed). */
  notStageableReason?: string;
  /** Whether the base was successfully registered. */
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
  const { binaryPath, platform, projectRoot, bundlePath, buildType } = params;

  // ------------------------------------------------------------------
  // 1. Compute baseFingerprint (Layer 1-3).
  // ------------------------------------------------------------------
  const fpResult = await computeBaseFingerprint(projectRoot);

  if (fpResult.hash === null) {
    console.log(
      `[Sherlo] Staged uploads unavailable - ${
        fpResult.debugMessage ?? 'fingerprint computation failed'
      }`
    );
    return { registered: false, notStageableReason: fpResult.debugMessage };
  }

  console.log(`[Sherlo] baseFingerprint: ${fpResult.hash}`);

  // ------------------------------------------------------------------
  // 2. Extract gate metadata from the binary.
  // ------------------------------------------------------------------
  let gateMetadata: GateMetadata;
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
  // 3. Check stageability (AC3 cases).
  // ------------------------------------------------------------------
  const stageableCheck = await checkStageable({
    binaryPath,
    platform,
    bundlePath,
    gateMetadata,
    buildType,
    projectRoot,
  });

  if (!stageableCheck.stageable) {
    console.log(
      `[Sherlo] Staged uploads unavailable - ${
        stageableCheck.reason ?? 'artifact is not stageable'
      }`
    );
    return {
      registered: false,
      baseFingerprint: fpResult.hash,
      gateMetadata,
      notStageableReason: stageableCheck.reason,
    };
  }

  // ------------------------------------------------------------------
  // 4. Print what WOULD be registered.
  //
  // TODO(SHERLO-1688): attach baseFingerprint + gateMetadata as optional
  // fields on the existing openBuild/asyncUpload call once
  // @sherlo/sdk-client exposes them.  Registration rides the upload
  // already in flight - there is no separate registerBase mutation.
  // ------------------------------------------------------------------
  console.log(
    '[Sherlo] Staged registration metadata computed (wire integration pending - SHERLO-1688):\n' +
      `  baseFingerprint: ${fpResult.hash}\n` +
      `  engineClass: ${gateMetadata.engineClass}\n` +
      `  expoUpdatesEnabled: ${gateMetadata.expoUpdatesEnabled}\n` +
      `  assets: ${gateMetadata.assetInventory.length} items`
  );

  return {
    registered: true,
    baseFingerprint: fpResult.hash,
    gateMetadata,
  };
}
