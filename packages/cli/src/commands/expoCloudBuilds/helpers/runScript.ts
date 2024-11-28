import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { DEFAULT_PROJECT_ROOT } from '../../../constants';

function runScript({
  projectRoot,
  scriptName,
  onExit,
}: {
  projectRoot: string;
  scriptName: string;
  onExit: () => void;
}) {
  let command = '';
  let args: string[] = [];

  const packageManager = detectPackageManager();

  if (packageManager === 'npm') {
    command = 'npm';

    if (projectRoot !== DEFAULT_PROJECT_ROOT) {
      args = ['--prefix', projectRoot];
    }

    args = [...args, 'run', scriptName];
  } else if (packageManager === 'yarn') {
    command = 'yarn';

    if (projectRoot !== DEFAULT_PROJECT_ROOT) {
      args = ['--cwd', projectRoot];
    }

    args = [...args, scriptName];
  } else if (packageManager === 'pnpm') {
    command = 'pnpm';

    if (projectRoot !== DEFAULT_PROJECT_ROOT) {
      args = ['--dir', projectRoot];
    }

    args = ['run', scriptName];
  }

  // TODO: zastapic runShellCommand? (chyba nie bo nie bedzie formatowac outputu ze skryptu usera?) -> moze powinnismy uzywac spawn zamiast execSync?
  const childProcess = spawn(command, args, { stdio: 'inherit' });

  ['close', 'exit'].forEach((event) => childProcess.on(event, onExit));
  ['beforeExit', 'exit', 'SIGINT'].forEach((event) => process.on(event, onExit));
}

export default runScript;

/* ========================================================================== */

// TODO: dodac support dla bun
function detectPackageManager(): 'npm' | 'yarn' | 'pnpm' {
  if (process.env.npm_config_user_agent) {
    const userAgent = process.env.npm_config_user_agent.toLowerCase();

    if (userAgent.includes('yarn')) {
      return 'yarn';
    }
    if (userAgent.includes('pnpm')) {
      return 'pnpm';
    }
    if (userAgent.includes('npm')) {
      return 'npm';
    }
  }

  // Fallback: Check for lock files in current, parent, and grandparent directories
  function detectByLockFile() {
    const depth = 3; // Check current, parent, and grandparent directories to cover monorepo cases
    const lockFiles = ['yarn.lock', 'pnpm-lock.yaml', 'package-lock.json'];
    let currentPath = process.cwd();

    for (let i = 0; i < depth; i++) {
      for (const lockFile of lockFiles) {
        const filePath = path.join(currentPath, lockFile);
        if (fs.existsSync(filePath)) {
          if (lockFile === 'yarn.lock') {
            return 'yarn';
          }
          if (lockFile === 'pnpm-lock.yaml') {
            return 'pnpm';
          }
          if (lockFile === 'package-lock.json') {
            return 'npm';
          }
        }
      }
      currentPath = path.resolve(currentPath, '..');
    }
    return null;
  }

  const detectedByLockFile = detectByLockFile();
  return detectedByLockFile ?? 'npm';
}
