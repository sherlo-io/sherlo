/**
 * Extracts function values from AST nodes
 */

/**
 * Recursively removes TypeScript type annotations from AST nodes
 */
function removeTypeAnnotations(node: any, t: any): any {
  if (!node || !t) return node;

  // Clone to avoid mutating original
  // CRITICAL: Use deep clone to preserve body
  const cloned = t.cloneNode(node, true); // Changed from false to true for deep clone

  // Remove type annotation from identifier
  if (cloned.typeAnnotation) {
    delete cloned.typeAnnotation;
  }

  // Remove return type annotation
  if (cloned.returnType) {
    delete cloned.returnType;
  }

  // Remove type parameters
  if (cloned.typeParameters) {
    delete cloned.typeParameters;
  }

  // Process function parameters
  if (cloned.params && Array.isArray(cloned.params)) {
    cloned.params = cloned.params.map((param: any) => {
      if (t.isIdentifier(param)) {
        const newParam = t.cloneNode(param, false);
        if (newParam.typeAnnotation) {
          delete newParam.typeAnnotation;
        }
        return newParam;
      } else if (t.isAssignmentPattern(param)) {
        const newLeft = param.left ? removeTypeAnnotations(param.left, t) : param.left;
        return t.assignmentPattern(newLeft, param.right);
      } else if (t.isRestElement(param)) {
        const newArg = param.argument ? removeTypeAnnotations(param.argument, t) : param.argument;
        return t.restElement(newArg);
      } else if (t.isObjectPattern(param)) {
        const newPattern = removeTypeAnnotations(param, t);
        return newPattern;
      }
      return removeTypeAnnotations(param, t);
    });
  }

  // Process object pattern properties
  if (cloned.properties && Array.isArray(cloned.properties)) {
    cloned.properties = cloned.properties.map((prop: any) => removeTypeAnnotations(prop, t));
  }

  return cloned;
}

/**
 * Strips TypeScript type annotations from a function AST node
 * Manually removes type annotations to avoid traverse scope issues
 * CRITICAL: Must preserve function body!
 */
function stripTypesFromFunctionAST(node: any, t: any, traverse: any): any {
  if (!t) {
    return node; // Can't strip types without Babel types
  }

  // CRITICAL: Don't use removeTypeAnnotations - it might corrupt the body
  // Instead, just clone and remove type annotations from the function itself
  const cloned = t.cloneNode(node, true); // Deep clone to preserve body
  
  // Only remove type annotations from the function node itself, not the body
  if (cloned.typeAnnotation) {
    delete cloned.typeAnnotation;
  }
  if (cloned.returnType) {
    delete cloned.returnType;
  }
  if (cloned.typeParameters) {
    delete cloned.typeParameters;
  }
  
  // Remove type annotations from parameters only
  if (cloned.params && Array.isArray(cloned.params)) {
    cloned.params = cloned.params.map((param: any) => {
      if (t.isIdentifier(param)) {
        const newParam = t.cloneNode(param, true);
        if (newParam.typeAnnotation) {
          delete newParam.typeAnnotation;
        }
        return newParam;
      }
      // For other param types, just return as-is to preserve structure
      return param;
    });
  }
  
  // DO NOT modify the body - preserve it exactly as is
  return cloned;
}

/**
 * Extracts a function or arrow function from an AST node
 *
 * @param value - The AST node to extract from
 * @param t - Babel types helper
 * @param generate - Babel generator function
 * @returns Marker object with function code, or null if not a function
 */
export function extractFunction(value: any, t: any, generate: any): any {
  // For arrow functions and function expressions, convert to code string
  if (t.isArrowFunctionExpression(value) || t.isFunctionExpression(value)) {
    if (generate && t) {
      // Get traverse for type stripping
      let traverse: any = null;
      try {
        traverse = require('@babel/traverse').default;
      } catch {
        // Traverse not available, will generate with types (fallback to regex stripping later)
      }

      // Strip TypeScript types from AST before generating code
      const nodeWithoutTypes = traverse
        ? stripTypesFromFunctionAST(value, t, traverse)
        : value;

      // CRITICAL DEBUG: Log the AST node structure before generating
      console.error(`[SHERLO] extractFunction: AST node type: ${value.type}`);
      console.error(`[SHERLO] extractFunction: AST node has body: ${!!value.body}`);
      if (value.body) {
        console.error(`[SHERLO] extractFunction: AST body type: ${value.body.type}`);
        if (value.body.type === 'BlockStatement') {
          console.error(`[SHERLO] extractFunction: BlockStatement has ${value.body.body?.length || 0} statements`);
        } else if (value.body.type === 'ArrayExpression') {
          console.error(`[SHERLO] extractFunction: ArrayExpression has ${value.body.elements?.length || 0} elements`);
        }
      }

      const code = generate(nodeWithoutTypes).code;
      console.error(`[SHERLO] extractFunction: Generated code: ${code.substring(0, 200)}`);
      
      // Check if generated code has empty body
      if (code.includes('function () { {} }') || code.includes('function() { {} }') || code.match(/function\s*\([^)]*\)\s*\{\s*\{\s*\}\s*\}/)) {
        console.error(`[SHERLO] extractFunction: ⚠️  WARNING: Generated code has empty body!`);
        console.error(`[SHERLO] extractFunction: Original AST body:`, JSON.stringify(value.body, null, 2).substring(0, 500));
        console.error(`[SHERLO] extractFunction: NodeWithoutTypes body:`, JSON.stringify(nodeWithoutTypes.body, null, 2).substring(0, 500));
      }
      
      return { __isFunction: true, __code: code };
    }
    // Fallback: return marker
    return { __isFunction: true, __code: '() => {}' };
  }

  return null;
}

