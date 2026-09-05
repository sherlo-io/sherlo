import { CommandParams } from '../../types';
import { emit } from '../transcriptSink';

/**
 * Announce which test this push is and what it will run on.
 *
 * The line's bytes live in the render layer (../../render/pushSpine), and so
 * does the device counting: which platforms appear, in which order, and whether
 * the noun is singular are all decisions about what the line looks like.
 */
function printBuildIntroMessage({
  commandParams,
  nextBuildIndex,
}: {
  commandParams: CommandParams;
  nextBuildIndex: number;
}) {
  emit({ kind: 'run-header', nextBuildIndex, devices: commandParams.devices });
}

export default printBuildIntroMessage;
