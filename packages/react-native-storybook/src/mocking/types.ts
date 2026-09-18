export type ModuleExports = Record<PropertyKey, unknown>;

// Receives the real module and returns the exports to serve in its place.
// Called at most once per activation; the result is cached for that activation.
export type MockFactory<T extends ModuleExports = ModuleExports> = (original: T) => Partial<T>;

export type MockDefinition<T extends ModuleExports = ModuleExports> = Partial<T> | MockFactory<T>;

// Module specifier -> mock definition, installed atomically for one story activation.
export type MockSet = Record<string, MockDefinition>;
