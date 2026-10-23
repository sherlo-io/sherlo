import {
  getOverrides,
  MOCKED_MODULE_ERROR_NAME,
  recordRealImportThrew,
  recordRealRead,
  recordUndo,
  registerShimmedKey,
  resolveMockExports,
} from './registry';
import { recordThrownByStandIn } from './mockDeclaration';
import { ModuleExports, MOCKED_MODULE_KEY } from './types';

// A Proxy must keep every non-configurable own key of its target in its ownKeys answer and report
// that key's real descriptor, or the engine throws. The stand-in targets below are meant to own
// no such key, but a runtime may give one, so both shims stay honest about whatever their target
// fixes.
const fixedKeysOf = (target: ModuleExports): Array<string | symbol> =>
  Reflect.ownKeys(target).filter(
    (key) => !Reflect.getOwnPropertyDescriptor(target, key)?.configurable
  );

// The descriptor a shim reports for `prop`: the target's own when it is fixed there, else the
// wanted one claimed configurable (the targets hold nothing, so a configurable claim is legal).
function reportDescriptor(
  target: ModuleExports,
  prop: PropertyKey,
  wanted: PropertyDescriptor | undefined
): PropertyDescriptor | undefined {
  const own = Reflect.getOwnPropertyDescriptor(target, prop);
  if (own && !own.configurable) return own;
  return wanted && { ...wanted, configurable: true };
}

