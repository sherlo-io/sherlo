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

function accessFileInArchive(options: ReadOptions): Promise<string | undefined>;
function accessFileInArchive(options: ExistsOptions): Promise<boolean>;
async function accessFileInArchive({
  archive,
  file,
  type,
  operation,
  projectRoot,
}: Options): Promise<string | undefined | boolean> {
  const tarVersion = await detectTarVersion(projectRoot);

  console.log(
    '[DEBUG] accessFileInArchive - Attempting to',
    operation,
    'file:',
    file,
    'from archive:',
    archive,
    'using',
    type
  );

  try {
    const command = await getCommand({ type, operation, tarVersion, archive, file });
    console.log('[DEBUG] accessFileInArchive - Executing command:', command);

    const result = await runShellCommand({ command, projectRoot });

    if (operation === 'exists') {
      return true;
    } else if (operation === 'read') {
      return result;
    }
  } catch (error) {
    console.error('[DEBUG] Error in accessFileInArchive:', error.message || error, error.status);

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
  const result = runShellCommand({ command: 'tar --version', projectRoot });

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
  error: { status: number };
  tarVersion: TarVersion;
}): boolean {
  const isExpectedBsdTarError = type === 'tar' && tarVersion === 'BSD' && error.status === 1;
  const isExpectedGnuTarError = type === 'tar' && tarVersion === 'GNU' && error.status === 2;
  const isExpectedTarError = isExpectedBsdTarError || isExpectedGnuTarError;

  const isExpectedUnzipError = type === 'unzip' && error.status === 11;

  const isExpectedError = isExpectedTarError || isExpectedUnzipError;

  return isExpectedError === false;
}
