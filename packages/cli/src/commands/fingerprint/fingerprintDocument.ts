/**
 * THE FINGERPRINT DOCUMENT - every digest `sherlo test` computes over a project,
 * together with the pre-image each one was computed over.
 *
 * `sherlo fingerprint --write <file>` writes one; `--baseline <file>` reads one
 * back and diffs it against the current tree. The document is what makes a
 * fingerprint change EXPLAINABLE: a bare hash can only say "something moved",
 * the pre-image beside it says which package, which file, which lockfile.
 *
 * WHAT IS NEVER IN HERE. Digests and identifiers only - no file bytes, no
 * resolved Expo config, no autolinking output. A `contents`-type native source
 * is recorded as its id and hash and nothing else (see `FingerprintSourceDigest`
 * in helpers/fingerprint/baseFingerprint.ts for why), and a test pins that the
 * written file carries no `contents` value even when the source has one.
 *
 * KEY ORDER IS FIXED so two documents over the same tree are byte-identical and
 * a committed baseline diffs cleanly in git. Every list is sorted by the code
 * that produced it (the same code that hashed it), so nothing is re-sorted here.
 */
import fs from 'fs';
import { Platform } from '@sherlo/api-types';
import type {
  AppSourceFileDigest,
  DependencyClosureSource,
  InstalledPackageVersions,
} from '../test/bundleSidecar';
import type {
  FingerprintSourceDigest,
  LockfileDigest,
  Workflow,
} from '../../helpers/fingerprint/baseFingerprint';

/** Bump ONLY on a breaking change to the shape below. A reader refuses any other. */
export const FINGERPRINT_DOCUMENT_FORMAT_VERSION = 1;

/**
 * The `native` layer: the version-suppressed `@expo/fingerprint` hash - the same
 * number `sherlo test` sends as `nativeFingerprint` - and the sources it covered.
 */
export type NativeLayer = {
  /** null when the fingerprint could not be computed (see `reason`). */
  hash: string | null;
  /** Why `hash` is null; absent when it is not. */
  reason?: string;
  sources: FingerprintSourceDigest[];
};

/**
 * The `base` layer: the base fingerprint `sherlo test` stages against. It is the
 * native hash combined with the lockfiles and the autolinked native modules, so
 * this layer records only those two extra inputs - the native sources are already
 * under `native`.
 */
export type BaseLayer = {
  hash: string | null;
  reason?: string;
  workflow: Workflow | null;
  lockfiles: LockfileDigest[];
  /** Sorted `name@version` entries. */
  autolinkedModules: string[];
};

/**
 * The `dependencies` layer: the dependency closure Metro inlines into a bundle.
 * `installedPackages` is present only when the closure was read from
 * `node_modules`; a lockfile or package.json closure is a hash over raw bytes and
 * has no per-package pre-image.
 */
export type DependenciesLayer = {
  hash: string;
  source: DependencyClosureSource;
  installedPackages: InstalledPackageVersions[] | null;
};

/**
 * One platform's `js` layer: the digest of the app's own source files as the
 * bundle's module graph names them, and the per-file digests behind it.
 */
export type JsLayer = {
  hash: string;
  fileCount: number;
  files: AppSourceFileDigest[];
};

export type FingerprintDocument = {
  formatVersion: typeof FINGERPRINT_DOCUMENT_FORMAT_VERSION;
  cliVersion: string | null;
  native: NativeLayer;
  dependencies: DependenciesLayer;
  /** One entry per platform whose module manifest was available; may be empty. */
  js: Partial<Record<Platform, JsLayer>>;
  base: BaseLayer;
};

/**
 * Serialize with the key order the type declares. `JSON.stringify` keeps insertion
 * order, and every object here is built by a literal in that order, so the output
 * is deterministic by construction. The trailing newline keeps git happy.
 */
export function serializeFingerprintDocument(document: FingerprintDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function writeFingerprintDocument(filePath: string, document: FingerprintDocument): void {
  fs.writeFileSync(filePath, serializeFingerprintDocument(document), 'utf8');
}

/**
 * Read a document written by `--write`.
 *
 * Throws a plain message the command prints as-is. Only the format version and
 * the layer objects are checked: a document that says it is version 1 and has
 * the four layers is trusted for the rest, exactly as this CLI wrote it.
 */
export function readFingerprintDocument(filePath: string): FingerprintDocument {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`The baseline file could not be read at ${filePath}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`The baseline file at ${filePath} is not valid JSON`);
  }

  if (parsed?.formatVersion !== FINGERPRINT_DOCUMENT_FORMAT_VERSION) {
    throw new Error(
      `The baseline file at ${filePath} has format version ${String(parsed?.formatVersion)}, ` +
        `but this CLI reads format version ${FINGERPRINT_DOCUMENT_FORMAT_VERSION}. ` +
        'Write a new baseline with `sherlo fingerprint --write <file>` using this CLI version.'
    );
  }

  for (const layer of ['native', 'dependencies', 'js', 'base']) {
    if (typeof parsed[layer] !== 'object' || parsed[layer] === null) {
      throw new Error(`The baseline file at ${filePath} is missing its "${layer}" layer`);
    }
  }

  return parsed as FingerprintDocument;
}
