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
function buildStorybookGraph(root: string, storyRelPaths: string[]): FakeGraph {
  const requiresPath = path.join(root, '.rnstorybook', 'storybook.requires.ts');
  const ctxPath = `${requiresPath}?ctx`;

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
