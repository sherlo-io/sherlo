/**
 * Metro transformer that extracts mocks from story files during bundling.
 * This runs after Metro transforms TypeScript to JavaScript, so we can parse
 * the transformed JavaScript code to extract mock definitions.
 */

import * as path from 'path';
import type { StoryMockMap } from './mockExtraction';

// Babel types - will be required at runtime
let babelParser: any;
let babelTraverse: any;
let babelTypes: any;

// Lazy load Babel to avoid requiring it if not available
function getBabelParser() {
  if (!babelParser) {
    try {
      babelParser = require('@babel/parser');
    } catch {
      // Fallback to Metro's Babel if available
      try {
        const metroTransformer = require('metro-react-native-babel-transformer');
        babelParser = metroTransformer?.parser || require('@babel/parser');
      } catch {
        console.warn('[SHERLO:transformer] @babel/parser not available, mock extraction will be limited');
      }
    }
  }
  return babelParser;
}

function getBabelTraverse() {
  if (!babelTraverse) {
    try {
      babelTraverse = require('@babel/traverse').default;
    } catch {
      console.warn('[SHERLO:transformer] @babel/traverse not available, mock extraction will be limited');
    }
  }
  return babelTraverse;
}

function getBabelTypes() {
  if (!babelTypes) {
    try {
      babelTypes = require('@babel/types');
    } catch {
      console.warn('[SHERLO:transformer] @babel/types not available, mock extraction will be limited');
    }
  }
  return babelTypes;
}

// Metro transformer types
export interface TransformArgs {
  filename: string;
  options: any;
  src: string;
}

export interface TransformResult {
  output: Array<{
    type: string;
    data: {
      code: string;
      map?: any;
    };
  }>;
}

/**
 * Extracts component name from story file path
 * Storybook uses the full path hierarchy for story IDs
 * Example: "testing-components-testinfo" from "/project/src/testing-components/TestInfo/TestInfo.stories.tsx"
 */
