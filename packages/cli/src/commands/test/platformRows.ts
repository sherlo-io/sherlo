/**
 * WHAT BECAME OF EACH PLATFORM'S APP BUILD IN THIS RUN, kept until the test's row: every platform
 * has a row above it (../../render/runRows), and the platforms finish in different places - built or
 * taken from the local build cache in ./appBuild/buildApps, reused in ./appBuild/buildThenPush or on
 * the staged road, arrived from the other job in ./appBuild/joinTheRun, on EAS in ./appBuild/easRun
 * and the EAS hook.
 *
 * A terminal draws the rows together above the test's row, Android first. A log cannot redraw, so
 * each row prints the moment it is known (../shared/terminal decides which), and the test's row only
 * owes the blank line under them.
 *
 * PLAN-LAYER PROTOTYPE (epic sherlo-test-builds-apps, drawn live with the operator 2026-10-13): one
 * process-wide list, emptied when `sherlo test` starts and taken by the test's row. The build task
 * decides whether the rows travel as a value instead.
 */
import type { Platform } from '@sherlo/api-types';
import { emit } from '../../helpers/transcriptSink';
import type { PlatformRow, RowsAbove } from '../../render/runRows';
import { printsToATerminal } from '../shared/terminal';

const rowOfPlatform = new Map<Platform, PlatformRow>();

/** Forgets every row, so a run starts with none. */
export function forgetPlatformRows(): void {
  rowOfPlatform.clear();
}

/** Says what became of one platform's app build: kept for the test's row, and printed now in a log. */
export function recordPlatformRow(row: PlatformRow): void {
  rowOfPlatform.set(row.platform, row);
  if (!printsToATerminal()) emit({ kind: 'platform-row', row });
}

/** Every platform's row said so far, for the row that stands under them - and forgets them. */
export function takeRowsAbove(): RowsAbove {
  const rows = [...rowOfPlatform.values()];
  rowOfPlatform.clear();
  return { rows, printedAsTheyHappened: !printsToATerminal() };
}
