/**
 * Simplified mock file template - generates code with inline function declarations
 * Functions are defined inline in exported objects (like Step 3), which Metro preserves
 */

export interface SimpleMockFileTemplateOptions {
  packageName: string;
  requireStatement: string;
  fallbackRequireStatement: string;
  storyMocksCode: Record<string, string>; // { "story-id": "{ fn1: ..., fn2: ... }" } - whole object as string
  exportNames: string[];
  exportTypes: Record<string, 'function' | 'constant'>; // { "APP_NAME": "constant", "formatCurrency": "function" }
  hasDefaultExport: boolean;
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
  
  // Add timestamp comment to ensure Metro sees file as changed on each generation
  // This prevents Metro from using stale cached transforms
  const timestamp = Date.now();
  const timestampComment = `// Generated at ${new Date(timestamp).toISOString()} (timestamp: ${timestamp})\n`;

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
    storyExports.push(`export const ${exportName} = ${objectCode};`);
    storyExports.push(''); // Empty line between exports
  }
  
  // Combine all exported objects with timestamp comment
  const allCode = timestampComment + storyExports.join('\n');
  
  // Create a map of storyId -> story object for runtime access
  const storyMapEntries: string[] = [];
  for (const storyId of storyIds) {
    const exportName = storyIdToExportName[storyId];
    storyMapEntries.push(`  '${storyId}': ${exportName},`);
  }
  const storyMapCode = storyMapEntries.length > 0
    ? `\n// Map of story IDs to their mock objects\nconst storyMocks = {\n${storyMapEntries.join('\n')}\n};\n`
    : '';

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
          if (storyId && storyMocks[storyId] && storyMocks[storyId][name] !== undefined) {
            console.log(\`[SHERLO] \${name}: Mock value returned from story "\${storyId}"\`);
            return storyMocks[storyId][name];
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
        
        // Try to get mock from story
        if (storyId && storyMocks[storyId] && storyMocks[storyId][fnName] !== undefined) {
          console.log(\`[SHERLO] \${fnName}: Mock found for story "\${storyId}"\`);
          const mock = storyMocks[storyId][fnName];
          if (typeof mock === 'function') {
            const result = mock(...args);
            console.log(\`[SHERLO] \${fnName}: Mock function returned:\`, result);
            return result;
          }
          console.log(\`[SHERLO] \${fnName}: Mock value returned:\`, mock);
          return mock;
        }
        
        // Fallback to real module
        if (realModule && realModule[fnName] !== undefined) {
          console.log(\`[SHERLO] \${fnName}: Using real module implementation\`);
          const realValue = realModule[fnName];
          if (typeof realValue === 'function') {
            const result = realValue(...args);
            console.log(\`[SHERLO] \${fnName}: Real function returned:\`, result);
            return result;
          }
          console.log(\`[SHERLO] \${fnName}: Real value returned:\`, realValue);
          return realValue;
        }
        
        // If we get here, neither mock nor real module has this export
        const errorMsg = \`[SHERLO] Mock error: \${fnName} is not available. Story ID: \${storyId || 'not set'}, Real module: \${realModule ? 'loaded' : 'not loaded'}\`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      };
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
    
    // First, add all named exports to default export (if any)
    if (typeof allExportNames !== 'undefined') {
      for (let i = 0; i < allExportNames.length; i++) {
        const exportName = allExportNames[i];
        if (exportName !== 'default' && exports[exportName] !== undefined) {
          defaultExport[exportName] = exports[exportName];
        }
      }
    }
    
    // Then, check if there's a default mock in the current story
    if (storyId && storyMocks[storyId] && storyMocks[storyId].default !== undefined) {
      console.log(\`[SHERLO] default: Mock found for story "\${storyId}", merging with named exports\`);
      // If there's a default mock, merge it with the named exports (mock takes precedence)
      Object.assign(defaultExport, storyMocks[storyId].default);
      console.log('[SHERLO] default: Mock value returned:', defaultExport);
      return defaultExport;
    }
    
    // Fallback to real module default export
    if (realModule && realModule.default !== undefined) {
      console.log('[SHERLO] default: Using real module default export, merging with named exports');
      Object.assign(defaultExport, realModule.default);
      console.log('[SHERLO] default: Real module value returned:', defaultExport);
      return defaultExport;
    }
    
    // If no default mock or real default export, return the object with just named exports (if any)
    console.log('[SHERLO] default: No default mock or real default export, returning named exports only:', defaultExport);
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

${allCode}${storyMapCode}

// Log story map when mock file loads
console.log(\`[SHERLO] Story map initialized for ${packageName}. Available story IDs: \${Object.keys(storyMocks).join(', ')}\`);

${getGetCurrentStoryCode()}

${realModuleCode}

${runtimeDiscoveryCode}

${dynamicExportCode}

${defaultExportCode}
`;
}

