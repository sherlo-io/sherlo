/**
 * `sherlo fingerprint` - the fingerprints `sherlo test` computes, printed per
 * layer, optionally written to a file, optionally diffed against one.
 *
 * Entirely local: no token, no server, no build. The numbers are THE SAME
 * numbers `sherlo test` computes because the same functions compute them over
 * the same project root - nothing here hashes anything itself.
 *
 *   native        the version-suppressed @expo/fingerprint hash (nativeFingerprint)
 *   dependencies  the dependency closure Metro inlines into a bundle
 *   js <platform> the app's own source, as a bundle's module graph names it
 *   base          the base fingerprint `sherlo test` stages against
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
 */
import fs from 'fs';
import path from 'path';
import { Platform } from '@sherlo/api-types';
import { DEFAULT_PROJECT_ROOT } from '../../constants';
import { computeBaseFingerprint } from '../../helpers/fingerprint';
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
  type FingerprintDocument,
  type JsLayer,
} from './fingerprintDocument';
import { renderDelta, renderLayers } from './renderFingerprint';

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
};

const PLATFORMS: Platform[] = ['android', 'ios'];

async function fingerprint(options: FingerprintOptions): Promise<void> {
  // The same root `sherlo test` hands to the same functions: the option as given,
  // defaulting to '.', resolved by each computation the way it always is.
  const projectRoot = options.projectRoot || DEFAULT_PROJECT_ROOT;

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
  const base = await computeBaseFingerprint(projectRoot, { command: THIS_COMMAND });
  const dependencies = computeDependencyClosure(projectRoot);
  const js = bundleDir === undefined ? {} : computeJsLayers({ projectRoot, bundleDir });

  return {
    formatVersion: FINGERPRINT_DOCUMENT_FORMAT_VERSION,
    cliVersion: readCliVersion(),
    native: {
      hash: base.nativeFingerprint ?? null,
      ...(base.hash === null ? { reason: base.debugMessage ?? 'unknown reason' } : {}),
      sources: base.preimage?.nativeSources ?? [],
    },
    dependencies: {
      hash: dependencies.hash,
      source: dependencies.source,
      packages: dependencies.packages,
    },
    js,
    base: {
      hash: base.hash,
      ...(base.hash === null ? { reason: base.debugMessage ?? 'unknown reason' } : {}),
      workflow: base.preimage?.workflow ?? null,
      lockfiles: base.preimage?.lockfiles ?? [],
      autolinkedModules: base.preimage?.autolinkedModules ?? [],
    },
  };
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
    const manifestPath = path.join(bundleDir, moduleManifestFileName(platform));
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = validateModuleManifestBuffer(fs.readFileSync(manifestPath));
    if (!manifest) {
      throwError({
        message:
          `The ${platform} module manifest at ${manifestPath} is not a valid manifest ` +
          '(expected version, header, moduleHashes, storyClosures). ' +
          'Re-emit the bundle directory with `sherlo test --emit-bundle-dir <dir>`.',
      });
    }

    const closure = computeAppSourceClosure({
      projectRoot,
      ...moduleManifestAppSourceInputs(manifest),
    });
    layers[platform] = { hash: closure.hash, fileCount: closure.fileCount, files: closure.files };
  }

  if (Object.keys(layers).length === 0) {
    throwError({
      message:
        `No module manifest found in ${bundleDir} ` +
        `(expected ${PLATFORMS.map(moduleManifestFileName).join(' or ')}). ` +
        'Produce the directory with `sherlo test --emit-bundle-dir <dir>`.',
    });
  }

  return layers;
}
