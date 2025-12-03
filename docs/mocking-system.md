# Mock System for React Native Storybook

## Overview

The mock system enables dynamic, per-story mocking of modules in React Native Storybook. It allows you to define mocks directly in your story files and automatically serves the correct mock based on the currently active story, without requiring bundle reloads or manual mock setup.

## Key Features

- **Per-Story Mocks**: Define different mocks for different story variants
- **Automatic Discovery**: Automatically discovers all story files and extracts mocks
- **Runtime Resolution**: Mocks are resolved at runtime based on the active story ID
- **Zero Production Impact**: Never affects production code - mocks only work in Storybook mode
- **Type-Safe**: Full TypeScript support
- **Smart Imports**: Supports using imported constants, types, and functions in mocks
- **Project-Agnostic**: Works with any project structure, including monorepos

## Architecture

### High-Level Flow

```mermaid
graph TB
    A[Metro Config Load] --> B[withSherlo Wrapper]
    B --> C[Discover Story Files]
    C --> D{Story Files Found?}
    D -->|Yes| E[Set Up Transformer]
    D -->|No| F[Skip Mock Setup]
    E --> G[Set Up Resolver]
    G --> H[Metro Bundling Starts]
    H --> I[Transformer Processes Files]
    I --> J{Is Story File?}
    J -->|Yes| K[Extract Mocks from AST]
    J -->|No| L[Pass Through]
    K --> M[Generate Mock Files]
    M --> N[Store in node_modules/.sherlo/mocks]
    N --> O[Runtime: Storybook Active]
    O --> P[useStorybookEventListener Sets Story ID]
    P --> Q[Component Requires Module]
    Q --> R[Resolver Checks for Mock File]
    R --> S{Mock File Exists?}
    S -->|Yes| T[Load Mock File]
    S -->|No| U[Load Real Module]
    T --> V[Mock File Checks Story ID]
    V --> W{Story ID Matches?}
    W -->|Yes| X[Return Mock]
    W -->|No| Y[Return Real Implementation]
```

### Component Architecture

```mermaid
graph LR
    A[withSherlo] --> B[Story Discovery]
    A --> C[Transformer Setup]
    A --> D[Resolver Setup]
    B --> E[storyDiscovery/]
    C --> F[sherloTransformer.ts]
    C --> G[mockExtractionTransformer.ts]
    D --> H[resolver/]
    G --> I[mockExtraction/]
    G --> J[generateMockFile.ts]
    J --> K[mockGeneration/]
    H --> L[mockResolver.ts]
    H --> M[realModuleResolver.ts]
```

## Installation

The mock system is automatically available when you use `@sherlo/react-native-storybook`. No additional installation required.

## Configuration

### Basic Setup

Add `withSherlo` to your Metro configuration:

```javascript
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config'); // or 'metro-config'
const withSherlo = require('@sherlo/react-native-storybook/metro/withSherlo');

const config = getDefaultConfig(__dirname);
module.exports = withSherlo(config);
```

**Important**: `withSherlo` must be called **after** `withStorybook`:

```javascript
const { getDefaultConfig } = require('expo/metro-config');
const { withStorybook } = require('@sherlo/react-native-storybook/metro');
const withSherlo = require('@sherlo/react-native-storybook/metro/withSherlo');

const config = getDefaultConfig(__dirname);
module.exports = withSherlo(withStorybook(config));
```

## Usage

### Defining Mocks in Stories

Mocks are defined using a `mocks` property in your story object:

```typescript
// Button.stories.tsx
import { Button } from './Button';

export const Basic = {
  mocks: {
    'expo-localization': {
      getLocales: () => [{ languageCode: 'en', countryCode: 'US' }],
    },
  },
  component: Button,
};

export const Polish = {
  mocks: {
    'expo-localization': {
      getLocales: () => [{ languageCode: 'pl', countryCode: 'PL' }],
    },
  },
  component: Button,
};
```

### Mock Path Conventions

