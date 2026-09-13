import { PROJECT_COMMAND, PROJECT_LIST_SUBCOMMAND } from '../../constants';

/** `project list` - what the user typed, for reporting and for error prose. */
export const THIS_COMMAND = `${PROJECT_COMMAND} ${PROJECT_LIST_SUBCOMMAND}`;

/*
 * EXIT CODE CONTRACT - `sherlo project list`
 * =============================================================================
 * 0 means the API answered and the list (possibly empty) was printed. Anything
 * else means the CLI cannot show it - a bad credential, an unknown team, a
 * network failure. There is no partial success: a read either lands or it
 * refuses, and a refusal never prints a truncated table.
 * =============================================================================
 */
