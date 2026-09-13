/**
 * The diff between two fingerprint documents - WHAT changed, per layer.
 *
 * Pure: two documents in, a delta out. No file system, no server, no project.
 * `sherlo fingerprint --baseline` is one caller; a baseline fetched from
 * anywhere else can be diffed by the same function.
 *
 * A layer is CHANGED exactly when its digest differs (a null digest counts as a
 * value, so "computed before, not computed now" is a change). The entries under
 * it explain the change from the pre-image:
 *
 *   - packages (resolved, autolinked): per package, `~ name old -> new`,
 *     `+ name version`, `- name version`.
 *   - files (app source, lockfiles, native file/dir sources): per path, with the
 *     digest on each side. Never the contents. A generated app source file is
 *     listed as its inputs, so the entry names the input that changed.
 *   - a `contents`-type native source: `~ <id>` and nothing finer, by design -
 *     its value is never retained anywhere.
 */
import type {
  FingerprintSourceDigest,
  LockfileDigest,
} from '../../helpers/fingerprint/baseFingerprint';
import type { AppSourceFileDigest, PackageVersions } from '../test/bundleSidecar';
import type { FingerprintDocument } from './fingerprintDocument';

export type DeltaEntry = {
  kind: 'added' | 'removed' | 'changed';
  /** A package name, a path, or a `contents` source id. */
  name: string;
  /** A version or a digest; absent for `added`, and for a `contents` source. */
  before?: string;
  /** A version or a digest; absent for `removed`, and for a `contents` source. */
  after?: string;
};

export type LayerDelta = {
  /** `native`, `dependencies`, `js <platform>` or `base`. */
  layer: string;
  before: string | null;
  after: string | null;
  changed: boolean;
  entries: DeltaEntry[];
};

export type FingerprintDelta = {
  layers: LayerDelta[];
  changedLayerCount: number;
};

export function diffFingerprintDocuments(
  baseline: FingerprintDocument,
  current: FingerprintDocument
): FingerprintDelta {
  const layers: LayerDelta[] = [
    layerDelta('native', baseline.native.hash, current.native.hash, [
      ...diffNativeSources(baseline.native.sources, current.native.sources),
    ]),
    layerDelta('dependencies', baseline.dependencies.hash, current.dependencies.hash, [
      ...diffDependencySource(baseline, current),
      ...diffPackages(baseline.dependencies.packages ?? [], current.dependencies.packages ?? []),
    ]),
    ...diffJsLayers(baseline, current),
    layerDelta('base', baseline.base.hash, current.base.hash, [
      ...diffFiles(
        lockfilesAsFiles(baseline.base.lockfiles),
        lockfilesAsFiles(current.base.lockfiles)
      ),
      ...diffPackages(
        autolinkedAsPackages(baseline.base.autolinkedModules),
        autolinkedAsPackages(current.base.autolinkedModules)
      ),
    ]),
  ];

  return {
    layers,
    changedLayerCount: layers.filter((layer) => layer.changed).length,
  };
}

function layerDelta(
  layer: string,
  before: string | null,
  after: string | null,
  entries: DeltaEntry[]
): LayerDelta {
  return { layer, before, after, changed: before !== after, entries };
}

// ---------------------------------------------------------------------------
// Per-layer pre-image diffs
// ---------------------------------------------------------------------------

/** Lockfiles are files: their digest is the hash of their bytes. */
function lockfilesAsFiles(lockfiles: LockfileDigest[]): AppSourceFileDigest[] {
  return lockfiles.map(({ file, digest }) => ({ path: file, digest }));
}

/** `name@version` entries are packages with exactly one version each. */
function autolinkedAsPackages(entries: string[]): PackageVersions[] {
  return entries.map((entry) => {
    // A scoped name holds its own `@`, so the version starts at the LAST one.
    const separator = entry.lastIndexOf('@');
    if (separator <= 0) return { name: entry, versions: [] };
    return { name: entry.slice(0, separator), versions: [entry.slice(separator + 1)] };
  });
}

