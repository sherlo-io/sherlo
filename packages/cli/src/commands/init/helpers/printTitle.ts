import chalk from 'chalk';

async function printTitle(title: string) {
  console.log();
  console.log();

  console.log(chalk.bold(title));
  console.log(chalk.dim('═'.repeat(title.length))); // longer

  console.log();
}

export default printTitle;
