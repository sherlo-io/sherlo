/**
 * THE PUSH SPINE'S EXPECTATION PRODUCER - the second family on the render road.
 *
 * MINT CAPTURES FROM A WORLD; RENDER COMPUTES FROM A SCENARIO. This takes a
 * scenario's scripted wire state, runs the CLI's OWN push code over it, and
 * returns what that code printed.
 *
 * WHAT IT SUBSTITUTES, AND WHAT IT DOES NOT. A push performs eight effects - it
 * asks the backend which build this is, reads and PUTs each binary, reads git,
 * computes a fingerprint, reads gate metadata out of each binary, produces and
 * uploads module manifests (the EAS-update road) or a fresh bundle (the
 * standard road), and opens the build - and this supplies those eight and
 * nothing else. It does not stub a formatter, a print site, a segment or a
 * branch: {@link uploadOrReuseBuildsAndRunTests} is the shipped function the
 * `test:standard` verb itself calls.
 *
 * THE TWO PLACES THAT MATTERS MOST, because both are sentences a lazier producer
 * would have let a scenario write:
 *
 *   - the staging refusal. A scenario declares `hasEmbeddedBundle: false`; the
 *     SHIPPED `checkStageable` picks the branch and phrases the reason, and the
 *     shipped `registerBase` decides it is worth warning about. Reword the
 *     product and the fixtures red.
 *   - the manifest-skipped line. A scenario declares a dirty tree; the shipped
 *     `assessManifestProvenance` decides that means "cannot vouch" and phrases
 *     why.
 */
import { Platform } from '@sherlo/api-types';
import { PROJECT_API_TOKEN_LENGTH } from '@sherlo/shared';
import printSherloIntro from '../../helpers/printSherloIntro';
import { captureTranscript, type CapturedTranscript } from '../../helpers/transcriptSink';
import uploadOrReuseBuildsAndRunTests, {
  type PushEffects,
} from '../../helpers/uploadOrReuseBuildsAndRunTests';
import type { CommandParams } from '../../types';
import type { PushTranscriptScenario, PushTranscriptState } from './push.transcripts';

/** The project a scenario is rendered as if it ran in. Nothing renders this path. */
const SCRIPTED_PROJECT_ROOT = '/Users/sherlo-user/my-app';

/**
 * The token the flow splits into an api token, a project index and a team id.
 *
 * Built to the REAL fixed-width layout `getTokenParts` slices - 32 characters of
 * api token, then 8 of team id, then the project index - so the scenario's ids
 * survive the round trip and the closer's URL is a function of scripted state
 * rather than of a constant hidden in here. A token this shape is also what
 * proves the ids reach the URL through the CLI's own parsing rather than around
 * it.
 */
function scriptedToken(state: PushTranscriptState): string {
  return `${'s'.repeat(PROJECT_API_TOKEN_LENGTH)}${state.teamId}${state.projectIndex}`;
}

/** One full render of a push scenario. */
export async function renderPushScenarioTranscript(
  scenario: PushTranscriptScenario
): Promise<CapturedTranscript> {
  const state = scenario.state;

  // The ambient the scenario DECLARES, applied to the read the shipped code
  // makes - so `printSherloIntro` takes its own real branch rather than being
  // bypassed. Restored afterwards, because a caller that renders several
  // scenarios in one process (the ratchet does) must not have one scenario's
  // ambient reach the next.
  const previousSkipIntro = process.env.SKIP_INTRO;
  process.env.SKIP_INTRO = scenario.ambient.skipIntro ? 'true' : 'false';

  try {
    return await captureTranscript(async () => {
      printSherloIntro();

      await uploadOrReuseBuildsAndRunTests({
        commandParams: scriptedCommandParams(state),
        ...(state.easUpdateData ? { easUpdateData: state.easUpdateData } : {}),
        effects: scriptedPushEffects(state),
      });
    });
  } finally {
    if (previousSkipIntro === undefined) delete process.env.SKIP_INTRO;
    else process.env.SKIP_INTRO = previousSkipIntro;
  }
}

/* ========================================================================== */

