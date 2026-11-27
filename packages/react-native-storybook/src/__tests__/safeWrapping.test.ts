/**
 * The engine's rules for wrapping a value safely (../safeWrapping), each pinned once here, and the
 * polyfill that ships holding them only as inlined from there (scripts/bundlePolyfill.js).
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  callableTarget,
  callOnlyTarget,
  defineTargetAllows,
  deleteTargetAllows,
  descriptionTargetAllows,
  hasOwn,
  hasTargetAllows,
  isConstructor,
  isFixedProperty,
  isHeldToItsValue,
  isObjectOrFunction,
  isReadHeldByTarget,
  keysTargetAllows,
  prototypeTargetAllows,
  setTargetAllows,
  withNameAndLengthOf,
} from '../safeWrapping';
import { builtPolyfillSource } from './builtPolyfill';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sharedRulesCopiedIn } = require('../../scripts/bundlePolyfill.js');

// Whether `target` owns a property the engine holds fixed, named by a string or a symbol.
function ownsAFixedKey(target: object): boolean {
  return Reflect.ownKeys(target).some((key) => isFixedProperty(target, key));
}

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
    expect(ownsAFixedKey(target)).toBe(false);
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
    expect(ownsAFixedKey(target)).toBe(false);
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

  it('a call-only target can be called but never constructed, as the function it stands for', () => {
    const arrow = () => 'called';
    function built() {}
    expect([isConstructor(built), isConstructor(arrow), isConstructor(Math.max)]).toEqual([
      true,
      false,
      false,
    ]);
    const target = callOnlyTarget(arrow);
    expect([isConstructor(target), target.name]).toEqual([false, 'arrow']);
    expect(ownsAFixedKey(target)).toBe(false);
    const standIn = new Proxy(target, { apply: () => 'called' }) as unknown as () => unknown;
    expect(standIn()).toBe('called');
  });
});

// An object holding, beside the kinds every holder has, a fixed setter with no getter and a
// changeable member, closed when `isClosed`.
function targetOfEveryKind(isClosed = false): Record<PropertyKey, unknown> {
  const target = holderOfEveryKind() as Record<PropertyKey, unknown>;
  Object.defineProperty(target, 'fixedSetter', { set: () => undefined, configurable: false });
  target.changeable = 1;
  return isClosed ? Object.preventExtensions(target) : target;
}

const WANTED = { value: 2, writable: true, enumerable: true, configurable: false };

describe('the answers a Proxy target allows', () => {
  it('a description the target holds fixed is reported as the target has it, carrying a new value only where it stays writable', () => {
    const target = targetOfEveryKind();
    expect(descriptionTargetAllows(target, 'held', WANTED)).toEqual(
      Object.getOwnPropertyDescriptor(target, 'held')
    );
    expect(descriptionTargetAllows(target, 'fixedButWritable', WANTED)).toEqual({
      value: 2,
      writable: true,
      enumerable: false,
      configurable: false,
    });
    expect(descriptionTargetAllows(target, 'fixedButWritable', undefined)?.value).toBe(1);
  });

  it('a description of a member the target holds changeable is claimed configurable, and is none where the value lost it or a closed target lacks it', () => {
    const target = targetOfEveryKind(true);
    expect(descriptionTargetAllows(target, 'changeable', WANTED)).toEqual({
      ...WANTED,
      configurable: true,
    });
    expect(descriptionTargetAllows(target, 'missing', WANTED)).toBeUndefined();
    expect(descriptionTargetAllows({}, 'missing', WANTED)).toEqual({
      ...WANTED,
      configurable: true,
    });
    expect(descriptionTargetAllows(target, 'changeable', undefined)).toBeUndefined();
    expect(hasOwn(target, 'changeable')).toBe(false);
  });

  it('the keys a target allows are the wanted ones once each, with every fixed one, and on a closed target only those it holds', () => {
    const symbol = Symbol('wanted');
    expect(keysTargetAllows(targetOfEveryKind(), ['own', symbol, 'own'])).toEqual([
      'own',
      symbol,
      'held',
      'fixedButWritable',
      'fixedGetter',
      'fixedSetter',
    ]);
    const closed = targetOfEveryKind(true);
    expect(keysTargetAllows(closed, ['held', 'own'])).toEqual([
      'held',
      'fixedButWritable',
      'fixedGetter',
      'fixedSetter',
    ]);
    expect(hasOwn(closed, 'changeable')).toBe(false);
  });

  it('a target that holds a member fixed never lets a Proxy deny it has it, and loses a changeable one the value lost', () => {
    const target = targetOfEveryKind();
    expect(hasTargetAllows(target, 'missing', true)).toBe(true);
    expect(hasTargetAllows(target, 'fixedButWritable', false)).toBe(true);
    expect(hasTargetAllows(target, 'changeable', false)).toBe(false);
    expect(hasOwn(target, 'changeable')).toBe(false);
  });

  it('a read is held to what the target gives for a fixed value that is not writable and for a fixed accessor with no getter', () => {
    const target = targetOfEveryKind();
    expect(
      ['held', 'fixedSetter', 'fixedButWritable', 'fixedGetter', 'changeable', 'missing'].map(
        (key) => isReadHeldByTarget(target, key)
      )
    ).toEqual([true, true, false, false, false, false]);
  });

  it('a closed target gives its own prototype, and an open one lets the wanted one stand', () => {
    const wanted = { wanted: true };
    expect(prototypeTargetAllows({}, wanted)).toBe(wanted);
    expect(prototypeTargetAllows(Object.preventExtensions({}), wanted)).toBe(Object.prototype);
  });

  it('a delete the value took stands only where the target lets the member go too', () => {
    const target = targetOfEveryKind(true);
    expect(deleteTargetAllows(target, 'held', true)).toBe(false);
    expect(deleteTargetAllows(target, 'changeable', true)).toBe(true);
    expect(hasOwn(target, 'changeable')).toBe(false);
    expect(deleteTargetAllows(target, 'missing', false)).toBe(false);
  });

  it('a definition the value took stands only where the target takes it too, when the value holds the member fixed or the target does', () => {
    const target = targetOfEveryKind();
    // The member as the value holds it after the definition.
    const heldFixed = { ...WANTED, enumerable: false, writable: false };
    expect(defineTargetAllows(target, 'held', heldFixed, true)).toBe(false);
    expect(defineTargetAllows(target, 'fixedButWritable', heldFixed, true)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(target, 'fixedButWritable')).toMatchObject({
      value: 2,
      writable: false,
    });
    expect(defineTargetAllows(Object.preventExtensions({}), 'new', heldFixed, true)).toBe(false);
    const heldChangeable = { ...WANTED, configurable: true };
    expect(defineTargetAllows(target, 'changeable', heldChangeable, true)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(target, 'changeable')?.value).toBe(1);
    expect(defineTargetAllows(target, 'missing', heldFixed, false)).toBe(false);
    expect(defineTargetAllows(Object.preventExtensions({}), 'new', heldChangeable, true)).toBe(
      false
    );
  });

  it('a write the value took stands unless the target holds the member fixed to another value or with no setter', () => {
    const target = targetOfEveryKind();
    expect(setTargetAllows(target, 'held', 2, true)).toBe(false);
    expect(setTargetAllows(target, 'held', 1, true)).toBe(true);
    expect(setTargetAllows(target, 'fixedButWritable', 2, true)).toBe(true);
    expect(setTargetAllows(target, 'fixedGetter', 2, true)).toBe(false);
    expect(setTargetAllows(target, 'fixedSetter', 2, true)).toBe(true);
    expect(setTargetAllows(target, 'changeable', 2, true)).toBe(true);
    expect(setTargetAllows(target, 'missing', 2, true)).toBe(true);
    expect(setTargetAllows(target, 'changeable', 2, false)).toBe(false);
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
