import { readFile, writeFile } from 'fs/promises';
import { throwError } from '../../../helpers';
import {
  NEW_CALL_WITH_PARAMS,
  NEW_CALL_WITHOUT_PARAMS,
  NEW_IMPORT,
  OLD_CALL_WITH_PARAMS,
  OLD_CALL_WITHOUT_PARAMS,
} from './constants';

async function updateStorybookFiles(filePaths: string[]): Promise<void> {
  await Promise.all(filePaths.map((filePath) => updateFile(filePath)));
}

export default updateStorybookFiles;

/* ========================================================================== */

async function updateFile(filePath: string): Promise<void> {
  let file;

  try {
    file = await readFile(filePath, 'utf-8');
  } catch (error) {
    throwError({ type: 'unexpected', error });
  }

  const quoteChar = file.includes('from "') ? '"' : "'";

  // Add new import at the top
  file = NEW_IMPORT.replaceAll('"', quoteChar) + '\n' + file;

  // Replace function calls
  file = file
    .replace(OLD_CALL_WITH_PARAMS, NEW_CALL_WITH_PARAMS)
    .replace(OLD_CALL_WITHOUT_PARAMS, NEW_CALL_WITHOUT_PARAMS);

  try {
    await writeFile(filePath, file);
  } catch (error) {
    throwError({ type: 'unexpected', error });
  }
}
