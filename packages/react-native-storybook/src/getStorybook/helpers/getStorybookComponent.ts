import { StorybookParams, StorybookView } from '../../types';
import { DUMMY_STORY_ID } from '../../constants';
import SherloModule from '../../SherloModule';

function getStorybookComponent({
  isTestingMode,
  params = {},
  view,
}: {
  view: StorybookView;
  isTestingMode?: boolean;
  params?: StorybookParams;
}): () => JSX.Element {
  if (isTestingMode) {
    const lastState = SherloModule.getLastState();
    const storyId = lastState?.nextSnapshot.storyId;

    const storybook7Params = {
      isUIHidden: true,
      isSplitPanelVisible: false,
      tabOpen: 0,
      shouldDisableKeyboardAvoidingView: true,
      keyboardAvoidingViewVerticalOffset: 0,
    };

    params = {
      ...params,
      host: undefined,
      enableWebsockets: false,
      onDeviceUI: false,
      shouldPersistSelection: false,
      initialSelection: storyId || DUMMY_STORY_ID,

      // These properties are only valid for Storybook 7
      ...storybook7Params,
    };
  }

  if (!view?.getStorybookUI) {
    throw new Error(
      'Storybook framework not found in the bundle. ' +
        'Make sure the Metro withStorybook wrapper does not have "enabled" set to false.'
    );
  }

  const getUI = (view as any).__sherloOriginalGetStorybookUI || view.getStorybookUI;
  return getUI(params);
}

export default getStorybookComponent;
