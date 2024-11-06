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

function accessFileInArchive(options: ReadOptions): Promise<string | undefined>;
function accessFileInArchive(options: ExistsOptions): Promise<boolean>;
async function accessFileInArchive({
  archive,
  file,
  type,
  operation,
}: Options): Promise<string | undefined | boolean> {
  const tarVersion = await detectTarVersion();

  const commands = {
    tar: {
      // read: `tar -tf "${archive}" | grep -F "${file}" | xargs -I {} tar -xOf "${archive}" "{}"`,
      read:
        tarVersion === 'BSD'
          ? `tar -xOf "${archive}" "*${file}"`
          : `tar --wildcards -xOf "${archive}" "*${file}"`,
      exists:
        tarVersion === 'BSD'
          ? `tar -tf "${archive}" "*${file}"`
          : `tar --wildcards -tf "${archive}" "*${file}"`,
    },
    unzip: {
      read: `unzip -p "${archive}" "${file}"`,
      exists: `unzip -t "${archive}" "${file}"`,
    },
  };

  console.log('=== DEBUG ===');
  console.log('Tar version:', tarVersion);
  console.log('Operation:', operation);
  console.log('Archive:', archive);
  console.log('File:', file);
  console.log('Command:', commands[type][operation]);

  try {
    const { stdout, stderr } = await execAsync(commands[type][operation]);
    console.log('Command succeeded');
    console.log('Stdout length:', stdout?.length);
    console.log('Stderr:', stderr);

    return operation === 'exists' ? true : stdout;
  } catch (error) {
    console.log('Command failed');
    console.log('Error code:', error.code);
    console.log('Error message:', error.message);

    const isUnexpectedTarError = type === 'tar' && error.code !== 1;
    const isUnexpectedUnzipError = type === 'unzip' && error.code !== 11;

    if (isUnexpectedTarError || isUnexpectedUnzipError) {
      throwError({
        type: 'unexpected',
        message: error.message,
      });
    }

    if (operation === 'exists') return false;
    return undefined;
  }
}

export default accessFileInArchive;

/* ========================================================================== */

async function detectTarVersion() {
  const defaultTarVersion = 'BSD';

  const { stdout } = await execAsync('tar --version');

  return stdout.toLowerCase().includes('GNU') ? 'GNU' : defaultTarVersion;
}
