import { Theme } from '@storybook/react-native-theming';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VERIFICATION_TEST_ID } from '../../../constants';
import { RunnerBridge } from '../../../helpers';
import { StorybookParams, StorybookView } from '../../../types';
import { getStorybookComponent } from '../../helpers';

function isStorybook7(): boolean {
  try {
    require('@storybook/react-native/V6');
  } catch (error) {
    return false;
  }

  return true;
}

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

  const memoizedStorybook = useMemo(() => {
    RunnerBridge.log('memoizing storybook', { isStorybook7: isStorybook7() });

    const StorybookComponent = getStorybookComponent({
      view,
      params,
      isTestingMode: true,
    });

    return <StorybookComponent />;
  }, []);

  let style;

  if (isStorybook7()) {
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

  return (
    <View testID={VERIFICATION_TEST_ID} style={style}>
      <View style={{ flex: 1, overflow: 'hidden' }}>{memoizedStorybook}</View>
    </View>
  );
}

export default Storybook;
