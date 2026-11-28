/**
 * WHICH LINES OF A FAILED PACKAGE INSTALL THE SCREEN SHOWS - the rule settled in init-for-agents
 * (decision 6), read from the sources of npm 11, Yarn 1.22, Yarn 4, pnpm 12 and Bun.
 *
 * A package manager prints far more than its cause: progress, banners, Yarn 4's step frames. The
 * screen keeps the lines that ARE the cause, then a little context, and the whole output goes to a
 * log file named on the screen:
 *
 *     1. the error lines, in order, without repeats, at most 15 - each tool marks its own:
 *          npm          `npm error ...`, and a bare `npm error` (`npm ERR! ...` before npm 10.7)
 *          Yarn 1       `error ...`
 *          Yarn 2-4     run with `--json`: the records of type `error`, the first line of each
 *                       (the rest is a stack) - its colours alone tell an error from a warning,
 *                       so only `--json` can
 *          pnpm         its error block, from the first `ERR_PNPM_...`, `Error: ERR_PNPM_...` or
 *                       `ERROR` line to the end; pnpm 12's box as one line per message
 *          Bun, Deno    `error: ...`
 *     2. then the last 5 other lines, without repeats, minus the tool's known noise (npm's
 *        "complete log" line, Yarn 1's `info Visit`, pnpm's `Progress:` and update banner, Yarn 4's
 *        step frames)
 *     3. nothing marked as an error: the last 20 lines, as they are
 *
 * The real words this follows were measured on Node 26.13.1 (npm 11.20.0, Yarn 1.22.22, Yarn
 * 4.18.1, pnpm 10.12.1 and 12.21.0, Bun 1.4.5): installOutput.test.ts holds them.
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
  // pnpm 12's banner when a newer pnpm is out: not the cause, and updating pnpm is not the fix.
  /^Update available! /,
  /^Changelog: https:\/\/pnpm\.io\//,
  /^To update, run: /,
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
  return plainTextKeepingIndent(text).trim();
}

/** plainText with the line's indent kept, which pnpm 12's box needs to tell a wrap from a new line. */
function plainTextKeepingIndent(text: string): string {
  const withoutEscapes = text
    .replace(/\u001b\]8;[^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    .replaceAll(THIN_SPACE, ' ');
  return withoutEscapes.slice(withoutEscapes.lastIndexOf('\r') + 1).trimEnd();
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
          indent?: string;
          data?: string;
        };
        // A record's first line is its message; the rest is the stack Node attached to it (Yarn 4
        // on Node 26: `Error [ERR_SOCKET_CLOSED_BEFORE_CONNECTION]: ...\n    at TLSSocket.onClose`).
        const text = plainText(String(record.data ?? '').split('\n')[0]);
        // The closing frame is an `error` record with its `·` in the indent, not in the data:
        // `{"type":"error","displayName":"YN0000","indent":"· ","data":"Failed with errors in 0s"}`.
        if (YARN_STEP_FRAME.test(text) || YARN_STEP_FRAME.test(record.indent ?? '')) {
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
    // pnpm 10 opens its block with ` ERR_PNPM_<CODE>  <message>`; pnpm 12 with `Error: ERR_PNPM_<CODE>`
    // alone on its line, then a box that holds the message.
    const errorBlockStart = lines.findIndex((line) =>
      /^(?:Error: )?(?:ERR_PNPM_\w+|ERROR)(?:\s|$)/.test(line)
    );
    if (errorBlockStart === -1) return lines.map((text) => ({ text, isError: false }));
    const errorBlock = lines[errorBlockStart].startsWith('Error: ')
      ? [lines[errorBlockStart], ...unboxedLines(rawLines.slice(errorBlockStart + 1))]
      : lines.slice(errorBlockStart);
    return [
      ...lines.slice(0, errorBlockStart).map((text) => ({ text, isError: false })),
      ...errorBlock.map((text) => ({ text, isError: true })),
    ];
  }

  // npm 11 marks a blank line of its error with a bare `npm error`, no space after it.
  const errorLine =
    tool === 'npm' ? /^npm (?:error|ERR!)(?:\s|$)/ : tool === 'yarn' ? /^error / : /^error:/;
  return lines.map((text) => ({ text, isError: errorLine.test(text) }));
}

