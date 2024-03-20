import chalk from 'chalk';

type ErrorType = 'auth' | 'config' | 'default' | 'unexpected';

const typeLabel: { [type in ErrorType]: string } = {
  default: 'Error',
  auth: 'Auth Error',
  config: 'Config Error',
  unexpected: 'Unexpected Error',
};

function getErrorMessage({
  learnMoreLink,
  message,
  type = 'default',
}: {
  message: string;
  learnMoreLink?: string;
  type?: ErrorType;
}): string {
  return `${chalk.red(`${typeLabel[type]}: ${message}`)}
${learnMoreLink ? `↳ Learn more at ${learnMoreLink}\n` : ''}`;
}

export default getErrorMessage;
