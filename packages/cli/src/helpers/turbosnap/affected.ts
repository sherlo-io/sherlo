// PHASE 2 DORMANT SCAFFOLDING – not yet called by the CLI send path.
// Kept for future Phase 2 API integration (story-level narrowing on the server).
import { DependencyGraph } from './dependencyGraph';

export type StoryEntry = {
  id: string;
  importPath?: string;
};

export type AffectedResult = { storyIds: string[] } | { fullRun: true; reason: string };

/**
 * Determines which story IDs are affected by a set of changed files using the
 * Metro dependency-graph sidecar.
 *
 * CONSERVATISM INVARIANT (non-negotiable)
 * =======================================
 * The output must be a SUPERSET of the true affected set.  Any uncertainty
 * biases toward { fullRun: true } (bail-open).  A false green (missed regression)
 * is impossible by construction:
 *
 *   - Missing / unparseable graph                → fullRun
 *   - Changed file owns a require.context call   → fullRun
 *   - Changed file is a require.context target   → fullRun
 *   - Stories whose import closure includes a    → included in storyIds
 *     changed file (via static inverse edges)
 *
 * Static BFS stops at story files - we never traverse through them to the
 * require.context registration module (storybook.requires.ts), avoiding
 * false-positive force-full for component changes.
 *
 * @param changedFiles   Project-root-relative paths from git diff (e.g. "src/Button.tsx").
 *                       Leading "./" is optional.
 * @param graph          Sidecar content from node_modules/.cache/sherlo/graph.json,
 *                       or null when the sidecar is missing / unparseable.
 * @param stories        Story list emitted by the device START payload.
 *                       Only entries with an importPath participate in narrowing;
 *                       entries without one are treated as always-affected (safe).
 */
export function affected(
  changedFiles: string[],
  graph: DependencyGraph | null,
  stories: ReadonlyArray<StoryEntry>
): AffectedResult {
  // ── Guard: missing or unparseable graph ────────────────────────────────
  if (graph === null) {
    return { fullRun: true, reason: 'dependency graph sidecar absent or unparseable' };
  }

  // ── Normalise changed-file paths to the same "./" prefix the sidecar uses ──
  const changed: string[] = changedFiles.map(normaliseRelPath);

  // ── Build importPath → storyIds lookup ─────────────────────────────────
  const importPathToIds = new Map<string, string[]>();
  const storiesWithoutImportPath: string[] = [];

  for (const s of stories) {
    if (!s.importPath) {
      storiesWithoutImportPath.push(s.id);
      continue;
    }
    const key = normaliseRelPath(s.importPath);
    const list = importPathToIds.get(key);
    if (list) {
      list.push(s.id);
    } else {
      importPathToIds.set(key, [s.id]);
    }
  }

  // ── Precompute contextGraph key/target sets for O(1) lookups ───────────
  const contextKeys = new Set(Object.keys(graph.contextGraph).map(normaliseRelPath));
  const contextTargets = new Set(Object.values(graph.contextGraph).flat().map(normaliseRelPath));

  // ── Force-full checks (source-scan via graph) ───────────────────────────
  for (const c of changed) {
    if (contextKeys.has(c)) {
      return {
        fullRun: true,
        reason: `changed file has dynamic import edges (require.context / dynamic require): ${c}`,
      };
    }
    if (contextTargets.has(c)) {
      return {
        fullRun: true,
        reason: `changed file is a dynamic-import target (require.context glob): ${c}`,
      };
    }
  }

  // ── BFS over static inverse edges ─────────────────────────────────────
  // Stories without an importPath are always included (conservative, back-compat
  // with older SDKs that do not emit importPath).
  const affectedIds = new Set<string>(storiesWithoutImportPath);
  const visited = new Set<string>();
  const frontier: string[] = [...changed];

  while (frontier.length > 0) {
    const node = frontier.pop()!;
    if (visited.has(node)) continue;
    visited.add(node);

    // If this node is a story file, add its storyIds and STOP traversal here.
    // We must not traverse through story files to the require.context registry
    // (storybook.requires.ts), because that would trigger a false-positive force-full
    // for every component change that reaches any story.
    const nodeIds = importPathToIds.get(node);
    if (nodeIds) {
      for (const id of nodeIds) affectedIds.add(id);
      continue; // do not traverse importers of story files
    }

    // Traverse static importers.
    const importers = graph.inverseGraph[node];
    if (importers) {
      for (const imp of importers) {
        const normImp = normaliseRelPath(imp);
        if (!visited.has(normImp)) frontier.push(normImp);
      }
    }
  }

  return { storyIds: Array.from(affectedIds) };
}

/**
 * Normalises a project-root-relative path to always start with "./".
 * "src/Button.tsx" → "./src/Button.tsx"
 * "./src/Button.tsx" → "./src/Button.tsx"
 */
function normaliseRelPath(p: string): string {
  return p.startsWith('./') || p.startsWith('../') ? p : './' + p;
}
