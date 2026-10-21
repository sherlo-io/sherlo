vi.mock('../../SherloModule', () => ({
  default: { getMode: () => 'testing' },
}));

import createMockable, { createLazyMockable } from '../../mocking/createMockable';
import { activateMocks, clearMocks } from '../../mocking/registry';

afterEach(() => {
  clearMocks();
});

type Exports = Record<string, any>;

describe('writes to a mocked module', () => {
  it("a write during a story lands in that story's own layer, read before the mock and the real module", () => {
    const real = { __esModule: true, flag: 'real', other: 'real' };
    const shim = createMockable('app/layered', real) as Exports;
    activateMocks({ 'app/layered': { flag: 'mock' } });

    expect(shim.flag).toBe('mock');
    shim.flag = 'story';
    shim.extra = 2;

    expect(shim.flag).toBe('story');
    expect(shim.extra).toBe(2);
    expect('extra' in shim).toBe(true);
    expect(real.flag).toBe('real');
    expect('extra' in real).toBe(false);

    // Deleting removes only the story's own override: the mock shows through again.
    delete shim.flag;
    expect(shim.flag).toBe('mock');
    expect(shim.other).toBe('real');
  });

  it("the story's writes are dropped when its mocks end", () => {
    const real = { __esModule: true, flag: 'real' };
    const shim = createMockable('app/scoped', real) as Exports;
    activateMocks({ 'app/other': {} });
    shim.flag = 'story';
    Object.defineProperty(shim, 'defined', { value: 5, configurable: true });
    expect(shim.defined).toBe(5);
    clearMocks();

    expect(shim.flag).toBe('real');
    expect('defined' in shim).toBe(false);
    expect(real.flag).toBe('real');
  });

  it('a write with no story active goes to the real module', () => {
    const real = { __esModule: true, flag: 'real' };
    const shim = createMockable('app/direct', real) as Exports;
    shim.flag = 'changed';
    expect(real.flag).toBe('changed');

    const lazy = createLazyMockable('app/lazyDirect', () => ({ __esModule: true, flag: 'real' }));
    (lazy as Exports).flag = 'changed';
    expect(lazy.flag).toBe('changed');
  });

  it('a write to a default-exported singleton object goes through to that object and is restored when the story ends', () => {
    const singleton: Exports = { connected: false };
    const shim = createMockable('app/undo', { __esModule: true, default: singleton });
    activateMocks({ 'app/other': {} });
    shim.default.connected = true;
    shim.default.added = 1;
    expect(singleton.connected).toBe(true);
    expect(Object.keys(shim.default)).toContain('added');
    clearMocks();
    expect(singleton).toEqual({ connected: false });
  });

  it('reading or listing the keys of a mocked module after a write never throws', () => {
    const shim = createMockable('app/keys', {
      __esModule: true,
      a: 1,
      default: { b: 1 },
    }) as Exports;
    activateMocks({ 'app/keys': { c: 3 } });
    shim.a = 5;
    shim.fresh = 1;
    Object.defineProperty(shim, 'd', { value: 4, configurable: true });

    expect(() => Object.keys(shim)).not.toThrow();
    expect(Object.keys(shim)).toEqual(expect.arrayContaining(['a', 'c', 'fresh', 'd']));
    expect(() => Reflect.ownKeys(shim)).not.toThrow();
    expect(() => ({ ...shim })).not.toThrow();
    expect(shim.a).toBe(5);

    // A defineProperty that cannot be honoured is refused, naming the module and the key.
    expect(() => Object.defineProperty(shim, 'x', { value: 1, configurable: false })).toThrow(
      /app\/keys.*x|x.*app\/keys/
    );

    // A runtime whose bound functions carry a fixed own key must not break the shim's ownKeys.
    const bound = Function.prototype.bind;
    Function.prototype.bind = function (this: unknown, ...args: unknown[]) {
      const fn = (bound as any).apply(this, args);
      Object.defineProperty(fn, 'fixed', { value: 1, configurable: false });
      return fn;
    } as any;
    try {
      const fixedShim = createMockable('app/fixed', { __esModule: true, a: 1 });
      expect(() => Reflect.ownKeys(fixedShim)).not.toThrow();
      expect(Reflect.ownKeys(fixedShim)).toContain('fixed');
    } finally {
      Function.prototype.bind = bound;
    }
  });
});
