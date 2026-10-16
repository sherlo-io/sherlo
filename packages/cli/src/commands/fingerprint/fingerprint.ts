/**
 * `sherlo fingerprint` - the fingerprints `sherlo test` computes, printed per
 * layer, optionally written to a file, optionally diffed against one.
 *
 * Entirely local: no token, no server, no build. The numbers are THE SAME
 * numbers `sherlo test` computes because the same functions compute them over
 * the same project root - nothing here hashes anything itself.
 *
 *   native          the version-suppressed @expo/fingerprint hash (nativeFingerprint)
 *   dependencies    the dependency closure Metro inlines into a bundle
 *   js <platform>   the app's own source, as a bundle's module graph names it
 *   base <platform> the base fingerprint `sherlo test` stages the platform against
 *
 * THE JS LAYER NEEDS A MODULE MANIFEST. The app-source closure is a digest over
 * the files a bundle's module graph names, and that list only exists after a
 * bundler run (the Sherlo Metro serializer writes it). Rather than run the
 * bundler here, this command reads the manifests from a directory produced by
 * `sherlo test --emit-bundle-dir <dir>` (`--bundle-dir`), and prints
 * `js: not computed` with the reason when none is supplied. The file LIST comes
 * from that manifest; the BYTES are always read from the current tree, which is
 * exactly how `sherlo test --bundle-dir` judges a supplied bundle. A file the
 * manifest marks as generated at bundle time is read as its inputs, so a diff
 * names the input that changed rather than a file this tree may not even have.
 *
 * `--baseline` exits 1 when any layer changed and 0 otherwise, so CI can gate on
 * it. Every other failure (an unreadable file, a wrong format version) is an
 * error like any other command's.
 *
 * `--layer <layer>` ANSWERS ONE LAYER INSTEAD OF PRINTING THE REPORT: one digest
 * on stdout and nothing else, so a build cache is `FP=$(sherlo fingerprint
 * --layer base:android)` rather than a JSON parser that breaks the day the document's
 * shape moves. A layer it cannot compute EXITS NON-ZERO and says why - never an
 * empty line, because a caller reading this digest decides whether to skip a
 * twenty-five-minute build and must never read silence as "nothing changed".
 */
import fs from 'fs';
import path from 'path';
import { Platform } from '@sherlo/api-types';
import {
  BASELINE_OPTION,
  DEFAULT_PROJECT_ROOT,
  LAYER_OPTION,
  VERBOSE_OPTION,
  WRITE_OPTION,
} from '../../constants';
import { PLATFORMS } from '../../constants';
import { computeBaseFingerprint, type BaseFingerprints } from '../../helpers/fingerprint';
import type {
  BaseFingerprintResult,
  FingerprintSourceDigest,
} from '../../helpers/fingerprint/baseFingerprint';
import throwError from '../../helpers/throwError';
import {
  computeAppSourceClosure,
  computeDependencyClosure,
  moduleManifestAppSourceInputs,
  moduleManifestFileName,
  readCliVersion,
} from '../test/bundleSidecar';
import { validateModuleManifestBuffer } from '../test/readModuleManifest';
import { THIS_COMMAND } from './constants';
import { diffFingerprintDocuments } from './diffFingerprintDocuments';
import {
  FINGERPRINT_DOCUMENT_FORMAT_VERSION,
  readFingerprintDocument,
  writeFingerprintDocument,
  type BaseLayer,
  type FingerprintDocument,
  type JsLayer,
} from './fingerprintDocument';
import { JS_NOT_COMPUTED_REASON, renderDelta, renderLayers } from './renderFingerprint';

export type FingerprintOptions = {
  projectRoot?: string;
  /** Write the document (digests plus pre-image) to this file. */
  write?: string;
  /** Diff the current document against the one at this file. */
  baseline?: string;
  /** A directory from `sherlo test --emit-bundle-dir`, for the js layer. */
  bundleDir?: string;
  /** Print every source, package and file under its layer. */
  verbose?: boolean;
  /** Print ONE layer's digest and nothing else, instead of the report. */
  layer?: string;
};

/**
 * What `--layer` accepts. `base` and `js` carry their platform because each is
 * computed per platform - there is no one base or js digest to hand back.
 */
const LAYER_ARGUMENTS = [
  'native',
  'dependencies',
  'base:android',
  'base:ios',
  'js:android',
  'js:ios',
] as const;

type LayerArgument = (typeof LAYER_ARGUMENTS)[number];

