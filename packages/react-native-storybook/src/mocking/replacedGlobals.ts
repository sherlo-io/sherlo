import { hasOwn, isHeldToItsValue } from '../safeWrapping';
import { undoOfWrite } from './exactUndo';

/**
 * THE ONE WAY THE MOCK LAYER REPLACES A VALUE THE APP READS AS A GLOBAL (or as a property of a
 * shared module object), and the one way it puts it back.
 *
 * The very first value found is kept, so a second install over the first never loses it, and
 * restoring puts back exactly what the holder had: the same kind of property with the same flags,
 * or no own property at all where it only inherited one or had none.
 */

type Kept = { original: unknown; undo: () => void };

/** Per holder, per key: what was found first, kept while a replacement stands in. */
const kept = new WeakMap<object, Map<PropertyKey, Kept>>();

/**
 * Put `replacement` at `holder[key]`, keeping what was there first. A property the holder owns is
 * assigned, as the app's own code would (a setter is called; a read-only one throws). One it does
 * not own, inherited or missing, becomes an own property: assigning would reach its prototype,
 * which a host object refuses. A property the engine holds to its value throws.
 */
export function installReplacement(holder: object, key: PropertyKey, replacement: unknown): void {
  if (isHeldToItsValue(holder, key)) {
    throw new TypeError(`Cannot replace ${String(key)}: the engine holds it to its value`);
  }
  const target = holder as Record<PropertyKey, unknown>;
  const entry: Kept = kept.get(holder)?.get(key) ?? {
    original: target[key],
    undo: undoOfWrite(holder, key),
  };
  if (hasOwn(holder, key)) {
    target[key] = replacement;
  } else {
    Object.defineProperty(holder, key, {
      value: replacement,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  const forHolder = kept.get(holder) ?? new Map<PropertyKey, Kept>();
  forHolder.set(key, entry);
  kept.set(holder, forHolder);
}

/** Put `holder[key]` back as it was before the first `installReplacement`. Nothing to do when none stands in. */
export function restoreOriginal(holder: object, key: PropertyKey): void {
  const forHolder = kept.get(holder);
  const entry = forHolder?.get(key);
  if (!forHolder || !entry) return;
  entry.undo();
  forHolder.delete(key);
}

/** What the app has at `holder[key]`: the first value kept when a replacement stands in, else the current one. */
export function appsOwn(holder: object, key: PropertyKey): unknown {
  const entry = kept.get(holder)?.get(key);
  return entry ? entry.original : (holder as Record<PropertyKey, unknown>)[key];
}

/** Whether a replacement of `holder[key]` stands in now. */
export function isReplaced(holder: object, key: PropertyKey): boolean {
  return !!kept.get(holder)?.has(key);
}
