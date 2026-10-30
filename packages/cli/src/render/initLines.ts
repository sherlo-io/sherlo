/**
 * THE SHAPES EVERY `sherlo init` SECTION IS BUILT FROM: its underlined title, a bold subtitle,
 * and a check line with its coloured icon.
 *
 * Pure, like everything under ./: state in, print-call arguments out. Every init renderer returns
 * a list of lines, one per `console.log` the command makes, and an empty string is a blank line -
 * blank lines are content, so they live here with the words. The sections themselves are the
 * `./init*.ts` files beside this one.
 */
import chalk from 'chalk';

/**
 * A section title, underlined, with two blank lines above it and one below.
 *
 * `underlineLength` overrides the underline's length for a title whose `length` miscounts what a
 * terminal draws (an emoji JavaScript counts as one character, a terminal draws two columns wide).
 */
export function renderSectionTitle(title: string, underlineLength?: number): string[] {
  return ['', '', chalk.bold(title), chalk.dim('═'.repeat(underlineLength ?? title.length)), ''];
}

/** A bold subtitle, with two blank lines above it and one below. */
export function renderSubtitle(title: string): string[] {
  return ['', '', chalk.bold(title), ''];
}

export type CheckLineType = 'success' | 'fail';

/** One line of a section's outcome: a green tick, or a red cross, then what it is about. */
export function renderCheckLine({
  type,
  message,
}: {
  type: CheckLineType;
  message: string;
}): string {
  const { color, icon } = CHECK_LINE_LOOK[type];

  return `${chalk[color](icon)} ${message}`;
}

/**
 * One line of code, coloured the way an editor colours it, so little of it stays white: keywords
 * cyan, strings green, true, false and numbers magenta, object keys blue, called functions green,
 * components and other capitalised names yellow, comments dim; brackets and the rest in the
 * terminal's own colour. A command to run is not code: it stays plain cyan.
 */
export function renderCode(line: string): string {
  return line.replace(
    CODE_TOKEN,
    (
      token,
      comment?: string,
      text?: string,
      keyword?: string,
      literal?: string,
      key?: string,
      call?: string
    ) => {
      if (comment !== undefined) return chalk.dim(token);
      if (text !== undefined) return chalk.green(token);
      if (keyword !== undefined) return chalk.cyan(token);
      if (literal !== undefined) return chalk.magenta(token);
      if (key !== undefined) return chalk.blue(token);
      if (call !== undefined) return chalk.green(token);
      return chalk.yellow(token);
    }
  );
}

/* ========================================================================== */

/**
 * In order: a comment, a string, a keyword, true/false/null or a number, an object key, a called
 * function's name, a capitalised name.
 */
const CODE_TOKEN =
  /(\/\/.*$)|('[^']*')|\b(import|from|export|default|const|if|return|as|function)\b|\b(true|false|null|\d+)\b|\b([A-Za-z_]\w*)(?=\s*:)|\b([A-Za-z_]\w*)(?=\()|\b[A-Z]\w*/g;

const CHECK_LINE_LOOK = {
  success: { color: 'green', icon: '✔' },
  fail: { color: 'red', icon: '✖' },
} as const;
