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

/* ========================================================================== */

const CHECK_LINE_LOOK = {
  success: { color: 'green', icon: '✔' },
  fail: { color: 'red', icon: '✖' },
} as const;