/** Where a message of pnpm 12's box starts: `× adding a new package`, `├─▶ cause`, `╰─▶ root cause`, `help: ...`. */
const BOX_MESSAGE_START = /^\s*(?:×|├─▶|╰─▶|help:) /;

/**
 * THE MESSAGES OF PNPM 12'S ERROR BOX, ONE LINE EACH, without the box. pnpm 12 draws its error as a
 * chain of causes wrapped at the terminal's width (real pnpm 12.21.0, refused connection):
 *
 *       × adding a new package
 *       ├─▶ Failed to fetch metadata from https://127.0.0.1:9/@sherlo%2Freact-
 *       │   native-storybook: error sending request: client error (Connect): tcp
 *       │   connect error: Connection refused (os error 61)
 *       ├─▶ error sending request
 *       ╰─▶ Connection refused (os error 61)
 *
 * A line that starts where the message's text starts is that message wrapped, and joins it; one
 * that starts further in (`* alpha: 2.0.0-alpha.1` under `Other releases are:`) is a line of its
 * own, and so is the line after a blank one. The wrap breaks inside a word only after `-` or `/`
 * (`react-` / `native-storybook`, `https://` / `registry.npmjs.org/`), so a wrapped part joins those
 * with no space.
 */
function unboxedLines(rawBoxLines: string[]): string[] {
  const messages: string[] = [];
  // The column the last kept line starts at; -1 after a blank line, which nothing joins.
  let joinColumn = -1;
  for (const rawLine of rawBoxLines) {
    const boxLine = plainTextKeepingIndent(rawLine);
    const start = BOX_MESSAGE_START.exec(boxLine);
    if (start) {
      const marker = start[0].trim();
      messages.push(
        `${marker === 'help:' ? 'help: ' : ''}${boxLine.slice(start[0].length).trim()}`
      );
      joinColumn = start[0].length;
      continue;
    }
    // The cause chain's gutter is not part of the text.
    const line = boxLine.replace(/^(\s*)│/, '$1 ');
    const text = line.trim();
    if (text === '') {
      joinColumn = -1;
      continue;
    }
    const column = line.length - line.trimStart().length;
    if (column === joinColumn && messages.length > 0) {
      const wrapped = messages[messages.length - 1];
      messages[messages.length - 1] = /[-/]$/.test(wrapped)
        ? `${wrapped}${text}`
        : `${wrapped} ${text}`;
    } else {
      messages.push(text);
      joinColumn = column;
    }
  }
  return messages;
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

  // Without repeats too: Yarn 1 says it is retrying four times in the same words.
  const otherLines = [
    ...new Set(
      printed
        .filter(({ text, isError }) => !isError && !NOISE.some((noise) => noise.test(text)))
        .map(({ text }) => text)
    ),
  ].slice(-OTHER_LINES_SHOWN);

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
  bun: /^error: No version matching "[^"]*" found for specifier "([^"]+)"/,
};

/**
 * pnpm names its code on the error block's first line and the package in the message: on the same
 * line in pnpm 10 (` ERR_PNPM_NO_MATCHING_VERSION  No matching version found for <name>@^99 ...`),
 * in the box below it in pnpm 12, where the message is wrapped wherever the terminal ended.
 */
const PNPM_NOT_PUBLISHED_CODE = /^(?:Error: )?ERR_PNPM_NO_MATCHING_VERSION(?:\s|$)/;
const PNPM_NOT_PUBLISHED_PACKAGE = /No matching version found for (@?[^@\s]+)@/;

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
  const errorLines = readLines(tool, output)
    .filter(({ isError }) => isError)
    .map(({ text }) => text);

  if (tool === 'pnpm' || tool === 'pnpm@6') {
    return (
      PNPM_NOT_PUBLISHED_CODE.test(errorLines[0] ?? '') &&
      errorLines.some((line) => PNPM_NOT_PUBLISHED_PACKAGE.exec(line)?.[1] === packageName)
    );
  }

  const notPublished = VERSION_NOT_PUBLISHED[tool];
  if (!notPublished) return false;
  return errorLines.some((line) => notPublished.exec(line)?.[1] === packageName);
}
