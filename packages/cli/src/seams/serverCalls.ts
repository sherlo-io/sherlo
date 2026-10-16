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
import os from 'os';
import sdkClient from '@sherlo/sdk-client';
import { Platform } from '@sherlo/api-types';
import {
  fetchBuildStatus,
  getEndpointUrl,
  SINGLE_READ_TIMEOUT_MS,
  type BuildStatus,
} from '../helpers/buildStatusRequest';
import getTokenParts from '../helpers/getTokenParts';
import isBuildTicket from '../helpers/isBuildTicket';
import isPersonalToken from '../helpers/isPersonalToken';
import createProjectRequest from '../commands/projectCreate/createProjectRequest';
import createTeamRequest from '../commands/teamCreate/createTeamRequest';
import listProjectsRequest from '../commands/projectList/listProjectsRequest';
import listTeamsRequest from '../commands/teamList/listTeamsRequest';
import type { ProjectCreated } from '../render/projectCreated';
import type { ProjectList } from '../render/projectList';
import type { TeamCreated } from '../render/teamCreated';
import type { TeamList } from '../render/teamList';
import type { PlatformCapture } from '../render/testSteps';
import type { Config } from '../types';

/** What `openBuild` is sent, and what it answers - the sdk client's own shapes. */
type SdkClient = ReturnType<typeof sdkClient>;
export type OpenBuildRequest = Parameters<SdkClient['openBuild']>[0];
export type OpenBuildAnswer = Awaited<ReturnType<SdkClient['openBuild']>> & {
  /**
   * Whether the project has a CI token, so a person's run can suggest running Sherlo on every pull
   * request while it has none. The service may say whether the project has a CI token; absent
   * means unknown, and nothing is suggested.
   */
  hasCiToken?: boolean;
};
/** The two questions a real push asks before it opens a build - the sdk client's own shapes. */
export type NextBuildInfoRequest = Parameters<SdkClient['getNextBuildInfo']>[0];
export type SdkNextBuildInfoAnswer = Awaited<ReturnType<SdkClient['getNextBuildInfo']>>;
export type StagedUploadUrlsRequest = Parameters<SdkClient['getStagedUploadUrls']>[0];
export type StagedUploadUrlsAnswer = Awaited<ReturnType<SdkClient['getStagedUploadUrls']>>;
/** What one of `sherlo init`'s progress reports is sent with, and what it answers back. */
export type TrackCliInitRequest = Parameters<SdkClient['trackCliInit']>[0];
export type TrackCliInitAnswer = Awaited<ReturnType<SdkClient['trackCliInit']>>;

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

  /**
   * Who the personal token belongs to: the name they signed up with, and their email. Setup names
   * a team it makes for them after them ("Dawid's team").
   */
  whoAmI(request: { personalToken: string }): Promise<PersonOfToken>;

  listProjects(request: { teamId: string; personalToken: string }): Promise<ProjectList>;

  /** `pushFacts`: what only the push knows ({@link PushFacts}), sent with the call. */
  openBuild(
    request: OpenBuildRequest & { token: string; pushFacts?: PushFacts }
  ): Promise<OpenBuildAnswer>;

  /**
   * One job of a split CI run delivers its platform: the server opens the run the CI run's jobs
   * share, or joins the one the other job opened, fills this platform's slot, and starts the run
   * when every platform the config names is in - never before.
   */
  joinBuild(request: JoinBuildRequest & { token: string }): Promise<JoinBuildAnswer>;

  /**
   * An EAS build delivers its platform into the run `sherlo test` opened for it on EAS: the
   * server fills the slot and starts the run when the last platform is in.
   */
  asyncUpload(
    request: AsyncUploadRequest & { token: string; pushFacts?: PushFactsPlatform }
  ): Promise<AsyncUploadAnswer>;

  /** End a run that can never start - an EAS build that failed on Expo's servers. */
  closeBuild(request: CloseBuildRequest & { token: string }): Promise<CloseBuildAnswer>;

  /** Has the server seen these binaries, and which build comes next - the push's first question. */
  getNextBuildInfo(
    request: NextBuildInfoRequest & { token: string }
  ): Promise<SdkNextBuildInfoAnswer>;

  /** The staged slots a fresh bundle is PUT into - asked by every road that uploads one. */
  getStagedUploadUrls(
    request: StagedUploadUrlsRequest & { token: string }
  ): Promise<StagedUploadUrlsAnswer>;

  /** The staged road's gate: can this commit reuse the base registered under this fingerprint? Asked per platform. */
  checkStagedGate(
    request: CheckStagedGateRequest & { token: string }
  ): Promise<CheckStagedGateAnswer & StoredAppBuildFacts>;

  /**
   * One progress report `sherlo init` sends as it walks its steps. It rides this seam like every
   * other backend call - the two acts init performs ON the machine are the separate
   * ../seams/workstation - so a posed init answers its reports from the pose's `api` and never
   * reaches the real backend.
   */
  trackCliInit(request: TrackCliInitRequest & { token: string }): Promise<TrackCliInitAnswer>;

  /**
   * `sherlo login`'s first question: start a pending login. Asked with no credential; the live half
   * sends this computer's name, which the authorize page shows. The poll secret is known only to
   * this run, and only ever sent back to {@link ServerCalls.pollCliLogin}.
   */
  startCliLogin(): Promise<PendingCliLogin>;

  /** Has the person answered the pending login yet? Asked about every two seconds while it waits. */
  pollCliLogin(request: { loginId: string; pollSecret: string }): Promise<CliLoginAnswer>;

  /**
   * `sherlo logout`: end exactly the login whose token this is, on the service. A service that
   * answers but refuses the token throws {@link ServiceRefusedTokenError}; any other error is a
   * service the tool could not reach.
   */
  logOutCli(request: { personalToken: string }): Promise<void>;
};

