/**
 * WHAT `sherlo open --scene` PRINTS.
 *
 * Pure, like everything under ./. The scene is booted fresh, as `capture --scene` boots it, and
 * then stays on screen for development. The refusals are the story screens' own words
 * (./openedStory), and the nearest-id list is the one `capture --scene` offers (./capturedScene).
 */
import chalk from 'chalk';
import { closestScenes, route } from './capturedScene';
import { renderOpenedStory } from './openedStory';

/** How a run of `sherlo open --scene` ended, as the screen needs it. */
export type OpenedScene =
  | { kind: 'no-bundler'; port: number }
  | { kind: 'no-app'; port: number }
  | { kind: 'no-such-scene'; sceneId: string; known: string[] }
  | { kind: 'opened-scene'; sceneId: string; route: string[] };

/** Every line `sherlo open --scene` prints, in order. */
export function renderOpenedScene(state: OpenedScene): string[] {
  switch (state.kind) {
    case 'no-bundler':
    case 'no-app':
      return renderOpenedStory(state);

    case 'no-such-scene':
      return [
        `${chalk.red('✖')}  No scene ${chalk.bold(state.sceneId)} in this app`,
        '',
        ...closestScenes(state.sceneId, state.known),
        '',
      ];

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
  }
}
