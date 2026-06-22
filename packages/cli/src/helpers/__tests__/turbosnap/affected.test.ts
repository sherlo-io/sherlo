import { describe, expect, it } from 'vitest';
import { affected } from '../../turbosnap/affected';
import type { DependencyGraph } from '../../turbosnap/dependencyGraph';
import type { StoryEntry } from '../../turbosnap/affected';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGraph(
  inverseGraph: Record<string, string[]>,
  contextGraph: Record<string, string[]> = {}
): DependencyGraph {
  return { version: 1, inverseGraph, contextGraph };
}

function storyIds(result: ReturnType<typeof affected>): string[] {
  if ('fullRun' in result) throw new Error('Expected storyIds but got fullRun: ' + result.reason);
  return result.storyIds.slice().sort();
}

function isFullRun(result: ReturnType<typeof affected>): boolean {
  return 'fullRun' in result;
}

// ---------------------------------------------------------------------------
// 1. Changed leaf story file → only that story
// ---------------------------------------------------------------------------

describe('affected – integration: changed leaf story file', () => {
  it('returns only the story whose own file changed', () => {
    const graph = makeGraph({
      './src/Button.tsx': ['./src/Button.stories.tsx'],
      './src/Button.stories.tsx': [],
      './src/Other.stories.tsx': [],
    });
    const stories: StoryEntry[] = [
      { id: 'button--primary', importPath: './src/Button.stories.tsx' },
      { id: 'button--secondary', importPath: './src/Button.stories.tsx' },
      { id: 'other--default', importPath: './src/Other.stories.tsx' },
    ];

    // Changed: Button.stories.tsx directly (the story file itself)
    // contextGraph has storybook.requires.ts → all stories, so story files
    // being context targets forces full run per conservatism invariant.
    // BUT here we use an empty contextGraph, meaning no require.context tracking →
    // the story file is just a plain file, treated via BFS as-is.
    const result = affected(['./src/Button.stories.tsx'], graph, stories);

    expect(isFullRun(result)).toBe(false);
    expect(storyIds(result)).toEqual(['button--primary', 'button--secondary']);
  });
});

// ---------------------------------------------------------------------------
// 2. Changed shared module → all transitive-importer stories
// ---------------------------------------------------------------------------

describe('affected – integration: changed shared module', () => {
  it('finds all stories that transitively import the changed component', () => {
    const graph = makeGraph({
      './src/Button.tsx': ['./src/Button.stories.tsx', './src/Widget.stories.tsx'],
      './src/Button.stories.tsx': [],
      './src/Widget.stories.tsx': [],
      './src/Other.stories.tsx': [],
    });
    const stories: StoryEntry[] = [
      { id: 'button--primary', importPath: './src/Button.stories.tsx' },
      { id: 'widget--default', importPath: './src/Widget.stories.tsx' },
      { id: 'other--default', importPath: './src/Other.stories.tsx' },
    ];

    const result = affected(['src/Button.tsx'], graph, stories);

    expect(isFullRun(result)).toBe(false);
    expect(storyIds(result)).toEqual(['button--primary', 'widget--default']);
    expect(storyIds(result)).not.toContain('other--default');
  });

  it('follows multi-hop static import chains', () => {
    // Button.tsx → styles.ts → Button.stories.tsx
    const graph = makeGraph({
      './src/styles.ts': ['./src/Button.stories.tsx'],
      './src/Button.stories.tsx': [],
      './src/Other.stories.tsx': [],
    });
    const stories: StoryEntry[] = [
      { id: 'button--primary', importPath: './src/Button.stories.tsx' },
      { id: 'other--default', importPath: './src/Other.stories.tsx' },
    ];

    const result = affected(['src/styles.ts'], graph, stories);

    expect(isFullRun(result)).toBe(false);
    expect(storyIds(result)).toEqual(['button--primary']);
  });
});

