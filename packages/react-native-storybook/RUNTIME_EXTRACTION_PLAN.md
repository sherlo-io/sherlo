# Runtime Mock Extraction Plan

## Problem
Trying to `require()` TypeScript story files in Node.js (Metro config time) fails because:
- Story files import React Native modules that don't exist in Node.js
- TypeScript compilation fails even with `transpileOnly: true`
- We can't extract mocks before Metro transforms the files

## Solution: Extract Mocks at Runtime (During Metro Bundling)

### Key Insight
Metro transforms TypeScript files to JavaScript during bundling. We can intercept this process to extract mocks from the transformed code.

### Architecture

#### Phase 1: Metro Config Time (Node.js)
1. Discover all story files using `discoverStoryFiles()`
2. Store story file paths in a global cache: `__SHERLO_STORY_FILES__`
3. Initialize empty mock cache: `__SHERLO_STORY_MOCKS__ = new Map()`

#### Phase 2: Metro Transformer (During Bundling)
1. Create a custom Metro transformer that:
   - Detects when a story file (`.stories.tsx`) is being transformed
   - After Metro transforms it, extract mocks from the transformed AST/code
   - Store mocks in `__SHERLO_STORY_MOCKS__` cache
   
2. Alternative: Use Metro's `unstable_transformProfile` or hook into module loading

#### Phase 3: Metro Resolver (During Bundling)
1. When resolving mocked packages (e.g., `expo-localization`):
   - Get current story ID from `getCurrentStory()`
   - Look up mocks for that story in `__SHERLO_STORY_MOCKS__`
   - Return mock file path or inject mock code

### Implementation Options

#### Option A: Metro Transformer (Recommended)
- Create `createMockExtractionTransformer()` that wraps Metro's default transformer
- When transforming a `.stories.*` file:
  - Let Metro transform it first
  - Parse the transformed code to extract `mocks` properties
  - Store in global cache
  - Return transformed code unchanged

#### Option B: Module Loading Hook
- Hook into Metro's module loading system
- When a story file module is loaded, extract mocks from `module.exports`
- Store in global cache

#### Option C: Resolver-Based Extraction
- In resolver, when resolving a story file:
  - Resolve it normally
  - After resolution, try to load the module and extract mocks
  - Store in cache

### Challenges to Consider

1. **Timing**: When exactly do we extract mocks?
   - During transformation? (Option A)
   - During module loading? (Option B)
   - During resolution? (Option C)

2. **Module Availability**: Can we access the transformed module?
   - Metro transforms files, but modules aren't "loaded" until runtime
   - We need to extract from transformed code, not loaded module

3. **Story File Loading**: When are story files loaded?
   - Storybook loads them when displaying stories
   - We need mocks available BEFORE the story is displayed

4. **Current Story Detection**: How do we know which story is active?
   - Need `getCurrentStory()` function
   - Uses Storybook channel API

### Recommended Approach: Metro Transformer + Static Analysis

**Why Transformer?**
- Runs during bundling (before runtime)
- Has access to transformed JavaScript code (easier to parse than TypeScript)
- Can extract mocks from transformed code using AST parsing
- Mocks available before story is displayed
- No need to `require()` files - just parse the code

**Implementation Steps:**
1. Create `mockExtractionTransformer.ts` that wraps Metro's transformer
2. Detect `.stories.*` files
3. After Metro transforms TS→JS, parse the JavaScript AST to find `mocks` properties
4. Extract mocks and store in `__SHERLO_STORY_MOCKS__`
5. Return transformed code unchanged

**Code Structure:**
```typescript
// mockExtractionTransformer.ts
import { transform } from '@babel/core';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

export function createMockExtractionTransformer(
  projectRoot: string,
  storyFiles: string[]
) {
  return async (transformer: MetroTransformer) => {
    return async (args: TransformArgs) => {
      // Let Metro transform first (TS → JS)
      const result = await transformer.transform(args);
      
      // Check if this is a story file
      if (isStoryFile(args.filename, storyFiles)) {
        // Parse transformed JavaScript code
        const ast = parse(result.code);
        // Extract mocks from AST
        const mocks = extractMocksFromAST(ast, args.filename, projectRoot);
        // Store in global cache
        storeMocks(mocks);
      }
      
      return result;
    };
  };
}

function extractMocksFromAST(ast: any, filePath: string, projectRoot: string) {
  const mocks = new Map();
  const componentName = getComponentNameFromPath(filePath);
  
  traverse(ast, {
    ExportNamedDeclaration(path) {
      // Find exports like: export const Basic = { mocks: {...} }
      const declaration = path.node.declaration;
      if (t.isVariableDeclaration(declaration)) {
        declaration.declarations.forEach(decl => {
          if (t.isIdentifier(decl.id)) {
            const exportName = decl.id.name;
            // Extract mocks from the exported object
            const storyMocks = extractMocksFromObject(decl.init);
            if (storyMocks) {
              const storyId = `${componentName}--${exportName}`;
              mocks.set(storyId, storyMocks);
            }
          }
        });
      }
    }
  });
  
  return mocks;
}
```

### Alternative: Simpler Text-Based Extraction

If AST parsing is too complex, we can use regex/text parsing on the transformed JavaScript:
- Look for patterns like `export const StoryName = { mocks: {...} }`
- Extract the mocks object using regex or simple parsing
- Less accurate but simpler to implement

### Next Steps
1. ✅ Research Metro transformer API (done - need to wrap default transformer)
2. Implement transformer wrapper in `withSherlo.ts`
3. Implement mock extraction from transformed JavaScript code
4. Test with simple story file
5. Integrate with resolver

