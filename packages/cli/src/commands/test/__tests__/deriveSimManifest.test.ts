/**
 * Tests for THE ONE ALGORITHM - deriving the real-format module manifest from a
 * sim world (./deriveSimManifest, sim-mode design section 1).
 *
 * Four claims carry the whole sim saga, and each is asserted here:
 *
 *   1. DETERMINISM - the same world produces byte-identical manifest bytes,
 *      whatever order its modules were walked in.
 *   2. THE (a)/(b)/(c) EDIT SHAPES - ordinary edits to the world land exactly
 *      where the server's diff scope expects them, asserted against a verbatim
 *      copy of the API's changed-set rule (see below).
 *   3. A REAL GRAPH - closures are WALKED over module import edges, so a
 *      dependency two hops from a story is in that story's closure without any
 *      fixture hand-flattening it there.
 *   4. FORMAT PARITY - the derived manifest round-trips the CLI's own manifest
 *      validator, and its header/version are CONSTANT across worlds, so two sim
 *      manifests are always comparable (the toolchain-mismatch rung never fires).
 */
import { describe, expect, it } from 'vitest';
import deriveSimManifest, { SIM_MANIFEST_HEADER } from '../deriveSimManifest';
import { validateModuleManifestBuffer } from '../readModuleManifest';
import type { SimModule, SimStory, SimWorld } from '../simWorld';
import stableStringify from '../../../helpers/stableStringify';

// ---------------------------------------------------------------------------
// A COPY OF THE API'S CHANGED-SET RULE, asserted against by the (a)/(b)/(c)
// tests. Source: sherlo-api computeDiffScopeDecision/moduleManifest.ts -
// `computeChangedPaths` (a current path is changed when the ancestor's hash for
// it differs; a new path counts as changed) and `computeCapturedStories` (a
// story is captured when its OWN file is in the changed set - a story is not a
// member of its own closure - or when any of its closure members is). If the
// API's rule ever moves, this copy - and the derivation it judges - must move
// with it.
// ---------------------------------------------------------------------------

type Manifest = { moduleHashes: Record<string, string>; storyClosures: Record<string, string[]> };

function changedPaths(current: Manifest, ancestor: Manifest): Set<string> {
  const changed = new Set<string>();
  for (const [path, hash] of Object.entries(current.moduleHashes)) {
    if (ancestor.moduleHashes[path] !== hash) changed.add(path);
  }
  return changed;
}

