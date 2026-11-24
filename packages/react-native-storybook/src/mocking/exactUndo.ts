/**
 * What undoes a write to `object[key]` exactly: the property as the object itself held it (same
 * kind, same flags) put back, or the key removed again when the object held none of its own.
 * Taken before the write, called after it.
 */
export function undoOfWrite(object: object, key: PropertyKey): () => void {
  const before = Reflect.getOwnPropertyDescriptor(object, key);
  return () => {
    if (before) Reflect.defineProperty(object, key, before);
    else Reflect.deleteProperty(object, key);
  };
}
