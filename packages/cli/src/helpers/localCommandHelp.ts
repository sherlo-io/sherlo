/**
 * THE HELP WORDS OF THE COMMANDS THAT RUN ON THIS COMPUTER ALONE - `open`, `capture`, `coverage`
 * and `suggest`: the flags they share and the description of `suggest`. `start.ts` lists them.
 */
import {
  ALL_OPTION,
  DEFAULT_BUNDLER_PORT,
  DIR_OPTION,
  FACTS_OPTION,
  JSON_OPTION,
  LOGS_OPTION,
  PNG_OPTION,
  PORT_OPTION,
  PROPS_OPTION,
  TIMEOUT_OPTION,
  TREE_OPTION,
  WAIT_OPTION,
} from '../constants';

/** What `sherlo suggest --help` says. */
export const SUGGEST_DESCRIPTION =
  'Rank what to test next from your source files and git history.\n' +
  '  Reads your code and `git log` of the last 12 months: no config, no bundler, no login.\n' +
  `  \`--${FACTS_OPTION} <file>\` prints what to know to write the test of one screen or component.`;

/** The flags as `--help` words them, keyed by the flag a person types. */
export const LOCAL_COMMAND_OPTION_DEFINITION: Record<string, [string, string]> = {
  [PORT_OPTION]: [
    `--${PORT_OPTION} <port>`,
    `Where the bundler is listening (default: ${DEFAULT_BUNDLER_PORT})`,
  ],
  [JSON_OPTION]: [`--${JSON_OPTION}`, 'Print the whole record as JSON instead of a screen'],
  [LOGS_OPTION]: [
    `--${LOGS_OPTION}`,
    "Print Sherlo's latest log lines from the app not shown before (at most 1000)",
  ],
  [TREE_OPTION]: [`--${TREE_OPTION}`, 'Also print the view tree the capture read'],
  [PNG_OPTION]: [
    `--${PNG_OPTION} <path>`,
    'Save the screen as Sherlo captured it to this path (a PNG file)',
  ],
  [PROPS_OPTION]: [
    `--${PROPS_OPTION}`,
    'Also read the story files and list the prop values no story file sets',
  ],
  [TIMEOUT_OPTION]: [
    `--${TIMEOUT_OPTION} <seconds>`,
    `How long \`--${WAIT_OPTION}\` waits for the app to report the story (default: 30)`,
  ],
  [DIR_OPTION]: [`--${DIR_OPTION} <path>`, 'The app folder to read (default: where you stand)'],
  [ALL_OPTION]: [`--${ALL_OPTION}`, 'List every item, not the top 10'],
  [FACTS_OPTION]: [
    `--${FACTS_OPTION} <file>`,
    'Print what to know to write the test of one screen or component of the app',
  ],
};
