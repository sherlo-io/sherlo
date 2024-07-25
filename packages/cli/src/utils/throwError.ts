import chalk from 'chalk';
import getLogLink from './getLogLink';

type ErrorType = 'auth' | 'config' | 'default' | 'unexpected';

const typeLabel: { [type in ErrorType]: string } = {
  default: 'Error',
  auth: 'Auth Error',
  config: 'Config Error',
  unexpected: 'Unexpected Error',
};

function throwError({
  learnMoreLink,
  message,
  type = 'default',
}: {
  message: string;
  learnMoreLink?: string;
  type?: ErrorType;
}): never {
  throw new Error(
    [
      chalk.red(`${typeLabel[type]}: ${message}`),
      learnMoreLink ? `↳ Learn more: ${getLogLink(learnMoreLink)}` : null,
    ]
      .filter((v) => v !== null)
      .join('\n') + '\n'
  );
}

export default throwError;
