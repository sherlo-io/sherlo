'use strict';

/**
 * Regression coverage for what-the-bundle-tells-the-server-about-itself
 * (SHERLO-1894/1919 Diff Scope). A story newly taken into the Storybook glob
 * (e.g. a `.rnstorybook/main.ts` pattern widened to cover a folder that
 * already existed on disk) was reported by the server as "reused from the
 * previous build" - a build that never held it. The server's own union rule
 * (sherlo-api#388, traced by hand) only fails to notice a new story when that
 * story's OWN FILE is missing from `moduleHashes`, or its key is missing from
 * `storyClosures`, or both - the manifest is the one place either could go
 * wrong on this repository's side.
 *
 * This pins the manifest's half of the contract directly: a story require.
 * context newly matches a file the graph never carried before, and the
 * emitted manifest must carry that file's OWN hash and OWN closure - the
 * server cannot mark anything "changed" for a story it was never told about.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const applySherloTransforms = require('../../metro/applySherloTransforms');

type FakeModule = { output: { data: { code: string } }[]; dependencies: Map<string, unknown> };
type FakeGraph = { dependencies: Map<string, FakeModule> };

function fakeModule(code: string, deps: Map<string, unknown>): FakeModule {
  return { output: [{ data: { code } }], dependencies: deps };
}

/**
 * A require.context-based Storybook graph rooted at `root`, matching exactly
 * one story file, modeled the same way `.rnstorybook/main.ts`'s glob resolves
 * into `storybook.requires.ts`'s generated require.context.
 */
function buildStorybookGraph(
  root: string,
  storyRelPaths: string[],
  contextDirRelPath = 'src'
): FakeGraph {
  const requiresPath = path.join(root, '.rnstorybook', 'storybook.requires.ts');
  // Metro names a require.context module `<directory>?ctx=<hash>`, and that
  // suffix is the only place the gathered directory is recorded - the manifest
  // reads the story titles' base directory back out of it.
  const ctxPath = `${path.join(root, contextDirRelPath)}?ctx=0123456789abcdef`;

  const dependencies = new Map<string, FakeModule>();
  const ctxDeps = new Map<string, unknown>();

  storyRelPaths.forEach((storyRelPath, index) => {
    const storyAbsPath = path.join(root, storyRelPath);
    const componentAbsPath = storyAbsPath.replace(/\.stories\.tsx$/, '.tsx');
    ctxDeps.set(`story${index}`, { absolutePath: storyAbsPath, data: { data: {} } });
    dependencies.set(
      storyAbsPath,
      fakeModule(
        `STORY_CODE_${index}`,
        new Map([['component', { absolutePath: componentAbsPath, data: { data: {} } }]])
      )
    );
    dependencies.set(componentAbsPath, fakeModule(`COMPONENT_CODE_${index}`, new Map()));
  });

  dependencies.set(
    requiresPath,
    fakeModule(
      'REQUIRES_CODE',
      new Map([['ctx', { absolutePath: ctxPath, data: { data: { contextParams: {} } } }]])
    )
  );
  dependencies.set(ctxPath, fakeModule('CTX_CODE', ctxDeps));

  return { dependencies };
}

