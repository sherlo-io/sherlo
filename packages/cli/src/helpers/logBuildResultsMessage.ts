import chalk from 'chalk';
import getLogLink from './getLogLink';

function logBuildResultsMessage(url: string): void {
  console.log(`${chalk.gray('Results:')} ${getLogLink(url)}\n`);
}

export default logBuildResultsMessage;
