export { computeChangedFiles } from './computeChangedFiles';
export type { ChangedFilesResult } from './computeChangedFiles';
// The native fingerprint wire value is now sourced from the single sanitized
// Layer-1 compute inside `computeBaseFingerprint` (SHERLO-1756). The former
// standalone `computeNativeFingerprint` raw compute has been deleted to
// guarantee exactly one `createFingerprintAsync` invocation per path.
// Phase 2 dormant scaffolding: DependencyGraph type + affected() are not yet wired to
// the API (server-side graph consumption is unbuilt). Kept for future Phase 2 work.
export type { DependencyGraph } from './dependencyGraph';
export { affected } from './affected';
export type { AffectedResult, StoryEntry } from './affected';