/** Emits the manifest sidecar for `graph` and returns it parsed. */
function emitManifest(
  root: string,
  graph: FakeGraph
): {
  moduleHashes: Record<string, string>;
  storyClosures: Record<string, string[]>;
  storyTitles: Record<string, string>;
} {
  const result = applySherloTransforms(
    { projectRoot: root, resolver: {}, serializer: { customSerializer: () => 'BYTES' } },
    { enabled: true }
  );
  result.serializer.customSerializer('index.js', [], graph, { projectRoot: root });
  const manifestPath = path.join(root, 'node_modules', '.cache', 'sherlo', 'module-manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

describe('module manifest - a story newly taken into the Storybook glob', () => {
  const ENV_FLAG = 'SHERLO_MODULE_MANIFEST';

  beforeEach(() => {
    process.env[ENV_FLAG] = '1';
  });
  afterEach(() => {
    delete process.env[ENV_FLAG];
  });

  it('a story file the previous bundle never carried is emitted with its own hash and its own closure', () => {
    // The ancestor build's glob matched only Button - Typography's folder
    // existed on disk but the glob never reached it, so the ancestor's graph
    // (and therefore its manifest) never carried Typography at all.
    const ancestorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-ancestor-'));
    const ancestorGraph = buildStorybookGraph(ancestorRoot, ['src/Button.stories.tsx']);
    const ancestorManifest = emitManifest(ancestorRoot, ancestorGraph);
    fs.rmSync(ancestorRoot, { recursive: true, force: true });

    // The current build's glob was widened to also match Typography - a
    // second require.context target the ancestor's manifest has no key for.
    const currentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-current-'));
    const currentGraph = buildStorybookGraph(currentRoot, [
      'src/Button.stories.tsx',
      'src/Typography/Typography.stories.tsx',
    ]);
    const currentManifest = emitManifest(currentRoot, currentGraph);
    fs.rmSync(currentRoot, { recursive: true, force: true });

    const newStoryPath = './src/Typography/Typography.stories.tsx';
    const newComponentPath = './src/Typography/Typography.tsx';

    // The new story's file is a key the ancestor manifest never had...
    expect(ancestorManifest.moduleHashes[newStoryPath]).toBeUndefined();
    expect(ancestorManifest.storyClosures[newStoryPath]).toBeUndefined();

    // ...and the current manifest carries it with its own hash...
    expect(currentManifest.moduleHashes[newStoryPath]).toMatch(/^[0-9a-f]{64}$/);
    // ...and its own closure, reaching the component the story renders.
    expect(currentManifest.storyClosures[newStoryPath]).toContain(newComponentPath);

    // The pre-existing story is unaffected - the widened glob did not touch it.
    expect(currentManifest.storyClosures['./src/Button.stories.tsx']).toEqual(
      ancestorManifest.storyClosures['./src/Button.stories.tsx']
    );
  });
});

/**
 * The manifest's story set is keyed by SOURCE FILE PATH, and the server narrows
 * a build's capture scope by matching that key against the project's configured
 * include/exclude lists. The runner on the device narrows by a different string
 * entirely: a snapshot's display name, `"<title> - <story name>"`, whose first
 * half is the Storybook TITLE of the story's file. The two only coincide by
 * accident - the fixture app's `Sanity/Hello` lives at
 * `src/components/Sanity/Hello.stories.tsx`, which would DERIVE the title
 * `components/Sanity/Hello`. A server that matched paths could therefore drop a
 * story the runner photographs, an under-capture.
 *
 * So the manifest carries the title beside the path. A title that cannot be
 * read without evaluating the story file is OMITTED rather than guessed: the
 * server reads an absent title as "cannot rule this story out" and captures it,
 * while a guessed one would be the same defect wearing a different hat.
 */
describe('module manifest - the title the runner matches a story by', () => {
  const ENV_FLAG = 'SHERLO_MODULE_MANIFEST';

  beforeEach(() => {
    process.env[ENV_FLAG] = '1';
  });
  afterEach(() => {
    delete process.env[ENV_FLAG];
  });

  /** A story file that declares its title straight on the default export. */
  const DECLARED_TITLE_STORY = `import Hello from './Hello';

export default { title: 'Sanity/Hello', component: Hello };
export const Default = {};
`;

  /** The other ordinary CSF form: a named meta constant, exported as default. */
  const CONST_META_STORY = `import type { Meta } from '@storybook/react';
import PriceTag from './PriceTag';

const meta = { title: 'Storefront/PriceTag', component: PriceTag } satisfies Meta<typeof PriceTag>;
export default meta;
export const Default = {};
`;

  /** No title at all - Storybook derives one from the file's path. */
  const AUTO_TITLED_STORY = `import Typography from './Typography';

export default { component: Typography };
export const Default = {};
`;

  /** A title only evaluation could resolve - the manifest must stay silent. */
  const COMPUTED_TITLE_STORY = `import { buildTitle } from '../../titles';
import Mystery from './Mystery';

export default { title: buildTitle('Mystery'), component: Mystery };
export const Default = {};
`;

  const STORY_FILES = [
    { relPath: 'src/components/Sanity/Hello.stories.tsx', source: DECLARED_TITLE_STORY },
    { relPath: 'src/components/Storefront/PriceTag.stories.tsx', source: CONST_META_STORY },
    { relPath: 'src/components/Typography/Typography.stories.tsx', source: AUTO_TITLED_STORY },
    { relPath: 'src/components/Mystery/Mystery.stories.tsx', source: COMPUTED_TITLE_STORY },
  ];

  /**
   * The loader file @storybook/react-native's generator writes, in its own
   * shape: one entry per `stories` glob, carrying the two fields Storybook
   * titles with (titlePrefix, directory) beside the require.context that
   * gathers the files.
   */
  function requiresFileSource(titlePrefix: string): string {
    return `/* do not change this file, it is auto generated by storybook. */
import { start, updateView, View } from '@storybook/react-native';

const normalizedStories = [
  {
    titlePrefix: "${titlePrefix}",
    directory: "./src",
    files: "**/*.stories.tsx",
    importPathMatcher: /\\.stories\\.tsx$/,
    // @ts-ignore
    req: require.context('../src', true, /\\.stories\\.tsx$/),
  },
];

global.STORIES = normalizedStories;

export const view: View = global.view;
`;
  }

  function writeProjectFile(root: string, relPath: string, source: string): void {
    const absPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, source, 'utf8');
  }

  /**
   * A project on disk whose story files and generated loader are the real
   * sources the manifest reads - the graph alone carries neither titles nor the
   * loader's titlePrefix.
   */
  function createProject(options: { titlePrefix: string; withLoaderFile: boolean }): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-titles-'));
    STORY_FILES.forEach((story) => writeProjectFile(root, story.relPath, story.source));
    if (options.withLoaderFile) {
      writeProjectFile(
        root,
        path.join('.rnstorybook', 'storybook.requires.ts'),
        requiresFileSource(options.titlePrefix)
      );
    }
    return root;
  }

  function emitStoryTitles(options: {
    titlePrefix: string;
    withLoaderFile: boolean;
  }): Record<string, string> {
    const root = createProject(options);
    const graph = buildStorybookGraph(
      root,
      STORY_FILES.map((story) => story.relPath)
    );
    const manifest = emitManifest(root, graph);
    fs.rmSync(root, { recursive: true, force: true });
    return manifest.storyTitles;
  }

  it('each story in the manifest carries the display name the runner would match it by', () => {
    const storyTitles = emitStoryTitles({ titlePrefix: '', withLoaderFile: true });

    // Declared on the default export, and NOT the `components/Sanity/Hello`
    // its path would derive - the very mismatch this field removes.
    expect(storyTitles['./src/components/Sanity/Hello.stories.tsx']).toBe('Sanity/Hello');
    // Declared on a named meta constant that is exported as default.
    expect(storyTitles['./src/components/Storefront/PriceTag.stories.tsx']).toBe(
      'Storefront/PriceTag'
    );
    // Declared nowhere, so Storybook derives it from the path relative to the
    // loader's directory - and says the repeated folder name only once.
    expect(storyTitles['./src/components/Typography/Typography.stories.tsx']).toBe(
      'components/Typography'
    );
  });

  it('a story whose title only evaluation could resolve carries no title at all', () => {
    const storyTitles = emitStoryTitles({ titlePrefix: '', withLoaderFile: true });

    expect(storyTitles['./src/components/Mystery/Mystery.stories.tsx']).toBeUndefined();
    // Absent, never empty: an empty string is a title the server could match on.
    expect(Object.values(storyTitles)).not.toContain('');
    // One uncertain story costs its own title and no other's.
    expect(Object.keys(storyTitles)).toHaveLength(STORY_FILES.length - 1);
  });

  it("the loader's titlePrefix is carried into every title, declared or derived", () => {
    const storyTitles = emitStoryTitles({ titlePrefix: 'UI', withLoaderFile: true });

    expect(storyTitles['./src/components/Sanity/Hello.stories.tsx']).toBe('UI/Sanity/Hello');
    expect(storyTitles['./src/components/Typography/Typography.stories.tsx']).toBe(
      'UI/components/Typography'
    );
  });

  it('no readable loader leaves every story untitled rather than titled by its path', () => {
    const storyTitles = emitStoryTitles({ titlePrefix: '', withLoaderFile: false });

    // A title cannot be trusted without the loader's titlePrefix - not even a
    // declared one, which Storybook also prefixes. The map is still emitted, so
    // a consumer can tell this SDK from one that predates titles entirely.
    expect(storyTitles).toEqual({});
  });
});

