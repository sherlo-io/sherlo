/**
 * THE BUNDLE SIDECAR - the one fact a Metro bundle cannot carry about itself.
 *
 * `sherlo test --bundle-dir <dir>` accepts a bundle somebody else built. That is
 * only safe if the CLI can tell a RIGHT bundle from a WRONG one, and a plain-JS
 * Metro bundle carries no platform marker, no RN version, no app identity and no
 * commit. The filename `bundle.<platform>.js` is a CLI convention, not evidence:
 * an Android bundle handed in as the iOS one would upload, run, and fail on device
 * as a product bug. Nothing in the bundle bytes can catch that.
 *
 * So the missing fact is WRITTEN DOWN at bundle time rather than pretended to be
 * derivable. `--emit-bundle-dir` records, beside each bundle, the platform it was
 * built for and the project identity it was built from; `--bundle-dir` re-derives
 * every one of those fields from the CURRENT project and refuses on any mismatch,
 * naming each mismatched field. This mirrors how the e2e harness already validates
 * its prebuilt native binary (a `fingerprint.txt` beside the artifact, hard-failing
 * on mismatch) - one mechanism, both artifacts.
 *
 * ONE STRUCT, ONE WRITER, ONE READER. The producer and the acceptor are the same
 * code reading and writing this schema. A second implementation on either side is
 * a drift bug waiting to happen, and would defeat the whole point: the sidecar is
 * trustworthy only because the thing that checks it is the thing that wrote it.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Platform } from '@sherlo/api-types';
import { deriveEngineClass } from '../../helpers/fingerprint/gateMetadata';
import getPackageVersion from '../../commands/init/requirements/getPackageVersion';
import { readBundledSdkProtocolVersion } from './readBundledSdkProtocolVersion';
import { getExpoSdkVersion, type BundleFormat } from './buildBundle';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * The schema version. Bump ONLY on a breaking change to the shape below; the
 * acceptor refuses a version it does not know rather than guessing at fields.
 */
export const SIDECAR_VERSION = 1;

/**
 * Where a project's dependency closure was read from.
 *
 * The SOURCE is load-bearing, not decoration. A lockfile hash and a package.json
 * hash are different numbers over different bytes, so comparing one against the
 * other is meaningless - two trees that agree perfectly would still "mismatch".
 * Recording the source lets the acceptor refuse a source CHANGE explicitly ("this
 * bundle was resolved from a lockfile, this project has none") instead of
 * reporting a confusing hash difference that hides the real problem.
 */
export type DependencyClosureSource =
  | 'node_modules'
  | 'yarn.lock'
  | 'package-lock.json'
  | 'pnpm-lock.yaml'
  | 'package.json';

export type DependencyClosure = {
  source: DependencyClosureSource;
  hash: string;
};

/**
 * Everything about the PROJECT that shapes the bundle's bytes.
 *
 * Every field here is compared at accept time and every mismatch is a refusal.
 * A field is `null` when the project genuinely does not have it - never faked, and
 * `null` on both sides matches (two projects that both lack Expo agree about Expo).
 */
export type SidecarProjectIdentity = {
  reactNativeVersion: string | null;
  expoSdkVersion: string | null;
  requiredSdkProtocolVersion: string | null;
  engineClass: string | null;
  /** sha256 of the project's babel config bytes - the transform shape. */
  babelConfigDigest: string | null;
  /** The installed Metro version - the other half of the transform shape. */
  metroVersion: string | null;
  /**
   * Metro INLINES every transitive JS dependency, so any dependency change
   * changes bundle bytes. This is why the closure is a refusal and not a warning.
   */
  dependencyClosure: DependencyClosure;
};

/**
 * A digest of the APP'S OWN SOURCE, as the bundle's module graph names it.
 *
 * This closes the one hole nothing else here can see. Every other field answers
 * "was this bundle built for this project?" - none of them answers "was it built
 * from this project's CURRENT code". Edit a screen and rebuild nothing: the
 * platform still matches, the dependencies still match, the toolchain still
 * matches, the manifest is still valid. The run goes green having captured the
 * screens as they were BEFORE the edit, which is worse than a loud failure -
 * the change you were testing for is precisely the thing that silently vanished.
 *
 * The module manifest already lists every source file in the bundle's graph, so
 * the file list is free. The digest is over the raw bytes of those files, read
 * from disk - not over the serializer's own module hashes, which are hashes of
 * TRANSFORMED output and so cannot be recomputed without running a bundler,
 * which would defeat the entire point of supplying a bundle.
 *
 * `node_modules` paths are excluded deliberately: dependency bytes are already
 * covered by {@link DependencyClosure}, and re-reading thousands of files to say
 * the same thing twice would make every accepted bundle pay for nothing.
 */
