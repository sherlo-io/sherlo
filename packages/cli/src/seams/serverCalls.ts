/**
 * THE SERVER SEAM - the operations a command asks the backend, and what they answer.
 *
 *     live   - the real request, one per operation, exactly as the shipped code makes it.
 *     posed  - the pose's `api` list, in order, each entry checked against the arguments the
 *              command actually made the call with.
 *
 * THE OPERATIONS HERE ARE THE OPERATIONS THE CONTRACT NAMES, and no others. A command that
 * reaches an operation a pose cannot describe is refused rather than allowed to fall through to
 * the network - see {@link posedServerCalls}. That is the whole safety of the pose road: a posed
 * run either answers from the pose or says it cannot, never from the machine it ran on.
 *
 * WHAT `with` CHECKS, AND WHY IT IS A SUBSET. Each operation below takes the FULL arguments the
 * shipped call is made with - a token, a whole build-run config - while the contract's `with`
 * names only the few a pose can meaningfully state. The posed implementation checks those and
 * ignores the rest: a pose cannot script an answer to a question the command did not ask, and it
 * is not asked to restate a payload it did not compose.
 */
import sdkClient from '@sherlo/sdk-client';
import { Platform } from '@sherlo/api-types';
import {
  fetchBuildStatus,
  getEndpointUrl,
  SINGLE_READ_TIMEOUT_MS,
  type BuildStatus,
} from '../helpers/buildStatusRequest';
import getTokenParts from '../helpers/getTokenParts';
import createProjectRequest from '../commands/projectCreate/createProjectRequest';
import createTeamRequest from '../commands/teamCreate/createTeamRequest';
import listProjectsRequest from '../commands/projectList/listProjectsRequest';
import listTeamsRequest from '../commands/teamList/listTeamsRequest';
import type { ProjectCreated } from '../render/projectCreated';
import type { ProjectList } from '../render/projectList';
import type { TeamCreated } from '../render/teamCreated';
import type { TeamList } from '../render/teamList';
// TYPE-ONLY, and it has to stay that way: `dryRunDecision` mirrors the `computeDiffScopeDryRun`
// SDL and calls this seam, so a VALUE imported from it here would be a load-time cycle. A type
// import is erased, which is why the shapes can be named where they are declared.
import type {
  ComputeDiffScopeDryRunRequest,
  ComputeDiffScopeDryRunResult,
  DryRunDecisionClient,
} from '../commands/test/dryRunDecision';

/**
 * Raised when the `computeDiffScopeDryRun` query method is not present on the sdk-client at
 * runtime. The dry-run road catches it and bails open - see ../commands/test/dryRunDecision.
 */
export const DRY_RUN_DECISION_UNAVAILABLE =
  'The Diff Scope dry-run decision query (computeDiffScopeDryRun) is not available on this sdk-client build.';

/** What `openBuild` is sent, and what it answers - the sdk client's own shapes. */
type SdkClient = ReturnType<typeof sdkClient>;
export type OpenBuildRequest = Parameters<SdkClient['openBuild']>[0];
export type OpenBuildAnswer = Awaited<ReturnType<SdkClient['openBuild']>>;
/** The two questions a real push asks before it opens a build - the sdk client's own shapes. */
export type NextBuildInfoRequest = Parameters<SdkClient['getNextBuildInfo']>[0];
export type NextBuildInfoAnswer = Awaited<ReturnType<SdkClient['getNextBuildInfo']>>;
export type StagedUploadUrlsRequest = Parameters<SdkClient['getStagedUploadUrls']>[0];
export type StagedUploadUrlsAnswer = Awaited<ReturnType<SdkClient['getStagedUploadUrls']>>;