**Recommended**: Use paths relative to your project root for consistency and clarity:

```typescript
export const WithProjectRootPath = {
  mocks: {
    'src/utils/helper': {  // Relative to project root
      getValue: () => 'mocked value',
    },
  },
  component: MyComponent,
};
```

**Also Supported**: Story-relative paths (paths relative to the story file):

```typescript
export const WithStoryRelativePath = {
  mocks: {
    '../utils/helper': {  // Relative to story file location
      getValue: () => 'mocked value',
    },
  },
  component: MyComponent,
};
```

> **Best Practice**: Use project-root relative paths (e.g., `src/utils/helper`) for better maintainability. Story-relative paths work but can break if story files are moved.

### Mocking Default Exports

```typescript
export const WithDefaultMock = {
  mocks: {
    'src/utils/testHelper': {  // Project-root relative path
      default: {
        getValue: () => 'mocked default',
      },
    },
  },
  component: MyComponent,
};
```

### Mocking Multiple Named Exports

```typescript
export const WithMultipleMocks = {
  mocks: {
    'some-package': {
      functionA: () => 'A',
      functionB: () => 'B',
      constantC: 'C',
    },
  },
  component: MyComponent,
};
```

### Mocking Async Functions

```typescript
export const WithAsyncMock = {
  mocks: {
    'src/utils/api': {  // Project-root relative path
      fetchUserData: async (id: string) => {
        return { id, name: 'Mocked User' };
      },
    },
  },
  component: MyComponent,
};
```

### Mocking Classes

```typescript
export const WithClassMock = {
  mocks: {
    '../utils/processor': {
      DataProcessor: class {
        process(data: any) {
          return 'mocked result';
        }
      },
    },
  },
  component: MyComponent,
};
```

#### Static Methods

Classes with static methods are fully supported. Static methods are preserved during mock generation:

```typescript
export const WithStaticMethodMock = {
  mocks: {
    '../utils/processor': {
      DataProcessor: class {
        static getInstance() {
          return new this();
        }
        
        process(data: any) {
          return 'mocked result';
        }
      },
    },
  },
  component: MyComponent,
};

// In your component/test:
const instance = DataProcessor.getInstance(); // ✅ Works correctly
```

> **Note**: Sherlo automatically transforms `class` expressions into constructor functions during mock generation to ensure compatibility with the Metro/Expo environment. Static methods are preserved by wrapping the constructor in an IIFE that assigns static properties. You can write standard `class` syntax with static methods in your mocks, and they will work correctly at runtime.

### Complex Object Mocks

```typescript
export const WithObjectMock = {
  mocks: {
    'some-package': {
      config: {
        apiUrl: 'https://mock.api',
        timeout: 5000,
        nested: {
          value: 'deep',
        },
      },
    },
  },
  component: MyComponent,
};
```

    },
  },
  component: MyComponent,
};
```

### Using Imported Values

You can use imported constants, types, or functions directly in your mocks. The system automatically extracts and preserves these imports:

```typescript
import { MOCK_USER, HelperClass } from './test-utils';
import { Theme } from './theme';

export const WithImports = {
  mocks: {
    '../api/user': {
      getUser: () => MOCK_USER, // Imported constant
      transform: (data: any) => new HelperClass(data), // Imported class
      theme: Theme.Dark, // Imported enum/object
    },
  },
  component: UserProfile,
};
```

### Factory Functions

Mocks work with factory functions that generate stories:

```typescript
function createColorStory(color: string) {
  return {
    mocks: {
      '../utils/theme': {
        getColor: () => color,
      },
    },
    component: ColoredButton,
  };
}

