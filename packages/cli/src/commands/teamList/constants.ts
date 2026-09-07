import { TEAM_COMMAND, TEAM_LIST_SUBCOMMAND } from '../../constants';

/** `team list` - what the user typed, for reporting and for error prose. */
export const THIS_COMMAND = `${TEAM_COMMAND} ${TEAM_LIST_SUBCOMMAND}`;

/*
 * EXIT CODE CONTRACT - `sherlo team list`
 * =============================================================================
 * 0 means the API answered and the list (possibly empty) was printed. Anything
 * else means the CLI cannot show it - a bad credential or a network failure.
 * There is no partial success, same as ../projectList/constants.
 * =============================================================================
 */
