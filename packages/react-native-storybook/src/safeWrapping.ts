// The engine's rules for wrapping a value in a Proxy safely: what a stand-in's target must be, and
// which properties of it the engine holds fixed. Two callers with opposite jobs use them: the
// recorder (metro/polyfill.js, into which scripts/bundlePolyfill.js inlines this file, as it runs
// before any module exists) and the mock layer (src/mocking). It knows nothing of either, and
// imports nothing.

/**
 * Where the language keeps its own source of chance: the global holding it and its key. It is part
 * of the language, no library's, and the one name the recorder learns: it records the draws an
 * app's load makes from it, which no other engine makes alike.
 */
export const CHANCE_SOURCE = { holder: 'Math', key: 'random' } as const;

/** A value held by reference, which a Proxy may wrap: an object or a function. */
export function isObjectOrFunction(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

/** Whether `object` holds `key` itself, never through its prototype, whatever it says it has. */
export function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * A property the engine holds fixed: an own one that is not configurable. It cannot be defined
 * anew or deleted, and a Proxy of its holder must list it among its own keys and report it as the
 * holder has it, or the engine throws.
 */
export function isFixedProperty(object: object, key: PropertyKey): boolean {
  const description = Object.getOwnPropertyDescriptor(object, key);
  return !!description && description.configurable === false;
}

/** Every property `object` holds fixed, named by a string or a symbol. */
export function fixedKeysOf(object: object): Array<string | symbol> {
  return Reflect.ownKeys(object).filter((key) => isFixedProperty(object, key));
}

/**
 * A fixed property that is also not writable: a Proxy of its holder must hand back that very value
 * on a read.
 */
export function isHeldToItsValue(object: object, key: PropertyKey): boolean {
  const description = Object.getOwnPropertyDescriptor(object, key);
  return !!description && description.configurable === false && description.writable === false;
}

// The own members of a function the engine lays as it makes one, which a wrap carries over.
const NAME_AND_LENGTH = ['name', 'length'];

/**
 * `wrapper`, carrying the name and the length of `wrapped`, so the app reads of a wrap what it
 * reads of the function wrapped. Each is read through its description, so no getter runs, and laid
 * as the engine lays it: neither writable nor enumerable, and configurable.
 */
export function withNameAndLengthOf<T extends object>(wrapper: T, wrapped: unknown): T {
  if (typeof wrapped !== 'function') return wrapper;
  NAME_AND_LENGTH.forEach((key) => {
    const description = Object.getOwnPropertyDescriptor(wrapped, key);
    if (!description || !('value' in description)) return;
    Object.defineProperty(wrapper, key, {
      value: description.value,
      writable: false,
      enumerable: false,
      configurable: true,
    });
  });
  return wrapper;
}

/**
 * A target for a stand-in that must be callable: a Proxy carries `apply` and `construct` only on a
 * callable target. A bound function, callable and constructable, which unlike a plain function owns
 * no `prototype` (a plain function's is fixed, so every Proxy of it would have to report it). Its
 * own properties are configurable, so a Proxy of it may hide them. It carries the name and the
 * length of `wrapped`, the function it stands for, when given.
 */
export function callableTarget(wrapped?: unknown): (...args: unknown[]) => unknown {
  // eslint-disable-next-line no-extra-bind
  return withNameAndLengthOf(function standInTarget() {}.bind(null), wrapped);
}
