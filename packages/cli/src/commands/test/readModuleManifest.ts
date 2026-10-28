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
import type { Platform } from '@sherlo/api-types';
import logWarning from '../../helpers/logWarning';

/** Validated shape of the manifest sidecar (SHERLO-1894 §1). */
export type ModuleManifest = {
  version: number;
  header: Record<string, unknown>;
  moduleHashes: Record<string, unknown>;
  storyClosures: Record<string, unknown>;
  /** Per story file, the title Storybook shows: `Storefront/ProductCard`. */
  storyTitles?: Record<string, string>;
  /** Per story file, how many stories it holds. */
  storyCounts?: Record<string, number>;
  /** The scene ids the bundle holds; absent means none. */
  sceneIds?: string[];
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

  const validated = validateModuleManifestBuffer(raw);
  if (!validated) {
    logWarning({
      message:
        `The module manifest at ${manifestPath} is not valid JSON, or has an unexpected shape ` +
        '(expected version, header, moduleHashes, storyClosures); continuing without it.',
    });
    return null;
  }

  return validated;
}

/**
 * Validate manifest bytes, wherever they came from.
 *
 * Split out of {@link readValidatedModuleManifest} because a SUPPLIED bundle
 * directory carries its manifest as a plain file rather than at the serializer's
 * fixed cache path - and it must be judged by the same shape rules, with the same
 * verbatim-bytes contract, as one the serializer just wrote.
 *
 * Returns null on any problem and never throws or logs; the caller owns the
 * reaction, which differs by road: the built road warns and continues, the
 * supplied road refuses.
 */
export function validateModuleManifestBuffer(raw: Buffer): ValidatedModuleManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }

  if (
    !isPlainObject(parsed) ||
    typeof parsed.version !== 'number' ||
    !isPlainObject(parsed.header) ||
    !isPlainObject(parsed.moduleHashes) ||
    !isPlainObject(parsed.storyClosures)
  ) {
    return null;
  }

  return {
    raw,
    parsed: {
      version: parsed.version,
      header: parsed.header,
      moduleHashes: parsed.moduleHashes,
      storyClosures: parsed.storyClosures,
      ...(isPlainObject(parsed.storyTitles)
        ? { storyTitles: withBareKeys(parsed.storyTitles as Record<string, string>) }
        : {}),
      ...(isPlainObject(parsed.storyCounts)
        ? { storyCounts: withBareKeys(parsed.storyCounts as Record<string, number>) }
        : {}),
      ...(Array.isArray(parsed.sceneIds) && parsed.sceneIds.every((id) => typeof id === 'string')
        ? { sceneIds: parsed.sceneIds as string[] }
        : {}),
    },
  };
}

/**
 * The serializer keys story files `./src/...`; the paths a run lists are bare `src/...`. Bundles
 * built by older installed SDKs carry the `./` form too, so the CLI reads both and holds the bare one.
 */
function bareStoryPath(storyFile: string): string {
  return storyFile.startsWith('./') ? storyFile.slice(2) : storyFile;
}

function withBareKeys<T>(byStoryFile: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(byStoryFile).map(([storyFile, value]) => [bareStoryPath(storyFile), value])
  );
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
  return countStoriesIn(manifest, bundleStoryFiles(manifest));
}

/** The per-platform module manifests lifted off the bundles of these platforms. */
export function collectModuleManifests(
  bundles: Partial<Record<Platform, { moduleManifest?: ValidatedModuleManifest }>>,
  platforms: Platform[]
): Partial<Record<Platform, ValidatedModuleManifest>> {
  const moduleManifests: Partial<Record<Platform, ValidatedModuleManifest>> = {};
  for (const platform of platforms) {
    const manifest = bundles[platform]?.moduleManifest;
    if (manifest) moduleManifests[platform] = manifest;
  }
  return moduleManifests;
}

/**
 * How many stories (`countBundleStories`) or scenes (`countBundleScenes`) each of these platforms'
 * bundle holds, counted off its module map.
 */
export function countInBundles(
  bundles: Partial<Record<Platform, { moduleManifest?: ValidatedModuleManifest }>>,
  platforms: Platform[],
  count: (moduleManifest: ValidatedModuleManifest) => number
): Partial<Record<Platform, number>> {
  const counts: Partial<Record<Platform, number>> = {};
  for (const [platform, moduleManifest] of Object.entries(
    collectModuleManifests(bundles, platforms)
  ) as Array<[Platform, ValidatedModuleManifest]>) {
    counts[platform] = count(moduleManifest);
  }
  return counts;
}

/**
 * How many scenes the bundle holds; a module map that records none holds none.
 */
export function countBundleScenes(manifest: ValidatedModuleManifest): number {
  return manifest.parsed.sceneIds?.length ?? 0;
}

/**
 * How many stories these story files hold: each file's own count where the module map records
 * one, one per file where it does not.
 */
export function countStoriesIn(manifest: ValidatedModuleManifest, files: string[]): number {
  const counts = manifest.parsed.storyCounts;
  return files.reduce((total, file) => total + (counts?.[file] ?? 1), 0);
}

/**
 * The story files the module map gives a title, each with its story count where one is recorded.
 * A file with no recorded title is left out: the row prints its path.
 */
export function titledStoryFilesIn(
  manifest: ValidatedModuleManifest
): Array<{ storyFile: string; title?: string; stories?: number }> {
  const { storyTitles = {}, storyCounts = {} } = manifest.parsed;
  const storyFiles = new Set([...Object.keys(storyTitles), ...Object.keys(storyCounts)]);
  return [...storyFiles].map((storyFile) => ({
    storyFile,
    ...(storyTitles[storyFile] !== undefined ? { title: storyTitles[storyFile] } : {}),
    ...(storyCounts[storyFile] !== undefined ? { stories: storyCounts[storyFile] } : {}),
  }));
}

/** Every story file the bundle holds. */
export function bundleStoryFiles(manifest: ValidatedModuleManifest): string[] {
  return Object.keys(manifest.parsed.storyClosures).map(bareStoryPath);
}

export default readValidatedModuleManifest;
