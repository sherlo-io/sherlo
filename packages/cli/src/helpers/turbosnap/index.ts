export { computeChangedFiles } from './computeChangedFiles';
export type { ChangedFilesResult } from './computeChangedFiles';
export { computeNativeFingerprint } from './computeNativeFingerprint';
// Phase 2 dormant scaffolding: DependencyGraph type + affected() are not yet wired to
// the API (server-side graph consumption is unbuilt). Kept for future Phase 2 work.
export type { DependencyGraph } from './dependencyGraph';
export { affected } from './affected';
export type { AffectedResult, StoryEntry } from './affected';
