/**
 * THE RESOLVED PACKAGE SET, READ FROM A LOCKFILE.
 *
 * A lockfile is the one statement of "which version of which package" that is
 * the same on every machine: it is committed, it needs no install to read, and it
 * lists every package the project can ever resolve - including the ones a given
 * OS never installs (`@esbuild/darwin-arm64`, `fsevents`, the `lightningcss-*`
 * binaries). An installed `node_modules` tree is the OPPOSITE on both counts: it
 * exists only after an install, and its contents are platform-conditional by
 * construction, so a bundle emitted on macOS and accepted on Linux would compare
 * two different sets and refuse forever.
 *
 * So the dependency closure reads the lockfile first, and this file is the
 * reader. It answers one question per format - name -> the versions the lockfile
 * resolved - and nothing else; it never resolves ranges, never walks a graph, and
 * never needs a package installed.
 *
 * Every parser is line-based and deliberately small. A full YAML or JSON model of
 * a lockfile would carry far more than the two fields read here, and the shapes
 * below have been stable for years:
 *
 *   yarn classic   `"name@range", "name@range2":` followed by `  version "1.2.3"`
 *   yarn berry     `"name@npm:range":` followed by `  version: 1.2.3`
 *   npm v2/v3      `packages["node_modules/<name>"].version`
 *   npm v1         `dependencies[<name>].version`, nested recursively
 *   pnpm v5        `packages:` then `  /name/1.2.3:` (peer suffix after `_`)
 *   pnpm v6+       `packages:` then `  /name@1.2.3:` or `  name@1.2.3:` (peers in `(...)`)
 */
import fs from 'fs';
import path from 'path';

/** One package name and every version of it the closure found, sorted. */
export type PackageVersions = {
  name: string;
  versions: string[];
};

export type LockfileName = 'yarn.lock' | 'package-lock.json' | 'pnpm-lock.yaml';

/**
 * The lockfiles a project can carry, in the order they are looked for. A project
 * has at most one in practice; the order only decides a tie.
 */
const LOCKFILE_NAMES: LockfileName[] = ['yarn.lock', 'package-lock.json', 'pnpm-lock.yaml'];

/**
 * The nearest lockfile at or above `projectRoot`.
 *
 * Walks UP because a monorepo keeps its one lockfile at the workspace root while
 * the app - and its Metro project root - lives in a package directory below it.
 * Stops at the first directory holding any lockfile: that directory's lockfile is
 * the one that resolved this project's dependencies.
 */
export function findLockfile(projectRoot: string): { name: LockfileName; filePath: string } | null {
  let dir = path.resolve(projectRoot);

  for (;;) {
    for (const name of LOCKFILE_NAMES) {
      const filePath = path.join(dir, name);
      if (fs.existsSync(filePath)) return { name, filePath };
    }

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Every package a lockfile resolved, as a sorted name -> sorted versions list.
 *
 * A package that the lockfile keys under two names (an npm alias such as
 * `@sherlo/react-native-storybook@npm:@sherlo-io/react-native-storybook@2.0.2`)
 * is recorded under the name the PROJECT uses - the key - on every format, so a
 * lookup by the name a package.json declares works the same way everywhere.
 */
export function readLockfilePackages(lockfilePath: string, name: LockfileName): PackageVersions[] {
  const text = fs.readFileSync(lockfilePath, 'utf8');

  const versionsByName =
    name === 'yarn.lock'
      ? parseYarnLock(text)
      : name === 'package-lock.json'
        ? parsePackageLock(text)
        : parsePnpmLock(text);

  return [...versionsByName.keys()].sort().map((packageName) => ({
    name: packageName,
    versions: [...(versionsByName.get(packageName) as Set<string>)].sort(),
  }));
}

// ---------------------------------------------------------------------------
// yarn - classic (v1) and berry (v2+), one pass for both
// ---------------------------------------------------------------------------

/**
 * Both yarn formats are a sequence of blocks: an unindented key line naming one
 * or more `name@range` specifiers and ending in `:`, then indented fields. The
 * only two differences that matter here are the field syntax (`version "x"` in
 * classic, `version: x` in berry) and berry's `__metadata` block, which is not a
 * package.
 */
function parseYarnLock(text: string): Map<string, Set<string>> {
  const versionsByName = new Map<string, Set<string>>();

  let blockNames: string[] = [];

  for (const line of text.split('\n')) {
    if (line.length === 0 || line.startsWith('#')) continue;

    const isKeyLine = !/^\s/.test(line) && line.trimEnd().endsWith(':');
    if (isKeyLine) {
      const key = line.trimEnd().slice(0, -1);
      blockNames = key === '__metadata' ? [] : key.split(',').map(packageNameOfSpecifier);
      continue;
    }

    const version = /^ {2}version:?\s+"?([^"\s]+)"?\s*$/.exec(line)?.[1];
    if (version === undefined) continue;

    for (const packageName of blockNames) {
      record(versionsByName, packageName, version);
    }
  }

  return versionsByName;
}

