import chalk from 'chalk';
import getLogLink from './getLogLink';

function logInfoMessage({
  learnMoreLink,
  message,
  startWithNewLine,
}: {
  message: string;
  learnMoreLink?: string;
  startWithNewLine?: boolean;
}): void {
  const formattedMessage = chalk.blue(`Info: ${message}`);
  const learnMoreSection = learnMoreLink ? `↳ Learn more: ${getLogLink(learnMoreLink)}` : null;

  const content = [formattedMessage, learnMoreSection].filter((v) => v !== null).join('\n');

  const prefix = startWithNewLine ? '\n' : '';

  console.log(`${prefix}${content}\n`);
}

export default logInfoMessage;
