import executeCommand from './executeCommand';
import tryToFixPermissionAndRetryOnce from './tryToFixPermissionAndRetryOnce';

interface Options {
  command: string;
  projectRoot: string;
  encoding?: 'utf8' | 'buffer';
}

/**
 * Executes a shell command asynchronously
 * @returns Promise that resolves to the command stdout output with removed leading/trailing whitespace,
 * or rejects with an enhanced error containing both stdout and stderr if the command fails
 */
async function runShellCommand(options: Options & { encoding?: 'utf8' }): Promise<string>;
async function runShellCommand(options: Options & { encoding: 'buffer' }): Promise<Buffer>;
async function runShellCommand({
  command,
  projectRoot,
  encoding = 'utf8',
}: Options): Promise<string | Buffer> {
  try {
    return await executeCommand({ command, projectRoot, encoding });
  } catch (error) {
    if (
      error instanceof Error &&
      'stderr' in error &&
      (error as any).stderr?.includes('Permission denied')
    ) {
      return await tryToFixPermissionAndRetryOnce({
        error: error as Error & { stderr?: string },
        command,
        projectRoot,
        encoding,
      });
    }

    throw error;
  }
}

export default runShellCommand;
