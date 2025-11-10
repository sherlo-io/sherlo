/**
 * Generates the reconstructSpecialValues helper function code for mock files
 * This function recursively reconstructs special values (NaN, Infinity, Date, RegExp, Getters)
 * from serialized mock data
 */

/**
 * Generates the JavaScript code for the reconstructSpecialValues helper function
 * This function is embedded in generated mock files to reconstruct special values
 * from serialized JSON data
 *
 * @returns The JavaScript code for the reconstructSpecialValues function
 */
export function generateSpecialValueReconstructionCode(): string {
  return `// Helper to recursively reconstruct special values (NaN, Infinity, -Infinity, Date, RegExp, Getters) in nested objects
const reconstructSpecialValues = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  // Check if this is a marker object for special values
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (value.__isNaN) {
      return NaN;
    } else if (value.__isInfinity) {
      return Infinity;
    } else if (value.__isNegativeInfinity) {
      return -Infinity;
    } else if (value.__isDate && value.__code) {
      try {
        return eval(value.__code);
      } catch (e) {
        // Failed to reconstruct Date, using current date
        return new Date();
      }
    } else if (value.__isRegExp && value.__code) {
      try {
        return eval(value.__code);
      } catch (e) {
        // Failed to reconstruct RegExp, using default pattern
        return /.*/;
      }
    } else if (value.__isGetter && value.__code) {
      // For getters, we need to reconstruct the getter function
      // The code is like "get value() { return this._value; }"
      try {
        // Extract the getter function body and property name from the code
        // We'll create a getter descriptor and use Object.defineProperty
        const getterFn = new Function('return ' + value.__code)();
        return getterFn;
      } catch (e) {
        // Failed to reconstruct getter, returning undefined
        return undefined;
      }
    }

    // Check if this object has any getters that need special handling
    // If any property is a getter marker, we need to reconstruct the entire object with getters
    let hasGetters = false;
    for (const key in value) {
      if (value.hasOwnProperty(key) && value[key] && typeof value[key] === 'object' && value[key].__isGetter) {
        hasGetters = true;
        break;
      }
    }

    if (hasGetters) {
      // Reconstruct object with getters using Object.defineProperty
      // First, reconstruct all regular properties
      const reconstructed = {};
      const getterDescriptors = {};

      for (const key in value) {
        if (value.hasOwnProperty(key)) {
          if (value[key] && typeof value[key] === 'object' && value[key].__isGetter) {
            // This is a getter - store it for later definition
            getterDescriptors[key] = value[key];
          } else {
            // Regular property - reconstruct recursively
            reconstructed[key] = reconstructSpecialValues(value[key]);
          }
        }
      }

      // Now add getters - create functions that have access to 'reconstructed' via closure
      for (const key in getterDescriptors) {
        try {
          const getterMarker = getterDescriptors[key];
          const getterCode = getterMarker.__code;
          // Extract function body from getter code (e.g., "get value() { return this._value; }" -> "return this._value;")
          const bodyMatch = getterCode.match(/\\{([\\s\\S]*)\\}/);
          if (bodyMatch) {
            const body = bodyMatch[1].trim();
            // Create getter function that accesses 'reconstructed' via closure
            // Replace 'this' with direct reference to 'reconstructed' object
            const getterBody = body.replace(/\\bthis\\./g, 'reconstructed.');
            // Create getter function using IIFE to capture 'reconstructed' in closure
            Object.defineProperty(reconstructed, key, {
              get: (function(obj) {
                // Return a function that evaluates the getter body with 'obj' as 'reconstructed'
                // The body already contains 'return', so we just execute it directly
                return function() {
                  return new Function('reconstructed', getterBody)(obj);
                };
              })(reconstructed),
              enumerable: true,
              configurable: true
            });
          }
        } catch (e) {
          // Failed to reconstruct getter, skipping
        }
      }

      return reconstructed;
    }

    // No getters - recursively process object properties normally
    const reconstructed = {};
    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        reconstructed[key] = reconstructSpecialValues(value[key]);
      }
    }
    return reconstructed;
  }

  // Recursively process arrays
  if (Array.isArray(value)) {
    return value.map(item => reconstructSpecialValues(item));
  }

  return value;
};`;
}