/**
 * The closure's SOURCE is part of what it means: a lockfile set and a
 * package.json hash are different numbers over different inputs, so a source
 * change is named first, before any package entry.
 */
function diffDependencySource(
  baseline: FingerprintDocument,
  current: FingerprintDocument
): DeltaEntry[] {
  const before = baseline.dependencies;
  const after = current.dependencies;

  if (before.source !== after.source) {
    return [{ kind: 'changed', name: 'source', before: before.source, after: after.source }];
  }

  // Without a per-package pre-image on both sides the digest is all there is.
  const perPackageOnBothSides = before.packages && after.packages;
  if (!perPackageOnBothSides && before.hash !== after.hash) {
    return [{ kind: 'changed', name: before.source, before: before.hash, after: after.hash }];
  }

  return [];
}

function diffJsLayers(baseline: FingerprintDocument, current: FingerprintDocument): LayerDelta[] {
  const platforms = [...new Set([...Object.keys(baseline.js), ...Object.keys(current.js)])].sort();

  return platforms.map((platform) => {
    const before = baseline.js[platform as keyof typeof baseline.js];
    const after = current.js[platform as keyof typeof current.js];
    return layerDelta(
      `js ${platform}`,
      before?.hash ?? null,
      after?.hash ?? null,
      diffFiles(before?.files ?? [], after?.files ?? [])
    );
  });
}

export function diffPackages(before: PackageVersions[], after: PackageVersions[]): DeltaEntry[] {
  const beforeByName = new Map(before.map((pkg) => [pkg.name, pkg.versions.join(', ')]));
  const afterByName = new Map(after.map((pkg) => [pkg.name, pkg.versions.join(', ')]));

  return diffByName(beforeByName, afterByName);
}

export function diffFiles(
  before: AppSourceFileDigest[],
  after: AppSourceFileDigest[]
): DeltaEntry[] {
  const beforeByPath = new Map(before.map((file) => [file.path, file.digest]));
  const afterByPath = new Map(after.map((file) => [file.path, file.digest]));

  return diffByName(beforeByPath, afterByPath);
}

/**
 * Native sources are files and directories (diffed by path and hash) plus
 * `contents` sources, which are only ever named - their value is never kept, so
 * there is nothing finer than "this one changed" to say.
 */
export function diffNativeSources(
  before: FingerprintSourceDigest[],
  after: FingerprintSourceDigest[]
): DeltaEntry[] {
  const isContents = (source: FingerprintSourceDigest) => source.type === 'contents';

  const fileEntries = diffByName(
    sourceDigestsByPath(before.filter((source) => !isContents(source))),
    sourceDigestsByPath(after.filter((source) => !isContents(source)))
  );

  const contentsEntries = diffByName(
    sourceDigestsByPath(before.filter(isContents)),
    sourceDigestsByPath(after.filter(isContents))
  ).map(({ kind, name }) => ({ kind, name }));

  return [...fileEntries, ...contentsEntries];
}

function sourceDigestsByPath(sources: FingerprintSourceDigest[]): Map<string, string> {
  return new Map(sources.map((source) => [source.id, source.hash ?? 'excluded']));
}

/** The one comparison every pre-image list reduces to: name -> value, both sides. */
function diffByName(before: Map<string, string>, after: Map<string, string>): DeltaEntry[] {
  const names = [...new Set([...before.keys(), ...after.keys()])].sort();
  const entries: DeltaEntry[] = [];

  for (const name of names) {
    const valueBefore = before.get(name);
    const valueAfter = after.get(name);

    if (valueBefore === undefined) {
      entries.push({ kind: 'added', name, after: valueAfter });
    } else if (valueAfter === undefined) {
      entries.push({ kind: 'removed', name, before: valueBefore });
    } else if (valueBefore !== valueAfter) {
      entries.push({ kind: 'changed', name, before: valueBefore, after: valueAfter });
    }
  }

  return entries;
}
