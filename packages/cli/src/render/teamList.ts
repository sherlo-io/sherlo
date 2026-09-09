/**
 * WHAT `sherlo team list` PRINTS.
 *
 * Pure, like everything under ./: state in, print-call argument lists out. The
 * sibling of ./projectList one level up: one row per team the caller belongs to,
 * id first because the id is what `--team` takes everywhere else, then the name,
 * then how many projects it holds and the caller's role, dimmed as context.
 *
 * PLAN-LAYER PRESENTATION (2026-09-07). This renderer is the page the operator
 * signs; the command that produces the state it prints - the API query, the
 * `team list` verb itself - is build work and does not exist yet.
 */
import chalk from 'chalk';

/** One team as the list shows it. */
export type TeamListed = {
  /** The team's id as the API minted it - what `--team` takes everywhere else. */
  id: string;
  name: string;
  projectCount: number;
  /** The caller's membership role, or null when the API does not say. */
  role: string | null;
};

/** The whole of what one `sherlo team list` run needed in order to print. */
export type TeamList = {
  teams: TeamListed[];
};

const NEXT_STEP =
  "Next: `sherlo project list --team <id>` shows a team's projects; `sherlo team create --name <name>` adds a team.";
const EMPTY_NEXT_STEP = 'Next: `sherlo team create --name <name>` makes your first team.';

/** Every line the command prints on success, in order. */
export function renderTeamList({ teams }: TeamList): string[] {
  if (teams.length === 0) {
    return [
      `${chalk.yellow('◦')}  You are not in any team yet`,
      '',
      chalk.dim(EMPTY_NEXT_STEP),
      '',
    ];
  }

  const idWidth = Math.max(...teams.map((team) => team.id.length));
  const nameWidth = Math.max(...teams.map((team) => team.name.length));
  const rows = teams.map((team) => {
    const projects =
      team.projectCount === 0
        ? 'no projects yet'
        : `${team.projectCount} project${team.projectCount === 1 ? '' : 's'}`;
    const cells = [
      `  ${team.id.padEnd(idWidth)}`,
      team.name.padEnd(nameWidth),
      chalk.dim(projects),
    ];
    if (team.role) cells.push(chalk.dim(team.role));
    return cells.join('  ');
  });

  return [
    `${chalk.green('✔')}  ${teams.length} team${teams.length === 1 ? '' : 's'}`,
    '',
    ...rows,
    '',
    chalk.dim(NEXT_STEP),
    '',
  ];
}
