import chalk from 'chalk';

/**
 * Prints a title with an underline.
 * @param title The title to print
 * @param length Optional parameter to override the underline length calculation.
 * Sometimes the title.length calculation doesn't work correctly, so this allows manual adjustment.
 */
async function printTitle(title: string, length?: number) {
  console.log();
  console.log();

  console.log(chalk.bold(title));
  console.log(chalk.dim('═'.repeat(length ?? title.length)));

  console.log();
}

export default printTitle;
