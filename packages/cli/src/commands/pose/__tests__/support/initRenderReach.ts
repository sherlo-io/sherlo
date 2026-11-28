/**
 * EVERY PIECE OF SETUP'S MESSAGE CODE IS DRAWN BY SOME POSE, CUT INTO SHARDS.
 *
 * The catalogue law (../catalogue.test.ts) proves each committed init pose prints what it committed.
 * What it cannot see is a message no pose reaches: a refusal, a next step, or one branch of one that
 * a real user can meet and nobody has ever looked at. Each reach shard runs its share of the init
 * poses, for a person and for an agent, with V8's own block coverage on, and fails naming each
 * render function of initSteps.ts and initFixes.ts - or each branch inside one that holds its own
 * words - that no pose reached. V8 counts what really ran, so the answer is measured, not inferred
 * from a list of names.
 *
 * A branch holds its own words when a string or template literal in it has a word of two letters or
 * more: an empty line, a separator or a plural `s` is no screen of its own.
 *
 * WHY A WITNESS FILE. "Some pose reaches it" is a fact about every pose at once, and one test file
 * running every init pose twice is past the five seconds a file gets, so the poses are cut into
 * shards that run in parallel workers and never see each other. A message one shard leaves
 * unreached is then drawn only if another shard reaches it, and that is what
 * ../initRenderReach.witnesses.json records: for each such message, one pose that reaches it. Each
 * shard proves the records of its own poses (a witness that no longer reaches its message fails its
 * shard), so the records together are true, and each shard accepts an unreached message only when
 * it is recorded or listed below. The file is re-minted with
 *
 *     ALLOW_LOCAL_TEST_EXEC=1 MINT_POSES=1 yarn test src/commands/pose/__tests__/initRenderReach.test.ts
 *
 * which runs every init pose once in that one file, a local step, never a pull request's check.
 *
 * NOT YET DRAWN lists each unreached message a real user can meet that no pose draws yet, with why.
 * It only shrinks: a listed message a pose now reaches fails until it is taken off.
 *
 * THIS FILE IMPORTS NOTHING FROM THE CLI BUT ITS TYPES: the render modules must be compiled after
 * coverage is on, so the catalogue is imported only inside the measurement.
 */
import { parse } from '@babel/parser';
import fs from 'fs';
import { Session } from 'inspector';
import path from 'path';
import type { CataloguedPose } from '../../catalogue';

/** How many test files share the init poses: about 25 poses, two runs each, a second apiece. */
export const REACH_SHARD_COUNT = 4;

/** For each message some shard leaves unreached, one pose that reaches it. */
export const WITNESSES_PATH = path.join(__dirname, '..', 'initRenderReach.witnesses.json');

/**
 * The files `sherlo init` prints its steps, its refusals and its errors through: every render file
 * of setup's own, the login it shares with `sherlo login`, the install output it shows, and the
 * error screen every refusal ends on.
 */
export const INIT_RENDER_FILES = [
  'initFixes.ts',
  'initLines.ts',
  'initSteps.ts',
  'initWorkflow.ts',
  'installOutput.ts',
  'login.ts',
  'throwError.ts',
];
const isInitRenderFile = (url: string) =>
  /[/\\]src[/\\](render|helpers)[/\\][A-Za-z]+\.ts$/.test(url) &&
  INIT_RENDER_FILES.includes(path.basename(url));

/** Folder-less words, owed only while the install writes no Storybook folder (seams/workstation.ts). */
const NO_FOLDER_YET =
  'the Storybook folder is unknown only while the install writes no .rnstorybook ' +
  '(BUILD DEBT, init-for-agents decision 2); once it does, this branch is dead and is deleted';

/** The interactive project step's failure, owed while that step stays in the code. */
const OLD_PROJECT_STEP =
  'old project step no setup run calls: setup asks nothing now (BUILD DEBT, init-for-agents), ' +
  'and the step is deleted with it';

