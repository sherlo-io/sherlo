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
 * THE ACCEPTING MACHINE HAS NO node_modules. The bundle was built elsewhere, so
 * the machine that accepts it needs the project's dependencies for nothing - it
 * uploads bytes that already exist. Every field below is therefore derived from
 * the CHECKOUT alone (source files, config files, the lockfile) or recorded at
 * emit time and verified at accept time against the checkout. Nothing here reads
 * an installed package unless the project has no lockfile to read instead.
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
import type { GateMetadataInput } from '../../helpers/fingerprint/gateMetadata';
import getPackageVersion from '../../commands/init/requirements/getPackageVersion';
import { readBundledSdkProtocolVersion } from './readBundledSdkProtocolVersion';
import { getExpoSdkVersion, type BundleFormat } from './buildBundle';
import { findLockfile, readLockfilePackages, type PackageVersions } from './lockfilePackages';
import type { RecordedBaseFingerprint } from './recordedBaseFingerprint';

export type { PackageVersions } from './lockfilePackages';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * The schema version. Bump ONLY on a breaking change to the shape below; the
 * acceptor refuses a version it does not know rather than guessing at fields.
 *
 * 2: the dependency closure is read from the lockfile (a version-1 lockfile hash
 *    was over raw bytes, so the same source name means a different number), the
 *    gate metadata and the base fingerprint are recorded, and `engineClass` moved
 *    from the identity into the recorded gate metadata.
 */
export const SIDECAR_VERSION = 2;

/**
 * Where a project's dependency closure was read from.
 *
 * The SOURCE is load-bearing, not decoration. A lockfile set and a package.json
 * hash are different numbers over different inputs, so comparing one against the
 * other is meaningless - two trees that agree perfectly would still "mismatch".
 * Recording the source lets the acceptor refuse a source CHANGE explicitly ("this
 * bundle was resolved from a lockfile, this project has none") instead of
 * reporting a confusing hash difference that hides the real problem.
 */
export type DependencyClosureSource =
  | 'yarn.lock'
  | 'package-lock.json'
  | 'pnpm-lock.yaml'
  | 'node_modules'
  | 'package.json';

export type DependencyClosure = {
  source: DependencyClosureSource;
  hash: string;
  /**
   * The pre-image of `hash`: the exact name -> versions map that was hashed,
   * which is what lets a refusal say WHICH package moved instead of only that
   * the closure did. Present for a lockfile and for an installed tree.
   *
   * `null` for the package.json source - a hash over declared ranges has no
   * resolved per-package pre-image to keep.
   */
  packages: PackageVersions[] | null;
};

/**
 * Everything about the PROJECT that shapes the bundle's bytes.
 *
 * Every field here is compared at accept time and every mismatch is a refusal.
 * A field is `null` when the project genuinely does not have it - never faked, and
 * `null` on both sides matches (two projects that both lack Expo agree about Expo).
 *
 * The toolchain versions are read from the dependency closure when it has a
 * per-package pre-image (a lockfile or an installed tree), and only from the
 * installed package when it does not. A lockfile names the same version on every
 * machine; an installed package exists only where an install ran.
 */
export type SidecarProjectIdentity = {
  reactNativeVersion: string | null;
  expoSdkVersion: string | null;
  requiredSdkProtocolVersion: string | null;
  /** sha256 of the project's babel config bytes - the transform shape. */
  babelConfigDigest: string | null;
  /** The resolved Metro version - the other half of the transform shape. */
  metroVersion: string | null;
  /**
   * Metro INLINES every transitive JS dependency, so any dependency change
   * changes bundle bytes. This is why the closure is a refusal and not a warning.
   */
  dependencyClosure: DependencyClosure;
};

/** One app source file and the digest of its bytes as read from the tree. */
export type AppSourceFileDigest = {
  /** Project-relative path, exactly as the module manifest keys it. */
  path: string;
  /** sha256 of the file's bytes, or `missing` when the tree no longer has it. */
  digest: string;
};

