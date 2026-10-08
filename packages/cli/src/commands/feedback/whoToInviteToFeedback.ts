/**
 * Who a command invites to send feedback (sherlo / Sending feedback): the help block after every
 * refusal, and the end of a test run, both ask here.
 *
 * Feedback is sent with the saved login, so nobody is invited without one; nor is anyone whose
 * feedback itself just failed. An AI agent reads a pipe, a person a terminal.
 */
import { getEndpointUrl } from '../../helpers/buildStatusRequest';
import type { FeedbackInvite } from '../../render/needHelp';
import { savedLogins } from '../../seams/savedLogins';
import { FEEDBACK_COMMAND } from './constants';

export function whoToInviteToFeedback(): FeedbackInvite {
  if (process.argv[2] === FEEDBACK_COMMAND) return 'none';

  const hasSavedLogin = (() => {
    try {
      return Boolean(savedLogins().read(getEndpointUrl()));
    } catch {
      return false;
    }
  })();
  if (!hasSavedLogin) return 'none';

  return process.stderr.isTTY ? 'person' : 'agent';
}
