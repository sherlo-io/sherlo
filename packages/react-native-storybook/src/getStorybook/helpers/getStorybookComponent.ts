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
        'If you are using the Metro withStorybook plugin, make sure "enabled" is set to true ' +
        'and "onDisabledRemoveStorybook" is not stripping Storybook modules from this build.'
    );
  }

  return view.getStorybookUI(params);
}

export default getStorybookComponent;
