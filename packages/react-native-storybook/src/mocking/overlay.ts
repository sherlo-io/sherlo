import { isPlainObject } from './mergeDefinitions';
import { partialFake } from './mergeMocks';
import { recordUndo } from './registry';
import { staysReal } from './stillReal';
import { ModuleExports } from './types';

export const hasOwn = (obj: ModuleExports, prop: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(obj, prop);

export const isObjectOrFunction = (value: unknown): value is ModuleExports =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

// Writes to a real object made while a story is active are undone when its mocks end; with no
// story active the write stays, as it would without the shim.
export function writeUndoably(
  object: ModuleExports,
  prop: PropertyKey,
  write: () => boolean
): boolean {
  const before = Reflect.getOwnPropertyDescriptor(object, prop);
  const done = write();
  if (done) {
    recordUndo(() => {
      if (before) Reflect.defineProperty(object, prop, before);
      else Reflect.deleteProperty(object, prop);
    });
  }
  return done;
}

// A function's own keys that every function has: a fake function that is named whole stands in for
// the real one as it is, unless the real one carries statics beyond these.
const KEYS_EVERY_FUNCTION_HAS: PropertyKey[] = [
  'length',
  'name',
  'prototype',
  'arguments',
  'caller',
];

const carriesStatics = (value: ModuleExports): boolean =>
  typeof value === 'function' &&
  Reflect.ownKeys(value).some((key) => !KEYS_EVERY_FUNCTION_HAS.includes(key));

type Layer = { fake: ModuleExports; realObject: () => ModuleExports | undefined };

// The layers made: a layer's own answer for what is real beneath it, found from the layer itself or
// from any object that has it in its prototype chain (`original`).
const layers = new WeakMap<object, Layer>();

// One layer per fake, so a part read twice is the same object (a component keeps its identity), and
// for a real part that is in hand, per that part.
const layersOfFake = new WeakMap<object, { real: unknown; layer: ModuleExports }>();

/**
 * What a fake of one part serves: the fake with every part it does not name read from the real
 * part, at any depth - an object's other keys, a class's statics, a function's properties.
 *
 * A fake that is not an object written as a literal or a function (a number, a class instance) is
 * the part whole. `real` is the real part, asked for only when something reads a key the fake leaves
 * out - or at once, when `realIsInHand` is true, to see whether there is anything to read through to:
 * a lazy stand-in's real module may not load at all (it needs a native module the build lacks), so
 * there nothing asks for it before a read does.
 */
export function overlay(fake: unknown, real: () => unknown, realIsInHand: boolean): unknown {
  if (!isPlainObject(fake) && typeof fake !== 'function') return fake;

  const realNow = realIsInHand ? real() : undefined;
  if (realIsInHand) {
    if (isPlainObject(fake) && !isObjectOrFunction(realNow)) return partialFake(fake);
    if (!isObjectOrFunction(realNow) || realNow === fake) return fake;
    if (typeof fake === 'function' && !carriesStatics(realNow)) return fake;
  }

  const made = layersOfFake.get(fake);
  if (made && made.real === realNow) return made.layer;

  const layer = layerOver(fake as ModuleExports, real, realIsInHand);
  layersOfFake.set(fake, { real: realNow, layer });
  return layer;
}

function layerOver(fake: ModuleExports, real: () => unknown, realIsInHand: boolean): ModuleExports {
  const realObject = (): ModuleExports | undefined => {
    const value = real();
    return isObjectOrFunction(value) ? value : undefined;
  };
  const partOf = (prop: PropertyKey) => (): unknown => realObject()?.[prop];

  // Callable when either side is: a Proxy carries `apply` and `construct` only on a callable target.
  // A BOUND function, as in createMockable: it has no own `prototype`, so no fixed key to report.
  const callable =
    typeof fake === 'function' || (realIsInHand && typeof realObject() === 'function');
  const delegate = callable
    ? // eslint-disable-next-line no-extra-bind
      (function sherloLayerDelegate() {}.bind(null) as unknown as ModuleExports)
    : {};

  // A fake function's prototype is its own, even none: an arrow faking a class component must not
  // read the class's prototype, or React takes it for a class and constructs it.
  const read = (prop: PropertyKey, receiver: unknown): unknown =>
    staysReal(fake, prop) && !(typeof fake === 'function' && prop === 'prototype')
      ? Reflect.get(realObject() ?? {}, prop, receiver)
      : overlay(Reflect.get(fake, prop, receiver), partOf(prop), realIsInHand);

  // Where a write lands: the fake for a key it names, else the real part, undone with the story.
  const writeTarget = (prop: PropertyKey): ModuleExports =>
    staysReal(fake, prop) ? (realObject() ?? fake) : fake;

  const proxy: ModuleExports = new Proxy(delegate, {
    get: (_target, prop, receiver) => read(prop, receiver),

    has: (_target, prop) => !staysReal(fake, prop) || prop in (realObject() ?? {}),

    ownKeys: () =>
      Array.from(new Set([...Reflect.ownKeys(realObject() ?? {}), ...Reflect.ownKeys(fake)])),

    getOwnPropertyDescriptor(_target, prop) {
      const own = Reflect.getOwnPropertyDescriptor(
        staysReal(fake, prop) ? (realObject() ?? {}) : fake,
        prop
      );
      if (!own) return undefined;
      return {
        ...own,
        ...('value' in own ? { value: read(prop, proxy) } : {}),
        configurable: true,
      };
    },

    set: (_target, prop, value) =>
      writeUndoably(writeTarget(prop), prop, () => Reflect.set(writeTarget(prop), prop, value)),
    defineProperty: (_target, prop, descriptor) =>
      writeUndoably(writeTarget(prop), prop, () =>
        Reflect.defineProperty(writeTarget(prop), prop, descriptor)
      ),
    deleteProperty: (_target, prop) =>
      writeUndoably(writeTarget(prop), prop, () => Reflect.deleteProperty(writeTarget(prop), prop)),

    getPrototypeOf: () => Reflect.getPrototypeOf(realObject() ?? fake),

    apply(_target, thisArg, args) {
      const callee = typeof fake === 'function' ? fake : realObject();
      return Reflect.apply(callee as unknown as (...fnArgs: unknown[]) => unknown, thisArg, args);
    },
    construct(_target, args, newTarget) {
      const constructor = typeof fake === 'function' ? fake : realObject();
      return Reflect.construct(
        constructor as unknown as new (...ctorArgs: unknown[]) => object,
        args,
        newTarget
      );
    },
  });

  layers.set(proxy, { fake, realObject });
  return proxy;
}

/**
 * The real `key` of the part a fake is part of, for a fake method to call: `original(this, key)`
 * answers the real method bound to `this` (any other real part as it is). `self` is the faked
 * object itself, or an instance of a faked class.
 */
export function original(self: unknown, key: PropertyKey): unknown {
  for (let found = self; isObjectOrFunction(found); found = Object.getPrototypeOf(found)) {
    const layer = layers.get(found);
    const real = layer?.realObject();
    if (!real) continue;

    const part: unknown = Reflect.get(real, key, self);
    return typeof part === 'function' ? part.bind(self) : part;
  }
  throw new TypeError('Sherlo: original(this, key) is called from a fake, with its `this`');
}
