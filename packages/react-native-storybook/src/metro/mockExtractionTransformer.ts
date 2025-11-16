/**
 * Metro transformer that extracts mocks from story files during bundling.
 * This runs after Metro transforms TypeScript to JavaScript, so we can parse
 * the transformed JavaScript code to extract mock definitions.
 */

import * as path from 'path';
import type { StoryMockMap, TransformArgs, TransformResult } from './types';
import { getBabelParser, getBabelTraverse, getBabelTypes } from './mockExtraction/babelLoader';
import { getComponentNameFromPath, camelToKebab, isStoryFile } from './mockExtraction/storyIdNormalization';

// Import path module for require.resolve
const pathModule = require('path');

// Re-export types for convenience
export type { TransformArgs, TransformResult } from './types';


/**
 * Extracts mocks from a JavaScript object expression
 * Handles both direct objects and function calls that return objects
 */
function extractMocksFromObject(expr: any): Record<string, any> | null {
  if (!expr) {
    return null;
  }

  const t = getBabelTypes();
  if (!t) {
    return null;
  }

  // Direct object: { mocks: {...} }
  if (t.isObjectExpression(expr)) {
    const mocksProperty = expr.properties.find(
      (prop: any) =>
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === 'mocks' &&
        t.isObjectExpression(prop.value)
    );

    if (mocksProperty && t.isObjectProperty(mocksProperty)) {
      // Extract package-level mocks: { 'package-name': { fn: () => 'value' } }
      return extractPackageMocks(mocksProperty.value);
    }
  }

  // Function call: storyOfColor(...) that returns { mocks: {...} }
  if (t.isCallExpression(expr)) {
    // For now, we can't evaluate function calls statically
    // This will be handled when the function is actually called at runtime
    return null;
  }

  return null;
}

/**
 * Extracts package-level mocks from mocks object
 * Structure: { 'package-name': { fn1: () => 'value', fn2: () => 123 } }
 * Returns: { 'package-name': { __code: "{ fn1: () => 'value', fn2: () => 123 }" } }
 * 
 * Simplified: Extract the whole object as a string, no need to parse individual properties
 * NOTE: Code string may contain TypeScript types - we'll strip them later using Babel's preset-typescript
 */
function extractPackageMocks(mocksObj: any): Record<string, any> | null {
  const packages: Record<string, any> = {};
  const t = getBabelTypes();
  let generate: any = null;
  
  // Try to resolve @babel/generator - only needed to convert AST node to string
  // In EAS builds, we need to resolve from project root
  try {
    generate = require('@babel/generator').default;
  } catch {
    try {
      // Try resolving from project root (for EAS build worker processes)
      const projectRoot = (global as any).__SHERLO_PROJECT_ROOT__ || process.cwd();
      const generatorPath = require.resolve('@babel/generator', {
        paths: [
          projectRoot,
          pathModule.join(projectRoot, 'node_modules'),
          pathModule.join(projectRoot, '../../node_modules'), // Workspace root for monorepos
        ],
      });
      generate = require(generatorPath).default;
    } catch (resolveError: any) {
      console.warn('[SHERLO] @babel/generator not available, cannot extract code strings');
      console.warn(`[SHERLO] Resolution paths tried: projectRoot, node_modules, ../../node_modules`);
      return null;
    }
  }

  if (!t || !generate) {
    return null;
  }

  // First level: package names -> package objects
  for (const prop of mocksObj.properties) {
    if (t.isObjectProperty(prop)) {
      const packageName = t.isIdentifier(prop.key)
        ? prop.key.name
        : t.isStringLiteral(prop.key)
        ? prop.key.value
        : null;

      if (packageName && prop.value && t.isObjectExpression(prop.value)) {
        // Extract code string as-is (may contain TypeScript types)
        // We'll transform TS → JS later using Babel's preset-typescript
        try {
          const objectCode = generate(prop.value).code;
          // Store the whole object as a code string (may contain TypeScript types)
          packages[packageName] = { __code: objectCode };
        } catch (error: any) {
          console.warn(`[SHERLO] Failed to extract object code for mock "${packageName}":`, error.message);
        }
      }
    }
  }

  return Object.keys(packages).length > 0 ? packages : null;
}

// Removed unused extraction functions - we now use simple code string extraction in extractPackageMocks
// This simplifies the codebase and removes dependency on complex AST analysis

/**
 * Extracts mocks from TypeScript/JavaScript source code using AST parsing
 */
