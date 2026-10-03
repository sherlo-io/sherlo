/**
 * EVERY MANAGEMENT COMMAND TAKES ITS NAME AS --name, NEVER A POSITIONAL - the
 * option-grammar test over `project create`, `project list`, `team create`
 * and `team list`, as registered in ../../start.
 *
 * IT SCANS SOURCE RATHER THAN BEHAVIOUR, same instrument as
 * render/__tests__/renderLayerPurity.test.ts: a positional lives in the
 * literal string handed to commander's `.command(...)`, which is a GRAMMAR
 * fact about how the command is registered - reading the text is the honest
 * check for that, not running the CLI and scraping rendered `--help` output.
 *
 * `view [build]` and `show-error <slug>` DO take a positional (start.ts:363,
 * 412) and are deliberately out of scope: the rule is about MANAGEMENT
 * commands - noun-verb pairs acting on a Sherlo resource - not every command
 * the CLI has. `sherlo project create <name>` is exactly the positional
 * grammar this repo moved away from on 2026-09-07 (../projectCreate/projectCreate's
 * own header tells that story); this test is what keeps it that way.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const START_SOURCE = fs.readFileSync(path.resolve(__dirname, '../../start.ts'), 'utf8');

/** The four management subcommands, and which of them hand the CLI a name at all. */
const MANAGEMENT_SUBCOMMANDS = [
  { constantName: 'PROJECT_CREATE_SUBCOMMAND', takesName: true },
  { constantName: 'PROJECT_LIST_SUBCOMMAND', takesName: false },
  { constantName: 'TEAM_CREATE_SUBCOMMAND', takesName: true },
  { constantName: 'TEAM_LIST_SUBCOMMAND', takesName: false },
] as const;

/**
 * The source from one subcommand's `.command(...)` call up to (roughly) its
 * `.action(...)` wiring - wide enough to reach the `addOptionsToCommand` call
 * a few lines below it, never far enough to reach the NEXT subcommand's block.
 */
function registrationBlock(constantName: string): string {
  const marker = `.command(${constantName})`;
  const start = START_SOURCE.indexOf(marker);

  if (start === -1) {
    throw new Error(`no bare ".command(${constantName})" call found in start.ts`);
  }

  return START_SOURCE.slice(start, start + 400);
}

describe('EVERY MANAGEMENT COMMAND TAKES ITS NAME AS --name, NEVER A POSITIONAL', () => {
  it.each(MANAGEMENT_SUBCOMMANDS.map(({ constantName }) => [constantName] as const))(
    '%s is registered as a bare `.command(...)` call, with no embedded positional',
    (constantName) => {
      // A positional would show up as `.command(\`${X} <name>\`)` (see VIEW_COMMAND's
      // `[build]` and SHOW_ERROR_COMMAND's `<slug>` for what that looks like) - the
      // bare form asserted here is the only shape that takes NOTHING off the
      // command line except named flags.
      expect(START_SOURCE).toContain(`.command(${constantName})`);
    }
  );

  it.each(
    MANAGEMENT_SUBCOMMANDS.filter(({ takesName }) => takesName).map(
      ({ constantName }) => [constantName] as const
    )
  )('%s reads its name only through NAME_OPTION / --name', (constantName) => {
    expect(registrationBlock(constantName)).toContain('NAME_OPTION');
  });
});
