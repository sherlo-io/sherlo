/**
 * test:standard's module-manifest producer pass (SHERLO-1943).
 *
 * test:standard registers a user-supplied PRE-BUILT binary as the stageable
 * base; it has no bundling step of its own. To let a later staged run
 * compare its module manifest against an ancestor, test:standard runs
 * Sherlo's OWN bundling pass here purely to produce that manifest - the EXACT
 * same producer the staged road uses ({@link buildBundleForPlatform} from
 * commands/test/buildBundle.ts, which sets SHERLO_MODULE_MANIFEST=1 and
 * reads the sidecar via readValidatedModuleManifest). No second producer is
 * implemented here: same producer + same env header => guaranteed comparable
 * with whatever manifest the staged road would emit on the same tree.
 *
 * HARD PROVENANCE GUARD: because test:standard's binary is user-supplied
 * (requirePlatformPaths: true), the CLI can only vouch that a manifest built
 * from the CURRENT working tree actually describes that binary's provenance
 * when the tree is clean and the commit is known. When it can't vouch, this
 * pass is skipped entirely (no bundling, no upload, no manifestS3Key) and one
 * plain line states why - degrading to today's cold-start full run, never to
 * a wrong partial one.
 *
 * Fail-soft throughout: any bundling, upload-slot, or upload failure is
 * logged and swallowed. A module-manifest problem can never fail or slow down
 * (beyond the one bundling pass) a test:standard run.
 */
import zlib from 'zlib';
import { Platform, StagedPlatformUploadUrls, StagedPresignedUploadUrl } from '@sherlo/api-types';
import sdkClient from '@sherlo/sdk-client';
import chalk from 'chalk';
import { PLATFORM_LABEL } from '../constants';
import { buildBundleForPlatform } from '../commands/test/buildBundle';
import { putBuffer } from '../commands/test/uploadStagedArtifacts';
import type { GitInfo } from './getGitInfo';
import logWarning from './logWarning';

/**
 * getStagedUploadUrls with the SHERLO-1894 `manifest` slot. Optional on
 * purpose - see the identical local extension in uploadStagedArtifacts.ts.
 */
type StagedUploadUrlsWithManifest = StagedPlatformUploadUrls & {
  manifest?: StagedPresignedUploadUrl;
};

export type ModuleManifestUploadResult = Partial<Record<Platform, string>>;

// ---------------------------------------------------------------------------
// Provenance guard
// ---------------------------------------------------------------------------

export type ProvenanceAssessment = { vouched: true } | { vouched: false; reason: string };

/**
 * Can the CLI vouch that a manifest built from the CURRENT working tree
 * describes the SAME provenance as the pre-built binary test:standard is
 * about to register? Only when:
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
 * Produces + uploads the per-platform module manifest for a test:standard
 * registration, guarded by {@link assessManifestProvenance}.
 *
 * Returns the per-platform manifest S3 key to mirror onto the openBuild
 * buildRunConfig (mirrors testBundled.ts's `manifestS3Key` wiring exactly).
 * Absent entries mean "send nothing extra" - never a fabricated key.
 */
export async function emitAndUploadModuleManifests({
  client,
  projectRoot,
  platforms,
  gitInfo,
  projectIndex,
  teamId,
}: {
  client: ReturnType<typeof sdkClient>;
  projectRoot: string;
  platforms: Platform[];
  gitInfo: GitInfo;
  projectIndex: number;
  teamId: string;
}): Promise<ModuleManifestUploadResult> {
  if (platforms.length === 0) return {};

  const provenance = assessManifestProvenance(gitInfo);
  if (!provenance.vouched) {
    logWarning({
      message: `Module manifest skipped - ${provenance.reason}; degrading to a full capture.`,
    });
    return {};
  }

  console.log(chalk.cyan('\n📄 Producing the module manifest for Diff Scope...'));

  // 1. Build the bundle for each platform via the EXACT staged-road producer,
  //    purely to obtain the manifest sidecar it emits. Fail-soft per platform:
  //    a bundling failure here must never block test:standard's real run.
  const manifests: Partial<Record<Platform, Buffer>> = {};

  for (const platform of platforms) {
    try {
      const { moduleManifest } = await buildBundleForPlatform({ projectRoot, platform });
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
    ({ stagedPresignedUploadUrls } = await client.getStagedUploadUrls({
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
      await putBuffer({
        platform,
        label: 'module manifest',
        uploadUrl: manifestUrl.url,
        buffer: gzipped,
      });
      result[platform] = manifestUrl.s3Key;
      console.log(chalk.green(`  ✓ ${PLATFORM_LABEL[platform]} module manifest uploaded`));
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
