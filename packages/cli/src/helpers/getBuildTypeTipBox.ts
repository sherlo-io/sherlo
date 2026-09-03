import chalk from 'chalk';
import { DOCS_LINK, TEST_COMMAND } from '../constants';
import { Command } from '../types';
import printLink from './printLink';
import wrapInBox from './wrapInBox';

function getBuildTypeTipBox(command: Command): string | undefined {
  if (command === TEST_COMMAND) {
    return wrapInBox({
      title: 'Preview Simulator Build',
      text: `Standard testing requires a ${chalk.bold(
        'preview simulator build'
      )} (with JS bundle)\n\nHow to build: ${printLink(DOCS_LINK.buildPreview)}`,
      type: 'default',
    });
  }
  return undefined;
}

export default getBuildTypeTipBox;