/** The person a personal token belongs to. `name` is one string, as they signed up with it. */
export type PersonOfToken = { name: string; email: string };

/** A login the service started for this run: what to open, and what only this run may ask with. */
export type PendingCliLogin = {
  loginId: string;
  /** Known only to this run. Never printed. */
  pollSecret: string;
  /** The web app page the person opens to click Authorize or Cancel. */
  authorizeUrl: string;
  /** When the pending login expires if nobody answers it, ISO 8601. */
  expiresAt: string;
};

/**
 * What a poll of a pending login answers. Only `approved` carries the token, and only once: a
 * later poll of the same login answers `used`.
 */
export type CliLoginAnswer =
  | { status: 'pending' | 'cancelled' | 'expired' | 'used' }
  | { status: 'approved'; email: string; token: string };

/**
 * What `joinBuild` is sent, and what it answers - the sdk client's own shapes. The answer's
 * `startedRun` is set for the job whose upload brought the run's last platform in: the devices of
 * the whole test and what each platform captures.
 */
export type JoinBuildRequest = Parameters<SdkClient['joinBuild']>[0];
export type JoinBuildAnswer = Awaited<ReturnType<SdkClient['joinBuild']>>;

/**
 * The run that just started, as the service tells the EAS upload that brought its last platform
 * in: the devices of the whole test and what each platform captures, counted off the module map
 * each EAS build staged with its delivery. A field the service has no value for arrives as null,
 * as GraphQL answers it.
 */
export type StartedRun = { devices: Config['devices']; capture: PlatformCapture[] };

/** What an EAS build's delivery and a run's closing are sent and answer - the sdk client's own shapes. */
export type AsyncUploadRequest = Parameters<SdkClient['asyncUpload']>[0];
/** The client's answer, and the started run when this EAS build was the last one in ({@link StartedRun}). */
export type AsyncUploadAnswer = Awaited<ReturnType<SdkClient['asyncUpload']>> & {
  startedRun?: StartedRun;
};
export type CloseBuildRequest = Parameters<SdkClient['closeBuild']>[0];
export type CloseBuildAnswer = Awaited<ReturnType<SdkClient['closeBuild']>>;

/** What the staged gate is asked and what it answers - the sdk client's own shapes. */
export type CheckStagedGateRequest = Parameters<SdkClient['checkStagedGate']>[0];
export type CheckStagedGateAnswer = Awaited<ReturnType<SdkClient['checkStagedGate']>>;

/**
 * What the gate says about the platform's stored app build on top of the client's answer: its
 * source list and the test it was built in. The service does not send the test yet (build work:
 * the gate's every answer carries it), so a live run reads it as absent.
 */
export type StoredAppBuildFacts = Pick<StagedGateAnswer, 'storedBase' | 'storedBuildIndex'>;

/**
 * What the service is sent for the token a push spends: a project token's api part, or a personal
 * token or a build ticket whole - neither has parts.
 */
function authTokenFor(token: string): string {
  return isPersonalToken(token) || isBuildTicket(token) ? token : getTokenParts(token).apiToken;
}

/** The one place a push's token becomes a real sdk client - every live operation below goes through it. */
function clientFor(token: string): SdkClient {
  return sdkClient({ authToken: authTokenFor(token) }, getEndpointUrl());
}

