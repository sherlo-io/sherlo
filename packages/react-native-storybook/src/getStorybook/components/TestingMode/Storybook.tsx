import type { Theme } from '@storybook/react-native-theming';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VERIFICATION_TEST_ID, PROTOCOL_FILE } from '../../../constants';
import { StorybookParams, StorybookView } from '../../../types';
import { getStorybookComponent } from '../../helpers';
import { RunnerBridge } from '../../../helpers';
import { useRef } from 'react';
import SherloModule from '../../../SherloModule';

/**
 * We applied styles based on how they are defined in the link below to ensure that user's stories
 * look exactly the same in Sherlo as they do in their Storybook
 *
 * Storybook 8: https://github.com/storybookjs/react-native/blob/v8.6.0/packages/react-native/src/View.tsx
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
  const reportedSherloJSLoaded = useRef(false);

  const StorybookComponent = getStorybookComponent({
    view,
    params,
    isTestingMode: true,
  });

  const style = {
    flex: 1,
    paddingTop: uiSettings.shouldAddSafeArea ? insets.top : 0,
    backgroundColor: uiSettings.theme.background.content,
  };

  if (!reportedSherloJSLoaded.current) {
    reportedSherloJSLoaded.current = true;
    (global as any).__sherloStorybookRendered = true;
    const content: any = {
      action: 'STORYBOOK_RENDERED',
      timestamp: Date.now(),
      entity: 'app',
    };

    const lastState = SherloModule.getLastState();
    if (lastState?.requestId) {
      content.requestId = lastState.requestId;
    }

    const contentString = JSON.stringify(content);
    SherloModule.appendFile(PROTOCOL_FILE, `${contentString}\n`);
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
