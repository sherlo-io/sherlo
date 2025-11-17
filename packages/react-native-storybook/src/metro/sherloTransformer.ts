/**
 * Custom Metro transformer that wraps the default transformer and extracts mocks from story files.
 * This file is loaded by Metro via babelTransformerPath.
 * 
 * CRITICAL FIX: For mock files, we bypass babel-preset-expo entirely and use a simple Babel config.
 * This prevents Expo's aggressive optimizations from stripping function bodies.
 */

import * as path from 'path';
import type { TransformArgs, TransformResult } from './mockExtractionTransformer';
import { getBabelGenerator } from './mockExtraction/babelLoader';

/**
 * Gets the base transformer (Expo's or Metro's default)
 */
function getBaseTransformer() {
  // Try to get from global first (set by withSherlo)
  const baseTransformerPath = (global as any).__SHERLO_BASE_TRANSFORMER_PATH__;

  if (baseTransformerPath) {
    try {
      // Clear require cache to ensure fresh load
      delete require.cache[require.resolve(baseTransformerPath)];
      return require(baseTransformerPath);
    } catch (error: any) {
      // Silently fallback to default transformer
    }
  }

  // Fallback: try Expo's transformer
  // Try the build path first (this is where it actually exists)
  // Use require.resolve to find it properly in worker processes
  // Try multiple resolution paths since worker processes might have different cwd
  const projectRoot = (global as any).__SHERLO_PROJECT_ROOT__ || process.cwd();
  const resolutionPaths = [
    projectRoot,
    path.join(projectRoot, 'node_modules'),
    process.cwd(),
    path.join(process.cwd(), 'node_modules'),
  ];
  
  try {
    const transformerPath = require.resolve('@expo/metro-config/build/babel-transformer', {
      paths: resolutionPaths
    });
    const expoTransformer = require(transformerPath);
    if (expoTransformer && (typeof expoTransformer === 'function' || typeof expoTransformer.transform === 'function')) {
      return expoTransformer;
    }
  } catch (buildError: any) {
    // Try the main export (might not exist but worth trying)
    try {
      const expoTransformer = require('@expo/metro-config/babel-transformer');
      if (expoTransformer && (typeof expoTransformer === 'function' || typeof expoTransformer.transform === 'function')) {
        return expoTransformer;
      }
    } catch (expoError: any) {
      // Fallback: try Metro's default transformer
      try {
        return require('metro-react-native-babel-transformer');
      } catch (metroError: any) {
        // Last resort: log warning but don't throw - Metro might handle this differently
        console.warn(
          `[SHERLO] Could not find Metro transformer. Tried: @expo/metro-config/build/babel-transformer (${buildError.message}), @expo/metro-config/babel-transformer (${expoError.message}), metro-react-native-babel-transformer (${metroError.message})`
        );
        // Return null to indicate failure - caller should handle this
        return null;
      }
    }
  }
  
  return null;
}

/**
 * Metro transformer entry point
 * Metro calls this function with transform arguments
 */
