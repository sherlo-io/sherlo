/**
 * Tests for THE ONE ALGORITHM - deriving the real-format module manifest from a
 * sim world (./deriveSimManifest, sim-mode design section 1).
 *
 * Three claims carry the whole sim saga, and each is asserted here:
 *
 *   1. DETERMINISM - the same world produces byte-identical manifest bytes,
 *      whatever order the JSON happened to declare its keys in.
 *   2. THE (a)/(b)/(c) EDIT SHAPES - ordinary edits to the ONE world file land
 *      exactly where the server's diff scope expects them, asserted against a
 *      verbatim copy of the API's changed-set rule (see below).
 *   3. FORMAT PARITY - the derived manifest round-trips the CLI's own manifest
 *      validator, and its header/version are CONSTANT across worlds, so two sim
 *      manifests are always comparable (the toolchain-mismatch rung never fires).
 */
import { describe, expect, it } from 'vitest';
import deriveSimManifest, { SIM_MANIFEST_HEADER } from '../deriveSimManifest';
import { validateModuleManifestBuffer } from '../readModuleManifest';
import { validateSimWorld, type SimWorld } from '../simWorld';
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
const HOME = 'src/screens/HomeScreen.tsx';
const STORY_FILE = 'src/stories/SharedButton.stories.tsx';
const STORY_ID = 'sharedbutton--primary';

/** The design section 1 example world: one story, one shared dep, one module no closure reaches. */
function baseWorldJson() {
  return {
    simVersion: 1,
    modules: {
      [BUTTON]: 'SharedButton v1',
      [HOME]: 'home, imports nothing captured',
      [STORY_FILE]: 'story shell',
    } as Record<string, string>,
    stories: [
      {
        id: STORY_ID,
        file: STORY_FILE,
        imports: [BUTTON],
        render: { text: 'Primary Button', bg: '#ffffff' },
      },
    ],
    run: { outcome: 'ok' },
  };
}

/** Validate a raw world value the same way the sim road does, or fail the test. */
function world(json: unknown): SimWorld {
  const result = validateSimWorld(json);
  if (!result.world) {
    throw new Error(`fixture world is invalid:\n${result.problems.join('\n')}`);
  }
  return result.world;
}

