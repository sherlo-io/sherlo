/**
 * Extracts a class expression from an AST node
 */

/**
 * Extracts a class expression from an AST node
 *
 * @param value - The AST node to extract from
 * @param t - Babel types helper
 * @param generate - Babel generator function
 * @returns Marker object with class code, or null if not a class
 */
export function extractClass(value: any, t: any, generate: any): any {
  // For class expressions, convert to code string
  if (t.isClassExpression(value)) {
    if (generate && t) {
      try {
        // Generate code from the class expression
        const { code } = generate(value);
        return { __isClass: true, __code: code };
      } catch (error) {
        console.error('[SHERLO] extractClass: Failed to generate code for class:', error);
        return { __isClass: true, __code: 'class {}' };
      }
    }
    // Fallback: return marker
    return { __isClass: true, __code: 'class {}' };
  }

  return null;
}

/**
 * Transforms a ClassExpression AST node into a FunctionExpression (constructor function)
 * This is necessary because ClassExpressions in generated mock files can evaluate to undefined
 * in some Metro/Babel environments (e.g. Expo).
 */
export function transformClassToFunction(classNode: any, t: any): any {
  if (!t.isClassExpression(classNode)) return classNode;

  const className = classNode.id; // Identifier or null
  let constructorParams: any[] = [];
  const bodyStatements: any[] = [];

  // Find constructor and methods
  const body = classNode.body.body;
  
  // 1. Handle constructor
  const constructorMethod = body.find((m: any) => t.isClassMethod(m) && m.kind === 'constructor');
  if (constructorMethod) {
    constructorParams = constructorMethod.params;
    // Add constructor body statements
    bodyStatements.push(...constructorMethod.body.body);
  }

  // 2. Handle methods and properties
  body.forEach((member: any) => {
    if (t.isClassMethod(member) && member.kind === 'method') {
      // this.methodName = function(...) { ... }
      const methodFn = t.functionExpression(
        null, // Anonymous function
        member.params,
        member.body,
        member.generator,
        member.async
      );
      
      const assignment = t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.thisExpression(), member.key),
          methodFn
        )
      );
      
      bodyStatements.push(assignment);
    } else if (t.isClassProperty(member) && member.value) {
      // this.prop = value;
      const assignment = t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.thisExpression(), member.key),
          member.value
        )
      );
      bodyStatements.push(assignment);
    }
  });

  return t.functionExpression(
    className,
    constructorParams,
    t.blockStatement(bodyStatements)
  );
}
