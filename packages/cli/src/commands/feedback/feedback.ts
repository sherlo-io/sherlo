/**
 * `sherlo feedback` - send the Sherlo team a report of what was unclear, slow or broken (sherlo /
 * Sending feedback).
 *
 * It asks nothing. The report is written in six named sections (../../render/feedback) and given as
 * words, a file (`--file`) or piped text (`-`); a report missing a section is refused once, naming
 * every missing section, and "unknown" answers any of them. It is sent with the login saved on this
 * computer, and refused without one. Beside the report it sends the facts needed to act on it - the
 * last Sherlo command this project ran with its error lines, the versions, package manager and
 * operating system - and never a token. `--dry-run` prints exactly that and sends nothing.
 *
 * PLAN LAYER (epic sherlo-feedback): this body only prints. Collecting the context through the
 * existing helpers, recording each command's outcome, reading piped text and the live service call
 * are build tasks.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { version } from '../../../package.json';
import { printSherloIntro, throwError } from '../../helpers';
import { getEndpointUrl } from '../../helpers/buildStatusRequest';
import { emit } from '../../helpers/transcriptSink';
import { FEEDBACK_SECTIONS, renderFeedbackFormat } from '../../render/feedback';
import { FEEDBACK_HELP_LINE } from '../../render/needHelp';
import { projectFiles } from '../../seams/projectFiles';
import { savedLogins } from '../../seams/savedLogins';
import { serverCalls, type FeedbackContext } from '../../seams/serverCalls';

type FeedbackOptions = { file?: string; dryRun?: boolean };

async function feedback(text: string | undefined, options: FeedbackOptions): Promise<void> {
  printSherloIntro();

  const report = readReport(text, options.file);
  if (!report) {
    throwError({ message: ['Write your report first.', ...renderFeedbackFormat()].join('\n  ') });
  }

  const missing = missingSections(report);
  if (missing.length > 0) {
    throwError({
      message:
        `Not sent: the report has no ${listInWords(missing)}. We can only fix what we can reproduce.\n` +
        '  Write each one, or "unknown" if you do not know it, then send it again.\n' +
        `  The format: ${FEEDBACK_HELP_LINE}`,
    });
  }

  const context = collectContext();

  if (options.dryRun) {
    emit({ kind: 'feedback-dry-run', report, context });
    return;
  }

  const savedLogin = savedLogins().read(getEndpointUrl());
  if (!savedLogin) {
    throwError({
      message:
        'Feedback is sent with your Sherlo login, and this computer has none.\n' +
        '  Run `npx sherlo login`, then send your feedback again.',
    });
  }

  const { reference } = await serverCalls()
    .sendFeedback({ personalToken: savedLogin.token, text: report, context })
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
    lastCommand: context.lastCommand && {
      command: context.lastCommand.command,
      exitCode: context.lastCommand.exitCode,
    },
  });
}

/** The report's words: the argument, or the file `--file` names, trimmed. */
function readReport(text: string | undefined, file: string | undefined): string {
  if (file) return fs.readFileSync(path.resolve(projectFiles().root(), file), 'utf8').trim();
  return (text ?? '').trim();
}

/** The sections the report has no heading for, or leaves empty under its heading. */
function missingSections(report: string): string[] {
  const bodies = new Map<string, string>();
  let current: string | undefined;

  for (const line of report.split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].toLowerCase();
      bodies.set(current, '');
    } else if (current) {
      bodies.set(current, `${bodies.get(current)}${line.trim()}`);
    }
  }

  return FEEDBACK_SECTIONS.map(({ heading }) => heading).filter(
    (heading) => !bodies.get(heading.toLowerCase())
  );
}

function listInWords(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/**
 * What is sent beside the report. PLAN LAYER: the build reads the versions through the existing
 * helpers (getPackageVersion, the SDK's Storybook setup check, package-manager-detector) and
 * records the last command in every command; this reads only what the pictures need.
 */
function collectContext(): FeedbackContext {
  const root = projectFiles().root();
  const lastCommandPath = path.join(root, '.sherlo', 'last-command.json');
  const packageJsonPath = path.join(root, 'package.json');
  const dependencies: Record<string, string> = fs.existsSync(packageJsonPath)
    ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).dependencies ?? {}
    : {};

  return {
    lastCommand: fs.existsSync(lastCommandPath)
      ? JSON.parse(fs.readFileSync(lastCommandPath, 'utf8'))
      : undefined,
    cliVersion: version,
    reactNativeVersion: dependencies['react-native'],
    expoVersion: dependencies['expo'],
    storybookVersion: dependencies['@storybook/react-native'],
    operatingSystem: os.platform(),
  };
}

export default feedback;
