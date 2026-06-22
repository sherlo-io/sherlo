import fs from 'fs';
import path from 'path';
import { DependencyGraph } from './dependencyGraph';

const SIDECAR_REL = path.join('node_modules', '.cache', 'sherlo', 'graph.json');

/**
 * Reads the Metro dependency-graph sidecar emitted by applySherloTransforms.js
 * from the project root.
 *
 * Returns:
 *   DependencyGraph  – the parsed sidecar on success.
 *   null             – the sidecar is absent or unparseable (caller must force full).
 */
export function collectDependencyGraph(projectRoot: string): DependencyGraph | null {
  const sidecarPath = path.join(projectRoot, SIDECAR_REL);
  try {
    const raw = fs.readFileSync(sidecarPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidDependencyGraph(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isValidDependencyGraph(value: unknown): value is DependencyGraph {
  if (!value || typeof value !== 'object') return false;
  const g = value as Record<string, unknown>;
  return (
    g['version'] === 1 &&
    typeof g['inverseGraph'] === 'object' &&
    g['inverseGraph'] !== null &&
    typeof g['contextGraph'] === 'object' &&
    g['contextGraph'] !== null
  );
}
