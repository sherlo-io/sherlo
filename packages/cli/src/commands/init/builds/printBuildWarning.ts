import chalk from 'chalk';
import { wrapInBox } from '../helpers';

function printBuildWarning(hasUpdatedStorybookComponent: boolean): void {
  console.log(
    wrapInBox({
      type: 'warning',
      title: 'Before building',
      text: hasUpdatedStorybookComponent
        ? `Make sure you have provided ${chalk.bold('Storybook Access')}`
        : 'Make sure you have:' +
          `\n• updated ${chalk.bold('Storybook Component')}` +
          `\n• provided ${chalk.bold('Storybook Access')}`,
    })
  );

  console.log();
}

export default printBuildWarning;