/**
 * The command params the flow reads. Only three fields reach a printed byte -
 * the device list (the run header counts it) and the two binary paths (their
 * presence is what makes a platform eligible for base registration) - and each
 * comes from the scenario.
 */
function scriptedCommandParams(state: PushTranscriptState): CommandParams {
  const binaryPathFor = (platform: Platform) =>
    state.binariesInfo[platform] ? `${SCRIPTED_PROJECT_ROOT}/build.${platform}` : undefined;

  return {
    token: scriptedToken(state),
    projectRoot: SCRIPTED_PROJECT_ROOT,
    devices: state.devices,
    android: binaryPathFor('android'),
    ios: binaryPathFor('ios'),
  } as unknown as CommandParams;
}

function scriptedPushEffects(state: PushTranscriptState): PushEffects {
  return {
    now: () => new Date(state.now),

    resolveBinaries: async () => ({
      binariesInfo: state.binariesInfo,
      nextBuildIndex: state.nextBuildIndex,
    }),

    resolveGitInfo: async () => state.gitInfo,

    computeFingerprint: async () => state.fingerprint,

    openBuild: async () => ({ build: { index: state.buildIndex } }),

    binaryUpload: {
      readBinary: async (_buildPath, platform) => {
        const sizeMb = state.binarySizesMb[platform];
        if (sizeMb === undefined) {
          throw new Error(
            `REFUSING TO RENDER (incomplete state): '${platform}' has an upload slot but the ` +
              'scenario scripts no binary size for it. A platform the backend handed a slot to is ' +
              'a platform the CLI is about to announce the size of.'
          );
        }
        return { data: Buffer.alloc(0), sizeMb };
      },
      // A scripted upload always succeeds on the first attempt. The retry lines
      // are a real branch with no committed fixture: they belong to a scenario
      // that scripts a failing PUT, which this family does not carry yet.
      putBinary: async () => ({ ok: true, status: 200, text: async () => '' }),
    },

    baseRegistration: {
      extractGateMetadataFor: async ({ platform }) => {
        const metadata = state.gateMetadata[platform];
        if (!metadata) {
          throw new Error(
            `REFUSING TO RENDER (incomplete state): '${platform}' is registered as a base but the ` +
              'scenario scripts no gate metadata for it.'
          );
        }
        return metadata;
      },
    },

    manifest: {
      bundleFor: async (_projectRoot, platform) =>
        state.manifest.produced.includes(platform)
          ? { moduleManifest: { raw: Buffer.from(`${platform}-manifest`) } }
          : {},

      requestUploadSlots: async () => {
        if (state.manifest.slotRequestError) {
          throw new Error(state.manifest.slotRequestError);
        }
        const stagedPresignedUploadUrls: Record<
          string,
          { manifest: { url: string; s3Key: string } }
        > = {};
        for (const platform of state.manifest.slotsFor) {
          stagedPresignedUploadUrls[platform] = {
            manifest: {
              url: `https://s3.example.invalid/manifest/${platform}`,
              s3Key: `manifests/${platform}.json.gz`,
            },
          };
        }
        return { stagedPresignedUploadUrls } as never;
      },

      putManifest: async ({ platform }) => {
        const failure = state.manifest.uploadErrors?.[platform];
        if (failure) throw new Error(failure);
      },
    },

    // Every scenario in this family is an EAS-update push, so the standard
    // road's fresh bundle is never reached. A scenario that IS a standard-road
    // push needs a scripted bundle and scripted slots; until one exists, reaching
    // this is a scenario error, not something to render around.
    freshBundle: {
      bundling: {
        bundleFor: async (_projectRoot, platform) => refuseFreshBundle(platform),
        gateMetadataFor: async (_projectRoot, platform) => refuseFreshBundle(platform),
      },
      upload: {
        requestUploadSlots: async ({ platforms }) => refuseFreshBundle(platforms[0]),
        uploadBundle: async ({ platform }) => refuseFreshBundle(platform),
      },
    },
  };
}

function refuseFreshBundle(platform: Platform | undefined): never {
  throw new Error(
    `REFUSING TO RENDER (incomplete state): the run reached the standard road's fresh bundle for ` +
      `'${platform}', but no push scenario scripts a bundle or its upload slots yet.`
  );
}
