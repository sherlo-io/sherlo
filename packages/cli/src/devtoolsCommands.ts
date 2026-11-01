/**
 * THE TWO COMMANDS FOR THE PEOPLE WHO WORK ON THE TOOL: `sherlo pose` and `sherlo mask`. Both are
 * HIDDEN UNLESS `SHERLO_DEVTOOLS=1` - the same gate `--diagnostics` sits behind - because a user
 * who runs `sherlo --help` has no use for a verb that takes a JSON document describing a run they
 * are not making.
 */
import { Command } from 'commander';
import { MASK_COMMAND, POSE_COMMAND } from './constants';

const DESCRIPTION = {
  [POSE_COMMAND]:
    'Run ONE command against a declared world and print the whole screen it would put\n' +
    '  on a terminal, with the exit code the real run would have had. The world - the\n' +
    "  project folder, the settings, git, the bundler's answer and the server's - is a\n" +
    '  JSON document (contracts/pose.contract.ts); pass `-` to read it from stdin.\n' +
    '  With `--no-terminal`: print what an agent or a CI log receives instead, every\n' +
    '  byte kept. Touches no network and no project. Hidden unless SHERLO_DEVTOOLS=1.',
  [MASK_COMMAND]:
    'Read a screen on stdin and print it with every value only a machine knows folded\n' +
    '  to its placeholder - a token, a build address, a size, a duration, a commit, a\n' +
    '  fingerprint, the progress lines a wait printed. The SAME folding `npx sherlo pose`\n' +
    "  applies to a screen it printed itself, so a live run's screen and a posed one\n" +
    '  can be compared. Hidden unless SHERLO_DEVTOOLS=1.',
};

/** Add `pose` and `mask` to the program, when the gate is open. */
export function addDevtoolsCommands(program: Command) {
  if (process.env.SHERLO_DEVTOOLS !== '1') return;

  // `pose <pose.json|->` runs one command against a declared world (see ./commands/pose/pose).
  // The command is loaded only when it runs: it reaches back into ./start, so a static import
  // would be a load-time cycle.
  program
    .command(`${POSE_COMMAND} <pose>`)
    .description(DESCRIPTION[POSE_COMMAND])
    .option('--no-terminal', 'Print what an agent or a CI log receives, with no terminal attached')
    .option('--play <castFile>', 'Run with every wait at 2 seconds and write the cast to this file')
    .action(async (documentPath: string, actionOptions: { terminal: boolean; play?: string }) => {
      const { pose } = await import('./commands/pose/pose');

      await pose(documentPath, actionOptions);
    });

  // `mask` folds a screen this tool did not print itself (see ./commands/pose/maskScreen). The
  // test repository pipes a real run's screen through it and compares the result against a posed
  // screen, which only works while both go through one masker. The two flags are the two paths a
  // run knew that nobody else can: its own project folder and its own resolved config file.
  program
    .command(MASK_COMMAND)
    .description(DESCRIPTION[MASK_COMMAND])
    .option('--project-root <dir>', 'The project folder the run read')
    .option('--config-path <file>', 'The config file path the run resolved')
    .action(async (actionOptions: { projectRoot?: string; configPath?: string }) => {
      const { mask } = await import('./commands/pose/maskScreen');

      mask(actionOptions);
    });
}