/** The config write's failure, which needs a config setup can read but not write. */
const CONFIG_WRITE_FAILED =
  'a pose sets no file modes, and any other config setup cannot write fails the app check first, ' +
  'which reads sherlo.config.json before anything is written (config-unreadable draws that)';

/** The Metro config's and the workflow's write failing at their own step. */
const LATER_WRITE_FAILED =
  'a pose sets no file modes, and a folder or file standing where metro.config.js or the workflow ' +
  'goes is refused by the app check before the login (metro-config-write-failed and ' +
  'workflow-write-failed draw that)';

const NOT_YET_DRAWN: Record<string, string> = {
  'initSteps.ts initStepActivity: creating-metro-config': LATER_WRITE_FAILED,
  'initSteps.ts initStepActivity: Creating Metro config': LATER_WRITE_FAILED,
  'initSteps.ts initStepActivity: adding-github-workflow': LATER_WRITE_FAILED,
  'initSteps.ts initStepActivity: Adding GitHub workflow': LATER_WRITE_FAILED,
  'initSteps.ts initStepActivity: creating-config': CONFIG_WRITE_FAILED,
  'initSteps.ts initStepActivity: Creating config': CONFIG_WRITE_FAILED,
  'initSteps.ts initStepActivity: updating-config': CONFIG_WRITE_FAILED,
  'initSteps.ts initStepActivity: Updating config': CONFIG_WRITE_FAILED,
  'initSteps.ts renderNextSteps: <your Storybook folder>': NO_FOLDER_YET,
  'initSteps.ts renderNextSteps: Set "stories" in your Storybook folder\'s main file to your code\'s folder.':
    NO_FOLDER_YET,
  "initSteps.ts defaultSetupChoice: your Storybook folder's index file": NO_FOLDER_YET,
  'initWorkflow.ts versionInput: \\n with:\\n ${}: ${}':
    "setup does not read the developer's own pnpm or Bun version for a project with no " +
    'packageManager field yet (BUILD DEBT, init-for-agents), so it never passes one to the workflow',
  'initSteps.ts initStepActivity: choosing-a-project': OLD_PROJECT_STEP,
  'initSteps.ts initStepActivity: Choosing a project': OLD_PROJECT_STEP,
};

/**
 * Words of a file setup shares with other commands that only those commands print. Like NOT YET
 * DRAWN, a listed message a setup pose now reaches fails until it is taken off.
 */
const OTHER_COMMANDS_ONLY: Record<string, string> = {
  'login.ts renderLoggedIn is never called': "sherlo login's own line",
  'login.ts renderAlreadyLoggedIn is never called': "sherlo login's own line",
  'login.ts renderLoggedOut is never called': "sherlo logout's own line",
  'login.ts renderNotLoggedIn is never called': "sherlo logout's own line",
  'throwError.ts getErrorMessage: cause: ${}':
    "no unexpected error of setup's carries a cause; a failed request of sherlo test does",
  'throwError.ts describeCause: object':
    "no unexpected error of setup's carries a cause; a failed request of sherlo test does",
  'throwError.ts getErrorMessage: ↳ Learn more: ${}': "no refusal of setup's links to more reading",
};

/** Every message known to be unreached by every pose, with why. */
export const LISTED: Record<string, string> = { ...NOT_YET_DRAWN, ...OTHER_COMMANDS_ONLY };

/**
 * What a run of poses reached of the render files: for each message, each place in its file it is
 * written, and whether the run reached it there. A message is reached when every place is.
 */
export type Reach = Map<string, Map<string, boolean>>;

/** The init poses of a catalogue: the ones whose agent log is drawn too. */
export function initPoses(poses: CataloguedPose[]): CataloguedPose[] {
  return poses.filter(({ agentLogPath }) => agentLogPath);
}

