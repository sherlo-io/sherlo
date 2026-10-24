/**
 * WHAT `sherlo open --scene` PRINTS.
 *
 * Pure, like everything under ./. The scene is booted fresh, as `capture --scene` boots it, and
 * then stays on screen for development. The refusals are the story screens' own words
 * (./openedStory), and the unknown-scene refusal is the one `capture --scene` prints (./capturedScene).
 */
import chalk from 'chalk';
import { noSuchSceneLines, renderCapturedScene, route } from './capturedScene';
import type { SceneEnding } from './capturedScene';
import { renderOpenedStory } from './openedStory';

/** How a run of `sherlo open --scene` ended, as the screen needs it. */
export type OpenedScene =
  | { kind: 'no-bundler'; port: number }
  | { kind: 'no-app'; port: number }
  | { kind: 'no-such-scene'; sceneId: string; known: string[] }
  | { kind: 'opened-scene'; sceneId: string; route: string[] }
  /** The scene did not come up: the app booted, and the ending is the one a capture prints. */
  | Exclude<SceneEnding, { kind: 'no-such-scene' | 'scene' }>;

/** Every line `sherlo open --scene` prints, in order. */
export function renderOpenedScene(state: OpenedScene): string[] {
  switch (state.kind) {
    case 'no-bundler':
    case 'no-app':
      return renderOpenedStory(state);

    case 'no-such-scene':
      return noSuchSceneLines(state.sceneId, state.known);

    case 'opened-scene':
      return [
        `${chalk.green('✔')}  ${chalk.bold(state.sceneId)} is on screen, booted fresh at ${route(
          state.route
        )}`,
        '',
        chalk.dim(
          'Edits to the screen reload in place. Edits to a mock or a scene need `npx sherlo open --scene ' +
            `${state.sceneId}\` again.`
        ),
        '',
      ];

    default:
      return renderCapturedScene(state);
  }
}
