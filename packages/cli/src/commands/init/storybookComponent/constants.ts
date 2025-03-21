import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../constants';

export const EVENT = '3_storybook_component';

export const NEW_IMPORT_PACKAGE_NAME = SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME;
export const NEW_IMPORT = `import { getStorybook } from "${NEW_IMPORT_PACKAGE_NAME}";`;

export const OLD_CALL_WITH_PARAMS = 'view.getStorybookUI({';
export const NEW_CALL_WITH_PARAMS = 'getStorybook(view, {';

export const OLD_CALL_WITHOUT_PARAMS = 'view.getStorybookUI(';
export const NEW_CALL_WITHOUT_PARAMS = 'getStorybook(view';
