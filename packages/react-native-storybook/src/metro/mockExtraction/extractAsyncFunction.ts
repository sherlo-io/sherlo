/**
 * Extracts async functions from Metro's _asyncToGenerator transformation
 * Metro transforms async functions into generator functions wrapped by _asyncToGenerator
 */

/**
 * Extracts an async function from Metro's _asyncToGenerator CallExpression
 * Converts the generator function back to an async function
 *
 * @param callExpr - The CallExpression AST node
 * @param generate - Babel generator function
 * @returns Marker object with async function code, or null if not an async function
 */
/**
 * Strips TypeScript type annotations from function parameters
 */
function stripTypesFromParams(params: any[], t: any): any[] {
  if (!t || !params) return params;
  
  return params.map((param: any) => {
    if (t.isIdentifier(param)) {
      if (param.typeAnnotation) {
        const newParam = t.cloneNode(param, false);
        delete newParam.typeAnnotation;
        return newParam;
      }
      return param;
    } else if (t.isAssignmentPattern(param)) {
      if (param.left && param.left.typeAnnotation) {
        const newLeft = t.cloneNode(param.left, false);
        delete newLeft.typeAnnotation;
        return t.assignmentPattern(newLeft, param.right);
      }
      return param;
    } else if (t.isRestElement(param)) {
      if (param.argument && param.argument.typeAnnotation) {
        const newArg = t.cloneNode(param.argument, false);
        delete newArg.typeAnnotation;
        return t.restElement(newArg);
      }
      return param;
    }
    return param;
  });
}

export function extractAsyncFunctionFromCallExpression(callExpr: any, generate: any): any {
  if (!callExpr || !callExpr.callee || !callExpr.arguments || callExpr.arguments.length === 0) {
    return null;
  }

  const calleeName = callExpr.callee.name || 
    (callExpr.callee.type === 'MemberExpression' && callExpr.callee.property && callExpr.callee.property.name);

  if (calleeName === '_asyncToGenerator') {
    // Extract the generator function from the first argument
    const generatorFn = callExpr.arguments[0];
    if (generatorFn && 
        (generatorFn.type === 'FunctionExpression' || 
         generatorFn.type === 'ArrowFunctionExpression' || 
         generatorFn.type === 'FunctionDeclaration')) {
      
      // Get Babel types for type stripping
      let t: any = null;
      try {
        t = require('@babel/types');
      } catch {
        // Types not available, will use regex stripping later
      }

      // Strip types from parameters before generating code
      const paramsWithoutTypes = t && generatorFn.params
        ? stripTypesFromParams(generatorFn.params, t)
        : generatorFn.params;

      // Convert the generator function back to an async function
      if (generatorFn.body && generatorFn.body.type === 'BlockStatement') {
        const bodyCode = generate(generatorFn.body).code;
        // Convert yield to await in the body code
        const asyncBodyCode = bodyCode.replace(/\byield\b/g, 'await');
        // Reconstruct as async arrow function: async (...params) => { body }
        const params = paramsWithoutTypes ? generate(t.arrayExpression(paramsWithoutTypes)).code.replace(/^\[|\]$/g, '') : '';
        const asyncCode = `async (${params}) => ${asyncBodyCode}`;
        return { __isFunction: true, __code: asyncCode };
      } else {
        // Fallback: generate generator code and convert yield to await
        const generatorCode = generate(generatorFn).code;
        const asyncCode = generatorCode.replace(/\bfunction\*\s*\(/g, 'async function(').replace(/\byield\b/g, 'await');
        return { __isFunction: true, __code: asyncCode };
      }
    }
  }

  return null;
}

/**
 * Extracts an async function from an IIFE pattern that wraps _asyncToGenerator
 * Metro sometimes wraps async functions in IIFEs
 *
 * @param code - The generated code string
 * @param generate - Babel generator function
 * @returns Marker object with async function code, or null if not an async IIFE pattern
 */
export function extractAsyncFunctionFromIIFE(code: string, generate: any): any {
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
      return { __isFunction: true, __code: asyncCode };
    }
  }

  return null;
}

