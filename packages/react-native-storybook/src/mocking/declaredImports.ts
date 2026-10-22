/**
 * WHAT THE BUNDLER'S MOCK SCAN SAW WHEN IT STARTED, as a polyfill (metro/mockShims.js,
 * writeDeclaredImportsPolyfill) sets it on `__sherloDeclaredImports`:
 *   - storyFiles: each story file, by the path Storybook knows it by (`./src/X.stories.tsx`), to
 *     the modules it declares a mock for by import - each as the file wrote it (`specifier`) and the
 *     name its stand-in is installed under (`moduleKey`), or null when the scan made it no stand-in;
 *   - mockedModules: every name the scan made a stand-in for.
 *
 * A declaration `mock(() => import('../x'), {...})` names its module only by the name its import's
 * stand-in answers, and that name is a path the story never wrote, so this is where a failure finds
 * the name the story did write - for an import that reached no stand-in, from the declaration
 * itself, since this record predates a module added after the bundler started. A stand-in loads only when something imports it, so this is also
 * the one record of which modules the bundler saw that does not wait for the story to use them.
 */
import { isKeyShimmed } from './registry';
import { isUnshimmedImportName, specifierInUnshimmedName } from './mockDeclaration';

type DeclaredImport = { specifier: string; moduleKey: string | null };
type DeclaredImports = {
  storyFiles: Record<string, DeclaredImport[]>;
  mockedModules: string[];
};

function readDeclaredImports(): DeclaredImports | undefined {
  return (globalThis as { __sherloDeclaredImports?: DeclaredImports }).__sherloDeclaredImports;
}

// What `storyFilePath` declares a mock for by import; none when the scan did not see the file.
export function declaredImportsOf(storyFilePath: string): DeclaredImport[] {
  return readDeclaredImports()?.storyFiles[storyFilePath] ?? [];
}

// Whether the bundler made `key` a stand-in when it started. A key no stand-in answered with - an
// import that reached none - was not seen. With no record at all (a Storybook not bundled by
// Sherlo's config), only a stand-in that has loaded proves it.
export function bundlerSawModule(key: string): boolean {
  if (isUnshimmedImportName(key)) return false;
  const declared = readDeclaredImports();
  return declared ? declared.mockedModules.includes(key) : isKeyShimmed(key);
}

// Each of `keys` - the names a story's mocks are installed under - by the name the story wrote, as
// `storyFilePath` declares it. A key the file declares no import for (the object form, a project
// mock) is the name the story wrote already. An import that reached no stand-in is named by the
// module its own declaration imports, as the bundler's transform of the file handed it over: the
// record is as old as the bundler, and a module added since is missing from it. A declaration that
// carries no module is named by what the record lists that the scan made no stand-in for - an
// import the scan made one for reaches it, so it is another declaration's - or by what it declares.
export function namesAsWrittenOf(
  storyFilePath: string | undefined,
  keys: string[]
): Map<string, string> {
  const declared = storyFilePath ? declaredImportsOf(storyFilePath) : [];
  const specifiersWithNoStandIn = declared
    .filter(({ moduleKey }) => moduleKey === null)
    .map(({ specifier }) => specifier);

  return new Map(
    keys.map((key) => {
      if (isUnshimmedImportName(key)) {
        const ownSpecifier = specifierInUnshimmedName(key);
        if (ownSpecifier !== undefined) return [key, ownSpecifier];
        return [
          key,
          specifiersWithNoStandIn.length > 0 ? specifiersWithNoStandIn.join(' or ') : key,
        ];
      }
      const written = declared.find(({ moduleKey }) => moduleKey === key);
      return [key, written ? written.specifier : key];
    })
  );
}