/** The init poses reach shard `shard` (1 to REACH_SHARD_COUNT) runs: every REACH_SHARD_COUNT-th. */
export function posesOfReachShard(poses: CataloguedPose[], shard: number): CataloguedPose[] {
  return initPoses(poses).filter((_, place) => place % REACH_SHARD_COUNT === shard - 1);
}

/** The messages a reach holds, each with whether it was reached at every place it is written. */
export function messagesOf(reach: Reach): { seen: string[]; reached: Set<string> } {
  const seen = [...reach.keys()];
  return {
    seen,
    reached: new Set(seen.filter((message) => [...reach.get(message)!.values()].every(Boolean))),
  };
}

/** One reach of several runs: a place is reached when any run reached it. */
export function joinReaches(reaches: Reach[]): Reach {
  const joined: Reach = new Map();
  for (const reach of reaches) {
    for (const [message, places] of reach) {
      const into = joined.get(message) ?? new Map<string, boolean>();
      for (const [place, reached] of places) into.set(place, (into.get(place) ?? false) || reached);
      joined.set(message, into);
    }
  }
  return joined;
}

type Range = { startOffset: number; endOffset: number; count: number };
type FunctionCoverage = { functionName: string; ranges: Range[] };
type ScriptCoverage = { scriptId: string; url: string; functions: FunctionCoverage[] };
type TextLiteral = { start: number; end: number; text: string };

/**
 * Runs `posesToRun` (picked from the catalogue once it is loaded under coverage) for a person and
 * an agent, and answers what was reached: one reach for each pose when `eachPose`, else one for
 * them all. Also answers the render files seen, and every init pose's name.
 */
export async function measureReach(
  posesToRun: (catalogued: CataloguedPose[]) => CataloguedPose[],
  { eachPose }: { eachPose: boolean }
): Promise<{
  reaches: Array<{ name: string; reach: Reach }>;
  ran: string[];
  files: string[];
  initPoseNames: string[];
}> {
  const session = new Session();
  session.connect();
  const post = <T>(method: string, params?: object) =>
    new Promise<T>((resolve, reject) =>
      session.post(method, params, (error, result) =>
        error ? reject(error) : resolve(result as T)
      )
    );

  await post('Profiler.enable');
  await post('Debugger.enable');
  await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });

  const literalsOf = new Map<string, TextLiteral[]>();
  const files = new Set<string>();
  // Each take answers the counts since the last one, so a take after each pose is that pose's own.
  const take = async (): Promise<Reach> => {
    const { result } = await post<{ result: ScriptCoverage[] }>('Profiler.takePreciseCoverage');
    const reaches: Reach[] = [];
    for (const script of result.filter(({ url }) => isInitRenderFile(url))) {
      files.add(path.basename(script.url));
      if (!literalsOf.has(script.scriptId)) {
        const { scriptSource } = await post<{ scriptSource: string }>('Debugger.getScriptSource', {
          scriptId: script.scriptId,
        });
        literalsOf.set(script.scriptId, textLiterals(scriptSource));
      }
      reaches.push(
        reachOfScript(path.basename(script.url), script.functions, literalsOf.get(script.scriptId)!)
      );
    }
    return joinReaches(reaches);
  };

  try {
    // Imported only now, so the render modules are compiled with block counters on.
    const { catalogue, renderPose } = await import('../../catalogue');
    const catalogued = catalogue();
    const toRun = posesToRun(catalogued);
    const reaches: Array<{ name: string; reach: Reach }> = [];
    for (const { name, posePath } of toRun) {
      await renderPose(posePath, 'person');
      await renderPose(posePath, 'agent');
      if (eachPose) reaches.push({ name, reach: await take() });
    }
    if (!eachPose) reaches.push({ name: 'every pose run', reach: await take() });

    return {
      reaches,
      ran: toRun.map(({ name }) => name),
      files: [...files].sort(),
      initPoseNames: initPoses(catalogued).map(({ name }) => name),
    };
  } finally {
    await post('Profiler.stopPreciseCoverage');
    session.disconnect();
  }
}