/**
 * The derived half of a title is pure arithmetic over a path, and Storybook's
 * own version of it has three quirks that are easy to lose in a refactor: the
 * repeated folder name, the meaningless file name, and the loader directory it
 * strips out of the key first. Every expectation below was produced by running
 * Storybook's own `sanitize` + `pathJoin` (autoTitle.ts, as bundled in
 * storybook@9) against the same input, so this table is upstream's answer and
 * not ours. Getting one wrong means inventing a title the runner never matches.
 */
describe('module manifest - the title Storybook derives from a story path', () => {
  const storyTitleReader = require('../../metro/storyTitleReader');

  const SRC_LOADER = { contextDirAbsPath: '/project/src', directory: './src', titlePrefix: '' };

  it('derives the title Storybook derives, quirk for quirk', () => {
    const derive = (contextKey: string): string =>
      storyTitleReader.deriveAutoTitle(SRC_LOADER, contextKey).replace('./', '');

    expect(derive('./Button.stories.tsx')).toBe('Button');
    expect(derive('./components/Sanity/Hello.stories.tsx')).toBe('components/Sanity/Hello');
    // A folder does not say its own name twice.
    expect(derive('./Button/Button.stories.tsx')).toBe('Button');
    // A file name that says nothing is dropped, not titled.
    expect(derive('./Button/index.stories.tsx')).toBe('Button');
    expect(derive('./Button/stories.tsx')).toBe('Button');
    // Only the story extension is stripped - a dot in the name survives.
    expect(derive('./Odd.Name.stories.tsx')).toBe('Odd.Name');
    // The loader's own directory is stripped out of the key first, which bites
    // a project whose src folder holds a second folder of the same name.
    expect(derive('./src/Nested.stories.tsx')).toBe('Nested');
  });

  it('reads a declared title only from the forms a human wrote literally', () => {
    const read = (source: string) => storyTitleReader.readDeclaredTitle(source);

    expect(read("export default { title: 'Sanity/Hello' };")).toEqual({
      isKnown: true,
      declaredTitle: 'Sanity/Hello',
    });
    expect(read("const meta = { title: 'A/B' };\nexport default meta;")).toEqual({
      isKnown: true,
      declaredTitle: 'A/B',
    });
    // No title declared: Storybook derives one from the path, and so do we.
    expect(read('export default { component: Hello };')).toEqual({
      isKnown: true,
      declaredTitle: null,
    });
    // A spread could carry a title, or overwrite the one written beside it.
    expect(read("export default { ...base, title: 'A/B' };")).toEqual({ isKnown: false });
    // Computed, imported, and absent default exports are all unknowable.
    expect(read("export default { title: buildTitle('A') };")).toEqual({ isKnown: false });
    expect(read('export default baseMeta;')).toEqual({ isKnown: false });
    expect(read('export const Default = {};')).toEqual({ isKnown: false });
  });
});

