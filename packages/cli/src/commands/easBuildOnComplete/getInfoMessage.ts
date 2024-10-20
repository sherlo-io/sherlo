import chalk from 'chalk';
import { getLogLink } from '../../helpers';

function getInfoMessage({
  learnMoreLink,
  message,
}: {
  message: string;
  learnMoreLink?: string;
}): string {
  return (
    [
      chalk.blue(`Info: ${message}`),
      learnMoreLink ? `↳ Learn more: ${getLogLink(learnMoreLink)}` : null,
    ]
      .filter((v) => v !== null)
      .join('\n') + '\n'
  );
}

export default getInfoMessage;
