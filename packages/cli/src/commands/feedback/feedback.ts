/**
 * `sherlo feedback "<text>"` - send the Sherlo team what was unclear, slow or broken (sherlo /
 * Sending feedback).
 *
 * It asks nothing: the words are its one argument, so an AI agent can send it in one call. It is
 * sent with the login saved on this computer, and refused without one. Beside the words it sends
 * the facts needed to act on them - the last Sherlo command this project ran with its error lines,
 * and the versions, package manager and operating system - and never a token.
 *
 * PLAN LAYER (epic sherlo-feedback): this body only prints. Collecting the context, recording each
 * command's outcome and the live service call are build tasks.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { version } from '../../../package.json';
import { printSherloIntro, throwError } from '../../helpers';
import { getEndpointUrl } from '../../helpers/buildStatusRequest';
import { emit } from '../../helpers/transcriptSink';
import type { LastCommand } from '../../render/feedback';
import { FEEDBACK_COMMAND_LINE } from '../../render/needHelp';
import { projectFiles } from '../../seams/projectFiles';
import { savedLogins } from '../../seams/savedLogins';
import { serverCalls } from '../../seams/serverCalls';

async function feedback(text: string | undefined): Promise<void> {
  printSherloIntro();

  const words = (text ?? '').trim();
  if (!words) {
    throwError({
      message:
        'Write your feedback after the command, in quotes:\n' +
        `  ${FEEDBACK_COMMAND_LINE}\n` +
        '  A useful report says what you were doing, what you expected, what happened and what you tried.',
    });
  }

  const savedLogin = savedLogins().read(getEndpointUrl());
  if (!savedLogin) {
    throwError({
      message:
        'Feedback is sent with your Sherlo login, and this computer has none.\n' +
        '  Run `npx sherlo login`, then send your feedback again.',
    });
  }

  const lastCommand = readLastCommand();

  const { reference } = await serverCalls()
    .sendFeedback({
      personalToken: savedLogin.token,
      text: words,
      context: { lastCommand, cliVersion: version, operatingSystem: os.platform() },
    })
    .catch(() =>
      throwError({
        message:
          'Could not reach Sherlo to send your feedback.\n' +
          '  Check your connection, then send it again.',
      })
    );

  emit({
    kind: 'feedback-sent',
    reference,
    lastCommand: lastCommand && { command: lastCommand.command, exitCode: lastCommand.exitCode },
  });
}

/**
 * The last Sherlo command this project ran, as every command records it in .sherlo/last-command.json.
 * PLAN LAYER: the record and its writer are a build task; this read is what the pictures need.
 */
function readLastCommand():
  | (LastCommand & { errorLines: string[]; logFile?: string })
  | undefined {
  const recordPath = path.join(projectFiles().root(), '.sherlo', 'last-command.json');
  if (!fs.existsSync(recordPath)) return undefined;

  return JSON.parse(fs.readFileSync(recordPath, 'utf8'));
}

export default feedback;
