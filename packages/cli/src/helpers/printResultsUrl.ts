import printLink from './printLink';

function printResultsUrl(url: string): void {
  console.log(`🔗 ${printLink(url)}\n`);
}

export default printResultsUrl;
