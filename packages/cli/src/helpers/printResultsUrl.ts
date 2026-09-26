import { emit } from './transcriptSink';

/**
 * The closer of a run that reached a build: the human link, once, on the line with the emoji.
 *
 * There is no machine line beside it (operator ruling 2026-09-15): a CI that wants the address
 * reads it off this line, the way actions/lib/cliOutputs.mjs does. The staged road prints its own
 * differently-worded closer - see commands/test/stagedRun.ts.
 */
function printResultsUrl(url: string): void {
  emit({ kind: 'results-url', url });
}

export default printResultsUrl;
