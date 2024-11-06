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
      read: `tar -zxOf "${archive}" "*${file}"`,
      exists: `tar -ztf "${archive}" "*${file}"`,
    },
    unzip: {
      read: `unzip -p "${archive}" "${file}"`,
      exists: `unzip -t "${archive}" "${file}"`,
    },
  };

  console.log('accessFileInArchive commands[type][operation]');
  console.log(commands[type][operation]);

  try {
    const { stdout } = await execAsync(commands[type][operation]);

    console.log('accessFileInArchive stdout');
    console.log(stdout);

    return operation === 'exists' ? true : stdout;
  } catch {
    if (operation === 'exists') return false;

    throwError({
      type: 'unexpected',
      message: `Failed to ${operation} file "${file}" in ${type} archive "${archive}"`,
    });
  }
}

export default accessFileInArchive;
