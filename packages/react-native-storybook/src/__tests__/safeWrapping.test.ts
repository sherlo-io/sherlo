/**
 * The engine's rules for wrapping a value safely (../safeWrapping), each pinned once here, and the
 * polyfill that ships holding them only as inlined from there (scripts/bundlePolyfill.js).
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  callableTarget,
  fixedKeysOf,
  hasOwn,
  isFixedProperty,
  isHeldToItsValue,
  isObjectOrFunction,
  withNameAndLengthOf,
} from '../safeWrapping';
import { builtPolyfillSource } from './builtPolyfill';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sharedRulesCopiedIn } = require('../../scripts/bundlePolyfill.js');

// An object holding one property of each kind the engine tells apart.
function holderOfEveryKind(): object {
  const holder = {};
  Object.defineProperty(holder, 'held', { value: 1, configurable: false, writable: false });
  Object.defineProperty(holder, 'fixedButWritable', {
    value: 1,
    configurable: false,
    writable: true,
  });
  Object.defineProperty(holder, 'fixedGetter', { get: () => 1, configurable: false });
  Object.defineProperty(holder, 'free', { value: 1, configurable: true, writable: false });
  return holder;
}

describe('the rules for wrapping a value safely', () => {
  it('only an object or a function is held by reference, and a Proxy may wrap it', () => {
    expect(isObjectOrFunction({})).toBe(true);
    expect(isObjectOrFunction(() => undefined)).toBe(true);
    expect(isObjectOrFunction(null)).toBe(false);
    expect(isObjectOrFunction('text')).toBe(false);
    expect(isObjectOrFunction(undefined)).toBe(false);
  });

  it("an own property is told from an inherited one, whatever the object's own hasOwnProperty says", () => {
    const holder = Object.create({ inherited: 1 }, { own: { value: 1 } });
    holder.hasOwnProperty = () => true;
    expect(hasOwn(holder, 'own')).toBe(true);
    expect(hasOwn(holder, 'inherited')).toBe(false);
    expect(hasOwn(Object.create(null), 'own')).toBe(false);
  });

  it('a fixed property is an own one that is not configurable, whether a value or a getter', () => {
    const holder = holderOfEveryKind();
    expect(isFixedProperty(holder, 'held')).toBe(true);
    expect(isFixedProperty(holder, 'fixedButWritable')).toBe(true);
    expect(isFixedProperty(holder, 'fixedGetter')).toBe(true);
    expect(isFixedProperty(holder, 'free')).toBe(false);
    expect(isFixedProperty(holder, 'missing')).toBe(false);
    expect(isFixedProperty(Object.create(holder), 'held')).toBe(false);
  });

  it('the fixed keys of an object are every fixed one it owns, named by a string or a symbol', () => {
    const holder = holderOfEveryKind();
    const symbol = Symbol('fixed');
    Object.defineProperty(holder, symbol, { value: 1, configurable: false });
    expect(fixedKeysOf(holder)).toEqual(['held', 'fixedButWritable', 'fixedGetter', symbol]);
  });

  it('a property held to its value is a fixed one that is not writable, never a getter', () => {
    const holder = holderOfEveryKind();
    expect(isHeldToItsValue(holder, 'held')).toBe(true);
    expect(isHeldToItsValue(holder, 'fixedButWritable')).toBe(false);
    expect(isHeldToItsValue(holder, 'fixedGetter')).toBe(false);
    expect(isHeldToItsValue(holder, 'free')).toBe(false);
    expect(isHeldToItsValue(holder, 'missing')).toBe(false);
  });

  it('a callable target can be called and constructed, owns no fixed key, and a Proxy of it may hide its keys', () => {
    const target = callableTarget();
    expect(typeof target).toBe('function');
    expect(callableTarget()).not.toBe(target);
    expect(fixedKeysOf(target)).toEqual([]);
    const standIn = new Proxy(target, {
      ownKeys: () => [],
      getOwnPropertyDescriptor: () => undefined,
      apply: () => 'called',
      construct: () => ({ made: true }),
    });
    expect(Reflect.ownKeys(standIn)).toEqual([]);
    expect((standIn as () => unknown)()).toBe('called');
    expect(new (standIn as unknown as new () => object)()).toEqual({ made: true });
  });

  it('a wrap carries the name and the length of the function it wraps, laid as the engine lays them', () => {
    function share(_first: unknown, _second: unknown) {
      return undefined;
    }
    const wrap = withNameAndLengthOf(() => undefined, share);
    expect([wrap.name, wrap.length]).toEqual(['share', 2]);
    expect(Object.getOwnPropertyDescriptor(wrap, 'name')).toEqual({
      value: 'share',
      writable: false,
      enumerable: false,
      configurable: true,
    });
    const target = callableTarget(share);
    expect([target.name, target.length]).toEqual(['share', 2]);
    expect(fixedKeysOf(target)).toEqual([]);
  });

  it('a wrap reads the name and the length it carries without running a getter, and takes none that is not a value', () => {
    let reads = 0;
    function counted() {
      return undefined;
    }
    Object.defineProperty(counted, 'name', {
      get: () => {
        reads += 1;
        return 'asked';
      },
      configurable: true,
    });
    const wrap = withNameAndLengthOf(function kept(_only: unknown) {}, counted);
    expect(reads).toBe(0);
    expect([wrap.name, wrap.length]).toEqual(['kept', 0]);
    expect(withNameAndLengthOf(function alone() {}, { name: 'object' }).name).toBe('alone');
  });
});

describe('the polyfill that ships', () => {
  const polyfillSourcePath = path.join(__dirname, '../../metro/polyfill.js');

  it('holds no copy of a shared rule, and its build refuses one', () => {
    expect(sharedRulesCopiedIn(fs.readFileSync(polyfillSourcePath, 'utf8'))).toEqual([]);
    expect(
      sharedRulesCopiedIn('function hasOwn(a, b) {}\nvar isFixedProperty = function () {};')
    ).toEqual(['hasOwn', 'isFixedProperty']);
    expect(sharedRulesCopiedIn('safeWrapping.hasOwn(a, b);')).toEqual([]);
  });

  it('requires nothing, and starts a test run on an engine with neither Proxy nor WeakMap', () => {
    vi.useFakeTimers();
    try {
      const source = builtPolyfillSource();
      expect(source).not.toMatch(/\brequire\(/);
      const fakeGlobal: Record<string, any> = {
        __turboModuleProxy: (name: string) =>
          name === 'SherloModule' ? { getSherloConstants: () => ({ mode: 'testing' }) } : null,
        ErrorUtils: { getGlobalHandler: () => null, setGlobalHandler: () => undefined },
        __d: () => undefined,
      };
      // eslint-disable-next-line no-new-func
      const run = new Function('global', 'Proxy', 'WeakMap', `"use strict";\n${source}`);
      expect(() => run(fakeGlobal, undefined, undefined)).not.toThrow();
      expect(fakeGlobal.__sherloWithStorybookApplied).toBe(true);
      // The recorder needs both: without them the run goes on unrecorded.
      expect(fakeGlobal.__sherloNativeRecorder).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
