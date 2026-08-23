import printLink from './printLink';
import printOutputKeys from './printOutputKeys';

/**
 * The closer of a run that reached a build: the machine-readable `url=` line a
 * CI can republish (see ./printOutputKeys), then the human link.
 *
 * The staged road prints its own differently-worded closer and publishes the same
 * `url` key itself - see commands/test/stagedRun.ts.
 */
function printResultsUrl(url: string): void {
  printOutputKeys({ url });

  console.log(`🔗 ${printLink(url)}\n`);
}

export default printResultsUrl;
