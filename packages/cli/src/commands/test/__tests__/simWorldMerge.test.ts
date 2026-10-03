/**
 * THE PROOF THAT COMPOSITION IS GIT'S JOB - real `git merge` over real world
 * trees.
 *
 * This is the reason the world stopped being one file. When every module lived
 * in one `sim-world.json`, two branches touching COMPLETELY DIFFERENT
 * components rewrote the same blob, so git could not compose them and the
 * fixtures grew hand-authored "combined" variants restating a merge git should
 * have produced. Under a tree, a branch's diff is the module it edited.
 *
 * Four claims, and the last two are the ones that bite:
 *
 *   1. Two branches editing DIFFERENT modules merge, and the merged tree is
 *      leaf-for-leaf the world a single author would have written.
 *   2. Two branches editing DIFFERENT FIELDS of the SAME story merge - the
 *      Conflict storyline's whole thesis is that git composes them and only
 *      Sherlo notices one screen now carries two approved truths.
 *   3. Two branches moving the SAME leaf still CONFLICT. A split that made
 *      conflicts disappear would be worse than the blob it replaced.
 *   4. A merge result is still a world the CLI accepts, and it derives the
 *      manifest a hand-authored combination would.
 *
 * Claim 2 is why ./simWorld emits a blank line between siblings: git conflicts
 * on changed lines that merely TOUCH, so with ordinary pretty-printed JSON the
 * copy and the ground it sits on collide. That spacing is generated and
 * checked, never remembered - see the format header.
 */
import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import deriveSimManifest from '../deriveSimManifest';
import {
  formatSimModuleFile,
  formatSimWorldConfig,
  readSimWorld,
  SIM_WORLD_CONFIG_FILENAME,
  SIM_WORLD_DIRNAME,
  type SimModule,
} from '../simWorld';
import { GitFixture } from '../../../helpers/__tests__/support/gitFixture';

