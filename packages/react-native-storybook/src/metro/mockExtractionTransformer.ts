/**
 * Metro transformer that extracts mocks from story files during bundling.
 * This runs after Metro transforms TypeScript to JavaScript, so we can parse
 * the transformed JavaScript code to extract mock definitions.
 */

import * as path from 'path';
import type { StoryMockMap, TransformArgs, TransformResult } from './types';
import { getBabelParser, getBabelTraverse, getBabelTypes } from './mockExtraction/babelLoader';
import { getComponentNameFromPath, camelToKebab, isStoryFile } from './mockExtraction/storyIdNormalization';
import { extractPrimitive } from './mockExtraction/extractPrimitive';
import { extractFunction } from './mockExtraction/extractFunction';
import { extractClass } from './mockExtraction/extractClass';
import { extractArray } from './mockExtraction/extractArray';
import {
  extractSpecialNumericValue,
  extractDate,
  extractRegExp,
} from './mockExtraction/extractSpecialValues';
import { extractObjectExpression } from './mockExtraction/extractObjectExpression';

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
      return extractMocksFromObjectExpression(mocksProperty.value);
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
 * Extracts mocks from an object expression
 * Converts AST to a plain object representation
 */
function extractMocksFromObjectExpression(obj: any): Record<string, any> | null {
  const mocks: Record<string, any> = {};
  const t = getBabelTypes();
  if (!t) {
    return null;
  }

  for (const prop of obj.properties) {
    if (t.isObjectProperty(prop)) {
      const key = t.isIdentifier(prop.key)
        ? prop.key.name
        : t.isStringLiteral(prop.key)
        ? prop.key.value
        : null;

      if (key && prop.value) {
        // Try to extract the mock value
        const extracted = extractMockValue(prop.value);
        mocks[key] = extracted;
      }
    }
  }

  return Object.keys(mocks).length > 0 ? mocks : null;
}

/**
 * Extracts mock value from an AST node
 * Converts AST to code string for serialization
 */
function extractMockValue(value: any): any {
  const t = getBabelTypes();
  if (!t) {
    return null;
  }

  // Try to get @babel/generator to convert AST to code
  let generate: any = null;
  try {
    generate = require('@babel/generator').default;
  } catch {
    // Fallback: try to stringify if it's a simple value
  }

  if (!value) {
    return null;
  }

  // Try extracting using specialized extractors
  const functionResult = extractFunction(value, t, generate);
  if (functionResult) return functionResult;

  const classResult = extractClass(value, t, generate);
  if (classResult) return classResult;

  const arrayResult = extractArray(value, t, generate, extractMockValue);
  if (arrayResult !== null) return arrayResult;

  const specialNumericResult = extractSpecialNumericValue(value, t);
  if (specialNumericResult) return specialNumericResult;

  const dateResult = extractDate(value, t, generate);
  if (dateResult) return dateResult;

  const regexResult = extractRegExp(value, t, generate);
  if (regexResult) return regexResult;

  // For object expressions, extract properties
  if (t.isObjectExpression(value)) {
    return extractObjectExpression(value, t, generate, extractMockValue);
  }

  // For literals, return the value
  const primitiveResult = extractPrimitive(value, t);
  if (primitiveResult !== null) return primitiveResult;

  // If we get here, we couldn't extract the value
  return null;
}

/**
 * Finds a function definition by name in the AST
 */
function findFunctionDefinition(ast: any, functionName: string): any {
  const traverse = getBabelTraverse();
  const t = getBabelTypes();
  if (!traverse || !t) {
    return null;
  }

  let foundFunction: any = null;
  traverse(ast, {
    VariableDeclarator(path: any) {
      if (
        t.isIdentifier(path.node.id) &&
        path.node.id.name === functionName &&
        (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init))
      ) {
        foundFunction = path.node.init;
      }
    },
    FunctionDeclaration(path: any) {
      if (t.isIdentifier(path.node.id) && path.node.id.name === functionName) {
        foundFunction = path.node;
      }
    },
  });

  return foundFunction;
}

/**
 * Extracts the return value from a function definition
 * For arrow functions: (params) => ({ mocks: {...} })
 * For function declarations: function name() { return { mocks: {...} }; }
 */
function extractReturnValueFromFunction(func: any): any {
  const t = getBabelTypes();
  if (!t) {
    return null;
  }

  // Arrow function with expression body: (params) => ({ mocks: {...} })
  if (t.isArrowFunctionExpression(func)) {
    const body = func.body;
    // If body is an object expression wrapped in parentheses
    if (t.isObjectExpression(body)) {
      return body;
    }
    // If body is a parenthesized expression containing an object
    if (t.isParenthesizedExpression(body) && t.isObjectExpression(body.expression)) {
      return body.expression;
    }
  }

  // Function expression or declaration with block body
  if (t.isFunctionExpression(func) || t.isFunctionDeclaration(func)) {
    const body = func.body;
    if (t.isBlockStatement(body)) {
      // Find return statement
      for (const stmt of body.body) {
        if (t.isReturnStatement(stmt) && stmt.argument) {
          // If return value is an object expression
          if (t.isObjectExpression(stmt.argument)) {
            return stmt.argument;
          }
          // If return value is wrapped in parentheses
          if (t.isParenthesizedExpression(stmt.argument) && t.isObjectExpression(stmt.argument.expression)) {
            return stmt.argument.expression;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extracts mocks from transformed JavaScript code using AST parsing
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
    return mocks;
  }

  try {
    // Parse the transformed JavaScript code
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
    });

    traverse(ast, {
      ExportNamedDeclaration(path: any) {
        // Handle: export const StoryName = { mocks: {...} }
        // Handle: export const StoryName = storyOfColor(...) (factory function)
        if (t.isVariableDeclaration(path.node.declaration)) {
          path.node.declaration.declarations.forEach((decl: any) => {
            if (t.isIdentifier(decl.id)) {
              const exportName = decl.id.name;
              let storyMocks = extractMocksFromObject(decl.init);

              // If direct extraction failed, try to extract from function call
              if (!storyMocks && t.isCallExpression(decl.init)) {
                const callExpr = decl.init;
                if (t.isIdentifier(callExpr.callee)) {
                  const functionName = callExpr.callee.name;
                  // Find the function definition
                  const funcDef = findFunctionDefinition(ast, functionName);
                  if (funcDef) {
                    // Extract return value from function
                    const returnValue = extractReturnValueFromFunction(funcDef);
                    if (returnValue) {
                      // Extract mocks from the return value
                      storyMocks = extractMocksFromObject(returnValue);
                    }
                  }
                }
              }

              if (storyMocks && Object.keys(storyMocks).length > 0) {
                // componentName already includes the full path hierarchy in kebab-case
                // Example: "testing-components-testinfo" (already normalized)
                // Storybook uses: "testing-components-testinfo--basic"
                // Convert camelCase to kebab-case to match Storybook's format
                const normalizedExportName = camelToKebab(exportName);
                const storyId = `${componentName}--${normalizedExportName}`;

                // Also store with original format for backwards compatibility
                const originalStoryId = `${componentName}--${exportName}`;

                const packageMocks = new Map<string, any>();

                for (const [pkgName, pkgMock] of Object.entries(storyMocks)) {
                  packageMocks.set(pkgName, pkgMock);
                }

                // Store with normalized ID (Storybook format)
                mocks.set(storyId, packageMocks);
                // Also store with original format
                mocks.set(originalStoryId, packageMocks);
              }
            }
          });
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
