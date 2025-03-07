import chalk from 'chalk';

function printSubtitle(title: string, hasTopMargin = true) {
  if (hasTopMargin) {
    console.log();
    console.log();
  }

  console.log(chalk.bold(title));

  console.log();
}

export default printSubtitle;