/**
 * A file in the bundle's module graph that a tool WROTE at bundle time, and the
 * files it wrote it from.
 *
 * The Sherlo Metro serializer records these in the module manifest's header
 * (`header.generatedFiles`, keyed like `moduleHashes`). `.rnstorybook/
 * storybook.requires.ts` is the one today: Storybook's requires generator
 * rewrites it on every bundle from the storybook config directory, and projects
 * are told NOT to track it (a tracked copy is rewritten at bundle time, which
 * dirties the tree and drops the build's ancestor). On a machine that never ran a
 * bundler the file does not exist - so its BYTES can never be the thing compared.
 * Its inputs can: they are ordinary tracked files on both machines.
 */
export type GeneratedFile = {
  /** Which generator wrote the file - `storybook-requires` today. */
  generatedBy: string;
  /** Project-relative paths of the files the generator read, sorted. */
  inputs: string[];
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
 * A GENERATED file in the graph is replaced by its inputs (see
 * {@link GeneratedFile}): the generator is a pure function of them, so equal
 * inputs mean an equal generated file, and the inputs exist on a machine where
 * the generator never ran.
 *
 * `node_modules` paths are excluded deliberately: dependency bytes are already
 * covered by {@link DependencyClosure}, and re-reading thousands of files to say
 * the same thing twice would make every accepted bundle pay for nothing.
 */
export type AppSourceClosure = {
  source: 'module-graph';
  /** How many files the digest covers - diagnostics for a refusal. */
  fileCount: number;
  hash: string;
  /**
   * The pre-image of `hash`: the per-file digests it was computed over, in the
   * same order. This is what turns "the source changed" into "these files did".
   */
  files: AppSourceFileDigest[];
};

/**
 * THE PRE-IMAGES ARE WRITTEN DOWN. Both closures keep the list they hashed, and
 * the sidecar file carries those lists: a refusal that says "the dependencies
 * differ" sends the caller hunting through two lockfiles, while one that says
 * `~ react-native 0.76.0 -> 0.77.0` is fixed in one pass. The lists are names,
 * versions and digests only - never file contents - and they cost tens of
 * kilobytes beside a bundle that costs megabytes.
 */
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
   * The source-derived gate metadata the staged road sends to the staged gate,
   * as it was derived beside the bundle at emit time.
   *
   * RECORDED, NOT RE-DERIVED. Deriving it reads the engine class from the app
   * config (a dynamic `app.config.js` needs `expo` installed to evaluate) and the
   * SDK protocol version from the installed SDK. It is a pure function of the
   * project identity above plus the bundle - both of which the acceptor verifies -
   * so once the identity matches, the recorded value is what the acceptor would
   * have derived, had it been able to.
   */
  gateMetadata: GateMetadataInput;
  /**
   * The base fingerprint of the tree the bundle was built from, with a digest of
   * the native inputs it was computed over - null when the emitting machine could
   * not compute one. See ./recordedBaseFingerprint for what the acceptor trusts
   * and why.
   */
  baseFingerprint: RecordedBaseFingerprint | null;
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
export function readProjectIdentity(projectRoot: string): SidecarProjectIdentity {
  const dependencyClosure = computeDependencyClosure(projectRoot);

  return {
    reactNativeVersion:
      resolvedPackageVersion(dependencyClosure, 'react-native') ??
      getPackageVersion('react-native') ??
      null,
    expoSdkVersion: readExpoSdkVersion(projectRoot),
    requiredSdkProtocolVersion:
      resolvedSdkProtocolVersion(dependencyClosure) ??
      readBundledSdkProtocolVersion(projectRoot) ??
      null,
    babelConfigDigest: computeBabelConfigDigest(projectRoot),
    metroVersion:
      resolvedPackageVersion(dependencyClosure, 'metro') ?? readInstalledMetroVersion(projectRoot),
    dependencyClosure,
  };
}

/**
 * The versions the closure resolved for one package, joined when there are
 * several (a monorepo can resolve two Metro versions; both shape the bundle), or
 * null when the closure has no per-package pre-image or does not list it.
 */
export function resolvedPackageVersion(closure: DependencyClosure, name: string): string | null {
  const versions = closure.packages?.find((pkg) => pkg.name === name)?.versions;
  return versions && versions.length > 0 ? versions.join(', ') : null;
}

/**
 * The Sherlo SDK's version names the protocol it implements - the same number
 * `readBundledSdkProtocolVersion` reads off the installed package - so the
 * resolved set already carries it. The SDK is looked up under both the name a
 * project declares it as and the name it is published under, because an aliased
 * install keys it by the former in one lockfile format and the latter in another.
 */
const SDK_PACKAGE_NAMES = ['@sherlo/react-native-storybook', '@sherlo-io/react-native-storybook'];

function resolvedSdkProtocolVersion(closure: DependencyClosure): string | null {
  for (const name of SDK_PACKAGE_NAMES) {
    const version = resolvedPackageVersion(closure, name);
    if (version === null) continue;
    // The base semver only: a `-test.<run>` suffix says how the build was
    // produced, not which protocol it implements (see readBundledSdkProtocolVersion).
    return /^(\d+\.\d+\.\d+)(?:[-+]|$)/.exec(version)?.[1] ?? version;
  }
  return null;
}

/**
 * The project's dependency closure, as a hash plus the source it was read from.
 *
 * PREFERRED SOURCE: THE LOCKFILE. It resolves every package to one version, it is
 * committed, and it reads the same on every machine - including one that never
 * ran an install, which is what a machine accepting a prebuilt bundle is. The
 * platform-conditional packages a lockfile lists but an OS skips at install time
 * are in the set on both sides, so a macOS emit and a Linux accept agree.
 *
 * FALLBACK: THE INSTALLED TREE, for a project with no lockfile at all. It says
 * which versions Metro actually inlined, but only where an install ran and only
 * for the packages this OS installed - so a sidecar that names this source can
 * be accepted only by a machine with a matching install.
 *
 * LAST: the declared ranges in package.json, the weakest statement. The recorded
 * source names which guarantee the hash carries, so neither side has to guess and
 * a source CHANGE refuses explicitly.
 */
export function computeDependencyClosure(projectRoot: string): DependencyClosure {
  const lockfile = findLockfile(projectRoot);
  if (lockfile) {
    const packages = readLockfilePackages(lockfile.filePath, lockfile.name);
    return { source: lockfile.name, hash: hashPackages(packages), packages };
  }

  const installed = readInstalledPackages(projectRoot);
  if (installed) {
    return { source: 'node_modules', hash: hashPackages(installed), packages: installed };
  }

  // No lockfile, no install: hash the DECLARED dependency ranges, sorted so key
  // order in the file can never move the hash.
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

  return {
    source: 'package.json',
    hash: sha256OfString(JSON.stringify(declared)),
    packages: null,
  };
}

/**
 * The hashed form of a package set is the [name, versions] tuple array, derived
 * from the same list the caller retains, so the digest and its pre-image can
 * never describe different things. It is the same form for a lockfile and for an
 * installed tree, so the two sources hash an identical set to an identical digest.
 */
function hashPackages(packages: PackageVersions[]): string {
  const canonical = packages.map(({ name, versions }) => [name, versions]);
  return sha256OfString(JSON.stringify(canonical));
}

/**
 * Every package version actually installed under node_modules, or null when the
 * project has no installed tree to read.
 *
 * KEYED BY PACKAGE NAME, NOT BY PATH, and deliberately so. Two installs of the
 * identical dependency set can hoist packages to different depths, which would make
 * a path-keyed hash report a difference where none exists. A name -> sorted versions
 * map is blind to hoisting and sensitive to exactly the thing that matters: which
 * versions of which packages Metro will find and inline.
 */
function readInstalledPackages(projectRoot: string): PackageVersions[] | null {
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

  return [...versionsByName.keys()].sort().map((name) => ({
    name,
    versions: [...(versionsByName.get(name) as Set<string>)].sort(),
  }));
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
 *
 * A generated file is never read: it stands for its inputs, which are read in its
 * place (see {@link GeneratedFile}). Its absence on a machine that ran no
 * bundler therefore moves nothing, while an edit to any input still does.
 */
export function computeAppSourceClosure({
  projectRoot,
  modulePaths,
  generatedFiles = {},
}: {
  projectRoot: string;
  /** Project-relative source paths, as the module manifest keys them. */
  modulePaths: string[];
  /** The generated files among them, keyed exactly as `modulePaths` names them. */
  generatedFiles?: Record<string, GeneratedFile>;
}): AppSourceClosure {
  const filePaths = new Set<string>();
  for (const modulePath of modulePaths) {
    if (isDependencyPath(modulePath)) continue;

    const generated = generatedFiles[modulePath];
    if (!generated) {
      filePaths.add(modulePath);
      continue;
    }
    for (const input of generated.inputs) {
      if (!isDependencyPath(input)) filePaths.add(input);
    }
  }

  const files: AppSourceFileDigest[] = [...filePaths].sort().map((filePath) => {
    try {
      return {
        path: filePath,
        digest: sha256OfBuffer(fs.readFileSync(path.resolve(projectRoot, filePath))),
      };
    } catch {
      return { path: filePath, digest: 'missing' };
    }
  });

  // The hashed form is the [path, digest] tuple array - kept exactly as it was,
  // and derived here from the same `files` list the caller retains, so the digest
  // and its pre-image can never describe different things.
  const entries = files.map(({ path: filePath, digest }) => [filePath, digest]);

  return {
    source: 'module-graph',
    fileCount: files.length,
    hash: sha256OfString(JSON.stringify(entries)),
    files,
  };
}

function isDependencyPath(modulePath: string): boolean {
  return modulePath.split(/[\\/]/).includes('node_modules');
}

/**
 * The app-source inputs a validated module manifest names: every module path in
 * its graph, and which of them are generated files.
 *
 * Tolerates a manifest with no module map rather than throwing: a serializer that
 * emitted an empty graph is a degraded manifest, not a crash, and the resulting
 * digest simply covers no files. The manifest validator is what judges shape. A
 * `generatedFiles` header entry of the wrong shape is ignored the same way - the
 * file is then digested by its bytes, as it was before the header existed.
 */
export function moduleManifestAppSourceInputs(manifest: {
  parsed: { header: Record<string, unknown>; moduleHashes?: object };
}): { modulePaths: string[]; generatedFiles: Record<string, GeneratedFile> } {
  const generatedFiles: Record<string, GeneratedFile> = {};

  const recorded = manifest.parsed.header.generatedFiles;
  if (recorded && typeof recorded === 'object' && !Array.isArray(recorded)) {
    for (const [filePath, entry] of Object.entries<any>(recorded)) {
      const isWellFormed =
        typeof entry?.generatedBy === 'string' &&
        Array.isArray(entry?.inputs) &&
        entry.inputs.every((input: unknown) => typeof input === 'string');
      if (isWellFormed) {
        generatedFiles[filePath] = { generatedBy: entry.generatedBy, inputs: entry.inputs };
      }
    }
  }

  return { modulePaths: Object.keys(manifest.parsed.moduleHashes ?? {}), generatedFiles };
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

function readInstalledMetroVersion(projectRoot: string): string | null {
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
 * That reader looks at app.json and package.json only - never at an install.
 */
function readExpoSdkVersion(projectRoot: string): string | null {
  const major = getExpoSdkVersion(projectRoot);
  return major === null ? null : String(major);
}

/** The package names this CLI is published under, on any channel. */
const CLI_PACKAGE_NAMES = ['sherlo', '@sherlo-io/cli'];

/**
 * The CLI's own version - it chooses the bundler flags, so it shapes the output.
 *
 * Found by walking UP from this file to the first package.json that names this CLI,
 * because __dirname is at a different depth in the two layouts this code runs in:
 * `src/commands/test` from source, and `dist` after the ncc build (which flattens
 * every module into one file). A fixed number of `..` hops is right in one layout
 * and wrong in the other - and a hop too far in an installed CLI lands on the
 * CONSUMER's package.json, which reported the app's version as the CLI's.
 *
 * Returns null rather than a wrong answer when no such package.json is above us.
 */
export function readCliVersion(): string | null {
  return findCliVersionFrom(__dirname);
}

/** The walk itself, so both layouts can be exercised by a test. */
export function findCliVersionFrom(startDirectory: string): string | null {
  let directory = startDirectory;

  while (true) {
    const manifestPath = path.join(directory, 'package.json');

    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (CLI_PACKAGE_NAMES.includes(manifest?.name)) {
          return typeof manifest.version === 'string' ? manifest.version : null;
        }
      } catch {
        // An unreadable package.json on the way up is not this CLI's - keep walking.
      }
    }

    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
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
    typeof parsed.appSource?.hash !== 'string' ||
    typeof parsed.gateMetadata?.derivedFrom !== 'string' ||
    !('baseFingerprint' in parsed)
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
