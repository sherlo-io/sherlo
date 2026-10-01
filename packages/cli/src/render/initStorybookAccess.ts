/**
 * WHAT `sherlo init` PRINTS FOR STORYBOOK ACCESS: the two ways to let Sherlo reach Storybook, each
 * with its root component drawn in a box, the reminder under them, and the prompt the setup then
 * waits on.
 *
 * Pure, like everything under ./: state in, print-call arguments out. The boxes wrap to the
 * terminal's width, which the caller reads and hands in.
 */
import chalk from 'chalk';
import { DOCS_LINK, SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../constants';
import { renderBox } from './box';
import { renderSectionTitle, renderSubtitle } from './initLines';
import { renderNotice } from './pushSpine';

/** Everything the section prints before it asks for Enter. */
export function renderStorybookAccess({
  terminalColumns,
}: {
  terminalColumns: number | undefined;
}): string[] {
  return [
    ...renderSectionTitle('🔑 Storybook Access'),
    'To enable Sherlo to access Storybook, choose one:',
    ...renderSubtitle('Option 1: Standalone Storybook'),
    `  Provide a build that ${chalk.underline('opens straight into Storybook')}`,
    '',
    renderBox({
      title: 'Root component',
      text: standaloneRootComponent(),
      indent: 2,
      terminalColumns,
    }),
    ...renderSubtitle('Option 2: Integrated Storybook'),
    `  Update your Root component ${chalk.italic('(could be App.jsx or app/_layout.jsx)')}:`,
    '',
    renderBox({
      title: 'Root component',
      text: integratedRootComponent(),
      indent: 2,
      terminalColumns,
    }),
    '',
    renderNotice({
      level: 'warning',
      message: 'Provide Storybook access by choosing one of the options above',
      learnMoreLink: DOCS_LINK.setupStorybookAccess,
    }),
  ];
}

/**
 * The question the setup waits on, written straight to the terminal with no newline after it, so
 * the answer can erase it: a blank line, then the question in bold.
 */
export function renderEnterPrompt(): string {
  return '\n' + chalk.bold('👉 Ready to move on? Press Enter...');
}

/* ========================================================================== */

/** A root component that is Storybook and nothing else. */
function standaloneRootComponent(): string {
  return [
    [keyword('import'), 'Storybook', keyword('from'), `${component('"./.rnstorybook"')};`].join(
      ' '
    ),
    '',
    [keyword('export default function'), `${functionName('App')}() {`].join(' '),
    [' ', keyword('return'), `<${component('Storybook')} />;`].join(' '),
    '}',
  ].join('\n');
}

/** A root component that returns Storybook while `isStorybookMode` is true, and the app otherwise. */
function integratedRootComponent(): string {
  return [
    [
      keyword('import'),
      '{ isStorybookMode }',
      keyword('from'),
      `${component(`"${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}"`)};`,
    ].join(' '),
    [keyword('import'), 'Storybook', keyword('from'), `${component('"./.rnstorybook"')};`].join(
      ' '
    ),
    '',
    [keyword('export default function'), `${functionName('App')}() {`].join(' '),
    [' ', keyword('if'), '(isStorybookMode) {'].join(' '),
    [' ', ' ', keyword('return'), `<${component('Storybook')} />;`].join(' '),
    [' ', '}'].join(' '),
    '',
    [' ', keyword('return'), `<${component('YourApp')} />;`].join(' '),
    '}',
  ].join('\n');
}

/** The colours a code sample's words are drawn in. */
function keyword(text: string): string {
  return chalk.cyan(text);
}

function component(text: string): string {
  return chalk.magenta(text);
}

function functionName(text: string): string {
  return chalk.green(text);
}
