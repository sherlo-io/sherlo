import { StorybookView, getStorybookUIType } from '../../types';
import { Mode } from './withSherlo';

interface GenerateStorybookInput {
  mode: Mode;
  initialSelection?: string;
  view: StorybookView;
  getStorybookUIArgs: Parameters<getStorybookUIType>[0];
}

const generateStorybookComponent = ({
  initialSelection,
  view,
  getStorybookUIArgs = {},
  mode,
}: GenerateStorybookInput): (() => JSX.Element) => {
  let props: Parameters<typeof view.getStorybookUI>[0] = {};

  if (getStorybookUIArgs) {
    props = { ...props, ...getStorybookUIArgs };
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
