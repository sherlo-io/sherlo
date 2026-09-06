import { emit } from './transcriptSink';

/**
 * The closer of a run that reached a build: the machine-readable `url=` line a
 * CI can republish, then the human link.
 *
 * The staged road prints its own differently-worded closer and publishes the same
 * `url` key itself - see commands/test/stagedRun.ts.
 */
function printResultsUrl(url: string): void {
  emit({ kind: 'results-url', url });
}

export default printResultsUrl;
