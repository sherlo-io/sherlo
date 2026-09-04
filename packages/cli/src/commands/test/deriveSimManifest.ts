/**
 * THE ONE ALGORITHM: derive the real-format module manifest from a sim world
 * file, exactly as Metro's serializer derives one from source (sim-mode design
 * section 1). The server never learns a second manifest format -
 * readModuleManifest / computeDiffScopeDecision run unchanged on what this
 * produces.
 *
 * The rules, and why each is load-bearing:
 *
 * - `moduleHashes[path] = sha256(declared content, WITH each of the module's
 *   own stories' render content folded in)`. Folding the render into the story
 *   file's OWN hashed content is what makes the visual lever and the diff-scope
 *   lever the same edit - change a story's `render.text` and its story file's
 *   hash moves, so the story is captured AND draws differently, just as in a
 *   real app. Without it, a world edit could change pixels the diff scope never
 *   sees coming.
 *
 * - `storyClosures[storyFile] = sorted transitive declared imports, the story
 *   file excluded from its own closure` - mirroring the serializer's
 *   collectForwardClosure (story-not-in-own-closure included; the server's
 *   capture rule has a dedicated term for direct story edits).
 *
 * - `header` is CONSTANT across builds and worlds. The server compares headers
 *   byte-for-byte (`areManifestsComparable`); ANY variation would hit the
 *   toolchain-mismatch rung and force a full capture, silently disabling the
 *   diff scope sim mode exists to exercise. Same for `version`.
 *
 * - Serialization is the CLI's stableStringify copy of the serializer's
 *   canonical depth-sorted-keys form, so equal worlds produce BYTE-IDENTICAL
 *   manifest files - the determinism the whole sim saga rests on.
 *
 * - Paths are normalized `./`-free posix (done at world validation), matching
 *   what the server's normalizeManifestPath would produce anyway.
 */
import crypto from 'crypto';
import stableStringify from '../../helpers/stableStringify';
import type { ValidatedModuleManifest } from './readModuleManifest';
import type { SimStory, SimWorld } from './simWorld';

/**
 * The constant sim manifest header. The `'sim'` sentinels replace toolchain
 * fingerprints no toolchain produced; what matters is that every derivation
 * emits the SAME header bytes, so two sim manifests are always comparable.
 */
export const SIM_MANIFEST_HEADER = {
  metroVersion: 'sim',
  babelConfigDigest: 'sim',
  envDigest: 'sim',
  envKeys: [] as string[],
};

/** Same version the Metro serializer emits - the server type-checks it as a number. */
export const SIM_MANIFEST_VERSION = 1;

/**
 * A derived sim manifest: the module-manifest sidecar shape (so everything
 * downstream - gzip + staged upload, the capture-plan story count - treats it
 * exactly like an emitted one), with the parsed fields typed precisely since
 * this producer, unlike the sidecar reader, KNOWS what it wrote.
 */
export type SimModuleManifest = ValidatedModuleManifest & {
  parsed: {
    version: number;
    header: typeof SIM_MANIFEST_HEADER;
    moduleHashes: Record<string, string>;
    storyClosures: Record<string, string[]>;
  };
};

/**
 * Derive the module manifest from a validated sim world. Pure: same world in,
 * byte-identical manifest out.
 */
function deriveSimManifest(world: SimWorld): SimModuleManifest {
  const storiesByFile = groupStoriesByFile(world.stories);

  const moduleHashes: Record<string, string> = {};
  for (const [modulePath, content] of Object.entries(world.modules)) {
    moduleHashes[modulePath] = hashModuleContent(content, storiesByFile.get(modulePath));
  }

  const importsByFile = collectImportsByFile(storiesByFile);
  const storyClosures: Record<string, string[]> = {};
  for (const storyFile of storiesByFile.keys()) {
    storyClosures[storyFile] = collectTransitiveImports(storyFile, importsByFile);
  }

  const parsed = {
    version: SIM_MANIFEST_VERSION,
    header: SIM_MANIFEST_HEADER,
    moduleHashes,
    storyClosures,
  };

  return { raw: Buffer.from(stableStringify(parsed), 'utf8'), parsed };
}

export default deriveSimManifest;

/* ========================================================================== */

/** Stories grouped under their declared file, sorted by id for determinism. */
function groupStoriesByFile(stories: SimStory[]): Map<string, SimStory[]> {
  const storiesByFile = new Map<string, SimStory[]>();
  for (const story of stories) {
    const fileStories = storiesByFile.get(story.file) ?? [];
    fileStories.push(story);
    storiesByFile.set(story.file, fileStories);
  }
  for (const fileStories of storiesByFile.values()) {
    fileStories.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return storiesByFile;
}

/**
 * A module's hash pre-image: its declared content, plus - when the module is a
 * story file - each of its stories' id + render, canonically serialized. The id
 * is included so two stories in one file swapping renders still moves the hash.
 */
function hashModuleContent(content: string, fileStories: SimStory[] | undefined): string {
  let preimage = content;
  for (const story of fileStories ?? []) {
    preimage += '\n' + stableStringify({ id: story.id, render: story.render });
  }
  return crypto.createHash('sha256').update(preimage, 'utf8').digest('hex');
}

/** The declared direct-import edges: story file -> union of its stories' imports. */
function collectImportsByFile(storiesByFile: Map<string, SimStory[]>): Map<string, string[]> {
  const importsByFile = new Map<string, string[]>();
  for (const [storyFile, fileStories] of storiesByFile) {
    const merged = new Set<string>();
    for (const story of fileStories) {
      for (const imported of story.imports) merged.add(imported);
    }
    importsByFile.set(storyFile, Array.from(merged));
  }
  return importsByFile;
}

/**
 * Every module reachable from a story file over the declared import edges
 * (edges exist only where stories declare them, so importing another STORY file
 * pulls that story's own imports in transitively), with the story file itself
 * excluded from its own closure - even when a cycle reaches back to it.
 */
function collectTransitiveImports(
  storyFile: string,
  importsByFile: ReadonlyMap<string, string[]>
): string[] {
  const reached = new Set<string>();
  const followed = new Set<string>();
  const stack = [storyFile];

  while (stack.length > 0) {
    const from = stack.pop() as string;
    if (followed.has(from)) continue;
    followed.add(from);

    for (const imported of importsByFile.get(from) ?? []) {
      reached.add(imported);
      if (!followed.has(imported)) stack.push(imported);
    }
  }

  reached.delete(storyFile);
  return Array.from(reached).sort();
}
