/**
 * THE NATIVE BUILD SEAM - what a real push reads off THIS machine, and the bytes it sends up.
 *
 *     live   - the binary on disk, the project's native inputs, the wall clock, the uploads.
 *     posed  - the pose's `push`: what the binary would have said, what the fingerprint would
 *              have hashed to, what time it was. The uploads send nothing.
 *
 * `sherlo test --android <apk>` is the one command that opens a compiled binary - for its hash,
 * the Sherlo SDK baked into it, whether it embeds a JS bundle, its ABIs, its gate metadata - and
 * hashes a React Native project's native inputs to name the base it registers. None of that
 * exists on a machine that only has the pose. So every read of that kind is here, behind one
 * answer, and the shipped code between the reads - the validation, the reuse-or-upload branch,
 * the not-stageable rule, every printed line - runs unforked over what the pose states.
 *
 * WHAT A POSE DOES NOT STATE, BY DESIGN. It states no `buildType`: that is derived from whether
 * the binary embeds a bundle, by the shipped reader's own rule, and a pose that could set it
 * directly could describe a binary that cannot exist. It states no sentence about stageability:
 * `checkStageable` is pure and stays real, so the reason a transcript prints is the tool's own.
 *
 * THE CLOCK IS HERE TOO, because the push is the one command that reads it onto the screen - the
 * "7 minutes ago" of a reused binary - and a fixed scripted state read against the real clock
 * would render different bytes tomorrow.
 */
import { Platform, StagedPlatformUploadUrls } from '@sherlo/api-types';
import type { BaseFingerprintResult } from '../helpers/fingerprint';
import {
  computeBaseFingerprint,
  extractGateMetadata,
  type GateMetadataInput,
} from '../helpers/fingerprint';
import getLocalBinariesInfo, {
  type LocalBinariesInfo,
} from '../helpers/getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo';
import { REAL_BINARY_UPLOAD_EFFECTS } from '../helpers/uploadOrPrintBinaryReuse/uploadBuild';
import uploadStagedArtifacts, {
  type StagedUploadKeys,
} from '../commands/test/uploadStagedArtifacts';
import type { BundleResult } from '../commands/test/buildBundle';
import type { PosedBinary, PosedPush } from '../commands/pose/readPose';

/** Every read of the machine a real push makes, and every byte it sends up. */
export type NativeBuild = {
  /** The instant a reuse line's "N minutes ago" is measured against. */
  now(): Date;
  /** What the binaries handed to the command say about themselves. */
  readBinaries(params: {
    paths: { android?: string; ios?: string };
    platforms: Platform[];
    projectRoot: string;
  }): Promise<LocalBinariesInfo>;
  /** The bytes of one binary, and the size the upload line announces. */
  readBinaryForUpload(
    buildPath: string,
    platform: Platform,
    projectRoot: string
  ): Promise<{ data: Buffer; sizeMb: string }>;
  /** PUT one binary to its presigned slot. */
  putBinary(
    uploadUrl: string,
    data: Buffer
  ): Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;
  /** The hash over the project's native inputs that names the base this push registers. */
  computeFingerprint(projectRoot: string, command: string): Promise<BaseFingerprintResult>;
  /** The gate metadata read out of one binary. */
  extractGateMetadataFor(params: {
    binaryPath: string;
    platform: Platform;
    projectRoot: string;
    bundlePath: string;
  }): Promise<GateMetadataInput>;
  /** PUT one platform's fresh bundle, assets and manifest to their staged slots. */
  uploadStagedArtifacts(params: {
    platform: Platform;
    bundleResult: BundleResult;
    urls: StagedPlatformUploadUrls;
  }): Promise<StagedUploadKeys>;
};

/** The shipped answers: the machine, read for real. */
export const liveNativeBuild: NativeBuild = {
  now: () => new Date(),
  readBinaries: (params) => getLocalBinariesInfo(params),
  readBinaryForUpload: REAL_BINARY_UPLOAD_EFFECTS.readBinary,
  putBinary: REAL_BINARY_UPLOAD_EFFECTS.putBinary,
  computeFingerprint: (projectRoot, command) => computeBaseFingerprint(projectRoot, { command }),
  extractGateMetadataFor: (params) => extractGateMetadata(params),
  uploadStagedArtifacts: (params) => uploadStagedArtifacts(params),
};

let installed: NativeBuild = liveNativeBuild;

