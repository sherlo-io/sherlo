import chalk from 'chalk';

function getStandaloneStorybookCode(): string {
  return [
    [
      COLORS.KEYWORD('import'),
      'Storybook',
      COLORS.KEYWORD('from'),
      `${COLORS.COMPONENT('"./.rnstorybook"')};`,
    ].join(' '),
    '',
    [COLORS.KEYWORD('export default function'), `${COLORS.FUNCTION('App')}() {`].join(' '),
    [' ', COLORS.KEYWORD('return'), `<${COLORS.COMPONENT('Storybook')} />;`].join(' '),
    '}',
  ].join('\n');
}

export default getStandaloneStorybookCode;

/* ========================================================================== */

const COLORS = {
  KEYWORD: chalk.cyan,
  COMPONENT: chalk.magenta,
  COMMENT: chalk.dim,
  FUNCTION: chalk.green,
} as const;