/** The shipped answers: the real requests, unchanged. */
export const liveServerCalls: ServerCalls = {
  getBuildStatus: ({ token, buildIndex, projectIndex, teamId, boundedRead }) => {
    return fetchBuildStatus(
      getEndpointUrl(),
      authTokenFor(token),
      { index: buildIndex, projectIndex, teamId },
      boundedRead ? SINGLE_READ_TIMEOUT_MS : undefined
    );
  },

  createProject: (request) => createProjectRequest(request),
  createTeam: (request) => createTeamRequest(request),
  listTeams: (request) => listTeamsRequest(request),
  listProjects: (request) => listProjectsRequest(request),

  // BUILD DEBT (init-for-agents): the service has no query a personal token can ask this with yet.
  whoAmI: async () => {
    throw new Error('whoAmI is not available yet.');
  },

  openBuild: ({ token, ...request }) => clientFor(token).openBuild(request),

  joinBuild: ({ token, ...request }) => clientFor(token).joinBuild(request),

  asyncUpload: ({ token, ...request }) => clientFor(token).asyncUpload(request),

  closeBuild: ({ token, ...request }) => clientFor(token).closeBuild(request),

  getNextBuildInfo: ({ token, ...request }) => clientFor(token).getNextBuildInfo(request),

  getStagedUploadUrls: ({ token, ...request }) => clientFor(token).getStagedUploadUrls(request),

  trackCliInit: ({ token, ...request }) => clientFor(token).trackCliInit(request),

  checkStagedGate: ({ token, ...request }) => clientFor(token).checkStagedGate(request),

  // A login is started and polled with no credential at all: the poll secret is what proves this
  // run started it. The computer's name is what the authorize page shows the person.
  startCliLogin: async () => {
    const { loginId, pollSecret, authorizeUrl, expiresAt } =
      await clientWithNoCredential().startCliLogin({ computerName: os.hostname() });

    return { loginId, pollSecret, authorizeUrl, expiresAt };
  },

  pollCliLogin: async ({ loginId, pollSecret }) => {
    const answer = await clientWithNoCredential().pollCliLogin({ loginId, pollSecret });

    if (answer.status !== 'approved') return { status: answer.status };

    if (!answer.token || !answer.email) {
      throw new Error('Sherlo approved the login but sent no token with it.');
    }

    return { status: 'approved', token: answer.token, email: answer.email };
  },

  // A login's token is a personal token, sent whole: it has no parts the way a project token has.
  logOutCli: async ({ personalToken }) => {
    try {
      await sdkClient({ authToken: personalToken }, getEndpointUrl()).logOutCli();
    } catch (error) {
      if (serviceRefusedTheToken(error)) throw new ServiceRefusedTokenError();
      throw error;
    }
  },
};

/** The service answered, and refused the token it was sent. */
export class ServiceRefusedTokenError extends Error {
  constructor() {
    super('Sherlo refused the token.');
    this.name = 'ServiceRefusedTokenError';
  }
}

/**
 * Whether an sdk client error is the service refusing the token, rather than a service the tool
 * never reached. The authorizer refuses with HTTP 401 or 403; a refusal from inside the API comes
 * back as a GraphQL error typed as unauthorized - thrown bare by the client, or inside its error.
 */
function serviceRefusedTheToken(error: unknown): boolean {
  const clientError = error as {
    errorType?: string;
    networkError?: { statusCode?: number };
    graphQLErrors?: Array<{ errorType?: string }>;
  };

  const httpStatus = clientError?.networkError?.statusCode;
  if (httpStatus === 401 || httpStatus === 403) return true;

  const errorTypes = [
    clientError?.errorType,
    ...(clientError?.graphQLErrors ?? []).map((graphQLError) => graphQLError.errorType),
  ];
  return errorTypes.some((errorType) => /unauthori[sz]ed|forbidden/i.test(errorType ?? ''));
}

// Never empty: AppSync refuses an empty Authorization before the service's request gate sees it.
const NO_CREDENTIAL_PLACEHOLDER = 'no-credential';

/** An sdk client that sends no credential - for the login's own two questions. */
function clientWithNoCredential(): SdkClient {
  return sdkClient({ authToken: NO_CREDENTIAL_PLACEHOLDER }, getEndpointUrl());
}

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

/** The error the server sends, as the tool's client surfaces it. */
export type ApiError = { error: string };

/**
 * What `getBuildStatus` answers: THE WIRE'S OWN SHAPE (../helpers/buildStatusRequest), named here
 * because a pose scripts it and the pose contract publishes it under this name. A pose describing a
 * build the backend cannot send would let a product design be approved off a state that can never
 * occur, which is why this is the wire's type and not a copy of it.
 */
export type BuildStatusAnswer = BuildStatus;

/**
 * ONE PLATFORM OF A BUILD, as `getBuildStatus` answers it (the wire shape in
 * ../helpers/buildStatusRequest): service-known facts beside the facts the push reported about
 * itself ({@link PushFacts}).
 */
