import chalk from 'chalk';
import { getLogLink } from './shared';

function logInfo({ learnMoreLink, message }: { message: string; learnMoreLink?: string }): void {
  const infoMessage = chalk.blue(`INFO: ${message}`);

  const infoLines = [infoMessage];

  if (learnMoreLink) {
    infoLines.push(`↳ Learn more: ${getLogLink(learnMoreLink)}`);
  }

  console.log(infoLines.join('\n') + '\n');
}

export default logInfo;
