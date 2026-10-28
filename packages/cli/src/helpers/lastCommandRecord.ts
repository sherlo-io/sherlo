/**
 * THE RECORD EVERY COMMAND KEEPS OF HOW IT ENDED, WHICH `sherlo feedback` ATTACHES.
 *
 * `<project>/.sherlo/last-command.json` holds the last command's name, its flags with tokens
 * hidden, its exit code and, when it failed, the last lines it printed with tokens blanked. Each command overwrites the last. A record that cannot be written or
 * read is left out, and never changes how a command ends.
 */
import fs from 'fs';
import path from 'path';
import { SHERLO_TEMP_DIRECTORY } from '../constants';
import { projectFiles } from '../seams/projectFiles';
import type { FeedbackContext } from '../seams/serverCalls';
import { blankSecrets } from './blankSecrets';
import stripAnsi from './stripAnsi';

const RECORD_FILENAME = 'last-command.json';
const HIDDEN = '[hidden]';
const MAX_ERROR_LINES = 20;

type CommandRecord = {
  command: string;
  flags: { [name: string]: unknown };
  exitCode: number;
  errorLines: string[];
};

/** EVERY option whose name ends in `token` is hidden, not just `--token`: the next credential flag is covered on the day it is added. */
export function hideTokens(options: unknown): { [name: string]: unknown } {
  return Object.fromEntries(
    Object.entries(options ?? {}).map(([name, value]) =>
      /token$/i.test(name) && value ? [name, HIDDEN] : [name, value]
    )
  );
}

let lastPrintedLines: string[] = [];

/** Keeps the last lines a command prints, on either stream, without changing what it prints. */
function keepLastPrintedLines() {
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream) as (...args: unknown[]) => boolean;

    stream.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      const lines = stripAnsi(String(chunk))
        .split('\n')
        .filter((line) => line.trim());
      lastPrintedLines = [...lastPrintedLines, ...lines].slice(-MAX_ERROR_LINES);

      return write(chunk, ...rest);
    }) as typeof stream.write;
  }
}

/** Starts the record, written when this process ends - by a return, by an error or by any `process.exit` in the command. */
export function recordLastCommand(command: string, options: unknown) {
  const flags = hideTokens(options);
  // Fixed now, while this command's project is the one in force: the process ends later.
  const file = recordPath();
  lastPrintedLines = [];
  keepLastPrintedLines();

  process.once('exit', (exitCode) => {
    // A command that ended well has no error to hand over.
    const errorLines = exitCode === 0 ? [] : lastPrintedLines.map(blankSecrets);
    writeRecord(file, { command, flags, exitCode, errorLines });
  });
}

/** The last command this project ran, as `sherlo feedback` sends it; absent when none is recorded. */
export function readLastCommand(): FeedbackContext['lastCommand'] {
  try {
    const record: CommandRecord = JSON.parse(fs.readFileSync(recordPath(), 'utf8'));

    if (typeof record.command !== 'string' || typeof record.exitCode !== 'number') return undefined;

    return {
      command: record.command,
      exitCode: record.exitCode,
      errorLines: Array.isArray(record.errorLines) ? record.errorLines.map(String) : [],
    };
  } catch {
    return undefined; // No record yet, or one that is not readable: nothing to attach.
  }
}

function recordPath(): string {
  return path.join(projectFiles().root(), SHERLO_TEMP_DIRECTORY, RECORD_FILENAME);
}

function writeRecord(file: string, record: CommandRecord) {
  try {
    const folder = path.dirname(file);
    // A project folder gone by the time the process ends (a posed run's, removed after it) gets no record.
    if (!fs.existsSync(path.dirname(folder))) return;
    fs.mkdirSync(folder, { recursive: true });

    // So the record never marks the next run's `git status` dirty.
    const gitignore = path.join(folder, '.gitignore');
    if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, '*\n');

    fs.writeFileSync(file, JSON.stringify(record, null, 2));
  } catch {
    // A folder that cannot be written (read-only, no project) must not change how a command ends.
  }
}
