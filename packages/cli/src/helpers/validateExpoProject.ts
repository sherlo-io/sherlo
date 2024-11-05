import fs from 'fs';
import path from 'path';
import throwError from './throwError';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface ValidateExpoOptions {
  projectRoot?: string;
  minVersion?: {
    major: number;
    errorMessage: (version: string) => string;
  };
}

const EXPO_PACKAGE = 'expo';
const DEPENDENCY_TYPES = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

function parseJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function getExpoVersion(packageJson: PackageJson): string | null {
  for (const type of DEPENDENCY_TYPES) {
    const version = packageJson[type]?.[EXPO_PACKAGE];
    if (version) return version;
  }
  return null;
}

function checkExpoVersion(version: string, minMajorVersion: number): boolean {
  const majorVersion = parseInt(version.split('.')[0], 10);
  return majorVersion >= minMajorVersion;
}

function findPackageJsonWithExpo(startPath: string): PackageJson | null {
  const MAX_DEPTH = 3;
  let currentPath = startPath;

  for (let i = 0; i < MAX_DEPTH; i++) {
    const packageJsonPath = path.join(currentPath, 'package.json');
    const parsedJson = parseJsonFile(packageJsonPath);

    if (parsedJson && typeof parsedJson === 'object' && getExpoVersion(parsedJson as PackageJson)) {
      return parsedJson as PackageJson;
    }

    const parentPath = path.resolve(currentPath, '..');
    if (parentPath === currentPath) break; // Reached the root directory
    currentPath = parentPath;
  }

  return null;
}

export function validateExpoProject({ projectRoot, minVersion }: ValidateExpoOptions = {}): void {
  const startPath = projectRoot || process.cwd();
  const packageJson = findPackageJsonWithExpo(startPath);

  if (!packageJson) {
    throwError({
      message: `${EXPO_PACKAGE} dependency not found in package.json`,
      learnMoreLink: 'TODO: add link to docs',
    });
  }

  const expoVersion = getExpoVersion(packageJson);
  if (!expoVersion) {
    throwError({
      message: `${EXPO_PACKAGE} version not found in package.json`,
      learnMoreLink: 'TODO: add link to docs',
    });
  }

  if (minVersion && !checkExpoVersion(expoVersion, minVersion.major)) {
    throwError({
      message: minVersion.errorMessage(expoVersion),
      learnMoreLink: 'TODO: add link to docs',
    });
  }
}