async function fingerprint(options: FingerprintOptions): Promise<void> {
  // The same root `sherlo test` hands to the same functions: the option as given,
  // defaulting to '.', resolved by each computation the way it always is.
  const projectRoot = options.projectRoot || DEFAULT_PROJECT_ROOT;

  if (options.layer !== undefined) {
    refuseOptionsThatAlsoWriteToStdout(options);
    console.log(
      await computeOneLayerDigest({
        layer: options.layer,
        projectRoot,
        bundleDir: options.bundleDir,
      })
    );
    return;
  }

  const document = await computeFingerprintDocument({ projectRoot, bundleDir: options.bundleDir });

  console.log(renderLayers(document, { verbose: options.verbose ?? false }).join('\n'));

  if (options.write) {
    writeFingerprintDocument(options.write, document);
    console.log(`\nWritten to ${options.write}`);
  }

  if (options.baseline) {
    let baseline: FingerprintDocument;
    try {
      baseline = readFingerprintDocument(options.baseline);
    } catch (error) {
      throwError({ message: (error as Error).message });
    }

    const delta = diffFingerprintDocuments(baseline, document);
    console.log(`\nAgainst ${options.baseline}:`);
    console.log(renderDelta(delta).join('\n'));

    // The exit CODE is the verdict; setting it (rather than exiting) lets the
    // process finish flushing as every other command does.
    if (delta.changedLayerCount > 0) process.exitCode = 1;
  }
}

export default fingerprint;

/* ========================================================================== */

/**
 * Compute every layer over the project as it is now.
 *
 * Exported for the tests, which run it over a fixture tree; the command above
 * is the only other caller.
 */
export async function computeFingerprintDocument({
  projectRoot,
  bundleDir,
}: {
  projectRoot: string;
  bundleDir?: string;
}): Promise<FingerprintDocument> {
  const fingerprints = await computeBaseFingerprint(projectRoot, { command: THIS_COMMAND });
  const dependencies = computeDependencyClosure(projectRoot);
  const js = bundleDir === undefined ? {} : computeJsLayers({ projectRoot, bundleDir });
  // The native fingerprint covers both platforms, so every platform's result carries the same one.
  const native = fingerprints.android;

  return {
    formatVersion: FINGERPRINT_DOCUMENT_FORMAT_VERSION,
    cliVersion: readCliVersion(),
    native: {
      hash: native.nativeFingerprint ?? null,
      ...(native.hash === null ? { reason: native.debugMessage ?? 'unknown reason' } : {}),
      sources: nativeSourcesOfEveryPlatform(fingerprints),
    },
    dependencies: {
      hash: dependencies.hash,
      source: dependencies.source,
      packages: dependencies.packages,
    },
    js,
    base: {
      android: baseLayerOf(fingerprints.android),
      ios: baseLayerOf(fingerprints.ios),
    },
  };
}

/** One platform's base layer: its digest, and the inputs only the base adds to the native ones. */
function baseLayerOf(platformBase: BaseFingerprintResult): BaseLayer {
  return {
    hash: platformBase.hash,
    ...(platformBase.hash === null
      ? { reason: platformBase.debugMessage ?? 'unknown reason' }
      : {}),
    workflow: platformBase.preimage?.workflow ?? null,
    lockfiles: platformBase.preimage?.lockfiles ?? [],
    autolinkedModules: platformBase.preimage?.autolinkedModules ?? [],
  };
}

/**
 * The native layer's sources: every platform's Layer-1 sources, each listed once -
 * the ones both platforms read (the app config, the shared packages) appear on both.
 */
function nativeSourcesOfEveryPlatform(fingerprints: BaseFingerprints): FingerprintSourceDigest[] {
  const sources = new Map<string, FingerprintSourceDigest>();
  for (const platform of PLATFORMS) {
    for (const source of fingerprints[platform].preimage?.nativeSources ?? []) {
      sources.set(`${source.type}:${source.id}:${source.hash}`, source);
    }
  }
  return [...sources.values()];
}

/**
 * One js layer per platform whose module manifest the bundle directory holds.
 * A directory with no manifest at all is an error: the flag was given to compute
 * the js layer, and silently computing nothing would look like success.
 */
function computeJsLayers({
  projectRoot,
  bundleDir,
}: {
  projectRoot: string;
  bundleDir: string;
}): Partial<Record<Platform, JsLayer>> {
  const layers: Partial<Record<Platform, JsLayer>> = {};

  for (const platform of PLATFORMS) {
    const layer = computeJsLayer({ projectRoot, bundleDir, platform });
    if (layer) layers[platform] = layer;
  }

  if (Object.keys(layers).length === 0) {
    throwError({
      message:
        `No module manifest found in ${bundleDir} ` +
        `(expected ${PLATFORMS.map(moduleManifestFileName).join(' or ')}). ` +
        'Produce the directory with `npx sherlo test --emit-bundle-dir <dir>`.',
    });
  }

  return layers;
}

/**
 * One platform's js layer, or undefined when the bundle directory holds no
 * manifest for that platform. A manifest that is THERE but unreadable is an
 * error either way - only an absent one is the caller's to interpret, and the
 * two callers interpret it differently: the report skips the platform, the
 * one-digest path refuses and names it.
 */
