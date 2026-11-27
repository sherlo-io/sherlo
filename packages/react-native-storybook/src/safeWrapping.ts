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

/**
 * Whether `fn` can be called with `new`. It is asked of a Proxy of `fn` that answers `new` itself,
 * so nothing of `fn` runs and none of its members is read.
 */
export function isConstructor(fn: object): boolean {
  try {
    const probe = new Proxy(fn, { construct: () => ({}) }) as new () => object;
    return typeof new probe() === 'object';
  } catch (_) {
    return false;
  }
}

/**
 * A target for a stand-in of a function that cannot be called with `new`: a method, which, unlike
 * a callable target, is no constructor, and like it owns no fixed key. It carries the name and the
 * length of `wrapped`, the function it stands for, when given.
 */
export function callOnlyTarget(wrapped?: unknown): (...args: unknown[]) => unknown {
  const { standInTarget } = {
    standInTarget(..._args: unknown[]): unknown {
      return undefined;
    },
  };
  return withNameAndLengthOf(standInTarget, wrapped);
}

// WHAT A TARGET ALLOWS. The engine checks each answer a Proxy gives against its target, and an
// answer the target does not allow throws where it was asked. Each rule below makes, of the answer
// wanted, the one the target allows. A member the wanted answer lost that the target holds
// changeable, the target loses too, so it allows the next answer as well.

/**
 * The description of `key` a Proxy of `target` reports: `wanted` (none when undefined), claimed
 * configurable, unless the target holds the member fixed: then the target's own, carrying the
 * wanted value only where the target's stays writable. None for a member a closed target lacks.
 */
export function descriptionTargetAllows(
  target: object,
  key: PropertyKey,
  wanted: PropertyDescriptor | undefined
): PropertyDescriptor | undefined {
  const onTarget = Reflect.getOwnPropertyDescriptor(target, key);
  if (onTarget && !onTarget.configurable) {
    if (!onTarget.writable || !wanted || !('value' in wanted)) return onTarget;
    return { ...onTarget, value: wanted.value };
  }
  if (!wanted) {
    if (onTarget) Reflect.deleteProperty(target, key);
    return undefined;
  }
  if (!onTarget && !Reflect.isExtensible(target)) return undefined;
  return { ...wanted, configurable: true };
}

/**
 * The member names a Proxy of `target` reports: the `wanted` ones, each once and in their order,
 * with every one the target holds fixed. A closed target's names are all the engine takes: a name
 * it lacks is left out.
 */
export function keysTargetAllows(
  target: object,
  wanted: Array<string | symbol>
): Array<string | symbol> {
  const isOpen = Reflect.isExtensible(target);
  const allowed = new Set(wanted.filter((key) => isOpen || hasOwn(target, key)));
  Reflect.ownKeys(target).forEach((key) => {
    if (allowed.has(key)) return;
    if (isFixedProperty(target, key)) allowed.add(key);
    else Reflect.deleteProperty(target, key);
  });
  return Array.from(allowed);
}

/** Whether a Proxy of `target` reports it has `key`: `isIn`, unless the target holds it fixed. */
export function hasTargetAllows(target: object, key: PropertyKey, isIn: boolean): boolean {
  if (isIn || isFixedProperty(target, key)) return true;
  Reflect.deleteProperty(target, key);
  return false;
}

/**
 * Whether a Proxy of `target` must hand back on a read of `key` what the target gives: a value
 * held to it, or a fixed accessor with no getter, which reads as undefined.
 */
export function isReadHeldByTarget(target: object, key: PropertyKey): boolean {
  if (isHeldToItsValue(target, key)) return true;
  const description = Object.getOwnPropertyDescriptor(target, key);
  return (
    !!description && !description.configurable && !('value' in description) && !description.get
  );
}

/** The prototype a Proxy of `target` reports: `wanted`, but a closed target's own. */
export function prototypeTargetAllows(target: object, wanted: object | null): object | null {
  return Reflect.isExtensible(target) ? wanted : Reflect.getPrototypeOf(target);
}

/**
 * Whether a Proxy of `target` reports a write of `value` to `key` taken: `isSet`, unless the
 * target holds the member fixed to another value or as an accessor with no setter.
 */
export function setTargetAllows(
  target: object,
  key: PropertyKey,
  value: unknown,
  isSet: boolean
): boolean {
  const onTarget = Reflect.getOwnPropertyDescriptor(target, key);
  if (!isSet || !onTarget || onTarget.configurable) return isSet;
  if ('value' in onTarget) return !!onTarget.writable || Object.is(onTarget.value, value);
  return !!onTarget.set;
}

/** Whether a Proxy of `target` reports `key` deleted: `isDeleted`, once the target lets it go too. */
export function deleteTargetAllows(target: object, key: PropertyKey, isDeleted: boolean): boolean {
  return isDeleted && Reflect.deleteProperty(target, key);
}

/**
 * Whether a Proxy of `target` reports a definition of `key` taken: `isDefined`, once the member as
 * the value then holds it, `held`, is laid on the target too where either holds it fixed.
 */
export function defineTargetAllows(
  target: object,
  key: PropertyKey,
  held: PropertyDescriptor | undefined,
  isDefined: boolean
): boolean {
  if (!isDefined) return false;
  const isFixed = isFixedProperty(target, key) || (!!held && held.configurable === false);
  return !isFixed || (!!held && Reflect.defineProperty(target, key, held));
}
