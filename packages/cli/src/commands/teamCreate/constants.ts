import { TEAM_COMMAND, TEAM_CREATE_SUBCOMMAND } from '../../constants';

/** `team create` - what the user typed, for reporting and for error prose. */
export const THIS_COMMAND = `${TEAM_COMMAND} ${TEAM_CREATE_SUBCOMMAND}`;

/*
 * EXIT CODE CONTRACT - `sherlo team create`
 * =============================================================================
 * 0 means the team exists. Anything else means it was NOT created, or the CLI
 * cannot prove it was.
 *
 * NO RETRY, for the same reason ../projectCreate/constants documents:
 * `createTeam` is not idempotent and team names are not unique, so retrying
 * after an ambiguous failure risks a second team rather than confirming the
 * first.
 * =============================================================================
 */
