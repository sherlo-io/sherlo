/**
 * A mock is declared with the module it names as an import expression, never a string, so the
 * declaration is checked against the module's own types (sherlo-brain, books/sherlo/mocking-a-story.md).
 */
import { describe, it } from 'vitest';

describe('a mock is declared by its import expression', () => {
  it.todo('a mock is typed by the module its import expression names');
  it.todo('a mock declares a default export against the type of the module default');
  it.todo('a factory receives the real module typed as the module its import expression names');
  it.todo('the declaration resolves the module name at runtime through the shim, never by calling a string key');
  it.todo('the object form keyed by strings is still accepted, untyped');
});

describe('the bundler scan reads the import expression', () => {
  it.todo('collects the module named by an import expression under sherlo mocks');
  it.todo('collects the import expression from every level: preview, meta and story');
  it.todo('ignores an import whose specifier is not a string literal');
});

describe('a library that wraps a native module', () => {
  it.todo('a library that wraps a native module is mocked like any module');
});

describe('the mock layer is always on', () => {
  it.todo('the mock layer is installed with no option named');
  it.todo('mockModules still registers a key the scan cannot see');
  it.todo('a project with no mocks declared emits no shim and pays no bundle');
});