const fixtures: GitFixture[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

const BUTTON = 'src/components/Storefront/SharedButton.tsx';
const CARD = 'src/components/Storefront/ProductCard.tsx';
const CARD_STORIES = 'src/components/Storefront/ProductCard.stories.tsx';
const TYPOGRAPHY = 'src/components/Typography/Typography.tsx';
const TYPOGRAPHY_STORIES = 'src/components/Typography/Typography.stories.tsx';

/** The trunk world every branch below forks from - two unrelated components. */
function trunkModules(): SimModule[] {
  return [
    { path: BUTTON, content: 'SharedButton v1 - blue #0066cc button', imports: [], stories: [] },
    {
      path: CARD,
      content: "ProductCard v1 - 'Sherlo Widget' at $29.99, renders SharedButton",
      imports: [BUTTON],
      stories: [],
    },
    {
      path: CARD_STORIES,
      content: 'ProductCard stories v1',
      imports: [CARD],
      stories: [
        {
          id: 'storefront-productcard--basic',
          title: 'Storefront/ProductCard',
          name: 'Basic',
          render: { text: 'Sherlo Widget / $29.99', bg: '#ffffff' },
        },
      ],
    },
    {
      path: TYPOGRAPHY,
      content: 'Typography v1 - FontScales heading',
      imports: [],
      stories: [],
    },
    {
      path: TYPOGRAPHY_STORIES,
      content: 'Typography stories v1',
      imports: [TYPOGRAPHY],
      stories: [
        {
          id: 'typography--scales',
          title: 'Typography',
          name: 'Scales',
          render: { text: 'Font Sizes / The quick brown fox', bg: '#ffffff' },
        },
      ],
    },
  ];
}

function moduleAt(modules: SimModule[], modulePath: string): SimModule {
  const found = modules.find((entry) => entry.path === modulePath);
  if (!found) throw new Error(`fixture has no module ${modulePath}`);
  return found;
}

/** Write a world tree into a git fixture, in the canonical bytes. */
function writeWorld(fixture: GitFixture, modules: SimModule[]): void {
  const write = (relativePath: string, text: string): void => {
    const absolute = path.join(fixture.dir, SIM_WORLD_DIRNAME, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, text, 'utf8');
  };

  write(SIM_WORLD_CONFIG_FILENAME, formatSimWorldConfig({ simVersion: 1, run: { outcome: 'ok' } }));
  for (const module of modules) write(`${module.path}.json`, formatSimModuleFile(module));
}

/** A repo whose main line carries the trunk world. */
function repoOnTrunk(): GitFixture {
  const fixture = GitFixture.create();
  fixtures.push(fixture);
  writeWorld(fixture, trunkModules());
  fixture.commit('the trunk world');
  return fixture;
}

/** Branch off main, apply an edit to the world, commit. */
function branchWithEdit(
  fixture: GitFixture,
  name: string,
  edit: (modules: SimModule[]) => void
): void {
  fixture.checkout('main');
  fixture.branch(name, { checkout: true });
  const modules = trunkModules();
  edit(modules);
  writeWorld(fixture, modules);
  fixture.commit(`${name}'s edit`);
}

/** Merge `ref` into the current branch, reporting whether git could do it. */
function mergeSucceeds(fixture: GitFixture, ref: string): boolean {
  try {
    fixture.merge(ref);
    return true;
  } catch {
    return false;
  }
}

/** The world the repo's working tree currently holds. */
function worldInRepo(fixture: GitFixture): ReturnType<typeof readSimWorld> {
  return readSimWorld(path.join(fixture.dir, SIM_WORLD_DIRNAME));
}

describe('two branches touching different components', () => {
  it('merge, and produce the world a single author would have written', () => {
    const fixture = repoOnTrunk();

    branchWithEdit(fixture, 'restyle-button', (modules) => {
      moduleAt(modules, BUTTON).content = 'SharedButton v2 - green #1e7a3c button';
    });
    branchWithEdit(fixture, 'retint-typography', (modules) => {
      moduleAt(modules, TYPOGRAPHY_STORIES).stories[0].render.bg = '#eef2f7';
    });

    fixture.checkout('restyle-button');
    expect(mergeSucceeds(fixture, 'retint-typography')).toBe(true);

    // The combined world, written by hand the way a "combined variant" used to
    // have to be. The merge must reproduce it leaf for leaf.
    const combined = trunkModules();
    moduleAt(combined, BUTTON).content = 'SharedButton v2 - green #1e7a3c button';
    moduleAt(combined, TYPOGRAPHY_STORIES).stories[0].render.bg = '#eef2f7';

    expect(worldInRepo(fixture).parsed.modules).toEqual(
      [...combined].sort((a, b) => (a.path < b.path ? -1 : 1))
    );
  });

  it('produce the manifest that hand-authored combination would have', () => {
    const fixture = repoOnTrunk();

    branchWithEdit(fixture, 'restyle-button', (modules) => {
      moduleAt(modules, BUTTON).content = 'SharedButton v2 - green #1e7a3c button';
    });
    branchWithEdit(fixture, 'retint-typography', (modules) => {
      moduleAt(modules, TYPOGRAPHY_STORIES).stories[0].render.bg = '#eef2f7';
    });

    fixture.checkout('restyle-button');
    fixture.merge('retint-typography');

    const combined = trunkModules();
    moduleAt(combined, BUTTON).content = 'SharedButton v2 - green #1e7a3c button';
    moduleAt(combined, TYPOGRAPHY_STORIES).stories[0].render.bg = '#eef2f7';

    const merged = deriveSimManifest(worldInRepo(fixture).parsed);
    const handAuthored = deriveSimManifest({
      simVersion: 1,
      run: { outcome: 'ok' },
      modules: [...combined].sort((a, b) => (a.path < b.path ? -1 : 1)),
    });

    expect(merged.raw.equals(handAuthored.raw)).toBe(true);
  });
});

// The Conflict storyline: two branches approve different images of ONE screen.
// Its whole thesis is that GIT merges them and only Sherlo notices, so this
// merge succeeding is a product claim, not a formatting convenience.
describe('two branches touching different fields of the same story', () => {
  it('merge, carrying both edits', () => {
    const fixture = repoOnTrunk();

    branchWithEdit(fixture, 'conflict-a', (modules) => {
      moduleAt(modules, TYPOGRAPHY_STORIES).stories[0].render.text =
        'Font Sizes on branch A / The quick brown fox';
    });
    branchWithEdit(fixture, 'conflict-b', (modules) => {
      moduleAt(modules, TYPOGRAPHY_STORIES).stories[0].render.bg = '#e8f0ff';
    });

    fixture.checkout('conflict-a');
    expect(mergeSucceeds(fixture, 'conflict-b')).toBe(true);

    const story = worldInRepo(fixture).parsed.modules.find(
      (module) => module.path === TYPOGRAPHY_STORIES
    )!.stories[0];

    expect(story.render).toEqual({
      text: 'Font Sizes on branch A / The quick brown fox',
      bg: '#e8f0ff',
    });
  });
});

// THE TRAP, kept executable so nobody tidies the blank lines away as noise.
// Splitting the world is NOT enough on its own: with ordinary pretty-printed
// JSON the copy and the ground sit on touching lines, and the Conflict
// storyline's merge - which the test above proves - fails instead.
describe('the same two edits under ordinary pretty-printed JSON', () => {
  it('CONFLICT, which is why the canonical form spaces siblings out', () => {
    const fixture = repoOnTrunk();

    const writeUnspaced = (branch: string, edit: (module: SimModule) => void): void => {
      fixture.checkout('main');
      fixture.branch(branch, { checkout: true });
      const modules = trunkModules();
      edit(moduleAt(modules, TYPOGRAPHY_STORIES));
      for (const module of modules) {
        fs.writeFileSync(
          path.join(fixture.dir, SIM_WORLD_DIRNAME, `${module.path}.json`),
          JSON.stringify(module, null, 2) + '\n',
          'utf8'
        );
      }
      fixture.commit(`${branch}'s edit`);
    };

    // Both branches start from the unspaced spelling, so the only difference
    // between this and the merging case above is the blank lines.
    writeUnspaced('unspaced-base', () => undefined);
    fixture.checkout('main');
    fixture.merge('unspaced-base');

    fixture.branch('unspaced-a', { checkout: true });
    const branchA = trunkModules();
    moduleAt(branchA, TYPOGRAPHY_STORIES).stories[0].render.text = 'Font Sizes on branch A';
    fs.writeFileSync(
      path.join(fixture.dir, SIM_WORLD_DIRNAME, `${TYPOGRAPHY_STORIES}.json`),
      JSON.stringify(moduleAt(branchA, TYPOGRAPHY_STORIES), null, 2) + '\n',
      'utf8'
    );
    fixture.commit("branch A's heading");

    fixture.checkout('main');
    fixture.branch('unspaced-b', { checkout: true });
    const branchB = trunkModules();
    moduleAt(branchB, TYPOGRAPHY_STORIES).stories[0].render.bg = '#e8f0ff';
    fs.writeFileSync(
      path.join(fixture.dir, SIM_WORLD_DIRNAME, `${TYPOGRAPHY_STORIES}.json`),
      JSON.stringify(moduleAt(branchB, TYPOGRAPHY_STORIES), null, 2) + '\n',
      'utf8'
    );
    fixture.commit("branch B's ground");

    fixture.checkout('unspaced-a');
    expect(mergeSucceeds(fixture, 'unspaced-b')).toBe(false);
  });
});

// A split that made conflicts disappear would be worse than the blob it
// replaced: two people cannot both own one value, and git must say so.
describe('two branches moving the same leaf', () => {
  it('CONFLICT, and the world does not read until a human resolves it', () => {
    const fixture = repoOnTrunk();

    branchWithEdit(fixture, 'heading-a', (modules) => {
      moduleAt(modules, TYPOGRAPHY_STORIES).stories[0].render.text = 'Heading A';
    });
    branchWithEdit(fixture, 'heading-b', (modules) => {
      moduleAt(modules, TYPOGRAPHY_STORIES).stories[0].render.text = 'Heading B';
    });

    fixture.checkout('heading-a');
    expect(mergeSucceeds(fixture, 'heading-b')).toBe(false);

    // Conflict markers are not JSON, so the run refuses rather than picking a
    // side - naming the one file a human has to settle.
    expect(() => worldInRepo(fixture)).toThrow(/Typography\.stories\.tsx\.json is not valid JSON/);
  });

  it('CONFLICT when the same module content is rewritten twice', () => {
    const fixture = repoOnTrunk();

    branchWithEdit(fixture, 'card-a', (modules) => {
      moduleAt(modules, CARD).content = 'ProductCard v2 - branch A';
    });
    branchWithEdit(fixture, 'card-b', (modules) => {
      moduleAt(modules, CARD).content = 'ProductCard v2 - branch B';
    });

    fixture.checkout('card-a');
    expect(mergeSucceeds(fixture, 'card-b')).toBe(false);
  });
});

// The other half of change-a-different-file: a branch that ADDS a component and
// one that EDITS an existing one compose without either knowing about the other.
describe('adding and deleting modules', () => {
  it('merges a branch that adds a module with one that edits another', () => {
    const fixture = repoOnTrunk();

    branchWithEdit(fixture, 'adds-a-screen', (modules) => {
      modules.push({
        path: 'src/screens/Settings.tsx',
        content: 'Settings v1',
        imports: [],
        stories: [],
      });
    });
    branchWithEdit(fixture, 'edits-the-card', (modules) => {
      moduleAt(modules, CARD).content = 'ProductCard v2';
    });

    fixture.checkout('adds-a-screen');
    expect(mergeSucceeds(fixture, 'edits-the-card')).toBe(true);

    const world = worldInRepo(fixture).parsed;
    expect(world.modules.map((module) => module.path)).toContain('src/screens/Settings.tsx');
    expect(moduleAt(world.modules, CARD).content).toBe('ProductCard v2');
  });

  // Story-set contraction is a DELETED FILE now, which is a shape git already
  // knows how to merge. Under one blob it could only be spelled by rewriting
  // the whole world.
  it('merges a branch that deletes a story file with one that edits another', () => {
    const fixture = repoOnTrunk();

    fixture.checkout('main');
    fixture.branch('drops-typography', { checkout: true });
    writeWorld(
      fixture,
      trunkModules().filter(
        (module) => module.path !== TYPOGRAPHY && module.path !== TYPOGRAPHY_STORIES
      )
    );
    fs.rmSync(path.join(fixture.dir, SIM_WORLD_DIRNAME, 'src/components/Typography'), {
      recursive: true,
    });
    fixture.commit('drop the Typography component');

    branchWithEdit(fixture, 'edits-the-card', (modules) => {
      moduleAt(modules, CARD).content = 'ProductCard v2';
    });

    fixture.checkout('drops-typography');
    expect(mergeSucceeds(fixture, 'edits-the-card')).toBe(true);

    const world = worldInRepo(fixture).parsed;
    expect(world.modules.map((module) => module.path)).toEqual([CARD, CARD_STORIES, BUTTON].sort());
    expect(moduleAt(world.modules, CARD).content).toBe('ProductCard v2');
  });
});
