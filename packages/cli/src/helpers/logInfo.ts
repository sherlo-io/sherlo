import chalk from 'chalk';
import printLink from './printLink';

function logInfo({ learnMoreLink, message }: { message: string; learnMoreLink?: string }): void {
  const infoMessage = chalk.blue(`INFO: ${message}`);

  const lines = [infoMessage];

  if (learnMoreLink) {
    lines.push(chalk.dim(`↳ Learn more: ${printLink(learnMoreLink)}`));
  }

  console.log(lines.join('\n'));
}

export default logInfo;
