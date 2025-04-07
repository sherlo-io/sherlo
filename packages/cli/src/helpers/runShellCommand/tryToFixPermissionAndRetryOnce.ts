import { exec } from 'child_process';
import { existsSync } from 'fs';
import { dirname } from 'path';
import executeCommand from './executeCommand';

/**
 * Attempts to fix permission issues and retries the command
 */
async function tryToFixPermissionAndRetryOnce({
  error,
  command,
  projectRoot,
  encoding,
}: {
  error: Error & { stderr?: string };
  command: string;
  projectRoot: string;
  encoding: 'utf8' | 'buffer';
}): Promise<string | Buffer> {
  const filePath = extractFilePath(error.stderr || '');

  if (filePath && isValidFilePath(filePath)) {
    try {
      await makeFileExecutable({ filePath, projectRoot });
    } catch {
      // If fixing permissions fails, throw the original error
      throw error;
    }

    return await executeCommand({ command, projectRoot, encoding });
  }

  // If we couldn't extract a valid path, throw the original error
  throw error;
}

export default tryToFixPermissionAndRetryOnce;

/* ========================================================================== */

/**
 * Extracts file path from a permission denied error message
 */
function extractFilePath(errorMessage: string): string | null {
  // Looking for patterns like "sh: /path/to/file: Permission denied"
  const match = errorMessage.match(/sh:\s+([^:]+):\s+Permission denied/);

  return match?.[1] || null;
}

/**
 * Validates that the string looks like a file path
 */
function isValidFilePath(path: string): boolean {
  // Basic validation: starts with / and parent directory exists
  return path.startsWith('/') && existsSync(dirname(path));
}

/**
 * Makes a file executable using chmod +x
 */
function makeFileExecutable({
  filePath,
  projectRoot,
}: {
  filePath: string;
  projectRoot: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(`chmod +x "${filePath}"`, { cwd: projectRoot }, (error) => {
      reject();

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