function computeJsLayer({
  projectRoot,
  bundleDir,
  platform,
}: {
  projectRoot: string;
  bundleDir: string;
  platform: Platform;
}): JsLayer | undefined {
  const manifestPath = path.join(bundleDir, moduleManifestFileName(platform));
  if (!fs.existsSync(manifestPath)) return undefined;

  const manifest = validateModuleManifestBuffer(fs.readFileSync(manifestPath));
  if (!manifest) {
    throwError({
      message:
        `The ${platform} module manifest at ${manifestPath} is not a valid manifest ` +
        '(expected version, header, moduleHashes, storyClosures). ' +
        'Re-emit the bundle directory with `npx sherlo test --emit-bundle-dir <dir>`.',
    });
  }

  const closure = computeAppSourceClosure({
    projectRoot,
    ...moduleManifestAppSourceInputs(manifest),
  });

  return { hash: closure.hash, fileCount: closure.fileCount, files: closure.files };
}

/**
 * THE ONE-DIGEST PATH. Computes exactly the asked-for layer and returns its
 * digest - no other layer is computed, and nothing else is printed.
 *
 * Every way this can fail THROWS. `computeBaseFingerprint` deliberately degrades
 * to `hash: null` with a reason so a customer without `@expo/fingerprint` can
 * still push; that softness is right for a push and wrong here, so the null is
 * turned into a refusal ON THIS PATH ONLY - the helper itself is untouched.
 */
async function computeOneLayerDigest({
  layer,
  projectRoot,
  bundleDir,
}: {
  layer: string;
  projectRoot: string;
  bundleDir?: string;
}): Promise<string> {
  if (!isLayerArgument(layer)) {
    throwError({
      message:
        `Unknown layer "${layer}". ` +
        `\`--${LAYER_OPTION}\` takes one of: ${LAYER_ARGUMENTS.join(', ')}.`,
    });
  }

  if (layer === 'dependencies') {
    // The dependency closure always resolves to a digest: a project with no
    // lockfile and no install hashes its declared ranges.
    return computeDependencyClosure(projectRoot).hash;
  }

  if (layer === 'native' || layer === 'base:android' || layer === 'base:ios') {
    // THIS_COMMAND is what makes this digest the same number `sherlo test`
    // computes - the reporting breadcrumb the cross-command determinism test
    // holds on to. Do not drop it.
    const fingerprints = await computeBaseFingerprint(projectRoot, { command: THIS_COMMAND });
    // The native fingerprint covers both platforms, so every platform's result carries it.
    const platformBase =
      layer === 'native' ? fingerprints.android : fingerprints[layerPlatform(layer)];
    const hash = layer === 'native' ? platformBase.nativeFingerprint ?? null : platformBase.hash;

    if (hash === null) {
      throwError({
        message: `The ${layerName(layer)} layer could not be computed: ${
          platformBase.debugMessage ?? 'unknown reason'
        }`,
      });
    }

    return hash;
  }

  const platform = layerPlatform(layer);

  if (bundleDir === undefined) {
    throwError({
      message: `The js ${platform} layer could not be computed: ${JS_NOT_COMPUTED_REASON}.`,
    });
  }

  const jsLayer = computeJsLayer({ projectRoot, bundleDir, platform });
  if (!jsLayer) {
    // NOT the report's "no module manifest found at all" message: the caller
    // named a platform, so the answer names the platform whose manifest is
    // missing - a directory bundled for android only must not read as a
    // directory that was never bundled.
    throwError({
      message:
        `The js ${platform} layer could not be computed: ${bundleDir} holds no ${platform} ` +
        `module manifest (expected ${moduleManifestFileName(platform)}). ` +
        `Emit the bundle directory from a run that tests ${platform}: ` +
        '`npx sherlo test --emit-bundle-dir <dir>`.',
    });
  }

  return jsLayer.hash;
}

/**
 * `--layer` OWNS STDOUT, so the options that also write to it are refused rather
 * than silently ignored. Refusing is the safer of the two readings: a caller who
 * passed both gets told, where a silent `--layer` would hand back a digest and
 * quietly skip the file `--write` was asked for.
 */
function refuseOptionsThatAlsoWriteToStdout(options: FingerprintOptions): void {
  const alsoAsked = [
    options.write !== undefined ? `--${WRITE_OPTION}` : null,
    options.baseline !== undefined ? `--${BASELINE_OPTION}` : null,
    options.verbose ? `--${VERBOSE_OPTION}` : null,
  ].filter((flag): flag is string => flag !== null);

  if (alsoAsked.length === 0) return;

  throwError({
    message:
      `\`--${LAYER_OPTION}\` prints one digest and nothing else, so it cannot be combined with ` +
      `${alsoAsked.join(' or ')}. Run them as separate commands.`,
  });
}

function isLayerArgument(layer: string): layer is LayerArgument {
  return (LAYER_ARGUMENTS as readonly string[]).includes(layer);
}

type PlatformLayerArgument = Exclude<LayerArgument, 'native' | 'dependencies'>;

/** `js:ios` -> `ios`, `base:android` -> `android`. */
function layerPlatform(layer: PlatformLayerArgument): Platform {
  return layer.split(':')[1] as Platform;
}

/** The layer as the report names it: `base:ios` -> `base ios`, `native` -> `native`. */
function layerName(layer: LayerArgument): string {
  return layer.replace(':', ' ');
}
