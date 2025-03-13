import { StorybookParams, StorybookView } from '../types';

interface GenerateStorybookInput {
  storybookRenderMode: 'sherlo' | 'default';
  initialSelection?: StorybookParams['initialSelection'];
  view: StorybookView;
  params?: StorybookParams;
}

function generateStorybookComponent({
  initialSelection,
  view,
  params = {},
  storybookRenderMode,
}: GenerateStorybookInput): () => JSX.Element {
  if (storybookRenderMode === 'sherlo') {
    const sb7Params = {
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

      // These properties are only valid for Storybook 7
      ...sb7Params,
    };

    if (initialSelection) {
      params = { ...params, initialSelection };
    }
  }

  return view.getStorybookUI(params);
}

export default generateStorybookComponent;
