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

  // Sherlo runs Storybook in non-interactive testing mode. We supply param overrides
  // that disable on-device UI, the websocket dev-menu connection, and persistent selection.
  //
  // A run's restart always has a queued story to hand over as initialSelection, and Storybook
  // lands on it directly. A capture's restart has none (a capture writes nothing to the device
  // before restarting - see captureTransport.ts), so initialSelection is left undefined: with
  // shouldPersistSelection false, Storybook's own preview falls back to its "*" specifier, which
  // always resolves to a real, renderable story. A made-up id here (there used to be one) sends
  // that resolution down the NoStoryMatchError branch instead - the preview never calls
  // renderToCanvas, so no channel-driven selection, retried or not, ever has anything to replace.
  const lastState = SherloModule.getLastState();
  const storyId = lastState?.nextSnapshot.storyId;
  const testingParams: StorybookParams = {
    ...(params ?? {}),
    host: undefined,
    enableWebsockets: false,
    onDeviceUI: false,
    shouldPersistSelection: false,
    initialSelection: storyId,
  };

  const StorybookComponent = getStorybookComponent({
    view,
    params: testingParams,
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