export type BuildStatusPlatform = {
  /** Whether this platform's app build reached the run. `false`: a split or EAS run still waits for it. */
  arrived: boolean;
  /**
   * The capture plan the service decided for this platform, read off the stored decision
   * (`diffScopeInfo.platforms`), never off the run's results - so a canceled build still has it.
   * `null` while there is no decision: Diff Scope off, or a split run not sealed yet.
   */
  capture?: {
    /** `true`: every story in the bundle was captured. */
    full: boolean;
    /** The service's sentence for the decision ("SharedButton.tsx changed"). */
    reason: string | null;
    /** The story files captured, as paths. Empty when `full`. */
    storyFiles: string[];
  } | null;
  /** Where the app build came from. `null` before the platform arrived. */
  appBuild?: {
    /** `uploaded`: this run sent an app build. `stored`: it took one Sherlo already held. */
    from: 'uploaded' | 'stored';
    /** The test the stored app build was first uploaded in. Only with `from: stored`. */
    storedFromTest?: number | null;
    /** How the push made the app build it uploaded, as the push reported it. Only with `from: uploaded`. */
    madeBy?: PushFactsPlatform['madeBy'] | null;
    /** Why a new app build was made, as the push reported it. */
    why?: PushFactsPlatform['why'] | null;
    /** What changed natively since the stored app build, as the push reported it, with `why: native-changed`. */
    nativeChanges?: string[] | null;
  } | null;
  /** How many stories the pushed bundle holds, as the push counted them. */
  storiesInBundle?: number | null;
};

/**
 * WHAT ONLY THE PUSH KNOWS about one platform it delivers - the machine that made the app build is
 * the only witness, so the push reports it on `openBuild`, `joinBuild` or the EAS hook's
 * `asyncUpload`, the service stores it on the build run, and `getBuildStatus` echoes it
 * ({@link BuildStatusPlatform}). Self-reported: the CLI vouches for itself, so nothing the web app
 * trusts may be decided from it.
 *
 * The push composes them where it already decides each fact (./commands/test/appBuild/pushFacts)
 * and sends them with these calls; the calls' posed `with` names them.
 */
export type PushFactsPlatform = {
  /**
   * How the app build was made: `compiled` on this machine, taken from the local `build-cache`,
   * made by the project's own build `command`, or by `eas`. Absent when the push sent no app build
   * (it took a stored one).
   */
  madeBy?: 'compiled' | 'build-cache' | 'command' | 'eas';
  /** Why a new app build was made: `nothing-stored` for this platform yet, or `native-changed` since the stored one. */
  why?: 'nothing-stored' | 'native-changed';
  /** The native files and modules that changed since the stored app build, with `why: native-changed`. */
  nativeChanges?: string[];
  /** How many stories the pushed bundle holds. */
  storiesInBundle?: number;
};

/** What a push reports at `openBuild`: per platform it delivers, and the CI run it ran in. */
export type PushFacts = {
  platforms: { android?: PushFactsPlatform; ios?: PushFactsPlatform };
  /** The CI service and its run id, when the push ran in CI. */
  ciRun?: { provider: string; runId: string };
};

/**
 * What the push's first question answers: which build comes next and, per binary, whether the
 * server wants it uploaded or already holds it from an earlier build - `reuse` is what the
 * `reusing unchanged build (Test 1, 7 minutes ago)` line is printed from.
 */
export type NextBuildInfoAnswer = {
  nextBuildIndex: number;
  binaries: Record<string, { upload: true } | { reuse: { buildIndex: number; createdAt: string } }>;
};

/** What the staged gate answers, exactly as the tool's client surfaces it. */
export type StagedGateAnswer = {
  outcome: 'fast' | 'full-build-needed' | 'not-stageable';
  /** The layers of the bundle's identity that moved - named on a refusal, empty otherwise. */
  diff: Array<
    | 'engineClass'
    | 'assetInventory'
    | 'expoUpdatesEnabled'
    | 'sdkProtocolVersion'
    | 'buildMetadata'
    | 'bundleFormat'
  >;
  /**
   * What the platform's stored app build was built from - handed back with `full-build-needed`
   * when the platform has a stored app build whose list Sherlo keeps, so the tool can say what
   * changed since it. Absent when nothing is stored, and for an app build an older CLI stored
   * without a list.
   */
  storedBase?: StoredBaseSources;
  /**
   * The test the platform's stored app build was built in - "stored from Test 12", "native code
   * changed since Test 12" - whatever the outcome. Absent when nothing is stored.
   */
  storedBuildIndex?: number;
};

/**
 * THE SOURCE LIST OF A STORED APP BUILD - the native inputs its base fingerprint was computed
 * over, as the CLI sent them when the build was stored. Paths, hashes and versions only: never a
 * file's contents, for the same reason the fingerprint keeps none (`FingerprintSourceDigest` in
 * packages/cli/src/helpers/fingerprint/baseFingerprint.ts). The tool diffs it against its own
 * fingerprint's sources, on the developer's machine.
 */
