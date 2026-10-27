import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Puts a git first on PATH that logs the prompt-off environment of every `subcommand` call to a
 * file, runs `onSubcommand` (a shell line) for it, then runs the real git. Call remove() to take it
 * off PATH and delete it.
 */
export default function fakeGit(
  subcommand: string,
  onSubcommand = ':'
): { envLog: string; remove: () => void } {
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const savedPath = process.env.PATH;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fake-git-'));
  const envLog = path.join(dir, 'env.log');
  const script = [
    '#!/bin/sh',
    `if [ "$1" = "${subcommand}" ]; then`,
    `  echo "$GIT_TERMINAL_PROMPT|$GIT_ASKPASS" > "${envLog}"`,
    `  ${onSubcommand}`,
    'fi',
    `exec "${realGit}" "$@"`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'git'), script, { mode: 0o755 });
  process.env.PATH = `${dir}${path.delimiter}${savedPath}`;
  return {
    envLog,
    remove: () => {
      process.env.PATH = savedPath;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
