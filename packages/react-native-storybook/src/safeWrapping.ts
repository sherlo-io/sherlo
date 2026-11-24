// The engine's rules for wrapping a value in a Proxy safely: what a stand-in's target must be, and
// which properties of it the engine holds fixed. Two callers with opposite jobs use them: the
// recorder (metro/polyfill.js, into which scripts/bundlePolyfill.js inlines this file, as it runs
// before any module exists) and the mock layer (src/mocking). It knows nothing of either, and
// imports nothing.

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

/**
 * A target for a stand-in that must be callable: a Proxy carries `apply` and `construct` only on a
 * callable target. A bound function, callable and constructable, which unlike a plain function owns
 * no `prototype` (a plain function's is fixed, so every Proxy of it would have to report it). Its
 * own properties are configurable, so a Proxy of it may hide them.
 */
export function callableTarget(): (...args: unknown[]) => unknown {
  // eslint-disable-next-line no-extra-bind
  return function standInTarget() {}.bind(null);
}
