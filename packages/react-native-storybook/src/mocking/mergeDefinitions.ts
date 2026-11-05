import { MockDefinition, MockSet, ModuleExports } from './types';

/** An object a story wrote as a literal: its parts can be merged, where a class instance's cannot. */
export function isPlainObject(value: unknown): value is ModuleExports {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Two fakes of one part: both plain objects merge key by key, recursively, each key the later one
// names winning; anything else (a function, a primitive, a class instance) is the later one whole.
function mergeParts(earlier: unknown, later: unknown): unknown {
  if (!isPlainObject(earlier) || !isPlainObject(later)) return later;

  const merged: ModuleExports = {};
  [earlier, later].forEach((fake) =>
    Reflect.ownKeys(fake).forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(fake, key) as PropertyDescriptor;
      const named = Object.prototype.hasOwnProperty.call(merged, key);
      Object.defineProperty(
        merged,
        key,
        named && 'value' in descriptor
          ? { ...descriptor, value: mergeParts(merged[key], descriptor.value) }
          : descriptor
      );
    })
  );
  return merged;
}

/**
 * The fakes of one module, the later one over the earlier, part by part. A factory is a fake that
 * decides everything itself, so a factory on either side is the later one whole.
 */
export function mergeDefinitions(earlier: MockDefinition, later: MockDefinition): MockDefinition {
  return mergeParts(earlier, later) as MockDefinition;
}

/** Sets of fakes keyed by module, the later set over the earlier, module by module and part by part. */
export function mergeMockSets(...sets: MockSet[]): MockSet {
  const merged: MockSet = {};
  sets.forEach((set) =>
    Object.keys(set).forEach((key) => {
      merged[key] = key in merged ? mergeDefinitions(merged[key], set[key]) : set[key];
    })
  );
  return merged;
}
