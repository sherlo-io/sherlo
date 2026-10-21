vi.mock('../../SherloModule', () => ({
  default: { getMode: () => 'testing' },
}));

import createMockable from '../../mocking/createMockable';
import { activateMocks, clearMocks } from '../../mocking/registry';

afterEach(() => {
  clearMocks();
});

type Exports = Record<string, any>;

// What Babel's commonjs transform emits for `export * from './x'` (the loop over Object.keys).
function babelExportStar(source: Exports, target: Exports) {
  Object.keys(source).forEach((key) => {
    if (key === 'default' || key === '__esModule') return;
    if (Object.prototype.hasOwnProperty.call(target, key)) return;
    if (key in target && target[key] === source[key]) return;
    Object.defineProperty(target, key, { enumerable: true, get: () => source[key] });
  });
}

// What it emits for `export { default as X } from './x'`.
function babelReexportDefault(source: Exports, target: Exports, as: string) {
  Object.defineProperty(target, as, { enumerable: true, get: () => source.default });
}

describe('createMockable - Proxy invariants (spike proxy-traps)', () => {
  const makeChatProvider = () => {
    function ChatProvider() {
      return 'real';
    }
    return { __esModule: true, default: ChatProvider, useChat: () => 'chat' };
  };

  describe('A: barrel re-exports with no story active', () => {
    it('export * and export { default as X } from do not throw, and keep every export', () => {
      const shim = createMockable('app/ChatProvider', makeChatProvider());
      const barrel: Exports = { __esModule: true };

      expect(() => {
        babelReexportDefault(shim, barrel, 'ChatProvider');
        babelExportStar(shim, barrel);
      }).not.toThrow();
      expect(typeof barrel.ChatProvider).toBe('function');
      expect(barrel.ChatProvider()).toBe('real');
      expect(barrel.useChat()).toBe('chat');
    });

    it('stays valid when the stand-in target owns a fixed (non-configurable) key', () => {
      // A runtime whose bound functions carry a non-configurable own key would break the shim's
      // ownKeys answer; the shim must stay valid whatever the stand-in target owns.
      const bound = Function.prototype.bind;
      Function.prototype.bind = function (this: unknown, ...a: unknown[]) {
        const fn = (bound as any).apply(this, a);
        Object.defineProperty(fn, 'fixed', { value: 1, configurable: false });
        return fn;
      } as any;
      try {
        const shim = createMockable('app/fixed', makeChatProvider());
        expect(() => Object.keys(shim)).not.toThrow();
        expect(() => Reflect.ownKeys(shim)).not.toThrow();
        expect(Reflect.ownKeys(shim)).toContain('fixed');
      } finally {
        Function.prototype.bind = bound;
      }
    });
  });

  describe('B: writes to a mocked module', () => {
    it('assigning an existing named export lands as an override and reads back', () => {
      const real = { __esModule: true, isStreamConnected: () => false };
      const shim = createMockable('app/client', real);
      const override = () => true;

      expect(() => {
        (shim as Exports).isStreamConnected = override;
      }).not.toThrow();
      expect(shim.isStreamConnected).toBe(override);
      expect(() => Object.keys(shim)).not.toThrow();
      expect(Object.keys(shim)).toContain('isStreamConnected');
    });

    it('assigning a new name reads back and is listed', () => {
      const shim = createMockable('app/newname', { __esModule: true, a: 1 }) as Exports;
      expect(() => {
        shim.extra = 2;
      }).not.toThrow();
      expect(shim.extra).toBe(2);
      expect(Object.keys(shim)).toEqual(expect.arrayContaining(['a', 'extra']));
    });

    it('setting a field on a default-exported object reaches the object', () => {
      const singleton: Exports = { connected: false };
      const shim = createMockable('app/singleton', { __esModule: true, default: singleton });
      expect(() => {
        shim.default.connected = true;
      }).not.toThrow();
      expect(shim.default.connected).toBe(true);
      expect(() => Object.keys(shim.default)).not.toThrow();
      expect(Object.keys(shim.default)).toContain('connected');
    });

    it('defineProperty and delete on the module and its default do not throw', () => {
      const shim = createMockable('app/define', {
        __esModule: true,
        a: 1,
        default: { b: 1 },
      }) as Exports;
      expect(() =>
        Object.defineProperty(shim, 'a', { value: 5, configurable: true })
      ).not.toThrow();
      expect(shim.a).toBe(5);
      expect(() => delete shim.a).not.toThrow();
      expect(() => Object.defineProperty(shim.default, 'b', { value: 3 })).not.toThrow();
      expect(shim.default.b).toBe(3);
      expect(() => delete shim.default.b).not.toThrow();
      expect(() => Object.keys(shim)).not.toThrow();
    });

    it('with no story active a write goes to the real module', () => {
      const real = { __esModule: true, flag: 'real' };
      const shim = createMockable('app/direct', real) as Exports;
      shim.flag = 'changed';
      expect(real.flag).toBe('changed');
    });

    it('a field set on a default-exported object during a story is put back when it ends', () => {
      const singleton: Exports = { connected: false };
      const shim = createMockable('app/undo', { __esModule: true, default: singleton });
      activateMocks({ 'app/other': {} });
      shim.default.connected = true;
      shim.default.added = 1;
      expect(singleton.connected).toBe(true);
      clearMocks();
      expect(singleton).toEqual({ connected: false });
    });

    it('a write made during a story does not outlive the story', () => {
      const real = { __esModule: true, flag: 'real' };
      const shim = createMockable('app/scoped', real) as Exports;
      activateMocks({ 'app/scoped': { other: 1 } });
      shim.flag = 'story';
      expect(shim.flag).toBe('story');
      clearMocks();
      expect(shim.flag).toBe('real');
      expect(real.flag).toBe('real');
    });
  });
});