function capturedStories(current: Manifest, changed: Set<string>): string[] {
  const captured: string[] = [];
  for (const [storyFilePath, closure] of Object.entries(current.storyClosures)) {
    if (changed.has(storyFilePath) || closure.some((path) => changed.has(path))) {
      captured.push(storyFilePath);
    }
  }
  return captured;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BUTTON = 'src/components/SharedButton.tsx';
const CARD = 'src/components/ProductCard.tsx';
const HOME = 'src/screens/HomeScreen.tsx';
const STORY_FILE = 'src/stories/ProductCard.stories.tsx';
const STORY_ID = 'productcard--basic';

/** Assemble a world from modules - the shape ./simWorld hands the derivation. */
function world(modules: SimModule[]): SimWorld {
  return { simVersion: 1, modules, run: { outcome: 'ok' } };
}

function module(
  path: string,
  content: string,
  imports: string[] = [],
  stories: SimStory[] = []
): SimModule {
  return { path, content, imports, stories };
}

/**
 * The design section 1 example world, with the graph a real app would have:
 * the story file imports the card, the card imports the button, and one module
 * sits outside every closure.
 */
function baseWorld(): SimModule[] {
  return [
    module(BUTTON, 'SharedButton v1'),
    module(CARD, 'ProductCard v1', [BUTTON]),
    module(HOME, 'home, imports nothing captured'),
    module(
      STORY_FILE,
      'story shell',
      [CARD],
      [
        {
          id: STORY_ID,
          title: 'Storefront/ProductCard',
          name: 'Basic',
          render: { text: 'Card', bg: '#ffffff' },
        },
      ]
    ),
  ];
}

/** Find one module of a fixture world so a test can edit it. */
function moduleAt(modules: SimModule[], path: string): SimModule {
  const found = modules.find((entry) => entry.path === path);
  if (!found) throw new Error(`fixture has no module ${path}`);
  return found;
}

// ---------------------------------------------------------------------------
// 1. Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('derives byte-identical manifests from the same world twice', () => {
    const first = deriveSimManifest(world(baseWorld()));
    const second = deriveSimManifest(world(baseWorld()));

    expect(first.raw.equals(second.raw)).toBe(true);
  });

  it('is independent of the order the tree was walked in', () => {
    const forwards = deriveSimManifest(world(baseWorld()));
    const backwards = deriveSimManifest(world(baseWorld().reverse()));

    expect(forwards.raw.equals(backwards.raw)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. The (a)/(b)/(c) edit shapes (sim-mode design section 1's table)
// ---------------------------------------------------------------------------

describe('the (a)/(b)/(c) edit shapes against the API changed-set rule', () => {
  it('(a) a module outside every closure: changed, but ZERO stories captured', () => {
    const ancestor = deriveSimManifest(world(baseWorld())).parsed;

    const edited = baseWorld();
    moduleAt(edited, HOME).content = 'home v2 - reworked, still imported by nothing captured';
    const current = deriveSimManifest(world(edited)).parsed;

    const changed = changedPaths(current, ancestor);
    expect(changed).toEqual(new Set([HOME]));
    expect(capturedStories(current, changed)).toEqual([]);
  });

  it("(b) a module IN the story's closure: story captured, story file's own hash UNMOVED", () => {
    const ancestor = deriveSimManifest(world(baseWorld())).parsed;

    const edited = baseWorld();
    moduleAt(edited, BUTTON).content = 'SharedButton v2';
    const current = deriveSimManifest(world(edited)).parsed;

    const changed = changedPaths(current, ancestor);
    expect(changed).toEqual(new Set([BUTTON]));
    expect(capturedStories(current, changed)).toEqual([STORY_FILE]);

    // The render was untouched, so the story file's module hash is identical -
    // which is exactly what lets the executor re-render the SAME bytes and hit
    // the byte-identical noChanges short-circuit.
    expect(current.moduleHashes[STORY_FILE]).toBe(ancestor.moduleHashes[STORY_FILE]);
  });

  it("(c) a story's render content: its OWN story file hash moves, story captured", () => {
    const ancestor = deriveSimManifest(world(baseWorld())).parsed;

    const edited = baseWorld();
    moduleAt(edited, STORY_FILE).stories[0].render.text = 'Card v2';
    const current = deriveSimManifest(world(edited)).parsed;

    const changed = changedPaths(current, ancestor);
    // The render is folded into the story file's own hashed content - the load-
    // bearing rule that makes the visual lever and the diff-scope lever the
    // same edit. Nothing else moves.
    expect(changed).toEqual(new Set([STORY_FILE]));
    expect(capturedStories(current, changed)).toEqual([STORY_FILE]);
    expect(current.moduleHashes[BUTTON]).toBe(ancestor.moduleHashes[BUTTON]);
  });

  // In a real app a rename is a source edit like any other. It used not to be
  // here: `title`/`name` were invisible to the CLI, so renaming a story changed
  // the name the product shows and moved no hash at all.
  it('a story RENAME moves its file hash, so the diff scope sees it', () => {
    const ancestor = deriveSimManifest(world(baseWorld())).parsed;

    const renamed = baseWorld();
    moduleAt(renamed, STORY_FILE).stories[0].name = 'Default';
    const current = deriveSimManifest(world(renamed)).parsed;

    expect(changedPaths(current, ancestor)).toEqual(new Set([STORY_FILE]));
  });

  // A story that throws is what the DEVICE observes, so declaring it is a story
  // edit, and a story edit is a source edit.
  it("a story's error flag moves its file hash", () => {
    const ancestor = deriveSimManifest(world(baseWorld())).parsed;

    const broken = baseWorld();
    moduleAt(broken, STORY_FILE).stories[0].error = true;
    const current = deriveSimManifest(world(broken)).parsed;

    expect(changedPaths(current, ancestor)).toEqual(new Set([STORY_FILE]));
  });

  // An import edge is part of a module's source, so adding one is an edit the
  // diff scope must see - both in the hash and in every closure it widens.
  it('adding an import moves the importing module and widens the closure', () => {
    const ancestor = deriveSimManifest(world(baseWorld())).parsed;

    const edited = baseWorld();
    moduleAt(edited, CARD).imports = [BUTTON, HOME];
    const current = deriveSimManifest(world(edited)).parsed;

    expect(changedPaths(current, ancestor)).toEqual(new Set([CARD]));
    expect(current.storyClosures[STORY_FILE]).toEqual([CARD, BUTTON, HOME]);
  });

  it('two stories in one file swapping renders still moves the file hash (id is folded in)', () => {
    const twoStories = (): SimModule[] => [
      module(
        STORY_FILE,
        'story shell',
        [],
        [
          { id: 'a--one', render: { text: 'One', bg: '#ffffff' } },
          { id: 'b--two', render: { text: 'Two', bg: '#ffffff' } },
        ]
      ),
    ];

    const ancestor = deriveSimManifest(world(twoStories())).parsed;

    const swapped = twoStories();
    swapped[0].stories[0].render.text = 'Two';
    swapped[0].stories[1].render.text = 'One';
    const current = deriveSimManifest(world(swapped)).parsed;

    expect(current.moduleHashes[STORY_FILE]).not.toBe(ancestor.moduleHashes[STORY_FILE]);
  });
});

// ---------------------------------------------------------------------------
// 3. Closures over a real module graph
// ---------------------------------------------------------------------------

describe('story closures', () => {
  it('excludes the story file from its own closure and sorts members', () => {
    const manifest = deriveSimManifest(world(baseWorld())).parsed;

    expect(manifest.storyClosures[STORY_FILE]).toEqual([CARD, BUTTON]);
    expect(manifest.storyClosures[STORY_FILE]).not.toContain(STORY_FILE);
  });

  // THE POINT OF PUTTING IMPORTS ON MODULES. `SharedButton` is two hops from
  // the story and no file mentions it beside the card that actually imports it.
  // Edges used to hang off STORIES only, so a non-story module had no imports
  // of its own and the fixture author had to list every transitive dependency
  // on the story by hand - making the closure whatever they typed.
  it('reaches a dependency THROUGH a non-story module nobody hand-flattened', () => {
    const manifest = deriveSimManifest(world(baseWorld())).parsed;

    expect(moduleAt(baseWorld(), STORY_FILE).imports).toEqual([CARD]);
    expect(manifest.storyClosures[STORY_FILE]).toContain(BUTTON);
  });

  it('walks a chain of ordinary modules to any depth', () => {
    const chain = [
      module(
        'src/one.stories.tsx',
        'one',
        ['src/two.tsx'],
        [{ id: 'one--story', render: { text: 'One', bg: '#ffffff' } }]
      ),
      module('src/two.tsx', 'two', ['src/three.tsx']),
      module('src/three.tsx', 'three', ['src/four.tsx']),
      module('src/four.tsx', 'four'),
    ];

    const manifest = deriveSimManifest(world(chain)).parsed;

    expect(manifest.storyClosures['src/one.stories.tsx']).toEqual([
      'src/four.tsx',
      'src/three.tsx',
      'src/two.tsx',
    ]);
  });

  it('survives an import cycle without pulling the story into its own closure', () => {
    const cycle = [
      module(
        'src/a.stories.tsx',
        'a',
        ['src/b.stories.tsx'],
        [{ id: 'a--story', render: { text: 'A', bg: '#ffffff' } }]
      ),
      module(
        'src/b.stories.tsx',
        'b',
        ['src/a.stories.tsx'],
        [{ id: 'b--story', render: { text: 'B', bg: '#ffffff' } }]
      ),
    ];

    const manifest = deriveSimManifest(world(cycle)).parsed;

    expect(manifest.storyClosures['src/a.stories.tsx']).toEqual(['src/b.stories.tsx']);
    expect(manifest.storyClosures['src/b.stories.tsx']).toEqual(['src/a.stories.tsx']);
  });

  it('gives a closure only to modules that declare stories', () => {
    const manifest = deriveSimManifest(world(baseWorld())).parsed;

    expect(Object.keys(manifest.storyClosures)).toEqual([STORY_FILE]);
  });
});

// ---------------------------------------------------------------------------
// 4. Format parity with the real manifest road
// ---------------------------------------------------------------------------

describe('format parity', () => {
  it("round-trips the CLI's own module-manifest validator", () => {
    const manifest = deriveSimManifest(world(baseWorld()));

    const validated = validateModuleManifestBuffer(manifest.raw);
    expect(validated).not.toBeNull();
    expect(validated!.parsed.version).toBe(1);
    expect(Object.keys(validated!.parsed.storyClosures)).toEqual([STORY_FILE]);
  });

  it('emits a CONSTANT header and version across different worlds (comparability)', () => {
    const first = deriveSimManifest(world(baseWorld()));

    const other = baseWorld();
    other.push(module('src/other.tsx', 'a whole different world'));
    moduleAt(other, STORY_FILE).stories[0].render.text = 'Different';
    const second = deriveSimManifest(world(other));

    // The server's areManifestsComparable check: version equal AND the
    // stableStringify of the headers byte-equal. Any variation here would force
    // full captures via the toolchain-mismatch rung.
    expect(first.parsed.version).toBe(second.parsed.version);
    expect(stableStringify(first.parsed.header)).toBe(stableStringify(second.parsed.header));
    expect(first.parsed.header).toEqual(SIM_MANIFEST_HEADER);
  });
});
