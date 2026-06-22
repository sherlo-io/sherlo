/**
 * Sherlo dependency-graph sidecar format (node_modules/.cache/sherlo/graph.json).
 *
 * Emitted by the Metro customSerializer in applySherloTransforms.js at bundle time.
 * Collected by the CLI at upload time and forwarded to the API.
 *
 * inverseGraph  – static reverse edges only.
 *   key:   project-root-relative path of a module (e.g. "./src/Button.tsx")
 *   value: project-root-relative paths of modules that statically import it
 *
 * contextGraph  – require.context() targets, grouped by the module that owns the call.
 *   key:   project-root-relative path of the module containing require.context()
 *   value: project-root-relative paths of all files matched by the context glob
 *
 * Safety guarantee: the source-scan (contextGraph) + force-full triggers always widen;
 * inverseGraph only narrows.  Missing or unparseable graph → force full (bail-open).
 */
export type DependencyGraph = {
  version: 1;
  inverseGraph: Record<string, string[]>;
  contextGraph: Record<string, string[]>;
};
