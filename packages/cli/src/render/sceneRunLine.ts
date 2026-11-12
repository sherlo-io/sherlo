/**
 * THE LINE ONE SCENE PRINTS as it finishes in a run of every scene (./capturedAllScenes). Pure,
 * like everything under ./: state in, lines out.
 */
import chalk from 'chalk';
import type { UnansweredRequest } from '../seams/readAppAnswer';
import { seconds } from './capturedStory';
import { outcomeOf, type SceneOutcome } from './sceneOutcome';
import { neverSettledLines } from './sceneLeftLines';

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
  /** The refused requests themselves, listed as rules under a scene that never settled. */
  refusedRequests?: UnansweredRequest[];
  /** How long the fresh boot took, for a scene that came up. */
  launchMs?: number;
  /** How long the stabilization took to settle, for a scene that held still. */
  settledMs?: number;
  /**
   * This scene failed for the cause the one before it did: the scenes still to run may fail the same
   * way. Said once per run, with the fake that answers the cause when there is one; `stopped` says
   * the run stopped there (`--stop-on-repeat`) and the scenes still to run were not run.
   */
  sameCause?: { remaining: number; cause: string; fake?: string; stopped?: true };
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
    ...(outcome === 'never-settled'
      ? [...neverSettledLines(line.refusedRequests, line.changing), '']
      : []),
    ...(sameCause
      ? [
          `${chalk.yellow('◦')}  ${sameCause.remaining} more ${sameCause.remaining === 1 ? 'scene' : 'scenes'} ${sameCause.stopped ? 'not run, same cause' : 'may fail the same way'}: ${sameCause.cause}`,
          // The fake is what the hint tells to paste: a cause with none has nothing to paste.
          ...(sameCause.fake
            ? [
                `     ${sameCause.fake}`,
                chalk.dim(
                  '   Paste it once where the scenes share their mocks, then capture again.'
                ),
              ]
            : []),
        ]
      : []),
  ];
}
