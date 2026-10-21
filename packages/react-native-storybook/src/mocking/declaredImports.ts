/**
 * THE MODULES A STORY FILE DECLARES A MOCK FOR BY IMPORT, as the bundler's config scan found them.
 *
 * A declaration `mock(() => import('../x'), {...})` names its module only by reading the name its
 * import's stand-in answers with, so an import that reached no stand-in has no name at run time.
 * The scan wrote what each story file imports for a mock into a polyfill (metro/mockShims.js,
 * writeDeclaredImportsPolyfill), which sets `__sherloDeclaredImports`: story file path as Storybook
 * knows it, to the specifiers as that file wrote them. Nothing there at all (an older build, a
 * Storybook that is not bundled by Sherlo's config) leaves a message that can only say what the
 * declaration declared.
 */
type DeclaredImports = Record<string, string[]>;

export function declaredImportsOf(storyFilePath: string): string[] {
  const manifest = (globalThis as { __sherloDeclaredImports?: DeclaredImports })
    .__sherloDeclaredImports;
  return manifest?.[storyFilePath] ?? [];
}