export function extractMocksFromTransformedCode(
  code: string,
  filePath: string,
  projectRoot: string
): StoryMockMap {
  const mocks: StoryMockMap = new Map();
  const componentName = getComponentNameFromPath(filePath, projectRoot);

  const parser = getBabelParser();
  const traverse = getBabelTraverse();
  const t = getBabelTypes();

  if (!parser || !traverse || !t) {
    console.warn(`[SHERLO] Mock extraction skipped for ${filePath}: Missing Babel dependencies (parser: ${!!parser}, traverse: ${!!traverse}, types: ${!!t})`);
    return mocks;
  }

  try {
    // Parse the TypeScript/JavaScript source code
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
    });

    traverse(ast, {
      // Handle ES modules: export const StoryName = { mocks: {...} }
      ExportNamedDeclaration(path: any) {
        if (t.isVariableDeclaration(path.node.declaration)) {
          path.node.declaration.declarations.forEach((decl: any) => {
            if (t.isIdentifier(decl.id)) {
              const exportName = decl.id.name;
              const storyMocks = extractMocksFromObject(decl.init);

              if (storyMocks && Object.keys(storyMocks).length > 0) {
                const normalizedExportName = camelToKebab(exportName);
                const storyId = `${componentName}--${normalizedExportName}`;

                const packageMocks = new Map<string, any>();
                for (const [pkgName, pkgMock] of Object.entries(storyMocks)) {
                  packageMocks.set(pkgName, pkgMock);
                }

                mocks.set(storyId, packageMocks);
              }
            }
          });
        }
      },
      // Handle CommonJS: exports.StoryName = { mocks: {...} } or var StoryName = exports.StoryName = { mocks: {...} }
      AssignmentExpression(path: any) {
        // Check for: exports.VariantA = { ... }
        if (
          t.isMemberExpression(path.node.left) &&
          t.isIdentifier(path.node.left.object) &&
          path.node.left.object.name === 'exports' &&
          t.isIdentifier(path.node.left.property)
        ) {
          const exportName = path.node.left.property.name;
          const storyMocks = extractMocksFromObject(path.node.right);

          if (storyMocks && Object.keys(storyMocks).length > 0) {
            const normalizedExportName = camelToKebab(exportName);
            const storyId = `${componentName}--${normalizedExportName}`;

            const packageMocks = new Map<string, any>();
            for (const [pkgName, pkgMock] of Object.entries(storyMocks)) {
              packageMocks.set(pkgName, pkgMock);
            }

            mocks.set(storyId, packageMocks);
          }
        }
      },
      // Handle: var VariantA = exports.VariantA = { mocks: {...} }
      VariableDeclarator(path: any) {
        if (t.isIdentifier(path.node.id)) {
          const exportName = path.node.id.name;
          // Check if init is an AssignmentExpression (exports.VariantA = ...)
          if (t.isAssignmentExpression(path.node.init)) {
            const storyMocks = extractMocksFromObject(path.node.init.right);
            if (storyMocks && Object.keys(storyMocks).length > 0) {
              const normalizedExportName = camelToKebab(exportName);
              const storyId = `${componentName}--${normalizedExportName}`;

              const packageMocks = new Map<string, any>();
              for (const [pkgName, pkgMock] of Object.entries(storyMocks)) {
                packageMocks.set(pkgName, pkgMock);
              }

              mocks.set(storyId, packageMocks);
            }
          } else {
            // Direct assignment: var VariantA = { mocks: {...} }
            const storyMocks = extractMocksFromObject(path.node.init);
            if (storyMocks && Object.keys(storyMocks).length > 0) {
              const normalizedExportName = camelToKebab(exportName);
              const storyId = `${componentName}--${normalizedExportName}`;

              const packageMocks = new Map<string, any>();
              for (const [pkgName, pkgMock] of Object.entries(storyMocks)) {
                packageMocks.set(pkgName, pkgMock);
              }

              mocks.set(storyId, packageMocks);
            }
          }
        }
      },
    });
  } catch (error: any) {
    console.error('[SHERLO] Failed to parse story file for mock extraction:', error.message);
  }

  return mocks;
}

/**
 * Creates a Metro transformer that extracts mocks from story files
 * Note: This function returns a transformer wrapper that Metro can serialize
 */
export function createMockExtractionTransformer(
  projectRoot: string,
  storyFiles: string[]
) {
  // Store story files in global so they're accessible without closure
  (global as any).__SHERLO_STORY_FILES__ = storyFiles;
  (global as any).__SHERLO_PROJECT_ROOT__ = projectRoot;

  // Return a transformer function that Metro can serialize
  // We can't capture projectRoot/storyFiles in closure, so we use globals
  return async (args: TransformArgs, transformer: any): Promise<TransformResult> => {
    // Get story files from global (set by withSherlo)
    const storyFilesList = (global as any).__SHERLO_STORY_FILES__ || [];
    const projRoot = (global as any).__SHERLO_PROJECT_ROOT__ || process.cwd();

    // Let Metro transform first (TS → JS)
    const result = await transformer.transform(args);

    // Check if this is a story file
    if (isStoryFile(args.filename, storyFilesList)) {

      // Extract mocks from the transformed code
      // The transformed code is in result.output[0].data.code
      const transformedCode = result.output[0]?.data?.code;
      if (transformedCode) {
        const extractedMocks = extractMocksFromTransformedCode(
          transformedCode,
          args.filename,
          projRoot
        );

        // Merge into global cache
        if (!(global as any).__SHERLO_STORY_MOCKS__) {
          (global as any).__SHERLO_STORY_MOCKS__ = new Map();
        }

        const globalMocks = (global as any).__SHERLO_STORY_MOCKS__ as StoryMockMap;
        for (const [storyId, packageMocks] of extractedMocks.entries()) {
          globalMocks.set(storyId, packageMocks);
        }
      }
    }

    return result;
  };
}
