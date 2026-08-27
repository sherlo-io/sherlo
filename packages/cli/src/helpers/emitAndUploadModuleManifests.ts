/**
 * The EAS-update road's module-manifest producer pass (SHERLO-1943).
 *
 * `sherlo test:eas-update` registers a user-supplied PRE-BUILT development
 * binary as the base, and the JS it renders arrives through the EAS update -
 * a development build has no embedded bundle a fresh one could be spliced
 * into. To let a later run compare its module manifest against an ancestor,
 * this road runs Sherlo's OWN bundling pass here purely to produce that
 * manifest - the EXACT same producer the other roads use
 * ({@link buildBundleForPlatform} from commands/test/buildBundle.ts, which
 * sets SHERLO_MODULE_MANIFEST=1 and reads the sidecar via
 * readValidatedModuleManifest). No second producer is implemented here: same
 * producer + same env header => guaranteed comparable with whatever manifest
 * the other roads would emit on the same tree.
 *
 * The standard road (`sherlo test --android <apk>`) does NOT come through
 * here: it keeps the bundle this pass would throw away and renders it - see
 * ./uploadFreshBundles.
 *
 * HARD PROVENANCE GUARD: because the binary is user-supplied and renders JS
 * this CLI did not build, the CLI can only vouch that a manifest built from
 * the CURRENT working tree actually describes that run's provenance when the
 * tree is clean and the commit is known. When it can't vouch, this pass is
 * skipped entirely (no bundling, no upload, no manifestS3Key) and one plain
 * line states why - degrading to a cold-start full run, never to a wrong
 * partial one.
 *
 * Fail-soft throughout: any bundling, upload-slot, or upload failure is
 * logged and swallowed. A module-manifest problem can never fail or slow down
 * (beyond the one bundling pass) the run.
 */
import zlib from 'zlib';
import { Platform, StagedPlatformUploadUrls, StagedPresignedUploadUrl } from '@sherlo/api-types';
import sdkClient from '@sherlo/sdk-client';
import { PLATFORM_LABEL } from '../constants';
import { buildBundleForPlatform } from '../commands/test/buildBundle';
import { putBuffer } from '../commands/test/uploadStagedArtifacts';
import type { GitInfo } from './getGitInfo';
import logWarning from './logWarning';
import { emit } from './transcriptSink';

/**
 * getStagedUploadUrls with the SHERLO-1894 `manifest` slot. Optional on
 * purpose - see the identical local extension in uploadStagedArtifacts.ts.
 */
type StagedUploadUrlsWithManifest = StagedPlatformUploadUrls & {
  manifest?: StagedPresignedUploadUrl;
};

export type ModuleManifestUploadResult = Partial<Record<Platform, string>>;

/**
 * The three effects this pass performs, as parameters so an expectation producer
 * runs THIS function rather than a re-implementation of it.
 *
 * The manifest block's transcript - the `📄 Producing...` header, the per-platform
 * `✓ uploaded` lines, and the four fail-soft warnings that replace them - is
 * emitted from here, interleaved with these awaits and their `try`/`catch`
 * branching. Supplying the effects is what lets a scenario exercise a failure
 * path (an upload-slot request that throws) that a live e2e can only reach by
 * provoking a backend outage.
 */
export type ManifestEffects = {
  bundleFor: (
    projectRoot: string,
    platform: Platform
  ) => Promise<{ moduleManifest?: { raw: Buffer } }>;
  requestUploadSlots: (params: {
    platforms: Platform[];
    projectIndex: number;
    teamId: string;
  }) => Promise<{
    stagedPresignedUploadUrls: Partial<Record<Platform, StagedUploadUrlsWithManifest>>;
  }>;
  putManifest: (params: { platform: Platform; uploadUrl: string; buffer: Buffer }) => Promise<void>;
};

export function realManifestEffects(client: ReturnType<typeof sdkClient>): ManifestEffects {
  return {
    bundleFor: (projectRoot, platform) => buildBundleForPlatform({ projectRoot, platform }),
    requestUploadSlots: (params) => client.getStagedUploadUrls(params),
    putManifest: ({ platform, uploadUrl, buffer }) =>
      putBuffer({ platform, label: 'module manifest', uploadUrl, buffer }),
  };
}

// ---------------------------------------------------------------------------
// Provenance guard
// ---------------------------------------------------------------------------

export type ProvenanceAssessment = { vouched: true } | { vouched: false; reason: string };

