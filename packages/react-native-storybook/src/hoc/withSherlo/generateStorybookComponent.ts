import { StorybookParams, StorybookView } from '../../types';
import { Mode } from '../withStorybook/ModeProvider';

interface GenerateStorybookInput {
  mode: Mode;
  initialSelection?: string;
  view: StorybookView;
  params?: StorybookParams;
}

const generateStorybookComponent = ({
  initialSelection,
  view,
  params = {},
  mode,
}: GenerateStorybookInput): (() => JSX.Element) => {
  let props: Parameters<typeof view.getStorybookUI>[0] = {};

  if (params) {
    props = { ...props, ...params };
  }

  if (initialSelection) {
    // @ts-ignore
    props = { ...props, initialSelection, resetStorybook: true };
  }

  if (mode === 'preview' || mode === 'testing') {
    props = {
      ...props,
      isUIHidden: true,
      onDeviceUI: false,
      shouldDisableKeyboardAvoidingView: true,
      keyboardAvoidingViewVerticalOffset: 0,
      shouldPersistSelection: false,
    };
  }

  return view.getStorybookUI(props);
};

export default generateStorybookComponent;