/**
 * What one script's coverage reached of its words. A literal belongs to the innermost function
 * holding it: a function never called is one message (`<file> <function> is never called`), and a
 * literal of a called function is its own message (`<file> <function>: <text>`), reached when the
 * innermost range V8 counted around it ran. The module's own body runs once, on import, so its
 * words are no message.
 */
function reachOfScript(
  file: string,
  functions: FunctionCoverage[],
  literals: TextLiteral[]
): Reach {
  const reach: Reach = new Map();
  const mark = (message: string, place: number, reached: boolean) => {
    const places = reach.get(message) ?? new Map<string, boolean>();
    places.set(String(place), (places.get(String(place)) ?? false) || reached);
    reach.set(message, places);
  };
  const holds = (range: Range, literal: TextLiteral) =>
    range.startOffset <= literal.start && literal.end <= range.endOffset;
  const narrowest = <T>(items: T[], rangeOf: (item: T) => Range) =>
    items.reduce((best, item) =>
      rangeOf(item).endOffset - rangeOf(item).startOffset <
      rangeOf(best).endOffset - rangeOf(best).startOffset
        ? item
        : best
    );

  // The module's body, and the function the test runner wraps it in, hold or are held by every
  // other function: none sits beside them.
  const within = (inner: Range, outer: Range) =>
    outer.startOffset <= inner.startOffset && inner.endOffset <= outer.endOffset;
  const isModuleBody = ({ ranges: [whole] }: FunctionCoverage) =>
    functions.every(
      ({ ranges: [other] }) => !other || within(other, whole) || within(whole, other)
    );

  // The same words written twice in one function are two messages, the second named `(#2)`: two
  // poses in different shards may each reach one, and each shard sees only its own.
  const timesWritten = new Map<string, number>();

  for (const literal of [...literals].sort((a, b) => a.start - b.start)) {
    const owners = functions.filter(({ ranges }) => ranges[0] && holds(ranges[0], literal));
    if (owners.length === 0) continue;
    const owner = narrowest(owners, ({ ranges }) => ranges[0]);
    if (isModuleBody(owner)) continue;

    const called = owner.ranges[0].count > 0;
    mark(`${file} ${owner.functionName} is never called`, owner.ranges[0].startOffset, called);
    if (!called) continue;

    const innermost = narrowest(
      owners.flatMap(({ ranges }) => ranges.filter((range) => holds(range, literal))),
      (range) => range
    );
    const message = `${file} ${owner.functionName}: ${literal.text}`;
    const written = (timesWritten.get(`${owner.ranges[0].startOffset} ${message}`) ?? 0) + 1;
    timesWritten.set(`${owner.ranges[0].startOffset} ${message}`, written);
    mark(written === 1 ? message : `${message} (#${written})`, literal.start, innermost.count > 0);
  }
  return reach;
}

/**
 * Every string and template literal of a script that holds a word of two letters or more, with its
 * place in the script and its text as written, a template's `${...}` parts shown as `${}`.
 */
function textLiterals(source: string): TextLiteral[] {
  const found: TextLiteral[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const { type, start, end } = node as { type?: string; start?: number; end?: number };
    if (type === 'StringLiteral' || type === 'TemplateLiteral') {
      const text =
        type === 'StringLiteral'
          ? (node as { value: string }).value
          : (node as { quasis: { value: { raw: string } }[] }).quasis
              .map((quasi) => quasi.value.raw)
              .join('${}');
      if (/[A-Za-z]{2}/.test(text) && start !== undefined && end !== undefined) {
        found.push({ start, end, text: text.replace(/\s+/g, ' ').trim().slice(0, 80) });
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== 'loc' && key !== 'leadingComments' && key !== 'trailingComments') visit(child);
    }
  };
  visit(
    parse(source, { sourceType: 'module', allowReturnOutsideFunction: true, errorRecovery: true })
      .program
  );
  return found;
}