// ---------------------------------------------------------------------------
// 3. Native-fingerprint change → full (handled by API gate, not affected())
//    affected() itself doesn't know about fingerprints; caller skips it.
//    This test documents the caller responsibility rather than affected().
// ---------------------------------------------------------------------------

describe('affected – integration: native-fingerprint note', () => {
  it('affected() has no fingerprint logic - caller forces full before calling it', () => {
    // The nativeFingerprint gate lives in the API / uploadOrReuseBuildsAndRunTests,
    // not in affected(). When the API determines native changed, it ignores
    // changedFiles entirely and runs all stories. This test just verifies
    // affected() itself works normally (without knowledge of fingerprints).
    const graph = makeGraph({ './src/A.tsx': ['./src/A.stories.tsx'], './src/A.stories.tsx': [] });
    const stories: StoryEntry[] = [{ id: 'a--default', importPath: './src/A.stories.tsx' }];

    // Without a fingerprint check, affected() narrows normally.
    const result = affected(['src/A.tsx'], graph, stories);
    expect(isFullRun(result)).toBe(false);
    expect(storyIds(result)).toEqual(['a--default']);
  });
});

// ---------------------------------------------------------------------------
// 4. Missing / unparseable graph → full
// ---------------------------------------------------------------------------

describe('affected – integration: missing or unparseable graph', () => {
  it('returns fullRun when graph is null (sidecar absent)', () => {
    const stories: StoryEntry[] = [{ id: 'button--primary', importPath: './src/Button.stories.tsx' }];
    const result = affected(['src/Button.tsx'], null, stories);

    expect(isFullRun(result)).toBe(true);
    expect((result as any).reason).toMatch(/absent|unparseable/i);
  });
});

// ---------------------------------------------------------------------------
// 5. require.context edge touching a changed file → full
// ---------------------------------------------------------------------------

describe('affected – integration: require.context (contextGraph) force-full triggers', () => {
  it('returns fullRun when changed file has dynamic import edges (is a contextGraph key)', () => {
    const graph = makeGraph(
      {
        './src/.rnstorybook/storybook.requires.ts': [],
        './src/Button.stories.tsx': [],
      },
      {
        './src/.rnstorybook/storybook.requires.ts': [
          './src/Button.stories.tsx',
          './src/Other.stories.tsx',
        ],
      }
    );
    const stories: StoryEntry[] = [
      { id: 'button--primary', importPath: './src/Button.stories.tsx' },
    ];

    // Changed: the storybook requires file itself (which has require.context)
    const result = affected(['./src/.rnstorybook/storybook.requires.ts'], graph, stories);

    expect(isFullRun(result)).toBe(true);
    expect((result as any).reason).toMatch(/dynamic import/i);
  });

  it('returns fullRun when changed file is a require.context target (contextGraph value)', () => {
    const graph = makeGraph(
      {
        './src/.rnstorybook/storybook.requires.ts': [],
        './src/Button.stories.tsx': [],
      },
      {
        './src/.rnstorybook/storybook.requires.ts': ['./src/Button.stories.tsx'],
      }
    );
    const stories: StoryEntry[] = [
      { id: 'button--primary', importPath: './src/Button.stories.tsx' },
    ];

    // Changed: Button.stories.tsx which is a contextGraph target
    const result = affected(['./src/Button.stories.tsx'], graph, stories);

    expect(isFullRun(result)).toBe(true);
    expect((result as any).reason).toMatch(/dynamic.import target/i);
  });

  it('does NOT force full when changed file is unrelated to contextGraph', () => {
    const graph = makeGraph(
      {
        './src/Button.tsx': ['./src/Button.stories.tsx'],
        './src/Button.stories.tsx': [],
        './src/.rnstorybook/storybook.requires.ts': [],
      },
      {
        './src/.rnstorybook/storybook.requires.ts': ['./src/Button.stories.tsx'],
      }
    );
    const stories: StoryEntry[] = [
      { id: 'button--primary', importPath: './src/Button.stories.tsx' },
    ];

    // Changed: Button.tsx (a component, not a context key or target)
    // BFS finds Button.stories.tsx (stops there), never reaches storybook.requires.ts
    const result = affected(['./src/Button.tsx'], graph, stories);

    expect(isFullRun(result)).toBe(false);
    expect(storyIds(result)).toEqual(['button--primary']);
  });
});

