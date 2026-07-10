import createMockable from '../../mocking/createMockable';
import { activateMocks, clearMocks } from '../../mocking/registry';

afterEach(() => {
  clearMocks();
});

describe('createMockable - no active mock set (IS-07)', () => {
  it('passes every trap through to the real module unchanged', () => {
    const realModule = { greet: () => 'hi', PI: 3.14 };
    const mockable = createMockable('pkg/no-mock', realModule);

    expect(mockable.greet()).toBe('hi');
    expect(mockable.PI).toBe(3.14);
    expect('greet' in mockable).toBe(true);
    expect(Object.keys(mockable).sort()).toEqual(['PI', 'greet']);
    expect({ ...mockable }).toEqual(realModule);
  });
});

describe('createMockable - value-type mocks (VT-01..10, VT-17, VT-18)', () => {
  it('VT-01/02: serves a named mock function, called with args', () => {
    const realModule = { greet: (name: string) => `real hello ${name}` };
    const mockable = createMockable('pkg/greet', realModule);

    activateMocks({ 'pkg/greet': { greet: (name: string) => `mock hello ${name}` } });

    expect(mockable.greet('Ada')).toBe('mock hello Ada');
  });

  it('VT-03: serves a mocked constant', () => {
    const realModule = { MAX: 10 };
    const mockable = createMockable('pkg/constant', realModule);

    activateMocks({ 'pkg/constant': { MAX: 99 } });

    expect(mockable.MAX).toBe(99);
  });

  it('VT-04: serves a mocked nested object as-is', () => {
    const realModule = { config: { nested: { value: 'real' } } };
    const mockedConfig = { nested: { value: 'mock' } };
    const mockable = createMockable('pkg/nested', realModule);

    activateMocks({ 'pkg/nested': { config: mockedConfig } });

    expect(mockable.config).toBe(mockedConfig);
    expect(mockable.config.nested.value).toBe('mock');
  });

  it('VT-05: serves a mocked array as-is', () => {
    const realModule = { list: [1, 2, 3] };
    const mockedList = [4, 5, 6];
    const mockable = createMockable('pkg/array', realModule);

    activateMocks({ 'pkg/array': { list: mockedList } });

    expect(mockable.list).toBe(mockedList);
  });

  it('VT-06: serves special values correctly', () => {
    const realModule = {
      nan: 0,
      posInf: 0,
      negInf: 0,
      nullish: 'not null',
      undef: 'not undefined',
      negZero: 0,
    };
    const mockable = createMockable('pkg/special', realModule);

    activateMocks({
      'pkg/special': {
        nan: NaN,
        posInf: Infinity,
        negInf: -Infinity,
        nullish: null,
        undef: undefined,
        negZero: -0,
      },
    });

    expect(mockable.nan).toBeNaN();
    expect(mockable.posInf).toBe(Infinity);
    expect(mockable.negInf).toBe(-Infinity);
    expect(mockable.nullish).toBeNull();
    expect(mockable.undef).toBeUndefined();
    expect(Object.is(mockable.negZero, -0)).toBe(true);
  });

  it('VT-07: serves Date and RegExp instances as-is', () => {
    const realModule = { date: new Date(0), pattern: /real/ };
    const mockedDate = new Date('2024-01-01T00:00:00.000Z');
    const mockedPattern = /mock/gi;
    const mockable = createMockable('pkg/date-regex', realModule);

    activateMocks({ 'pkg/date-regex': { date: mockedDate, pattern: mockedPattern } });

    expect(mockable.date).toBe(mockedDate);
    expect(mockable.date.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(mockable.pattern).toBe(mockedPattern);
    expect(mockable.pattern.test('mock')).toBe(true);
  });

  it('VT-08: serves an async function that resolves', async () => {
    const realModule = { fetchUser: async () => ({ id: 'real' }) };
    const mockable = createMockable('pkg/async-resolve', realModule);

    activateMocks({ 'pkg/async-resolve': { fetchUser: async () => ({ id: 'mock' }) } });

    await expect(mockable.fetchUser()).resolves.toEqual({ id: 'mock' });
  });

  it('VT-09: serves an async function that rejects', async () => {
    const realModule = { fetchUser: async () => ({ id: 'real' }) };
    const mockable = createMockable('pkg/async-reject', realModule);

    activateMocks({
      'pkg/async-reject': {
        fetchUser: async () => {
          throw new Error('mock failure');
        },
      },
    });

    await expect(mockable.fetchUser()).rejects.toThrow('mock failure');
  });

  it('VT-10: serves a generator function that iterates correctly', () => {
    const realModule = {
      *range() {
        yield 'real';
      },
    };
    const mockable = createMockable('pkg/generator', realModule);

    activateMocks({
      'pkg/generator': {
        *range() {
          yield 1;
          yield 2;
          yield 3;
        },
      },
    });

    expect([...mockable.range()]).toEqual([1, 2, 3]);
  });

  it('VT-17: serves a mocked React-style component with stable identity', () => {
    const RealComponent = () => 'real';
    const MockComponent = () => 'mock';
    const realModule = { Button: RealComponent };
    const mockable = createMockable('pkg/component', realModule);

    activateMocks({ 'pkg/component': { Button: MockComponent } });

    const first = mockable.Button;
    const second = mockable.Button;
    expect(first).toBe(MockComponent);
    expect(first).toBe(second);
  });

  it('VT-18: serves values computed via template literals and computed keys', () => {
    const realModule = { label: 'real' };
    const suffix = 'World';
    const computedKey = 'label';
    const mockable = createMockable('pkg/computed', realModule);

    activateMocks({ 'pkg/computed': { [computedKey]: `Hello, ${suffix}` } });

    expect(mockable.label).toBe('Hello, World');
  });

  it('function identity is stable across repeated reads within one activation (VT-11-adjacent)', () => {
    const realModule = { handler: () => 'real' };
    const mockHandler = () => 'mock';
    const mockable = createMockable('pkg/identity', realModule);

    activateMocks({ 'pkg/identity': { handler: mockHandler } });

    expect(mockable.handler).toBe(mockable.handler);
    expect(mockable.handler).toBe(mockHandler);
  });
});

describe('createMockable - partial mock fallback (CP-06)', () => {
  it('serves mocked exports from the mock and unmocked exports from the real module', () => {
    const realModule = { foo: 'real-foo', bar: 'real-bar', baz: 'real-baz' };
    const mockable = createMockable('pkg/partial', realModule);

    activateMocks({ 'pkg/partial': { foo: 'mock-foo' } });

    expect(mockable.foo).toBe('mock-foo');
    expect(mockable.bar).toBe('real-bar');
    expect(mockable.baz).toBe('real-baz');
  });
});

describe('createMockable - Proxy trap coverage, including frozen/sealed modules (FG-06)', () => {
  it('supports get/has/ownKeys/hasOwnProperty on a plain real module with a partial mock', () => {
    const realModule = { a: 1, b: 2 };
    const mockable = createMockable('pkg/traps', realModule);

    activateMocks({ 'pkg/traps': { a: 100, extra: 'mock-only' } });

    expect(mockable.a).toBe(100);
    expect(mockable.b).toBe(2);
    expect(mockable.extra).toBe('mock-only');

    expect('a' in mockable).toBe(true);
    expect('b' in mockable).toBe(true);
    expect('extra' in mockable).toBe(true);
    expect('missing' in mockable).toBe(false);

    expect(Object.keys(mockable).sort()).toEqual(['a', 'b', 'extra']);
    expect({ ...mockable }).toEqual({ a: 100, b: 2, extra: 'mock-only' });

    expect(Object.prototype.hasOwnProperty.call(mockable, 'a')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(mockable, 'extra')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(mockable, 'missing')).toBe(false);
  });

  it('behaves identically to the real module when the real module is frozen', () => {
    const realModule = Object.freeze({ a: 1, b: 2, untouched: 'real' });
    const mockable = createMockable('pkg/frozen', realModule);

    activateMocks({ 'pkg/frozen': { a: 100 } });

    expect(mockable.a).toBe(100);
    expect(mockable.b).toBe(2);
    expect(mockable.untouched).toBe('real');
    expect(Object.keys(mockable).sort()).toEqual(['a', 'b', 'untouched']);
    expect('untouched' in mockable).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(mockable, 'untouched')).toBe(true);

    clearMocks();

    expect(mockable.a).toBe(1);
    expect({ ...mockable }).toEqual({ a: 1, b: 2, untouched: 'real' });
  });

  it('behaves identically to the real module when the real module is sealed', () => {
    const realModule = Object.seal({ a: 1, b: 2 });
    const mockable = createMockable('pkg/sealed', realModule);

    activateMocks({ 'pkg/sealed': { a: 'mocked' } });

    expect(mockable.a).toBe('mocked');
    expect(mockable.b).toBe(2);
    expect(Object.keys(mockable).sort()).toEqual(['a', 'b']);
  });

  it('does not throw Proxy invariant errors for a non-extensible real module', () => {
    const realModule = Object.preventExtensions({ a: 1 });
    const mockable = createMockable('pkg/non-extensible', realModule);

    activateMocks({ 'pkg/non-extensible': { a: 'mocked', extra: 'mock-only' } });

    expect(() => Object.keys(mockable)).not.toThrow();
    expect(Object.keys(mockable).sort()).toEqual(['a', 'extra']);
    expect(mockable.extra).toBe('mock-only');
  });
});
