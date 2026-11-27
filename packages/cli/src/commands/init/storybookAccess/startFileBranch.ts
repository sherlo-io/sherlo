/**
 * THE START FILE'S REGISTRATION UNDER STORYBOOK MODE, as text: one source for what setup writes into
 * the start file (./writeStartFile) and what the next step prints when the start file registers
 * nothing yet (../../../render/initSteps), so the two never drift apart.
 */
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../constants';

/** The line that brings `isStorybookMode` in, in the file's own module form. */
export function modeImportLine(usesImports: boolean): string {
  return usesImports
    ? `import { isStorybookMode } from '${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}';`
    : `const { isStorybookMode } = require('${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME}');`;
}

/** The registration under `isStorybookMode`, and the app's entry required otherwise. */
export function startFileBranch(registration: string, appRequest: string): string[] {
  return [
    '// Storybook in Storybook mode; the app otherwise, as a scene launch needs it.',
    'if (isStorybookMode) {',
    `  ${registration}`,
    '} else {',
    `  require('${appRequest}');`,
    '}',
  ];
}

/** Storybook's UI, built from the story list Storybook generates beside the start file. */
export const STORYBOOK_VIEW_IMPORT = "import { view } from './storybook.requires';";
export const STORYBOOK_UI_ROOT =
  'const StorybookUIRoot = view.getStorybookUI({ shouldPersistSelection: false });';

/**
 * A whole start file, for a Storybook folder that has none: the registration's imports, Storybook's
 * UI, and its registration, under `isStorybookMode` when scenes need the app (`appRequest`). Blank
 * strings are blank lines.
 */
export function wholeStartFile(
  imports: string[],
  registration: string,
  appRequest: string | null
): string[] {
  return [
    ...imports,
    ...(appRequest ? [modeImportLine(true)] : []),
    STORYBOOK_VIEW_IMPORT,
    '',
    STORYBOOK_UI_ROOT,
    '',
    ...(appRequest ? startFileBranch(registration, appRequest) : [registration]),
  ];
}
