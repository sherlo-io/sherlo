/**
 * WHAT `sherlo capture-report` PRINTS WHILE IT SERVES THE REVIEW PAGE.
 *
 * The address comes first, because it is what the person opens when the browser did not come up;
 * the counts are the page's own summary, said once at the start. The page keeps updating after
 * that, so the screen does not.
 */
import chalk from 'chalk';

/** The counts the page's summary shows. */
export type ReportCounts = { captured: number; notCaptured: number; changed: number };

/** The address of the page, what is in it, and how to stop. */
export function renderCaptureReport(address: string, counts: ReportCounts): string[] {
  const total = counts.captured + counts.notCaptured;
  const what =
    total === 0
      ? chalk.yellow('Nothing is captured yet - run `npx sherlo capture` and it appears here.')
      : `${counts.captured} captured, ${counts.notCaptured} not captured, ${counts.changed} changed`;

  return [`Your captures: ${chalk.cyan(address)}`, what, chalk.dim('Press Ctrl+C to stop.'), ''];
}

/** The line `sherlo capture-report` prints when the browser did not come up; the address is above it. */
export function renderReportBrowserNotOpened(): string[] {
  return [chalk.yellow('The browser did not open - open the address above yourself.'), ''];
}

/** The refusal when this CLI was built without the review page. */
export function renderReportPageMissing(): string {
  return (
    'This install of Sherlo has no review page, so `npx sherlo capture-report` cannot show your captures.\n' +
    '\n' +
    '  `npx sherlo capture-report --json` prints the same facts as plain data.'
  );
}