export type AppSourceClosure = {
  source: 'module-graph';
  /** How many app source files the digest covers - diagnostics for a refusal. */
  fileCount: number;
  hash: string;
};

export type BundleSidecar = {
  sidecarVersion: number;
  platform: Platform;
  bundle: {
    file: string;
    sha256: string;
    sizeBytes: number;
    format: BundleFormat;
    bundler: 'expo' | 'rn';
    entryFile: string;
  };
  assets: {
    /** null when the app produced no assets at all. */
    dir: string | null;
    inventory: string[];
  };
  moduleManifest: {
    file: string;
    sha256: string;
  };
  project: SidecarProjectIdentity;
  /** The app's own source, as the bundle's module graph saw it. */
  appSource: AppSourceClosure;
  /**
   * The native shell this bundle was built beside, when known.
   *
   * RECORDED AND COMPARED, BUT NEVER A REFUSAL. A bundle does not depend on the
   * native shell - only the PAIRING does, and `checkStagedGate` already judges
   * pairing on every run. Refusing here would throw away a perfectly good supplied
   * bundle on a native-only change, which is exactly the waste that keeping the
   * native and JS caches independent exists to prevent.
   */
  nativeFingerprint: string | null;
  createdAt: string;
  createdBy: { cliVersion: string | null };
};

// ---------------------------------------------------------------------------
// The directory layout
// ---------------------------------------------------------------------------

/**
 * The four files a supplied directory holds per platform.
 *
 * FLAT, with the platform in the FILENAME rather than in a subdirectory, so one
 * directory carries android and ios without a merge step and each platform's slot
 * can be produced, cached and fetched independently of the other.
 */
export function bundleFileName(platform: Platform): string {
  return `bundle.${platform}.js`;
}

export function assetsDirName(platform: Platform): string {
  return `assets.${platform}`;
}

export function moduleManifestFileName(platform: Platform): string {
  return `module-manifest.${platform}.json`;
}

export function sidecarFileName(platform: Platform): string {
  return `bundle-sidecar.${platform}.json`;
}

// ---------------------------------------------------------------------------
// Project identity - the ONE reader, used at emit AND at accept
// ---------------------------------------------------------------------------

/**
 * Read the current project's identity.
 *
 * Called by the producer to WRITE the sidecar and by the acceptor to CHECK it, so
 * the two sides can never disagree about how a field is computed. If this function
 * is wrong, it is wrong identically on both sides and the comparison still holds -
 * which is precisely the property a parallel implementation would destroy.
 */
export async function readProjectIdentity({
  projectRoot,
  platform,
}: {
  projectRoot: string;
  platform: Platform;
}): Promise<SidecarProjectIdentity> {
  return {
    reactNativeVersion: getPackageVersion('react-native') ?? null,
    expoSdkVersion: readExpoSdkVersion(projectRoot),
    requiredSdkProtocolVersion: readBundledSdkProtocolVersion(projectRoot) ?? null,
    engineClass: (await deriveEngineClass({ platform, projectRoot })) ?? null,
    babelConfigDigest: computeBabelConfigDigest(projectRoot),
    metroVersion: readMetroVersion(projectRoot),
    dependencyClosure: computeDependencyClosure(projectRoot),
  };
}

/**
 * The project's dependency closure, as a hash plus the source it was read from.
 *
 * PREFERRED SOURCE: the INSTALLED tree. Metro inlines the dependency bytes that
 * are actually on disk, so what shapes the bundle is the RESOLVED closure, not the
 * declared one. A tree that installs mutably from floating ranges can resolve a
 * newer patch between one install and the next while its package.json never moves -
 * a real difference in inlined bytes that a declared-range hash cannot see. Hashing
 * the installed tree closes that hole, and costs one pass over node_modules.
 *
 * A lockfile is the next best statement, and the declared ranges in package.json
 * the weakest. The recorded source names which guarantee this hash actually carries,
 * so neither side has to guess and a source CHANGE refuses explicitly.
 */
