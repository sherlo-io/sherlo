/**
 * THE ONE ALGORITHM: derive the real-format module manifest from a sim world,
 * exactly as Metro's serializer derives one from source (sim-mode design
 * section 1). The server never learns a second manifest format -
 * readModuleManifest / computeDiffScopeDecision run unchanged on what this
 * produces.
 *
 * The rules, and why each is load-bearing:
 *
 * - `moduleHashes[path] = sha256(everything the module's own file declares)`:
 *   its content, its import edges, and - when it is a story file - its stories'
 *   identity, error flag and render. Folding all of it into the module's OWN
 *   hash is what makes the visual lever and the diff-scope lever the same edit -
 *   change a story's `render.text` and its story file's hash moves, so the
 *   story is captured AND draws differently, just as in a real app. The story's
 *   `title`/`name` are in there for the same reason: a rename is a source edit,
 *   and a source edit the diff scope cannot see is a lie about the app.
 *
 * - `storyClosures[storyFile] = sorted transitive closure over the MODULE
 *   import graph, the story file excluded from its own closure` - mirroring the
 *   serializer's collectForwardClosure (story-not-in-own-closure included; the
 *   server's capture rule has a dedicated term for direct story edits).
 *
 *   The graph is walked, not read. Imports are declared per MODULE, so
 *   `ProductCard.stories.tsx -> ProductCard.tsx -> SharedButton.tsx` is three
 *   files each naming only what it imports, and the closure of the story file
 *   contains SharedButton because the walk REACHES it. Imports used to sit on
 *   stories, which gave the graph edges out of story files only: a fixture
 *   author had to hand-flatten every transitive dependency onto the story, so
 *   the closure was whatever they typed rather than anything the graph implied,
 *   and a depth-two change could not be expressed at all.
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
import type { SimModule, SimWorld } from './simWorld';

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
  const importsByModule = new Map<string, string[]>();
  const moduleHashes: Record<string, string> = {};

  for (const module of world.modules) {
    importsByModule.set(module.path, module.imports);
    moduleHashes[module.path] = hashModule(module);
  }

  const storyClosures: Record<string, string[]> = {};
  for (const module of world.modules) {
    if (module.stories.length === 0) continue;
    storyClosures[module.path] = collectTransitiveImports(module.path, importsByModule);
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

/**
 * A module's hash pre-image: everything its own file declares, canonically
 * serialized. Nothing a module file can say is left out - an edit that changes
 * no hash would be an edit the diff scope cannot see.
 */
function hashModule(module: SimModule): string {
  const preimage = stableStringify({
    content: module.content,
    imports: module.imports,
    stories: module.stories,
  });

  return crypto.createHash('sha256').update(preimage, 'utf8').digest('hex');
}

/**
 * Every module reachable from a story file over the declared import edges, with
 * the story file itself excluded from its own closure - even when a cycle
 * reaches back to it.
 */
function collectTransitiveImports(
  storyFile: string,
  importsByModule: ReadonlyMap<string, string[]>
): string[] {
  const reached = new Set<string>();
  const followed = new Set<string>();
  const stack = [storyFile];

  while (stack.length > 0) {
    const from = stack.pop() as string;
    if (followed.has(from)) continue;
    followed.add(from);

    for (const imported of importsByModule.get(from) ?? []) {
      reached.add(imported);
      if (!followed.has(imported)) stack.push(imported);
    }
  }

  reached.delete(storyFile);
  return Array.from(reached).sort();
}
