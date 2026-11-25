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
 * spaces pnpm pads its error code with go too: without the badge's colour they are only a gap.
 */
function plainText(text: string): string {
  const withoutEscapes = text
    .replace(/\u001b\]8;[^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    .replaceAll(THIN_SPACE, '');
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