/**
 * Can the CLI vouch that a manifest built from the CURRENT working tree
 * describes the SAME provenance as the pre-built binary this road is about to
 * register? Only when:
 *  - the working tree is clean (`isDirty === false`, not merely falsy - an
 *    UNDETERMINED dirtiness must refuse, not pass), AND
 *  - commit metadata is present and not the getGitInfo `'unknown'` sentinel.
 *
 * A wrong-commit / dirty-tree prebuilt binary must NEVER gain a lying
 * manifest, so both checks default to refusing when uncertain.
 */
export function assessManifestProvenance(gitInfo: GitInfo): ProvenanceAssessment {
  if (gitInfo.isDirty !== false) {
    return {
      vouched: false,
      reason: 'the git working tree is dirty (or its cleanliness could not be determined)',
    };
  }

  if (
    !gitInfo.commitHash ||
    gitInfo.commitHash === 'unknown' ||
    !gitInfo.commitName ||
    gitInfo.commitName === 'unknown'
  ) {
    return { vouched: false, reason: 'commit metadata could not be determined' };
  }

  return { vouched: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Produces + uploads the per-platform module manifest for an EAS-update
 * registration, guarded by {@link assessManifestProvenance}.
 *
 * Returns the per-platform manifest S3 key to mirror onto the openBuild
 * buildRunConfig (the same `manifestS3Key` wiring the staged road uses).
 * Absent entries mean "send nothing extra" - never a fabricated key.
 */
export async function emitAndUploadModuleManifests({
  client,
  projectRoot,
  platforms,
  gitInfo,
  projectIndex,
  teamId,
  effects,
}: {
  client: ReturnType<typeof sdkClient>;
  projectRoot: string;
  platforms: Platform[];
  gitInfo: GitInfo;
  projectIndex: number;
  teamId: string;
  effects?: ManifestEffects;
}): Promise<ModuleManifestUploadResult> {
  const io = effects ?? realManifestEffects(client);

  if (platforms.length === 0) return {};

  const provenance = assessManifestProvenance(gitInfo);
  if (!provenance.vouched) {
    logWarning({
      message: `Module manifest skipped - ${provenance.reason}; degrading to a full capture.`,
    });
    return {};
  }

  emit({ kind: 'manifest-producing' });

  // 1. Build the bundle for each platform via the EXACT staged-road producer,
  //    purely to obtain the manifest sidecar it emits. Fail-soft per platform:
  //    a bundling failure here must never block the real run.
  const manifests: Partial<Record<Platform, Buffer>> = {};

  for (const platform of platforms) {
    try {
      const { moduleManifest } = await io.bundleFor(projectRoot, platform);
      if (moduleManifest) {
        manifests[platform] = moduleManifest.raw;
      }
    } catch (error) {
      logWarning({
        message:
          `Could not produce the ${PLATFORM_LABEL[platform]} module manifest ` +
          `(${error instanceof Error ? error.message : String(error)}); continuing without it.`,
      });
    }
  }

  const platformsWithManifest = platforms.filter(
    (platform): platform is Platform => manifests[platform] !== undefined
  );
  if (platformsWithManifest.length === 0) return {};

  // 2. Request staged manifest upload slots - mirrors testBundled.ts's
  //    getStagedUploadUrls call exactly (same API, same wire shape).
  let stagedPresignedUploadUrls: Partial<Record<Platform, StagedUploadUrlsWithManifest>>;
  try {
    ({ stagedPresignedUploadUrls } = await io.requestUploadSlots({
      platforms: platformsWithManifest,
      projectIndex,
      teamId,
    }));
  } catch (error) {
    logWarning({
      message:
        'Could not request module manifest upload slots ' +
        `(${error instanceof Error ? error.message : String(error)}); continuing without them.`,
    });
    return {};
  }

  // 3. Gzip + PUT each manifest's raw bytes, same as uploadStagedArtifacts.ts's
  //    manifest branch. Bail-open per platform: an upload-slot miss or a PUT
  //    failure is warned and skipped, never fatal.
  const result: ModuleManifestUploadResult = {};

  for (const platform of platformsWithManifest) {
    const manifestRaw = manifests[platform];
    const manifestUrl = stagedPresignedUploadUrls[platform]?.manifest;
    if (!manifestRaw || !manifestUrl) continue;

    try {
      const gzipped = zlib.gzipSync(manifestRaw);
      await io.putManifest({ platform, uploadUrl: manifestUrl.url, buffer: gzipped });
      result[platform] = manifestUrl.s3Key;
      emit({ kind: 'manifest-uploaded', platform });
    } catch (error) {
      logWarning({
        message:
          `Failed to upload the ${PLATFORM_LABEL[platform]} module manifest ` +
          `(${error instanceof Error ? error.message : String(error)}); continuing without it.`,
      });
    }
  }

  return result;
}

export default emitAndUploadModuleManifests;
