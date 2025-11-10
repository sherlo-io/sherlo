/**
 * Extracts special values (NaN, Infinity, Date, RegExp, Getters) from AST nodes
 */

/**
 * Extracts special numeric values (NaN, Infinity, -Infinity) from AST nodes
 *
 * @param value - The AST node to extract from
 * @param t - Babel types helper
 * @returns Marker object for special value, or null if not a special numeric value
 */
export function extractSpecialNumericValue(value: any, t: any): any {
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

  return null;
}

/**
 * Extracts Date objects from AST nodes
 *
 * @param value - The AST node to extract from
 * @param t - Babel types helper
 * @param generate - Babel generator function
 * @returns Marker object with Date code, or null if not a Date
 */
export function extractDate(value: any, t: any, generate: any): any {
  // Handle Date objects (NewExpression with callee 'Date')
  if (t.isNewExpression(value) && t.isIdentifier(value.callee) && value.callee.name === 'Date') {
    if (generate) {
      try {
        const code = generate(value).code;
        return { __isDate: true, __code: code };
      } catch {
        return { __isDate: true, __code: 'new Date()' };
      }
    }
    return { __isDate: true, __code: 'new Date()' };
  }

  return null;
}

/**
 * Extracts RegExp objects from AST nodes
 *
 * @param value - The AST node to extract from
 * @param t - Babel types helper
 * @param generate - Babel generator function
 * @returns Marker object with RegExp code, or null if not a RegExp
 */
export function extractRegExp(value: any, t: any, generate: any): any {
  // Handle RegExp objects (RegExpLiteral or NewExpression with callee 'RegExp')
  if (t.isRegExpLiteral(value)) {
    if (generate) {
      try {
        const code = generate(value).code;
        return { __isRegExp: true, __code: code };
      } catch {
        return { __isRegExp: true, __code: '/.*/' };
      }
    }
    return { __isRegExp: true, __code: '/.*/' };
  }

  if (t.isNewExpression(value) && t.isIdentifier(value.callee) && value.callee.name === 'RegExp') {
    if (generate) {
      try {
        const code = generate(value).code;
        return { __isRegExp: true, __code: code };
      } catch {
        return { __isRegExp: true, __code: "new RegExp('.*')" };
      }
    }
    return { __isRegExp: true, __code: "new RegExp('.*')" };
  }

  return null;
}

/**
 * Extracts getter properties from object method AST nodes
 *
 * @param prop - The object method AST node
 * @param t - Babel types helper
 * @param generate - Babel generator function
 * @returns Object with key and getter marker, or null if not a getter
 */
export function extractGetter(prop: any, t: any, generate: any): { key: string; value: any } | null {
  // Handle getter properties (get value() { ... })
  if (t.isObjectMethod(prop) && prop.kind === 'get') {
    const key = t.isIdentifier(prop.key)
      ? prop.key.name
      : t.isStringLiteral(prop.key)
      ? prop.key.value
      : null;

    if (key && generate) {
      try {
        const getterCode = generate(prop).code;
        return { key, value: { __isGetter: true, __code: getterCode } };
      } catch {
        return { key, value: null };
      }
    }
  }

  return null;
}

