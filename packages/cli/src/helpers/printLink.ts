import chalk from 'chalk';

function printLink(link: string) {
  return chalk.underline(link);
}

export default printLink;
