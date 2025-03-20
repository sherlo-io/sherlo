import runShellCommand from '../../../runShellCommand';
import throwError from '../../../throwError';

type Options = ReadOptions | ExistsOptions;
type BaseOptions = {
  archive: string;
  file: string;
  type: 'tar' | 'unzip';
  projectRoot: string;
};
type ReadOptions = BaseOptions & { operation: 'read' };
type ExistsOptions = BaseOptions & { operation: 'exists' };

async function accessFileInArchive(options: ReadOptions): Promise<string | undefined>;
async function accessFileInArchive(options: ExistsOptions): Promise<boolean>;
async function accessFileInArchive({
  archive,
  file,
  type,
  operation,
  projectRoot,
}: Options): Promise<string | undefined | boolean> {
  const tarVersion = await detectTarVersion(projectRoot);

  try {
    const command = await getCommand({ type, operation, tarVersion, archive, file });
    const result = await runShellCommand({ command, projectRoot });

    if (operation === 'exists') {
      return true;
    } else if (operation === 'read') {
      return result;
    }
  } catch (error) {
    if (isUnexpectedError({ type, error, tarVersion })) {
      throwError({ type: 'unexpected', error });
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

async function detectTarVersion(projectRoot: string): Promise<TarVersion> {
  const result = await runShellCommand({ command: 'tar --version', projectRoot });

  return result.toUpperCase().includes('GNU') ? 'GNU' : DEFAULT_TAR_VERSION;
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
  // https://man.openbsd.org/tar.1#EXIT_STATUS
  const isExpectedBsdTarError = type === 'tar' && tarVersion === 'BSD' && error.code === 1;

  // https://man7.org/linux/man-pages/man1/tar.1.html#RETURN_VALUE
  const isExpectedGnuTarError = type === 'tar' && tarVersion === 'GNU' && error.code === 2;

  const isExpectedTarError = isExpectedBsdTarError || isExpectedGnuTarError;

  // https://linux.die.net/man/1/unzip
  const isExpectedUnzipError = type === 'unzip' && error.code === 11;

  const isExpectedError = isExpectedTarError || isExpectedUnzipError;

  return isExpectedError === false;
}
