/**
 * Fail-soft reader for the module-manifest sidecar the Sherlo Metro serializer
 * emits during a staged bundler run (SHERLO-1894 Diff Scope Phase B).
 *
 * The serializer writes node_modules/.cache/sherlo/module-manifest.json ONLY when
 * the manifest is enabled - which the staged road does by setting
 * SHERLO_MODULE_MANIFEST=1 in the bundler subprocess env.
 *
 * BAIL-OPEN IS THE HEADLINE CONTRACT (SHERLO-1894 §2): a missing, unreadable, or
 * shape-invalid sidecar must NEVER fail or block a build. Every failure mode here
 * logs a WARNING and returns null; the caller proceeds to upload WITHOUT the
 * manifest. This reader never throws.
 *
 * The raw bytes are returned verbatim (as a Buffer) so the caller uploads the
 * serializer's exact canonical output - re-serializing here would risk drifting
 * from the byte-canonical stableStringify the serializer produced.
 */
import { existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import logWarning from '../../helpers/logWarning';

/** Validated shape of the manifest sidecar (SHERLO-1894 §1). */
export type ModuleManifest = {
  version: number;
  header: Record<string, unknown>;
  moduleHashes: Record<string, unknown>;
  storyClosures: Record<string, unknown>;
};

export type ValidatedModuleManifest = {
  /** The sidecar bytes exactly as written by the serializer (ready to gzip + upload). */
  raw: Buffer;
  /** Parsed manifest - for diagnostics / the upload summary. */
  parsed: ModuleManifest;
};

/** Sidecar location, relative to the project root (matches the serializer's cacheDir). */
const MANIFEST_RELATIVE_PATH = ['node_modules', '.cache', 'sherlo', 'module-manifest.json'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deletes the module-manifest sidecar for a project, if present. Never throws.
 *
 * The serializer writes ONE fixed path with NO platform recorded in the header, so
 * a sidecar from a previous run is indistinguishable from this run's. The CLI loops
 * platforms sequentially against the same projectRoot, and the serializer may bail
 * open internally (unrecognised graph shape, write error) and emit nothing at all.
 * Without this, {@link readValidatedModuleManifest} would pick up the LEFTOVER file
 * from an earlier platform and upload it under the current platform's manifest key -
 * silently attributing one platform's ancestor data to another (SHERLO-1894 §2).
 *
 * The CLI calls this immediately before spawning each platform's bundler, so a
 * sidecar found afterward NECESSARILY came from that run. Absence then genuinely
 * means absence, and the bail-open read stays correct.
 */
export function deleteModuleManifestSidecar(projectRoot: string): void {
  const manifestPath = path.join(projectRoot, ...MANIFEST_RELATIVE_PATH);
  try {
    rmSync(manifestPath, { force: true });
  } catch {
    // Best-effort: a stale sidecar we cannot remove is handled defensively at the
    // read side (which validates and warns), and this delete must never block a build.
  }
}

/**
 * Reads and validates the module-manifest sidecar for a project.
 *
 * @returns the validated manifest (raw bytes + parsed) or null on ANY problem
 *   (missing / unreadable / not JSON / wrong shape). Never throws.
 */
export function readValidatedModuleManifest(projectRoot: string): ValidatedModuleManifest | null {
  const manifestPath = path.join(projectRoot, ...MANIFEST_RELATIVE_PATH);

  if (!existsSync(manifestPath)) {
    // Absent is the common, expected case (old SDK, or the serializer bailed open).
    // Not noisy: no manifest simply means the build ships without one.
    return null;
  }

  let raw: Buffer;
  try {
    raw = readFileSync(manifestPath);
  } catch (error) {
    logWarning({
      message:
        `Could not read the module manifest at ${manifestPath} ` +
        `(${error instanceof Error ? error.message : String(error)}); ` +
        'continuing without it.',
    });
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    logWarning({
      message: `The module manifest at ${manifestPath} is not valid JSON; continuing without it.`,
    });
    return null;
  }

  if (
    !isPlainObject(parsed) ||
    typeof parsed.version !== 'number' ||
    !isPlainObject(parsed.header) ||
    !isPlainObject(parsed.moduleHashes) ||
    !isPlainObject(parsed.storyClosures)
  ) {
    logWarning({
      message:
        `The module manifest at ${manifestPath} has an unexpected shape ` +
        '(expected version, header, moduleHashes, storyClosures); continuing without it.',
    });
    return null;
  }

  return {
    raw,
    parsed: {
      version: parsed.version,
      header: parsed.header,
      moduleHashes: parsed.moduleHashes,
      storyClosures: parsed.storyClosures,
    },
  };
}

/**
 * The number of stories THIS build's manifest carries - the "M" in every capture
 * plan "N of M stories" fraction. It is the count of story closures the
 * serializer recorded, keyed by story SOURCE FILE. This is the ONE definition of
 * M; both the live and dry-run capture plans (SHERLO-1919) count it through here
 * so the two modes can never disagree on the denominator.
 *
 * Note this counts the WHOLE bundle's story set, NOT the `--include` / `--exclude`
 * scope: the scope filter runs on-device against story TITLES, while the manifest
 * is keyed by file paths, so the CLI has no honest way to scope this number at
 * bundle time. `--include` therefore never moves M. The report wording names the
 * number "in this bundle" to say so.
 */
export function countBundleStories(manifest: ValidatedModuleManifest): number {
  return Object.keys(manifest.parsed.storyClosures).length;
}

export default readValidatedModuleManifest;
