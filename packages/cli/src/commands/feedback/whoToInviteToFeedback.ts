/**
 * Who a command invites to send feedback, and which AI agent is running it (sherlo / Sending
 * feedback). The help block after every refusal, the end of a test run and the feedback itself all
 * ask here.
 *
 * Feedback is sent with the saved login, so nobody is invited without one; nor is anyone whose
 * feedback itself just failed. An agent is known by what its harness sets in the environment, never
 * by a missing terminal: a person piping a run into `tee`, or reading a CI log, is still a person.
 *
 * PLAN LAYER: this checks two harnesses so the pictures can draw both readers. The build reuses
 * Expo's agent-cli-detector (detectAgent), which knows twenty agents, and sends the agent's name only
 * - never its session id.
 */
import { getEndpointUrl } from '../../helpers/buildStatusRequest';
import type { FeedbackInvite } from '../../render/needHelp';
import { savedLogins } from '../../seams/savedLogins';
import { FEEDBACK_COMMAND } from './constants';

/** The AI agent running this command, by name, or undefined when a person is. */
export function runningAgent(): string | undefined {
  if (process.env.CLAUDECODE) return 'Claude Code';
  if (process.env.CURSOR_AGENT) return 'Cursor';
  return undefined;
}

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

  return runningAgent() ? 'agent' : 'person';
}
