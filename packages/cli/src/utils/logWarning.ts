import chalk from 'chalk';
import getLogLink from './getLogLink';

type WarningType = 'config' | 'default';

const typeLabel: { [type in WarningType]: string } = {
  default: 'Warning',
  config: 'Config Warning',
};

function logWarning({
  learnMoreLink,
  message,
  type = 'default',
}: {
  message: string;
  learnMoreLink?: string;
  type?: WarningType;
}): void {
  console.log(
    [
      chalk.yellow(`${typeLabel[type]}: ${message}`),
      learnMoreLink ? `↳ Learn more: ${getLogLink(learnMoreLink)}` : null,
    ]
      .filter((v) => v !== null)
      .join('\n') + '\n'
  );
}

export default logWarning;
