# Feasibility Analysis: Storybook-style `sb.mock()` for React Native Storybook

## Storybook's Approach (from the article)

### How `sb.mock()` Works
1. **Ahead-of-Time (AOT) Transformation**
   - Scans `.storybook/preview.ts` for `sb.mock()` calls during startup
   - Custom Vite/Webpack plugins rewrite the dependency graph **before** bundling
   - Imports are rewritten at build time (e.g., `import { x } from 'module'` → `import { x } from '__mocks__/module'`)

2. **Key Characteristics**
   - **Zero runtime overhead**: Rewriting happens at build time
   - **Works in dev and production**: Same behavior everywhere
   - **Global scope**: Mocks defined in `preview.ts` apply to all stories
   - **Static by design**: No factory functions, uses `__mocks__` convention

3. **Bundler Integration**
   - Vite: Custom plugin that hooks into module resolution
   - Webpack: Custom plugin that rewrites imports during compilation

## Our Current Approach

### What We're Doing Now
1. **Runtime Extraction**: Extract mocks from story files during Metro transformation
2. **Resolver-Based**: Use Metro resolver to redirect imports at **resolution time**
3. **Per-Story Mocks**: Each story variant can have different mocks
4. **Runtime Overhead**: Resolver checks happen when modules are resolved

### Current Flow
```
Story File → Metro Transformer → Extract Mocks → Store in Global Cache
                                                      ↓
Component File → Metro Resolver → Check Current Story → Return Mock or Original
```

## Feasibility: Can We Do AOT Transformation Like Storybook?

### ✅ **YES, It's Feasible!** Here's how:

### Option 1: Import Rewriting in Component Files (Most Similar to Storybook)