export async function transform(args: TransformArgs): Promise<TransformResult> {
  // Don't get base transformer yet - we'll get it lazily only if needed (for non-mock files)
  // This prevents errors when the transformer isn't available, since mock files bypass it anyway

  // Get story files from JSON file (set by withSherlo)
  // Metro workers run in separate processes, so we can't use globals/config
  // Read from a file that withSherlo wrote
  let storyFiles: string[] = [];
  let projectRoot = process.cwd();

  try {
    const fs = require('fs');
    const storyFilesPath = path.join(process.cwd(), '.sherlo', 'story-files.json');
    if (fs.existsSync(storyFilesPath)) {
      const data = JSON.parse(fs.readFileSync(storyFilesPath, 'utf-8'));
      storyFiles = data.storyFiles || [];
      projectRoot = data.projectRoot || process.cwd();
    }
  } catch (error: any) {
    // Fallback to globals if file read fails
    storyFiles = (global as any).__SHERLO_STORY_FILES__ || [];
    projectRoot = (global as any).__SHERLO_PROJECT_ROOT__ || process.cwd();
  }

  // Check if this is a story file or mock file
  // CRITICAL: Strip query parameters (like ?ctx=...) that Metro adds for require.context()
  const filenameWithoutQuery = args.filename.split('?')[0];
  const normalizedPath = path.resolve(filenameWithoutQuery);
  const isStoryFile = storyFiles.some((storyFile: string) => path.resolve(storyFile) === normalizedPath);
  // Check for mock files in node_modules/.sherlo/mocks/
  // Use normalized path to handle both absolute and relative paths
  const normalizedFilename = normalizedPath.replace(/\\/g, '/'); // Normalize path separators
  // Check for mock file patterns - must be in node_modules/.sherlo/mocks/
  const isMockFile = normalizedFilename.includes('node_modules/.sherlo/mocks/') && 
                     (normalizedFilename.endsWith('.ts') || normalizedFilename.endsWith('.js'));

  // Log transformation flags/metadata for both story and mock files
  if (isStoryFile || isMockFile) {
    const fileType = isStoryFile ? 'STORY' : 'MOCK';
    console.error(`[SHERLO] Transformer: Processing ${fileType} file: ${args.filename}`);
    console.error(`[SHERLO] Transformer: args.options keys: ${Object.keys(args.options || {}).join(', ')}`);
    console.error(`[SHERLO] Transformer: args.options.dev: ${(args.options as any)?.dev}`);
    console.error(`[SHERLO] Transformer: args.options.minify: ${(args.options as any)?.minify}`);
    console.error(`[SHERLO] Transformer: args.options.platform: ${(args.options as any)?.platform}`);
    console.error(`[SHERLO] Transformer: args.options.type: ${(args.options as any)?.type}`);
    console.error(`[SHERLO] Transformer: args.options.inlineRequires: ${(args.options as any)?.inlineRequires}`);
    console.error(`[SHERLO] Transformer: args.options.experimentalImportSupport: ${(args.options as any)?.experimentalImportSupport}`);
    console.error(`[SHERLO] Transformer: args.options.customTransformOptions: ${JSON.stringify((args.options as any)?.customTransformOptions || {})}`);
    console.error(`[SHERLO] Transformer: Full args.options: ${JSON.stringify(args.options, null, 2)}`);
  }

  // CRITICAL FIX: For mock files, bypass babel-preset-expo entirely
  // Expo's preset is configured at the worker level based on CLI/env flags (expo export:embed, EAS preview, etc.)
  // and uses aggressive optimizations that strip function bodies. By using a simple Babel config instead,
  // we avoid these optimizations entirely while still transforming TypeScript to JavaScript.
  if (isMockFile) {
    console.error(`[SHERLO] Transformer: ========== MOCK FILE DETECTED - USING CUSTOM BABEL CONFIG ==========`);
    console.error(`[SHERLO] Transformer: Filename: ${args.filename}`);
    console.error(`[SHERLO] Transformer: Normalized: ${normalizedFilename}`);
    console.error(`[SHERLO] Transformer: Source code preview (first 500 chars): ${args.src.substring(0, 500)}`);
    
    try {
      // Use @babel/core directly with a simple config that doesn't include Expo's aggressive optimizations
      // CRITICAL: In EAS build worker processes, we need to resolve from project root
      let babel: any;
      try {
        babel = require('@babel/core');
      } catch (e) {
        // Try resolving from project root (for EAS build worker processes)
        try {
          const babelPath = require.resolve('@babel/core', {
            paths: [
              projectRoot,
              path.join(projectRoot, 'node_modules'),
              path.join(projectRoot, '../../node_modules'), // Workspace root for monorepos
            ],
          });
          babel = require(babelPath);
        } catch (resolveError: any) {
          throw new Error(`@babel/core not found. Tried standard require and project root resolution. Error: ${resolveError.message}`);
        }
      }
      
      // Check if required presets are available (also resolve from project root)
      try {
        require.resolve('@babel/preset-typescript');
      } catch (e) {
        try {
          require.resolve('@babel/preset-typescript', {
            paths: [
              projectRoot,
              path.join(projectRoot, 'node_modules'),
              path.join(projectRoot, '../../node_modules'),
            ],
          });
        } catch (resolveError: any) {
          throw new Error(`@babel/preset-typescript not found. Please ensure @babel/preset-typescript is installed. Error: ${resolveError.message}`);
        }
      }
      
      try {
        require.resolve('@babel/preset-react');
      } catch (e) {
        try {
          require.resolve('@babel/preset-react', {
            paths: [
              projectRoot,
              path.join(projectRoot, 'node_modules'),
              path.join(projectRoot, '../../node_modules'),
            ],
          });
        } catch (resolveError: any) {
          throw new Error(`@babel/preset-react not found. Please ensure @babel/preset-react is installed. Error: ${resolveError.message}`);
        }
      }
      
      // Check if file is already JavaScript (we generate .js files, so they're already transformed)
      // If it's a .js file, we don't need TypeScript preset - just pass it through with minimal transforms
      const isJSFile = args.filename.endsWith('.js');
      
      // Simple Babel config: only TypeScript and React transforms, NO optimization plugins
      // This bypasses babel-preset-expo entirely, preventing its aggressive optimizations
      const mockBabelConfig: any = {
        configFile: false, // CRITICAL: Don't use project's babel.config.js (which includes babel-preset-expo)
        plugins: [],
        // Keep source maps if requested
        sourceMaps: args.options.sourceMap !== false,
        filename: args.filename,
        // Don't use Expo's caller-based optimizations
        caller: undefined,
        // Ensure we're not in production mode
        envName: 'development',
        // Also ensure we're using the correct parser
        babelrc: false,
        babelrcRoots: false,
      };
      
      // Load the async arrow conversion plugin (needed for both .js and .ts files)
      let convertAsyncArrowsPlugin: any = null;
      try {
        convertAsyncArrowsPlugin = require('./mockGeneration/babelPluginConvertAsyncArrows').default;
      } catch (e) {
        // Plugin not available - log warning but continue
        console.warn('[SHERLO] Transformer: Async arrow conversion plugin not available');
      }
      
      if (isJSFile) {
        // For .js files, we don't need TypeScript preset (they're already JavaScript)
        // Just use React preset for JSX if needed, and minimal parser options
        mockBabelConfig.presets = [
          ['@babel/preset-react', { runtime: 'automatic' }],
        ];
        mockBabelConfig.parserOpts = {
          allowReturnOutsideFunction: true,
          allowAwaitOutsideFunction: true,
          sourceType: 'module',
          allowUndeclaredExports: true,
          plugins: [
            'jsx',
            'objectRestSpread',
            'exportDefaultFrom',
            'exportNamespaceFrom',
            'dynamicImport',
            'nullishCoalescingOperator',
            'optionalChaining',
            'classProperties',
            'asyncGenerators',
            'topLevelAwait',
            'importMeta',
            'numericSeparator',
            'optionalCatchBinding',
            'logicalAssignment',
            'classStaticBlock',
          ],
        };
        // Add async arrow conversion plugin for .js files too (in case they weren't converted during generation)
        if (convertAsyncArrowsPlugin) {
          mockBabelConfig.plugins = [convertAsyncArrowsPlugin];
        }
      } else {
        // For .ts files (if any), use TypeScript preset
        mockBabelConfig.presets = [
          '@babel/preset-typescript',
          ['@babel/preset-react', { runtime: 'automatic' }],
        ];
        mockBabelConfig.parserOpts = {
          allowReturnOutsideFunction: true,
          allowAwaitOutsideFunction: true,
          sourceType: 'module',
          allowUndeclaredExports: true,
          plugins: [
            'typescript',
            'jsx',
            'objectRestSpread',
            'functionBind',
            'exportDefaultFrom',
            'exportNamespaceFrom',
            'dynamicImport',
            'nullishCoalescingOperator',
            'optionalChaining',
            'decorators-legacy',
            'classProperties',
            'asyncGenerators',
            'functionSent',
            'throwExpressions',
            'topLevelAwait',
            'importMeta',
            'numericSeparator',
            'optionalCatchBinding',
            'logicalAssignment',
            'classStaticBlock',
          ],
        };
        // Add async arrow conversion plugin for .ts files too
        if (convertAsyncArrowsPlugin) {
          mockBabelConfig.plugins = [convertAsyncArrowsPlugin];
        }
      }
      
      console.error(`[SHERLO] Transformer: Transforming mock file with custom Babel config (bypassing babel-preset-expo)`);
      
      const babelResult = babel.transformSync(args.src, mockBabelConfig);
      
      if (!babelResult || !babelResult.code) {
        throw new Error(`Babel transform failed: no code generated`);
      }
      
      console.error(`[SHERLO] Transformer: Custom Babel transform successful (${babelResult.code.length} chars)`);
      
      // CRITICAL DEBUG: Log the actual transformed code to see what Babel produced
      console.error(`[SHERLO] Transformer: ========== TRANSFORMED CODE (first 2000 chars) ==========`);
      console.error(babelResult.code.substring(0, 2000));
      console.error(`[SHERLO] Transformer: ========== END TRANSFORMED CODE ==========`);
      
      // Check if function bodies are preserved
      // CRITICAL: Check for multiple patterns of empty/missing bodies:
      // 1. Literally empty: function() { {} }
      // 2. Only side effect, no return: function() { void (...); }
      // 3. Missing return statement in mock functions
      const hasEmptyBodies = babelResult.code.includes('function () { {} }') || 
                            babelResult.code.includes('function() { {} }') ||
                            babelResult.code.match(/function\s*\([^)]*\)\s*\{\s*\{\s*\}\s*\}/);
      
      // Check for functions with only side effects but no return (this is what we're seeing)
      const mockFunctionPattern = /const\s+(_story_\w+)\s*=\s*function\s*\([^)]*\)\s*\{([^}]*)\}/g;
      let hasMissingReturns = false;
      let missingReturnFunctions: string[] = [];
      let match;
      while ((match = mockFunctionPattern.exec(babelResult.code)) !== null) {
        const functionName = match[1];
        const functionBody = match[2].trim();
        // Check if body has void(...) but no return statement
        if (functionBody.includes('void') && !functionBody.includes('return')) {
          hasMissingReturns = true;
          missingReturnFunctions.push(functionName);
        }
        // Check if body is empty or just whitespace
        if (!functionBody || functionBody === '{}' || functionBody.match(/^\s*\{\s*\}\s*$/)) {
          hasMissingReturns = true;
          missingReturnFunctions.push(functionName);
        }
      }
      
      if (hasEmptyBodies || hasMissingReturns) {
        console.error(`[SHERLO] Transformer: ⚠️  WARNING: Transformed code has empty/missing function bodies!`);
        if (hasEmptyBodies) {
          const emptyFunctionMatches = babelResult.code.match(/function\s+(\w+)\s*\([^)]*\)\s*\{\s*\{\s*\}\s*\}/g);
          if (emptyFunctionMatches) {
            console.error(`[SHERLO] Transformer: Empty functions found:`, emptyFunctionMatches.slice(0, 5));
          }
        }
        if (hasMissingReturns && missingReturnFunctions.length > 0) {
          console.error(`[SHERLO] Transformer: Functions with missing return statements:`, missingReturnFunctions.slice(0, 10));
        }
      } else {
        console.error(`[SHERLO] Transformer: ✅ SUCCESS: Function bodies appear to be preserved!`);
        // Log a sample function to verify
        const functionMatch = babelResult.code.match(/function\s+(_story_\w+)\s*\([^)]*\)\s*\{[^}]*return[^}]*\}/);
        if (functionMatch) {
          console.error(`[SHERLO] Transformer: Sample preserved function:`, functionMatch[0].substring(0, 200));
        }
      }
      
      // Return Metro-compatible TransformResult
      // Metro expects { output: [{ type, data: { code, map } }] }
      return {
        output: [
          {
            type: 'js/module',
            data: {
              code: babelResult.code,
              map: babelResult.map || undefined,
            },
          },
        ],
      } as TransformResult;
      
    } catch (error: any) {
      console.error(`[SHERLO] Transformer: ❌ ERROR: Custom Babel transform failed for ${args.filename}`);
      console.error(`[SHERLO] Transformer: Error:`, error.message);
      console.error(`[SHERLO] Transformer: Stack:`, error.stack);
      console.error(`[SHERLO] Transformer: Falling back to base transformer (this may still have the optimization issue)...`);
      // Fallback to base transformer if custom Babel fails
      // This ensures we don't break the build, but note that the optimization issue may persist
      try {
        const baseTransformer = getBaseTransformer();
        if (typeof baseTransformer === 'function') {
          return await baseTransformer(args);
        } else if (baseTransformer && typeof baseTransformer.transform === 'function') {
          return await baseTransformer.transform(args);
        }
      } catch (fallbackError: any) {
        console.error(`[SHERLO] Transformer: ❌ Fallback also failed:`, fallbackError.message);
        throw new Error(`Failed to transform mock file: ${error.message}. Fallback also failed: ${fallbackError.message}`);
      }
    }
  }

  // Non-mock files: use Expo's transformer as usual
  // CRITICAL: Ensure proper context preservation for base transformers
  // Some transformers (like react-native-svg-transformer) rely on Babel config resolution
  // from the project root. We need to ensure they have the correct context.
  
  // Get base transformer lazily only when needed (for non-mock files)
  const baseTransformer = getBaseTransformer();
  if (!baseTransformer) {
    throw new Error(
      `[SHERLO] Metro transformer not available for non-mock file: ${args.filename}. ` +
      `Please ensure @expo/metro-config is installed.`
    );
  }
  
  // Preserve working directory context for Babel config resolution
  // CRITICAL: Some transformers (like react-native-svg-transformer) rely on Babel config
  // resolution from the project root. When we wrap the transformer, we need to ensure
  // they have the correct context. Metro workers run in separate processes, so changing
  // cwd is safe per-worker, but we must always restore it.
  const originalCwd = process.cwd();
  let result: TransformResult;
  let cwdChanged = false;
  
  try {
    // Set working directory to project root if it's different
    // This ensures Babel config resolution works correctly for wrapped transformers
    // that might resolve babel.config.js relative to process.cwd()
    if (projectRoot && path.resolve(projectRoot) !== path.resolve(originalCwd)) {
      try {
        process.chdir(projectRoot);
        cwdChanged = true;
      } catch (chdirError: any) {
        // If chdir fails, log warning but continue - Babel might still resolve config correctly
        console.warn(`[SHERLO] Could not change working directory to project root: ${chdirError.message}`);
      }
    }
    
    // Call base transformer with exact args Metro would pass
    // Don't modify args - be a true pass-through for non-mock files
    // This ensures transformers receive the same context they would get from Metro directly
    if (typeof baseTransformer === 'function') {
      result = await baseTransformer(args);
    } else if (baseTransformer && typeof baseTransformer.transform === 'function') {
      result = await baseTransformer.transform(args);
    } else {
      console.error('[SHERLO] Metro transformer error: Base transformer does not export a transform function');
      throw new Error('[SHERLO] Base transformer does not export a transform function');
    }
  } finally {
    // Always restore original working directory to prevent side effects
    if (cwdChanged) {
      try {
        process.chdir(originalCwd);
      } catch (restoreError: any) {
        // Log error but don't throw - we're in finally block
        console.error(`[SHERLO] Failed to restore working directory: ${restoreError.message}`);
      }
    }
  }
  
  // Log what the base transformer actually returned
  if (isMockFile) {
    console.error(`[SHERLO] Transformer: Base transformer returned, checking result...`);
  }

  // Log transformed output for mock files (to understand what Metro generates)
  if (isMockFile) {
    let transformedCode: string | null = null;
    
    // Log the result structure to understand what Metro returns
    console.error(`[SHERLO] Transformer: Result structure keys: ${Object.keys(result).join(', ')}`);
    if ((result as any).output) {
      console.error(`[SHERLO] Transformer: Result.output type: ${Array.isArray((result as any).output) ? 'array' : typeof (result as any).output}`);
      if (Array.isArray((result as any).output) && (result as any).output.length > 0) {
        console.error(`[SHERLO] Transformer: Result.output[0] keys: ${Object.keys((result as any).output[0] || {}).join(', ')}`);
        if ((result as any).output[0]?.data) {
          console.error(`[SHERLO] Transformer: Result.output[0].data keys: ${Object.keys((result as any).output[0].data || {}).join(', ')}`);
        }
      }
    }
    
    // Try multiple extraction strategies
    if (result.output && Array.isArray(result.output) && result.output.length > 0) {
      // Try different possible structures
      const firstOutput = result.output[0];
      transformedCode = 
        firstOutput?.data?.code || 
        (firstOutput as any)?.code ||
        (firstOutput as any)?.data ||
        null;
    } else if ((result as any).code) {
      // Direct code property
      transformedCode = (result as any).code;
    } else if ((result as any).ast) {
      // AST format - convert to code using @babel/generator
      try {
        const generate = getBabelGenerator();
        if (generate) {
          const generated = generate((result as any).ast, {}, args.src);
          transformedCode = generated.code;
        } else {
          console.error(`[SHERLO] Transformer: @babel/generator not available, cannot inspect transformed code`);
        }
      } catch (error: any) {
        console.error(`[SHERLO] Transformer: Failed to generate code from AST: ${error.message}`);
      }
    }
    
    if (transformedCode) {
      // Log the full transformed code for mock files
      console.error(`[SHERLO] Transformer: ========== FULL TRANSFORMED CODE FOR ${args.filename} ==========`);
      console.error(transformedCode);
      console.error(`[SHERLO] Transformer: ========== END TRANSFORMED CODE (${transformedCode.length} chars) ==========`);
    } else {
      console.error(`[SHERLO] Transformer: Could not extract transformed code from result`);
      console.error(`[SHERLO] Transformer: Result type: ${typeof result}, keys: ${Object.keys(result).join(', ')}`);
    }
  }

  // Story files are handled by Storybook's transformer - we don't transform them
  // We only handle mock files (extracted from story files and generated separately)
  // Mock extraction happens during pre-generation in withSherlo setup, not during transformation

  return result;
}
