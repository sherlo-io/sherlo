import chalk from 'chalk';
import printLink from './printLink';

function logWarning({ learnMoreLink, message }: { message: string; learnMoreLink?: string }): void {
  const warningMessage = chalk.yellow(`WARNING: ${message}`);

  const lines = [warningMessage];

  if (learnMoreLink) {
    lines.push(chalk.dim(`↳ Learn more: ${printLink(learnMoreLink)}`));
  }

  console.log(lines.join('\n'));
}

export default logWarning;
