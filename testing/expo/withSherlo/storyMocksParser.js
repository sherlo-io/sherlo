// storyMocksParser.js
const fs = require('fs');
const path = require('path');

const DEBUG = false;

/**
 * Extracts mocks from a single variant
 * @param {Object} storyModule - The loaded story module
 * @param {string} variantName - Name of the variant
 * @returns {Object|null} - Mocks object or null if not found
 */
function extractMocksFromVariant(storyModule, variantName) {
  const variant = storyModule[variantName];
  if (variant && variant.mocks) {
    return variant.mocks;
  }
  return null;
}

/**
 * Parses a story file and extracts mocks from ALL variants
 * @param {string} storyFilePath - Absolute path to the story file
 * @returns {Object} - Object mapping variant names to their mocks: { variantName: { packageName: mockConfig } }
 */
function extractAllMocksFromStory(storyFilePath) {
  if (!fs.existsSync(storyFilePath)) {
    throw new Error(`Story file not found: ${storyFilePath}`);
  }

  let allVariantsMocks = {};

  // Strategy 1: Try to require the file directly (works if Metro has processed it)
  try {
    const resolvedPath = require.resolve(storyFilePath);
    delete require.cache[resolvedPath];
    const storyModule = require(resolvedPath);

    // Extract all exported variants (everything except 'default')
    for (const [key, value] of Object.entries(storyModule)) {
      if (key !== 'default' && typeof value === 'object' && value !== null) {
        const mocks = extractMocksFromVariant(storyModule, key);
        if (mocks) {
          allVariantsMocks[key] = mocks;
        }
      }
    }

    if (Object.keys(allVariantsMocks).length > 0) {
      return allVariantsMocks;
    }
  } catch (requireError) {
    // Fall through to parsing approach
  }

  // Strategy 2: Parse the file content to find all variants
  try {
    const content = fs.readFileSync(storyFilePath, 'utf-8');

    // Find all variant exports: export const VariantName = { ... }
    const variantExportPattern = /export\s+(?:const|var|let)\s+(\w+)\s*=\s*\{/g;
    let variantMatch;

    while ((variantMatch = variantExportPattern.exec(content)) !== null) {
      const variantName = variantMatch[1];
      const variantStart = variantMatch.index + variantMatch[0].length;

      // Find the matching closing brace for this variant
      let braceCount = 1;
      let pos = variantStart;
      let variantEnd = -1;

      while (pos < content.length && braceCount > 0) {
        const char = content[pos];
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (braceCount === 0) {
          variantEnd = pos;
          break;
        }
        pos++;
      }

      if (variantEnd !== -1) {
        const variantContent = content.substring(variantStart, variantEnd);

        // Check if this variant has mocks
        const mocksPattern = /mocks\s*:\s*\{/s;
        const mocksMatch = variantContent.match(mocksPattern);

        if (mocksMatch) {
          const mocksStart = variantStart + mocksMatch.index + mocksMatch[0].length;

          // Find the matching closing brace for the mocks object
          braceCount = 1;
          pos = mocksStart;
          let mocksEnd = -1;

          while (pos < content.length && braceCount > 0) {
            const char = content[pos];
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
            if (braceCount === 0) {
              mocksEnd = pos;
              break;
            }
            pos++;
          }

          if (mocksEnd !== -1) {
            const mocksContent = content.substring(mocksStart, mocksEnd);
            const variantMocks = {};

            // Parse individual package mocks
            const packagePattern = /['"`]([^'"`]+)['"`]\s*:\s*\{/g;
            let packageMatch;

            while ((packageMatch = packagePattern.exec(mocksContent)) !== null) {
              const packageName = packageMatch[1];
              const pkgStart = mocksStart + packageMatch.index + packageMatch[0].length;

              // Find the matching closing brace for this package's mock
              braceCount = 1;
              pos = pkgStart;
              let pkgEnd = -1;

              while (pos < content.length && braceCount > 0) {
                const char = content[pos];
                if (char === '{') braceCount++;
                if (char === '}') braceCount--;
                if (braceCount === 0) {
                  pkgEnd = pos;
                  break;
                }
                pos++;
              }

              if (pkgEnd !== -1) {
                const pkgMockContent = content.substring(pkgStart, pkgEnd);
                variantMocks[packageName] = pkgMockContent;
              }
            }

            if (Object.keys(variantMocks).length > 0) {
              allVariantsMocks[variantName] = variantMocks;
            }
          }
        }
      }
    }
  } catch (parseError) {
    throw new Error(
      `Could not parse story file ${storyFilePath}. Parse error: ${parseError.message}`
    );
  }

  if (Object.keys(allVariantsMocks).length === 0) {
    console.warn(`[SHERLO:mocksParser] No mocks found in any variant in ${storyFilePath}`);
  } else {
    console.log(
      `[SHERLO:mocksParser] Found mocks in ${Object.keys(allVariantsMocks).length} variant(s):`,
      Object.keys(allVariantsMocks)
    );
  }

  return allVariantsMocks;
}

/**
 * Generates a mock file content for a package based on all variants' mocks
 * @param {string} packageName - Name of the package to mock
 * @param {Object} variantsMocks - Object mapping variant names to their mock configs: { variantName: mockConfig }
 * @returns {string} - Generated mock file content
 */
function generateMockFileContent(packageName, variantsMocks) {
  // Convert each variant's mock to code
  const variantMocksCode = [];

  for (const [variantName, mockConfig] of Object.entries(variantsMocks)) {
    let mockConfigCode;

    if (typeof mockConfig === 'object' && mockConfig !== null) {
      // If it's already an object (from require), serialize it properly
      const parts = [];
      for (const [key, value] of Object.entries(mockConfig)) {
        if (typeof value === 'function') {
          parts.push(`${key}: ${value.toString()}`);
        } else {
          parts.push(`${key}: ${JSON.stringify(value)}`);
        }
      }
      mockConfigCode = `{ ${parts.join(', ')} }`;
    } else if (typeof mockConfig === 'string') {
      // It's a string from parsing - wrap it in an object literal
      mockConfigCode = `{ ${mockConfig} }`;
    } else {
      mockConfigCode = JSON.stringify(mockConfig);
    }

    variantMocksCode.push(`  '${variantName}': ${mockConfigCode}`);
  }

  const allVariantsMocksCode = `{\n${variantMocksCode.join(',\n')}\n}`;

  return `// Auto-generated mock for ${packageName}
// This file is generated dynamically from story mocks configuration
// Supports dynamic variant switching via getCurrentVariant()


let storybookModule = null;
let getCurrentVariantFn = null;
let SherloModule = null;

try {
  storybookModule = require('@sherlo/react-native-storybook');
  getCurrentVariantFn = storybookModule.getCurrentVariant;
  SherloModule = storybookModule.SherloModule;
  
  
  if (!SherloModule) {
    console.warn('[SHERLO:mock ${packageName}] SherloModule not found in storybook module exports');
  }
} catch (e) {
  console.warn('[SHERLO:mock ${packageName}] Failed to import @sherlo/react-native-storybook:', e?.message);
}

function loadReal() {
  try {
    const mod = require('${packageName}:real');
    return mod && mod.__esModule && mod.default ? mod.default : mod;
  } catch (e) {
    console.warn('[SHERLO:mock ${packageName}] Failed to load real module:', e?.message);
    return null;
  }
}

// All variants' mocks: { variantName: mockConfig }
const variantsMocks = ${allVariantsMocksCode};

function getMockForCurrentVariant() {
  // Check if we're in storybook mode dynamically by checking SherloModule.getMode()
  let isStorybookMode = false;
  if (SherloModule && typeof SherloModule.getMode === 'function') {
    const mode = SherloModule.getMode();
    isStorybookMode = ['storybook', 'testing'].includes(mode);
  } else {
    // Fallback: try the exported isStorybookMode (but it might be stale)
    const exportedIsStorybookMode = storybookModule?.isStorybookMode;
    if (typeof exportedIsStorybookMode === 'function') {
      isStorybookMode = exportedIsStorybookMode();
    } else {
      isStorybookMode = !!exportedIsStorybookMode;
    }
  }
  
  if (!isStorybookMode) {
    return null;
  }
  
  // Try to get variant directly from global cache first (most reliable)
  let currentVariant = null;
  try {
    const globalAny = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {});
    
    // Read directly from global, don't use any helper functions
    const cache = globalAny.__SHERLO_VARIANT_CACHE__;
    const storyId = cache?.currentStoryId;
    
    if (storyId && typeof storyId === 'string') {
      // Extract variant from story ID: componentId--variantName
      const parts = storyId.split('--');
      if (parts.length >= 2) {
        currentVariant = parts.slice(1).join('--');
      }
    }
  } catch (e) {
    console.warn('[SHERLO:mock ${packageName}] ❌ Error reading global cache:', e?.message, e);
  }
  
  // Fallback to getCurrentVariant function if cache didn't have it
  if (!currentVariant && getCurrentVariantFn && typeof getCurrentVariantFn === 'function') {
    try {
          console.log('[SHERLO:mock ${packageName}] Calling getCurrentVariantFn:', getCurrentVariantFn);
          currentVariant = getCurrentVariantFn();
    } catch (e) {
      console.warn('[SHERLO:mock ${packageName}] Error calling getCurrentVariant:', e?.message);
    }
  }
  
          const availableVariants = Object.keys(variantsMocks);
          
          // Try exact match first
          if (currentVariant && variantsMocks[currentVariant]) {
            return variantsMocks[currentVariant];
          }
          
          // Try case-insensitive match
          if (currentVariant) {
            const matchedVariant = availableVariants.find(v => v.toLowerCase() === currentVariant.toLowerCase());
            if (matchedVariant && variantsMocks[matchedVariant]) {
              return variantsMocks[matchedVariant];
            }
            return null;
          } else {
            // Variant is null - Storybook might not be initialized yet
            // Use first available variant as fallback so mocks work
            if (availableVariants.length > 0) {
              const fallbackVariant = availableVariants[0];
              return variantsMocks[fallbackVariant];
            } else {
              return null;
            }
          }
}

const real = loadReal();

// Create a dynamic object that checks the current variant on each property access
// We'll use Object.defineProperty to create getters for each property
function createDynamicMock() {
  const currentMock = getMockForCurrentVariant();
  
  if (!currentMock) {
    // No mock for current variant, return real module as-is
    return real || {};
  }
  
  // Merge real with mock (mock takes precedence)
  const merged = { ...(real || {}), ...currentMock };
  
  return merged;
}

// Create the exported object with dynamic getters
const out = {};
const realKeys = real ? Object.keys(real) : [];
const allMockKeys = Object.values(variantsMocks).reduce((acc, mock) => {
  return [...acc, ...Object.keys(mock)];
}, []);
const allKeys = [...new Set([...realKeys, ...allMockKeys])];

// Create getters for all possible keys that check the current variant dynamically
for (const key of allKeys) {
  Object.defineProperty(out, key, {
    get: () => {
      const mock = createDynamicMock();
      const value = mock[key];
      // Debug: log when accessing mocked properties
      // If it's a function, wrap it to re-evaluate the variant on each call
      if (typeof value === 'function') {
        // Create a wrapper that re-evaluates getMockForCurrentVariant() on each call
                const wrappedFn = function(...args) {
                  // Re-evaluate the mock for the current variant on each call
                  const currentMock = getMockForCurrentVariant();
                  
                  if (!currentMock) {
                    // No mock available, try to call real function if available
                    if (real && typeof real[key] === 'function') {
                      return real[key].apply(real, args);
                    }
                    return undefined;
                  }
                  // Get the function from the current variant's mock
                  const fn = currentMock[key];
                  if (typeof fn === 'function') {
                    // Bind to the current mock so 'this' context is correct
                    const result = fn.apply(currentMock, args);
                    return result;
                  }
                  // If not a function in current mock, try real
                  if (real && typeof real[key] === 'function') {
                    return real[key].apply(real, args);
                  }
                  return undefined;
                };
        return wrappedFn;
      }
      return value;
    },
    enumerable: true,
    configurable: true,
  });
}

module.exports = out;
module.exports.__esModule = true;
module.exports.default = out;
`;
}

/**
 * Generates mock files for all packages found across all variants
 * @param {Object} allVariantsMocks - Object mapping variant names to their mocks: { variantName: { packageName: mockConfig } }
 * @param {string} outputDir - Directory where mock files should be generated
 * @returns {Object} - Object mapping package names to generated mock file paths
 */
function generateMockFiles(allVariantsMocks, outputDir) {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Collect all packages that appear in any variant
  const packagesMap = {}; // { packageName: { variantName: mockConfig } }

  for (const [variantName, variantMocks] of Object.entries(allVariantsMocks)) {
    for (const [packageName, mockConfig] of Object.entries(variantMocks)) {
      if (!packagesMap[packageName]) {
        packagesMap[packageName] = {};
      }
      packagesMap[packageName][variantName] = mockConfig;
    }
  }

  const mockFiles = {};

  // Generate one mock file per package with all variants' mocks
  for (const [packageName, variantsMocks] of Object.entries(packagesMap)) {
    // Create a safe filename from package name
    const safeFileName = packageName.replace(/[^a-zA-Z0-9]/g, '_') + '.js';
    const mockFilePath = path.join(outputDir, safeFileName);

    console.log(
      `[SHERLO:mocksGenerator] Generating mock for ${packageName} with variants: ${Object.keys(
        variantsMocks
      ).join(', ')}`
    );

    const mockContent = generateMockFileContent(packageName, variantsMocks);
    fs.writeFileSync(mockFilePath, mockContent, 'utf-8');

    mockFiles[packageName] = mockFilePath;
  }

  return mockFiles;
}

module.exports = {
  extractAllMocksFromStory,
  generateMockFiles,
};
