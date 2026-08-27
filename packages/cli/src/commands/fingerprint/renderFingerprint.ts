/**
 * The text `sherlo fingerprint` prints: one line per layer, a stable column
 * layout, plain enough to grep in CI. Digests are shown in full on the layer
 * line (they are the values to compare) and shortened everywhere they merely
 * name a file, since a 64-character digest per file would bury the file.
 */
import type { FingerprintDelta, DeltaEntry } from './diffFingerprintDocuments';
import type { FingerprintDocument } from './fingerprintDocument';

/** Wide enough for `dependencies`, the longest layer name, plus a gap. */
const LAYER_COLUMN_WIDTH = 14;

const DELTA_MARK: Record<DeltaEntry['kind'], string> = {
  added: '+',
  removed: '-',
  changed: '~',
};

/** The reason the `js` layer has nothing to show when no bundle was supplied. */
export const JS_NOT_COMPUTED_REASON =
  'needs a module manifest; pass --bundle-dir <dir> written by `sherlo test --emit-bundle-dir`';

export function renderLayers(
  document: FingerprintDocument,
  { verbose }: { verbose: boolean }
): string[] {
  const lines: string[] = [];

  lines.push(layerLine('native', document.native.hash, document.native.reason));
  if (verbose) {
    for (const source of document.native.sources) {
      lines.push(`  ${source.type.padEnd(8)} ${source.id}  ${short(source.hash ?? 'excluded')}`);
    }
  }

  lines.push(layerLine('dependencies', document.dependencies.hash));
  if (verbose) {
    lines.push(`  source   ${document.dependencies.source}`);
    for (const pkg of document.dependencies.installedPackages ?? []) {
      lines.push(`  package  ${pkg.name}@${pkg.versions.join(', ')}`);
    }
  }

  const jsPlatforms = Object.keys(document.js).sort() as (keyof FingerprintDocument['js'])[];
  if (jsPlatforms.length === 0) {
    lines.push(layerLine('js', null, JS_NOT_COMPUTED_REASON));
  }
  for (const platform of jsPlatforms) {
    const js = document.js[platform];
    if (!js) continue;
    lines.push(layerLine(`js ${platform}`, js.hash));
    if (verbose) {
      for (const file of js.files) {
        lines.push(`  file     ${file.path}  ${short(file.digest)}`);
      }
    }
  }

  lines.push(layerLine('base', document.base.hash, document.base.reason));
  if (verbose) {
    lines.push(`  workflow ${document.base.workflow ?? 'unknown'}`);
    for (const lockfile of document.base.lockfiles) {
      lines.push(`  lockfile ${lockfile.file}  ${short(lockfile.digest)}`);
    }
    for (const module of document.base.autolinkedModules) {
      lines.push(`  autolinked ${module}`);
    }
  }

  return lines;
}

export function renderDelta(delta: FingerprintDelta): string[] {
  const lines: string[] = [];

  for (const layer of delta.layers) {
    lines.push(
      `${layer.layer.padEnd(LAYER_COLUMN_WIDTH)}${layer.changed ? 'changed' : 'unchanged'}`
    );
    if (!layer.changed) continue;

    for (const entry of layer.entries) {
      lines.push(`  ${DELTA_MARK[entry.kind]} ${entryDetail(entry)}`);
    }

    // A changed digest with no entry to explain it: the pre-image is the same on
    // both sides (or absent), so the digests themselves are the only evidence.
    if (layer.entries.length === 0) {
      lines.push(`  ~ ${describeDigest(layer.before)} -> ${describeDigest(layer.after)}`);
    }
  }

  lines.push(`${delta.changedLayerCount} layer(s) changed`);

  return lines;
}

function layerLine(layer: string, hash: string | null, reason?: string): string {
  const value = hash ?? `not computed (${reason ?? 'unknown reason'})`;
  return `${layer.padEnd(LAYER_COLUMN_WIDTH)}${value}`;
}

function entryDetail({ kind, name, before, after }: DeltaEntry): string {
  if (kind === 'added') return after === undefined ? name : `${name} ${short(after)}`;
  if (kind === 'removed') return before === undefined ? name : `${name} ${short(before)}`;
  if (before === undefined || after === undefined) return name;
  return `${name} ${short(before)} -> ${short(after)}`;
}

function describeDigest(hash: string | null): string {
  return hash === null ? 'not computed' : short(hash);
}

/**
 * A version stays whole; a hex digest is cut to its first 12 characters, which
 * is enough to tell two apart and short enough to keep a path readable.
 */
function short(value: string): string {
  return /^[0-9a-f]{40,}$/.test(value) ? value.slice(0, 12) : value;
}
