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
    };

    if (initialSelection) {
      params = { ...params, initialSelection };
    }
  }

  return view.getStorybookUI(params);
}

export default generateStorybookComponent;