export type StoredBaseSources = {
  /** The test the stored app build was built in - "since Test 12". */
  buildIndex: number;
  /**
   * The native files and folders, the lockfiles (as files), and the `contents` sources - a
   * resolved setting such as the Expo config plugins, named by its id and nothing more.
   */
  sources: StoredBaseSource[];
  /** The autolinked native modules, one version each. */
  modules: Array<{ name: string; version: string }>;
};

/** One source of a stored app build's list. */
export type StoredBaseSource = {
  path: string;
  hash: string | null;
  /** `file`, `dir`, or `contents` for a resolved setting - a plain string, as the service stores it. */
  kind: string;
  /**
   * A native folder's files, one hash each (`android/app/build.gradle`), so the list can name the
   * file that changed rather than the folder. Kept for the list
   * ALONE: the base fingerprint still hashes the folder as one source, and these never enter it.
   * Only on a `dir` source the fingerprint hashed whole - a bare project's `android` and `ios` -
   * and absent on a folder an older CLI stored, which is then compared as one entry.
   */
  files?: NativeFolderFile[];
};

/** One file inside a native folder: its project-relative path and its hash, never its contents. */
export type NativeFolderFile = { path: string; hash: string };

/**
 * The server's capture decision at `openBuild`, per platform - what the "📸 Capture plan"
 * block and the one-line "Diff Scope:" summary print (SHERLO-1919). THE ONE OPTIONAL FIELD ON
 * `openBuild`'s answer: absent means the server made no decision (an older API, or Diff Scope
 * off) - the tool prints no plan block and closes straight to the Review link, exactly as it does
 * today. A platform absent from `platforms` gets the same silent treatment, one platform at a time.
 */
export type PosedCaptureDecision = {
  /** Per platform (`android`, `ios`): whether every story was captured, and which weren't, when not. */
  platforms: Record<string, PosedPlatformCaptureDecision>;
  /**
   * The build-wide reason a FULL capture prints when the platform has none of its own - the
   * "why:" row under "capturing all N stories" (absent -> the "! couldn't compute what changed"
   * safety row instead).
   */
  fullCaptureTriggerReason?: string;
  /** The build this decision diffed against - the "inheriting N from build #A" clause. */
  ancestorBuildIndex?: number;
  /**
   * The snapshot counts the open answer's `build.diffScopeInfo` carries. A build the service closed
   * as it opened, because no phone has a story to photograph, says 0 captured and some kept - which
   * is how the tool knows to withhold the review link and end on "Nothing needed capturing"
   * (`isServerBypassed`, helpers/waitForBuildResult.ts). Absent on every other build.
   */
  capturedSnapshotCount?: number;
  inheritedSnapshotCount?: number;
};

/** One platform's capture scope, as `openBuild` answers it - the sdk client's own shape. */
type OpenBuildCaptureScope = NonNullable<
  NonNullable<OpenBuildAnswer['buildRun']['config'][Platform]>['captureScope']
>;

/**
 * One platform's capture decision, as a pose states it, its new and changed story files in the
 * service's own shape. A partial capture's own list is what a change reaches.
 */
export type PosedPlatformCaptureDecision = Pick<
  OpenBuildCaptureScope,
  'newStoryFilePaths' | 'changedStoryFilePaths'
> & {
  /** `true` prints "capturing all N stories in this bundle"; `false` prints the partial closure-diff. */
  full: boolean;
  /** The story files captured, when `full` is `false`. Ignored (the block reads "all N") when `full` is `true`. */
  storyFilePaths?: string[];
  /** The server's per-platform reason, printed verbatim after "why: " (or before the summary's colon). */
  reason?: string;
};

/**
 * ONE SCRIPTED ANSWER, and the declaration every copy of the pose shape is generated from: the
 * `call` names the operation as the tool's own client names it, `with` names the few arguments a
 * pose can meaningfully state, and `answer` is what the server said - which may be the error it
 * would have sent instead.
 */
