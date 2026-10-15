/**
 * Base registration - computes the platform's baseFingerprint + gate metadata
 * and registers the already-uploaded binary as the stageable base, with the
 * source list it was built from.
 *
 * Registration is FAIL-SOFT: if anything goes wrong (not-stageable artifact,
 * fingerprint computation failure, API error), a diagnostic message is printed
 * and the test run proceeds UNCHANGED.
 *
 * Registration adds ZERO extra binary upload - the binary is already uploaded
 * by the existing flow; only metadata is attached.
 */
import type { BaseSource, BaseSourceList, Platform } from '@sherlo/api-types';
import { autolinkedAsPackages } from '../../commands/fingerprint/diffFingerprintDocuments';
import {
  computeBaseFingerprint,
  type BaseFingerprintPreimage,
  type BaseFingerprintResult,
} from './baseFingerprint';
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
   * This platform's pre-computed base fingerprint.  When omitted the fingerprints
   * are computed internally and this platform's is taken.  Callers that register
   * several platforms compute every platform's once and pass each its own.
   */
  baseFingerprint?: BaseFingerprintResult;
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
  /**
   * What the app build was built from - the source list a push that stores this
   * base sends with it, so a later push can say what changed natively. Paths,
   * hashes and module versions, never a file's contents.
   */
  sourceList?: BaseSourceList;
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
  const { binaryPath, platform, projectRoot, bundlePath, buildType, command } = params;

  // ------------------------------------------------------------------
  // 1. This platform's baseFingerprint (Layer 1-3), unless pre-computed.
  // ------------------------------------------------------------------
  const fingerprint =
    params.baseFingerprint ?? (await computeBaseFingerprint(projectRoot, { command }))[platform];

  if (fingerprint.hash === null) {
    logWarning({
      message: `Staged uploads unavailable - ${
        fingerprint.debugMessage ?? 'fingerprint computation failed'
      }`,
    });
    return { registered: false, notStageableReason: fingerprint.debugMessage };
  }
  const fpHash = fingerprint.hash;
  const sourceList = fingerprint.preimage ? sourceListOf(fingerprint.preimage) : undefined;

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
      ...(sourceList ? { sourceList } : {}),
      gateMetadata,
      notStageableReason: stageableCheck.reason,
    };
  }

  return {
    registered: true,
    baseFingerprint: fpHash,
    ...(sourceList ? { sourceList } : {}),
    gateMetadata,
  };
}

/**
 * THE SOURCE LIST A STORED BASE KEEPS: what one platform's base fingerprint was
 * computed over - its native files and folders, its lockfiles as files, its
 * resolved settings by id, and its native modules with their versions. A native
 * folder Layer 1 hashed whole also lists its files, one hash each, so the list of
 * native changes can name the file that changed; those hashes never entered the
 * fingerprint. Paths, hashes and versions only, never a file's contents.
 */
export function sourceListOf(preimage: BaseFingerprintPreimage): BaseSourceList {
  const filesInside = (folder: string) =>
    preimage.nativeFolderFiles.filter((file) => file.path.startsWith(`${folder}/`));

  const nativeSources: BaseSource[] = preimage.nativeSources.map((source) => {
    const files = source.type === 'dir' ? filesInside(source.id) : [];
    return {
      path: source.id,
      hash: source.hash,
      kind: source.type,
      ...(files.length > 0 ? { files } : {}),
    };
  });

  const lockfiles: BaseSource[] = preimage.lockfiles.map((lockfile) => ({
    path: lockfile.file,
    hash: lockfile.digest,
    kind: 'file',
  }));

  return {
    sources: [...nativeSources, ...lockfiles],
    modules: autolinkedAsPackages(preimage.autolinkedModules).map(({ name, versions }) => ({
      name,
      version: versions[0] ?? 'unknown',
    })),
  };
}
