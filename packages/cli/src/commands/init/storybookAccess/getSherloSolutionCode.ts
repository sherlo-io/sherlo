import chalk from 'chalk';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../constants';

function getSherloSolutionCode(): string {
  return [
    [
      COLORS.KEYWORD('import'),
      '{ addStorybookToDevMenu, isStorybookMode }',
      COLORS.KEYWORD('from'),
      `${COLORS.COMPONENT(`"${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}"`)};`,
    ].join(' '),
    [
      COLORS.KEYWORD('import'),
      'Storybook',
      COLORS.KEYWORD('from'),
      `${COLORS.COMPONENT('"./.rnstorybook"')};`,
    ].join(' '),
    [
      COLORS.KEYWORD('import'),
      'App',
      COLORS.KEYWORD('from'),
      `${COLORS.COMPONENT('"./App"')};`,
    ].join(' '),
    '',
    `${COLORS.FUNCTION('addStorybookToDevMenu')}();`,
    '',
    [COLORS.KEYWORD('export default function'), `${COLORS.FUNCTION('Root')}() {`].join(' '),
    [' ', COLORS.KEYWORD('if'), '(isStorybookMode) {'].join(' '),
    [' ', ' ', COLORS.KEYWORD('return'), `<${COLORS.COMPONENT('Storybook')} />;`].join(' '),
    [' ', '}'].join(' '),
    '',
    [' ', COLORS.KEYWORD('return'), `<${COLORS.COMPONENT('App')} />;`].join(' '),
    '}',
  ].join('\n');
}

export default getSherloSolutionCode;

/* ========================================================================== */

const COLORS = {
  KEYWORD: chalk.cyan,
  COMPONENT: chalk.magenta,
  COMMENT: chalk.dim,
  FUNCTION: chalk.green,
} as const;
