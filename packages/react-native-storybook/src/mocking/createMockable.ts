import { registerShimmedKey, resolveMockExports } from './registry';
import { ModuleExports } from './types';

const hasOwn = (obj: ModuleExports, prop: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(obj, prop);

// Wraps `realModule` in a Proxy that serves the active mock's exports (per property, falling
// through export-by-export to the real module) and passes everything through unchanged when no
// mock is active. The Proxy targets an always-extensible delegate rather than `realModule`
// itself, so trap results are never constrained by invariants coming from a frozen or sealed
// real module.
//
// The delegate is a FUNCTION, not a plain object: a Proxy can only carry `apply`/`construct`
// traps when its target is callable. This is what keeps callable-export modules
// (`module.exports = fn`, axios-style) callable and constructable through the shim - without a
// function target the shim would be a silent non-callable object in the client's bundle (a
// TypeError the moment user code calls it, even with mocks dormant).
function createMockable<T extends ModuleExports>(key: string, realModule: T): T {
  // Runs once, when the shim module is first evaluated - proof that `key` is really
  // mockable at runtime. Read by the FG-03 declared-but-unshimmed tripwire.
  registerShimmedKey(key);

  // A BOUND function, deliberately. It is callable AND constructable (so the apply/construct
  // traps are valid) yet - unlike a plain function - it has no own `prototype` property. A plain
  // function's `prototype` is a NON-configurable own property, which the ownKeys and
  // getOwnPropertyDescriptor traps below would then be forced to report (or would illegally hide),
  // tripping the Proxy invariants. A bound function's only own props (`length`, `name`) are
  // configurable, so hiding them is legal and the trap behavior stays identical to a plain object.
  // eslint-disable-next-line no-extra-bind
  const delegate = function sherloMockableDelegate() {}.bind(null) as unknown as ModuleExports;

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

    // Callable-export fall-through, mirroring the get/has traps: when a mock is active and its
    // exports are themselves callable, calls/constructs route to the mock; otherwise they fall
    // through to the real module. If neither is callable the engine raises its own "not a
    // function" / "not a constructor" error at the call site, exactly as the real module would.
    apply(_target, thisArg, args) {
      const mock = resolveMockExports(key, realModule);
      const callee = typeof mock === 'function' ? mock : realModule;
      return Reflect.apply(callee as unknown as (...fnArgs: unknown[]) => unknown, thisArg, args);
    },

    construct(_target, args, newTarget) {
      const mock = resolveMockExports(key, realModule);
      const ctor = typeof mock === 'function' ? mock : realModule;
      return Reflect.construct(
        ctor as unknown as new (...ctorArgs: unknown[]) => object,
        args,
        newTarget
      );
    },
  }) as T;
}

export default createMockable;
