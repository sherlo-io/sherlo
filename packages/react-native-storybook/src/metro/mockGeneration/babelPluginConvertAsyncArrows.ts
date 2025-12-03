/**
 * Babel plugin to convert async arrow functions in object literals to async function expressions
 * This fixes Terser compatibility issues where async arrow functions in object literals are unsupported
 * 
 * Converts:
 *   { fn: async (x) => ({ ... }) }
 * To:
 *   { fn: async function(x) { return { ... }; } }
 */

// Use require to avoid TypeScript type issues (Babel types are complex)
// This plugin runs at runtime during code generation, not at compile time

export default function convertAsyncArrows(): any {
  // Try to load Babel types - may not be available in all environments
  let t: any;
  try {
    t = require('@babel/types');
  } catch (e) {
    // If @babel/types is not available, return a no-op plugin
    console.warn('[SHERLO] @babel/types not available, async arrow conversion disabled');
    return {
      name: 'convert-async-arrows',
      visitor: {},
    };
  }

  return {
    name: 'convert-async-arrows',
    visitor: {
      // Match object properties with async arrow function values
      ObjectProperty(path: any) {
        const { node } = path;
        
        // Check if value is an async arrow function
        if (
          t.isArrowFunctionExpression(node.value) &&
          node.value.async === true
        ) {
          const arrowFn = node.value;
          
          // Convert async arrow function to async function expression
          let functionBody: any;
          if (t.isExpression(arrowFn.body)) {
            // If body is an expression, wrap it in return statement
            functionBody = t.blockStatement([t.returnStatement(arrowFn.body)]);
          } else if (t.isBlockStatement(arrowFn.body)) {
            // If body is already a block statement, use it directly
            functionBody = arrowFn.body;
          } else {
            // Fallback: wrap in block statement
            functionBody = t.blockStatement([arrowFn.body]);
          }
          
          const functionExpression = t.functionExpression(
            null, // No function name (anonymous)
            arrowFn.params,
            functionBody,
            false, // Not a generator
            true   // async
          );
          
          // Replace the arrow function with function expression
          path.node.value = functionExpression;
        }
      },
    },
  };
}

