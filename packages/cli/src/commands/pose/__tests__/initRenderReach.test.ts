/**
 * EVERY PIECE OF SETUP'S MESSAGE CODE IS DRAWN BY SOME POSE.
 *
 * The catalogue law (./catalogue.test.ts) proves each committed init pose prints what it committed.
 * What it cannot see is a message no pose reaches: a refusal, a next step, or one branch of one that
 * a real user can meet and nobody has ever looked at. This file runs every init pose, for a person
 * and for an agent, with V8's own block coverage on, and fails naming each render function of
 * initSteps.ts and initFixes.ts - or each branch inside one that holds its own words - that no run
 * reached. V8 counts what really ran, so the answer is measured, not inferred from a list of names.
 *
 * A branch holds its own words when a string or template literal in it has a word of two letters or
 * more: an empty line, a separator or a plural `s` is no screen of its own.
 *
 * NOT YET DRAWN lists each unreached message a real user can meet that no pose draws yet, with why.
 * It only shrinks: a listed message a pose now reaches fails until it is taken off.
 */
import { parse } from '@babel/parser';
import { Session } from 'inspector';
import path from 'path';
import { describe, expect, it } from 'vitest';
import type { CataloguedPose } from '../catalogue';

/**
 * The files `sherlo init` prints its steps, its refusals and its errors through: every render file
 * of setup's own, the login it shares with `sherlo login`, the install output it shows, and the
 * error screen every refusal ends on.
 */
const INIT_RENDER_FILES = [
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

const NOT_YET_DRAWN: Record<string, string> = {
  'initSteps.ts renderNextSteps: <your Storybook folder>': NO_FOLDER_YET,
  'initSteps.ts renderNextSteps: Set "stories" in your Storybook folder\'s main file to your code\'s folder.':
    NO_FOLDER_YET,
  "initSteps.ts defaultSetupChoice: your Storybook folder's index file": NO_FOLDER_YET,
  'initWorkflow.ts versionInput: \\n with:\\n ${}: ${}':
    "setup does not read the developer's own pnpm or Bun version for a project with no " +
    'packageManager field yet (BUILD DEBT, init-for-agents), so it never passes one to the workflow',
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

type Range = { startOffset: number; endOffset: number; count: number };
type FunctionCoverage = { functionName: string; ranges: Range[] };
type ScriptCoverage = { scriptId: string; url: string; functions: FunctionCoverage[] };
type TextLiteral = { start: number; end: number; text: string };

describe('the init render layer', () => {
  it('every render function, and every branch of one that prints its own words, is reached by some init pose', async () => {
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

    // Imported only now, so the render modules are compiled with block counters on.
    const { catalogue, renderPose } = await import('../catalogue');
    for (const { posePath } of catalogue().filter(
      ({ agentLogPath }: CataloguedPose) => agentLogPath
    )) {
      await renderPose(posePath, 'person');
      await renderPose(posePath, 'agent');
    }

    const { result } = await post<{ result: ScriptCoverage[] }>('Profiler.takePreciseCoverage');
    const covered = result.filter(({ url }) => isInitRenderFile(url));
    // A render file no pose loaded would pass with nothing measured: each one must have been seen.
    expect(covered.map(({ url }) => path.basename(url)).sort()).toEqual(INIT_RENDER_FILES);

    const unreached = new Set<string>();
    for (const script of covered) {
      const { scriptSource } = await post<{ scriptSource: string }>('Debugger.getScriptSource', {
        scriptId: script.scriptId,
      });
      const literals = textLiterals(scriptSource);
      const file = path.basename(script.url);
      for (const { functionName, ranges } of script.functions) {
        const [whole, ...blocks] = ranges;
        const wordsIn = (range: Range) =>
          literals.filter(({ start, end }) => start >= range.startOffset && end <= range.endOffset);
        if (whole?.count === 0) {
          if (wordsIn(whole).length > 0) unreached.add(`${file} ${functionName} is never called`);
          continue;
        }
        for (const block of blocks.filter(({ count }) => count === 0)) {
          for (const { text } of wordsIn(block)) unreached.add(`${file} ${functionName}: ${text}`);
        }
      }
    }
    await post('Profiler.stopPreciseCoverage');
    session.disconnect();

    const listed = { ...NOT_YET_DRAWN, ...OTHER_COMMANDS_ONLY };
    const undrawn = [...unreached].filter((message) => !(message in listed));
    const drawnNow = Object.keys(listed).filter((message) => !unreached.has(message));
    expect({ undrawn, drawnNow }).toEqual({ undrawn: [], drawnNow: [] });
  });
});

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
