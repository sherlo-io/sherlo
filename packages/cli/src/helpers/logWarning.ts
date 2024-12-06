import chalk from 'chalk';
import { getLogLink } from './shared';

function logWarning({ learnMoreLink, message }: { message: string; learnMoreLink?: string }): void {
  const warningMessage = chalk.yellow(`WARNING: ${message}`);

  const warningLines = [warningMessage];

  if (learnMoreLink) {
    warningLines.push(`↳ Learn more: ${getLogLink(learnMoreLink)}`);
  }

  console.log(warningLines.join('\n') + '\n');
}

export default logWarning;
