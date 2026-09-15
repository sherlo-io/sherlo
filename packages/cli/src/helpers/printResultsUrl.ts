import machineIsReading from './machineIsReading';
import { emit } from './transcriptSink';

/**
 * The closer of a run that reached a build: the human link, and - for a machine - the
 * machine-readable `url=` line a CI can republish above it.
 *
 * WHO IS READING IS ASKED HERE, not inside the renderer: ambient reaches the render layer as a
 * declared input on the segment (see ./machineIsReading, and render/segments' `results-url`).
 *
 * The staged road prints its own differently-worded closer and publishes the same
 * `url` key itself - see commands/test/stagedRun.ts.
 */
function printResultsUrl(url: string): void {
  emit({ kind: 'results-url', url, machineIsReading: machineIsReading() });
}

export default printResultsUrl;
