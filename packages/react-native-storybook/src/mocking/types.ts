export type ModuleExports = Record<PropertyKey, unknown>;

// Receives the real module and returns the exports to serve in its place.
// Called at most once per activation; the result is cached for that activation.
export type MockFactory<T extends ModuleExports = ModuleExports> = (original: T) => Partial<T>;

export type MockDefinition<T extends ModuleExports = ModuleExports> = Partial<T> | MockFactory<T>;

// Module specifier -> mock definition, installed atomically for one story activation.
export type MockSet = Record<string, MockDefinition>;

// The hidden name a mock shim answers with. `createMockable` makes one shim per module and
// answers this symbol with the module's key, which is how a declaration made by `mock` learns
// which module its import named - without ever being handed a string. `Symbol.for` so two
// copies of this package in one bundle still agree on the same symbol.
export const MOCKED_MODULE_KEY = Symbol.for('sherlo.mockedModuleKey');
