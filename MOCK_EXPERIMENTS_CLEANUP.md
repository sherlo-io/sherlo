# Mock Experiments Branch - Cleanup Analysis

This document analyzes the `mock-experiments` branch compared to `dev` to identify files and code that can be removed before merging.

## Quick Summary
- **Total files changed**: 49 files
- **Total additions**: 6,174 lines
- **Total deletions**: 37 lines
- **Files to remove**: 5 files (~500-600 lines)
- **Native code to remove**: ~150-200 lines (Android + iOS)
- **Estimated cleanup**: ~700-800 lines total

## Quick Reference - What to Remove

### Files to Delete:
1. `packages/react-native-storybook/src/metro/mockExtraction.ts` (move `StoryMockMap` type first)
2. `packages/react-native-storybook/src/metro/getCurrentStory.ts`
3. `packages/react-native-storybook/src/getCurrentVariant.ts` (remove export first)
4. `packages/react-native-storybook/SB_MOCK_FEASIBILITY.md` (or move to docs)

### Native Methods to Remove:
- Android: `persistStoryId()`, `getPersistedStoryId()`, `restartWithStoryId()` in `RestartHelper.java`
- iOS: `restartWithStoryId:storyId:`, `getPersistedStoryId` in `RestartHelper.m`
- TypeScript: `restartWithStoryId` from `SherloModule.ts` and `NativeSherloModule.ts`

### Why?
All removed code was for the **bundle reload approach** that was abandoned. Current solution uses:
- **Runtime mock resolution** via global JavaScript variable (`__SHERLO_CURRENT_STORY_ID__`)
- **AOT transformation** via Metro transformer (no bundle reload needed)

---

## 🗑️ Files That Can Be Removed Entirely

### 1. **`packages/react-native-storybook/src/metro/mockExtraction.ts`** ❌ REMOVE
- **Reason**: This was the old approach using `require()` to load story files at config time. Replaced by `mockExtractionTransformer.ts` which uses Metro's transformer API.
- **Status**: Only used for `StoryMockMap` type definition (line 9: `export type StoryMockMap = Map<string, Map<string, any>>;`)
- **Action**: 
  1. Create `packages/react-native-storybook/src/metro/types.ts` with:
     ```typescript
     export type StoryMockMap = Map<string, Map<string, any>>;
     ```
  2. Update imports in:
     - `generateMockFile.ts` (line 9)
     - `mockExtractionTransformer.ts` (line 8)
     - `withSherlo.ts` (line 5)
  3. Delete `mockExtraction.ts`

### 2. **`packages/react-native-storybook/src/metro/getCurrentStory.ts`** ❌ REMOVE
- **Reason**: The `getCurrentStory` function is defined inline in `generateMockFile.ts` (line 563-567). This standalone file is not imported anywhere.
- **Status**: Unused duplicate - verified no imports found
- **Action**: Delete file

### 3. **`packages/react-native-storybook/src/getCurrentVariant.ts`** ❌ REMOVE
- **Reason**: Just returns `null`, appears to be a placeholder/experiment
- **Status**: Exported from `index.ts` but never actually used
- **Action**: Remove export from `index.ts` and delete file

### 4. **`packages/react-native-storybook/SB_MOCK_FEASIBILITY.md`** ❌ REMOVE (or move to docs)
- **Reason**: Documentation/feasibility study from early experiments
- **Status**: Not needed in production code
- **Action**: Delete or move to `/docs` if valuable for reference

### 5. **`packages/react-native-storybook/metro/withSherlo.js`** ⚠️ KEEP (but verify)
- **Reason**: Re-export file for CommonJS compatibility
- **Status**: Needed for `require('@sherlo/react-native-storybook/metro/withSherlo')` in metro.config.js
- **Action**: Keep, but verify it's actually needed

---

## 🔧 Code That Can Be Removed from Existing Files

### Native Module Changes (Android & iOS)

#### **`RestartHelper.java` (Android)**
- **Remove**: `persistStoryId()` method (lines ~65-87)
- **Remove**: `getPersistedStoryId()` method (lines ~89-115)
- **Remove**: `restartWithStoryId()` method (lines ~243-268)
- **Remove**: Constants `PREF_ACTIVE_STORY_ID` and `PREF_ACTIVE_STORY_TIMESTAMP`
- **Reason**: These were for the bundle reload approach. Current solution uses global JavaScript variable instead.

#### **`RestartHelper.m` (iOS)**
- **Remove**: `restartWithStoryId:storyId:` method (lines ~33-50)
- **Remove**: `getPersistedStoryId` method (lines ~52-80)
- **Remove**: Constants `PREF_ACTIVE_STORY_ID`, `PREF_ACTIVE_STORY_TIMESTAMP`, `STORY_PERSISTENCE_TIMEOUT`
- **Reason**: Same as Android - bundle reload approach abandoned.

