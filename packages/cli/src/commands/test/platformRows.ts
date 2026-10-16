/**
 * WHAT BECAME OF EACH PLATFORM'S APP BUILD IN THIS RUN - one row per platform, above the test's row
 * (../../render/runRows).
 *
 * The rows travel as a value: each road that ends a test makes its platforms' rows and hands them
 * to the segment that prints the test's row - started, opened, added, finished with nothing to
 * test, or stopped on a failed build. `sherlo view N --wait` has none, and prints only the test's
 * row.
 *
 * A terminal draws the rows together above the test's row, Android first. A log cannot redraw, so
 * each row prints the moment it is known, and the test's row only owes the blank line under them
 * (../shared/terminal decides which).
 */
import { emit } from '../../helpers/transcriptSink';
import type { PlatformRow, RowsAbove } from '../../render/runRows';
import { printsToATerminal } from '../shared/terminal';

/**
 * Print one platform's row now when the output is a log - a terminal prints nothing yet - and hand
 * it back for the test's row to stand under.
 */
export function printPlatformRowInALog(row: PlatformRow): PlatformRow {
  if (!printsToATerminal()) emit({ kind: 'platform-row', row });
  return row;
}

/** The platforms' rows a test's row stands under. */
export function rowsAbove(platformRows: PlatformRow[]): RowsAbove {
  return { rows: platformRows, printedAsTheyHappened: !printsToATerminal() };
}
