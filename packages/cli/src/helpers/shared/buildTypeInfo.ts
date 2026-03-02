import chalk from 'chalk';
import { DOCS_LINK, TEST_EAS_UPDATE_COMMAND, TEST_STANDARD_COMMAND } from '../../constants';
import { Command } from '../../types';
import printLink from '../printLink';
import wrapInBox from '../wrapInBox';

export function getBuildTypeLabel(command: Command): string {
  if (command === TEST_STANDARD_COMMAND) {
    return 'preview simulator';
  }
  if (command === TEST_EAS_UPDATE_COMMAND) {
    return 'development simulator';
  }
  return '';
}

export function getBuildTypeDocsLink(command: Command): string | undefined {
  if (command === TEST_STANDARD_COMMAND) {
    return DOCS_LINK.buildPreview;
  }
  if (command === TEST_EAS_UPDATE_COMMAND) {
    return DOCS_LINK.buildDevelopment;
  }
  return undefined;
}

export function getBuildTypeTipBox(command: Command): string | undefined {
  if (command === TEST_STANDARD_COMMAND) {
    return wrapInBox({
      title: 'Preview Simulator Build',
      text: `Standard testing requires a ${chalk.bold('preview simulator build')} (with JS bundle)\n\nHow to build: ${printLink(DOCS_LINK.buildPreview)}`,
      type: 'default',
    });
  }
  if (command === TEST_EAS_UPDATE_COMMAND) {
    return wrapInBox({
      title: 'Development Simulator Build',
      text: `EAS Update testing requires a ${chalk.bold('development simulator build')} (without JS bundle)\n\nHow to build: ${printLink(DOCS_LINK.buildDevelopment)}`,
      type: 'default',
    });
  }
  return undefined;
}
