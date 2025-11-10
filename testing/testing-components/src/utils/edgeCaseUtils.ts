/**
 * Utility module with edge case exports for testing mocks
 */

/**
 * Special number values
 */
export const SPECIAL_NUMBERS = {
  nan: NaN,
  infinity: Infinity,
  negativeInfinity: -Infinity,
  zero: 0,
  negativeZero: -0,
};

/**
 * Date object export
 */
export const CURRENT_DATE = new Date('2024-01-15T10:30:00Z');

/**
 * RegExp object export
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Empty values
 */
export const EMPTY_VALUES = {
  emptyString: '',
  emptyArray: [],
  emptyObject: {},
  nullValue: null,
  undefinedValue: undefined,
};

/**
 * Deeply nested structure (5 levels deep)
 */
export const DEEP_NESTED = {
  level1: {
    level2: {
      level3: {
        level4: {
          level5: {
            value: 'deep-value',
            number: 42,
          },
        },
      },
    },
  },
};

/**
 * Higher-order function (function that returns a function)
 */
export const createMultiplier = (factor: number) => {
  return (value: number) => value * factor;
};

/**
 * Function that returns a function with closure
 */
export const createCounter = () => {
  let count = 0;
  return () => {
    count++;
    return count;
  };
};

/**
 * Array with mixed types including special values
 */
export const MIXED_ARRAY = [
  'string',
  42,
  true,
  null,
  undefined,
  NaN,
  Infinity,
  { nested: 'object' },
  [1, 2, 3],
];

/**
 * Object with getter property
 */
export const OBJECT_WITH_GETTER = {
  _value: 'getter-value',
  get value() {
    return this._value;
  },
};

