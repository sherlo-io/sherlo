import { Theme } from '@storybook/react-native-theming';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VERIFICATION_TEST_ID } from '../../../constants';
import { StorybookParams, StorybookView } from '../../../types';
import { getStorybookComponent, isStorybook7 } from '../../helpers';
import { RunnerBridge } from '../../../helpers';

/**
 * We applied styles based on how they are defined in the link below to ensure that user's stories
 * look exactly the same in Sherlo as they do in their Storybook
 *
 * Storybook 8: https://github.com/storybookjs/react-native/blob/v8.6.0/packages/react-native/src/View.tsx
 * Storybook 7: https://github.com/storybookjs/react-native/blob/v7.6.20/packages/react-native/src/components/OnDeviceUI/OnDeviceUI.tsx
 */
function Storybook({
  params,
  uiSettings,
  view,
}: {
  uiSettings: {
    theme: Theme;
    shouldAddSafeArea: boolean;
  };
  view: StorybookView;
  params?: StorybookParams;
}) {
  const insets = useSafeAreaInsets();

  const StorybookComponent = getStorybookComponent({
    view,
    params,
    isTestingMode: true,
  });

  let style;

  if (isStorybook7) {
    style = {
      flex: 1,
      paddingBottom: uiSettings.shouldAddSafeArea ? insets.bottom : 0,
      paddingTop: uiSettings.shouldAddSafeArea ? insets.top : 0,
      // We are typechecking with Storybook 8 so we need to ignore the error
      // @ts-ignore
      backgroundColor: uiSettings.theme.preview.backgroundColor,
    };
  } else {
    style = {
      flex: 1,
      paddingTop: uiSettings.shouldAddSafeArea ? insets.top : 0,
      backgroundColor: uiSettings.theme.background.content,
    };
  }

  RunnerBridge.log('storybook style', { style });

  return (
    <View testID={VERIFICATION_TEST_ID} style={style}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <StorybookComponent />
      </View>
    </View>
  );
}

export default Storybook;
