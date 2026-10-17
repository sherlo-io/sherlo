/**
 * `sherlo feedback --kind <kind>` - send the Sherlo team a report.
 *
 * It asks nothing. A report is one of four kinds - bug, missing, unclear, other - and each kind
 * cannot be sent without its own sections (../../render/feedback); "unknown" answers any of them,
 * and a report missing one is refused once, naming every missing section. The report is read only
 * from a file: `--file <path>`, or `--file -` for a quoted here-document piped in - never from
 * words after the command, which the shell may already have changed - and is 10 to 4,000
 * characters. It is sent with the login saved on this computer, and refused without one. Beside
 * the report it sends the facts needed to act on it (./collectContext) with every token and key
 * blanked out (./blankSecrets), and never a token. `--dry-run` prints exactly that and sends
 * nothing.
 */
import fs from 'fs';
import path from 'path';
import { printSherloIntro, throwError } from '../../helpers';
import { getEndpointUrl } from '../../helpers/buildStatusRequest';
import { emit } from '../../helpers/transcriptSink';
import { FEEDBACK_HELP_LINE, FEEDBACK_KINDS, renderFeedbackFormat } from '../../render/feedback';
import { projectFiles } from '../../seams/projectFiles';
import { savedLogins } from '../../seams/savedLogins';
import { serverCalls, ServiceRefusedTokenError } from '../../seams/serverCalls';
import { blankReportAndErrorLines } from './blankSecrets';
import { collectContext } from './collectContext';

export type FeedbackOptions = { kind?: string; file?: string; dryRun?: boolean };

const SHORTEST_REPORT = 10;
const LONGEST_REPORT = 4000;
const FORMAT_LINE = `The format: ${FEEDBACK_HELP_LINE}`;

async function feedback(words: string[], options: FeedbackOptions): Promise<void> {
  printSherloIntro();

  const kind = FEEDBACK_KINDS.find((one) => one.kind === options.kind);
  if (!kind) {
    const refusal = options.kind
      ? `Not sent: "${options.kind}" is not a kind of report. The kinds are bug, missing, unclear and other.`
      : 'Not sent: the report has no kind. Set one with --kind.';
    throwError({ message: [refusal, '', ...renderFeedbackFormat()].join('\n  ') });
  }

  // A report is never read from words after the command: the shell has already changed them - a
  // `$(...)` or a backtick inside double quotes ran, and an unquoted `;` ended the command.
  if (words.length > 0 || !options.file) {
    throwError({
      message: [
        'Not sent: a report is read from a file, not from words after the command, which the shell may already have changed.',
        "A quoted here-document is left alone by the shell: npx sherlo feedback --kind bug --file - <<'EOF'",
        'On Windows, a named file works: npx sherlo feedback --kind bug --file report.md',
        FORMAT_LINE,
      ].join('\n  '),
    });
  }

  if (options.file === '-' && process.stdin.isTTY) {
    throwError({
      message: [
        'Not sent: --file - reads the report from a pipe or a here-document, and nothing was piped in.',
        FORMAT_LINE,
      ].join('\n  '),
    });
  }

  const report = readReport(options.file);
  if (report.length < SHORTEST_REPORT || report.length > LONGEST_REPORT) {
    throwError({
      message: [
        `Not sent: a report is between ${SHORTEST_REPORT} and ${LONGEST_REPORT.toLocaleString(
          'en-US'
        )} characters, and this one is ${report.length}.`,
        FORMAT_LINE,
      ].join('\n  '),
    });
  }

  const sections = kind.required.map(({ heading }) => heading);
  const missing = missingSections(report, sections);
  if (missing.length > 0) {
    throwError({
      message: [
        `Not sent: a ${kind.kind} report is sent with ${listInWords(
          sections,
          'and'
        )}, and this one has no ${listInWords(missing, 'or')}.`,
        'Each section can be answered with "unknown" when the answer is not known.',
        FORMAT_LINE,
      ].join('\n  '),
    });
  }

  const sent = blankReportAndErrorLines(report, await collectContext());

  if (options.dryRun) {
    emit({ kind: 'feedback-dry-run', reportKind: kind.kind, ...sent });
    return;
  }

  const savedLogin = savedLogins().read(getEndpointUrl());
  if (!savedLogin) {
    throwError({
      message: [
        'Not sent: feedback is sent with a Sherlo login, and this computer has none saved.',
        'Logging in takes npx sherlo login, and the same report can be sent again after that.',
      ].join('\n  '),
    });
  }

  const { reference } = await serverCalls()
    .sendFeedback({ personalToken: savedLogin.token, kind: kind.kind, ...sent })
    .catch((error: Error) => {
      if (error instanceof ServiceRefusedTokenError) {
        // As logout does: a refused token is already ended on the service, so it is deleted here.
        savedLogins().remove(getEndpointUrl());
        throwError({
          message: [
            'Not sent: Sherlo refused the saved login, which was ended or has run out, so the report did not leave this computer. The saved login is deleted, as npx sherlo logout does.',
            'Logging in again takes npx sherlo login, and the same report can be sent again after that.',
          ].join('\n  '),
        });
      }

      throwError({
        message: [
          'Not sent: Sherlo could not be reached, so nothing left this computer.',
          'The same command sends the report again once the connection is back.',
        ].join('\n  '),
      });
    });

  emit({
    kind: 'feedback-sent',
    reference,
    lastCommand: sent.context.lastCommand && {
      command: sent.context.lastCommand.command,
      exitCode: sent.context.lastCommand.exitCode,
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

export default feedback;
