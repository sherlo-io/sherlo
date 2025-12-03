/**
 * Simplified mock file template - generates code with inline function declarations
 * Functions are defined inline in exported objects (like Step 3), which Metro preserves
 */

export interface SimpleMockFileTemplateOptions {
  packageName: string;
  requireStatement: string;
  fallbackRequireStatement: string;
  storyMocksCode: Record<string, string>; // { "story-id": "{ fn1: ..., fn2: ... }" } - whole object as string
  storyMocksMetadata: Record<string, { isFactory: boolean }>; // NEW: Factory metadata
  exportNames: string[];
  exportTypes: Record<string, 'function' | 'constant'>; // { "APP_NAME": "constant", "formatCurrency": "function" }
  hasDefaultExport: boolean;
  imports?: string[]; // Array of import statements
}

/**
 * Helper to get current story ID from global
 */
function getGetCurrentStoryCode(): string {
  return `
// Helper to get current story ID from global
function getCurrentStory() {
  try {
    // Use JavaScript-compatible syntax (no TypeScript type assertions)
    // Access global via bracket notation to avoid type checking issues
    const globalObj = typeof global !== 'undefined' ? global : typeof globalThis !== 'undefined' ? globalThis : {};
    const storyId = globalObj.__SHERLO_CURRENT_STORY_ID__ || null;
    if (storyId) {
      console.log(\`[SHERLO] getCurrentStory: Found story ID "\${storyId}"\`);
    } else {
      console.log('[SHERLO] getCurrentStory: No story ID set (__SHERLO_CURRENT_STORY_ID__ is not set)');
    }
    return storyId;
  } catch (error) {
    console.error('[SHERLO] getCurrentStory: Error accessing global:', error);
    return null;
  }
}
`;
}

/**
 * Generates a mock file using the registry pattern
 * Uses runtime export discovery to support partial mocking.
 * Babel/Metro cannot safely optimize away function bodies when they're passed to unknown functions.
 */
