import type { NetworkMockDeclaration } from './networkDeclaration';
import { MockDefinition, MockSet, MOCKED_MODULE_KEY } from './types';

/**
 * One module mock a story hands over: the module it stands in for, and what to serve for it.
 *
 * `moduleKey` answers the name of that module. A declaration made by `mock` learns the name
 * by awaiting its own import: the bundler has redirected that import to the module's shim,
 * and the shim answers `MOCKED_MODULE_KEY` with the key it was made for. So the name is never
 * a string the story wrote, and never the importer's source text read back as one.
 *
 * `specifierAsWritten` is the module the import names, as the story file wrote it. The bundler's
 * transform of story files hands it to `mock` (metro/mockSpecifierTransformer.js), so it is as new
 * as the file. It names the module in a failure when no shim answered, and never decides which
 * mock applies.
 *
 * `keyAtDeclaration` is the key of a declaration that mocks no module and so waits for no import
 * (`mockClock`, `mockRandom`): a scene's boot installs it at once, before the app's first module,
 * so a loop the app starts on its first frame already reads the frozen clock.
 */
export interface ModuleMockDeclaration {
  kind: 'module';
  moduleKey: () => Promise<string | undefined>;
  definition: MockDefinition;
  specifierAsWritten?: string;
  keyAtDeclaration?: string;
}

/**
 * One mock a story hands over, of whichever kind: a module's exports (`mock`) or a network rule
 * (`mockRequest`). `kind` is what tells them apart everywhere both travel in one list.
 */
export type MockDeclaration = ModuleMockDeclaration | NetworkMockDeclaration;

/**
 * A story's mocks: the declarations it lists, or the older object keyed by module-name
 * strings, which stays accepted and stays untyped.
 */
export type StoryMocks = MockDeclaration[] | MockSet;

export function isModuleDeclaration(
  declaration: MockDeclaration
): declaration is ModuleMockDeclaration {
  return declaration.kind === 'module';
}

export function isNetworkDeclaration(
  declaration: MockDeclaration
): declaration is NetworkMockDeclaration {
  return declaration.kind === 'network';
}

/**
 * The name an import that reached no shim is filed under, so its story fails the way it fails for
 * any mock the bundler had not seen (./activateStoryMocks, mockFailureOf). The shim has no
 * name to give - that IS the failure - so the declaration is filed under the module its story
 * wrote, when the bundler's transform handed that over, and under what it declares. No module is
 * ever called this, so nothing filed under it can apply, which is exactly the state that fails.
 */
const UNSHIMMED_IMPORT_PREFIX = 'an import with no shim, ';
const WRITTEN_SPECIFIER_PREFIX = 'importing ';

function unshimmedImportName({ definition, specifierAsWritten }: ModuleMockDeclaration): string {
  const importing =
    specifierAsWritten === undefined
      ? ''
      : `${WRITTEN_SPECIFIER_PREFIX}${JSON.stringify(specifierAsWritten)}, `;
  return `${UNSHIMMED_IMPORT_PREFIX}${importing}declaring ${declaredExportsOf(definition)}`;
}

function declaredExportsOf(definition: MockDefinition): string {
  if (typeof definition === 'function') return 'a factory';

  const exportNames = Object.keys(definition);
  return exportNames.length === 0 ? 'nothing' : exportNames.join(', ');
}

export function isUnshimmedImportName(key: string): boolean {
  return key.startsWith(UNSHIMMED_IMPORT_PREFIX);
}

/**
 * The module an unshimmed name's declaration imports, as its story wrote it, or undefined when the
 * declaration did not carry it (a story file the bundler's transform did not see).
 */
export function specifierInUnshimmedName(key: string): string | undefined {
  if (!isUnshimmedImportName(key)) return undefined;

  const afterPrefix = key.slice(UNSHIMMED_IMPORT_PREFIX.length);
  if (!afterPrefix.startsWith(WRITTEN_SPECIFIER_PREFIX)) return undefined;

  const quoted = /^"(?:[^"\\]|\\.)*"/.exec(afterPrefix.slice(WRITTEN_SPECIFIER_PREFIX.length));
  return quoted ? (JSON.parse(quoted[0]) as string) : undefined;
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
): ModuleMockDeclaration;
// The third argument is never written by a story: the bundler's transform of story files adds it.
export function mock<M>(
  importModule: () => Promise<M>,
  definition: Partial<M> | ((original: M) => Partial<M>),
  specifierAsWritten?: string
): ModuleMockDeclaration {
  return {
    kind: 'module',
    moduleKey: () => importModule().then(readModuleKey, readKeyOfFailedImport),
    definition: definition as MockDefinition,
    ...(typeof specifierAsWritten === 'string' ? { specifierAsWritten } : {}),
  };
}

// What a stand-in threw for its real module while no mock of it was active, by the error.
const standInKeyOfThrown = new WeakMap<object, string>();

/** A stand-in for module `key` threw `thrown` while loading its real module, with no mock of it. */
export function recordThrownByStandIn(key: string, thrown: unknown): void {
  if (typeof thrown === 'object' && thrown !== null) standInKeyOfThrown.set(thrown, key);
}

/**
 * An import's interop reads the module it imports (`__esModule`, its keys), and a stand-in loads
 * its real module for that read: a real module that throws as it loads rejects the import. The
 * stand-in still names its module, so the mock is installed, and the story fails at its first
 * read of the module with the error naming it (./createMockable). Any other failure names none.
 */
function readKeyOfFailedImport(error: unknown): string {
  const key =
    typeof error === 'object' && error !== null ? standInKeyOfThrown.get(error) : undefined;
  if (key === undefined) throw error;
  return key;
}

/**
 * The key -> definition set that activation installs, resolved from `declarations`.
 *
 * Declarations are assigned in the order they were merged (global, then meta, then story), so
 * for a module two levels both name, the later - more specific - declaration wins, exactly as
 * the object form's per-key precedence does.
 */
export async function resolveDeclarations(declarations: MockDeclaration[]): Promise<MockSet> {
  // Network rules are not modules and name none; they are read straight off the same list by
  // networkMocksOf (./networkDeclaration).
  const moduleDeclarations = declarations.filter(isModuleDeclaration);

  const keys = await Promise.all(
    // An import that fails to load names no module, and fails its story like one that reached
    // no shim - it must not take the story's other mocks down with it.
    moduleDeclarations.map((declaration) => declaration.moduleKey().catch(() => undefined))
  );

  const mocks: MockSet = {};
  keys.forEach((key, index) => {
    const declaration = moduleDeclarations[index];
    mocks[key ?? unshimmedImportName(declaration)] = declaration.definition;
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
    kind: 'module' as const,
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
