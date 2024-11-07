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
  const tarVersion = type === 'tar' ? await detectTarVersion() : DEFAULT_TAR_VERSION;

  const commands = {
    tar: {
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

  console.log('\n\n=== DEBUG ===');
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

    const isExpectedBsdTarError = type === 'tar' && tarVersion === 'BSD' && error.code === 1;
    const isExpectedGnuTarError = type === 'tar' && tarVersion === 'GNU' && error.code === 2;
    const isExpectedTarError = isExpectedBsdTarError || isExpectedGnuTarError;

    const isExpectedUnzipError = type === 'unzip' && error.code === 11;

    const isExpectedError = isExpectedTarError || isExpectedUnzipError;

    if (!isExpectedError) {
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

const DEFAULT_TAR_VERSION = 'BSD';

async function detectTarVersion(): Promise<'GNU' | 'BSD'> {
  const { stdout } = await execAsync('tar --version');

  return stdout.toUpperCase().includes('GNU') ? 'GNU' : DEFAULT_TAR_VERSION;
}
