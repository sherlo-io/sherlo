/** A project, by its team's id and its number within the team. */
export type ProjectAddress = { teamId: string; projectIndex: number };

/** The project as the config's `project` holds it: the team id, a slash and the number. */
export function asConfigProject({ teamId, projectIndex }: ProjectAddress): string {
  return `${teamId}/${projectIndex}`;
}
