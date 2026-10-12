/**
 * Deterministic JSON: object keys are emitted in sorted order at every depth, so
 * two runs that produce equal data produce BYTE-IDENTICAL output regardless of
 * the order the data happened to be assembled in. Arrays keep their order (the
 * caller sorts the arrays it cares about).
 *
 * Copied verbatim (TypeScript-typed) from the Metro serializer's canonical
 * implementation - packages/react-native-storybook/metro/applySherloTransforms.js
 * (`stableStringify`) - so a manifest the CLI derives is serialized by the SAME
 * rules as one the serializer emits. The server compares manifest headers by
 * their stableStringify bytes, so the two producers must never drift.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map(
    (key) => JSON.stringify(key) + ':' + stableStringify((value as Record<string, unknown>)[key])
  );
  return '{' + parts.join(',') + '}';
}

export default stableStringify;