export type ScriptedCall =
  | {
      call: 'getBuildStatus';
      with: { buildIndex: number };
      answer: BuildStatusAnswer | null | ApiError;
    }
  | {
      call: 'createProject';
      with: { teamId: string; name: string };
      answer: { name: string; index: number; projectToken: string } | ApiError;
    }
  | {
      call: 'createTeam';
      with: { name: string };
      answer: { id: string; name: string } | ApiError;
    }
  | {
      call: 'listTeams';
      with: Record<string, never>;
      /** `role` is the caller's membership role, or null when the API does not say. */
      answer:
        | { teams: Array<{ id: string; name: string; projectCount: number; role: string | null }> }
        | ApiError;
    }
  | {
      /** Who the personal token belongs to: their name as they signed up with it, and their email. */
      call: 'whoAmI';
      with: Record<string, never>;
      answer: { name: string; email: string } | ApiError;
    }
  | {
      call: 'listProjects';
      with: { teamId: string };
      /** `mainBranch` is null while the project has never chosen one. */
      answer:
        | {
            team: { name: string; id: string };
            projects: Array<{
              index: number;
              name: string;
              buildCount: number;
              mainBranch: string | null;
            }>;
          }
        | ApiError;
    }
  | {
      call: 'openBuild';
      /** `pushFacts`: what the push reports about itself; a pose that states it is checked against it. */
      with: { platforms: string[]; pushFacts?: PushFacts };
      answer:
        | {
            buildIndex: number;
            url: string;
            captureDecision?: PosedCaptureDecision;
            hasCiToken?: boolean;
            /** The one-build ticket of a run that waits for EAS builds. */
            buildTicket?: string;
          }
        | ApiError;
    }
  | {
      /**
       * One job of a split CI run delivering its platform into the run its CI run shares: `with`
       * names the key the jobs share and this job's platform; the answer is the run and the
       * platforms it still waits for - none, and the run is starting, with `startedRun`.
       */
      call: 'joinBuild';
      with: { joinKey: string; platform: string; pushFacts?: PushFactsPlatform };
      answer: { buildIndex: number; waitingFor: string[]; startedRun?: StartedRun } | ApiError;
    }
  | {
      /**
       * An EAS build delivering its platform into the run opened for it: `with` names the run and
       * the platform; the answer says whether that was the last platform the run waited for, and
       * then the started run.
       */
      call: 'asyncUpload';
      with: { buildIndex: number; platform: string; pushFacts?: PushFactsPlatform };
      answer: { couldRunThisBuildRightNow: boolean; startedRun?: StartedRun } | ApiError;
    }
  | {
      /** A run closed before it started, and why (`user_easCloudBuild`: the EAS build failed). */
      call: 'closeBuild';
      with: { buildIndex: number; runError: string };
      answer: Record<string, never> | ApiError;
    }
  | {
      /** A real push's first question: has the server seen these binaries, and which build is next. */
      call: 'getNextBuildInfo';
      with: { platforms: string[] };
      answer: NextBuildInfoAnswer | ApiError;
    }
  | {
      /**
       * The staged slots a fresh bundle is uploaded into. Scripted so the pose says the call was
       * made; the answer holds nothing a pose could state, because nothing the tool prints reads it.
       */
      call: 'getStagedUploadUrls';
      with: { platforms: string[] };
      answer: Record<string, never> | ApiError;
    }
  | {
      /**
       * The staged road's first question, asked once per platform BEFORE anything is bundled: can
       * this commit reuse the base registered under this fingerprint? `fast` takes the road;
       * `full-build-needed` names which layers of the bundle's identity moved (`diff`) and, when a
       * stored app build kept its source list, hands that list back (`storedBase`), and
       * `not-stageable` is a project that can never take it. The post-bundle check asks the same
       * question again with the bundle's real identity, so a bare push scripts it TWICE per
       * platform when the first answer is `fast`.
       */
      call: 'checkStagedGate';
      with: { platform: string; baseFingerprint: string };
      answer: StagedGateAnswer | ApiError;
    }
  | {
      /**
       * One progress report `sherlo init` sends as it goes, named by the step that sent it
       * (`"0_init"`, `"3_metro_config"`). The answer is the session the whole setup is recorded
       * under, which the command carries into the next report - so a pose of an `init` scripts one
       * of these per step, in order, and a step the pose did not script is refused.
       */
      call: 'trackCliInit';
      with: { event: string };
      answer: { sessionId: string } | ApiError;
    }
  | {
      /**
       * `sherlo login` starts a pending login. The answer is the login's id, the page to open and
       * when the login expires; the poll secret is the run's own and never posed.
       */
      call: 'startCliLogin';
      with: Record<string, never>;
      answer: { loginId: string; authorizeUrl: string; expiresAt: string } | ApiError;
    }
  | {
      /**
       * One poll of the pending login: `pending` until the person answers, then `approved` with
       * the token and the person's email, or `cancelled`, `expired` or `used`. A login that waited
       * scripts one `pending` per poll before its answer.
       */
      call: 'pollCliLogin';
      with: { loginId: string };
      answer:
        | { status: 'pending' | 'cancelled' | 'expired' | 'used' }
        | { status: 'approved'; email: string; token: string }
        | ApiError;
    }
  | {
      /** `sherlo logout` ends the saved login on the service. An error is a service it could not reach. */
      call: 'logOutCli';
      with: Record<string, never>;
      answer: Record<string, never> | ApiError;
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

    whoAmI: async () => answerFor('whoAmI', {}) as PersonOfToken,

    listProjects: async ({ teamId }) => answerFor('listProjects', { teamId }) as ProjectList,

    // The platforms this run opened a build for are the ones its build-run config carries - the
    // command composed that, so it is read off the payload rather than restated by the pose.
    openBuild: async (request) => {
      // The config carries `include`/`exclude` beside the platforms, and the standard road writes
      // a platform key it has no binary for as undefined - so the platforms are the two keys
      // that hold a config, never every key.
      const config = (request.buildRunConfig ?? {}) as Record<string, unknown>;
      const platforms = ['android', 'ios'].filter((platform) => config[platform] !== undefined);
      const answer = answerFor('openBuild', { platforms, pushFacts: request.pushFacts }) as {
        buildIndex: number;
        url: string;
        captureDecision?: PosedCaptureDecision;
        hasCiToken?: boolean;
        buildTicket?: string;
      };

      return {
        ...openBuildAnswerOf(answer.buildIndex, platforms as Platform[], answer.captureDecision),
        ...(answer.hasCiToken === undefined ? {} : { hasCiToken: answer.hasCiToken }),
        ...(answer.buildTicket === undefined ? {} : { buildTicket: answer.buildTicket }),
      };
    },

    joinBuild: async ({ joinKey, platform, pushFacts }) => {
      const answer = answerFor('joinBuild', { joinKey, platform, pushFacts }) as {
        buildIndex: number;
        waitingFor: Platform[];
        startedRun?: StartedRun;
      };
      // Only what the tool reads of the answer, as `openBuildAnswerOf` poses `openBuild`'s.
      return {
        build: { index: answer.buildIndex },
        waitingFor: answer.waitingFor,
        ...(answer.startedRun ? { startedRun: answer.startedRun } : {}),
      } as unknown as JoinBuildAnswer;
    },

    // The platform is the one whose storage key the delivery carries - the request names no other.
    asyncUpload: async (request) =>
      answerFor('asyncUpload', {
        buildIndex: request.buildIndex,
        platform: request.androidS3Key ? 'android' : 'ios',
        pushFacts: request.pushFacts,
      }) as AsyncUploadAnswer,

    closeBuild: async (request) =>
      answerFor('closeBuild', {
        buildIndex: request.buildIndex,
        runError: request.runError,
      }) as CloseBuildAnswer,

    getNextBuildInfo: async (request) => {
      const answer = answerFor('getNextBuildInfo', {
        platforms: request.platforms,
      }) as NextBuildInfoAnswer;

      return nextBuildInfoAnswerOf(answer, request.platforms);
    },

    getStagedUploadUrls: async (request) => {
      answerFor('getStagedUploadUrls', { platforms: request.platforms });

      return stagedUploadUrlsAnswerOf(request.platforms);
    },

    // The gate is asked per platform with the base fingerprint the tool computed; the pose states
    // both, so a pose cannot answer a question about a base the run never measured.
    checkStagedGate: async (request) =>
      answerFor('checkStagedGate', {
        platform: request.platform,
        baseFingerprint: request.baseFingerprint,
      }) as CheckStagedGateAnswer & StoredAppBuildFacts,

    // The step that sent the report is the one thing a pose can meaningfully state about it: the
    // params carry whatever that step measured, which the command composed rather than the pose.
    trackCliInit: async (request) =>
      answerFor('trackCliInit', { event: request.event }) as TrackCliInitAnswer,

    // The poll secret is this run's own and never printed, so a pose does not state one: the
    // posed login carries a stand-in, and the poll is checked by its login id alone.
    startCliLogin: async () => {
      const answer = answerFor('startCliLogin', {}) as Omit<PendingCliLogin, 'pollSecret'>;
      return { ...answer, pollSecret: 'posed-poll-secret' };
    },

    pollCliLogin: async ({ loginId }) => answerFor('pollCliLogin', { loginId }) as CliLoginAnswer,

    logOutCli: async () => {
      answerFor('logOutCli', {});
    },
  };
}

