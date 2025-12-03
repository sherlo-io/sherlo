/**
 * Extracts values from object expression AST nodes
 * Handles properties including functions, classes, getters, and nested objects
 */

import { extractFunction } from './extractFunction';
import { extractClass } from './extractClass';
import { extractGetter } from './extractSpecialValues';
import { extractAsyncFunctionFromCallExpression, extractAsyncFunctionFromIIFE } from './extractAsyncFunction';

/**
 * Extracts a property key from an AST node
 *
 * @param prop - The object property or method AST node
 * @param t - Babel types helper
 * @returns The property key as a string, or null if not extractable
 */
export function extractPropertyKey(prop: any, t: any): string | null {
  if (t.isIdentifier(prop.key)) {
    return prop.key.name;
  }
  if (t.isStringLiteral(prop.key)) {
    return prop.key.value;
  }
  return null;
}

/**
 * Extracts values from an object expression AST node
 * Recursively extracts all properties including functions, getters, and special values
 *
 * @param value - The object expression AST node
 * @param t - Babel types helper
 * @param generate - Babel generator function
 * @param extractMockValue - Function to recursively extract mock values
 * @returns Object with extracted property values
 */
export function extractObjectExpression(
  value: any,
  t: any,
  generate: any,
  extractMockValue: (element: any) => any
): Record<string, any> {
  const obj: Record<string, any> = {};

  for (const prop of value.properties) {
    // Handle getter properties (get value() { ... })
    const getterResult = extractGetter(prop, t, generate);
    if (getterResult) {
      obj[getterResult.key] = getterResult.value;
      continue;
    }

    if (t.isObjectProperty(prop)) {
      const key = extractPropertyKey(prop, t);
      if (!key) continue;

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
        const functionResult = extractFunction(prop.value, t, generate);
        if (functionResult) {
          obj[key] = functionResult;
          continue;
        }
      } else if (nodeType === 'ClassExpression' || t.isClassExpression(prop.value)) {
        // Handle class expressions
        const classResult = extractClass(prop.value, t, generate);
        if (classResult) {
          obj[key] = classResult;
          continue;
        }
      } else if (nodeType === 'CallExpression' && generate) {
        // Handle Metro's _asyncToGenerator transformation
        try {
          const asyncResult = extractAsyncFunctionFromCallExpression(prop.value, generate);
          if (asyncResult) {
            obj[key] = asyncResult;
            continue;
          }

          // Not _asyncToGenerator, but might be an IIFE that wraps _asyncToGenerator
          const code = generate(prop.value).code;
          const iifeAsyncResult = extractAsyncFunctionFromIIFE(code, generate);
          if (iifeAsyncResult) {
            obj[key] = iifeAsyncResult;
            continue;
          }

          // Check if it's a regular async function
          if (code.includes('async') || code.includes('=>')) {
            obj[key] = { __isFunction: true, __code: code };
            continue;
          }

          // Doesn't look like function/class, fall back to extractMockValue
          const extracted = extractMockValue(prop.value);
          if (extracted === null) {
            console.error(`[SHERLO] Failed to extract mock "${key}": unsupported node type ${nodeType}`);
          }
          obj[key] = extracted;
        } catch {
          // Failed to generate code for CallExpression, trying fallback
          const extracted = extractMockValue(prop.value);
          obj[key] = extracted;
        }
      } else {
        // For other values, try to extract
        const extracted = extractMockValue(prop.value);
        if (extracted === null && prop.value && key.includes('fetch')) {
          console.error(`[SHERLO] Failed to extract mock "${key}": unsupported node type ${nodeType}`);
        }
        obj[key] = extracted;
      }
    }
  }

  return obj;
}

