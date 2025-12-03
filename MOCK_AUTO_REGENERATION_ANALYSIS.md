# Mock Auto-Regeneration - Analysis & Implementation Proposal

## Current System Understanding

### Mock File Structure
Each mock file (e.g., `expo-localization.js`) contains:
1. **Story variant exports**: `export const story_xxx = { fn1: ..., fn2: ... };`
2. **Story map**: `const storyMocks = { 'story-id': story_xxx, ... };`
3. **Runtime code**: Export discovery, getCurrentStory(), dynamic exports

### Current Generation Flow
1. `preGenerateMockFiles()` extracts mocks from ALL story files
2. Groups mocks by package name
3. For each package, generates ONE mock file containing ALL variants
4. Mock file is written to `node_modules/.sherlo/mocks/package-name.js`

### Metro File Watching
- Metro watches files in `watchFolders` and `projectRoot`
- Uses Watchman (if available) or Node.js `fs.watch`
- When a file changes, Metro invalidates cache and re-transforms
- **Problem**: Metro caches transformed files, so transformer doesn't run on reload

---

## Requirements

1. ✅ Detect changes on story files
2. ✅ When change happens, regenerate only the affected variant
3. ✅ Just save changes - Metro will handle reloading
4. ✅ Use Metro's existing file watching system (if possible)
5. ✅ No new systems

---

## Implementation Options

### Option 1: Metro Transformer Hook (When Story File is Transformed)

**Approach:**
- Hook into transformer when it processes a story file
- Extract mocks from that story file only
- Update only the affected variant in the mock file
- Metro will detect the file change and reload

**Pros:**
- ✅ Uses Metro's existing system (transformer)
- ✅ No separate file watcher needed
- ✅ Integrates with Metro's lifecycle

**Cons:**
- ❌ **CRITICAL**: Metro caches transformed files - transformer doesn't run on reload
- ❌ Transformer runs in worker processes (coordination needed)
- ❌ Need to parse existing mock file to update one variant (complex)

**Verdict:** ❌ **Won't work** - Metro caches story files, transformer doesn't run on reload

---

### Option 2: Metro's File Watcher (watchFolders)

**Approach:**
- Story files are already in `projectRoot` (Metro watches them)
- Metro detects changes via Watchman/fs.watch
- Hook into Metro's change detection somehow

**Problem:**
- ❌ Metro doesn't expose file change callbacks/hooks
- ❌ Metro's file watching is internal - no public API

**Verdict:** ❌ **Not possible** - Metro doesn't expose file change hooks

---

### Option 3: Node.js fs.watch (But Leverage Metro's watchFolders)

