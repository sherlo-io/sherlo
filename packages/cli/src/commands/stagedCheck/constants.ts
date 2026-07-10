import { STAGED_CHECK_COMMAND } from '../../constants';

export const THIS_COMMAND = STAGED_CHECK_COMMAND;
export type THIS_COMMAND = typeof THIS_COMMAND;

/*
 * EXIT CODE CONTRACT
 * =============================================================================
 * staged:check is a CI ROUTING decision, not a pass/fail check - every code
 * below is an EXPECTED outcome and must never surface as a crash (no Sentry
 * report, no "Need Help?" footer). A genuine tool error (bad token, network
 * failure, ...) still throws and falls through to the CLI's normal non-zero
 * exit path, distinct from this contract.
 *
 *   0 - FAST:          the local base fingerprint matches a registered base;
 *                       the `test:bundled` staged fast path can be used as-is.
 *   1 - FULL:          the fingerprint (or a diffed gate-metadata field) moved
 *                       since the registered base; a full native build is
 *                       required before staging again.
 *   2 - NOT_STAGEABLE: no devices are configured, the base fingerprint could
 *                       not be computed, or the server reports this project
 *                       can't use the staged fast path at all.
 * =============================================================================
 */
export const EXIT_FAST = 0;
export const EXIT_FULL = 1;
export const EXIT_NOT_STAGEABLE = 2;
