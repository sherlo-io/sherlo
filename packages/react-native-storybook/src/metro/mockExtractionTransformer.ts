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
/**
 * Extracts mocks from a JavaScript object expression
 * Handles both direct objects and function calls that return objects
 */
function extractMocksFromObject(expr: any, scope: any, filePath: string): Record<string, any> | null {
  if (!expr) {
    return null;
  }

  const t = getBabelTypes();
  if (!t) {
    return null;
  }

  // Unwrap TypeScript nodes (as any, <Type>, !, satisfies)
  while (
    t.isTSAsExpression(expr) || 
    t.isTSTypeAssertion(expr) || 
    t.isTSNonNullExpression(expr) ||
    t.isTSSatisfiesExpression(expr)
  ) {
    expr = expr.expression;
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
      return extractPackageMocks(mocksProperty.value, scope, filePath);
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
/**
 * Extracts package-level mocks from mocks object
 * Structure: { 'package-name': { fn1: () => 'value', fn2: () => 123 } }
 * Returns: { 'package-name': { __code: "...", __imports: [...] } }
 */
function extractPackageMocks(mocksObj: any, scope: any, filePath: string): Record<string, any> | null {
  const packages: Record<string, any> = {};
  const t = getBabelTypes();
  let generate: any = null;
  
  // Try to resolve @babel/generator
  try {
    generate = require('@babel/generator').default;
  } catch {
    try {
      const projectRoot = (global as any).__SHERLO_PROJECT_ROOT__ || process.cwd();
      const generatorPath = require.resolve('@babel/generator', {
        paths: [
          projectRoot,
          pathModule.join(projectRoot, 'node_modules'),
          pathModule.join(projectRoot, '../../node_modules'),
        ],
      });
      generate = require(generatorPath).default;
    } catch (resolveError: any) {
      console.warn('[SHERLO] @babel/generator not available, cannot extract code strings');
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

      if (packageName && prop.value) {
        // Check if the value is a factory function (arrow function or function expression)
        const isFactory = t.isArrowFunctionExpression(prop.value) || t.isFunctionExpression(prop.value);
        
        try {
          // 1. Generate code string (works for both objects and functions)
          const code = generate(prop.value).code;
          
          // 2. Extract imports used in this mock (object or function body)
          const imports: Array<{
            name: string; // Local name used in code (e.g. QUERY_CONSTANT)
            source: string; // Import source (absolute path or package name)
            importedName: string; // Exported name (e.g. QUERY_CONSTANT or default)
            isDefault: boolean;
            isNamespace: boolean;
          }> = [];
          
          // Traverse the mock value to find identifiers
          // We use a simple recursive visitor since we don't have a full NodePath for prop.value
          const identifiers = new Set<string>();
          
          const visit = (node: any) => {
            if (!node) return;
            
            if (t.isIdentifier(node)) {
              identifiers.add(node.name);
            } else if (t.isObjectProperty(node)) {
              if (node.computed) visit(node.key);
              visit(node.value);
            } else if (t.isMemberExpression(node)) {
              visit(node.object);
              if (node.computed) visit(node.property);
            } else {
              for (const key in node) {
                const val = node[key];
                if (Array.isArray(val)) {
                  val.forEach(v => {
                    if (v && typeof v.type === 'string') visit(v);
                  });
                } else if (val && typeof val.type === 'string') {
                  visit(val);
                }
              }
            }
          };
          
          visit(prop.value);
          
          // Check bindings for found identifiers
          identifiers.forEach(name => {
            const binding = scope.getBinding(name);
            if (binding && binding.kind === 'module') {
              const path = binding.path;
              const parent = path.parent;
              
              if (t.isImportDeclaration(parent)) {
                let source = parent.source.value;
                
                // Resolve relative paths to absolute paths
                if (source.startsWith('.')) {
                  source = pathModule.resolve(pathModule.dirname(filePath), source);
                }
                
                if (t.isImportDefaultSpecifier(path.node)) {
                  imports.push({
                    name,
                    source,
                    importedName: 'default',
                    isDefault: true,
                    isNamespace: false
                  });
                } else if (t.isImportNamespaceSpecifier(path.node)) {
                  imports.push({
                    name,
                    source,
                    importedName: '*',
                    isDefault: false,
                    isNamespace: true
                  });
                } else if (t.isImportSpecifier(path.node)) {
                  const importedName = t.isIdentifier(path.node.imported) 
                    ? path.node.imported.name 
                    : path.node.imported.value;
                    
                  imports.push({
                    name,
                    source,
                    importedName,
                    isDefault: false,
                    isNamespace: false
                  });
                }
              }
            }
          });
          
          if (imports.length > 0) {
            // Imports extracted
          }

          packages[packageName] = { 
            __code: code,
            __imports: imports,
            __isFactory: isFactory  // Mark if this is a factory function
          };
        } catch (error: any) {
          console.warn(`[SHERLO] Failed to extract code/imports for mock "${packageName}":`, error.message);
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
  let componentName = getComponentNameFromPath(filePath, projectRoot);

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

    // First pass: try to extract component title from default export
    // This ensures we match Storybook's ID generation which uses the title
    traverse(ast, {
      ExportDefaultDeclaration(path: any) {
        if (t.isObjectExpression(path.node.declaration)) {
          const titleProp = path.node.declaration.properties.find(
            (p: any) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'title'
          );
          
          if (titleProp && t.isObjectProperty(titleProp) && t.isStringLiteral(titleProp.value)) {
            // Found title: "MyComponent" -> "my-component"
            const title = titleProp.value.value;
            // Normalize title to kebab-case (Storybook style)
            // Note: Storybook ID generation is complex, but usually it's title-kebab-case
            // If title contains slashes (e.g. "Components/Button"), it becomes "components-button"
            componentName = title.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
            console.log(`[SHERLO] Found story title "${title}", using component name: "${componentName}"`);
          }
        }
      }
    });

    traverse(ast, {
      // Handle ES modules: export const StoryName = { mocks: {...} }
      ExportNamedDeclaration(path: any) {
        if (t.isVariableDeclaration(path.node.declaration)) {
          path.node.declaration.declarations.forEach((decl: any) => {
            if (t.isIdentifier(decl.id)) {
              const exportName = decl.id.name;
              // Pass scope and filePath to extractMocksFromObject
              const storyMocks = extractMocksFromObject(decl.init, path.scope, filePath);

              if (storyMocks && Object.keys(storyMocks).length > 0) {
                const normalizedExportName = camelToKebab(exportName);
                const storyId = `${componentName}--${normalizedExportName}`;

                const packageMocks = new Map<string, any>();
                for (const [pkgName, pkgMock] of Object.entries(storyMocks)) {
                  pkgMock.__storyFilePath = filePath;
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
          // Pass scope and filePath
          const storyMocks = extractMocksFromObject(path.node.right, path.scope, filePath);

          if (storyMocks && Object.keys(storyMocks).length > 0) {
            const normalizedExportName = camelToKebab(exportName);
            const storyId = `${componentName}--${normalizedExportName}`;

            const packageMocks = new Map<string, any>();
            for (const [pkgName, pkgMock] of Object.entries(storyMocks)) {
              pkgMock.__storyFilePath = filePath;
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
            // Pass scope and filePath
            const storyMocks = extractMocksFromObject(path.node.init.right, path.scope, filePath);
            if (storyMocks && Object.keys(storyMocks).length > 0) {
              const normalizedExportName = camelToKebab(exportName);
              const storyId = `${componentName}--${normalizedExportName}`;

              const packageMocks = new Map<string, any>();
              for (const [pkgName, pkgMock] of Object.entries(storyMocks)) {
                pkgMock.__storyFilePath = filePath;
                packageMocks.set(pkgName, pkgMock);
              }

              mocks.set(storyId, packageMocks);
            }
          } else {
            // Direct assignment: var VariantA = { mocks: {...} }
            // Pass scope and filePath
            const storyMocks = extractMocksFromObject(path.node.init, path.scope, filePath);
            if (storyMocks && Object.keys(storyMocks).length > 0) {
              const normalizedExportName = camelToKebab(exportName);
              const storyId = `${componentName}--${normalizedExportName}`;

              const packageMocks = new Map<string, any>();
              for (const [pkgName, pkgMock] of Object.entries(storyMocks)) {
                pkgMock.__storyFilePath = filePath;
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

      // Extract mocks from the ORIGINAL source code (args.src)
      // We use the original source because:
      // 1. It contains the original imports (transformed code might have require calls)
      // 2. It preserves the structure we expect for AST analysis
      // 3. We want to extract imports as they are written in the source
      const sourceCode = args.src;
      if (sourceCode) {
        const extractedMocks = extractMocksFromTransformedCode(
          sourceCode,
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