/**
 * Which loader entry gathered a story decides its titlePrefix, and Metro's graph
 * names only the DIRECTORY a require.context reads - not the file-name matcher
 * Storybook picks between two entries over the same directory with. Two such
 * entries that disagree therefore leave the choice unknowable.
 */
describe('module manifest - which loader entry a story belongs to', () => {
  const storyTitleReader = require('../../metro/storyTitleReader');

  const stories = { contextDirAbsPath: '/project/src', directory: './src' };

  it('two entries over one directory decide the title only when they agree', () => {
    const agreeing = [
      { ...stories, titlePrefix: 'UI' },
      { ...stories, titlePrefix: 'UI' },
    ];
    expect(storyTitleReader.findLoaderEntry(agreeing, '/project/src')).toEqual(agreeing[0]);

    const disagreeing = [
      { ...stories, titlePrefix: 'UI' },
      { ...stories, titlePrefix: 'Docs' },
    ];
    expect(storyTitleReader.findLoaderEntry(disagreeing, '/project/src')).toBeNull();
  });

  it('a directory no entry claims has no loader entry at all', () => {
    const entries = [{ ...stories, titlePrefix: '' }];

    expect(storyTitleReader.findLoaderEntry(entries, '/project/packages/ui')).toBeNull();
    // Metro writes `<directory>?ctx=<hash>`; a path without that marker is not a
    // context module, so there is no directory to match on.
    expect(storyTitleReader.findLoaderEntry(entries, null)).toBeNull();
  });
});
