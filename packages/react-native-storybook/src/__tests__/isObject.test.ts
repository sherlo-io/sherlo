import isObject from '../utils/isObject';

describe('isObject', () => {
  it('returns true for plain object', () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ key: 'value' })).toBe(true);
  });

  it('returns false for array', () => {
    expect(isObject([])).toBe(false);
    expect(isObject([1, 2, 3])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isObject(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isObject(undefined)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isObject('hello')).toBe(false);
  });

  it('returns false for number', () => {
    expect(isObject(42)).toBe(false);
  });

  it('returns false for boolean', () => {
    expect(isObject(true)).toBe(false);
  });

  it('returns true for nested object', () => {
    expect(isObject({ a: { b: { c: 1 } } })).toBe(true);
  });

  it('returns true for object created with Object.create(null)', () => {
    expect(isObject(Object.create(null))).toBe(true);
  });
});
