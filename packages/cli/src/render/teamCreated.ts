/**
 * WHAT `sherlo team create` PRINTS.
 *
 * Pure, like everything under ./: state in, print-call argument lists out. The
 * sibling of ./projectCreated, and deliberately narrower: a team carries no
 * credential of its own, so there is no once-only secret to print and no line a
 * CI log could leak. Two facts are printed as `key=value` (../render/pushSpine's
 * renderOutputKeys) so a script that just created a team can pick its id up and
 * hand it to `sherlo project create --team`.
 *
 * PLAN-LAYER PRESENTATION (2026-09-07). This renderer is the page the operator
 * signs; the command that produces the state it prints - the API mutation, the
 * `team create` verb itself - is build work and does not exist yet. A transcript
 * rendered from here is a designed pose, not a captured run.
 */
import chalk from 'chalk';
import { renderOutputKeys } from './pushSpine';

/** The two facts about a created team the CLI prints. */
export type TeamCreated = {
  name: string;
  /** The team's id as the API minted it - what `--team` takes everywhere else. */
  id: string;
};

const NEXT_STEP = 'Next: invite members from the web app, or create its first project with `sherlo project create <name> --team <id>`.';

/** Every line the command prints on success, in order. */
export function renderTeamCreated({ name, id }: TeamCreated): string[] {
  return [
    `${chalk.green('✔')}  Created team ${chalk.bold(name)}`,
    '',
    ...renderOutputKeys({ teamId: id, teamName: name }),
    '',
    chalk.dim(NEXT_STEP),
    '',
  ];
}