export function generateSimpleMockFileTemplate(options: SimpleMockFileTemplateOptions): string {
  const {
    packageName,
    storyMocksCode,
  } = options;

  const storyIds = Object.keys(storyMocksCode);
  
  // Generate exported objects - copy code strings as-is (TypeScript to TypeScript)
  // No conversion, no detection, just copy everything directly
  const storyExports: string[] = [];
  const storyIdToExportName: Record<string, string> = {};
  
  for (const storyId of storyIds) {
    const exportName = `story_${storyId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    storyIdToExportName[storyId] = exportName;
    
    // storyMocksCode[storyId] is now the whole object as a string: "{ fn1: ..., fn2: ... }"
    const objectCode = storyMocksCode[storyId];
    
    // Assign the whole object directly - no need to parse individual properties
    storyExports.push(`const ${exportName} = ${objectCode};`);
    storyExports.push(''); // Empty line between exports
  }
  
  // Combine all exported objects (no timestamp - hash comparison handles change detection)
  const allCode = storyExports.join('\n');
  
  // Create a map of storyId -> story object for runtime access
  const storyMapEntries: string[] = [];
  for (const storyId of storyIds) {
    const exportName = storyIdToExportName[storyId];
    storyMapEntries.push(`  '${storyId}': ${exportName},`);
  }
  const storyMapCode = storyMapEntries.length > 0
    ? `\n// Map of story IDs to their mock objects\nconst storyMocks = {\n${storyMapEntries.join('\n')}\n};\n`
    : '';

  // Factory metadata - which stories use factory functions
  const factoryMetadataEntries: string[] = [];
  for (const storyId of storyIds) {
    const metadata = options.storyMocksMetadata[storyId];
    if (metadata) {
      factoryMetadataEntries.push(`  '${storyId}': ${metadata.isFactory},`);
    }
  }
  const factoryMetadataCode = factoryMetadataEntries.length > 0
    ? `\n// Factory metadata - which stories use factory functions\nconst storyFactoryFlags = {\n${factoryMetadataEntries.join('\n')}\n};\n`
    : '';

  // Helper function to resolve factory functions
  const factoryResolverCode = `
// Cache for factory results (to avoid re-execution)
const factoryCache = {};

// Helper to get mock for story (handles both objects and factories)
function getMockForStory(storyId) {
  if (!storyId || !storyMocks[storyId]) {
    return null;
  }
  
  // Check if already cached
  if (factoryCache[storyId]) {
    return factoryCache[storyId];
  }
  
  const mockDef = storyMocks[storyId];
  const isFactory = storyFactoryFlags[storyId];
  
  // If it's a factory function, call it with realModule
  if (isFactory && typeof mockDef === 'function') {
    console.log(\`[SHERLO] Calling factory function for story "\${storyId}"\`);
    try {
      const result = mockDef(realModule);
      factoryCache[storyId] = result;
      console.log(\`[SHERLO] Factory result cached for story "\${storyId}"\`);
      return result;
    } catch (error) {
      console.error(\`[SHERLO] Factory function failed for story "\${storyId}":\`, error);
      return null;
    }
  }
  
  // Regular object mock
  factoryCache[storyId] = mockDef;
  return mockDef;
}
`;

  // Load real module as fallback
  const hasDifferentFallback = options.requireStatement !== options.fallbackRequireStatement;
  const realModuleCode = hasDifferentFallback
    ? `
// Load real module as fallback
let realModule = null;
try {
  realModule = ${options.requireStatement};
} catch {
  try {
    realModule = ${options.fallbackRequireStatement};
  } catch {
    // Real module not available
  }
}
`
    : `
// Load real module as fallback
let realModule = null;
try {
  console.log(\`[SHERLO] Loading real module: ${options.requireStatement}\`);
  realModule = ${options.requireStatement};
  console.log(\`[SHERLO] Real module loaded successfully. Exports: \${Object.keys(realModule || {}).join(', ') || 'none'}\`);
} catch (error) {
  console.warn(\`[SHERLO] Failed to load real module: ${options.requireStatement}\`, error.message);
  // Real module not available
}
`;

  // Runtime export discovery: Discover ALL exports from real module at runtime
  // This allows us to support partial mocking (mock some exports, use real for others)
  // We merge discovered exports with mocked exports (union)
  const runtimeDiscoveryCode = `
// Runtime export discovery: Discover all exports from real module
// This allows partial mocking - we can mock some exports while using real implementations for others
let allExportNames = [];
if (realModule && typeof realModule === 'object') {
  // Discover all exports from real module (excluding __esModule)
  allExportNames = Object.keys(realModule).filter(key => key !== '__esModule');
  console.log(\`[SHERLO] Discovered \${allExportNames.length} exports from real module: \${allExportNames.join(', ')}\`);
  
  // Also discover exports from mocked stories (union of all mocked properties)
  const mockedExportNames = new Set();
  for (const storyId in storyMocks) {
    if (storyMocks[storyId] && typeof storyMocks[storyId] === 'object') {
      Object.keys(storyMocks[storyId]).forEach(key => {
        if (key !== 'default') {
          mockedExportNames.add(key);
        }
      });
    }
  }
  console.log(\`[SHERLO] Found \${mockedExportNames.size} mocked exports: \${Array.from(mockedExportNames).join(', ')}\`);
  
  // Merge discovered exports with mocked exports (union)
  // This ensures we generate exports for everything, even if not mocked
  // IMPORTANT: Add mocked exports FIRST, then real module exports, to ensure mocked ones take precedence
  const finalExportNames = Array.from(mockedExportNames);
  // Then add real module exports that aren't mocked
  allExportNames.forEach(name => {
    if (!finalExportNames.includes(name)) {
      finalExportNames.push(name);
    }
  });
  allExportNames = finalExportNames;
  
  console.log(\`[SHERLO] Final export list (\${allExportNames.length} total): \${allExportNames.join(', ')}\`);
  console.log(\`[SHERLO] Export order: \${allExportNames.map((name, idx) => \`\${idx}:\${name}\`).join(', ')}\`);
} else {
  // Real module not available - fall back to mocked exports only
  console.warn(\`[SHERLO] Real module not available, using mocked exports only\`);
  const mockedExportNames = new Set();
  for (const storyId in storyMocks) {
    if (storyMocks[storyId] && typeof storyMocks[storyId] === 'object') {
      Object.keys(storyMocks[storyId]).forEach(key => {
        if (key !== 'default') {
          mockedExportNames.add(key);
        }
      });
    }
  }
  allExportNames = Array.from(mockedExportNames);
  console.log(\`[SHERLO] Using mocked exports only: \${allExportNames.join(', ')}\`);
}

// Helper function to determine export type (function vs constant)
function getExportType(exportName) {
  // Check if it's mocked - use the type from the first story that mocks it
  for (const storyId in storyMocks) {
    if (storyMocks[storyId] && storyMocks[storyId][exportName] !== undefined) {
      const mockValue = storyMocks[storyId][exportName];
      return typeof mockValue === 'function' ? 'function' : 'constant';
    }
  }
  
  // Check real module if available
  if (realModule && realModule[exportName] !== undefined) {
    const realValue = realModule[exportName];
    return typeof realValue === 'function' ? 'function' : 'constant';
  }
  
  // Default to function if unknown
  return 'function';
}
`;

  // Generate exports dynamically at runtime for all discovered exports
  // This code will iterate over allExportNames (discovered at runtime) and generate exports
  // We no longer generate static exports - everything is discovered and generated dynamically
  // CRITICAL: Use IIFE to ensure each exportName is properly captured in its own closure
  const dynamicExportCode = `
// Generate exports dynamically for all discovered exports
// This supports partial mocking - mocked exports use mocks, unmocked exports use real module
// Use IIFE to ensure each exportName is captured correctly in its closure
for (let i = 0; i < allExportNames.length; i++) {
  const exportName = allExportNames[i];
  if (exportName === 'default') continue; // Handle default export separately
  
  // Use IIFE to capture exportName in closure (prevents Metro from mixing up names)
  (function(name) {
    const exportType = getExportType(name);
    
    if (exportType === 'constant') {
      // For constants, use Object.defineProperty with getter
      Object.defineProperty(exports, name, {
        get: function() {
          console.log(\`[SHERLO] \${name} (constant) accessed\`);
          const storyId = getCurrentStory();
          const mockObj = getMockForStory(storyId);  // Use helper to resolve factories
          
          if (mockObj && mockObj[name] !== undefined) {
            console.log(\`[SHERLO] \${name}: Mock value returned from story "\${storyId}"\`);
            return mockObj[name];
          }
          
          // Fallback to real module
          if (realModule && realModule[name] !== undefined) {
            console.log(\`[SHERLO] \${name}: Real module value returned\`);
            return realModule[name];
          }
          
          console.warn(\`[SHERLO] \${name}: No mock or real value found\`);
          return undefined;
        },
        enumerable: true,
        configurable: true
      });
    } else {
      // For functions, use Object.defineProperty to create a function property
      // This is more explicit and less likely to be optimized incorrectly by Metro
      // CRITICAL: Create function with name hardcoded in the function body to prevent Metro from mixing up names
      // Store the name as a constant inside the function to ensure it's captured correctly
      const exportNameForThisFunction = name; // Explicitly capture name in closure
      const fn = function(...args) {
        // Use the captured name, not the template variable (prevents Metro optimization issues)
        const fnName = exportNameForThisFunction;
        console.log(\`[SHERLO] \${fnName} called with args:\`, args);
        const storyId = getCurrentStory();
        const mockObj = getMockForStory(storyId);  // Use helper to resolve factories
        console.log(\`[SHERLO] \${fnName}: mockObj =\`, mockObj, \`, has property? \${mockObj ? (fnName in mockObj) : 'mockObj is null'}\`);
        
        // Try to get mock from story
        if (mockObj && mockObj[fnName] !== undefined) {
          console.log(\`[SHERLO] \${fnName}: Mock found for story "\${storyId}"\`);
          const mock = mockObj[fnName];
          if (typeof mock === 'function') {
            // Check if called with 'new' (constructor call)
            // new.target is defined when function is called as constructor
            if (new.target) {
              console.log(\`[SHERLO] \${fnName}: Called with 'new', instantiating mock class\`);
              const instance = new mock(...args);
              console.log(\`[SHERLO] \${fnName}: Mock class instance created\`);
              return instance;
            } else {
              // Regular function call
              const result = mock(...args);
              console.log(\`[SHERLO] \${fnName}: Mock function returned:\`, result);
              return result;
            }
          }
          console.log(\`[SHERLO] \${fnName}: Mock value returned:\`, mock);
          return mock;
        }
        
        // Fallback to real module
        if (realModule && realModule[fnName] !== undefined) {
          console.log(\`[SHERLO] \${fnName}: Using real module implementation\`);
          const realValue = realModule[fnName];
          if (typeof realValue === 'function') {
            // Check if called with 'new' for real module too
            if (new.target) {
              const instance = new realValue(...args);
              console.log(\`[SHERLO] \${fnName}: Real class instance created\`);
              return instance;
            } else {
              const result = realValue(...args);
              console.log(\`[SHERLO] \${fnName}: Real function returned:\`, result);
              return result;
            }
          }
          console.log(\`[SHERLO] \${fnName}: Real value returned:\`, realValue);
          return realValue;
        }
        
        // If we get here, neither mock nor real module has this export
        const errorMsg = \`[SHERLO] Mock error: \${fnName} is not available. Story ID: \${storyId || 'not set'}, Real module: \${realModule ? 'loaded' : 'not loaded'}\`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      };
      
      // Instead of using a Proxy (which triggers on every property access),
      // eagerly copy known static properties using getters that check the current mock
      // This is more performant as it only triggers when actually accessing static methods
      const knownStaticProps = ['getInstance', 'create', 'from', 'of']; // Common static method names
      
      knownStaticProps.forEach(function(staticProp) {
        Object.defineProperty(fn, staticProp, {
          get: function() {
            const storyId = getCurrentStory();
            const mockObj = getMockForStory(storyId);
            const currentMock = mockObj && mockObj[name];
            
            if (currentMock && typeof currentMock === 'function' && staticProp in currentMock) {
              return currentMock[staticProp];
            }
            
            return undefined;
          },
          enumerable: false,
          configurable: true
        });
      });
      
      // Use Object.defineProperty to ensure the function is assigned with the correct name
      Object.defineProperty(exports, name, {
        value: fn,
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
  })(exportName); // Pass exportName as parameter to IIFE to ensure proper closure
}
`;

  // Default export if needed
  // Since we're using dynamic exports, we need to build defaultExport dynamically too
  // CRITICAL: Use Object.defineProperty with a getter so it's evaluated at runtime, not module load time
  const defaultExportCode = options.hasDefaultExport
    ? `
// Default export - dynamically build from all discovered exports
// Use Object.defineProperty with getter to ensure it's evaluated at runtime (when accessed), not at module load time
Object.defineProperty(exports, 'default', {
  get: function() {
    console.log('[SHERLO] default export accessed');
    const storyId = getCurrentStory();
    
    // Build default export object dynamically
    const defaultExport = {};
    
    // Check if there's a default mock in the current story first
    const mockObj = getMockForStory(storyId);  // Use helper to resolve factories
    if (mockObj && mockObj.default !== undefined) {
      console.log(\`[SHERLO] default: Mock found for story "\${storyId}"\`);
      // If there's a default mock, use it directly (it should already have all needed properties)
      console.log('[SHERLO] default: Mock value returned:', mockObj.default);
      return mockObj.default;
    }
    
    // No active story or no default mock - fall back to real module
    if (realModule && realModule.default !== undefined) {
      console.log('[SHERLO] default: Using real module default export');
      console.log('[SHERLO] default: Real module value returned:', realModule.default);
      return realModule.default;
    }
    
    // If no default mock or real default export, build from named exports
    // IMPORTANT: When no story is active, get values from real module, not wrapper functions
    if (typeof allExportNames !== 'undefined') {
      if (!storyId && realModule) {
        // No story active - use real module values directly
        console.log('[SHERLO] default: No story active, building from real module named exports');
        for (let i = 0; i < allExportNames.length; i++) {
          const exportName = allExportNames[i];
          if (exportName !== 'default' && realModule[exportName] !== undefined) {
            defaultExport[exportName] = realModule[exportName];
          }
        }
      } else {
        // Story is active - use the wrapper functions (they will resolve to mocks)
        console.log('[SHERLO] default: Story active, building from wrapper exports');
        for (let i = 0; i < allExportNames.length; i++) {
          const exportName = allExportNames[i];
          if (exportName !== 'default' && exports[exportName] !== undefined) {
            defaultExport[exportName] = exports[exportName];
          }
        }
      }
    }
    
    console.log('[SHERLO] default: Returning built default export:', defaultExport);
    return defaultExport;
  },
  enumerable: true,
  configurable: true
});
`
    : '';

  return `/**
 * Auto-generated mock file for ${packageName}
 * Simplified approach: inline function declarations in exported objects
 */

// Log available stories when mock file loads
console.log(\`[SHERLO] Mock file loaded for package: ${packageName}\`);
console.log(\`[SHERLO] Pre-configured exports: ${options.exportNames.length > 0 ? options.exportNames.join(', ') : '(will be discovered at runtime)'}\`);

${options.imports ? options.imports.join('\n') : ''}

${allCode}${storyMapCode}${factoryMetadataCode}

// Log story map when mock file loads
console.log(\`[SHERLO] Story map initialized for ${packageName}. Available story IDs: \${Object.keys(storyMocks).join(', ')}\`);

${getGetCurrentStoryCode()}

${realModuleCode}

${factoryResolverCode}

${runtimeDiscoveryCode}

${dynamicExportCode}

${defaultExportCode}
`;
}

