/** How a Metro config loads modules: by require, by import, or a file setup cannot tell. */
export type MetroConfigModuleStyle = 'require' | 'import' | 'unknown';

const REQUIRE_RE = /^\s*(?:(?:const|let|var)\s[^=]*=\s*require\s*\(|module\.exports\b)/m;
const IMPORT_RE = /^\s*(?:import\s+[\w{*'"]|export\s)/m;

/**
 * The module style a Metro config's own lines use, read from the text alone, since setup shows it
 * when it could not parse the file. A file using both styles, or neither, is one setup cannot tell.
 */
function readMetroConfigModuleStyle(content: string): MetroConfigModuleStyle {
  const usesRequire = REQUIRE_RE.test(content);
  const usesImport = IMPORT_RE.test(content);
  if (usesRequire === usesImport) return 'unknown';
  return usesRequire ? 'require' : 'import';
}

export default readMetroConfigModuleStyle;
