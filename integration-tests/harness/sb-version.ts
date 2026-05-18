import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const INTEGRATION_TESTS_DIR = path.resolve(__dirname, '..');
const APPS_DIR = path.join(INTEGRATION_TESTS_DIR, 'apps');
const SB_VERSIONS_DIR = path.join(INTEGRATION_TESTS_DIR, 'sb-versions');

export type SbVersion = 'sb10' | 'sb9' | 'sb8';
export const ALL_SB_VERSIONS: readonly SbVersion[] = ['sb10', 'sb9', 'sb8'];

function appDir(appName: string): string {
  return path.join(APPS_DIR, appName);
}

function pkgJsonPath(appName: string): string {
  return path.join(appDir(appName), 'package.json');
}

const STORYBOOK_PKG_PREFIXES = ['@storybook/', 'storybook'];

function isStorybookDep(name: string): boolean {
  return STORYBOOK_PKG_PREFIXES.some(prefix => name.startsWith(prefix));
}

function runStorybookGenerate(appName: string): void {
  const dir = appDir(appName);
  const pkg = JSON.parse(readFileSync(pkgJsonPath(appName), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const scripts = pkg.scripts ?? {};
  const scriptName = ['storybook-generate', 'storybook:generate', 'sb-rn-get-stories'].find(
    s => s in scripts,
  );
  if (!scriptName) {
    throw new Error(`No storybook generator script found in '${appName}' package.json scripts`);
  }
  execFileSync('yarn', [scriptName], { cwd: dir, stdio: 'inherit' });
}

export function applySbVersion(appName: string, sbVersion: SbVersion): void {
  const overlayDir = path.join(SB_VERSIONS_DIR, sbVersion);
  const partialPath = path.join(overlayDir, 'package.json.partial');
  const mainTsSrc = path.join(overlayDir, '.rnstorybook', 'main.ts');

  if (!existsSync(overlayDir)) {
    throw new Error(`sb-version overlay not found: ${overlayDir}`);
  }

  // Merge @storybook/* deps from partial into the app's package.json
  const appPkg = JSON.parse(readFileSync(pkgJsonPath(appName), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const partial = JSON.parse(readFileSync(partialPath, 'utf8')) as {
    dependencies?: Record<string, string>;
  };

  appPkg.dependencies = {
    ...appPkg.dependencies,
    ...(partial.dependencies ?? {}),
  };
  writeFileSync(pkgJsonPath(appName), JSON.stringify(appPkg, null, 2) + '\n');

  // Copy main.ts overlay
  const destMainTs = path.join(appDir(appName), '.rnstorybook', 'main.ts');
  mkdirSync(path.dirname(destMainTs), { recursive: true });
  copyFileSync(mainTsSrc, destMainTs);

  // Install deps (including the newly added @storybook/* packages)
  execFileSync('yarn', ['install'], {
    cwd: appDir(appName),
    stdio: 'inherit',
    env: { ...process.env, YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' },
  });

  // Generate storybook.requires.ts
  runStorybookGenerate(appName);
}

export function resetSbVersion(appName: string): void {
  // Remove @storybook/* deps from package.json
  const pkgPath = pkgJsonPath(appName);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  if (pkg.dependencies) {
    for (const name of Object.keys(pkg.dependencies)) {
      if (isStorybookDep(name)) {
        delete pkg.dependencies[name];
      }
    }
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // Remove main.ts
  const mainTs = path.join(appDir(appName), '.rnstorybook', 'main.ts');
  if (existsSync(mainTs)) unlinkSync(mainTs);

  // Remove generated storybook.requires.ts
  const requires = path.join(appDir(appName), '.rnstorybook', 'storybook.requires.ts');
  if (existsSync(requires)) unlinkSync(requires);
}
