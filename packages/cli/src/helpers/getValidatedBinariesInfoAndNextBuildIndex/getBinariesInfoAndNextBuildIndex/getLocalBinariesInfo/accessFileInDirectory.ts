import fs from 'fs';
import path from 'path';
import throwError from '../../../throwError';

type Options = ReadOptions | ExistsOptions;
type ReadOptions = BaseOptions & { operation: 'read' };
type ExistsOptions = BaseOptions & { operation: 'exists' };

type BaseOptions = {
  directory: string;
  file: string;
};

function accessFileInDirectory(options: ReadOptions): Promise<string>;
function accessFileInDirectory(options: ExistsOptions): Promise<boolean>;
async function accessFileInDirectory({
  directory,
  file,
  operation,
}: Options): Promise<string | boolean> {
  const filePath = path.join(directory, file);

  try {
    if (operation === 'exists') {
      await fs.promises.access(filePath);
      return true;
    }

    const content = await fs.promises.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    if (operation === 'exists') return false;

    throwError({ type: 'unexpected', error });
  }
}

export default accessFileInDirectory;