export const Red = createColorStory('red');
export const Blue = createColorStory('blue');
```

### Factory Functions (Advanced)

For advanced use cases, you can define mocks as **factory functions** that receive the original module implementation. This enables:
- Selective method overriding while preserving others
- Conditional mocking with fallback to original implementation
- Spreading original exports to avoid incomplete mocks

#### Basic Factory Function

```typescript
export const WithFactory = {
  mocks: {
    'apollo-client': (original) => ({
      default: {
        ...original.default,  // Preserve all original methods
        query: () => mockData,  // Override only this method
      }
    })
  },
  component: MyComponent,
};
```

#### Conditional Mocking

Factory functions can access the original implementation for conditional logic:

```typescript
export const ConditionalMock = {
  mocks: {
    '../api/client': (original) => ({
      default: {
        ...original.default,
        query: (args) => {
          // Mock specific queries
          if (args.query.includes('GetUser')) {
            return { data: { user: mockUser } };
          }
          // Fallback to original for others
          return original.default.query(args);
        }
      }
    })
  },
  component: MyComponent,
};
```

#### Overriding Multiple Exports

```typescript
export const MultipleExports = {
  mocks: {
    '../config': (original) => ({
      ...original,  // Preserve all exports
      API_URL: 'http://localhost:3000',  // Override constant
      client: {
        ...original.client,  // Preserve client methods
        query: () => mockData,  // Override one method
      }
    })
  },
  component: MyComponent,
};
```

> **Note**: Factory functions are called once per story and the result is cached. The `original` parameter contains the real module implementation.

### Special Values

The system handles special JavaScript values correctly:

```typescript
export const WithSpecialValues = {
  mocks: {
    '../utils/math': {
      nan: NaN,
      infinity: Infinity,
      negativeInfinity: -Infinity,
      date: new Date('2024-01-01'),
      regex: /test/g,
    },
  },
  component: MyComponent,
};
```

### No Mocks Variant (Fallback to Real)

If a story doesn't define mocks, or if a specific package isn't mocked, the system automatically falls back to the real implementation:

```typescript
export const NoMocks = {
  // No mocks defined - all imports use real implementations
  component: MyComponent,
};
```

## How It Works

### 1. Story Discovery

When Metro starts, `withSherlo` discovers all story files by:
1. Reading Storybook's `main.ts`/`main.js` configuration
2. Or reading the generated `storybook.requires.ts` file
3. Expanding glob patterns to find all `.stories.?(ts|tsx|js|jsx)` files

### 2. Mock Extraction

During Metro bundling, the transformer:
1. Processes each file through Metro's transformation pipeline
2. Identifies story files
3. Parses the **original** source code using Babel AST (to preserve imports)
4. Extracts `mocks` objects and any referenced imports
5. Stores mocks in a global cache

### 3. Mock File Generation

After extracting mocks, the system:
1. Groups mocks by package/module name
2. Resolves mock keys to absolute file paths (handles both project-root relative and story-relative paths)
3. Generates a mock file for each mocked package in `node_modules/.sherlo/mocks/`
4. Creates a `mock-registry.json` that maps absolute file paths to mock file locations
5. Each mock file contains:
   - All mocks for that package across all stories
   - Runtime logic to select the correct mock based on story ID
   - Fallback logic to use real implementation when no mock matches
   - Circular reference prevention (mock files don't re-import themselves)

### 4. Runtime Resolution

When a component requires a module:
1. Metro's resolver checks the `mock-registry.json` for the resolved absolute path
2. If a mock file exists for that path, it redirects the import to the mock file
3. **Circular Reference Prevention**: If the import is from within a mock file (detected by checking if the origin path contains `.sherlo/mocks`), the resolver skips mocking to prevent infinite loops
4. The mock file checks `__SHERLO_CURRENT_STORY_ID__` (set by `useStorybookEventListener`)
5. If a mock exists for the current story ID, it returns the mock
6. Otherwise, it falls back to the real module implementation

### 5. Story ID Tracking

`useStorybookEventListener` hook:
1. Listens to Storybook's internal channel events
2. Sets `__SHERLO_CURRENT_STORY_ID__` when stories change
3. Only runs when Storybook is active (checks for `view._channel`)

## Production Safety

### Safety Guarantees

The mock system is designed with production safety as a core principle. **Mocks never affect production code** and have **zero runtime overhead** when Storybook is not active.

#### 1. Mocks Never Returned in Production

**Mechanism**: All mock files check `getCurrentStory()` which returns `null` when:
- `__SHERLO_CURRENT_STORY_ID__` is not set (production app)
- `__SHERLO_CURRENT_STORY_ID__` is `undefined` (production app)
- Storybook is not running

**Code Pattern**:
```javascript
const getCurrentStory = () => {
  const storyId = (typeof global !== 'undefined' && global.__SHERLO_CURRENT_STORY_ID__) || null;
  return storyId;
};