**How it would work:**
1. Scan all story files for `mocks` properties (we're already doing this)
2. When transforming **component files** (not story files), check if current story has mocks
3. Rewrite imports in component files to point to mock files
4. Generate mock files on-the-fly or use `__mocks__` convention

**Example:**
```tsx
// Component file: TestInfo.tsx
import { getLocales } from 'expo-localization'; // Original

// After AOT transformation (when TestInfo--Basic story is active):
import { getLocales } from '__sherlo_mocks__/expo-localization--TestInfo--Basic'; // Mocked
```

**Implementation:**
- Metro transformer intercepts component file transformation
- Checks `getCurrentStory()` to determine active story
- Rewrites imports using Babel AST manipulation
- Generates mock files or uses resolver to serve them

**Pros:**
- Zero runtime overhead (like Storybook)
- Works identically in dev and production
- Clean separation of concerns

**Cons:**
- Need to know current story at **build time** (not runtime)
- Story files are lazy-loaded, so we'd need to pre-process all stories
- More complex transformer logic

### Option 2: Import Rewriting in Story Files Only (Simpler)

**How it would work:**
1. When transforming a **story file**, rewrite imports in that story file
2. Story files import components, so mocks would apply to components used in that story
3. Use Metro's module graph to propagate mocks

**Example:**
```tsx
// Story file: TestInfo.stories.tsx
import { TestInfo } from './TestInfo'; // Component
import { getLocales } from 'expo-localization'; // This gets mocked

export const Basic = {
  mocks: {
    'expo-localization': { getLocales: () => [{ languageCode: 'fr' }] }
  }
};

// After transformation:
// Rewrite import to point to mock
import { getLocales } from '__sherlo_mocks__/expo-localization--TestInfo--Basic';
```

**Pros:**
- Simpler - only transform story files
- Story files are already being transformed
- Mocks are co-located with stories

**Cons:**
- Mocks only apply to imports **in the story file**, not in component files
- Components that import mocked modules won't get mocks unless we also transform them

### Option 3: Hybrid Approach (Recommended)

**How it would work:**
1. **Story files**: Extract mocks and generate mock files (we're already doing this)
2. **Component files**: When transforming, check if any active story mocks this module
3. **Rewrite imports**: Use Babel to rewrite imports to point to mock files
4. **Mock files**: Generate on-the-fly or use resolver to serve them

**Implementation:**
```typescript
// Metro transformer
export async function transform(args: TransformArgs) {
  const result = await baseTransformer.transform(args);
  
  // If this is a component file (not story file)
  if (isComponentFile(args.filename)) {
    const ast = parse(result.output[0].data.code);
    
    // Check if current story has mocks for any imports
    const currentStory = getCurrentStory(); // Need to make this work at build time
    const storyMocks = getMocksForStory(currentStory);
    
    // Rewrite imports
    traverse(ast, {
      ImportDeclaration(path) {
        const moduleName = path.node.source.value;
        if (storyMocks.has(moduleName)) {
          // Rewrite to mock path
          path.node.source.value = `__sherlo_mocks__/${moduleName}--${currentStory}`;
        }
      }
    });
    
    // Regenerate code
    result.output[0].data.code = generate(ast).code;
  }
  
  return result;
}
```

## Key Challenges

### 1. **Current Story at Build Time**
- Storybook's approach works because mocks are **global** (defined in `preview.ts`)
- We want **per-story** mocks, which means we need to know the active story at build time
- **Solution**: We could:
  - Generate separate bundles for each story (complex)
  - Use a build-time flag/env var to specify active story
  - Keep resolver approach but optimize it

### 2. **Metro vs Vite/Webpack**
- Metro's transformer API is different from Vite/Webpack plugins
- Metro transformers work on individual files, not the entire dependency graph
- **Solution**: We can still rewrite imports file-by-file, but need to coordinate across files

### 3. **Mock File Generation**
- Storybook uses `__mocks__` convention or generates mocks automatically
- We need to generate mock files from story `mocks` properties
- **Solution**: Generate mock files in a temp directory or use Metro resolver to serve them

## Recommended Approach: Enhanced Resolver (Current + Optimizations)

Instead of full AOT transformation, we can optimize our current resolver approach:

### Current (Runtime Resolver):
```typescript
resolver.resolveRequest = (context, moduleName) => {
  const currentStory = getCurrentStory(); // Runtime check
  const mocks = getMocksForStory(currentStory);
  if (mocks.has(moduleName)) {
    return mockFile; // Runtime resolution
  }
  return original;
};
```

### Enhanced (Pre-computed Mock Map):
```typescript
// At build time: Pre-compute all mock paths
const mockMap = new Map(); // moduleName -> storyId -> mockPath

// At runtime: Fast lookup
resolver.resolveRequest = (context, moduleName) => {
  const currentStory = getCurrentStory();
  const mockPath = mockMap.get(moduleName)?.get(currentStory);
  if (mockPath) {
    return { type: 'sourceFile', filePath: mockPath };
  }
  return original;
};
```

**Benefits:**
- Still per-story mocks (our requirement)
- Fast runtime lookup (O(1))
- Works with lazy-loaded stories
- Simpler than full AOT transformation

## 🎯 BREAKTHROUGH: Bundle Reload Approach

### New Insight: Story Switching Triggers Bundle Reload

If we can:
1. **Detect story switch** with mocks
2. **Store story ID on native side** before reload
3. **Trigger Metro bundle reload**
4. **Read story ID from native** during transformation

Then we can do **true AOT transformation** like Storybook!

### How It Works

```
User switches to story "TestInfo--Basic" (has mocks)
    ↓
Store story ID on native side: __SHERLO_ACTIVE_STORY__ = "TestInfo--Basic"
    ↓
Trigger Metro bundle reload (Metro.reload())
    ↓
Metro transformer runs for all files
    ↓
getCurrentStory() reads from native: "TestInfo--Basic"
    ↓
Transformer rewrites imports in component files:
  import { getLocales } from 'expo-localization'
  → import { getLocales } from '__sherlo_mocks__/expo-localization--TestInfo--Basic'
    ↓
Bundle is served with mocked imports already baked in
    ↓
Zero runtime overhead! (just native read for story ID)
```

### Implementation Flow

#### 1. Story Switch Detection
```typescript
// In Storybook addon or native module
function onStorySwitch(storyId: string, hasMocks: boolean) {
  if (hasMocks) {
    // Store on native side
    NativeModules.SherloModule.setActiveStory(storyId);
    // Trigger reload
    Metro.reload();
  }
}
```

#### 2. Transformer Reads Story ID
```typescript
// In Metro transformer
export async function transform(args: TransformArgs) {
  const result = await baseTransformer.transform(args);
  
  // Read active story from native (synchronous or cached)
  const activeStoryId = getCurrentStory(); // Reads from native
  
  if (activeStoryId && isComponentFile(args.filename)) {
    const storyMocks = getMocksForStory(activeStoryId);
    
    if (storyMocks.size > 0) {
      // Rewrite imports using Babel AST
      const ast = parse(result.output[0].data.code);
      
      traverse(ast, {
        ImportDeclaration(path) {
          const moduleName = path.node.source.value;
          if (storyMocks.has(moduleName)) {
            // Rewrite to mock path
            path.node.source.value = 
              `__sherlo_mocks__/${moduleName}--${activeStoryId}`;
          }
        }
      });
      
      // Regenerate code with mocked imports
      result.output[0].data.code = generate(ast).code;
    }
  }
  
  return result;
}
```

#### 3. Mock File Generation
```typescript
// Generate mock files from story mocks
function generateMockFile(moduleName: string, storyId: string, mock: any) {
  const mockPath = `__sherlo_mocks__/${moduleName}--${storyId}.js`;
  const mockCode = generateMockCode(mock);
  fs.writeFileSync(mockPath, mockCode);
}
```

### Benefits of This Approach

✅ **True AOT Transformation**: Imports rewritten at build time  
✅ **Zero Runtime Overhead**: No resolver checks needed  
✅ **Per-Story Mocks**: Each story can have different mocks  
✅ **Works in Dev & Production**: Same behavior everywhere  
✅ **Simple Implementation**: Just read story ID from native during transform  

### Trade-offs

⚠️ **Bundle Reload**: Switching stories with mocks triggers reload (acceptable UX)  
⚠️ **Native Bridge**: Need to read story ID from native (fast, synchronous)  
⚠️ **Mock File Management**: Need to generate/cleanup mock files  

### Comparison

| Approach | Runtime Overhead | Per-Story Mocks | Complexity |
|----------|-----------------|-----------------|------------|
| **Storybook `sb.mock()`** | Zero | ❌ Global only | Medium |
| **Our Resolver** | Minimal (O(1) lookup) | ✅ Yes | Low |
| **Our AOT + Reload** | Zero | ✅ Yes | Medium |

## Conclusion

### Can we do `sb.mock()`-style AOT transformation?
**YES! With bundle reload, it's very feasible:**

1. ✅ **Story switching triggers reload** (good UX - only when mocks change)
2. ✅ **Story ID stored on native** (fast, synchronous read)
3. ✅ **Transformer rewrites imports** (true AOT transformation)
4. ✅ **Zero runtime overhead** (imports already point to mocks)

### Recommendation

**Use AOT Transformation with Bundle Reload:**
1. ✅ Detect story switch with mocks
2. ✅ Store story ID on native side
3. ✅ Trigger Metro reload
4. ✅ Transformer reads story ID and rewrites imports
5. ✅ Generate mock files from story `mocks` properties
6. ✅ Zero runtime overhead for mocking

This gives us:
- **Per-story mocks** (Storybook doesn't have this)
- **Zero runtime overhead** (like Storybook)
- **True AOT transformation** (imports rewritten at build time)
- **Simple story switching** (just reload when mocks change)

The only difference from Storybook:
- **Storybook**: Global mocks, no reload needed
- **Our approach**: Per-story mocks, reload when switching stories with mocks

This is actually **better** than Storybook for per-story mocking use cases!

