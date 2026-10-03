import { PROJECT_COMMAND, PROJECT_CREATE_SUBCOMMAND } from '../../constants';

/** `project create` - what the user typed, for reporting and for error prose. */
export const THIS_COMMAND = `${PROJECT_COMMAND} ${PROJECT_CREATE_SUBCOMMAND}`;

/*
 * EXIT CODE CONTRACT - `sherlo project create`
 * =============================================================================
 * 0 means the project exists and its token was printed. Anything else means it
 * was NOT created, or the CLI cannot prove it was.
 *
 * THERE IS NO RETRY, HERE OR ANYWHERE ABOVE THIS COMMAND, and that is a
 * decision rather than an omission. `createProject` is not idempotent and
 * project names are not unique, so a second attempt after an ambiguous failure
 * makes a SECOND project - and the first one's token, if it was ever minted, is
 * now unrecoverable. A run that fails after the request went out therefore says
 * so and stops, leaving the human to look at the web app and decide. When the
 * API grows a "make sure this project exists" verb with a uniqueness key, that
 * is what a retry-safe caller should use; a retry loop over this mutation would
 * be a duplicate-project generator.
 * =============================================================================
 */
