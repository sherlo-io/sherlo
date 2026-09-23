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
  // lands on it directly. A capture's restart is meant to as well: captureTransport.ts hands the
  // story to SherloModule.openTesting, and the native side that comes back builds `lastState` in
  // this exact shape from what crossed the restart in memory (see SherloModuleCore on each
  // platform) - no filesystem write involved. Only an app whose native side predates that
  // hand-over, or one the relay could not reach a storyId for, still comes back with storyId
  // undefined: with shouldPersistSelection false, Storybook's own preview then falls back to its
  // "*" specifier, which always resolves to a real, renderable story. A made-up id here (there
  // used to be one) sends that resolution down the NoStoryMatchError branch instead - the preview
  // never calls renderToCanvas, so no channel-driven selection, retried or not, ever has anything
  // to replace.
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

  // Built ONCE per boot, not on every render of this component. getStorybookComponent() calls
  // view.getStorybookUI(params), which constructs a FRESH closure component and kicks off a fresh
  // story-selection cycle (this._getInitialStory(params), addons.loadAddons(...)) every time it
  // runs - so a second call does not "update" the running preview, it hands back a component with
  // a NEW function identity. React treats a changed element type at the same position as a
  // completely different component: it unmounts whatever Storybook had already mounted (dropping
  // its `ready` state and any story context already selected) and mounts the new one from
  // scratch, restarting createPreparedStoryMapping() - which reloads EVERY story in the index -
  // and the whole initial-selection dance.
  //
  // This component re-renders for reasons that have nothing to do with which story is on screen:
  // `insets` (react-native-safe-area-context settles its real value asynchronously after the
  // first native layout, often a beat after this first mounts) and `uiSettings`/`params` (new
  // object identities from TestingMode on every one of ITS re-renders). Before this ref, any such
  // re-render early in a boot silently threw away Storybook's in-flight story selection and started
  // it over - a plausible way for the FIRST story of a boot to still be mid-reset, showing neither
  // the placeholder nor the target story's testID, when a capture's metadata poll gives up. Story
  // switches after that first selection never go through this component's props at all (they run
  // over Storybook's own channel - see captureTransport.ts), so they were never at risk here; only
  // the first selection, racing whatever causes this component's own first re-render, was.
  const storybookComponentRef = useRef<(() => JSX.Element) | null>(null);
  if (!storybookComponentRef.current) {
    storybookComponentRef.current = getStorybookComponent({
      view,
      params: testingParams,
    });
  }
  const StorybookComponent = storybookComponentRef.current;

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
