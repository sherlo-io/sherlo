import { MockDefinition, MockSet, MOCKED_MODULE_KEY } from './types';

/**
 * One mock a story hands over: the module it stands in for, and what to serve for it.
 *
 * `moduleKey` answers the name of that module. A declaration made by `mock` learns the name
 * by awaiting its own import: the bundler has redirected that import to the module's shim,
 * and the shim answers `MOCKED_MODULE_KEY` with the key it was made for. So the name is never
 * a string the story wrote, and never the importer's source text read back as one.
 */
export interface MockDeclaration {
  moduleKey: () => Promise<string | undefined>;
  definition: MockDefinition;
}

/**
 * A story's mocks: the declarations it lists, or the older object keyed by module-name
 * strings, which stays accepted and stays untyped.
 */
export type StoryMocks = MockDeclaration[] | MockSet;

/**
 * The name an import that reached no shim is filed under, so activation warns about it the way
 * it warns about any declared-but-unshimmed module (FG-03). The module has no name to give -
 * that IS the failure - so the declaration is named by what it declares, which is what a
 * developer greps their story files for to find it. No module is ever called this, so nothing
 * filed under it can apply, which is exactly the state being warned about.
 */
function unshimmedImportName(definition: MockDefinition): string {
  if (typeof definition === 'function') return 'an import with no shim, declaring a factory';

  const exportNames = Object.keys(definition);
  if (exportNames.length === 0) return 'an import with no shim, declaring nothing';

  return `an import with no shim, declaring ${exportNames.join(', ')}`;
}

/**
 * Declare a mock for the module `importModule` imports.
 *
 * `M` is inferred from the import expression, so `definition` is checked against the module's
 * own exports: an export name the module does not have, or an export of the wrong shape, is an
 * error in the editor before anything runs. The definition is either the exports to serve, or
 * a factory that receives the real module and returns them.
 *
 *   mocks: [mock(() => import('./whoAmI'), { whoAmI: () => 'Ada Lovelace' })]
 */
export function mock<M>(
  importModule: () => Promise<M>,
  definition: Partial<M> | ((original: M) => Partial<M>)
): MockDeclaration {
  return {
    moduleKey: () => importModule().then(readModuleKey),
    definition: definition as MockDefinition,
  };
}

/**
 * The key -> definition set that activation installs, resolved from `declarations`.
 *
 * Declarations are assigned in the order they were merged (global, then meta, then story), so
 * for a module two levels both name, the later - more specific - declaration wins, exactly as
 * the object form's per-key precedence does.
 */
export async function resolveDeclarations(declarations: MockDeclaration[]): Promise<MockSet> {
  const keys = await Promise.all(
    // An import that fails to load names no module, and is warned about like one that reached
    // no shim - it must not take the story's other mocks down with it.
    declarations.map((declaration) => declaration.moduleKey().catch(() => undefined))
  );

  const mocks: MockSet = {};
  keys.forEach((key, index) => {
    const { definition } = declarations[index];
    mocks[key ?? unshimmedImportName(definition)] = definition;
  });
  return mocks;
}

/**
 * `mocks` as a list of declarations. A list is already one; the object form becomes one
 * declaration per entry, each already knowing the module name its key spells out.
 */
export function declarationsOf(mocks: StoryMocks): MockDeclaration[] {
  if (Array.isArray(mocks)) return mocks;

  return Object.keys(mocks).map((key) => ({
    moduleKey: () => Promise.resolve(key),
    definition: mocks[key],
  }));
}

/**
 * The module name an imported module answers with, or undefined when it answers none - which
 * is what an import the build never redirected to a shim looks like (FG-03).
 *
 * Babel's interop copies a CommonJS module's own keys into a fresh namespace object and keeps
 * the module itself under `default`, so the shim can be either the imported value or its
 * `default`.
 */
function readModuleKey(imported: unknown): string | undefined {
  return (
    readKeySymbol(imported) ?? readKeySymbol((imported as { default?: unknown } | null)?.default)
  );
}

function readKeySymbol(value: unknown): string | undefined {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return undefined;

  const key = (value as Record<PropertyKey, unknown>)[MOCKED_MODULE_KEY];
  return typeof key === 'string' ? key : undefined;
}