/* ========================================================================== */

/**
 * The `openBuild` response the tool reads, built from the facts a pose states about it.
 *
 * A pose says which build the server opened, and MAY say the server's capture decision
 * ({@link PosedCaptureDecision}) - a DECISION the server made, which `printCapturePlanAndCloser`
 * reads off `buildRun.config[platform].captureScope` and `build.diffScopeInfo`. Absent, this is
 * the tool's own "the server made no decision" - it prints no plan block and closes with the
 * link, exactly as it does against a backend that does not send one.
 */
function openBuildAnswerOf(
  buildIndex: number,
  platforms: Platform[],
  captureDecision: PosedCaptureDecision | undefined
): OpenBuildAnswer {
  return {
    build: { index: buildIndex, diffScopeInfo: diffScopeInfoOf(captureDecision) },
    buildRun: {
      config: Object.fromEntries(
        platforms.map((platform) => [platform, platformConfigOf(captureDecision, platform)])
      ),
    },
  } as unknown as OpenBuildAnswer;
}

/** One platform's `buildRun.config` entry - its capture scope, when the pose states a decision for it. */
function platformConfigOf(
  captureDecision: PosedCaptureDecision | undefined,
  platform: string
): Record<string, unknown> {
  const decision = captureDecision?.platforms[platform];
  if (!decision) return {};

  return {
    captureScope: {
      full: decision.full,
      storyFilePaths: decision.storyFilePaths,
      newStoryFilePaths: decision.newStoryFilePaths,
      changedStoryFilePaths: decision.changedStoryFilePaths,
    },
  };
}