// In all property generators:
const storyId = getCurrentStory();
if (storyId && storyMocks[storyId] && storyMocks[storyId][exportName]) {
  // Return mock
} else {
  // ALWAYS falls back to real implementation
  return realModule[exportName] || require('package:real')[exportName];
}
```

**Verification**: ✅ **SAFE** - When `storyId` is `null`, mocks are never returned. All code paths fall back to `realModule`.

#### 2. Story ID Only Set in Storybook Mode

**Mechanism**: `__SHERLO_CURRENT_STORY_ID__` is ONLY set when:
- Storybook's `view._channel` exists (Storybook is active)
- Storybook events fire (`STORY_PREPARED`, `SET_STORY_INDEX`)

**Code**:
```typescript
const view = (global as any).view;
const channel = view?._channel;

if (!channel) {
  return; // Early exit - Storybook not active
}

// Only sets storyId if channel exists
const storeStoryId = (storyId: string) => {
  (global as any).__SHERLO_CURRENT_STORY_ID__ = storyId;
};
```

**Verification**: ✅ **SAFE** - In production apps without Storybook, `view._channel` doesn't exist, so `useStorybookEventListener` exits early and never sets `__SHERLO_CURRENT_STORY_ID__`.

#### 3. Mock Files Only Created When Story Files Exist

**Mechanism**: 
- Mock files are only generated when story files are discovered
- Mock files are only generated during Metro bundling (build time)
- If no story files exist, no mock files are created

**Verification**: ✅ **SAFE** - If a project has no story files, no mock files are generated, so the resolver never finds them.

#### 4. No Performance Impact

**Build Time**:
- Story file discovery: ~10-100ms (one-time, at Metro startup)
- Resolver checks: ~0.1-1ms per module (only during bundling, optimized to skip when no story files exist)
- Mock file generation: ~10-50ms per package (only if story files exist)

**Runtime (Production)**:
- ✅ **ZERO** overhead - Mock files are not loaded, resolver doesn't run

**Runtime (Storybook)**:
- ✅ **NEGLIGIBLE** overhead (~0.001ms per property access)

### Verification

You can verify production safety by:
1. Checking that `__SHERLO_CURRENT_STORY_ID__` is `undefined` in production
2. Confirming that mock files don't exist in production builds (unless story files are included, which they shouldn't be)
3. Testing that all imports resolve to real modules in production
4. Verifying that resolver skips file system checks when no story files exist (performance optimization)

## Advanced Usage

### Factory Functions

Mocks work with factory functions that generate stories:

```typescript
function createColorStory(color: string) {
  return {
    mocks: {
      '../utils/theme': {
        getColor: () => color,
      },
    },
    component: ColoredButton,
  };
}