// ---------------------------------------------------------------------------
// 1. Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('derives byte-identical manifests from the same world twice', () => {
    const first = deriveSimManifest(world(baseWorldJson()));
    const second = deriveSimManifest(world(baseWorldJson()));

    expect(first.raw.equals(second.raw)).toBe(true);
  });

  it('is independent of the order the world file declared its keys and stories in', () => {
    // The same world with every enumerable order permuted: modules reversed,
    // story keys shuffled, a second story listed first.
    const ordered = {
      simVersion: 1,
      modules: {
        [BUTTON]: 'SharedButton v1',
        [HOME]: 'home',
        [STORY_FILE]: 'story shell',
      },
      stories: [
        { id: 'a--first', file: STORY_FILE, imports: [BUTTON], render: { text: 'A', bg: '#fff' } },
        { id: 'b--second', file: STORY_FILE, imports: [], render: { text: 'B', bg: '#000' } },
      ],
      run: { outcome: 'ok' },
    };
    const permuted = {
      run: { outcome: 'ok' },
      stories: [
        { render: { bg: '#000', text: 'B' }, imports: [], file: STORY_FILE, id: 'b--second' },
        { imports: [BUTTON], render: { bg: '#fff', text: 'A' }, id: 'a--first', file: STORY_FILE },
      ],
      modules: {
        [STORY_FILE]: 'story shell',
        [HOME]: 'home',
        [BUTTON]: 'SharedButton v1',
      },
      simVersion: 1,
    };

    const fromOrdered = deriveSimManifest(world(ordered));
    const fromPermuted = deriveSimManifest(world(permuted));

    expect(fromOrdered.raw.equals(fromPermuted.raw)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. The (a)/(b)/(c) edit shapes (sim-mode design section 1's table)
// ---------------------------------------------------------------------------

describe('the (a)/(b)/(c) edit shapes against the API changed-set rule', () => {
  it('(a) a module outside every closure: changed, but ZERO stories captured', () => {
    const ancestor = deriveSimManifest(world(baseWorldJson())).parsed;

    const edited = baseWorldJson();
    edited.modules[HOME] = 'home v2 - reworked, still imported by nothing captured';
    const current = deriveSimManifest(world(edited)).parsed;

    const changed = changedPaths(current, ancestor);
    expect(changed).toEqual(new Set([HOME]));
    expect(capturedStories(current, changed)).toEqual([]);
  });

  it("(b) a module IN the story's closure: story captured, story file's own hash UNMOVED", () => {
    const ancestor = deriveSimManifest(world(baseWorldJson())).parsed;

    const edited = baseWorldJson();
    edited.modules[BUTTON] = 'SharedButton v2';
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
    const ancestor = deriveSimManifest(world(baseWorldJson())).parsed;

    const edited = baseWorldJson();
    edited.stories[0].render.text = 'Primary Button v2';
    const current = deriveSimManifest(world(edited)).parsed;

    const changed = changedPaths(current, ancestor);
    // The render is folded into the story file's own hashed content - the load-
    // bearing rule that makes the visual lever and the diff-scope lever the
    // same edit. Nothing else moves.
    expect(changed).toEqual(new Set([STORY_FILE]));
    expect(capturedStories(current, changed)).toEqual([STORY_FILE]);
    expect(current.moduleHashes[BUTTON]).toBe(ancestor.moduleHashes[BUTTON]);
  });

  it('two stories in one file swapping renders still moves the file hash (id is folded in)', () => {
    const twoStories = () => ({
      ...baseWorldJson(),
      stories: [
        { id: 'a--one', file: STORY_FILE, imports: [], render: { text: 'One', bg: '#fff' } },
        { id: 'b--two', file: STORY_FILE, imports: [], render: { text: 'Two', bg: '#fff' } },
      ],
    });

    const ancestor = deriveSimManifest(world(twoStories())).parsed;

    const swapped = twoStories();
    swapped.stories[0].render.text = 'Two';
    swapped.stories[1].render.text = 'One';
    const current = deriveSimManifest(world(swapped)).parsed;

    expect(current.moduleHashes[STORY_FILE]).not.toBe(ancestor.moduleHashes[STORY_FILE]);
  });
});

// ---------------------------------------------------------------------------
// 3. Closures
// ---------------------------------------------------------------------------

describe('story closures', () => {
  it('excludes the story file from its own closure and sorts members', () => {
    const manifest = deriveSimManifest(world(baseWorldJson())).parsed;

    expect(manifest.storyClosures[STORY_FILE]).toEqual([BUTTON]);
    expect(manifest.storyClosures[STORY_FILE]).not.toContain(STORY_FILE);
  });

  it('follows declared imports transitively through other story files', () => {
    const json = {
      simVersion: 1,
      modules: {
        'src/a.stories.tsx': 'a',
        'src/b.stories.tsx': 'b',
        'src/leaf.tsx': 'leaf',
        'src/z.tsx': 'z',
      },
      stories: [
        {
          id: 'a--story',
          file: 'src/a.stories.tsx',
          // z declared after b: the closure must come back sorted regardless.
          imports: ['src/z.tsx', 'src/b.stories.tsx'],
          render: { text: 'A', bg: '#fff' },
        },
        {
          id: 'b--story',
          file: 'src/b.stories.tsx',
          imports: ['src/leaf.tsx'],
          render: { text: 'B', bg: '#fff' },
        },
      ],
      run: { outcome: 'ok' },
    };

    const manifest = deriveSimManifest(world(json)).parsed;

    // a reaches b's file directly and leaf THROUGH b, transitively; sorted.
    expect(manifest.storyClosures['src/a.stories.tsx']).toEqual([
      'src/b.stories.tsx',
      'src/leaf.tsx',
      'src/z.tsx',
    ]);
    expect(manifest.storyClosures['src/b.stories.tsx']).toEqual(['src/leaf.tsx']);
  });

  it('survives an import cycle without pulling the story into its own closure', () => {
    const json = {
      simVersion: 1,
      modules: { 'src/a.stories.tsx': 'a', 'src/b.stories.tsx': 'b' },
      stories: [
        {
          id: 'a--story',
          file: 'src/a.stories.tsx',
          imports: ['src/b.stories.tsx'],
          render: { text: 'A', bg: '#fff' },
        },
        {
          id: 'b--story',
          file: 'src/b.stories.tsx',
          imports: ['src/a.stories.tsx'],
          render: { text: 'B', bg: '#fff' },
        },
      ],
      run: { outcome: 'ok' },
    };

    const manifest = deriveSimManifest(world(json)).parsed;

    expect(manifest.storyClosures['src/a.stories.tsx']).toEqual(['src/b.stories.tsx']);
    expect(manifest.storyClosures['src/b.stories.tsx']).toEqual(['src/a.stories.tsx']);
  });
});

// ---------------------------------------------------------------------------
// 4. Format parity with the real manifest road
// ---------------------------------------------------------------------------

describe('format parity', () => {
  it("round-trips the CLI's own module-manifest validator", () => {
    const manifest = deriveSimManifest(world(baseWorldJson()));

    const validated = validateModuleManifestBuffer(manifest.raw);
    expect(validated).not.toBeNull();
    expect(validated!.parsed.version).toBe(1);
    expect(Object.keys(validated!.parsed.storyClosures)).toEqual([STORY_FILE]);
  });

  it('emits a CONSTANT header and version across different worlds (comparability)', () => {
    const first = deriveSimManifest(world(baseWorldJson()));

    const other = baseWorldJson();
    other.modules['src/other.tsx'] = 'a whole different world';
    other.stories[0].render.text = 'Different';
    const second = deriveSimManifest(world(other));

    // The server's areManifestsComparable check: version equal AND the
    // stableStringify of the headers byte-equal. Any variation here would force
    // full captures via the toolchain-mismatch rung.
    expect(first.parsed.version).toBe(second.parsed.version);
    expect(stableStringify(first.parsed.header)).toBe(stableStringify(second.parsed.header));
    expect(first.parsed.header).toEqual(SIM_MANIFEST_HEADER);
  });

  it('normalizes `./`-prefixed declared paths to the `./`-free posix form', () => {
    const json = baseWorldJson();
    json.modules = {
      ['./' + BUTTON]: 'SharedButton v1',
      [HOME]: 'home',
      ['./' + STORY_FILE]: 'story shell',
    };
    json.stories[0].imports = ['./' + BUTTON];

    const manifest = deriveSimManifest(world(json)).parsed;

    expect(Object.keys(manifest.moduleHashes).sort()).toEqual([BUTTON, HOME, STORY_FILE].sort());
    expect(manifest.storyClosures[STORY_FILE]).toEqual([BUTTON]);
  });
});
