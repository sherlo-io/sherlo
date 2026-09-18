/**
 * `sherlo inspect` - name the story the running app is showing now.
 *
 * The read-side sibling of `../open/open`, down the same road and with the same two refusals. One
 * line on success, and the line is the story id on its own: the caller is usually an agent between
 * two edits, and a story id is the whole answer to what am I looking at.
 *
 * NOT A DESCRIPTION OF THE SCREEN, deliberately. What is drawn can only be got by drawing it, so
 * nobody could write down in advance what such a screen should say - and the plan of an epic has to
 * be written before anything runs.
 */
import { PORT_OPTION, DEFAULT_BUNDLER_PORT } from '../../constants';
import { throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { EXIT_BLOCK } from '../../helpers/exitCodes';
import { letterbox } from '../../seams/letterbox';
import type { InspectedStory } from '../../render/openedStory';

export type InspectOptions = {
  [PORT_OPTION]?: string;
};

async function inspect(passedOptions: InspectOptions): Promise<void> {
  const port = readPort(passedOptions[PORT_OPTION]);
  const answer = await letterbox().showing();

  const state: InspectedStory =
    answer.kind === 'showing'
      ? { kind: 'showing', storyId: answer.storyId }
      : { kind: answer.kind, port };

  emit({ kind: 'inspected-story', state });

  if (state.kind !== 'showing') process.exit(EXIT_BLOCK);
}

export default inspect;

/* ========================================================================== */

function readPort(passed: string | undefined): number {
  if (passed === undefined) return DEFAULT_BUNDLER_PORT;

  const port = Number(passed);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throwError({ message: `\`--${PORT_OPTION}\` takes a port number, and \`${passed}\` is not one.` });
  }

  return port;
}