/** Every operation a command asks the backend, and nothing else. */
export type ServerCalls = {
  getBuildStatus(request: {
    token: string;
    buildIndex: number;
    projectIndex: number;
    teamId: string;
    /** A single-shot read bounds its own request; the poll loop's own deadline governs there. */
    boundedRead?: boolean;
  }): Promise<BuildStatus | null>;

  createProject(request: {
    name: string;
    teamId: string;
    personalToken: string;
  }): Promise<ProjectCreated>;

  createTeam(request: { name: string; personalToken: string }): Promise<TeamCreated>;

  listTeams(request: { personalToken: string }): Promise<TeamList>;

  listProjects(request: { teamId: string; personalToken: string }): Promise<ProjectList>;

  openBuild(client: SdkClient, request: OpenBuildRequest): Promise<OpenBuildAnswer>;

  /** Has the server seen these binaries, and which build comes next - the push's first question. */
  getNextBuildInfo(client: SdkClient, request: NextBuildInfoRequest): Promise<NextBuildInfoAnswer>;

  /** The staged slots a fresh bundle is PUT into - asked by every road that uploads one. */
  getStagedUploadUrls(
    client: SdkClient,
    request: StagedUploadUrlsRequest
  ): Promise<StagedUploadUrlsAnswer>;

  computeDiffScopeDryRun(
    client: DryRunDecisionClient,
    request: ComputeDiffScopeDryRunRequest
  ): Promise<ComputeDiffScopeDryRunResult>;

  /** The staged road's gate: can this commit reuse the base registered under this fingerprint? Asked per platform. */
  checkStagedGate(client: SdkClient, request: CheckStagedGateRequest): Promise<CheckStagedGateAnswer>;
};

/** What the staged gate is asked and what it answers - the sdk client's own shapes. */
export type CheckStagedGateRequest = Parameters<SdkClient['checkStagedGate']>[0];
export type CheckStagedGateAnswer = Awaited<ReturnType<SdkClient['checkStagedGate']>>;

/** The shipped answers: the real requests, unchanged. */
export const liveServerCalls: ServerCalls = {
  getBuildStatus: ({ token, buildIndex, projectIndex, teamId, boundedRead }) => {
    const { apiToken } = getTokenParts(token);

    return fetchBuildStatus(
      getEndpointUrl(),
      apiToken,
      { index: buildIndex, projectIndex, teamId },
      boundedRead ? SINGLE_READ_TIMEOUT_MS : undefined
    );
  },

  createProject: (request) => createProjectRequest(request),
  createTeam: (request) => createTeamRequest(request),
  listTeams: (request) => listTeamsRequest(request),
  listProjects: (request) => listProjectsRequest(request),

  openBuild: (client, request) => client.openBuild(request),

  getNextBuildInfo: (client, request) => client.getNextBuildInfo(request),

  getStagedUploadUrls: (client, request) => client.getStagedUploadUrls(request),

  computeDiffScopeDryRun: (client, request) => {
    // The published sdk-client this repo typechecks against may not carry the query yet, so the
    // method is reached defensively - exactly as ../commands/test/dryRunDecision does.
    const query = (client as unknown as Record<string, unknown>).computeDiffScopeDryRun;

    if (typeof query !== 'function') {
      throw new Error(DRY_RUN_DECISION_UNAVAILABLE);
    }

    return (
      query as (input: ComputeDiffScopeDryRunRequest) => Promise<ComputeDiffScopeDryRunResult>
    )(request);
  },

  checkStagedGate: (client, request) => client.checkStagedGate(request),
};

let installed: ServerCalls = liveServerCalls;

/** The server in force. */
export function serverCalls(): ServerCalls {
  return installed;
}

/** Install a server for the duration of one posed run; the returned function undoes it. */
export function installServerCalls(next: ServerCalls): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/* ========================================================================== */
/* The posed server                                                           */
/* ========================================================================== */

/** One scripted answer, exactly as a pose states it. */
export type ScriptedCall = {
  call: string;
  with: Record<string, unknown>;
  answer: unknown;
};

/**
 * A call the pose could not answer, and the reason. Recorded rather than only thrown, because
 * two of the tool's own reads swallow every error they get (the bypass closer is best-effort by
 * ruling) - and a posed run that quietly carried on past a call it could not answer would print
 * a screen nobody could trust.
 */
export type UnscriptedCall = { call: string; problem: string };

