/**
 * THE LINES THAT HELP A SCENE THAT NEVER GOT READY get right fast: what the screen said, why the
 * scene likely stopped, and the next step, with a line to paste where there is one.
 *
 * Pure, like everything under ./: the scene's record in, lines out. The stop the record carries
 * (./sceneStop) is read by its kind, so the ending of the scene (./capturedScene) stays the first
 * line and these follow as evidence, then the next step.
 */
import { blankScreenLines } from './blankScreenLines';
import { endedEarlyLines, NO_LOGGED_IN_USER } from './endedEarlyLines';
import { explainsTheStop } from './explainsTheStop';
import { screenLines } from './screenLines';
import { sinceLastRunLines } from './sinceLastRunLines';
import { threwLines } from './threwLines';
import type { CapturedScene } from './capturedScene';

/** The lines under a scene that never got ready, up to what the scene left behind. */
export function neverReachedLines(
  state: Extract<CapturedScene, { kind: 'never-reached' }>
): string[] {
  const { stop } = state;
  return [
    ...sinceLastRunLines(state.lastRun, {
      ending: 'never-reached',
      route: state.stayedOn,
      refused: state.unanswered?.length ?? 0,
    }),
    ...(stop?.kind === 'covered'
      ? [...screenLines(stop.screen), '', ...endedEarlyLines(stop.early)]
      : []),
    ...(stop?.kind === 'blank' || stop?.kind === 'on-another-screen'
      ? screenLines(stop.screen)
      : []),
    ...threwLines(state.threw, state.crashCause),
    ...(explainsTheStop(state) ? [] : NO_LOGGED_IN_USER),
    ...(stop?.screen?.views === 0 ? blankScreenLines(state.sceneId) : []),
  ];
}
