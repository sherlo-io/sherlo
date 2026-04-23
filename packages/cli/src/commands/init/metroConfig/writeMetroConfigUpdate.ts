import fs from 'fs';
import {
  MODULE_EXPORTS_WITH_STORYBOOK_RE,
  NEW_IMPORT_PACKAGE,
  WITH_STORYBOOK_IMPORT_RE,
} from './constants';

async function writeMetroConfigUpdate(state: {
  path: string;
  content: string;
  quoteChar: '"' | "'";
}): Promise<{ applied: boolean }> {
  const importLine =
    state.quoteChar === '"'
      ? `const { withSherlo } = require("${NEW_IMPORT_PACKAGE}");`
      : `const { withSherlo } = require('${NEW_IMPORT_PACKAGE}');`;

  const importMatch = state.content.match(WITH_STORYBOOK_IMPORT_RE);
  if (!importMatch) return { applied: false };
  const afterImport = state.content.replace(
    WITH_STORYBOOK_IMPORT_RE,
    (line) => `${line}\n${importLine}`,
  );

  const callMatch = afterImport.match(MODULE_EXPORTS_WITH_STORYBOOK_RE);
  if (!callMatch) return { applied: false };
  const wrapped = afterImport.replace(
    MODULE_EXPORTS_WITH_STORYBOOK_RE,
    'module.exports = withSherlo($1);',
  );

  await fs.promises.writeFile(state.path, wrapped, 'utf-8');
  return { applied: true };
}

export default writeMetroConfigUpdate;
