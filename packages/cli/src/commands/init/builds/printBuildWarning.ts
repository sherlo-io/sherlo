import chalk from 'chalk';
import { wrapInBox } from '../../../helpers';

function printBuildWarning(): void {
  console.log(
    wrapInBox({
      type: 'warning',
      title: 'Before building',
      text: `Make sure you have provided ${chalk.bold('Storybook Access')}`,
    })
  );

  console.log();
}

export default printBuildWarning;