// ---------------------------------------------------------------------------
// 6. Stories without importPath are always included (back-compat)
// ---------------------------------------------------------------------------

describe('affected – stories without importPath', () => {
  it('includes stories with no importPath unconditionally', () => {
    const graph = makeGraph({ './src/Button.tsx': [] });
    const stories: StoryEntry[] = [
      { id: 'button--primary', importPath: './src/Button.stories.tsx' },
      { id: 'legacy--story' }, // no importPath
    ];

    const result = affected(['src/Button.tsx'], graph, stories);

    expect(isFullRun(result)).toBe(false);
    // legacy--story has no importPath → always included (conservative)
    expect(storyIds(result)).toContain('legacy--story');
  });
});

// ---------------------------------------------------------------------------
// 7. SUPERSET PROPERTY TEST
//    affected() output must always be a superset of an independent brute-force
//    reverse-reachability oracle that re-inverts graph.dependencies from scratch.
// ---------------------------------------------------------------------------

describe('affected – SUPERSET PROPERTY TEST', () => {
  /**
   * Independent brute-force oracle: re-invert graph.inverseGraph from scratch
   * by treating it as forward edges (B imports A → A is depended on by B), then
   * BFS from each changed file to find all reachable nodes, then intersect with
   * story importPaths.
   *
   * This oracle is intentionally built independently from affected() to cross-check
   * the production code.  It does NOT apply the force-full rules (contextGraph checks),
   * so the oracle result is always a subset-or-equal of what affected() could return.
   * The superset check verifies: affected().storyIds ⊇ oracle().storyIds.
   */
  function oracleReachableStories(
    changedFiles: string[],
    inverseGraph: Record<string, string[]>,
    importPaths: Set<string>
  ): Set<string> {
    const reached = new Set<string>();
    const queue: string[] = changedFiles.map((f) => (f.startsWith('./') ? f : './' + f));
    const visited = new Set<string>();

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node)) continue;
      visited.add(node);
      if (importPaths.has(node)) reached.add(node);
      // In the oracle, DO traverse through story files too (no stopping rule),
      // to re-invert the same graph from first principles.
      const importers = inverseGraph[node] ?? [];
      for (const imp of importers) {
        const n = imp.startsWith('./') ? imp : './' + imp;
        if (!visited.has(n)) queue.push(n);
      }
    }
    return reached;
  }

  // Randomised graph generator (deterministic seed via iteration index)
  function buildRandomGraph(seed: number): {
    graph: DependencyGraph;
    stories: StoryEntry[];
    changedFiles: string[];
  } {
    const pseudo = (n: number) => ((seed * 1103515245 + 12345 + n * 214013) & 0x7fffffff) % 100;

    const nodeCount = 8 + (pseudo(0) % 8); // 8..15 modules
    const storyCount = 2 + (pseudo(1) % 4); // 2..5 story files
    const changedCount = 1 + (pseudo(2) % 4); // 1..4 changed files

    const nodes = Array.from({ length: nodeCount }, (_, i) => `./src/module${i}.ts`);
    const storyNodes = nodes.slice(0, storyCount).map((n) =>
      n.replace('module', 'story').replace('.ts', '.stories.tsx')
    );
    const allNodes = [...storyNodes, ...nodes.slice(storyCount)];

    // Build forward edges randomly, ensuring story nodes are "leaf" importers only
    const inverseGraph: Record<string, string[]> = {};
    for (const n of allNodes) inverseGraph[n] = [];

    for (let i = 0; i < allNodes.length; i++) {
      if (i < storyCount) continue; // don't let stories be importers of other nodes
      const importer = allNodes[i];
      for (let j = 0; j < i; j++) {
        if (pseudo(i * 100 + j) < 30) {
          // importer → allNodes[j] as a forward edge → allNodes[j] has importer as reverse
          inverseGraph[allNodes[j]].push(importer);
        }
      }
    }

    const stories: StoryEntry[] = storyNodes.map((p, idx) => ({
      id: `story-${idx}`,
      importPath: p,
    }));

    const nonStoryNodes = allNodes.slice(storyCount);
    const changedFiles = nonStoryNodes
      .slice(0, Math.min(changedCount, nonStoryNodes.length))
      .map((p) => p.replace('./', ''));

    return {
      graph: { version: 1, inverseGraph, contextGraph: {} },
      stories,
      changedFiles,
    };
  }

  it('affected() output is a superset of oracle across 200 random graphs', () => {
    const errors: string[] = [];

    for (let seed = 0; seed < 200; seed++) {
      const { graph, stories, changedFiles } = buildRandomGraph(seed);
      const importPaths = new Set(stories.map((s) => s.importPath!));

      const oracleReached = oracleReachableStories(changedFiles, graph.inverseGraph, importPaths);

      const result = affected(changedFiles, graph, stories);

      if ('fullRun' in result) continue; // force-full is always a superset of the oracle

      const affectedSet = new Set(result.storyIds);

      for (const oracleStoryPath of oracleReached) {
        const story = stories.find((s) => s.importPath === oracleStoryPath);
        if (!story) continue;
        if (!affectedSet.has(story.id)) {
          errors.push(
            `seed=${seed}: oracle found ${story.id} (importPath=${oracleStoryPath}) but affected() missed it. ` +
              `changedFiles=${JSON.stringify(changedFiles)}`
          );
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `SUPERSET VIOLATION – affected() under-included in ${errors.length} case(s):\n` +
          errors.slice(0, 5).join('\n')
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Path normalisation
// ---------------------------------------------------------------------------

describe('affected – path normalisation', () => {
  it('handles changed files with or without leading "./"', () => {
    const graph = makeGraph({
      './src/Button.tsx': ['./src/Button.stories.tsx'],
      './src/Button.stories.tsx': [],
    });
    const stories: StoryEntry[] = [
      { id: 'button--primary', importPath: './src/Button.stories.tsx' },
    ];

    // Both forms should work
    const r1 = affected(['src/Button.tsx'], graph, stories);
    const r2 = affected(['./src/Button.tsx'], graph, stories);

    expect(isFullRun(r1)).toBe(false);
    expect(isFullRun(r2)).toBe(false);
    expect(storyIds(r1)).toEqual(['button--primary']);
    expect(storyIds(r2)).toEqual(['button--primary']);
  });

  it('handles story importPath with or without leading "./"', () => {
    const graph = makeGraph({
      './src/Button.tsx': ['./src/Button.stories.tsx'],
      './src/Button.stories.tsx': [],
    });
    const stories: StoryEntry[] = [
      { id: 'button--primary', importPath: 'src/Button.stories.tsx' }, // no ./
    ];

    const result = affected(['src/Button.tsx'], graph, stories);
    expect(isFullRun(result)).toBe(false);
    expect(storyIds(result)).toEqual(['button--primary']);
  });
});

// ---------------------------------------------------------------------------
// 9. No changed files → no affected stories
// ---------------------------------------------------------------------------

describe('affected – empty changed files', () => {
  it('returns empty storyIds when nothing changed', () => {
    const graph = makeGraph({
      './src/Button.tsx': ['./src/Button.stories.tsx'],
      './src/Button.stories.tsx': [],
    });
    const stories: StoryEntry[] = [
      { id: 'button--primary', importPath: './src/Button.stories.tsx' },
    ];

    const result = affected([], graph, stories);
    expect(isFullRun(result)).toBe(false);
    expect(storyIds(result)).toEqual([]);
  });
});