export const Red = createColorStory('red');
export const Blue = createColorStory('blue');
```

### Nested Mocks

You can mock modules that internally use other mocked modules:

```typescript
export const WithNestedMocks = {
  mocks: {
    '../utils/api': {
      fetchData: async () => ({ data: 'mocked' }),
    },
    '../utils/processor': {
      processData: (data: any) => {
        // This can use other mocked modules if needed
        return `processed: ${data.data}`;
      },
    },
  },
  component: MyComponent,
};
```

### Conditional Mocks

Mocks can contain conditional logic:

```typescript
export const ConditionalMock = {
  mocks: {
    '../utils/feature': {
      isEnabled: (feature: string) => feature === 'premium',
    },
  },
  component: MyComponent,
};
```

## Troubleshooting

### Mocks Not Working

1. **Check Storybook is Active**: Mocks only work when Storybook is running. Verify `view._channel` exists.

2. **Verify Story Files Discovered**: Check `.sherlo/story-files.json` to see if your story files were discovered.

3. **Check Mock File Generation**: Look in `node_modules/.sherlo/mocks/` to see if mock files were generated for your packages.

4. **Verify Story ID**: Check that `__SHERLO_CURRENT_STORY_ID__` is set in Storybook mode (use React Native Debugger or console).

5. **Check Mock File Content**: Inspect the generated mock files to ensure mocks were extracted correctly.

### Performance Issues

1. **Too Many Story Files**: If you have hundreds of story files, discovery might be slow. Consider organizing stories into fewer files.

2. **Large Mock Objects**: Very large mock objects might slow down serialization. Consider simplifying mocks or using factory functions.

### Module Resolution Issues

1. **Path Conventions**: Use project-root relative paths (e.g., `src/utils/helper`) for consistency. Story-relative paths (e.g., `../utils/helper`) also work but are less maintainable.

2. **Monorepo Setup**: The system automatically discovers source directories and resolves paths correctly in monorepos.

3. **Circular References**: If you encounter infinite loops, ensure your mock definitions don't create circular dependencies. The system prevents mock files from importing themselves, but complex dependency chains might still cause issues.

## File Structure

```
packages/react-native-storybook/src/metro/
├── withSherlo.ts                 # Main entry point
├── sherloTransformer.ts          # Metro transformer wrapper
├── mockExtractionTransformer.ts  # Mock extraction logic
├── generateMockFile.ts            # Mock file generation
├── mockSerialization.ts          # Serialization utilities
├── constants.ts                  # Shared constants
├── types.ts                      # TypeScript types
├── mockExtraction/               # Mock extraction utilities
│   ├── extractPrimitive.ts
│   ├── extractFunction.ts
│   ├── extractClass.ts
│   ├── extractArray.ts
│   ├── extractSpecialValues.ts
│   └── ...
├── mockGeneration/               # Mock file generation utilities
│   ├── mockFileTemplate.ts
│   ├── generateFunctionProperty.ts
│   ├── generateClassProperty.ts
│   ├── generateValueProperty.ts
│   └── ...
├── resolver/                     # Metro resolver logic
│   ├── mockResolver.ts
│   ├── realModuleResolver.ts
│   └── pathNormalization.ts
└── storyDiscovery/              # Story file discovery
    ├── configReader.ts
    ├── fileFinder.ts
    └── globUtils.ts
```

## Limitations

1. **Metro Bundler Only**: This system only works with Metro bundler (React Native's default). It doesn't work with other bundlers.

2. **Build-Time Generation**: Mock files are generated during Metro bundling. Changes to mocks require a Metro reload.

3. **No Dynamic Requires**: Metro doesn't support dynamic `require()` calls, so mocks must be statically analyzable.

4. **Serialization Constraints**: Some complex objects might not serialize perfectly. The system handles most cases, including imports, but extremely dynamic values (like closures capturing local variables) are not supported.

## Best Practices

1. **Keep Mocks Simple**: Prefer simple, focused mocks over complex ones. Use factory functions for variations.

2. **Document Mock Behavior**: Add comments explaining why mocks are needed and what they simulate.

3. **Test Without Mocks**: Ensure your components work with real implementations (use "No Mocks" variants).

4. **Organize Story Files**: Group related stories together to improve discovery performance.

5. **Use TypeScript**: Leverage TypeScript for type safety in mock definitions.

## Examples

See the `MockTestingStory` component in the testing setup for comprehensive examples of all mock types and edge cases.

## Related Documentation

- [Storybook Integration](../packages/react-native-storybook/README.md) - General Storybook setup

