import { exec } from 'child_process';
import { promisify } from 'util';
import throwError from '../throwError';

type Options = ReadOptions | ExistsOptions;
type BaseOptions = {
  archive: string;
  file: string;
  type: 'tar' | 'unzip';
};
type ReadOptions = BaseOptions & { operation: 'read' };
type ExistsOptions = BaseOptions & { operation: 'exists' };

function accessFileInArchive(options: ReadOptions): Promise<string | undefined>;
function accessFileInArchive(options: ExistsOptions): Promise<boolean>;
async function accessFileInArchive({
  archive,
  file,
  type,
  operation,
}: Options): Promise<string | undefined | boolean> {
  const tarVersion = await detectTarVersion();

  try {
    const command = await getCommand({ type, operation, tarVersion, archive, file });
    const { stdout } = await execAsync(command);

    if (operation === 'exists') {
      return true;
    } else if (operation === 'read') {
      return stdout;
    }
  } catch (error) {
    if (isUnexpectedError({ type, error, tarVersion })) {
      throwError({
        type: 'unexpected',
        message: error.message,
      });
    }

    if (operation === 'exists') {
      return false;
    } else if (operation === 'read') {
      return undefined;
    }
  }
}

export default accessFileInArchive;

/* ========================================================================== */

type TarVersion = 'GNU' | 'BSD';

const DEFAULT_TAR_VERSION = 'BSD';

// TODO: czy to musi byc asynchroniczne? Nie mozemy tutaj uzyc runShellCommand?
// TODO: projectRoot? (chyba niepotrzebne - bo juz dzialamy na pliku z uwzglednieniem projectRoot?)
const execAsync = promisify(exec);

async function detectTarVersion(): Promise<TarVersion> {
  const { stdout } = await execAsync('tar --version');

  return stdout.toUpperCase().includes('GNU') ? 'GNU' : DEFAULT_TAR_VERSION;
}

async function getCommand({
  archive,
  file,
  operation,
  tarVersion,
  type,
}: Pick<Options, 'archive' | 'file' | 'operation' | 'type'> & {
  tarVersion: TarVersion;
}): Promise<string> {
  const commands = {
    unzip: {
      read: `unzip -p "${archive}" "${file}"`,
      exists: `unzip -t "${archive}" "${file}"`,
    },
    tar: await getTarCommands({ archive, file, tarVersion }),
  };

  return commands[type][operation];
}

async function getTarCommands({
  archive,
  file,
  tarVersion,
}: Pick<Options, 'archive' | 'file'> & { tarVersion: TarVersion }): Promise<{
  read: string;
  exists: string;
}> {
  const useWildcards = tarVersion === 'BSD' ? '' : '--wildcards ';

  return {
    read: `tar ${useWildcards}-xOf "${archive}" "*${file}"`,
    exists: `tar ${useWildcards}-tf "${archive}" "*${file}"`,
  };
}

function isUnexpectedError({
  error,
  tarVersion,
  type,
}: Pick<Options, 'type'> & {
  error: { code: number };
  tarVersion: TarVersion;
}): boolean {
  const isExpectedBsdTarError = type === 'tar' && tarVersion === 'BSD' && error.code === 1;
  const isExpectedGnuTarError = type === 'tar' && tarVersion === 'GNU' && error.code === 2;
  const isExpectedTarError = isExpectedBsdTarError || isExpectedGnuTarError;

  const isExpectedUnzipError = type === 'unzip' && error.code === 11;

  const isExpectedError = isExpectedTarError || isExpectedUnzipError;

  return isExpectedError === false;
}