/**
 * The package name in a `name@range` specifier, quoted or not. A scoped name
 * holds its own leading `@`, so the separator is the first `@` AFTER position 0.
 */
function packageNameOfSpecifier(specifier: string): string {
  const unquoted = specifier.trim().replace(/^"|"$/g, '');
  const separator = unquoted.indexOf('@', unquoted.startsWith('@') ? 1 : 0);
  return separator === -1 ? unquoted : unquoted.slice(0, separator);
}

// ---------------------------------------------------------------------------
// npm - package-lock.json v1, v2 and v3
// ---------------------------------------------------------------------------

function parsePackageLock(text: string): Map<string, Set<string>> {
  const versionsByName = new Map<string, Set<string>>();
  const lock = JSON.parse(text);

  // v2 and v3: a flat map keyed by install path. The name is the last path
  // segment after `node_modules/`; entries without one are workspace packages
  // (the project's own code), not dependencies.
  if (lock?.packages && typeof lock.packages === 'object') {
    for (const [installPath, entry] of Object.entries<any>(lock.packages)) {
      const marker = installPath.lastIndexOf('node_modules/');
      if (marker === -1) continue;
      if (typeof entry?.version !== 'string') continue;
      record(versionsByName, installPath.slice(marker + 'node_modules/'.length), entry.version);
    }
    return versionsByName;
  }

  // v1: a tree keyed by name, nested under `dependencies`.
  function walk(dependencies: unknown): void {
    if (!dependencies || typeof dependencies !== 'object') return;
    for (const [packageName, entry] of Object.entries<any>(dependencies)) {
      if (typeof entry?.version === 'string') record(versionsByName, packageName, entry.version);
      walk(entry?.dependencies);
    }
  }
  walk(lock?.dependencies);

  return versionsByName;
}

// ---------------------------------------------------------------------------
// pnpm - pnpm-lock.yaml v5, v6 and v9
// ---------------------------------------------------------------------------

/**
 * Only the `packages:` section is read: its keys name every resolved package.
 * (v9 repeats them under `snapshots:` with peer suffixes; reading both would
 * count nothing new.)
 */
function parsePnpmLock(text: string): Map<string, Set<string>> {
  const versionsByName = new Map<string, Set<string>>();

  let inPackagesSection = false;

  for (const line of text.split('\n')) {
    if (/^\S/.test(line)) {
      inPackagesSection = line.startsWith('packages:');
      continue;
    }
    if (!inPackagesSection) continue;

    const isPackageKey = /^ {2}\S/.test(line) && line.trimEnd().endsWith(':');
    if (!isPackageKey) continue;

    const key = line.trim().slice(0, -1).replace(/^['"]|['"]$/g, '');
    const parsed = parsePnpmPackageKey(key);
    if (parsed) record(versionsByName, parsed.name, parsed.version);
  }

  return versionsByName;
}

/**
 * `/name/1.2.3_peer` (v5), `/name@1.2.3(peer)` (v6) or `name@1.2.3(peer)` (v9).
 * The peer suffix - after `_` or inside `(...)` - is dropped: it says which peers
 * a copy was resolved against, not which version it is.
 */
function parsePnpmPackageKey(key: string): { name: string; version: string } | null {
  const withoutLeadingSlash = key.startsWith('/') ? key.slice(1) : key;
  const withoutPeers = withoutLeadingSlash.replace(/[(_].*$/, '');

  const atSeparator = withoutPeers.indexOf('@', withoutPeers.startsWith('@') ? 1 : 0);
  if (atSeparator !== -1) {
    return { name: withoutPeers.slice(0, atSeparator), version: withoutPeers.slice(atSeparator + 1) };
  }

  const slashSeparator = withoutPeers.lastIndexOf('/');
  if (slashSeparator === -1) return null;
  return {
    name: withoutPeers.slice(0, slashSeparator),
    version: withoutPeers.slice(slashSeparator + 1),
  };
}

// ---------------------------------------------------------------------------

function record(versionsByName: Map<string, Set<string>>, name: string, version: string): void {
  if (!name || !version) return;
  const versions = versionsByName.get(name) ?? new Set<string>();
  versions.add(version);
  versionsByName.set(name, versions);
}
