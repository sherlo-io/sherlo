import { StorybookParams, StorybookView } from '../../types';
import { DUMMY_STORY_ID } from '../../constants';
import { SherloModule } from '../../helpers';

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
      initialSelection:
        (lastState?.nextStoryId as StorybookParams['initialSelection']) || DUMMY_STORY_ID,

      // These properties are only valid for Storybook 7
      ...storybook7Params,
    };
  }

  return view.getStorybookUI(params);
}

export default getStorybookComponent;
