import { exec } from 'child_process';
import { promisify } from 'util';
import throwError from '../throwError';

type Options = ReadOptions | ExistsOptions;
type ReadOptions = BaseOptions & { operation: 'read' };
type ExistsOptions = BaseOptions & { operation: 'exists' };

type BaseOptions = {
  archive: string;
  file: string;
  type: 'tar' | 'unzip';
};

const execAsync = promisify(exec);

function accessFileInArchive(options: ReadOptions): Promise<string>;
function accessFileInArchive(options: ExistsOptions): Promise<boolean>;
async function accessFileInArchive({
  archive,
  file,
  type,
  operation,
}: Options): Promise<string | boolean> {
  const commands = {
    tar: {
      /**
       * Extracts file content to stdout:
       * - --to-stdout: Write extracted files to stdout (works on GNU/BSD tar)
       * - -xf: Extract from archive file
       * - $(tar -tf): List all files and pipe to grep to find exact path
       * - grep -F: Treat pattern as fixed string, not regex
       */
      read: `tar --to-stdout -xf "${archive}" $(tar -tf "${archive}" | grep -F "${file}")`,

      /**
       * Checks if file exists in archive:
       * - -tf: List all files in archive
       * - grep -F: Treat pattern as fixed string
       * - -q: Quiet mode (no output, just exit code)
       * - --: Marks end of options to handle filenames starting with dash
       */
      exists: `tar -tf "${archive}" | grep -F -q -- "${file}"`,
    },
    unzip: {
      read: `unzip -p "${archive}" "${file}"`,
      exists: `unzip -t "${archive}" "${file}"`,
    },
  };

  try {
    const { stdout } = await execAsync(commands[type][operation]);

    return operation === 'exists' ? true : stdout;
  } catch (error) {
    if (operation === 'exists') return false;

    throwError({
      type: 'unexpected',
      message: error.message,
    });
  }
}

export default accessFileInArchive;