export function computeDependencyClosure(projectRoot: string): DependencyClosure {
  const installed = hashInstalledClosure(projectRoot);
  if (installed) return { source: 'node_modules', hash: installed };

  const lockfiles: DependencyClosureSource[] = ['yarn.lock', 'package-lock.json', 'pnpm-lock.yaml'];

  for (const source of lockfiles) {
    const lockfilePath = path.join(projectRoot, source);
    try {
      const bytes = fs.readFileSync(lockfilePath);
      return { source, hash: sha256OfBuffer(bytes) };
    } catch {
      // Not this one - try the next.
    }
  }

  // No lockfile: hash the DECLARED dependency ranges, sorted so key order in the
  // file can never move the hash.
  let declared: [string, string][] = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    const merged: Record<string, unknown> = {
      ...(pkg?.dependencies ?? {}),
      ...(pkg?.devDependencies ?? {}),
    };
    declared = Object.keys(merged)
      .sort()
      .map((name) => [name, String(merged[name])]);
  } catch {
    // An unreadable package.json hashes as an empty closure. The comparison still
    // works (both sides read it the same way); it simply carries less information.
  }

  return { source: 'package.json', hash: sha256OfString(JSON.stringify(declared)) };
}

/**
 * Hash every package version actually installed under node_modules, or null when
 * the project has no installed tree to read.
 *
 * KEYED BY PACKAGE NAME, NOT BY PATH, and deliberately so. Two installs of the
 * identical dependency set can hoist packages to different depths, which would make
 * a path-keyed hash report a difference where none exists. A name -> sorted versions
 * map is blind to hoisting and sensitive to exactly the thing that matters: which
 * versions of which packages Metro will find and inline.
 */
function hashInstalledClosure(projectRoot: string): string | null {
  const modulesRoot = path.join(projectRoot, 'node_modules');
  if (!fs.existsSync(modulesRoot)) return null;

  /** package name -> the set of installed versions of it, anywhere in the tree. */
  const versionsByName = new Map<string, Set<string>>();

  function record(packageDir: string): void {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
      if (typeof pkg?.name !== 'string' || typeof pkg?.version !== 'string') return;
      const versions = versionsByName.get(pkg.name) ?? new Set<string>();
      versions.add(pkg.version);
      versionsByName.set(pkg.name, versions);
    } catch {
      // A package without a readable manifest contributes nothing. It is also not
      // something Metro can resolve, so silence is the honest result.
    }
  }

  function walkModulesDir(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name === '.bin' || entry.name === '.cache') continue;

      const entryPath = path.join(dir, entry.name);

      if (entry.name.startsWith('@')) {
        // A scope directory holds packages, not a package.
        let scoped: fs.Dirent[];
        try {
          scoped = fs.readdirSync(entryPath, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const scopedEntry of scoped) {
          const scopedPath = path.join(entryPath, scopedEntry.name);
          record(scopedPath);
          walkNested(scopedPath);
        }
        continue;
      }

      record(entryPath);
      walkNested(entryPath);
    }
  }

  function walkNested(packageDir: string): void {
    const nested = path.join(packageDir, 'node_modules');
    if (fs.existsSync(nested)) walkModulesDir(nested);
  }

  walkModulesDir(modulesRoot);
  if (versionsByName.size === 0) return null;

  const canonical = [...versionsByName.keys()].sort().map((name) => {
    const versions = [...(versionsByName.get(name) as Set<string>)].sort();
    return [name, versions];
  });

  return sha256OfString(JSON.stringify(canonical));
}

/**
 * Digest the app source files a module manifest names, read from the CURRENT tree.
 *
 * The ONE computation, run at emit and again at accept, so the two sides cannot
 * disagree about how it is derived. At accept the file LIST comes from the
 * supplied manifest (it describes the bundle that was built) while the BYTES come
 * from the working tree - which is exactly the comparison that catches a bundle
 * built before the code was edited.
 *
 * A file the manifest names but the tree no longer has is recorded as missing
 * rather than skipped: a deleted screen must move the digest, or deleting one
 * would be the single edit this check cannot see.
 */
