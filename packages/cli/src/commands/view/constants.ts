import { VIEW_COMMAND } from '../../constants';

export const THIS_COMMAND = VIEW_COMMAND;
export type THIS_COMMAND = typeof THIS_COMMAND;

/*
 * EXIT CODE CONTRACT - `sherlo view`
 * =============================================================================
 * WITHOUT `--wait` THE EXIT CODE IS NOT A VERDICT. The command performed one
 * read and printed what it found, so it exits 0 whatever the build says, and
 * non-zero only when the read itself failed (no such build, bad token, network).
 * A build's verdict is a thing you READ here, never a thing you gate on.
 *
 * WITH `--wait` IT IS THE VERDICT, and it is the SAME contract `sherlo test
 * --wait` publishes, because it is the same loop: 0 GREEN, 1 changes require
 * review, 2 build/system error, 3 timeout, 130 interrupted (helpers/exitCodes).
 *
 * That split is what makes `sherlo view <build> --wait` the way to gate CI on a
 * build somebody else opened: the wait road returns immediately for a build that
 * is already terminal, so the flag costs nothing there and buys the exit code.
 * =============================================================================
 */
