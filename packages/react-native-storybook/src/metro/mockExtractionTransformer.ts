/**
 * Metro transformer that extracts mocks from story files during bundling.
 * This runs after Metro transforms TypeScript to JavaScript, so we can parse
 * the transformed JavaScript code to extract mock definitions.
 */

import * as path from 'path';
import type { StoryMockMap } from './types';

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
        // Babel parser not available, mock extraction will be skipped
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
      // Babel traverse not available, mock extraction will be skipped
    }
  }
  return babelTraverse;
}

function getBabelTypes() {
  if (!babelTypes) {
    try {
      babelTypes = require('@babel/types');
    } catch {
      // Babel types not available, mock extraction will be skipped
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
        // console.log(`[SHERLO:extraction] Extracting mock for key "${key}", nodeType: ${nodeType}`);
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

  // Debug: log node type for troubleshooting
  const nodeType = value && value.type;
  // if (nodeType) {
  //   // Log all node types, especially for functions and classes
  //   if (nodeType.includes('Function') || nodeType.includes('Class') || nodeType === 'ArrowFunctionExpression') {
  //     console.log(`[SHERLO:extraction] extractMockValue called with nodeType: ${nodeType}, async: ${(value as any).async}, isArrowFunction: ${t.isArrowFunctionExpression(value)}, isFunctionExpression: ${t.isFunctionExpression(value)}`);
  //   }
  // } else if (!value) {
  //   console.log(`[SHERLO:extraction] extractMockValue called with null/undefined value`);
  //   return null;
  // }
  if (!value) {
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
        // console.log(`[SHERLO:extraction] Extracted class, code length: ${code.length}`);
        return { __isClass: true, __code: code };
      } catch (e: any) {
        // Failed to generate code for class, using placeholder
        return { __isClass: true, __code: 'class {}' };
      }
    }
    // Fallback: return marker
    // console.warn(`[SHERLO:extraction] @babel/generator not available for class`);
    return { __isClass: true, __code: 'class {}' };
  }

  // For array expressions, extract elements recursively
  if (t.isArrayExpression(value)) {
    if (generate) {
      try {
        const code = generate(value).code;
        // Parse the generated code to get the actual array value
        // We can't just eval it here (we're in Node.js context), so we'll store it as code
        // But arrays should be serialized as JSON, so let's extract the elements
        const elements: any[] = [];
        for (const element of value.elements) {
          if (element) {
            const extracted = extractMockValue(element);
            elements.push(extracted);
          } else {
            elements.push(null);
          }
        }
        return elements;
      } catch (e: any) {
        // Failed to extract array, returning empty array
        return [];
      }
    }
    // Fallback: try to extract elements directly
    const elements: any[] = [];
    for (const element of value.elements) {
      if (element) {
        const extracted = extractMockValue(element);
        elements.push(extracted);
      } else {
        elements.push(null);
      }
    }
    return elements;
  }

  // Handle special values: NaN, Infinity, -Infinity
  if (t.isIdentifier(value)) {
    if (value.name === 'NaN') {
      return { __isNaN: true };
    }
    if (value.name === 'Infinity') {
      return { __isInfinity: true };
    }
  }

  // Handle -Infinity (UnaryExpression with operator '-' and argument 'Infinity')
  if (t.isUnaryExpression(value) && value.operator === '-') {
    if (t.isIdentifier(value.argument) && value.argument.name === 'Infinity') {
      return { __isNegativeInfinity: true };
    }
  }

  // Handle Date objects (NewExpression with callee 'Date')
  if (t.isNewExpression(value) && t.isIdentifier(value.callee) && value.callee.name === 'Date') {
    if (generate) {
      try {
        const code = generate(value).code;
        // Extract the date string from the code (e.g., "new Date('2024-01-15T10:30:00Z')")
        return { __isDate: true, __code: code };
      } catch (e: any) {
        // Failed to generate code for Date, using placeholder
        return { __isDate: true, __code: "new Date()" };
      }
    }
    return { __isDate: true, __code: "new Date()" };
  }

  // Handle RegExp objects (RegExpLiteral or NewExpression with callee 'RegExp')
  if (t.isRegExpLiteral(value)) {
    if (generate) {
      try {
        const code = generate(value).code;
        return { __isRegExp: true, __code: code };
      } catch (e: any) {
        // Failed to generate code for RegExp, using placeholder
        return { __isRegExp: true, __code: "/.*/" };
      }
    }
    return { __isRegExp: true, __code: "/.*/" };
  }

  if (t.isNewExpression(value) && t.isIdentifier(value.callee) && value.callee.name === 'RegExp') {
    if (generate) {
      try {
        const code = generate(value).code;
        return { __isRegExp: true, __code: code };
      } catch (e: any) {
        // Failed to generate code for RegExp, using placeholder
        return { __isRegExp: true, __code: "new RegExp('.*')" };
      }
    }
    return { __isRegExp: true, __code: "new RegExp('.*')" };
  }

  // For object expressions, extract properties
  if (t.isObjectExpression(value)) {
    const obj: Record<string, any> = {};
    for (const prop of value.properties) {
      // Handle getter properties (get value() { ... })
      if (t.isObjectMethod(prop) && prop.kind === 'get') {
        const key = t.isIdentifier(prop.key)
          ? prop.key.name
          : t.isStringLiteral(prop.key)
          ? prop.key.value
          : null;

        if (key && generate) {
          try {
            // Generate the entire object with the getter preserved
            // We'll mark it as a getter so it can be reconstructed
            const getterCode = generate(prop).code;
            obj[key] = { __isGetter: true, __code: getterCode };
          } catch (e: any) {
            // Failed to generate code for getter, using null
            obj[key] = null;
          }
        }
        continue;
      }

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
                // Only log if extraction failed
                // if (key.includes('fetch') || key.includes('DataProcessor') || key.includes('Calculator')) {
                //   console.log(`[SHERLO:extraction] Extracted ${isAsync ? 'async ' : ''}function ${key}, code length: ${code.length}`);
                // }
                obj[key] = { __isFunction: true, __code: code };
              } catch (e: any) {
                // Failed to generate code for function, using placeholder
                obj[key] = { __isFunction: true, __code: '() => {}' };
              }
            } else {
              // console.warn(`[SHERLO:extraction] @babel/generator not available for function ${key}`);
              obj[key] = { __isFunction: true, __code: '() => {}' };
            }
          } else if (t.isClassExpression(prop.value) || t.isClassDeclaration(prop.value)) {
            if (generate) {
              try {
                const code = generate(prop.value).code;
                // Only log if extraction failed
                // if (key.includes('DataProcessor') || key.includes('Calculator')) {
                //   console.log(`[SHERLO:extraction] Extracted class ${key}, code length: ${code.length}`);
                // }
                obj[key] = { __isClass: true, __code: code };
              } catch (e: any) {
                // Failed to generate code for class, using placeholder
                obj[key] = { __isClass: true, __code: 'class {}' };
              }
            } else {
              // console.warn(`[SHERLO:extraction] @babel/generator not available for class ${key}`);
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
                // Only log if extraction failed
                // if (key.includes('fetch') || key.includes('DataProcessor') || key.includes('Calculator')) {
                //   console.warn(`[SHERLO:extraction] extractMockValue returned null for ${key} (nodeType: ${nodeType}), trying direct extraction`);
                // }
                // Try direct extraction
                if (generate) {
                  try {
                    const code = generate(prop.value).code;
                    // Only log if extraction failed
                    // if (key.includes('fetch') || key.includes('DataProcessor') || key.includes('Calculator')) {
                    //   console.log(`[SHERLO:extraction] Direct extraction succeeded for ${key}, code length: ${code.length}`);
                    // }
                    obj[key] = { __isFunction: true, __code: code };
                  } catch (e: any) {
                    // Direct extraction failed, using null
                    obj[key] = null;
                  }
                } else {
                  obj[key] = null;
                }
              } else {
                obj[key] = extracted;
              }
            } else {
              // If nodeType is CallExpression, it might be a transformed async function or class
              // Metro transforms async functions to use _asyncToGenerator helper
              // We need to extract the original function from the CallExpression
              // Handle ALL CallExpression nodes, not just those with specific key names
              if (nodeType === 'CallExpression' && generate) {
                try {
                  // Check if this is Metro's _asyncToGenerator transformation
                  const callExpr = prop.value as any;
                  const calleeName = callExpr.callee && (callExpr.callee.name || (callExpr.callee.type === 'MemberExpression' && callExpr.callee.property && callExpr.callee.property.name));

                  // Debug logging only for known async function patterns
                  if ((key.includes('fetch') || key.includes('async') || key.includes('getUser')) && calleeName) {
                    // console.log(`[SHERLO:extraction] CallExpression for ${key}, callee name: ${calleeName}, callee type: ${callExpr.callee?.type}`);
                  }

                  if (callExpr.callee && calleeName === '_asyncToGenerator' && callExpr.arguments && callExpr.arguments.length > 0) {
                    // Extract the generator function from the first argument
                    const generatorFn = callExpr.arguments[0];
                    if (generatorFn && (generatorFn.type === 'FunctionExpression' || generatorFn.type === 'ArrowFunctionExpression' || generatorFn.type === 'FunctionDeclaration')) {
                      // Convert the generator function back to an async function
                      // Metro transforms: async (x) => y
                      // To: _asyncToGenerator(function*() { return y; })
                      // We need to extract the generator body and convert yield to await
                      if (generatorFn.body && generatorFn.body.type === 'BlockStatement') {
                        const bodyCode = generate(generatorFn.body).code;
                        // Convert yield to await in the body code
                        const asyncBodyCode = bodyCode.replace(/\byield\b/g, 'await');
                        // Reconstruct as async arrow function: async (...params) => { body }
                        const params = generatorFn.params ? generate(generatorFn.params).code : '';
                        const asyncCode = `async (${params}) => ${asyncBodyCode}`;
                        // Debug logging only for known async function patterns
                        // if (key.includes('fetch') || key.includes('async') || key.includes('getUser')) {
                        //   console.log(`[SHERLO:extraction] Converted ${key} from generator to async, code: ${asyncCode.substring(0, 100)}`);
                        // }
                        obj[key] = { __isFunction: true, __code: asyncCode };
                      } else {
                        // Fallback: generate generator code and convert yield to await
                        const generatorCode = generate(generatorFn).code;
                        const asyncCode = generatorCode.replace(/\bfunction\*\s*\(/g, 'async function(').replace(/\byield\b/g, 'await');
                        // Debug logging only for known async function patterns
                        // if (key.includes('fetch') || key.includes('async') || key.includes('getUser')) {
                        //   console.log(`[SHERLO:extraction] Converted ${key} (fallback), code: ${asyncCode.substring(0, 100)}`);
                        // }
                        obj[key] = { __isFunction: true, __code: asyncCode };
                      }
                    } else {
                      // Not a generator function, try generating code directly
                      const code = generate(prop.value).code;
                      console.error(`[SHERLO] Failed to extract async function "${key}": invalid generator function type`);
                      obj[key] = { __isFunction: true, __code: code };
                    }
                  } else {
                    // Not _asyncToGenerator, but might be an IIFE that wraps _asyncToGenerator
                    // Metro transforms: async (x) => y
                    // To: (function() { var _ref = _asyncToGenerator(function*() {...}); return function(_x) { return _ref.apply(this, arguments); }; })()
                    // Check if this is an IIFE pattern
                    const code = generate(prop.value).code;

                    // Check if the generated code contains _asyncToGenerator (Metro's transformation)
                    if (code.includes('_asyncToGenerator') && code.includes('function*')) {
                      // Helper function to extract generator function body with proper brace matching
                      const extractGeneratorBody = (codeStr: string): { params: string; body: string } | null => {
                        // Find function* declaration
                        const funcMatch = codeStr.match(/function\*\s*\(([^)]*)\)\s*\{/);
                        if (!funcMatch) return null;

                        const params = funcMatch[1].trim();
                        const startIndex = funcMatch.index! + funcMatch[0].length;

                        // Match braces properly to find the closing brace
                        let braceCount = 1;
                        let i = startIndex;
                        while (i < codeStr.length && braceCount > 0) {
                          if (codeStr[i] === '{') braceCount++;
                          else if (codeStr[i] === '}') braceCount--;
                          i++;
                        }

                        if (braceCount !== 0) return null; // Unmatched braces

                        // Extract body (excluding the closing brace)
                        const body = codeStr.substring(startIndex, i - 1);
                        return { params, body };
                      };

                      const extracted = extractGeneratorBody(code);
                      if (extracted) {
                        let body = extracted.body;
                        // Convert yield to await
                        body = body.replace(/\byield\b/g, 'await');
                        // Reconstruct as async arrow function
                        const asyncCode = `async (${extracted.params}) => {${body}}`;
                        // Debug logging only for known async function patterns
                        // if (key.includes('fetch') || key.includes('async') || key.includes('getUser')) {
                        //   console.log(`[SHERLO:extraction] Extracted ${key} from IIFE pattern, converted to: ${asyncCode.substring(0, 100)}`);
                        // }
                        obj[key] = { __isFunction: true, __code: asyncCode };
                      } else {
                        // Can't extract, store as-is (will fail at runtime but we'll see the error)
                        console.error(`[SHERLO] Failed to extract async function "${key}" from IIFE pattern`);
                        obj[key] = { __isFunction: true, __code: code };
                      }
                    } else if (code.includes('async') || code.includes('=>') || code.includes('class')) {
                      // Regular async function or class
                      if (code.includes('class')) {
                        obj[key] = { __isClass: true, __code: code };
                      } else {
                        obj[key] = { __isFunction: true, __code: code };
                      }
                    } else {
                      // Doesn't look like function/class, fall back to extractMockValue
                      const extracted = extractMockValue(prop.value);
                      if (extracted === null) {
                        console.error(`[SHERLO] Failed to extract mock "${key}": unsupported node type ${nodeType}`);
                      }
                      obj[key] = extracted;
                    }
                  }
                } catch (e: any) {
                  // Failed to generate code for CallExpression, trying fallback
                  const extracted = extractMockValue(prop.value);
                  obj[key] = extracted;
                }
              } else {
                const extracted = extractMockValue(prop.value);
                // Only log if extraction failed for async/class exports
                if (extracted === null && prop.value && (key.includes('fetch') || key.includes('DataProcessor') || key.includes('Calculator'))) {
                  console.error(`[SHERLO] Failed to extract mock "${key}": unsupported node type ${nodeType}`);
                }
                obj[key] = extracted;
              }
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

  // If we get here, we couldn't extract the value
  // console.warn(`[SHERLO:extraction] extractMockValue returning null for unhandled node type: ${nodeType || 'unknown'}, value keys:`, value && typeof value === 'object' ? Object.keys(value).join(', ') : 'not an object');
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
                  // Log what we're storing for debugging (only for async/class packages)
                  // if (pkgName.includes('classUtils') || pkgName.includes('asyncUtils')) {
                  //   console.log(`[SHERLO:transformer] Storing mock for ${pkgName}:`, typeof pkgMock, pkgMock && typeof pkgMock === 'object' ? Object.keys(pkgMock) : 'not object');
                  //   if (pkgMock && typeof pkgMock === 'object') {
                  //     for (const [exportName, exportValue] of Object.entries(pkgMock)) {
                  //       const hasMarker = exportValue && typeof exportValue === 'object' && ((exportValue as any).__isFunction || (exportValue as any).__isClass);
                  //       console.log(`[SHERLO:transformer]   ${exportName}: type=${typeof exportValue}, hasMarker=${hasMarker}, isFunction=${(exportValue as any)?.__isFunction}, isClass=${(exportValue as any)?.__isClass}`);
                  //     }
                  //   }
                  // }
                  packageMocks.set(pkgName, pkgMock);
                }

                // Store with normalized ID (Storybook format)
                mocks.set(storyId, packageMocks);
                // Also store with original format
                mocks.set(originalStoryId, packageMocks);

                // console.log(
                //   `[SHERLO:transformer] Extracted mocks for ${storyId} (original: ${originalStoryId}):`,
                //   Array.from(packageMocks.keys())
                // );
                // console.log(`[SHERLO:transformer] Mock details:`, JSON.stringify(Object.fromEntries(packageMocks), null, 2));
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
