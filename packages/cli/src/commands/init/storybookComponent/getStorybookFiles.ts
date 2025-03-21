import fastGlob from 'fast-glob';
import { readFile } from 'fs/promises';
import { getCwd } from '../../../helpers';
import {
  NEW_CALL_WITHOUT_PARAMS,
  OLD_CALL_WITHOUT_PARAMS,
  NEW_IMPORT_PACKAGE_NAME,
} from './constants';

type StorybookFile = {
  filePath: string;
  isUpdated: boolean;
};

async function getStorybookFiles(): Promise<StorybookFile[]> {
  const potentialFiles = await findPotentialFiles();

  const storybookComponentFiles = await getFiles(potentialFiles);

  return storybookComponentFiles;
}

export default getStorybookFiles;

/* ========================================================================== */

async function findPotentialFiles(): Promise<string[]> {
  const entries = await fastGlob(`**/*.{${POSSIBLE_EXTENSIONS.join(',')}}`, {
    cwd: getCwd(),
    ignore: IGNORED_PATTERNS.map((pattern) => `**/${pattern}`),
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    absolute: false,
    objectMode: true,
    stats: true,
    deep: 4,
  });

  return entries
    .filter((entry) => entry.stats?.size && entry.stats.size <= MAX_FILE_SIZE)
    .map((entry) => entry.path);
}

const POSSIBLE_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx'];

const IGNORED_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'build/**',
  'dist/**',
  'coverage/**',
  '__tests__/**',
  '__mocks__/**',
  '*.test.{js,jsx,ts,tsx}',
  '*.spec.{js,jsx,ts,tsx}',
  '*.story.{js,jsx,ts,tsx}',
  '*.stories.{js,jsx,ts,tsx}',
  '*.d.ts',
  '.expo/**',
  '.expo-shared/**',
  'ios/**',
  'android/**',
  'web-build/**',
  '.gradle/**',
  'vendor/**',
];

const MAX_FILE_SIZE = 50 * 1024; // 50KB

async function getFiles(filePaths: string[]): Promise<StorybookFile[]> {
  // We use map + null filtering pattern because Array.filter() doesn't work with async callbacks
  // (it would return array of Promises instead of waiting for their resolution)
  const results = await Promise.all(
    filePaths.map(async (filePath) => {
      const file = await readFile(filePath, 'utf-8');

      if (file.includes(OLD_CALL_WITHOUT_PARAMS)) {
        return {
          filePath,
          isUpdated: false,
        };
      }

      if (file.includes(NEW_IMPORT_PACKAGE_NAME) && file.includes(NEW_CALL_WITHOUT_PARAMS)) {
        return {
          filePath,
          isUpdated: true,
        };
      }

      return null;
    })
  );

  return results.filter((result) => result !== null);
}
