import chalk from 'chalk';

function getLogLink(link: string) {
  return chalk.underline(link);
}

export default getLogLink;
