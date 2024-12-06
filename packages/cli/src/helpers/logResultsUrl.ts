import { getLogLink } from './shared';

function logResultsUrl(url: string): void {
  console.log(`🔗 ${getLogLink(url)}\n`);
}

export default logResultsUrl;
