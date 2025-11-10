/**
 * Utilities for serializing and deserializing mock values
 * Handles functions, classes, and other complex types
 */

/**
 * Recursively serializes mock values, converting functions and classes to code strings
 * Handles nested objects with __isFunction/__isClass markers from AST extraction
 */
export function serializeMockValue(value: any): any {
  // Handle function objects with __isFunction marker from AST extraction
  if (value && typeof value === 'object' && (value as any).__isFunction) {
    const code = (value as any).__code || '() => {}';
    return code;
  }

  // Handle class objects with __isClass marker from AST extraction
  if (value && typeof value === 'object' && (value as any).__isClass) {
    const code = (value as any).__code || 'class {}';
    return code;
  }

  // Handle special values: preserve markers for NaN, Infinity, -Infinity, Date, RegExp, Getters
  if (value && typeof value === 'object') {
    if ((value as any).__isNaN) {
      return { __isNaN: true };
    }
    if ((value as any).__isInfinity) {
      return { __isInfinity: true };
    }
    if ((value as any).__isNegativeInfinity) {
      return { __isNegativeInfinity: true };
    }
    if ((value as any).__isDate) {
      return { __isDate: true, __code: (value as any).__code || "new Date()" };
    }
    if ((value as any).__isRegExp) {
      return { __isRegExp: true, __code: (value as any).__code || "/.*/" };
    }
    if ((value as any).__isGetter) {
      return { __isGetter: true, __code: (value as any).__code || "get value() { return undefined; }" };
    }
  }

  // Handle plain functions
  if (typeof value === 'function') {
    return value.toString();
  }

  // Handle objects - recursively serialize nested properties
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const serialized: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      serialized[key] = serializeMockValue(val);
    }
    return serialized;
  }

  // For primitives and arrays, return as-is (will be JSON.stringify'd later if needed)
  return value;
}

/**
 * Generates the deserializeFunctions helper code for inclusion in generated mock files
 * This function recursively converts serialized functions/classes back to actual functions
 */
export function generateDeserializeFunctionsCode(): string {
  return `// Helper to recursively convert serialized functions to actual functions
const deserializeFunctions = (value) => {
  if (value && typeof value === 'object') {
    // Check if this is a serialized function
    if (value.__isFunction && value.__code) {
      try {
        // Use Function constructor for async functions (eval doesn't support async in React Native)
        const code = value.__code;
        return code.trim().startsWith('async')
          ? new Function('return (' + code + ')')()
          : eval('(' + code + ')');
      } catch (e) {
        console.warn('[SHERLO:mock] Failed to deserialize function:', e);
        return () => {};
      }
    }
    // Check if this is a serialized class
    if (value.__isClass && value.__code) {
      try {
        const mockClass = eval('(' + value.__code + ')');
        return mockClass;
      } catch (e) {
        console.warn('[SHERLO:mock] Failed to deserialize class:', e);
        return class {};
      }
    }
    // If it's an array, process each element
    if (Array.isArray(value)) {
      return value.map(deserializeFunctions);
    }
    // If it's an object, process each property
    const result = {};
    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        result[key] = deserializeFunctions(value[key]);
      }
    }
    return result;
  }
  return value;
};`;
}

/**
 * Generates code to create a function from a code string
 * Handles async functions using new Function() (required for React Native)
 * Falls back to eval() for non-async functions
 * Returns code that executes the function and returns its result
 */
export function generateFunctionCreationCode(codeVarName: string): string {
  return `// Use Function constructor for async functions (eval doesn't support async in React Native)
let mockFn;
const codeStr = ${codeVarName};
if (typeof codeStr === 'string' && codeStr.trim().startsWith('async')) {
  // For async functions, wrap in parentheses to make it a valid expression
  try {
    mockFn = new Function('return (' + codeStr + ')')();
  } catch (e) {
    console.warn('[SHERLO:mock] Failed to create async function: ', e.message);
    // Fall through to real implementation
    mockFn = null;
  }
} else {
  try {
    mockFn = typeof codeStr === 'string' ? eval('(' + codeStr + ')') : codeStr;
  } catch (e) {
    console.warn('[SHERLO:mock] Failed to eval function: ', e.message);
    mockFn = null;
  }
}
if (mockFn && typeof mockFn === 'function') {
  const result = mockFn(...args);
  return result;
}`;
}

/**
 * Determines if a serialized value represents a function
 */
export function isSerializedFunction(value: any): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('(') ||
    trimmed.startsWith('function') ||
    trimmed.startsWith('async') ||
    (trimmed.includes('=>') && !trimmed.startsWith('class'))
  );
}

/**
 * Determines if a serialized value represents a class
 */
export function isSerializedClass(value: any): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith('class ') ||
    trimmed.startsWith('class{') ||
    trimmed.startsWith('export class')
  );
}

/**
 * Generates JavaScript code for a storyMocks_functions object
 * Functions are embedded as actual code (not strings), avoiding runtime deserialization
 */
export function generateFunctionsObjectCode(
  storyMocksFunctions: Record<string, Record<string, string>>
): string {
  const storyIds = Object.keys(storyMocksFunctions);
  if (storyIds.length === 0) {
    return 'const storyMocks_functions = {};';
  }

  const lines: string[] = ['const storyMocks_functions = {'];

  for (let i = 0; i < storyIds.length; i++) {
    const storyId = storyIds[i];
    const functions = storyMocksFunctions[storyId];
    const functionNames = Object.keys(functions);

    if (functionNames.length === 0) {
      lines.push(`  "${storyId}": {},`);
      continue;
    }

    lines.push(`  "${storyId}": {`);

    for (let j = 0; j < functionNames.length; j++) {
      const exportName = functionNames[j];
      const functionCode = functions[exportName];
      const isLast = j === functionNames.length - 1;

      // Embed function code directly (not as a string)
      // The functionCode is already valid JavaScript code from @babel/generator
      lines.push(`    ${exportName}: ${functionCode}${isLast ? '' : ','}`);
    }

    lines.push(`  }${i === storyIds.length - 1 ? '' : ','}`);
  }

  lines.push('};');
  return lines.join('\n');
}
