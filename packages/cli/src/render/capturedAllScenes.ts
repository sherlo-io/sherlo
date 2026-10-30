/**
 * WHAT `sherlo capture --all-scenes <folder>` PRINTS.
 *
 * Pure, like everything under ./: state in, lines out. One progress line per scene, printed as the
 * scene finishes, then one closing summary. The picture and the record of every scene go to the
 * folder, never to the screen: the screen says only how each scene ended and where to look.
 */
import chalk from 'chalk';
import { seconds } from './capturedStory';

/** How a scene ended, in the four words the summary counts by. */
export type SceneOutcome = 'captured' | 'never-settled' | 'never-reached' | 'failed';

/** The outcome an app's answer counts as: a scene came up and held still, came up and kept moving, never came up, or failed. */
export function outcomeOf(kind: string): SceneOutcome {
  if (kind === 'scene') return 'captured';
  if (kind === 'never-settled') return 'never-settled';
  if (kind === 'never-reached') return 'never-reached';
  return 'failed';
}

/** One scene's progress line: what the scene's own record says, nothing about the machine. */
export type SceneRunLine = {
  sceneId: string;
  /** The app's answer kind (`scene`, `never-settled`, `never-reached`, `crashed-at-boot`, ...). */
  ending: string;
  /** How long the ready view took to show, from the fresh boot; absent when it never did. */
  readyMs?: number;
  /** The views still changing, for a scene that never settled. */
  changing?: string[];
  /** The ready view a scene never showed, for a scene that never got ready. */
  ready?: string;
  /** How many requests no mock answered, each named in the scene's record. */
  refused: number;
  /** How long the fresh boot took, for a scene that came up. */
  launchMs?: number;
  /** How long the stabilization took to settle, for a scene that held still. */
  settledMs?: number;
  /**
   * This scene failed for the cause the one before it did: the scenes still to run may fail the same
   * way. Said once per run, with the fake that answers the cause when there is one.
   */
  sameCause?: { remaining: number; cause: string; fake?: string };
};

/** The count of each outcome over a run, and where the pictures and records went. */
export type AllScenesSummary = {
  folder: string;
  captured: number;
  neverSettled: number;
  neverReached: number;
  failed: number;
};

/** Coloured when called, not when loaded: the terminal's colour level is decided after the modules load. */
function markOf(outcome: SceneOutcome): string {
  if (outcome === 'captured') return chalk.green('✔');
  if (outcome === 'never-settled') return chalk.yellow('◦');
  return chalk.red('✖');
}

/** The line one scene prints as it finishes. */
export function renderSceneRunLine(line: SceneRunLine): string[] {
  const outcome = outcomeOf(line.ending);
  const words: Record<SceneOutcome, string> = {
    captured: 'captured',
    'never-settled': `never settled${line.changing?.length ? ` - still changing: ${line.changing.join(', ')}` : ''}`,
    'never-reached': `never reached${line.ready ? ` - no view ${line.ready} showed` : ''}`,
    failed: `failed (${line.ending})`,
  };
  const launch = line.launchMs === undefined ? '' : ` · launched in ${seconds(line.launchMs)}`;
  const ready = line.readyMs === undefined ? '' : ` · ready in ${seconds(line.readyMs)}`;
  const settled = line.settledMs === undefined ? '' : ` · settled in ${seconds(line.settledMs)}`;
  const refused = line.refused > 0 ? ` · ${line.refused} refused` : '';
  const { sameCause } = line;
  return [
    `${markOf(outcome)}  ${chalk.bold(line.sceneId)} ${words[outcome]}${chalk.dim(`${launch}${ready}${settled}${refused}`)}`,
    ...(sameCause
      ? [
          `${chalk.yellow('◦')}  ${sameCause.remaining} more ${sameCause.remaining === 1 ? 'scene' : 'scenes'} may fail the same way: ${sameCause.cause}`,
          ...(sameCause.fake ? [`     ${sameCause.fake}`] : []),
          chalk.dim('   Paste it once where the scenes share their mocks, then capture again.'),
        ]
      : []),
  ];
}

/** The closing lines: how many scenes ended each way, and where the pictures and records are. */
export function renderAllScenesSummary(summary: AllScenesSummary): string[] {
  const { captured, neverSettled, neverReached, failed, folder } = summary;
  const total = captured + neverSettled + neverReached + failed;
  return [
    '',
    `${total} ${total === 1 ? 'scene' : 'scenes'}: ${captured} captured, ${neverSettled} never settled, ${neverReached} never reached, ${failed} failed`,
    chalk.dim(
      `   a picture (<id>.png, not for a scene that never came up) and a record (<id>.json) of each are in ${folder}`
    ),
    '',
  ];
}