/**
 * What shard `shard` finds wrong with the witness file and the lists above, from its own reach:
 * a message its poses leave unreached that is neither recorded nor listed (undrawn), a listed one
 * they reach (drawnNow), and a record of one of its poses that it no longer reaches (witnessLost).
 */
export function reachFaults(
  reach: Reach,
  shardPoseNames: string[],
  witnesses: Record<string, string>
): { undrawn: string[]; drawnNow: string[]; witnessLost: string[] } {
  const { seen, reached } = messagesOf(reach);
  const mine = new Set(shardPoseNames);
  return {
    undrawn: seen.filter(
      (message) => !reached.has(message) && !(message in witnesses) && !(message in LISTED)
    ),
    drawnNow: Object.keys(LISTED).filter((message) => reached.has(message)),
    witnessLost: Object.entries(witnesses)
      .filter(([message, pose]) => mine.has(pose) && !reached.has(message))
      .map(([message, pose]) => `${message} - ${pose}`),
  };
}

/** The title of reach shard `shard`'s case. */
export function reachShardTitle(shard: number): string {
  return (
    'every render function, and every branch of one that prints its own words, is reached by ' +
    `some init pose (reach shard ${shard} of ${REACH_SHARD_COUNT})`
  );
}

/** Runs reach shard `shard`'s poses and answers the render files it saw and what it finds wrong. */
export async function reachShardFaults(shard: number) {
  const { reaches, ran, files } = await measureReach(
    (catalogued) => posesOfReachShard(catalogued, shard),
    { eachPose: false }
  );
  return { files, ...reachFaults(reaches[0].reach, ran, readWitnesses()) };
}

/** What a failing reach shard says. */
export const REACH_MESSAGE =
  'undrawn: a message no pose of this shard reaches, that no other pose is recorded to reach ' +
  'and that is not listed as NOT YET DRAWN - draw it with a pose, or list it with why. ' +
  'drawnNow: a listed message a pose now reaches - take it off the list. witnessLost: a pose ' +
  'recorded to reach a message no longer does. When a pose was added or a message changed on ' +
  'purpose, re-mint the witness file (see support/initRenderReach.ts).';

/** The witness file as committed, or empty when there is none yet. */
export function readWitnesses(): Record<string, string> {
  return fs.existsSync(WITNESSES_PATH)
    ? (JSON.parse(fs.readFileSync(WITNESSES_PATH, 'utf8')) as Record<string, string>)
    : {};
}

/**
 * The witness file for a reach of each init pose: each message some shard leaves unreached and
 * another reaches, with the first pose of a reaching shard that reaches it at most places.
 */
export function witnessesFrom(
  reachOfEachPose: Array<{ name: string; reach: Reach }>
): Record<string, string> {
  const shards = Array.from({ length: REACH_SHARD_COUNT }, (_unused, index) =>
    reachOfEachPose.filter((_, place) => place % REACH_SHARD_COUNT === index)
  );
  const shardReached = shards.map(
    (poses) => messagesOf(joinReaches(poses.map(({ reach }) => reach))).reached
  );
  const everywhereReached = (message: string) =>
    shardReached.every((reached) => reached.has(message));
  const placesReached = (reach: Reach, message: string) =>
    [...(reach.get(message)?.values() ?? [])].filter(Boolean).length;

  const witnesses: Record<string, string> = {};
  const messages = new Set(reachOfEachPose.flatMap(({ reach }) => [...reach.keys()]));
  for (const message of [...messages].sort()) {
    if (everywhereReached(message)) continue;
    const shard = shardReached.findIndex((reached) => reached.has(message));
    if (shard === -1) continue;
    const witness = shards[shard].reduce((best, pose) =>
      placesReached(pose.reach, message) > placesReached(best.reach, message) ? pose : best
    );
    witnesses[message] = witness.name;
  }
  return witnesses;
}