**Approach:**
- Use Node.js `fs.watch` to watch story files
- But only watch files Metro is already watching (use Metro's `watchFolders`)
- On change: extract mocks from that story file, update mock file
- Metro will detect mock file change and reload

**Pros:**
- ✅ Works independently of Metro's caching
- ✅ Can watch only files Metro cares about
- ✅ Simple implementation

**Cons:**
- ⚠️ Uses `fs.watch` (not Metro's Watchman, but same concept)
- ⚠️ Need to coordinate with Metro

**Verdict:** ✅ **Feasible** - Simple, works, minimal overhead

---

### Option 4: Incremental Update (Update Only Affected Variant)

**Challenge:** How to update only one variant in a mock file?

**Current Structure:**
```javascript
export const story_testing_components_simplemocktest__variant_a = {
  getLocales: () => [{ languageCode: 'en', regionCode: 'US' }]
};
export const story_testing_components_simplemocktest__variant_b = {
  getLocales: () => [{ languageCode: 'fr', regionCode: 'FR' }]
};
const storyMocks = {
  'testing-components-simplemocktest--variant-a': story_testing_components_simplemocktest__variant_a,
  'testing-components-simplemocktest--variant-b': story_testing_components_simplemocktest__variant_b,
};
```

**Option 4A: Parse & Replace (Complex)**
- Read existing mock file
- Parse JavaScript to find the variant export
- Replace just that export
- Update storyMocks map
- Write back

**Pros:**
- ✅ Only updates what changed
- ✅ Minimal file changes

**Cons:**
- ❌ **Very complex** - need to parse JavaScript/TypeScript
- ❌ Error-prone (parsing, formatting, comments)
- ❌ Need to handle edge cases (multi-line, comments, etc.)

**Verdict:** ❌ **Too complex** - Not worth the complexity

---

**Option 4B: Regenerate Entire File, Compare Hashes (Simple)**
- When story file changes, extract mocks from ALL story files (like pre-generation)
- Regenerate entire mock file
- Compare content hash before/after
- Only touch file if content actually changed

**Pros:**
- ✅ **Simple** - reuse existing generation logic
- ✅ Reliable - no parsing needed
- ✅ Metro only reloads if content changed (hash comparison)

**Cons:**
- ⚠️ Regenerates entire file (but fast, and Metro handles caching)

**Verdict:** ✅ **Best approach** - Simple, reliable, Metro handles optimization

---

## Recommended Implementation

### Strategy: Option 3 (fs.watch) + Option 4B (Hash Comparison)

**Architecture:**

1. **File Watcher Setup** (in `withSherlo.ts`):
   - After pre-generation, set up `fs.watch` for each story file
   - Use Metro's `watchFolders` to know which directories Metro watches
   - Watch only story files (`.stories.tsx`)

2. **Change Detection**:
   - When story file changes, debounce (300ms)
   - Extract mocks from that story file only
   - Read existing mock files for affected packages
   - Regenerate entire mock files (reuse existing `generateMockFile`)
   - Compare content hashes before/after
   - Only write if content changed

3. **Incremental Update Logic**:
   - **NOT** updating just one variant (too complex)
   - **INSTEAD**: Regenerate entire file, but only write if changed
   - Metro will only reload if file content changed (Metro uses SHA-1 hashes)

**Key Insight:**
- We don't need to update "only the variant" - we regenerate the whole file
- Metro's SHA-1 comparison ensures reload only happens if content changed
- If you change a mock value → hash changes → Metro reloads
- If you change non-mock code → hash unchanged → Metro doesn't reload

---

## Implementation Details

### 1. File Watcher Module (`watchStoryFiles.ts`)

```typescript
// Watch story files using fs.watch
// On change:
//   1. Debounce (300ms)
//   2. Extract mocks from changed story file
//   3. Regenerate affected mock files
//   4. Compare hashes - only write if changed
```

**Dependencies:**
- Node.js `fs.watch` (built-in, no external deps)
- Existing `extractMocksFromTransformedCode`
- Existing `generateMockFile`
- Content hash comparison (crypto)

### 2. Integration Point (`withSherlo.ts`)

```typescript
// After preGenerateMockFiles():
watchStoryFiles(storyFiles, projectRoot);
```

### 3. Regeneration Logic

```typescript
function regenerateMocksForStoryFile(storyFilePath, projectRoot, allStoryFiles) {
  // 1. Extract mocks from changed story file
  const newMocks = extractMocksFromTransformedCode(...);
  
  // 2. Read existing mock files for affected packages
  // 3. Regenerate entire mock files (reuse generateMockFile)
  // 4. Compare hashes
  // 5. Only write if changed
}
```

### 4. Content Hash Comparison

```typescript
// Before regeneration: hash existing mock files
// After regeneration: hash new mock files
// Only write if hash changed
// Only touch file if hash changed (to trigger Metro reload)
```

---

## Alternative: Use Metro's Transformer (If We Can Force Re-transform)

**Question:** Can we force Metro to re-transform a story file?

**Possible Approaches:**
1. Invalidate Metro's cache for story files
2. Touch story file to force re-transform
3. Use Metro's `getTransformOptions` to force re-transform

**Investigation Needed:**
- Does Metro expose cache invalidation API?
- Can we touch files to force re-transform?
- Does `getTransformOptions` help?

**If Possible:**
- Touch story file → Metro re-transforms → Transformer runs → Regenerate mocks
- This would use Metro's system entirely

**Verdict:** ⚠️ **Needs investigation** - Check if Metro exposes cache invalidation

---

## Recommendation

**Primary Approach: Option 3 (fs.watch) + Option 4B (Hash Comparison)**

**Why:**
1. ✅ Simple - reuse existing generation logic
2. ✅ Reliable - no parsing, no edge cases
3. ✅ Efficient - Metro only reloads if content changed
4. ✅ Works - independent of Metro's caching
5. ✅ Minimal - uses built-in `fs.watch`, no new systems

**Implementation Steps:**
1. Create `watchStoryFiles.ts` - file watcher using `fs.watch`
2. Create `regenerateMocksForStoryFile.ts` - regeneration logic with hash comparison
3. Integrate into `withSherlo.ts` - set up watchers after pre-generation
4. Test: Change mock → verify regeneration → verify Metro reloads

**Fallback:** If `fs.watch` is unreliable, we can investigate Metro's cache invalidation API as an alternative.

---

## Questions to Answer

1. **Does Metro expose cache invalidation API?** (Check Metro source/docs)
2. **Can we force Metro to re-transform a file?** (Touch file? API call?)
3. **Is `fs.watch` reliable enough?** (Known to have issues on some systems)
4. **Should we use chokidar instead?** (More reliable, but adds dependency)

---

## Next Steps

1. **Investigate Metro APIs** - Check if cache invalidation/force re-transform exists
2. **If not available** - Implement Option 3 (fs.watch + hash comparison)
3. **Test reliability** - Verify `fs.watch` works consistently
4. **Consider chokidar** - If `fs.watch` is unreliable, add chokidar as optional dependency

