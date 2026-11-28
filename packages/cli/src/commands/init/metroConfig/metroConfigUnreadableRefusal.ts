import { renderMetroConfigUnreadable } from '../../../render/initFixes';
import { STORYBOOKS_WITH_STORYBOOK_RE } from './constants';
import readMetroConfigCode from './readMetroConfigCode';
import readMetroConfigModuleStyle from './readMetroConfigModuleStyle';

/**
 * The refusal for a Metro config setup cannot wire, every part of it read from the file, so the
 * project check and the Metro step show the same fix for the same file.
 */
function metroConfigUnreadableRefusal({ path, content }: { path: string; content: string }) {
  return renderMetroConfigUnreadable({
    path,
    moduleStyle: readMetroConfigModuleStyle(content),
    hasStorybooksWithStorybook: STORYBOOKS_WITH_STORYBOOK_RE.test(content),
    exportedFunctionReturns: readMetroConfigCode(content)?.exportedFunctionReturns ?? null,
  });
}

export default metroConfigUnreadableRefusal;