/** `build.diffScopeInfo`, from the pose's capture decision - undefined when the pose states none. */
function diffScopeInfoOf(
  captureDecision: PosedCaptureDecision | undefined
): Record<string, unknown> | undefined {
  if (!captureDecision) return undefined;

  return {
    fullCaptureTriggerReason: captureDecision.fullCaptureTriggerReason,
    ancestorBuildIndex: captureDecision.ancestorBuildIndex,
    capturedSnapshotCount: captureDecision.capturedSnapshotCount,
    inheritedSnapshotCount: captureDecision.inheritedSnapshotCount,
    platforms: {
      android: platformReasonOf(captureDecision, 'android'),
      ios: platformReasonOf(captureDecision, 'ios'),
    },
  };
}

/** One platform's `diffScopeInfo.platforms[platform]` entry - its reason, when the pose states one. */
function platformReasonOf(
  captureDecision: PosedCaptureDecision,
  platform: string
): { reason: string } | undefined {
  const reason = captureDecision.platforms[platform]?.reason;
  return reason !== undefined ? { reason } : undefined;
}

/**
 * The `getNextBuildInfo` response the tool reads, from the two facts a pose states about it.
 *
 * A pose says which build comes next and, per binary, whether the server wants it uploaded or
 * already holds it from an earlier build. The slot address and the storage key are the server's
 * own business - nothing the tool prints reads either - so they are stand-ins here, shaped the
 * way the tool tells an upload from a reuse: an upload has a `url`, a reuse has none.
 */
function nextBuildInfoAnswerOf(
  posed: NextBuildInfoAnswer,
  platforms: NextBuildInfoRequest['platforms']
): SdkNextBuildInfoAnswer {
  const binariesInfo: Record<string, unknown> = {};

  for (const platform of platforms) {
    const scripted = posed.binaries[platform];
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

  return {
    binariesInfo,
    nextBuildIndex: posed.nextBuildIndex,
  } as unknown as SdkNextBuildInfoAnswer;
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

/**
 * The first argument the pose and the command disagree about, said in one sentence.
 *
 * `platforms` IS COMPARED AS A SET, NOT AS AN ARRAY - same members, any order. The two call sites
 * that assemble it disagree with each other about the order: `getPlatformsToTest` walks `devices`
 * in sherlo.config.json, and a real push instead walks the binaries the command line named, where
 * `--android` is written before `--ios`. Neither order is a claim about behaviour - it is which
 * object the tool happened to iterate - so a pose asserting one order over the other would be
 * asserting an implementation detail, and refusing the WHOLE RUN to do it (this cost the Diff
 * Scope saga two capture rounds: run 35415047617 posed `["android","ios"]` against a
 * `getNextBuildInfo` made with `["ios","android"]`, and after that order was "fixed", run
 * 35451053180 refused on `getStagedUploadUrls` making the SAME call with the OTHER order). Every
 * other argument a pose scripts is either a scalar or, like `checkStagedGate`'s `platform`, a
 * single value - `platforms` is the only array among them, so this is the one field this
 * comparison treats specially.
 */
function firstMismatch(
  scripted: Record<string, unknown>,
  asked: Record<string, unknown>
): string | undefined {
  for (const field of Object.keys(scripted)) {
    if (field === 'platforms' && sameSetOfPlatforms(scripted[field], asked[field])) continue;

    const expected = JSON.stringify(scripted[field]);
    const actual = JSON.stringify(asked[field]);
    if (expected !== actual) {
      return `the pose scripts it with \`${field}\` = ${expected}, and the command made it with ${actual}`;
    }
  }

  return undefined;
}

/** Whether two values are both arrays holding the same platforms, order aside. */
function sameSetOfPlatforms(scripted: unknown, asked: unknown): boolean {
  if (!Array.isArray(scripted) || !Array.isArray(asked)) return false;
  if (scripted.length !== asked.length) return false;

  const sortedScripted = [...scripted].sort();
  const sortedAsked = [...asked].sort();
  return sortedScripted.every((platform, index) => platform === sortedAsked[index]);
}
