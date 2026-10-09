/**
 * `sherlo feedback --kind <kind>` - send the Sherlo team a report (sherlo / Sending feedback).
 *
 * It asks nothing. A report is one of four kinds - bug, missing, unclear, other - and each kind
 * cannot be sent without its own sections (../../render/feedback); "unknown" answers any of them,
 * and a report missing one is refused once, naming every missing section. The report is read only
 * from a file: `--file <path>`, or `--file -` for a quoted here-document piped in - never from words
 * after the command, which the shell may already have changed - and is 10 to 4,000 characters. It is sent with the login saved on this computer, and refused without one. Beside the
 * report it sends the facts needed to act on it - the last Sherlo command this project ran with its
 * error lines, the versions, package manager and operating system, and which AI agent sent it, by
 * name - and never a token. `--dry-run` prints exactly that and sends nothing.
 *
 * PLAN LAYER (epic sherlo-feedback): this body only prints. Collecting the context through the
 * existing helpers, recording each command's outcome and the live service call are build tasks.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { version } from '../../../package.json';
import { printSherloIntro, throwError } from '../../helpers';
import { getEndpointUrl } from '../../helpers/buildStatusRequest';
import { emit } from '../../helpers/transcriptSink';
import { FEEDBACK_HELP_LINE, FEEDBACK_KINDS, renderFeedbackFormat } from '../../render/feedback';
import { projectFiles } from '../../seams/projectFiles';
import { savedLogins } from '../../seams/savedLogins';
import { serverCalls, type FeedbackContext } from '../../seams/serverCalls';
import { runningAgent } from './runningAgent';

type FeedbackOptions = { kind?: string; file?: string; dryRun?: boolean };

const SHORTEST_REPORT = 10;
const LONGEST_REPORT = 4000;

async function feedback(words: string[], options: FeedbackOptions): Promise<void> {
  printSherloIntro();

  const kind = FEEDBACK_KINDS.find((one) => one.kind === options.kind);
  if (!kind) {
    throwError({
      message: [
        options.kind ? `There is no kind of report called "${options.kind}".` : 'Say what kind of report this is with --kind.',
        ...renderFeedbackFormat(),
      ].join('\n  '),
    });
  }

  // A report is never read from words after the command: the shell has already changed them - a
  // `$(...)` or a backtick inside double quotes ran, and an unquoted `;` ended the command.
  if (words.length > 0 || !options.file) {
    throwError({
      message:
        'Not sent: a report is read from a file, never from words after the command, which the shell may already have changed.\n' +
        "  Pipe it in with a quoted here-document, which the shell leaves alone: npx sherlo feedback --kind bug --file - <<'EOF'\n" +
        `  The format: ${FEEDBACK_HELP_LINE}`,
    });
  }

  if (options.file === '-' && process.stdin.isTTY) {
    throwError({
      message:
        'Not sent: `--file -` reads the report from a pipe or a here-document, and nothing was piped in.\n' +
        `  The format: ${FEEDBACK_HELP_LINE}`,
    });
  }

  const report = readReport(options.file);
  if (report.length < SHORTEST_REPORT || report.length > LONGEST_REPORT) {
    throwError({
      message:
        `Not sent: a report is between ${SHORTEST_REPORT} and ${LONGEST_REPORT.toLocaleString('en-US')} characters, and this one is ${report.length}.\n` +
        `  The format: ${FEEDBACK_HELP_LINE}`,
    });
  }

  const missing = missingSections(report, kind.required.map(({ heading }) => heading));
  if (missing.length > 0) {
    throwError({
      message:
        `Not sent: a ${kind.kind} report needs ${listInWords(kind.required.map(({ heading }) => heading), 'and')}, ` +
        `and this one has no ${listInWords(missing, 'or')}.\n` +
        '  Write each one, or "unknown" if you do not know it, then send it again.\n' +
        `  The format: ${FEEDBACK_HELP_LINE}`,
    });
  }

  const context = collectContext();

  if (options.dryRun) {
    emit({ kind: 'feedback-dry-run', reportKind: kind.kind, report, context });
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
    .sendFeedback({ personalToken: savedLogin.token, kind: kind.kind, text: report, context })
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

/** The report's words, trimmed: piped in (`--file -`), or the file `--file` names. */
function readReport(file: string): string {
  if (file === '-') return fs.readFileSync(0, 'utf8').trim();
  return fs.readFileSync(path.resolve(projectFiles().root(), file), 'utf8').trim();
}

/** The required sections the report has no heading for, or leaves empty under its heading. */
function missingSections(report: string, required: string[]): string[] {
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

  return required.filter((heading) => !bodies.get(heading.toLowerCase()));
}

function listInWords(items: string[], joiner: 'and' | 'or'): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} ${joiner} ${items[items.length - 1]}`;
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
    agent: runningAgent(),
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