function getComponentNameFromPath(filePath: string, projectRoot: string): string {
  // Get relative path from project root
  const relativePath = path.relative(projectRoot, filePath);
  
  // Remove the filename and extension
  const dirPath = path.dirname(relativePath);
  const fileName = path.basename(filePath);
  const match = fileName.match(/(.*)\.stories\.(ts|tsx|js|jsx)$/);
  const componentName = match ? match[1] : fileName;
  
  // Storybook uses the directory path as the story ID prefix, not including the component name again
  // Example: "src/testing-components/TestInfo/TestInfo.stories.tsx" -> "testing-components-testinfo"
  // The directory path already contains the component directory, so we don't append it again
  // Remove "src/" prefix and normalize to kebab-case
  let fullPath = dirPath;
  if (fullPath.startsWith('src/')) {
    fullPath = fullPath.substring(4); // Remove "src/" prefix
  }
  if (fullPath.startsWith('src\\')) {
    fullPath = fullPath.substring(4); // Remove "src\" prefix (Windows)
  }
  
  return fullPath.replace(/\//g, '-').replace(/\\/g, '-').toLowerCase();
}

/**
 * Converts camelCase to kebab-case
 * Example: "MockedDefault" -> "mocked-default"
 */
function camelToKebab(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2') // Insert hyphen between lowercase and uppercase
    .toLowerCase();
}

/**
 * Checks if a file is a story file
 */
function isStoryFile(filename: string, storyFiles: string[]): boolean {
  const normalizedPath = path.resolve(filename);
  return storyFiles.some((storyFile) => path.resolve(storyFile) === normalizedPath);
}

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
        // For now, we'll store a placeholder that indicates this package should be mocked
        // The actual mock implementation will be extracted at runtime
        const nodeType = prop.value && (prop.value as any).type;
        console.log(`[SHERLO:extraction] Extracting mock for key "${key}", nodeType: ${nodeType}`);
        const extracted = extractMockValue(prop.value);
        console.log(`[SHERLO:extraction] Result for "${key}":`, extracted === null ? 'null' : typeof extracted === 'object' ? `{ __isFunction: ${(extracted as any).__isFunction}, __isClass: ${(extracted as any).__isClass}, __code length: ${(extracted as any).__code?.length || 0} }` : String(extracted));
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

  // Debug: log node type for troubleshooting
  const nodeType = value && value.type;
  if (nodeType) {
    // Log all node types, especially for functions and classes
    if (nodeType.includes('Function') || nodeType.includes('Class') || nodeType === 'ArrowFunctionExpression') {
      console.log(`[SHERLO:extraction] extractMockValue called with nodeType: ${nodeType}, async: ${(value as any).async}, isArrowFunction: ${t.isArrowFunctionExpression(value)}, isFunctionExpression: ${t.isFunctionExpression(value)}`);
    }
  } else if (!value) {
    console.log(`[SHERLO:extraction] extractMockValue called with null/undefined value`);
    return null;
  }

  // For arrow functions and function expressions, convert to code string
  if (t.isArrowFunctionExpression(value) || t.isFunctionExpression(value)) {
    if (generate) {
      const code = generate(value).code;
      return { __isFunction: true, __code: code };
    }
    // Fallback: return marker
    return { __isFunction: true, __code: '() => {}' };
  }

  // For class expressions and class declarations, convert to code string
  if (t.isClassExpression(value) || t.isClassDeclaration(value)) {
    if (generate) {
      try {
        const code = generate(value).code;
        console.log(`[SHERLO:extraction] Extracted class directly, code length: ${code.length}, preview: ${code.substring(0, 50)}`);
        return { __isClass: true, __code: code };
      } catch (e: any) {
        console.warn(`[SHERLO:extraction] Failed to generate code for class:`, e.message);
        return { __isClass: true, __code: 'class {}' };
      }
    }
    // Fallback: return marker
    console.warn(`[SHERLO:extraction] @babel/generator not available for class`);
    return { __isClass: true, __code: 'class {}' };
  }

  // For object expressions, extract properties
  if (t.isObjectExpression(value)) {
    const obj: Record<string, any> = {};
    for (const prop of value.properties) {
      if (t.isObjectProperty(prop)) {
        const key = t.isIdentifier(prop.key)
          ? prop.key.name
          : t.isStringLiteral(prop.key)
          ? prop.key.value
          : null;
        
        if (key) {
          // Check node type directly first (more reliable than type checker functions)
          const nodeType = prop.value && (prop.value as any).type;
          const isArrowFunctionNode = nodeType === 'ArrowFunctionExpression';
          const isFunctionExpressionNode = nodeType === 'FunctionExpression';
          
          // Also check using type checker functions (for compatibility)
          const isArrowFunction = t.isArrowFunctionExpression(prop.value);
          const isFunctionExpression = t.isFunctionExpression(prop.value);
          const isAsyncFunction = prop.value && (prop.value as any).async === true;
          
          // Use node type check OR type checker - either should work
          if (isArrowFunctionNode || isFunctionExpressionNode || isArrowFunction || isFunctionExpression) {
            if (generate) {
              try {
                const code = generate(prop.value).code;
                const isAsync = isAsyncFunction || code.trim().startsWith('async');
                console.log(`[SHERLO:extraction] Extracted ${isAsync ? 'async ' : ''}function ${key} (nodeType: ${nodeType}, arrowNode: ${isArrowFunctionNode}, funcNode: ${isFunctionExpressionNode}, arrow: ${isArrowFunction}, funcExpr: ${isFunctionExpression}, async: ${isAsync}), code length: ${code.length}, code preview: ${code.substring(0, 50)}`);
                obj[key] = { __isFunction: true, __code: code };
              } catch (e: any) {
                console.warn(`[SHERLO:extraction] Failed to generate code for function ${key}:`, e.message);
                obj[key] = { __isFunction: true, __code: '() => {}' };
              }
            } else {
              console.warn(`[SHERLO:extraction] @babel/generator not available for function ${key}`);
              obj[key] = { __isFunction: true, __code: '() => {}' };
            }
          } else if (t.isClassExpression(prop.value) || t.isClassDeclaration(prop.value)) {
            if (generate) {
              try {
                const code = generate(prop.value).code;
                console.log(`[SHERLO:extraction] Extracted class ${key} from object expression, code length: ${code.length}, preview: ${code.substring(0, 50)}`);
                obj[key] = { __isClass: true, __code: code };
              } catch (e: any) {
                console.warn(`[SHERLO:extraction] Failed to generate code for class ${key}:`, e.message);
                obj[key] = { __isClass: true, __code: 'class {}' };
              }
            } else {
              console.warn(`[SHERLO:extraction] @babel/generator not available for class ${key}`);
              obj[key] = { __isClass: true, __code: 'class {}' };
            }
          } else {
            // For other values, try to extract
            // Check node type directly for async functions that might not be detected as arrow functions
            const nodeType = prop.value && (prop.value as any).type;
            if (nodeType === 'ArrowFunctionExpression' || nodeType === 'FunctionExpression') {
              // This might be an async function that wasn't caught above, try extracting it
              const extracted = extractMockValue(prop.value);
              if (extracted === null && prop.value) {
                console.warn(`[SHERLO:extraction] extractMockValue returned null for ${key} (nodeType: ${nodeType}), trying direct extraction`);
                // Try direct extraction
                if (generate) {
                  try {
                    const code = generate(prop.value).code;
                    console.log(`[SHERLO:extraction] Direct extraction succeeded for ${key}, code length: ${code.length}`);
                    obj[key] = { __isFunction: true, __code: code };
                  } catch (e: any) {
                    console.warn(`[SHERLO:extraction] Direct extraction failed for ${key}:`, e.message);
                    obj[key] = null;
                  }
                } else {
                  obj[key] = null;
                }
              } else {
                obj[key] = extracted;
              }
            } else {
              const extracted = extractMockValue(prop.value);
              if (extracted === null && prop.value) {
                console.warn(`[SHERLO:extraction] extractMockValue returned null for ${key}, node type:`, nodeType, 'isClassExpression:', t.isClassExpression(prop.value), 'isClassDeclaration:', t.isClassDeclaration(prop.value), 'isArrowFunction:', t.isArrowFunctionExpression(prop.value), 'isFunctionExpression:', t.isFunctionExpression(prop.value));
              }
              obj[key] = extracted;
            }
          }
        }
      }
    }
    return obj;
  }

  // For literals, return the value
  if (t.isStringLiteral(value)) return value.value;
  if (t.isNumericLiteral(value)) return value.value;
  if (t.isBooleanLiteral(value)) return value.value;
  if (t.isNullLiteral(value)) return null;

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
    console.warn(`[SHERLO:transformer] Babel not available, skipping mock extraction for ${path.basename(filePath)}`);
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
                  // Log what we're storing for debugging
                  if (pkgName.includes('classUtils') || pkgName.includes('asyncUtils')) {
                    console.log(`[SHERLO:transformer] Storing mock for ${pkgName}:`, typeof pkgMock, pkgMock && typeof pkgMock === 'object' ? Object.keys(pkgMock) : 'not object');
                    if (pkgMock && typeof pkgMock === 'object') {
                      for (const [exportName, exportValue] of Object.entries(pkgMock)) {
                        const hasMarker = exportValue && typeof exportValue === 'object' && ((exportValue as any).__isFunction || (exportValue as any).__isClass);
                        console.log(`[SHERLO:transformer]   ${exportName}: type=${typeof exportValue}, hasMarker=${hasMarker}, isFunction=${(exportValue as any)?.__isFunction}, isClass=${(exportValue as any)?.__isClass}`);
                      }
                    }
                  }
                  packageMocks.set(pkgName, pkgMock);
                }

                // Store with normalized ID (Storybook format)
                mocks.set(storyId, packageMocks);
                // Also store with original format
                mocks.set(originalStoryId, packageMocks);
                
                console.log(
                  `[SHERLO:transformer] Extracted mocks for ${storyId} (original: ${originalStoryId}):`,
                  Array.from(packageMocks.keys())
                );
                console.log(`[SHERLO:transformer] Mock details:`, JSON.stringify(Object.fromEntries(packageMocks), null, 2));
              }
            }
          });
        }
      },
    });
  } catch (error: any) {
    console.warn(
      `[SHERLO:transformer] Failed to parse transformed code for ${path.basename(filePath)}:`,
      error.message
    );
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
      console.log(`[SHERLO:transformer] Processing story file: ${path.relative(projRoot, args.filename)}`);

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

