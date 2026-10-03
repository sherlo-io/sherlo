/**
 * THE TEAM ID a management command was told to act on, from `--team`.
 *
 * Shared between `project create` (which team a new project belongs to) and
 * `project list` (which team's projects to show) - both need the same flag,
 * the same "there is nothing to infer this from" refusal, and differ only in
 * `purpose`: the one clause naming WHY this particular command needs it.
 *
 * `team create` and `team list` do not use this: a personal token names a
 * person who may belong to several teams or none, so those two act across all
 * of the caller's teams rather than one named team.
 */
import { TEAM_OPTION } from '../../constants';
import { throwError } from '../../helpers';

function resolveTeamId(
  passedTeamId: string | undefined,
  { thisCommand, purpose }: { thisCommand: string; purpose: string }
): string {
  const teamId = passedTeamId?.trim();

  if (!teamId) {
    throwError({
      message:
        `\`sherlo ${thisCommand}\` needs ${purpose}: ` +
        `\`--${TEAM_OPTION} <teamId>\`.\n` +
        '\n' +
        '  A personal token names a person, not a team, so there is nothing to infer it\n' +
        "  from. The id is the `t=` value in the web app's URL while you are looking at\n" +
        '  that team.',
    });
  }

  return teamId;
}

export default resolveTeamId;
