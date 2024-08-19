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
      isUIHidden: true,
      host: undefined,
      enableWebsockets: false,
      isSplitPanelVisible: false,
      tabOpen: 0, // Canvas tab
      onDeviceUI: false,
      shouldDisableKeyboardAvoidingView: true,
      keyboardAvoidingViewVerticalOffset: 0,
      shouldPersistSelection: false,
    };

    if (initialSelection) {
      params = { ...params, initialSelection };
    }
  }

  return view.getStorybookUI(params);
}

export default generateStorybookComponent;
