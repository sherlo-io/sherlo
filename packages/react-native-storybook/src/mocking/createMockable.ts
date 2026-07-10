import { resolveMockExports } from './registry';
import { ModuleExports } from './types';

const hasOwn = (obj: ModuleExports, prop: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(obj, prop);

// Wraps `realModule` in a Proxy that serves the active mock's exports (per property, falling
// through export-by-export to the real module) and passes everything through unchanged when no
// mock is active. The Proxy targets a plain, always-extensible delegate rather than `realModule`
// itself, so trap results are never constrained by invariants coming from a frozen or sealed
// real module.
function createMockable<T extends ModuleExports>(key: string, realModule: T): T {
  const delegate: ModuleExports = {};

  return new Proxy(delegate, {
    get(_target, prop) {
      const mock = resolveMockExports(key, realModule);
      return mock && hasOwn(mock, prop) ? mock[prop] : realModule[prop];
    },

    has(_target, prop) {
      const mock = resolveMockExports(key, realModule);
      return (mock !== undefined && hasOwn(mock, prop)) || prop in realModule;
    },

    ownKeys() {
      const mock = resolveMockExports(key, realModule);
      const keys = new Set<string | symbol>(Reflect.ownKeys(realModule));
      if (mock) {
        Reflect.ownKeys(mock).forEach((mockKey) => keys.add(mockKey));
      }
      return Array.from(keys);
    },

    getOwnPropertyDescriptor(_target, prop) {
      const mock = resolveMockExports(key, realModule);
      const source = mock && hasOwn(mock, prop) ? mock : realModule;
      const descriptor = Reflect.getOwnPropertyDescriptor(source, prop);
      // The delegate target has no own properties, so any descriptor we report must claim
      // configurable: true - otherwise the Proxy invariant check throws a TypeError.
      return descriptor && { ...descriptor, configurable: true };
    },
  }) as T;
}

export default createMockable;
