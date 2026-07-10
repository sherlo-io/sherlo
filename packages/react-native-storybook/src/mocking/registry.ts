import { MockSet, ModuleExports } from './types';

type Activation = {
  mocks: MockSet;
  // Lazily populated as keys are looked up; guarantees each factory runs once per activation.
  resolved: Map<string, ModuleExports | undefined>;
};

let activeActivation: Activation | null = null;

// Installs the mock set for one story, replacing any previously active set.
function activateMocks(mocks: MockSet): void {
  activeActivation = { mocks, resolved: new Map() };
}

// Removes the active mock set; every createMockable trap then passes through to the real module.
function clearMocks(): void {
  activeActivation = null;
}

// Returns the resolved mock exports for `key`, or undefined if the module isn't mocked in the
// active activation (or there is no active activation). Factory definitions are invoked with
// `realModule` on first lookup and cached for the rest of the activation.
function resolveMockExports(key: string, realModule: ModuleExports): ModuleExports | undefined {
  if (!activeActivation) {
    return undefined;
  }

  const { mocks, resolved } = activeActivation;

  if (resolved.has(key)) {
    return resolved.get(key);
  }

  if (!(key in mocks)) {
    resolved.set(key, undefined);
    return undefined;
  }

  const definition = mocks[key];
  const exports = typeof definition === 'function' ? definition(realModule) : definition;
  resolved.set(key, exports);
  return exports;
}

export { activateMocks, clearMocks, resolveMockExports };