export type PosedServerCalls = ServerCalls & {
  /** Every call the pose could not answer, in the order they were made. */
  refusals(): UnscriptedCall[];
  /** Scripted answers the command never asked for - a pose describing a road it did not take. */
  unusedCalls(): ScriptedCall[];
};

/**
 * The server a pose declares: the scripted answers, IN ORDER.
 *
 * Each call the command makes takes the next entry off the list. The entry's operation has to be
 * the one the command asked for and its `with` has to match the arguments the command asked it
 * with - otherwise the call is refused, because an answer scripted for a different question is
 * not evidence about anything.
 */
export function posedServerCalls(script: ScriptedCall[]): PosedServerCalls {
  const remaining = [...script];
  const refusals: UnscriptedCall[] = [];

  /** Take the next scripted answer for `call`, checking it is the one the command asked for. */
  function answerFor(call: string, askedWith: Record<string, unknown>): unknown {
    const next = remaining.shift();

    if (!next) {
      throw refuse(call, `the pose scripts no further calls, and the command made a \`${call}\``);
    }

    if (next.call !== call) {
      throw refuse(
        call,
        `the pose's next scripted call is \`${next.call}\`, and the command made a \`${call}\``
      );
    }

    const mismatch = firstMismatch(next.with, askedWith);
    if (mismatch) throw refuse(call, mismatch);

    // An error the server sent is raised the way the real client raises one, so the command's own
    // refusal - its wording, its exit code - is what the screen shows.
    const answer = next.answer as Record<string, unknown> | null;
    if (answer !== null && typeof answer === 'object' && 'error' in answer) {
      throw new Error(String(answer.error));
    }

    return next.answer;
  }

  function refuse(call: string, problem: string): Error {
    refusals.push({ call, problem });
    return new Error(`the pose cannot answer \`${call}\`: ${problem}`);
  }

  return {
    refusals: () => refusals,
    unusedCalls: () => remaining,

    getBuildStatus: async ({ buildIndex }) =>
      answerFor('getBuildStatus', { buildIndex }) as BuildStatus | null,

    createProject: async ({ name, teamId }) =>
      answerFor('createProject', { teamId, name }) as ProjectCreated,

    createTeam: async ({ name }) => answerFor('createTeam', { name }) as TeamCreated,

    listTeams: async () => answerFor('listTeams', {}) as TeamList,

    listProjects: async ({ teamId }) => answerFor('listProjects', { teamId }) as ProjectList,

    // The platforms this run opened a build for are the ones its build-run config carries - the
    // command composed that, so it is read off the payload rather than restated by the pose.
    openBuild: async (_client, request) => {
      // The config carries `include`/`exclude` beside the platforms, and the standard road writes
      // a platform key it has no binary for as undefined - so the platforms are the two keys
      // that hold a config, never every key.
      const config = (request.buildRunConfig ?? {}) as Record<string, unknown>;
      const platforms = ['android', 'ios'].filter((platform) => config[platform] !== undefined);
      const answer = answerFor('openBuild', { platforms }) as { buildIndex: number; url: string };

      return openBuildAnswerOf(answer.buildIndex, platforms as Platform[]);
    },

    getNextBuildInfo: async (_client, request) => {
      const answer = answerFor('getNextBuildInfo', {
        platforms: request.platforms,
      }) as NextBuildInfoScript;

      return nextBuildInfoAnswerOf(answer, request.platforms);
    },

    getStagedUploadUrls: async (_client, request) => {
      answerFor('getStagedUploadUrls', { platforms: request.platforms });

      return stagedUploadUrlsAnswerOf(request.platforms);
    },

    computeDiffScopeDryRun: async (_client, request) =>
      answerFor('computeDiffScopeDryRun', {
        branch: request.gitInfo.branchName,
        commit: request.gitInfo.commitHash,
      }) as ComputeDiffScopeDryRunResult,

    // The gate is asked per platform with the base fingerprint the tool computed; the pose states
    // both, so a pose cannot answer a question about a base the run never measured.
    checkStagedGate: async (_client, request) =>
      answerFor('checkStagedGate', {
        platform: request.platform,
        baseFingerprint: request.baseFingerprint,
      }) as CheckStagedGateAnswer,
  };
}