/** The machine in force. */
export function nativeBuild(): NativeBuild {
  return installed;
}

/** Install a machine for the duration of one posed run; the returned function undoes it. */
export function installNativeBuild(next: NativeBuild): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/* ========================================================================== */
/* The posed machine                                                          */
/* ========================================================================== */

/** A read the pose could not answer, and the reason - recorded the way an unscripted call is. */
export type UnposedRead = { call: string; problem: string };

export type PosedNativeBuild = NativeBuild & {
  /** Every read the pose could not answer, in the order they were made. */
  refusals(): UnposedRead[];
};

/**
 * The machine a pose declares. A binary the pose says nothing about is REFUSED rather than read
 * off this machine, and a pose with no `push` at all refuses the first read: a posed run that
 * quietly opened a real file would be reporting on this machine, not on the pose.
 */
export function posedNativeBuild(push: PosedPush | undefined): PosedNativeBuild {
  const refusals: UnposedRead[] = [];

  function refuse(call: string, problem: string): Error {
    refusals.push({ call, problem });
    return new Error(`the pose cannot answer \`${call}\`: ${problem}`);
  }

  /** The pose's `push`, or the refusal for a command that reached the machine without one. */
  function stated(call: string): PosedPush {
    if (!push) {
      throw refuse(
        call,
        'the pose states no `push`, and the command read the machine - a real push needs one'
      );
    }
    return push;
  }

  function binaryOf(call: string, platform: Platform): PosedBinary {
    const binary = stated(call).binaries[platform];
    if (!binary) {
      throw refuse(call, `the pose's \`push.binaries\` says nothing about \`${platform}\``);
    }
    return binary;
  }

  return {
    refusals: () => refusals,

    now: () => new Date(stated('now').now),

    readBinaries: async ({ paths, platforms }) => {
      const info: LocalBinariesInfo = {};
      for (const platform of platforms) {
        const platformPath = paths[platform];
        if (!platformPath) continue;
        const posed = binaryOf('readBinary', platform);
        info[platform] = {
          hash: posed.hash,
          // THE SHIPPED READER'S OWN RULE: a binary that embeds a bundle is a preview build.
          buildType: posed.hasEmbeddedBundle ? 'preview' : 'development',
          fileName: platformPath.split('/').pop() ?? platformPath,
          sdkVersion: posed.sdkVersion ?? undefined,
          expoSdkVersion: posed.expoSdkVersion,
          hasExpoDevClient: posed.hasExpoDevClient,
          androidAbis: posed.androidAbis,
        };
      }
      return info;
    },

    readBinaryForUpload: async (_buildPath, platform) => ({
      data: Buffer.alloc(0),
      sizeMb: binaryOf('readBinary', platform).sizeMb,
    }),

    // Nothing is sent: the slot a posed server hands out leads nowhere.
    putBinary: async () => ({ ok: true, status: 200, text: async () => '' }),

    computeFingerprint: async () => {
      const fingerprint = stated('computeFingerprint').fingerprint;
      if ('hash' in fingerprint) {
        return { hash: fingerprint.hash, nativeFingerprint: fingerprint.hash };
      }
      return { hash: null, nativeFingerprint: undefined, debugMessage: fingerprint.unavailable };
    },

    extractGateMetadataFor: async ({ platform }) => {
      const posed = binaryOf('extractGateMetadata', platform);
      return {
        derivedFrom: 'binary',
        hasEmbeddedBundle: posed.hasEmbeddedBundle,
        bundleFormat: posed.bundleFormat === 'hermes-bytecode' ? 'hbc' : posed.bundleFormat,
        expoUpdatesEnabled: posed.expoUpdatesEnabled,
        ...(posed.expoSdkVersion
          ? { buildMetadata: { expoSdkVersion: posed.expoSdkVersion, buildMode: 'release' } }
          : {}),
      };
    },

    // The keys the run would have mirrored onto the build config, from the posed slots; no byte
    // goes anywhere.
    uploadStagedArtifacts: async ({ bundleResult, urls }) => ({
      jsBundleS3Key: urls.jsBundle.s3Key,
      ...(bundleResult.assetsDest ? { assetsS3Key: urls.assets.s3Key } : {}),
      ...(bundleResult.moduleManifest && urls.manifest
        ? { manifestS3Key: urls.manifest.s3Key }
        : {}),
    }),
  };
}
