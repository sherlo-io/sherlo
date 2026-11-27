/**
 * WHICH LINES OF A FAILED PACKAGE INSTALL THE SCREEN SHOWS - the rule settled in init-for-agents
 * (decision 6), read from the sources of npm 11, Yarn 1.22, Yarn 4, pnpm 12 and Bun.
 *
 * A package manager prints far more than its cause: progress, banners, Yarn 4's step frames. The
 * screen keeps the lines that ARE the cause, then a little context, and the whole output goes to a
 * log file named on the screen:
 *
 *     1. the error lines, in order, without repeats, at most 15 - each tool marks its own:
 *          npm          `npm error ...` (`npm ERR! ...` before npm 10.7)
 *          Yarn 1       `error ...`
 *          Yarn 2-4     run with `--json`: the records of type `error` (its colours alone tell an
 *                       error from a warning, so only `--json` can)
 *          pnpm         its error block, from the first `ERR_PNPM_...` or `ERROR` line to the end
 *          Bun, Deno    `error: ...`
 *     2. then the last 5 other lines, minus the tool's known noise (npm's "complete log" line,
 *        Yarn 1's `info Visit`, pnpm's `Progress:`, Yarn 4's step frames)
 *     3. nothing marked as an error: the last 20 lines, as they are
 *
 * Any log file the tool named itself (npm's debug log and ERESOLVE report, Yarn's error and build
 * logs) is picked out too, so the screen can point at it beside setup's own log.
 *
 * Pure: the tool and its output in, the lines out.
 */

import type { Agent } from 'package-manager-detector';

const ERROR_LINES_SHOWN = 15;
const OTHER_LINES_SHOWN = 5;
const LINES_SHOWN_WHEN_NOTHING_IS_MARKED = 20;

const NOISE = [
  /^npm (?:error|ERR!) A complete log of this run can be found in:/,
  /^info Visit /,
  /^Progress: /,
];

/** Yarn 4's step frames: `┌ Resolution step`, `└ Completed in 0s`, `· Failed with errors`. */
const YARN_STEP_FRAME = /^[┌└·]/;

/** A log file a package manager names in its own output. */
const TOOL_LOG_FILE =
  /(?:~|\/|[A-Za-z]:\\)[^\s"'()]*?(?:-debug-\d+\.log|eresolve-report\.txt|yarn-error\.log|build\.log)/g;

/** U+2009, written by its number: the character itself is invisible in the source. */
const THIN_SPACE = String.fromCodePoint(0x2009);

/**
 * Colours, cursor moves and terminal links out; of a redrawn line, only what was drawn last. The thin
 * spaces pnpm pads its error code with become plain spaces: without the badge's colour they read as
 * the gap pnpm's own log shows, two spaces between the code and the message.
 */
function plainText(text: string): string {
  const withoutEscapes = text
    .replace(/\u001b\]8;[^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    .replaceAll(THIN_SPACE, ' ');
  return withoutEscapes.slice(withoutEscapes.lastIndexOf('\r') + 1).trim();
}

/** One printed line, and whether the tool marked it as an error. */
type PrintedLine = { text: string; isError: boolean };

function readLines(tool: Agent, output: string): PrintedLine[] {
  // A Windows line ending goes with its line: left on, plainText would read the line as redrawn
  // to nothing.
  const rawLines = output.split(/\r?\n/);

  if (tool === 'yarn@berry') {
    return rawLines.map((rawLine) => {
      try {
        const record = JSON.parse(rawLine) as {
          type?: string;
          displayName?: string;
          data?: string;
        };
        const text = plainText(String(record.data ?? ''));
        if (YARN_STEP_FRAME.test(text)) {
          return { text: '', isError: false };
        }
        if (record.type === 'error') {
          return { text: `${record.displayName}: ${text}`, isError: true };
        }
        return { text, isError: false };
      } catch {
        // Not a record: Yarn printed it outside its report, as it does a crash.
        return { text: plainText(rawLine), isError: false };
      }
    });
  }

  const lines = rawLines.map(plainText);

  if (tool === 'pnpm' || tool === 'pnpm@6') {
    const errorBlockStart = lines.findIndex((line) => /^(?:ERR_PNPM_\w+|ERROR)\s/.test(line));
    return lines.map((text, index) => ({
      text,
      isError: errorBlockStart !== -1 && index >= errorBlockStart,
    }));
  }

  const errorLine =
    tool === 'npm' ? /^npm (?:error|ERR!) / : tool === 'yarn' ? /^error / : /^error:/;
  return lines.map((text) => ({ text, isError: errorLine.test(text) }));
}

export function pickInstallOutput({
  tool,
  output,
}: {
  /** As package-manager-detector names it: Yarn 2 and newer is `yarn@berry`. */
  tool: Agent;
  /** Both streams the tool printed, in the order it printed them. */
  output: string;
}): { lines: string[]; toolLogFiles: string[] } {
  const printed = readLines(tool, output).filter(({ text }) => text !== '');
  const toolLogFiles = [...new Set(printed.flatMap(({ text }) => text.match(TOOL_LOG_FILE) ?? []))];

  const errorLines = [
    ...new Set(
      printed
        .filter(({ text, isError }) => isError && !NOISE.some((noise) => noise.test(text)))
        .map(({ text }) => text)
    ),
  ].slice(0, ERROR_LINES_SHOWN);

  if (errorLines.length === 0) {
    return {
      lines: printed.slice(-LINES_SHOWN_WHEN_NOTHING_IS_MARKED).map(({ text }) => text),
      toolLogFiles,
    };
  }

  const otherLines = printed
    .filter(({ text, isError }) => !isError && !NOISE.some((noise) => noise.test(text)))
    .slice(-OTHER_LINES_SHOWN)
    .map(({ text }) => text);

  return { lines: [...errorLines, ...otherLines], toolLogFiles };
}

/**
 * How each tool says the registry has no version the range allows, in its own words (read from the
 * same sources as the rule above), as `readLines` gives the error line: the first group is the
 * package it names. Yarn 4's day hold is not one of them: that version is published, and Yarn
 * says "are quarantined" for it.
 */
const VERSION_NOT_PUBLISHED: Partial<Record<Agent, RegExp>> = {
  npm: /^npm (?:error|ERR!) notarget No matching version found for (@?[^@\s]+)@/,
  yarn: /^error Couldn't find any versions for "([^"]+)"/,
  'yarn@berry': /^YN0082: (@?[^@\s]+)@/,
  pnpm: /^ERR_PNPM_NO_MATCHING_VERSION\s+No matching version found for (@?[^@\s]+)@/,
  'pnpm@6': /^ERR_PNPM_NO_MATCHING_VERSION\s+No matching version found for (@?[^@\s]+)@/,
  bun: /^error: No version matching "[^"]*" found for specifier "([^"]+)"/,
};

/**
 * Whether the failed install says the registry has no version of `packageName` the range allows.
 * THE ERROR LINE MUST NAME THE PACKAGE: an install resolves the whole project, so another
 * dependency with no matching version fails it in the same words, and that is the install-failed
 * screen's, not this one's.
 */
export function saysVersionNotPublished({
  tool,
  output,
  packageName,
}: {
  tool: Agent;
  output: string;
  packageName: string;
}): boolean {
  const notPublished = VERSION_NOT_PUBLISHED[tool];
  if (!notPublished) return false;
  return readLines(tool, output).some(
    ({ text, isError }) => isError && notPublished.exec(text)?.[1] === packageName
  );
}