/* ========================================================================== */

/**
 * The `openBuild` response the tool reads, built from the one fact a pose states about it.
 *
 * A pose says which build the server opened. Everything else the tool reads off this response -
 * the per-platform capture scope, the build-wide capture accounting - is a DECISION the server
 * made, and the contract has no field for it: a pose that could state one would be drawing the
 * capture plan itself instead of posing the run that produced it. So it is absent, which is the
 * tool's own "the server made no decision for this platform" - it prints no plan block and
 * closes with the link, exactly as it does against a backend that does not send one.
 */
function openBuildAnswerOf(buildIndex: number, platforms: Platform[]): OpenBuildAnswer {
  return {
    build: { index: buildIndex },
    buildRun: { config: Object.fromEntries(platforms.map((platform) => [platform, {}])) },
  } as unknown as OpenBuildAnswer;
}

/** What a pose says the server answered about each binary: a slot to upload it into, or the build it already has it from. */
type NextBuildInfoScript = {
  nextBuildIndex: number;
  binaries: Record<string, { upload: true } | { reuse: { buildIndex: number; createdAt: string } }>;
};

/**
 * The `getNextBuildInfo` response the tool reads, from the two facts a pose states about it.
 *
 * A pose says which build comes next and, per binary, whether the server wants it uploaded or
 * already holds it from an earlier build. The slot address and the storage key are the server's
 * own business - nothing the tool prints reads either - so they are stand-ins here, shaped the
 * way the tool tells an upload from a reuse: an upload has a `url`, a reuse has none.
 */
function nextBuildInfoAnswerOf(
  script: NextBuildInfoScript,
  platforms: NextBuildInfoRequest['platforms']
): NextBuildInfoAnswer {
  const binariesInfo: Record<string, unknown> = {};

  for (const platform of platforms) {
    const scripted = script.binaries[platform];
    if (!scripted) continue;

    binariesInfo[platform] =
      'upload' in scripted
        ? { s3Key: `posed/${platform}/binary`, url: `https://posed.upload/${platform}` }
        : {
            s3Key: `posed/${platform}/build-${scripted.reuse.buildIndex}`,
            buildIndex: scripted.reuse.buildIndex,
            buildCreatedAt: scripted.reuse.createdAt,
          };
  }

  return { binariesInfo, nextBuildIndex: script.nextBuildIndex } as unknown as NextBuildInfoAnswer;
}

/**
 * The `getStagedUploadUrls` response the tool reads. A pose states nothing about it beyond that
 * the call was made: the slots are addresses the posed machine never sends to, and the keys they
 * carry reach the build config the tool composes, never the screen.
 */
function stagedUploadUrlsAnswerOf(
  platforms: StagedUploadUrlsRequest['platforms']
): StagedUploadUrlsAnswer {
  const slot = (platform: string, artifact: string) => ({
    url: `https://posed.upload/${platform}/${artifact}`,
    s3Key: `posed/${platform}/${artifact}`,
  });

  return {
    stagedPresignedUploadUrls: Object.fromEntries(
      platforms.map((platform: string) => [
        platform,
        {
          jsBundle: slot(platform, 'bundle'),
          assets: slot(platform, 'assets'),
          manifest: slot(platform, 'manifest'),
        },
      ])
    ),
  } as unknown as StagedUploadUrlsAnswer;
}

/** The first argument the pose and the command disagree about, said in one sentence. */
function firstMismatch(
  scripted: Record<string, unknown>,
  asked: Record<string, unknown>
): string | undefined {
  for (const field of Object.keys(scripted)) {
    const expected = JSON.stringify(scripted[field]);
    const actual = JSON.stringify(asked[field]);
    if (expected !== actual) {
      return `the pose scripts it with \`${field}\` = ${expected}, and the command made it with ${actual}`;
    }
  }

  return undefined;
}