export function computeAppSourceClosure({
  projectRoot,
  modulePaths,
}: {
  projectRoot: string;
  /** Project-relative source paths, as the module manifest keys them. */
  modulePaths: string[];
}): AppSourceClosure {
  const appPaths = modulePaths
    .filter((modulePath) => !modulePath.split(/[\\/]/).includes('node_modules'))
    .sort();

  const entries = appPaths.map((modulePath) => {
    try {
      return [modulePath, sha256OfBuffer(fs.readFileSync(path.resolve(projectRoot, modulePath)))];
    } catch {
      return [modulePath, 'missing'];
    }
  });

  return {
    source: 'module-graph',
    fileCount: appPaths.length,
    hash: sha256OfString(JSON.stringify(entries)),
  };
}

/** The source paths a validated module manifest names. */
export function moduleManifestSourcePaths(manifest: {
  parsed: { moduleHashes: object };
}): string[] {
  return Object.keys(manifest.parsed.moduleHashes);
}

/** sha256 of the project's babel config bytes, or null when it has none. */
function computeBabelConfigDigest(projectRoot: string): string | null {
  const candidates = [
    'babel.config.js',
    'babel.config.json',
    'babel.config.cjs',
    'babel.config.mjs',
    '.babelrc',
    '.babelrc.js',
    '.babelrc.json',
  ];

  for (const candidate of candidates) {
    try {
      return sha256OfBuffer(fs.readFileSync(path.join(projectRoot, candidate)));
    } catch {
      // Not this one - try the next.
    }
  }

  return null;
}

function readMetroVersion(projectRoot: string): string | null {
  try {
    const pkgPath = require.resolve('metro/package.json', { paths: [projectRoot] });
    const version = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))?.version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

/**
 * The Expo SDK major, as a string.
 *
 * Delegates to the reader the bundling road already uses, so the version recorded
 * in a sidecar is by construction the same number the version-floor refusal reads.
 */
function readExpoSdkVersion(projectRoot: string): string | null {
  const major = getExpoSdkVersion(projectRoot);
  return major === null ? null : String(major);
}

/** The CLI's own version - it chooses the bundler flags, so it shapes the output. */
export function readCliVersion(): string | null {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf8')
    );
    return typeof pkg?.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reading a sidecar back
// ---------------------------------------------------------------------------

/**
 * Parse a sidecar file.
 *
 * Returns a MESSAGE rather than throwing, so the caller can fold it into the one
 * refusal that names every problem at once. Only the fields the acceptor actually
 * branches on are shape-checked here; the field-by-field comparison is where the
 * interesting refusals come from.
 */
export function parseBundleSidecar(
  sidecarPath: string
): { ok: true; sidecar: BundleSidecar } | { ok: false; message: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(sidecarPath, 'utf8');
  } catch {
    return { ok: false, message: `the sidecar could not be read at ${sidecarPath}` };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: `the sidecar at ${sidecarPath} is not valid JSON` };
  }

  if (parsed?.sidecarVersion !== SIDECAR_VERSION) {
    return {
      ok: false,
      message:
        `the sidecar at ${sidecarPath} declares version ${String(parsed?.sidecarVersion)}, ` +
        `but this CLI understands version ${SIDECAR_VERSION}. ` +
        'Re-emit the bundle directory with this version of the CLI.',
    };
  }

  if (
    !parsed.platform ||
    !parsed.bundle?.file ||
    typeof parsed.bundle?.sha256 !== 'string' ||
    !parsed.moduleManifest?.file ||
    typeof parsed.moduleManifest?.sha256 !== 'string' ||
    !parsed.project?.dependencyClosure?.source ||
    typeof parsed.appSource?.hash !== 'string'
  ) {
    return {
      ok: false,
      message: `the sidecar at ${sidecarPath} is missing required fields`,
    };
  }

  return { ok: true, sidecar: parsed as BundleSidecar };
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export function sha256OfBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sha256OfString(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256OfFile(filePath: string): string {
  return sha256OfBuffer(fs.readFileSync(filePath));
}