#### **`SherloModuleCore.java` (Android)**
- **Check**: Any methods related to `restartWithStoryId` or `getPersistedStoryId`
- **Action**: Remove if present

#### **`SherloModule.java` (both oldarch and newarch)**
- **Check**: Any methods related to `restartWithStoryId` or `getPersistedStoryId`
- **Action**: Remove if present

#### **`SherloModule.mm` (iOS)**
- **Check**: Any methods related to `restartWithStoryId` or `getPersistedStoryId`
- **Action**: Remove if present

#### **`SherloModuleCore.m` (iOS)**
- **Check**: Any methods related to `restartWithStoryId` or `getPersistedStoryId`
- **Action**: Remove if present

### TypeScript/JavaScript Changes

#### **`packages/react-native-storybook/src/SherloModule.ts`**
- **Remove**: `restartWithStoryId` method definition (line ~25)
- **Remove**: Implementation in `getNativeModule()` (line ~127) - **VERIFIED: Only definition, never called**
- **Remove**: Mock implementation in `createDummySherloModule()` (line ~169)
- **Reason**: Not used - bundle reload approach abandoned. Verified no calls to this method exist in codebase.

#### **`packages/react-native-storybook/src/specs/NativeSherloModule.ts`**
- **Remove**: `restartWithStoryId` from interface (line ~21)
- **Reason**: Not used

#### **`packages/react-native-storybook/src/index.ts`**
- **Remove**: `export { default as getCurrentVariant } from './getCurrentVariant';` (line ~3)
- **Reason**: `getCurrentVariant` is unused

---

## ✅ Files That Should Be Kept (Core Implementation)

### Metro Configuration & Transformation
- ✅ `packages/react-native-storybook/src/metro/withSherlo.ts` - Main Metro config wrapper
- ✅ `packages/react-native-storybook/src/metro/sherloTransformer.ts` - Metro transformer entry point
- ✅ `packages/react-native-storybook/src/metro/mockExtractionTransformer.ts` - AST-based mock extraction
- ✅ `packages/react-native-storybook/src/metro/mockSerialization.ts` - Serialization utilities
- ✅ `packages/react-native-storybook/src/metro/generateMockFile.ts` - Mock file generation
- ✅ `packages/react-native-storybook/src/metro/storyDiscovery.ts` - Story file discovery
- ✅ `packages/react-native-storybook/tsconfig.metro.json` - TypeScript config for Metro files

### Runtime Support
- ✅ `packages/react-native-storybook/src/getStorybook/hooks/useStorybookEventListener.ts` - Stores story ID in global variable
- ✅ `packages/react-native-storybook/src/getStorybook/getStorybook.tsx` - Minor changes to integrate listener

### Testing Files (Keep for now, may move later)
- ✅ All `testing/testing-components/src/utils/*.ts` files - Test utilities
- ✅ `testing/testing-components/src/components/MockTestingStory.tsx` - Test component
- ✅ `testing/expo/src/testing-components/MockTestingStory/MockTestingStory.stories.tsx` - Test stories

---

## 📋 Action Items Summary

### High Priority (Remove Before Merge)
1. ✅ Delete `mockExtraction.ts` (move `StoryMockMap` type first)
2. ✅ Delete `getCurrentStory.ts`
3. ✅ Delete `getCurrentVariant.ts` and remove export
4. ✅ Remove `restartWithStoryId` and `getPersistedStoryId` from all native modules (Android & iOS)
5. ✅ Remove `restartWithStoryId` from TypeScript interfaces and implementations
6. ✅ Delete or move `SB_MOCK_FEASIBILITY.md`

### Medium Priority (Verify)
1. ⚠️ Verify `metro/withSherlo.js` is actually needed (check if metro.config.js can import directly from dist)
2. ⚠️ Check if any other experimental code paths exist

### Low Priority (Documentation)
1. 📝 Consider moving test utilities to a separate package or documenting them as examples
2. 📝 Add comments explaining why we use global variable instead of native module for story ID

---

## 🔍 Verification Steps

Before removing code, verify:
1. ✅ No imports of `mockExtraction.ts` (except for type)
2. ✅ No imports of `getCurrentStory.ts`
3. ✅ No imports of `getCurrentVariant.ts`
4. ✅ No calls to `restartWithStoryId` or `getPersistedStoryId` in TypeScript/JavaScript
5. ✅ Native methods are only defined but never called from JS

---

## 📊 File Size Impact

After cleanup:
- **Files to remove**: ~5 files
- **Lines to remove**: ~500-600 lines (estimated)
- **Native code to remove**: ~150-200 lines (Android + iOS)

This will significantly reduce the branch size and remove experimental code paths.

