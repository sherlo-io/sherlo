/**
 * WHAT `sherlo project list` PRINTS.
 *
 * Pure, like everything under ./: state in, print-call argument lists out. The
 * read-side sibling of ./projectCreated: one row per project of a team, index
 * first because the index is what every other command takes (`sherlo view`,
 * `sherlo test --project`), then the name, then how many builds it has and its
 * main branch, both dimmed because they are context rather than the answer.
 *
 * PLAN-LAYER PRESENTATION (2026-09-07). This renderer is the page the operator
 * signs; the command that produces the state it prints - the API query, the
 * `project list` verb itself - is build work and does not exist yet. A transcript
 * rendered from here is a designed pose, not a captured run.
 */
import chalk from 'chalk';

/** One project as the list shows it. */
export type ProjectListed = {
  /** The project's index within its team - what `--project` and `sherlo view` take. */
  index: number;
  name: string;
  buildCount: number;
  /** The branch its baselines are kept on, or null while the project has never chosen one. */
  mainBranch: string | null;
};

/** The whole of what one `sherlo project list` run needed in order to print. */
export type ProjectList = {
  team: { name: string; id: string };
  projects: ProjectListed[];
};

const NEXT_STEP = 'Next: `sherlo project create <name> --team <id>` adds one; `sherlo view <build>` opens a build.';

/** Every line the command prints on success, in order. */
export function renderProjectList({ team, projects }: ProjectList): string[] {
  if (projects.length === 0) {
    return [`${chalk.yellow('◦')}  No projects yet in team ${chalk.bold(team.name)}`, '', chalk.dim(NEXT_STEP), ''];
  }

  const indexWidth = Math.max(...projects.map((project) => String(project.index).length));
  const nameWidth = Math.max(...projects.map((project) => project.name.length));
  const rows = projects.map((project) => {
    const builds = project.buildCount === 0 ? 'no builds yet' : `${project.buildCount} build${project.buildCount === 1 ? '' : 's'}`;
    const cells = [`  ${String(project.index).padStart(indexWidth)}`, project.name.padEnd(nameWidth), chalk.dim(builds)];
    if (project.mainBranch) cells.push(chalk.dim(project.mainBranch));
    return cells.join('  ');
  });

  return [
    `${chalk.green('✔')}  ${projects.length} project${projects.length === 1 ? '' : 's'} in team ${chalk.bold(team.name)}`,
    '',
    ...rows,
    '',
    chalk.dim(NEXT_STEP),
    '',
  ];
}
