// Run before every test of every file (vitest.config.ts setupFiles). The mock registry refuses a
// second copy of itself by a mark on the global object (src/mocking/registry.ts). A test that
// resets the module registry to load the SDK again is starting a fresh app, not putting a second
// copy in one, so resetting the modules takes the mark away.
const markName = '__sherloMockRegistryLoaded';
const resetModules = vi.resetModules.bind(vi);

vi.resetModules = () => {
  delete (globalThis as Record<string, unknown>)[markName];
  return resetModules();
};

beforeEach(() => {
  delete (globalThis as Record<string, unknown>)[markName];
});
