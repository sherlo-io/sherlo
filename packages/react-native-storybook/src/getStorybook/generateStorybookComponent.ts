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
    params = {
      ...params,
      host: undefined,
      enableWebsockets: false,
      onDeviceUI: false,
      shouldPersistSelection: false,

      // These properties are only valid for Storybook 7
      isUIHidden: true,
      isSplitPanelVisible: false,
      tabOpen: 0, // Canvas tab
      shouldDisableKeyboardAvoidingView: true,
      keyboardAvoidingViewVerticalOffset: 0,
    };

    if (initialSelection) {
      params = { ...params, initialSelection };
    }
  }

  return view.getStorybookUI(params);
}

export default generateStorybookComponent;
