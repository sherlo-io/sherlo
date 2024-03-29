import { StorybookParams, StorybookView } from '../../types';

export type StorybookRenderMode = 'sherlo' | 'original';

interface GenerateStorybookInput {
  storybookRenderMode: StorybookRenderMode;
  initialSelection?: StorybookParams['initialSelection'];
  view: StorybookView;
  params?: StorybookParams;
}

const generateStorybookComponent = ({
  initialSelection,
  view,
  params = {},
  storybookRenderMode,
}: GenerateStorybookInput): (() => JSX.Element) => {
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
};

export default generateStorybookComponent;
