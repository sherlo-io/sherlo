import { Theme } from '@storybook/react-native-theming';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VERIFICATION_TEST_ID } from '../../../constants';
import { StorybookParams, StorybookView } from '../../../types';
import { getStorybookComponent } from '../../helpers';

/**
 * We applied styles based on how they are defined in the link below to ensure that user's stories
 * look exactly the same in Sherlo as they do in their Storybook
 *
 * https://github.com/storybookjs/react-native/blob/v8.6.0/packages/react-native/src/View.tsx
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

  return (
    <View
      testID={VERIFICATION_TEST_ID}
      style={{
        flex: 1,
        paddingTop: uiSettings.shouldAddSafeArea ? insets.top : 0,
        backgroundColor: 'green', // uiSettings.theme.background.content,
      }}
    >
      <View style={{ flex: 1, overflow: 'hidden', backgroundColor: 'blue' }}>
        <StorybookComponent />
      </View>
    </View>
  );
}

export default Storybook;
