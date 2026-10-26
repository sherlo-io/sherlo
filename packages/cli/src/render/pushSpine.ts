/**
 * THE PUSH SPINE'S LITERALS - the bytes of the transcript `sherlo test --android/--ios`
 * prints, and the one every other family's preamble is a subset of.
 *
 * Pure, like everything under ./: state in, print-call argument lists out. It is
 * split out of ./renderSegment only because the spine is the largest family in
 * the CLI and a single 400-line switch would stop being readable; renderSegment
 * still owns the dispatch, so there is exactly one entry point.
 *
 * WHAT IS DELIBERATE HERE AND MUST NOT BE TIDIED:
 *
 *   - A LEADING `\n` INSIDE A CHALK CALL IS NOT THE SAME BYTES AS A BLANK LINE.
 *     `chalk.cyan('\n📦 ...')` closes and reopens the style around the newline,
 *     so the preceding blank line is emitted as a STYLED empty line. Committed
 *     fixtures carry those bytes. Hoisting the `\n` out changes them and changes
 *     nothing a human sees - which is why it looks like a cleanup and is not one.
 *   - A TRAILING `\n` INSIDE A STRING IS CONTENT. `console.log('x\n')` prints two
 *     lines; the second is blank and a fixture compares it byte-for-byte.
 *   - TWO SPACES AFTER AN ICON align the text with the section titles above it.
 */
import chalk from 'chalk';
import { projectPageUrl, type SherloProject } from './testSteps';

/**
 * A warning or a note on a test's road, in init's marks: `! <warning>` in yellow, a note as it
 * is, and the link under either. `renderNotice` below keeps its `WARNING:` / `INFO:` look for the
 * init sections that call it.
 */
export function renderTestNotice({
  level,
  message,
  learnMoreLink,
}: {
  level: 'warning' | 'info';
  message: string;
  learnMoreLink?: string;
}): string[] {
  return [
    level === 'warning' ? chalk.yellow(`! ${message}`) : message,
    ...(learnMoreLink ? [chalk.dim(`  Learn more: ${chalk.cyan(learnMoreLink)}`)] : []),
  ];
}

/** `WARNING: ...` / `INFO: ...`, with an optional `↳ Learn more:` line under it. */
export function renderNotice({
  level,
  message,
  learnMoreLink,
}: {
  level: 'warning' | 'info';
  message: string;
  learnMoreLink?: string;
}): string {
  const head =
    level === 'warning' ? chalk.yellow(`WARNING: ${message}`) : chalk.blue(`INFO: ${message}`);

  const lines = [head];

  if (learnMoreLink) {
    lines.push(chalk.dim(`↳ Learn more: ${formatLink(learnMoreLink)}`));
  }

  return lines.join('\n');
}

/**
 * The tool deepened a shallow clone itself (git fetch --no-tags --deepen=200) and git refused:
 * what happened (git's own reason), what it means, what to do - on any CI.
 */
export function renderHistoryFetchRefused(reason: string): string[] {
  return [
    chalk.yellow(`! Couldn't fetch the git history: ${reason}`),
    chalk.yellow(
      "  The build goes on and is still checked against main's approved pictures; only screens that differ wait for review."
    ),
    chalk.yellow(
      "  Keep your CI checkout's credentials, or fetch the full history in the checkout."
    ),
  ];
}

/** No main branch from the settings, the clone or the git host: every build is a main build. */
export function renderBranchingOff(project: SherloProject): string[] {
  return [
    chalk.yellow('! Branching is off: this project has no main branch.'),
    chalk.yellow('  Every build is treated as a main build, so each one captures every story.'),
    chalk.yellow(`  Set the main branch in the project's settings: ${projectPageUrl(project)}`),
  ];
}

/** A link, underlined. Named for what it does - it has never printed anything. */
export function formatLink(link: string): string {
  return chalk.underline(link);
}

/**
 * The machine-readable `key=value` answer lines.
 *
 * A key with no value is NOT printed: an absent answer must read as absent,
 * never as an empty one. Values are newline-stripped so a multi-line reason can
 * never break the line format a parser depends on.
 */
export function renderOutputKeys(
  entries: Record<string, string | number | boolean | undefined>
): string[] {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === '') continue;

    lines.push(`${key}=${String(value).replace(/\r?\n/g, ' ')}`);
  }

  return lines;
}