// Writes to a real object made while a story is active are undone when its mocks end; with no
// story active the write stays, as it would without the shim.
function writeUndoably(object: ModuleExports, prop: PropertyKey, write: () => boolean): boolean {
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

// A fixed property cannot be promised: the stand-in holds nothing, so it is refused by name.
function refuseFixedProperty(key: string, prop: PropertyKey, descriptor: PropertyDescriptor): void {
  if (descriptor.configurable === false) {
    throw new TypeError(
      `Sherlo: cannot define ${String(prop)} on the mocked module "${key}" with configurable: false`
    );
  }
}

const hasOwn = (obj: ModuleExports, prop: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(obj, prop);

const isObjectOrFunction = (value: unknown): value is ModuleExports =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

// Bundlers read a module's default export ONCE, when the importing module first runs, and keep it
// (a default import compiles to a cached default read). That happens before any mock is
// active, so serving the mock's default per property access would never reach such code.
// This returns one stable Proxy per shim instead: every property read, call or construct on it is
// resolved at that moment against the active mock's default (when the mock declares an object
// or function one), else the real default.
// Primitive defaults (string, number, ...) cannot be forwarded, so they are served as they are.
function createForwardingDefault(key: string, realModule: ModuleExports): ModuleExports {
  const realDefault = realModule.default as ModuleExports;
  // A callable default needs a callable target (a bound function, as for the shim delegate in
  // createMockable); an object default gets a plain object so it still compares like one.
  const delegate =
    typeof realDefault === 'function'
      ? // eslint-disable-next-line no-extra-bind
        (function sherloDefaultDelegate() {}.bind(null) as unknown as ModuleExports)
      : {};

  const activeDefault = (): ModuleExports => {
    const mock = resolveMockExports(key, realModule);
    return mock && hasOwn(mock, 'default') && isObjectOrFunction(mock.default)
      ? (mock.default as ModuleExports)
      : realDefault;
  };

  return new Proxy(delegate, {
    get: (_target, prop) => activeDefault()[prop],
    has: (_target, prop) => prop in activeDefault(),
    ownKeys: (target) =>
      Array.from(new Set([...Reflect.ownKeys(activeDefault()), ...fixedKeysOf(target)])),
    getOwnPropertyDescriptor: (target, prop) =>
      reportDescriptor(target, prop, Reflect.getOwnPropertyDescriptor(activeDefault(), prop)),
    // Writes land on the active default object itself (its own methods read `this`, so an
    // override layer beside it would never be seen by them) and are undone when the story ends.
    set: (_target, prop, value) =>
      writeUndoably(activeDefault(), prop, () => Reflect.set(activeDefault(), prop, value)),
    defineProperty(_target, prop, descriptor) {
      refuseFixedProperty(key, prop, descriptor);
      return writeUndoably(activeDefault(), prop, () =>
        Reflect.defineProperty(activeDefault(), prop, descriptor)
      );
    },
    deleteProperty: (_target, prop) =>
      writeUndoably(activeDefault(), prop, () => Reflect.deleteProperty(activeDefault(), prop)),
    apply: (_target, thisArg, args) =>
      Reflect.apply(activeDefault() as unknown as (...fnArgs: unknown[]) => unknown, thisArg, args),
    construct: (_target, args, newTarget) =>
      Reflect.construct(
        activeDefault() as unknown as new (...ctorArgs: unknown[]) => object,
        args,
        newTarget
      ),
  });
}

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
  return buildMockable(key, () => realModule, realModule);
}

// The stand-in a shim file makes: its exports exist at once, and the real module loads on the first
// read of anything the mock does not answer. A shim that required the real module first would hand
// a module in an import cycle through the real file an empty exports object, replaced only after
// the real module finished: that module would be stranded holding the empty one. Here the
// importer in the cycle holds the stand-in, which is complete from the first moment.
//
// A real module that throws when it loads throws again at every read that needs it: Metro does not
// cache a module that threw. While a story mocks the module, what it throws is a MockedModuleError
// naming the module as the story wrote it and the error the real import threw (kept as `cause`),
// and the story fails with it even when the app catches it. With no mock of it active, the real
// error passes through as it would without the stand-in, and still names the stand-in's module to
// the story's own import of it (./mockDeclaration).
function createLazyMockable<T extends ModuleExports>(key: string, loadRealModule: () => T): T {
  let loaded: { module: T } | undefined;
  const real = (): T => {
    if (loaded) return loaded.module;
    try {
      loaded = { module: loadThrowingWhatItThrew(loadRealModule) };
    } catch (error) {
      throw realImportFailure(key, error);
    }
    return loaded.module;
  };
  return buildMockable(key, real, undefined);
}

type FatalErrorReporter = { reportFatalError?: (error: unknown) => void };

// Metro's require, called while no other module is loading, does not throw what a module threw as
// it loaded: its guardedLoadModule hands the error to ErrorUtils.reportFatalError (LogBox's
// "Uncaught Error") and answers undefined. A stand-in loads its real module at a read, often just
// such a moment (an import's interop, a render under inlineRequires), so while it loads, a fatal
// report is taken back and thrown here as the module threw it.
function loadThrowingWhatItThrew<T>(load: () => T): T {
  const errorUtils = (globalThis as { ErrorUtils?: FatalErrorReporter }).ErrorUtils;
  const reportFatalError = errorUtils?.reportFatalError;
  if (!errorUtils || typeof reportFatalError !== 'function') return load();

  let reported: { error: unknown } | undefined;
  errorUtils.reportFatalError = (error: unknown) => {
    if (!reported) reported = { error };
  };
  let module: T;
  try {
    module = load();
  } finally {
    errorUtils.reportFatalError = reportFatalError;
  }
  if (reported) throw reported.error;
  return module;
}

function realImportFailure(key: string, thrown: unknown): unknown {
  const thrownMessage = thrown instanceof Error ? thrown.message : String(thrown);
  const moduleName = recordRealImportThrew(key, thrownMessage);
  if (moduleName === undefined) {
    recordThrownByStandIn(key, thrown);
    return thrown;
  }

  const failure = new Error(
    `${moduleName} could not be mocked: its real import threw "${thrownMessage}"`
  );
  failure.name = MOCKED_MODULE_ERROR_NAME;
  (failure as Error & { cause?: unknown }).cause = thrown;
  return failure;
}

// `eagerReal` is the real module when it is already in hand; a lazy stand-in passes only `real`,
// and a mock factory is what loads it.
function buildMockable<T extends ModuleExports>(
  key: string,
  real: () => T,
  eagerReal: T | undefined
): T {
  const mockOf = (): ModuleExports | undefined =>
    resolveMockExports(key, eagerReal, eagerReal ? undefined : real);

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

  // Made on the first read of `default`, once the real module is in hand.
  let forwardingDefault: ModuleExports | undefined;
  const forwardingDefaultOf = (): ModuleExports | undefined => {
    const realModule = real();
    if (!forwardingDefault && isObjectOrFunction(realModule.default)) {
      forwardingDefault = createForwardingDefault(key, realModule);
    }
    return forwardingDefault;
  };

  // The descriptor a read of `prop` sees now: the story's own write first, then the active mock,
  // then the real module.
  const currentDescriptor = (prop: PropertyKey): PropertyDescriptor | undefined => {
    const written = getOverrides(key)?.get(prop);
    if (written) return written;
    const mock = mockOf();
    return Reflect.getOwnPropertyDescriptor(mock && hasOwn(mock, prop) ? mock : real(), prop);
  };

  return new Proxy(delegate, {
    get(_target, prop, receiver) {
      // The shim says which module it stands for. A story's declaration awaits its own import,
      // which the bundler redirected here, and reads the name off this answer - so a mock is
      // named by the module it imports and never by a string. Hidden on purpose: the symbol is
      // absent from `ownKeys`, so nothing enumerating the module ever sees it.
      if (prop === MOCKED_MODULE_KEY) return key;

      if (prop === 'default') {
        const forwarded = forwardingDefaultOf();
        if (forwarded) return forwarded;
      }

      const written = getOverrides(key)?.get(prop);
      if (written) return written.get ? written.get.call(receiver) : written.value;

      // An import's interop and a promise settling with the module look at these two; they take
      // nothing out of the module.
      if (prop !== 'then' && prop !== '__esModule') recordRealRead(key);
      const mock = mockOf();
      return mock && hasOwn(mock, prop) ? mock[prop] : real()[prop];
    },

    has(_target, prop) {
      if (getOverrides(key)?.has(prop)) return true;
      const mock = mockOf();
      return (mock !== undefined && hasOwn(mock, prop)) || prop in real();
    },

    ownKeys(target) {
      const mock = mockOf();
      const keys = new Set<string | symbol>(Reflect.ownKeys(real()));
      if (mock) {
        Reflect.ownKeys(mock).forEach((mockKey) => keys.add(mockKey));
      }
      getOverrides(key)?.forEach((_descriptor, written) => keys.add(written as string | symbol));
      fixedKeysOf(target).forEach((fixed) => keys.add(fixed));
      return Array.from(keys);
    },

    getOwnPropertyDescriptor: (target, prop) =>
      reportDescriptor(target, prop, currentDescriptor(prop)),

    // Writes. The delegate target must never receive one: a plain set would define the property on
    // it as non-configurable, and the traps above would then contradict it (every later read or
    // Object.keys throws). With a story active the write is that story's own override, read
    // first and dropped when its mocks end - the real module and the mock stay untouched. With
    // none active it goes to the real module, as it would without the shim.
    set(_target, prop, value) {
      const written = getOverrides(key);
      if (!written) return Reflect.set(real(), prop, value);
      written.set(prop, { value, writable: true, enumerable: true, configurable: true });
      return true;
    },

    defineProperty(_target, prop, descriptor) {
      refuseFixedProperty(key, prop, descriptor);
      const written = getOverrides(key);
      if (!written) return Reflect.defineProperty(real(), prop, descriptor);
      const base = currentDescriptor(prop) ?? { enumerable: true, writable: true };
      written.set(prop, { ...base, ...descriptor, configurable: true });
      return true;
    },

    // During a story this drops that story's own override only; a mock's or the real export of
    // that name then shows through again.
    deleteProperty(_target, prop) {
      const written = getOverrides(key);
      if (!written) return Reflect.deleteProperty(real(), prop);
      written.delete(prop);
      return true;
    },

    // Callable-export fall-through, mirroring the get/has traps: when a mock is active and its
    // exports are themselves callable, calls/constructs route to the mock; otherwise they fall
    // through to the real module. If neither is callable the engine raises its own "not a
    // function" / "not a constructor" error at the call site, exactly as the real module would.
    apply(_target, thisArg, args) {
      const mock = mockOf();
      const callee = typeof mock === 'function' ? mock : real();
      return Reflect.apply(callee as unknown as (...fnArgs: unknown[]) => unknown, thisArg, args);
    },

    construct(_target, args, newTarget) {
      const mock = mockOf();
      const ctor = typeof mock === 'function' ? mock : real();
      return Reflect.construct(
        ctor as unknown as new (...ctorArgs: unknown[]) => object,
        args,
        newTarget
      );
    },
  }) as T;
}

export { createLazyMockable };
export default createMockable;
